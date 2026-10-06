"""Promote completed Quality-v4 shadow results into the production score pointer."""

from __future__ import annotations

import hashlib
import json
import shutil
import statistics
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .database import connect
from .experimental_quality_challenge_v4 import ChallengeResearchResult
from .public_catalog import ensure_public_schema
from .public_score import PUBLICATION_SCORE_THRESHOLD, FiyuEvidence, InternalSignals
from .quality_v4 import (
    DEFAULT_ADJUSTMENT_GUARDRAIL,
    QUALITY_CASE_STRENGTH_VERSION,
    QUALITY_PRODUCTION_SCORE_VERSION,
    QUALITY_RESEARCH_VERSION,
    QUALITY_SCORE_VERSION,
    calculate_quality_v4_shadow,
)
from .sqlite_snapshot import readonly_sqlite_snapshot

QUALITY_COLUMNS = (
    "public_restaurant_id",
    "provider",
    "model",
    "response_id",
    "status",
    "quality_research_version",
    "quality_case_strength_version",
    "score_version",
    "prompt_version",
    "adjustment_guardrail",
    "base_quality_prior",
    "positive_case_strength",
    "negative_case_strength",
    "evidence_balance",
    "raw_quality_adjustment",
    "guarded_quality_adjustment",
    "researched_quality",
    "quality_evidence_confidence",
    "production_v3_score",
    "shadow_v4_score",
    "shadow_score_delta",
    "research_result_json",
    "normalized_observations_json",
    "claim_clusters_json",
    "usage_metadata_json",
    "response_request_count",
    "web_search_action_count",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "latency_seconds",
    "error_category",
    "error",
    "created_at",
    "completed_at",
)

VISIBILITY_FIELDS = (
    "is_published",
    "product_eligible",
    "review_status",
    "product_eligibility_classification",
    "product_eligibility_reasons_json",
)

CURRENT_SCORE_FIELDS = (
    "local_signal",
    "hiddenness_signal",
    "quality_signal",
    "independence_signal",
    "local_discovery_score",
    "local_discovery_classification",
    "local_discovery_components_json",
    "local_discovery_contribution",
    "tourist_visibility_classification",
    "tourist_orientation",
    "tourist_orientation_basis",
    "fiyu_score",
    "fiyu_confidence",
    "confidence_band",
    "score_band",
    "score_version",
)

ADJUSTMENT_BANDS = (
    ("<= -12", lambda value: value <= -12),
    ("-11.99 to -8", lambda value: -12 < value <= -8),
    ("-7.99 to -5", lambda value: -8 < value <= -5),
    ("-4.99 to -3", lambda value: -5 < value <= -3),
    ("-2.99 to -1", lambda value: -3 < value <= -1),
    ("-0.99 to -0.5", lambda value: -1 < value <= -0.5),
    ("-0.49 to +0.49", lambda value: -0.5 < value < 0.5),
    ("+0.5 to +0.99", lambda value: 0.5 <= value < 1),
    ("+1 to +2.99", lambda value: 1 <= value < 3),
    ("+3 to +4.99", lambda value: 3 <= value < 5),
    ("+5 to +7.99", lambda value: 5 <= value < 8),
    ("+8 to +11.99", lambda value: 8 <= value < 12),
    (">= +12", lambda value: value >= 12),
)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _json(value: object, default: Any) -> Any:
    try:
        return json.loads(str(value or ""))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    part = position - low
    return round(ordered[low] * (1 - part) + ordered[high] * part, 2)


def _distribution(values: list[float]) -> dict[str, float | int]:
    return {
        "count": len(values),
        "min": min(values, default=0),
        "p10": _percentile(values, 0.10),
        "median": round(statistics.median(values), 2) if values else 0,
        "mean": round(statistics.mean(values), 2) if values else 0,
        "p90": _percentile(values, 0.90),
        "max": max(values, default=0),
    }


def _integrity(path: str | Path) -> str:
    with readonly_sqlite_snapshot(path) as connection:
        return str(connection.execute("PRAGMA integrity_check").fetchone()[0])


def _latest_source_rows(source_db: str | Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    with readonly_sqlite_snapshot(source_db) as connection:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='quality_v4_research_runs'"
        ).fetchone()
        if not exists:
            raise ValueError("source database has no Quality-v4 research table")
        rows = [
            dict(row)
            for row in connection.execute(
                """
                SELECT q.* FROM quality_v4_research_runs q
                WHERE q.quality_research_version=? AND q.id=(
                    SELECT q2.id FROM quality_v4_research_runs q2
                    WHERE q2.public_restaurant_id=q.public_restaurant_id
                      AND q2.quality_research_version=q.quality_research_version
                    ORDER BY q2.id DESC LIMIT 1
                ) ORDER BY q.public_restaurant_id
                """,
                (QUALITY_RESEARCH_VERSION,),
            ).fetchall()
        ]
    return (
        [row for row in rows if row["status"] == "complete"],
        [row for row in rows if row["status"] != "complete"],
    )


def _canonical_rows(db_path: str | Path) -> tuple[list[dict[str, Any]], bool]:
    with readonly_sqlite_snapshot(db_path) as connection:
        quality_table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='quality_v4_research_runs'"
        ).fetchone() is not None
        rows = [
            dict(row)
            for row in connection.execute(
                """
                SELECT p.*, r.quality_score AS base_quality_score,
                       r.underexposure_score, r.digital_footprint_score,
                       rr.id AS source_research_run_id, rr.structured_research_json
                FROM public_restaurants p
                LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
                LEFT JOIN restaurant_research_runs rr ON rr.id=(
                    SELECT current.id FROM restaurant_research_runs current
                    WHERE current.public_restaurant_id=p.place_id AND current.is_current=1
                    ORDER BY current.id DESC LIMIT 1
                ) ORDER BY p.place_id
                """
            ).fetchall()
        ]
    return rows, quality_table


def _existing_imports(db_path: str | Path, table_exists: bool) -> dict[str, dict[str, Any]]:
    if not table_exists:
        return {}
    with readonly_sqlite_snapshot(db_path) as connection:
        return {
            row["public_restaurant_id"]: dict(row)
            for row in connection.execute(
                """
                SELECT q.* FROM quality_v4_research_runs q
                WHERE q.quality_research_version=? AND q.status='complete' AND q.id=(
                    SELECT q2.id FROM quality_v4_research_runs q2
                    WHERE q2.public_restaurant_id=q.public_restaurant_id
                      AND q2.quality_research_version=q.quality_research_version
                    ORDER BY q2.id DESC LIMIT 1
                )
                """,
                (QUALITY_RESEARCH_VERSION,),
            ).fetchall()
        }


def _same_number(left: object, right: object) -> bool:
    return abs(float(left) - float(right)) <= 1e-9


def _research_copy_matches(source: dict[str, Any], imported: dict[str, Any]) -> bool:
    return all(source[column] == imported[column] for column in QUALITY_COLUMNS)


def _visibility_snapshot(rows: list[dict[str, Any]]) -> dict[str, tuple[object, ...]]:
    return {
        str(row["place_id"]): tuple(row.get(field) for field in VISIBILITY_FIELDS)
        for row in rows
    }


def _stable_fingerprint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def inspect_quality_v4_promotion(
    db_path: str | Path,
    *,
    source_db: str | Path,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    complete, incomplete = _latest_source_rows(source_db)
    canonical_rows, quality_table = _canonical_rows(db_path)
    canonical = {str(row["place_id"]): row for row in canonical_rows}
    if len(canonical) != len(canonical_rows):
        raise ValueError("duplicate canonical place IDs")
    source_ids = [str(row["public_restaurant_id"]) for row in complete + incomplete]
    duplicate_source_ids = sorted({item for item in source_ids if source_ids.count(item) > 1})
    if duplicate_source_ids:
        raise ValueError(f"duplicate source place IDs: {duplicate_source_ids[:5]}")
    missing = sorted(item for item in source_ids if item not in canonical)
    if missing:
        raise ValueError(f"source place IDs missing from canonical database: {missing[:5]}")
    existing = _existing_imports(db_path, quality_table)
    plans: list[dict[str, Any]] = []
    mismatches: list[dict[str, object]] = []
    directional_violations: list[str] = []
    for source in complete:
        place_id = str(source["public_restaurant_id"])
        row = canonical[place_id]
        if source["quality_research_version"] != QUALITY_RESEARCH_VERSION:
            raise ValueError(f"unexpected research version for {place_id}")
        if source["quality_case_strength_version"] != QUALITY_CASE_STRENGTH_VERSION:
            raise ValueError(f"unexpected case-strength version for {place_id}")
        if source["score_version"] != QUALITY_SCORE_VERSION:
            raise ValueError(f"unexpected shadow score version for {place_id}")
        if float(source["adjustment_guardrail"]) != DEFAULT_ADJUSTMENT_GUARDRAIL:
            raise ValueError(f"unexpected adjustment guardrail for {place_id}")
        if row["base_quality_score"] is None:
            raise ValueError(f"canonical base Quality is missing for {place_id}")
        research = ChallengeResearchResult.model_validate(_json(source["research_result_json"], {}))
        evidence = FiyuEvidence(**_json(row["evidence_json"], {}))
        internal = InternalSignals(
            quality_score=float(row["base_quality_score"]),
            underexposure_score=float(row["underexposure_score"] or 0),
            digital_footprint_score=float(row["digital_footprint_score"] or 0),
        )
        shadow = calculate_quality_v4_shadow(
            research.observations,
            evidence=evidence,
            internal=internal,
            structured_research=_json(row["structured_research_json"], {}),
            primary_category=row["primary_category"],
        )
        comparisons = {
            "base_quality_prior": shadow.quality.base_quality_prior,
            "positive_case_strength": shadow.quality.positive_case_strength,
            "negative_case_strength": shadow.quality.negative_case_strength,
            "evidence_balance": shadow.quality.evidence_balance,
            "raw_quality_adjustment": shadow.quality.raw_quality_adjustment,
            "guarded_quality_adjustment": shadow.quality.guarded_quality_adjustment,
            "researched_quality": shadow.quality.researched_quality,
            "production_v3_score": shadow.production_v3.fiyu_score,
            "shadow_v4_score": shadow.shadow_fiyu_score,
        }
        different = {
            field: {"source": source[field], "recomputed": value}
            for field, value in comparisons.items()
            if not _same_number(source[field], value)
        }
        if different:
            mismatches.append({"place_id": place_id, "fields": different})
            continue
        adjustment = float(source["guarded_quality_adjustment"])
        delta = float(source["shadow_v4_score"]) - float(source["production_v3_score"])
        if (adjustment == 0 and abs(delta) > 1e-9) or (
            adjustment > 0 and delta < -1e-9
        ) or (adjustment < 0 and delta > 1e-9):
            directional_violations.append(place_id)
        imported = existing.get(place_id)
        if imported and not _research_copy_matches(source, imported):
            raise ValueError(f"conflicting imported Quality-v4 evidence for {place_id}")
        production = replace(
            shadow.shadow_v4,
            score_version=QUALITY_PRODUCTION_SCORE_VERSION,
        )
        if row["score_version"] == QUALITY_PRODUCTION_SCORE_VERSION and not _same_number(
            row["fiyu_score"], production.fiyu_score
        ):
            raise ValueError(f"conflicting current production-v4 score for {place_id}")
        plans.append(
            {
                "place_id": place_id,
                "source": source,
                "canonical": row,
                "shadow": shadow,
                "production": production,
                "import_needed": imported is None,
                "score_needed": row["score_version"] != QUALITY_PRODUCTION_SCORE_VERSION,
            }
        )
    if mismatches:
        raise ValueError(f"shadow/production recomputation mismatch: {mismatches[:3]}")
    if directional_violations:
        raise ValueError(f"directional score violations: {directional_violations[:5]}")
    failed_rows = [
        {
            "place_id": row["public_restaurant_id"],
            "restaurant": canonical[str(row["public_restaurant_id"])].get("name_en")
            or canonical[str(row["public_restaurant_id"])].get("name_ja"),
            "current_score": canonical[str(row["public_restaurant_id"])].get("fiyu_score"),
            "current_score_version": canonical[str(row["public_restaurant_id"])].get(
                "score_version"
            ),
            "is_published": bool(
                canonical[str(row["public_restaurant_id"])].get("is_published")
            ),
            "product_eligible": bool(
                canonical[str(row["public_restaurant_id"])].get("product_eligible")
            ),
            "review_status": canonical[str(row["public_restaurant_id"])].get(
                "review_status"
            ),
            "status": row["status"],
            "error_category": row["error_category"],
            "error": row["error"],
        }
        for row in incomplete
    ]
    before_scores = [float(plan["canonical"]["fiyu_score"]) for plan in plans]
    canonical_v3_scores = [float(plan["shadow"].production_v3.fiyu_score) for plan in plans]
    after_scores = [float(plan["production"].fiyu_score) for plan in plans]
    adjustments = [float(plan["source"]["guarded_quality_adjustment"]) for plan in plans]
    stored_pointer_deltas = [
        after - before for before, after in zip(before_scores, after_scores, strict=True)
    ]
    shadow_deltas = [
        after - before
        for before, after in zip(canonical_v3_scores, after_scores, strict=True)
    ]
    summary = {
        "dry_run": True,
        "source_complete_v4_rows": len(complete),
        "source_incomplete_rows": len(incomplete),
        "source_failed_rows": sum(row["status"] == "failed" for row in incomplete),
        "matched_canonical_identities": len(source_ids),
        "missing_canonical_identities": 0,
        "duplicate_or_conflicting_identities": 0,
        "already_v4_rows": sum(not plan["score_needed"] for plan in plans),
        "rows_to_import": sum(plan["import_needed"] for plan in plans),
        "rows_to_score": sum(plan["score_needed"] for plan in plans),
        "expected_score_version_changes": sum(plan["score_needed"] for plan in plans),
        "expected_publication_state_changes": 0,
        "production_score_version": QUALITY_PRODUCTION_SCORE_VERSION,
        "source_shadow_score_version": QUALITY_SCORE_VERSION,
        "publication_score_threshold": PUBLICATION_SCORE_THRESHOLD,
        "failed_or_incomplete_rows": failed_rows,
        "stored_v3_pointer_distribution_before": _distribution(before_scores),
        "canonical_v3_distribution": _distribution(canonical_v3_scores),
        "v4_score_distribution_after": _distribution(after_scores),
        "stored_pointer_to_v4_delta_distribution": _distribution(stored_pointer_deltas),
        "shadow_v4_delta_distribution": _distribution(shadow_deltas),
        "documented_stored_v3_pointer_mismatches": sum(
            not _same_number(stored, canonical)
            for stored, canonical in zip(before_scores, canonical_v3_scores, strict=True)
        ),
        "stored_pointer_decreases": sum(delta < -1e-9 for delta in stored_pointer_deltas),
        "positive_adjustment_stored_pointer_decreases": sum(
            adjustment > 0 and delta < -1e-9
            for adjustment, delta in zip(adjustments, stored_pointer_deltas, strict=True)
        ),
        "zero_adjustment_stored_pointer_differences": sum(
            adjustment == 0 and abs(delta) > 1e-9
            for adjustment, delta in zip(adjustments, stored_pointer_deltas, strict=True)
        ),
        "quality_adjustment_distribution": _distribution(adjustments),
        "quality_adjustment_bands": {
            label: sum(contains(value) for value in adjustments)
            for label, contains in ADJUSTMENT_BANDS
        },
        "large_adjustments_ge_8": sum(abs(value) >= 8 for value in adjustments),
        "large_adjustments_ge_12": sum(abs(value) >= 12 for value in adjustments),
        "large_adjustment_rows": [
            {
                "place_id": plan["place_id"],
                "restaurant": plan["canonical"].get("name_en")
                or plan["canonical"].get("name_ja"),
                "adjustment": plan["source"]["guarded_quality_adjustment"],
                "production_v4_score": plan["production"].fiyu_score,
            }
            for plan in plans
            if abs(float(plan["source"]["guarded_quality_adjustment"])) >= 8
        ],
        "guardrail_interventions": sum(
            not _same_number(
                plan["source"]["raw_quality_adjustment"],
                plan["source"]["guarded_quality_adjustment"],
            )
            for plan in plans
        ),
        "shadow_production_exact_matches": len(plans),
        "shadow_production_mismatches": 0,
        "maximum_shadow_production_mismatch": 0.0,
        "directional_violations": 0,
        "total_canonical_restaurants": len(canonical_rows),
        "visibility_snapshot": _visibility_snapshot(canonical_rows),
    }
    return summary, plans


def _create_backup(db_path: Path, backup_path: Path) -> tuple[str, str]:
    if backup_path.exists():
        raise FileExistsError(f"backup already exists: {backup_path}")
    if _integrity(db_path) != "ok":
        raise ValueError("canonical database integrity check failed before backup")
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(db_path, backup_path)
    source_sha = _sha256(db_path)
    backup_sha = _sha256(backup_path)
    if source_sha != backup_sha:
        raise ValueError("backup SHA does not match canonical pre-migration SHA")
    if _integrity(backup_path) != "ok":
        raise ValueError("backup database integrity check failed")
    return source_sha, backup_sha


def _insert_score_history(
    connection,
    *,
    place_id: str,
    source_research_run_id: int | None,
    score_version: str,
    fingerprint: str,
    score_json: dict[str, Any],
    now: str,
) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO score_calculation_runs (
            public_restaurant_id, source_research_run_id, score_version,
            evidence_fingerprint, score_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            place_id,
            source_research_run_id,
            score_version,
            fingerprint,
            json.dumps(score_json, ensure_ascii=False),
            now,
        ),
    )


def _apply_promotion(db_path: Path, plans: list[dict[str, Any]]) -> None:
    ensure_public_schema(db_path)
    now = _utc_now()
    columns = ", ".join(QUALITY_COLUMNS)
    placeholders = ", ".join("?" for _ in QUALITY_COLUMNS)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        for plan in plans:
            place_id = plan["place_id"]
            source = plan["source"]
            row = plan["canonical"]
            if plan["import_needed"]:
                connection.execute(
                    f"INSERT INTO quality_v4_research_runs ({columns}) VALUES ({placeholders})",
                    tuple(source[column] for column in QUALITY_COLUMNS),
                )
            if not plan["score_needed"]:
                continue
            pre_snapshot = {
                "snapshot_type": "pre-quality-v4-production-promotion",
                "place_id": place_id,
                **{field: row.get(field) for field in CURRENT_SCORE_FIELDS},
            }
            _insert_score_history(
                connection,
                place_id=place_id,
                source_research_run_id=row.get("source_research_run_id"),
                score_version=str(row.get("score_version") or "unversioned"),
                fingerprint=_stable_fingerprint(pre_snapshot),
                score_json=pre_snapshot,
                now=now,
            )
            score = plan["production"]
            quality = plan["shadow"].quality
            score_payload = score.to_dict()
            score_payload["quality_v4"] = {
                "quality_research_version": source["quality_research_version"],
                "quality_case_strength_version": source["quality_case_strength_version"],
                "source_shadow_score_version": source["score_version"],
                "base_quality_prior": quality.base_quality_prior,
                "positive_case_strength": quality.positive_case_strength,
                "negative_case_strength": quality.negative_case_strength,
                "evidence_balance": quality.evidence_balance,
                "raw_quality_adjustment": quality.raw_quality_adjustment,
                "guarded_quality_adjustment": quality.guarded_quality_adjustment,
                "researched_quality": quality.researched_quality,
                "source_response_id": source["response_id"],
            }
            _insert_score_history(
                connection,
                place_id=place_id,
                source_research_run_id=row.get("source_research_run_id"),
                score_version=QUALITY_PRODUCTION_SCORE_VERSION,
                fingerprint=_stable_fingerprint(score_payload),
                score_json=score_payload,
                now=now,
            )
            connection.execute(
                """
                UPDATE public_restaurants SET
                    local_signal=?, hiddenness_signal=?, quality_signal=?,
                    independence_signal=?, local_discovery_score=?,
                    local_discovery_classification=?, local_discovery_components_json=?,
                    local_discovery_contribution=?, tourist_visibility_classification=?,
                    tourist_orientation=?, tourist_orientation_basis=?, fiyu_score=?,
                    fiyu_confidence=?, confidence_band=?, score_band=?, score_version=?,
                    updated_at=? WHERE place_id=?
                """,
                (
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
                    QUALITY_PRODUCTION_SCORE_VERSION,
                    now,
                    place_id,
                ),
            )
        connection.commit()


def _representative_rows(plans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    bands = (
        ("zero", lambda value: value == 0),
        ("+1_to_+3", lambda value: 1 <= value < 3),
        ("+3_to_+5", lambda value: 3 <= value < 5),
        ("+5_to_+8", lambda value: 5 <= value < 8),
        (">=+8", lambda value: value >= 8),
    )
    samples: list[dict[str, Any]] = []
    for label, contains in bands:
        plan = next(
            (
                item
                for item in plans
                if contains(float(item["source"]["guarded_quality_adjustment"]))
            ),
            None,
        )
        if plan is None:
            continue
        row = plan["canonical"]
        source = plan["source"]
        samples.append(
            {
                "sample": label,
                "place_id": plan["place_id"],
                "restaurant": row.get("name_en") or row.get("name_ja"),
                "previous_v3_score": row.get("fiyu_score"),
                "base_quality": source["base_quality_prior"],
                "quality_adjustment": source["guarded_quality_adjustment"],
                "researched_quality": source["researched_quality"],
                "production_v4_score": plan["production"].fiyu_score,
                "score_version": QUALITY_PRODUCTION_SCORE_VERSION,
                "is_published_before_after": [bool(row.get("is_published"))] * 2,
                "product_eligible_before_after": [bool(row.get("product_eligible"))] * 2,
            }
        )
    unpublished = next(
        (item for item in plans if not bool(item["canonical"].get("is_published"))),
        None,
    )
    if unpublished and all(item["place_id"] != unpublished["place_id"] for item in samples):
        row = unpublished["canonical"]
        source = unpublished["source"]
        samples.append(
            {
                "sample": "unpublished",
                "place_id": unpublished["place_id"],
                "restaurant": row.get("name_en") or row.get("name_ja"),
                "previous_v3_score": row.get("fiyu_score"),
                "base_quality": source["base_quality_prior"],
                "quality_adjustment": source["guarded_quality_adjustment"],
                "researched_quality": source["researched_quality"],
                "production_v4_score": unpublished["production"].fiyu_score,
                "score_version": QUALITY_PRODUCTION_SCORE_VERSION,
                "is_published_before_after": [False, False],
                "product_eligible_before_after": [
                    bool(row.get("product_eligible")),
                    bool(row.get("product_eligible")),
                ],
            }
        )
    return samples


def _write_report(path: Path, summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Quality-v4 production promotion",
        "",
        "This migration changes current score values/version only. Publication and catalog membership are frozen.",
        "",
        "```json",
        json.dumps(summary, ensure_ascii=False, indent=2),
        "```",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def run_quality_v4_promotion(
    db_path: str | Path,
    *,
    source_db: str | Path,
    dry_run: bool = False,
    backup_path: str | Path | None = None,
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
) -> dict[str, Any]:
    db = Path(db_path)
    source = Path(source_db)
    canonical_sha_before = _sha256(db)
    source_sha_before = _sha256(source)
    threshold_before = PUBLICATION_SCORE_THRESHOLD
    summary, plans = inspect_quality_v4_promotion(db, source_db=source)
    visibility_before = summary.pop("visibility_snapshot")
    summary.update(
        {
            "dry_run": dry_run,
            "canonical_sha256_before": canonical_sha_before,
            "source_shadow_sha256": source_sha_before,
            "canonical_integrity_before": _integrity(db),
            "external_requests": 0,
            "representative_rows": _representative_rows(plans),
        }
    )
    changing = bool(summary["rows_to_import"] or summary["rows_to_score"])
    if dry_run:
        summary["canonical_sha256_after"] = _sha256(db)
        summary["canonical_unchanged"] = summary["canonical_sha256_after"] == canonical_sha_before
    else:
        if changing:
            if backup_path is None:
                raise ValueError("--backup-out is required for a mutating promotion")
            backup = Path(backup_path)
            pre_sha, backup_sha = _create_backup(db, backup)
            summary.update(
                {
                    "backup_path": str(backup),
                    "backup_sha256": backup_sha,
                    "backup_matches_pre_migration": backup_sha == pre_sha,
                }
            )
            _apply_promotion(db, plans)
        canonical_after, _ = _canonical_rows(db)
        visibility_after = _visibility_snapshot(canonical_after)
        visibility_changes = [
            place_id
            for place_id, before in visibility_before.items()
            if visibility_after.get(place_id) != before
        ]
        if visibility_changes:
            raise RuntimeError(f"publication state changed: {visibility_changes[:5]}")
        if PUBLICATION_SCORE_THRESHOLD != threshold_before:
            raise RuntimeError("publication threshold changed")
        rerun, _ = inspect_quality_v4_promotion(db, source_db=source)
        if rerun["rows_to_import"] or rerun["rows_to_score"]:
            raise RuntimeError("promotion did not become idempotent")
        with readonly_sqlite_snapshot(db) as connection:
            version_counts = {
                str(row["score_version"]): int(row["n"])
                for row in connection.execute(
                    "SELECT COALESCE(score_version, 'NULL') score_version, COUNT(*) n "
                    "FROM public_restaurants GROUP BY score_version"
                )
            }
            imported_count = connection.execute(
                "SELECT COUNT(*) FROM quality_v4_research_runs "
                "WHERE quality_research_version=? AND status='complete'",
                (QUALITY_RESEARCH_VERSION,),
            ).fetchone()[0]
            duplicate_v4_history = connection.execute(
                """
                SELECT COUNT(*) FROM (
                    SELECT public_restaurant_id FROM score_calculation_runs
                    WHERE score_version=? GROUP BY public_restaurant_id HAVING COUNT(*)>1
                )
                """,
                (QUALITY_PRODUCTION_SCORE_VERSION,),
            ).fetchone()[0]
        summary.update(
            {
                "dry_run": False,
                "v4_research_records_imported": int(imported_count),
                "production_score_version_counts": version_counts,
                "current_production_v4_rows": version_counts.get(
                    QUALITY_PRODUCTION_SCORE_VERSION, 0
                ),
                "rows_remaining_non_v4": len(canonical_after)
                - version_counts.get(QUALITY_PRODUCTION_SCORE_VERSION, 0),
                "duplicate_production_v4_history_rows": int(duplicate_v4_history),
                "is_published_changes": 0,
                "product_eligible_changes": 0,
                "review_status_changes": 0,
                "total_visibility_state_changes": 0,
                "threshold_changes": 0,
                "idempotency_rows_to_import": rerun["rows_to_import"],
                "idempotency_rows_to_score": rerun["rows_to_score"],
                "canonical_integrity_after": _integrity(db),
                "canonical_sha256_after": _sha256(db),
                "source_shadow_unchanged": _sha256(source) == source_sha_before,
            }
        )
    if summary_path:
        output = Path(summary_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    if report_path:
        _write_report(Path(report_path), summary)
    return summary


def compact_promotion_summary(result: dict[str, Any]) -> str:
    lines = [
        f"Source complete v4 rows: {result['source_complete_v4_rows']}",
        f"Source failed/incomplete rows: {result['source_incomplete_rows']}",
        f"Matched canonical identities: {result['matched_canonical_identities']}",
        f"Rows to import: {result['rows_to_import']}",
        f"Rows to score: {result['rows_to_score']}",
        f"Already v4: {result['already_v4_rows']}",
        f"Publication-state changes: {result['expected_publication_state_changes']}",
        f"Shadow parity matches: {result['shadow_production_exact_matches']}",
        f"Shadow parity mismatches: {result['shadow_production_mismatches']}",
    ]
    if not result["dry_run"]:
        lines.extend(
            (
                f"Imported v4 research rows: {result['v4_research_records_imported']}",
                f"Current production v4 rows: {result['current_production_v4_rows']}",
                f"SQLite integrity: {result['canonical_integrity_after']}",
                f"Backup: {result.get('backup_path', 'not required')}",
            )
        )
    return "\n".join(lines)
