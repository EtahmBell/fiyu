"""Transactional local migration from specialist boolean to explicit tri-state semantics."""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import sqlite3
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

from .database import connect
from .public_score import FiyuEvidence, FiyuScoreResult, rescore_specialist_status

MIGRATION_VERSION: Final = "specialist-tristate-migration-1"
SPECIALIST_SCHEMA_VERSION: Final = "specialist-tristate-1"
V3_SCORE_VERSION: Final = "public-v3-local-discovery-specialist-tristate"
V4_SCORE_VERSION: Final = "public-v4-quality-research-specialist-tristate"
PUBLICATION_THRESHOLD: Final = 75.0
VISIBILITY_FIELDS: Final = (
    "is_published",
    "product_eligible",
    "review_status",
    "review_notes",
    "product_eligibility_classification",
    "product_eligibility_reasons_json",
)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _json(value: object, default: Any) -> Any:
    try:
        parsed = json.loads(str(value or ""))
    except (json.JSONDecodeError, TypeError, ValueError):
        return default
    return parsed


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _distribution(values: list[float]) -> dict[str, float | int]:
    if not values:
        return {
            "count": 0,
            "min": 0.0,
            "p10": 0.0,
            "median": 0.0,
            "mean": 0.0,
            "p90": 0.0,
            "max": 0.0,
        }
    return {
        "count": len(values),
        "min": round(min(values), 2),
        "p10": round(_percentile(values, 0.10), 2),
        "median": round(_percentile(values, 0.50), 2),
        "mean": round(sum(values) / len(values), 2),
        "p90": round(_percentile(values, 0.90), 2),
        "max": round(max(values), 2),
    }


def _integrity(path: Path) -> str:
    uri = f"file:{path.resolve().as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        return str(connection.execute("PRAGMA integrity_check").fetchone()[0])


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in connection.execute(f"PRAGMA table_info({table})")}


def _source_origin(raw: dict[str, Any]) -> tuple[str, bool | None, str]:
    if raw.get("specialist_restaurant") is True:
        return "specialist", True, "prior_true"
    if "specialist_restaurant" in raw and raw.get("specialist_restaurant") is False:
        return "unknown", False, "prior_ambiguous_false"
    return "unknown", None, "missing_legacy_value"


def _score_version(row: dict[str, Any]) -> str:
    return V4_SCORE_VERSION if row.get("guarded_quality_adjustment") is not None else V3_SCORE_VERSION


def _score_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "local_signal",
            "hiddenness_signal",
            "quality_signal",
            "independence_signal",
            "local_discovery_score",
            "local_discovery_classification",
            "local_discovery_contribution",
            "tourist_visibility_classification",
            "fiyu_score",
            "fiyu_confidence",
            "confidence_band",
            "score_band",
            "score_version",
        )
    }


def _fingerprint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _load_rows(db_path: Path) -> tuple[list[dict[str, Any]], bool]:
    uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    has_columns = "specialist_status" in _columns(connection, "public_restaurants")
    specialist_projection = (
        "p.specialist_status, p.specialist_provenance_json, p.specialist_schema_version,"
        if has_columns
        else "NULL AS specialist_status, NULL AS specialist_provenance_json, "
        "NULL AS specialist_schema_version,"
    )
    rows = [
        dict(row)
        for row in connection.execute(
            f"""
            SELECT p.*, {specialist_projection}
                   r.quality_score AS base_quality_score,
                   r.underexposure_score, r.digital_footprint_score,
                   rr.id AS source_research_run_id, rr.structured_research_json,
                   rr.score_json AS source_score_json,
                   q.guarded_quality_adjustment
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            LEFT JOIN restaurant_research_runs rr ON rr.id=(
                SELECT x.id FROM restaurant_research_runs x
                WHERE x.public_restaurant_id=p.place_id AND x.status='complete'
                ORDER BY x.is_current DESC, x.id DESC LIMIT 1
            )
            LEFT JOIN quality_v4_research_runs q ON q.id=(
                SELECT q2.id FROM quality_v4_research_runs q2
                WHERE q2.public_restaurant_id=p.place_id AND q2.status='complete'
                ORDER BY q2.id DESC LIMIT 1
            )
            ORDER BY p.place_id
            """
        ).fetchall()
    ]
    connection.close()
    return rows, has_columns


def _visibility(row: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(row.get(field) for field in VISIBILITY_FIELDS)


def inspect_migration(db_path: str | Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    path = Path(db_path)
    rows, has_columns = _load_rows(path)
    plans: list[dict[str, Any]] = []
    prior_counts = {"true": 0, "false": 0, "missing": 0}
    proposed_counts = {"specialist": 0, "non_specialist": 0, "unknown": 0}
    version_before: dict[str, int] = {}

    for row in rows:
        version = str(row.get("score_version") or "NULL")
        version_before[version] = version_before.get(version, 0) + 1
        existing_provenance = _json(row.get("specialist_provenance_json"), {})
        already_migrated = (
            row.get("specialist_schema_version") == SPECIALIST_SCHEMA_VERSION
            and existing_provenance.get("migration_version") == MIGRATION_VERSION
        )
        raw = _json(row.get("evidence_json"), {})
        target, old_boolean, origin = _source_origin(raw)
        prior_counts[
            "true" if old_boolean is True else "false" if old_boolean is False else "missing"
        ] += 1
        if already_migrated:
            target = str(row.get("specialist_status") or "unknown")
        proposed_counts[target] += 1

        evidence_payload = dict(raw)
        evidence_payload["specialist_status"] = target
        evidence_payload["specialist_restaurant"] = target == "specialist"
        evidence_payload["specialist_schema_version"] = SPECIALIST_SCHEMA_VERSION
        evidence = FiyuEvidence(**evidence_payload)
        score: FiyuScoreResult | None = None
        delta = 0.0
        if row.get("fiyu_score") is not None:
            stored_score = _json(row.get("source_score_json"), {})
            local_components = _json(row.get("local_discovery_components_json"), {})
            current = FiyuScoreResult(
                local_signal=float(row.get("local_signal") or 0),
                hiddenness_signal=float(row.get("hiddenness_signal") or 0),
                quality_signal=float(row.get("quality_signal") or 0),
                independence_signal=float(row.get("independence_signal") or 0),
                local_discovery_score=float(row.get("local_discovery_score") or 0),
                local_discovery_classification=str(
                    row.get("local_discovery_classification") or "mainstream_visible"
                ),
                local_discovery_components=local_components,
                local_discovery_contribution=float(
                    row.get("local_discovery_contribution") or 0
                ),
                tourist_visibility_classification=str(
                    row.get("tourist_visibility_classification") or "mixed_visibility"
                ),
                tourist_orientation=str(row.get("tourist_orientation") or "unknown"),
                tourist_orientation_basis=str(
                    row.get("tourist_orientation_basis") or "neutral_unknown"
                ),
                product_eligible=bool(row.get("product_eligible")),
                product_eligibility_classification=str(
                    row.get("product_eligibility_classification") or "eligible_visit_ready_venue"
                ),
                product_eligibility_reasons=tuple(
                    str(item)
                    for item in _json(row.get("product_eligibility_reasons_json"), [])
                ),
                fiyu_score=float(row["fiyu_score"]),
                fiyu_confidence=float(row.get("fiyu_confidence") or 0),
                confidence_band=str(row.get("confidence_band") or "very_low"),
                score_band=str(row.get("score_band") or "not_recommended"),
                publishable=bool(stored_score.get("publishable")),
                blocking_conflict=bool(stored_score.get("blocking_conflict")),
                conflict_classification=str(
                    stored_score.get("conflict_classification") or "none"
                ),
                chain_classification=str(
                    stored_score.get("chain_classification")
                    or raw.get("chain_classification")
                    or "unknown"
                ),
                chain_excluded=bool(stored_score.get("chain_excluded")),
                score_version=str(row.get("score_version") or "unversioned"),
            )
            previous_status = "specialist" if old_boolean is True else "non_specialist"
            if already_migrated:
                previous_status = target
            score = rescore_specialist_status(
                current,
                previous_status=previous_status,
                specialist_status=target,
            )
            score = replace(score, score_version=_score_version(row))
            delta = round(score.fiyu_score - float(row["fiyu_score"]), 2)
            expected = 0.0 if old_boolean is True else 0.95 if old_boolean is False else 0.0
            if already_migrated:
                expected = 0.0
            if abs(delta - expected) > 0.011 and not (
                old_boolean is False and abs(delta) <= 0.011
            ):
                raise ValueError(
                    f"unexpected specialist-only score delta for {row['place_id']}: "
                    f"expected {expected} (or capped 0), got {delta}"
                )

        plans.append(
            {
                "row": row,
                "place_id": str(row["place_id"]),
                "target": target,
                "old_boolean": old_boolean,
                "origin": origin,
                "already_migrated": already_migrated,
                "evidence_payload": evidence.to_dict(),
                "score": score,
                "delta": delta,
                "visibility": _visibility(row),
            }
        )

    mutation_plans = [plan for plan in plans if not plan["already_migrated"]]
    score_plans = [plan for plan in mutation_plans if plan["score"] is not None]
    changed = [plan for plan in score_plans if abs(plan["delta"]) > 0.001]

    threshold_effects: dict[str, Any] = {}
    scored = [plan for plan in plans if plan["row"].get("fiyu_score") is not None]
    for floor in (68.0, 70.0, 75.0):
        upward = [
            plan
            for plan in scored
            if float(plan["row"]["fiyu_score"]) < floor
            <= float(plan["row"]["fiyu_score"]) + float(plan["delta"])
        ]
        downward = [
            plan
            for plan in scored
            if float(plan["row"]["fiyu_score"]) >= floor
            > float(plan["row"]["fiyu_score"]) + float(plan["delta"])
        ]
        threshold_effects[str(int(floor))] = {
            "currently_below": sum(
                float(plan["row"]["fiyu_score"]) < floor for plan in scored
            ),
            "cross_upward": len(upward),
            "cross_downward": len(downward),
            "upward_place_ids": [plan["place_id"] for plan in upward],
        }

    summary = {
        "dry_run": True,
        "schema": {
            "columns_already_present": has_columns,
            "specialist_status_values": ["specialist", "non_specialist", "unknown"],
            "specialist_schema_version": SPECIALIST_SCHEMA_VERSION,
            "migration_version": MIGRATION_VERSION,
        },
        "prior_counts": prior_counts,
        "proposed_counts": proposed_counts,
        "migration": {
            "rows_total": len(plans),
            "rows_to_migrate": len(mutation_plans),
            "rows_skipped_already_migrated": len(plans) - len(mutation_plans),
            "schema_forced_false_to_unknown": sum(
                plan["origin"] == "prior_ambiguous_false" for plan in mutation_plans
            ),
            "missing_to_unknown": sum(
                plan["origin"] == "missing_legacy_value" for plan in mutation_plans
            ),
            "false_to_non_specialist": 0,
            "fabricated_provenance_rows": 0,
        },
        "scoring": {
            "scored_rows": len(score_plans),
            "rows_changed": len(changed),
            "unchanged_rows": len(score_plans) - len(changed),
            "delta_distribution_changed_rows": _distribution(
                [float(plan["delta"]) for plan in changed]
            ),
            "all_delta_values": sorted({float(plan["delta"]) for plan in score_plans}),
            "score_version_before": dict(sorted(version_before.items())),
            "score_version_after": {
                V4_SCORE_VERSION: sum(
                    plan["score"] is not None
                    and plan["row"].get("guarded_quality_adjustment") is not None
                    for plan in mutation_plans
                ),
                V3_SCORE_VERSION: sum(
                    plan["score"] is not None
                    and plan["row"].get("guarded_quality_adjustment") is None
                    for plan in mutation_plans
                ),
                "NULL": sum(plan["score"] is None for plan in mutation_plans),
            },
        },
        "floor_counterfactuals": threshold_effects,
        "score_only_rejected_rows_affected": sum(
            abs(float(plan["delta"])) > 0.001
            and plan["row"].get("review_status") == "auto_rejected"
            and bool(plan["row"].get("product_eligible"))
            for plan in score_plans
        ),
        "publication_safety": {
            "expected_is_published_changes": 0,
            "expected_product_eligible_changes": 0,
            "expected_review_status_changes": 0,
            "expected_rejection_reason_changes": 0,
            "expected_eligibility_classification_changes": 0,
            "expected_threshold_changes": 0,
            "publication_threshold": PUBLICATION_THRESHOLD,
        },
        "quality_v4": {
            "research_rows_rewritten": 0,
            "adjustment_values_changed": 0,
        },
        "network_or_paid_requests": 0,
    }
    return summary, plans


def _add_columns(connection: sqlite3.Connection) -> None:
    existing = _columns(connection, "public_restaurants")
    declarations = {
        "specialist_status": "TEXT NOT NULL DEFAULT 'unknown'",
        "specialist_provenance_json": "TEXT NOT NULL DEFAULT '{}'",
        "specialist_schema_version": (
            "TEXT NOT NULL DEFAULT 'specialist-tristate-1'"
        ),
    }
    for name, declaration in declarations.items():
        if name not in existing:
            connection.execute(
                f"ALTER TABLE public_restaurants ADD COLUMN {name} {declaration}"
            )


def _write_score_history(
    connection: sqlite3.Connection,
    *,
    plan: dict[str, Any],
    score: FiyuScoreResult,
    now: str,
) -> None:
    payload = score.to_dict()
    evidence = plan["evidence_payload"]
    fingerprint = _fingerprint(
        {
            "evidence": evidence,
            "score_version": score.score_version,
            "migration_version": MIGRATION_VERSION,
        }
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO score_calculation_runs (
            public_restaurant_id, source_research_run_id, score_version,
            evidence_fingerprint, score_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            plan["place_id"],
            plan["row"].get("source_research_run_id"),
            score.score_version,
            fingerprint,
            json.dumps(payload, ensure_ascii=False),
            now,
        ),
    )


def _apply(db_path: Path, plans: list[dict[str, Any]]) -> dict[str, Any]:
    now = _utc_now()
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        _add_columns(connection)
        for plan in plans:
            if plan["already_migrated"]:
                continue
            provenance = {
                "migration_version": MIGRATION_VERSION,
                "migration_timestamp": now,
                "origin": plan["origin"],
                "prior_boolean_value": plan["old_boolean"],
                "specialist_status": plan["target"],
                "evidence_summary": None,
                "source_references": [],
                "confidence": None,
                "note": (
                    "prior_false_semantically_ambiguous"
                    if plan["origin"] == "prior_ambiguous_false"
                    else "legacy_boolean_migration"
                ),
            }
            score = plan["score"]
            if score is None:
                connection.execute(
                    """
                    UPDATE public_restaurants
                    SET specialist_status=?, specialist_provenance_json=?,
                        specialist_schema_version=?, evidence_json=?
                    WHERE place_id=?
                    """,
                    (
                        plan["target"],
                        json.dumps(provenance, ensure_ascii=False),
                        SPECIALIST_SCHEMA_VERSION,
                        json.dumps(plan["evidence_payload"], ensure_ascii=False),
                        plan["place_id"],
                    ),
                )
                continue
            connection.execute(
                """
                UPDATE public_restaurants
                SET specialist_status=?, specialist_provenance_json=?,
                    specialist_schema_version=?, evidence_json=?,
                    local_signal=?, hiddenness_signal=?, quality_signal=?,
                    independence_signal=?, local_discovery_score=?,
                    local_discovery_classification=?,
                    local_discovery_components_json=?, local_discovery_contribution=?,
                    tourist_visibility_classification=?, tourist_orientation=?,
                    tourist_orientation_basis=?, fiyu_score=?, fiyu_confidence=?,
                    confidence_band=?, score_band=?, score_version=?
                WHERE place_id=?
                """,
                (
                    plan["target"],
                    json.dumps(provenance, ensure_ascii=False),
                    SPECIALIST_SCHEMA_VERSION,
                    json.dumps(plan["evidence_payload"], ensure_ascii=False),
                    score.local_signal,
                    score.hiddenness_signal,
                    score.quality_signal,
                    score.independence_signal,
                    score.local_discovery_score,
                    score.local_discovery_classification,
                    json.dumps(score.local_discovery_components, ensure_ascii=False),
                    score.local_discovery_contribution,
                    score.tourist_visibility_classification,
                    score.tourist_orientation,
                    score.tourist_orientation_basis,
                    score.fiyu_score,
                    score.fiyu_confidence,
                    score.confidence_band,
                    score.score_band,
                    score.score_version,
                    plan["place_id"],
                ),
            )
            _write_score_history(connection, plan=plan, score=score, now=now)
        connection.commit()
    return {"migration_timestamp": now}


def _post_validate(db_path: Path, before_plans: list[dict[str, Any]]) -> dict[str, Any]:
    summary, plans = inspect_migration(db_path)
    after_by_id = {plan["place_id"]: plan for plan in plans}
    visibility_changes = {
        field: 0 for field in VISIBILITY_FIELDS
    }
    for before in before_plans:
        after = after_by_id[before["place_id"]]
        for index, field in enumerate(VISIBILITY_FIELDS):
            visibility_changes[field] += (
                before["visibility"][index] != after["visibility"][index]
            )
    status_counts: dict[str, int] = {}
    with connect(db_path) as connection:
        for row in connection.execute(
            "SELECT specialist_status, COUNT(*) n FROM public_restaurants "
            "GROUP BY specialist_status"
        ):
            status_counts[str(row["specialist_status"])] = int(row["n"])
        duplicate_history = int(
            connection.execute(
                """
                SELECT COUNT(*) FROM (
                    SELECT public_restaurant_id, score_version, evidence_fingerprint, COUNT(*) n
                    FROM score_calculation_runs
                    WHERE score_version IN (?, ?)
                    GROUP BY 1,2,3 HAVING COUNT(*)>1
                )
                """,
                (V3_SCORE_VERSION, V4_SCORE_VERSION),
            ).fetchone()[0]
        )
    if any(visibility_changes.values()):
        raise RuntimeError(f"publication state changed: {visibility_changes}")
    if status_counts.get("non_specialist", 0):
        raise RuntimeError("migration fabricated non_specialist rows")
    if summary["migration"]["rows_to_migrate"]:
        raise RuntimeError("migration is not idempotent")
    return {
        "specialist_status_counts": status_counts,
        "visibility_changes": visibility_changes,
        "publication_threshold_changes": 0,
        "publication_threshold": PUBLICATION_THRESHOLD,
        "duplicate_new_score_history_rows": duplicate_history,
        "idempotency_rows_to_migrate": summary["migration"]["rows_to_migrate"],
        "sqlite_integrity": _integrity(db_path),
    }


def _render_report(summary: dict[str, Any]) -> str:
    delta = summary["scoring"]["delta_distribution_changed_rows"]
    floors = summary["floor_counterfactuals"]
    final = summary.get("post_migration", {}).get("specialist_status_counts", {})
    return f"""# Specialist tri-state migration report

## Executive summary

The specialist boolean was migrated to the explicit states `specialist`,
`non_specialist`, and `unknown`. Historical true values became `specialist`; historical
false and missing values became `unknown`. No row was inferred to be `non_specialist`.

## Schema and provenance

- `public_restaurants.specialist_status`
- `public_restaurants.specialist_provenance_json`
- `public_restaurants.specialist_schema_version`
- Schema version: `{SPECIALIST_SCHEMA_VERSION}`
- Migration version: `{MIGRATION_VERSION}`
- Historical research-run payloads were preserved unchanged.
- The compatibility boolean in canonical evidence is derived only from tri-state status.

## Migration counts

- Prior true: **{summary['prior_counts']['true']}**
- Prior false: **{summary['prior_counts']['false']}**
- Prior missing: **{summary['prior_counts']['missing']}**
- Final specialist: **{final.get('specialist', summary['proposed_counts']['specialist'])}**
- Final non_specialist: **{final.get('non_specialist', 0)}**
- Final unknown: **{final.get('unknown', summary['proposed_counts']['unknown'])}**
- Rows migrated: **{summary['migration']['rows_to_migrate']}**
- Rows skipped: **{summary['migration']['rows_skipped_already_migrated']}**

## Scoring

- Scored rows: **{summary['scoring']['scored_rows']}**
- Rows changed: **{summary['scoring']['rows_changed']}**
- Delta min/p10/median/mean/p90/max: **{delta['min']} / {delta['p10']} /
  {delta['median']} / {delta['mean']} / {delta['p90']} / {delta['max']}**
- Observed delta values: `{summary['scoring']['all_delta_values']}`
- Quality-v4 research rows and adjustment values changed: **0**

## Floor counterfactuals

| Floor | Currently below | Cross upward | Cross downward |
|---:|---:|---:|---:|
| 68 | {floors['68']['currently_below']} | {floors['68']['cross_upward']} | {floors['68']['cross_downward']} |
| 70 | {floors['70']['currently_below']} | {floors['70']['cross_upward']} | {floors['70']['cross_downward']} |
| 75 | {floors['75']['currently_below']} | {floors['75']['cross_upward']} | {floors['75']['cross_downward']} |

Score-only rejected rows affected: **{summary['score_only_rejected_rows_affected']}**.
No floor or publication decision was changed.

## Publication safety

All tracked publication, eligibility, status, and rejection fields changed by **zero**.
The publication threshold remains **75**.

## Idempotency and integrity

- Second-run mutation rows: **{summary.get('post_migration', {}).get('idempotency_rows_to_migrate', 'pending')}**
- Duplicate new score-history rows: **{summary.get('post_migration', {}).get('duplicate_new_score_history_rows', 'pending')}**
- SQLite integrity: **{summary.get('post_migration', {}).get('sqlite_integrity', 'pending')}**
- External or paid requests: **0**
"""


def run_migration(
    db_path: str | Path,
    *,
    dry_run: bool,
    backup_path: str | Path | None = None,
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
) -> dict[str, Any]:
    path = Path(db_path)
    before_hash = _sha256(path)
    if _integrity(path) != "ok":
        raise RuntimeError("canonical database integrity check failed before migration")
    summary, plans = inspect_migration(path)
    summary["database_sha256"] = {"before": before_hash}
    if not dry_run and summary["migration"]["rows_to_migrate"]:
        if backup_path is None:
            raise ValueError("--backup-out is required for a mutating migration")
        backup = Path(backup_path)
        if backup.exists():
            raise FileExistsError(f"backup already exists: {backup}")
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup)
        if _sha256(backup) != before_hash or _integrity(backup) != "ok":
            raise RuntimeError("backup verification failed")
        summary["backup"] = {"path": str(backup), "sha256": _sha256(backup)}
        summary.update(_apply(path, plans))
        summary["dry_run"] = False
        summary["post_migration"] = _post_validate(path, plans)
    after_hash = _sha256(path)
    summary["database_sha256"]["after"] = after_hash
    summary["database_sha256"]["changed"] = before_hash != after_hash
    if dry_run and before_hash != after_hash:
        raise RuntimeError("dry run changed canonical database")
    if summary_path:
        output = Path(summary_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    if report_path:
        output = Path(report_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(_render_report(summary), encoding="utf-8")
    return summary


def compact_summary(summary: dict[str, Any]) -> str:
    return json.dumps(
        {
            "dry_run": summary["dry_run"],
            "rows_to_migrate": summary["migration"]["rows_to_migrate"],
            "specialist": summary["proposed_counts"]["specialist"],
            "non_specialist": summary["proposed_counts"]["non_specialist"],
            "unknown": summary["proposed_counts"]["unknown"],
            "score_rows_changed": summary["scoring"]["rows_changed"],
            "expected_publication_changes": 0,
        },
        ensure_ascii=False,
    )
