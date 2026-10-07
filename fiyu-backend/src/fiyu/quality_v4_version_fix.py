"""Manifest-scoped metadata fix for the Quality-v4 specialist tri-state label."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from .database import connect
from .public_score import PUBLICATION_SCORE_THRESHOLD
from .quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION
from .quality_v4_promotion import (
    CURRENT_SCORE_FIELDS,
    VISIBILITY_FIELDS,
    _create_backup,
    _integrity,
    _json,
    _sha256,
    inspect_quality_v4_promotion,
    score_history_fingerprint,
)
from .specialist_tristate_migration import (
    MIGRATION_VERSION,
    SPECIALIST_SCHEMA_VERSION,
)
from .sqlite_snapshot import readonly_sqlite_snapshot

STALE_V4_SCORE_VERSION = "public-v4-quality-research"
CANONICAL_V4_SCORE_VERSION = QUALITY_PRODUCTION_SCORE_VERSION
V4_PREFIX = "public-v4-quality-research"
SPECIALIST_STATUSES = {"specialist", "non_specialist", "unknown"}


def _resolve_source_db(
    manifest_path: str | Path,
    source_db: str | Path | None,
) -> Path:
    if source_db is not None:
        return Path(source_db)
    manifest = _json(Path(manifest_path).read_text(encoding="utf-8"), {})
    configured = manifest.get("source_shadow_db")
    if not isinstance(configured, str) or not configured:
        raise ValueError("cohort manifest is missing source_shadow_db")
    path = Path(configured)
    return path if path.is_absolute() else Path.cwd() / path


def _same_value(left: object, right: object) -> bool:
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return abs(float(left) - float(right)) <= 1e-9
    return left == right


def _expected_score_field(plan: dict[str, Any], field: str) -> object:
    score = plan["production"]
    if field == "local_discovery_components_json":
        return score.local_discovery_components
    return getattr(score, field)


def _current_score_field(row: dict[str, Any], field: str) -> object:
    if field == "local_discovery_components_json":
        return _json(row.get(field), {})
    return row.get(field)


def _history_score_field(payload: dict[str, Any], field: str) -> object:
    if field == "local_discovery_components_json":
        return payload.get("local_discovery_components")
    return payload.get(field)


def _version_counts(connection) -> dict[str, int]:
    return {
        str(row["score_version"]): int(row["n"])
        for row in connection.execute(
            "SELECT COALESCE(score_version, 'NULL') score_version, COUNT(*) n "
            "FROM public_restaurants GROUP BY score_version"
        )
    }


def _table_snapshot(connection, table: str) -> dict[int | str, dict[str, Any]]:
    primary_key = "place_id" if table == "public_restaurants" else "id"
    return {
        row[primary_key]: dict(row)
        for row in connection.execute(f"SELECT * FROM {table}").fetchall()
    }


def _validate_specialist_metadata(row: dict[str, Any], place_id: str) -> None:
    evidence = _json(row.get("evidence_json"), {})
    provenance = _json(row.get("specialist_provenance_json"), {})
    status = row.get("specialist_status")
    if status not in SPECIALIST_STATUSES:
        raise ValueError(f"invalid specialist_status for {place_id}")
    if row.get("specialist_schema_version") != SPECIALIST_SCHEMA_VERSION:
        raise ValueError(f"invalid specialist_schema_version for {place_id}")
    if evidence.get("specialist_status") != status:
        raise ValueError(f"specialist evidence mismatch for {place_id}")
    if evidence.get("specialist_schema_version") != SPECIALIST_SCHEMA_VERSION:
        raise ValueError(f"specialist evidence schema mismatch for {place_id}")
    if provenance.get("migration_version") != MIGRATION_VERSION:
        raise ValueError(f"specialist provenance version mismatch for {place_id}")
    if provenance.get("specialist_status") != status:
        raise ValueError(f"specialist provenance status mismatch for {place_id}")


def _validate_current_score(plan: dict[str, Any]) -> None:
    row = plan["canonical"]
    place_id = str(plan["place_id"])
    if row.get("fiyu_score") is None:
        raise ValueError(f"current score is missing for {place_id}")
    mismatches = {
        field: {
            "stored": _current_score_field(row, field),
            "recomputed": _expected_score_field(plan, field),
        }
        for field in CURRENT_SCORE_FIELDS
        if field != "score_version"
        and not _same_value(
            _current_score_field(row, field), _expected_score_field(plan, field)
        )
    }
    if mismatches:
        raise ValueError(f"current canonical score mismatch for {place_id}: {mismatches}")


def _validate_history(
    connection,
    plan: dict[str, Any],
    expected_version: str,
) -> dict[str, Any]:
    place_id = str(plan["place_id"])
    rows = [
        dict(row)
        for row in connection.execute(
            "SELECT * FROM score_calculation_runs "
            "WHERE public_restaurant_id=? AND score_version LIKE ? ORDER BY id",
            (place_id, f"{V4_PREFIX}%"),
        ).fetchall()
    ]
    if len(rows) != 1:
        raise ValueError(
            f"expected exactly one V4 history row for {place_id}, found {len(rows)}"
        )
    history = rows[0]
    if history["score_version"] != expected_version:
        raise ValueError(f"V4 history label mismatch for {place_id}")
    payload = _json(history.get("score_json"), None)
    if not isinstance(payload, dict):
        raise TypeError(f"invalid V4 history score_json for {place_id}")
    if payload.get("score_version") != expected_version:
        raise ValueError(f"embedded V4 history label mismatch for {place_id}")
    if score_history_fingerprint(payload) != history["evidence_fingerprint"]:
        raise ValueError(f"invalid V4 history fingerprint for {place_id}")
    current = plan["canonical"]
    mismatches = {
        field: {
            "current": _current_score_field(current, field),
            "history": _history_score_field(payload, field),
        }
        for field in CURRENT_SCORE_FIELDS
        if field != "score_version"
        and not _same_value(
            _current_score_field(current, field),
            _history_score_field(payload, field),
        )
    }
    if mismatches:
        raise ValueError(f"V4 history numeric/state mismatch for {place_id}: {mismatches}")
    return {"row": history, "payload": payload}


def inspect_specialist_version_fix(
    db_path: str | Path,
    *,
    cohort_manifest: str | Path,
    source_db: str | Path | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    db = Path(db_path)
    manifest = Path(cohort_manifest)
    source = _resolve_source_db(manifest, source_db)
    promotion_summary, promotion_plans = inspect_quality_v4_promotion(
        db,
        source_db=source,
        cohort_manifest=manifest,
    )
    selected: list[dict[str, Any]] = []
    already_correct = 0
    with readonly_sqlite_snapshot(db) as connection:
        counts_before = _version_counts(connection)
        published_before = int(
            connection.execute(
                "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1"
            ).fetchone()[0]
        )
        for plan in promotion_plans:
            place_id = str(plan["place_id"])
            row = plan["canonical"]
            version = row.get("score_version")
            if version not in {STALE_V4_SCORE_VERSION, CANONICAL_V4_SCORE_VERSION}:
                raise ValueError(f"unexpected current score_version for {place_id}: {version}")
            _validate_current_score(plan)
            _validate_specialist_metadata(row, place_id)
            history = _validate_history(connection, plan, str(version))
            if version == CANONICAL_V4_SCORE_VERSION:
                already_correct += 1
                continue
            payload_after = deepcopy(history["payload"])
            payload_after["score_version"] = CANONICAL_V4_SCORE_VERSION
            selected.append(
                {
                    "place_id": place_id,
                    "history_id": int(history["row"]["id"]),
                    "old_fingerprint": history["row"]["evidence_fingerprint"],
                    "payload_after": payload_after,
                    "fingerprint_after": score_history_fingerprint(payload_after),
                }
            )
    projected_counts = dict(counts_before)
    projected_counts[STALE_V4_SCORE_VERSION] = (
        projected_counts.get(STALE_V4_SCORE_VERSION, 0) - len(selected)
    )
    projected_counts[CANONICAL_V4_SCORE_VERSION] = (
        projected_counts.get(CANONICAL_V4_SCORE_VERSION, 0) + len(selected)
    )
    summary = {
        "cohort": {
            "manifest_path": str(manifest),
            "manifest_sha256": _sha256(manifest),
            "manifest_ids": promotion_summary["cohort_ids"],
            "unique_ids": promotion_summary["unique_cohort_ids"],
            "canonical_matched": promotion_summary["matched_canonical_identities"],
        },
        "selection": {
            "selected": len(selected),
            "already_correct": already_correct,
            "invalid": 0,
        },
        "current_pointer": {
            "score_version_labels_to_change": len(selected),
            "numeric_score_changes": 0,
            "canonical_score_parity": promotion_summary[
                "shadow_production_exact_matches"
            ],
        },
        "history": {
            "v4_history_labels_to_change": len(selected),
            "embedded_score_json_labels_to_change": len(selected),
            "fingerprints_to_recompute": len(selected),
            "v3_history_rows_touched": 0,
        },
        "invariants": {
            "publication_changes": 0,
            "product_eligibility_changes": 0,
            "review_status_changes": 0,
            "rejection_reason_changes": 0,
            "threshold_changes": 0,
            "unrelated_rows_changed": 0,
            "external_requests": 0,
            "publication_threshold_before": PUBLICATION_SCORE_THRESHOLD,
            "publication_threshold_after": PUBLICATION_SCORE_THRESHOLD,
            "published_count_before": published_before,
            "published_count_after": published_before,
        },
        "version_counts": {
            "before": counts_before,
            "projected_after": projected_counts,
            "projected_total": sum(projected_counts.values()),
        },
        "idempotency_expectation": {
            "selected": 0,
            "already_correct": promotion_summary["cohort_ids"],
            "pointer_label_changes": 0,
            "history_label_changes": 0,
            "fingerprint_changes": 0,
            "numeric_score_changes": 0,
            "publication_changes": 0,
        },
        "source_shadow_db": str(source),
        "source_shadow_sha256": _sha256(source),
        "canonical_sha256_before": _sha256(db),
        "canonical_integrity_before": _integrity(db),
        "source_integrity": _integrity(source),
    }
    if len(selected) + already_correct != promotion_summary["cohort_ids"]:
        raise RuntimeError("manifest cohort accounting mismatch")
    return summary, selected


def _apply_fix(
    db_path: Path,
    selected: list[dict[str, Any]],
    *,
    public_before: dict[int | str, dict[str, Any]],
    history_before: dict[int | str, dict[str, Any]],
    quality_before: dict[int | str, dict[str, Any]],
    visibility_before: dict[int | str, tuple[object, ...]],
) -> None:
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        for plan in selected:
            current = connection.execute(
                "UPDATE public_restaurants SET score_version=? "
                "WHERE place_id=? AND score_version=?",
                (
                    CANONICAL_V4_SCORE_VERSION,
                    plan["place_id"],
                    STALE_V4_SCORE_VERSION,
                ),
            )
            if current.rowcount != 1:
                raise RuntimeError(f"current pointer update failed for {plan['place_id']}")
            history = connection.execute(
                """
                UPDATE score_calculation_runs SET
                    score_version=?, evidence_fingerprint=?, score_json=?
                WHERE id=? AND public_restaurant_id=? AND score_version=?
                  AND evidence_fingerprint=?
                """,
                (
                    CANONICAL_V4_SCORE_VERSION,
                    plan["fingerprint_after"],
                    json.dumps(plan["payload_after"], ensure_ascii=False),
                    plan["history_id"],
                    plan["place_id"],
                    STALE_V4_SCORE_VERSION,
                    plan["old_fingerprint"],
                ),
            )
            if history.rowcount != 1:
                raise RuntimeError(f"history update failed for {plan['place_id']}")
        public_after = _table_snapshot(connection, "public_restaurants")
        history_after = _table_snapshot(connection, "score_calculation_runs")
        quality_after = _table_snapshot(connection, "quality_v4_research_runs")
        visibility_after = {
            place_id: tuple(row.get(field) for field in VISIBILITY_FIELDS)
            for place_id, row in public_after.items()
        }
        _validate_exact_scope(
            public_before,
            public_after,
            history_before,
            history_after,
            selected,
        )
        if quality_after != quality_before:
            raise RuntimeError("Quality-v4 research rows changed")
        if visibility_after != visibility_before:
            raise RuntimeError("publication or eligibility state changed")
        connection.commit()


def _validate_exact_scope(
    before_public: dict[int | str, dict[str, Any]],
    after_public: dict[int | str, dict[str, Any]],
    before_history: dict[int | str, dict[str, Any]],
    after_history: dict[int | str, dict[str, Any]],
    selected: list[dict[str, Any]],
) -> None:
    selected_ids = {plan["place_id"] for plan in selected}
    selected_history_ids = {plan["history_id"] for plan in selected}
    for place_id, before in before_public.items():
        after = after_public.get(place_id)
        if place_id not in selected_ids:
            if after != before:
                raise RuntimeError(f"unrelated public row changed: {place_id}")
            continue
        expected = dict(before)
        expected["score_version"] = CANONICAL_V4_SCORE_VERSION
        if after != expected:
            raise RuntimeError(f"unexpected current-row mutation: {place_id}")
    for history_id, before in before_history.items():
        after = after_history.get(history_id)
        if history_id not in selected_history_ids:
            if after != before:
                raise RuntimeError(f"unrelated history row changed: {history_id}")
            continue
        allowed = {"score_version", "score_json", "evidence_fingerprint"}
        changed = {key for key in before if before[key] != after.get(key)}
        if changed != allowed:
            raise RuntimeError(f"unexpected history mutation for row {history_id}: {changed}")


def _write_outputs(
    summary: dict[str, Any],
    *,
    summary_path: str | Path | None,
    report_path: str | Path | None,
) -> None:
    if summary_path:
        path = Path(summary_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    if report_path:
        path = Path(report_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        title = (
            "# V4 specialist-tristate lineage fix dry run"
            if summary["dry_run"]
            else "# V4 specialist-tristate lineage fix"
        )
        lines = [
            title,
            "",
            "## 1. Cohort validation",
            "",
            f"`{json.dumps(summary['cohort'], sort_keys=True)}`",
            "",
            "## 2. Current-pointer label changes",
            "",
            f"`{json.dumps(summary['current_pointer'], sort_keys=True)}`",
            "",
            "## 3. History label changes",
            "",
            f"`{json.dumps(summary['history'], sort_keys=True)}`",
            "",
            "## 4. Fingerprint changes",
            "",
            f"Fingerprints to recompute: **{summary['history']['fingerprints_to_recompute']}**.",
            "",
            "## 5. Numeric score invariant",
            "",
            "Numeric score changes: **0**.",
            "",
            "## 6. Publication invariant",
            "",
            f"Published count: **{summary['invariants']['published_count_before']} -> {summary['invariants']['published_count_after']}**.",
            "",
            "## 7. Threshold invariant",
            "",
            f"Threshold: **{summary['invariants']['publication_threshold_before']} -> {summary['invariants']['publication_threshold_after']}**.",
            "",
            "## 8. Unrelated-row protection",
            "",
            f"Unrelated rows changed: **{summary['invariants']['unrelated_rows_changed']}**.",
            "",
            "## 9. Post-migration version counts",
            "",
            f"`{json.dumps(summary['version_counts']['projected_after'], sort_keys=True)}`",
            "",
            "## 10. Idempotency",
            "",
            f"After a successful real run, expected selected / already correct: **{summary['idempotency_expectation']['selected']} / {summary['idempotency_expectation']['already_correct']}**.",
            "",
            "## Full machine-readable summary",
            "",
            "```json",
            json.dumps(summary, ensure_ascii=False, indent=2),
            "```",
            "",
        ]
        path.write_text("\n".join(lines), encoding="utf-8")


def run_specialist_version_fix(
    db_path: str | Path,
    *,
    cohort_manifest: str | Path,
    source_db: str | Path | None = None,
    dry_run: bool = False,
    backup_path: str | Path | None = None,
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
) -> dict[str, Any]:
    db = Path(db_path)
    before_sha = _sha256(db)
    summary, selected = inspect_specialist_version_fix(
        db,
        cohort_manifest=cohort_manifest,
        source_db=source_db,
    )
    summary["dry_run"] = dry_run
    if dry_run:
        summary["canonical_sha256_after"] = _sha256(db)
        summary["canonical_unchanged"] = summary["canonical_sha256_after"] == before_sha
        _write_outputs(summary, summary_path=summary_path, report_path=report_path)
        if not summary["canonical_unchanged"]:
            raise RuntimeError("dry run changed canonical database")
        return summary

    if selected and backup_path is None:
        raise ValueError("--backup-out is required for a mutating version fix")
    with readonly_sqlite_snapshot(db) as connection:
        public_before = _table_snapshot(connection, "public_restaurants")
        history_before = _table_snapshot(connection, "score_calculation_runs")
        quality_before = _table_snapshot(connection, "quality_v4_research_runs")
        visibility_before = {
            place_id: tuple(row.get(field) for field in VISIBILITY_FIELDS)
            for place_id, row in public_before.items()
        }
    if selected:
        pre_sha, backup_sha = _create_backup(db, Path(backup_path))
        summary.update(
            {
                "backup_path": str(backup_path),
                "backup_sha256": backup_sha,
                "backup_matches_pre_migration": backup_sha == pre_sha,
            }
        )
        _apply_fix(
            db,
            selected,
            public_before=public_before,
            history_before=history_before,
            quality_before=quality_before,
            visibility_before=visibility_before,
        )
    with readonly_sqlite_snapshot(db) as connection:
        public_after = _table_snapshot(connection, "public_restaurants")
        history_after = _table_snapshot(connection, "score_calculation_runs")
        quality_after = _table_snapshot(connection, "quality_v4_research_runs")
        counts_after = _version_counts(connection)
        visibility_after = {
            place_id: tuple(row.get(field) for field in VISIBILITY_FIELDS)
            for place_id, row in public_after.items()
        }
    _validate_exact_scope(
        public_before,
        public_after,
        history_before,
        history_after,
        selected,
    )
    if quality_after != quality_before:
        raise RuntimeError("Quality-v4 research rows changed")
    if visibility_after != visibility_before:
        raise RuntimeError("publication or eligibility state changed")
    rerun, _ = inspect_specialist_version_fix(
        db,
        cohort_manifest=cohort_manifest,
        source_db=source_db,
    )
    if rerun["selection"]["selected"] != 0:
        raise RuntimeError("version fix did not become idempotent")
    summary["selection_after"] = rerun["selection"]
    summary["version_counts"]["after"] = counts_after
    summary["version_counts"]["projected_after"] = counts_after
    summary["invariants"]["published_count_after"] = rerun["invariants"][
        "published_count_before"
    ]
    summary["canonical_integrity_after"] = _integrity(db)
    summary["canonical_sha256_after"] = _sha256(db)
    summary["canonical_unchanged"] = not selected
    _write_outputs(summary, summary_path=summary_path, report_path=report_path)
    return summary


def compact_summary(summary: dict[str, Any]) -> str:
    return json.dumps(
        {
            "dry_run": summary["dry_run"],
            "manifest_ids": summary["cohort"]["manifest_ids"],
            "selected": summary["selection"]["selected"],
            "already_correct": summary["selection"]["already_correct"],
            "pointer_labels": summary["current_pointer"][
                "score_version_labels_to_change"
            ],
            "history_labels": summary["history"]["v4_history_labels_to_change"],
            "fingerprints": summary["history"]["fingerprints_to_recompute"],
            "numeric_score_changes": 0,
            "publication_changes": 0,
        },
        sort_keys=True,
    )
