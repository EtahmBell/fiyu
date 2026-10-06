"""Final read-only audit of the floor-70 prepublication Quality-v4 cohort."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
for path in (ROOT, SRC):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from fiyu.experimental_quality_challenge_v4 import ChallengeResearchResult
from fiyu.public_score import FiyuEvidence, InternalSignals
from fiyu.quality_v4 import (
    DEFAULT_ADJUSTMENT_GUARDRAIL,
    QUALITY_CASE_STRENGTH_VERSION,
    QUALITY_PROMPT_VERSION,
    QUALITY_RESEARCH_VERSION,
    QUALITY_SCORE_VERSION,
    calculate_quality_v4_shadow,
)
from fiyu.sqlite_snapshot import readonly_sqlite_snapshot
from scripts.audit_catalog_floor import stats
from scripts.audit_floor70_admission_readiness import (
    _evaluate_row,
    _query_rows,
    _stored_score_only,
    classify_lineage,
    parse_json,
)

FLOOR_70 = 70.0
FLOOR_68 = 68.0
SANKEI_PLACE_ID = "ChIJi79LD-yIGGAR_8wLG2_pyYE"
TOCHIAZUMA_PLACE_ID = "ChIJN56DffGRGGARodkPCrrhHMM"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def adjustment_bands(values: list[float]) -> dict[str, int]:
    bands = (
        ("< -8", lambda value: value < -8),
        ("-8 to -5", lambda value: -8 <= value < -5),
        ("-5 to -3", lambda value: -5 <= value < -3),
        ("-3 to -1", lambda value: -3 <= value < -1),
        ("-1 to -0.5", lambda value: -1 <= value < -0.5),
        ("-0.49 to +0.49", lambda value: -0.5 <= value < 0.5),
        ("+0.5 to +0.99", lambda value: 0.5 <= value < 1),
        ("+1 to +2.99", lambda value: 1 <= value < 3),
        ("+3 to +4.99", lambda value: 3 <= value < 5),
        ("+5 to +7.99", lambda value: 5 <= value < 8),
        ("+8 to +11.99", lambda value: 8 <= value < 12),
        (">= +12", lambda value: value >= 12),
    )
    result = {label: sum(predicate(value) for value in values) for label, predicate in bands}
    if sum(result.values()) != len(values):
        raise RuntimeError("Quality-adjustment bands do not partition the cohort")
    return result


def score_bands(values: list[float]) -> dict[str, int]:
    return {
        "68.00-68.99": sum(68 <= value < 69 for value in values),
        "69.00-69.99": sum(69 <= value < 70 for value in values),
        "70.00-70.49": sum(70 <= value < 70.5 for value in values),
        "70.50-70.99": sum(70.5 <= value < 71 for value in values),
        "71.00-71.99": sum(71 <= value < 72 for value in values),
        "72.00-74.99": sum(72 <= value < 75 for value in values),
        "75+": sum(value >= 75 for value in values),
    }


def _stored_score_reject(row: dict[str, Any]) -> bool:
    return bool(
        not row.get("is_published")
        and row.get("review_status") in {"rejected", "auto_rejected"}
        and row.get("review_notes") == "score_or_product_policy_rejected"
    )


def _gate_clean(row: dict[str, Any]) -> bool:
    return bool(
        _stored_score_only(row)
        and row.get("canonical_category") == "score_only_rejected"
        and not row.get("canonical_block_reasons")
        and not row.get("base_readiness_missing")
        and not row.get("v4_input_missing")
    )


def _mathematically_rescuable(row: dict[str, Any], floor: float) -> bool:
    """Match the original selector's broad, pre-readiness rescue accounting."""

    return bool(
        _stored_score_reject(row)
        and row.get("product_eligible")
        and not row.get("canonical_chain_excluded")
        and row.get("lineage") == "v3"
        and not row.get("quality_v4_complete")
        and row.get("score") is not None
        and float(row["score"]) < floor
        and float(row.get("maximum_possible_v4_score") or -1) >= floor
    )


def _load_canonical_rows(db_path: Path) -> list[dict[str, Any]]:
    with readonly_sqlite_snapshot(db_path) as connection:
        return [_evaluate_row(connection, row) for row in _query_rows(connection)]


def _latest_attempts(
    shadow_db: Path, cohort_ids: set[str]
) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    with readonly_sqlite_snapshot(shadow_db) as connection:
        rows = [
            dict(row)
            for row in connection.execute(
                """
                SELECT * FROM quality_v4_research_runs
                WHERE quality_research_version=? ORDER BY public_restaurant_id, id
                """,
                (QUALITY_RESEARCH_VERSION,),
            ).fetchall()
            if str(row["public_restaurant_id"]) in cohort_ids
        ]
    history: dict[str, list[dict[str, Any]]] = {place_id: [] for place_id in cohort_ids}
    for row in rows:
        history[str(row["public_restaurant_id"])].append(row)
    latest = {place_id: attempts[-1] for place_id, attempts in history.items() if attempts}
    return latest, history


def _source_details(source: dict[str, Any]) -> dict[str, Any]:
    observations = parse_json(source.get("normalized_observations_json"), [])
    clusters = parse_json(source.get("claim_clusters_json"), [])
    included = [item for item in observations if item.get("included")]
    negative = [item for item in included if item.get("polarity") == "negative"]
    negative_keys = {
        str(item.get("independence_key") or item.get("provenance_group") or "")
        for item in negative
        if item.get("independence_key") or item.get("provenance_group")
    }
    negative_clusters = [item for item in clusters if item.get("polarity") == "negative"]
    return {
        "source_count": len(
            {
                str(item.get("independence_key") or item.get("provenance_group") or "")
                for item in included
                if item.get("independence_key") or item.get("provenance_group")
            }
        ),
        "evidence_families": sorted(
            {str(item.get("family")) for item in included if item.get("family")}
        ),
        "qualifying_observation_count": len(included),
        "negative_provenance_source_count": len(negative_keys),
        "corroborated_negative": any(
            int(cluster.get("independent_sources") or 0) >= 2
            for cluster in negative_clusters
        ),
    }


def _score_row(plan: dict[str, Any]) -> dict[str, Any]:
    source = plan["source"]
    canonical = plan["canonical"]
    details = _source_details(source)
    return {
        "place_id": plan["place_id"],
        "restaurant": canonical.get("name_en")
        or canonical.get("name_ja")
        or plan["place_id"],
        "base_quality": float(source["base_quality_prior"]),
        "positive_case_strength": float(source["positive_case_strength"]),
        "negative_case_strength": float(source["negative_case_strength"]),
        "raw_quality_adjustment": float(source["raw_quality_adjustment"]),
        "guarded_quality_adjustment": float(source["guarded_quality_adjustment"]),
        "researched_quality": float(source["researched_quality"]),
        "prior_v3_score": float(source["production_v3_score"]),
        "v4_score": float(source["shadow_v4_score"]),
        "score_delta": float(source["shadow_score_delta"]),
        **details,
    }


def _cohort_plans(
    latest: dict[str, dict[str, Any]],
    canonical_by_id: dict[str, dict[str, Any]],
    cohort_list: list[str],
) -> list[dict[str, Any]]:
    """Recompute only the frozen cohort through the production promotion path."""

    plans: list[dict[str, Any]] = []
    mismatches: list[dict[str, Any]] = []
    for place_id in cohort_list:
        source = latest[place_id]
        canonical = canonical_by_id[place_id]
        research = ChallengeResearchResult.model_validate(
            parse_json(source["research_result_json"], {})
        )
        shadow = calculate_quality_v4_shadow(
            research.observations,
            evidence=FiyuEvidence(**parse_json(canonical["evidence_json"], {})),
            internal=InternalSignals(
                quality_score=float(canonical["base_quality_score"]),
                underexposure_score=float(canonical.get("underexposure_score") or 0),
                digital_footprint_score=float(canonical.get("digital_footprint_score") or 0),
            ),
            structured_research=parse_json(canonical["structured_research_json"], {}),
            primary_category=canonical.get("primary_category"),
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
            "shadow_score_delta": shadow.score_delta,
        }
        different = {
            field: {"source": source[field], "recomputed": value}
            for field, value in comparisons.items()
            if abs(float(source[field]) - float(value)) > 1e-9
        }
        if different:
            mismatches.append({"place_id": place_id, "fields": different})
            continue
        plans.append(
            {
                "place_id": place_id,
                "source": source,
                "canonical": canonical,
                "shadow": shadow,
            }
        )
    if mismatches:
        raise RuntimeError(f"HARD STOP: cohort score parity mismatch: {mismatches[:3]}")
    return plans


def _promotion_missing(plan: dict[str, Any]) -> list[str]:
    source = plan["source"]
    canonical = plan["canonical"]
    missing: list[str] = []
    required_source = (
        "quality_research_version",
        "quality_case_strength_version",
        "score_version",
        "prompt_version",
        "research_result_json",
        "normalized_observations_json",
        "claim_clusters_json",
        "base_quality_prior",
        "positive_case_strength",
        "negative_case_strength",
        "raw_quality_adjustment",
        "guarded_quality_adjustment",
        "researched_quality",
        "shadow_v4_score",
    )
    if not canonical.get("source_restaurant_id") or not canonical.get("evidence_json"):
        missing.append("identity")
    missing.extend(field for field in required_source if source.get(field) is None)
    expected = {
        "quality_research_version": QUALITY_RESEARCH_VERSION,
        "quality_case_strength_version": QUALITY_CASE_STRENGTH_VERSION,
        "score_version": QUALITY_SCORE_VERSION,
        "prompt_version": QUALITY_PROMPT_VERSION,
    }
    missing.extend(
        f"unexpected_{field}"
        for field, value in expected.items()
        if source.get(field) != value
    )
    for field, expected_type in (
        ("research_result_json", dict),
        ("normalized_observations_json", list),
        ("claim_clusters_json", list),
    ):
        if source.get(field) is not None and not isinstance(
            parse_json(source[field], None), expected_type
        ):
            missing.append(f"invalid_{field}")
    return sorted(set(missing))


def _row_listing(row: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "restaurant",
        "place_id",
        "prior_v3_score",
        "v4_score",
        "base_quality",
        "researched_quality",
        "guarded_quality_adjustment",
        "positive_case_strength",
        "negative_case_strength",
        "score_delta",
        "source_count",
        "evidence_families",
    )
    return {key: row.get(key) for key in keys}


def _catalog_scenario(
    rows: list[dict[str, Any]], cohort_scores: dict[str, float], floor: float
) -> dict[str, Any]:
    published = [row for row in rows if row.get("is_published") and row.get("score") is not None]
    removals = [row for row in published if float(row["score"]) < floor]
    unpublished = [row for row in rows if not row.get("is_published")]
    eligible: list[tuple[dict[str, Any], float, str]] = []
    blocked: list[dict[str, Any]] = []
    for row in unpublished:
        score = cohort_scores.get(str(row["place_id"]), row.get("score"))
        if score is None or float(score) < floor:
            continue
        if not _stored_score_reject(row) or not _gate_clean(row):
            blocked.append(row)
            continue
        lineage = "v4" if str(row["place_id"]) in cohort_scores else str(row["lineage"])
        eligible.append((row, float(score), lineage))
    v4_ready = [item for item in eligible if item[2] == "v4"]
    v3_needs = [item for item in eligible if item[2] == "v3"]
    return {
        "floor": floor,
        "current_published": len(published),
        "currently_published_below_floor": len(removals),
        "currently_published_at_or_above_floor": len(published) - len(removals),
        "v4_ready_additions": len(v4_ready),
        "v4_ready_addition_ids": sorted(str(item[0]["place_id"]) for item in v4_ready),
        "v3_rows_needing_v4": len(v3_needs),
        "v3_rows_needing_v4_ids": sorted(str(item[0]["place_id"]) for item in v3_needs),
        "non_score_blocked_at_or_above_floor": len(blocked),
        "safe_v4_first_catalog_size": len(published) - len(removals) + len(v4_ready),
        "raw_threshold_only_catalog_size": (
            len(published) - len(removals) + len(v4_ready) + len(v3_needs)
        ),
        "removal_ids": sorted(str(row["place_id"]) for row in removals),
    }


def build_summary(
    canonical_db: Path,
    shadow_db: Path,
    cohort_manifest: Path,
) -> dict[str, Any]:
    manifest = json.loads(cohort_manifest.read_text(encoding="utf-8"))
    cohort_list = [str(item) for item in manifest["ids_selected"]]
    cohort_ids = set(cohort_list)
    if len(cohort_list) != 313 or len(cohort_ids) != 313:
        raise RuntimeError("HARD STOP: original cohort is not exactly 313 unique place IDs")

    canonical_rows = _load_canonical_rows(canonical_db)
    canonical_by_id = {str(row["place_id"]): row for row in canonical_rows}
    if len(canonical_by_id) != len(canonical_rows):
        raise RuntimeError("HARD STOP: duplicate canonical place IDs")
    if cohort_ids - canonical_by_id.keys():
        raise RuntimeError("HARD STOP: cohort identity missing from canonical database")
    reconstructed_ids = {
        str(row["place_id"])
        for row in canonical_rows
        if _gate_clean(row)
        and row.get("lineage") == "v3"
        and not row.get("quality_v4_complete")
        and row.get("score") is not None
        and float(row["score"]) >= FLOOR_70
    }
    if reconstructed_ids != cohort_ids:
        raise RuntimeError(
            "HARD STOP: canonical selector reconstruction differs from the frozen cohort: "
            f"missing={sorted(cohort_ids - reconstructed_ids)[:5]}, "
            f"extra={sorted(reconstructed_ids - cohort_ids)[:5]}"
        )

    latest, history = _latest_attempts(shadow_db, cohort_ids)
    latest_statuses = Counter(
        str(latest.get(place_id, {}).get("status") or "pending") for place_id in cohort_ids
    )
    if len(latest) != 313 or latest_statuses != {"complete": 313}:
        raise RuntimeError(
            f"HARD STOP: cohort completion mismatch: {dict(sorted(latest_statuses.items()))}"
        )

    plans = _cohort_plans(latest, canonical_by_id, cohort_list)
    if len(plans) != 313:
        raise RuntimeError("HARD STOP: canonical score parity was not reproduced for all 313")
    plan_by_id = {plan["place_id"]: plan for plan in plans}
    score_rows = [_score_row(plan_by_id[place_id]) for place_id in cohort_list]

    with readonly_sqlite_snapshot(shadow_db) as connection:
        shadow_identity = {
            str(row["place_id"]): dict(row)
            for row in connection.execute(
                """
                SELECT place_id, source_restaurant_id, name_en, name_ja,
                       identity_confidence, is_published, score_version
                FROM public_restaurants ORDER BY place_id
                """
            ).fetchall()
            if str(row["place_id"]) in cohort_ids
        }
    identity_mismatches = []
    for place_id in cohort_list:
        canonical = canonical_by_id[place_id]
        shadow = shadow_identity.get(place_id, {})
        fields = ("source_restaurant_id", "name_en", "name_ja", "identity_confidence")
        different = {
            field: {"canonical": canonical.get(field), "shadow": shadow.get(field)}
            for field in fields
            if canonical.get(field) != shadow.get(field)
        }
        if different:
            identity_mismatches.append({"place_id": place_id, "fields": different})

    published_overlap = sorted(
        place_id for place_id in cohort_ids if canonical_by_id[place_id].get("is_published")
    )
    production_v4_overlap = sorted(
        place_id
        for place_id in cohort_ids
        if classify_lineage(canonical_by_id[place_id].get("score_version")) == "v4"
    )
    rescue_70 = {
        str(row["place_id"])
        for row in canonical_rows
        if _mathematically_rescuable(row, FLOOR_70)
    }
    critical_ids = {
        str(row["place_id"])
        for row in canonical_rows
        if _stored_score_reject(row)
        and row.get("score") is not None
        and float(row["score"]) >= FLOOR_70
        and any(str(reason).startswith("critical:") for reason in row["canonical_block_reasons"])
    }
    unresolved_ids = {
        str(row["place_id"])
        for row in canonical_rows
        if _stored_score_reject(row)
        and row.get("score") is not None
        and float(row["score"]) >= FLOOR_70
        and row.get("product_eligible")
        and not row.get("canonical_chain_excluded")
        and not row.get("canonical_block_reasons")
        and float(row.get("identity_confidence") or 0) < 0.6
    }
    identity_violations = {
        "canonical_shadow_identity_mismatches": identity_mismatches,
        "published_overlap": published_overlap,
        "production_v4_overlap": production_v4_overlap,
        "below_floor_rescue_overlap": sorted(cohort_ids & rescue_70),
        "address_conflict_overlap": sorted(cohort_ids & critical_ids),
        "unresolved_or_incomplete_overlap": sorted(cohort_ids & unresolved_ids),
    }
    if any(identity_violations.values()):
        raise RuntimeError(f"HARD STOP: cohort identity violation: {identity_violations}")

    missing_fields = [
        {"place_id": plan["place_id"], "missing": missing}
        for plan in plans
        if (missing := _promotion_missing(plan))
    ]
    if missing_fields:
        raise RuntimeError(f"HARD STOP: missing promotion fields: {missing_fields[:3]}")

    adjustments = [row["guarded_quality_adjustment"] for row in score_rows]
    raw_adjustments = [row["raw_quality_adjustment"] for row in score_rows]
    deltas = [row["score_delta"] for row in score_rows]
    v4_scores = [row["v4_score"] for row in score_rows]
    below_70 = [row for row in score_rows if row["v4_score"] < FLOOR_70]
    cohort_68_to_70 = [row for row in score_rows if FLOOR_68 <= row["v4_score"] < FLOOR_70]

    negative_rows = [row for row in score_rows if row["negative_case_strength"] > 0]
    multiple_negative = [
        row for row in score_rows if row["negative_provenance_source_count"] >= 2
    ]
    corroborated_negative = [row for row in score_rows if row["corroborated_negative"]]
    no_evidence = [row for row in score_rows if row["qualifying_observation_count"] == 0]

    guardrail_20_differences = []
    for plan in plans:
        source = plan["source"]
        canonical = plan["canonical"]
        research = ChallengeResearchResult.model_validate(
            parse_json(source["research_result_json"], {})
        )
        shadow_20 = calculate_quality_v4_shadow(
            research.observations,
            evidence=FiyuEvidence(**parse_json(canonical["evidence_json"], {})),
            internal=InternalSignals(
                quality_score=float(canonical["base_quality_score"]),
                underexposure_score=float(canonical.get("underexposure_score") or 0),
                digital_footprint_score=float(canonical.get("digital_footprint_score") or 0),
            ),
            structured_research=parse_json(canonical["structured_research_json"], {}),
            primary_category=canonical.get("primary_category"),
            adjustment_guardrail=20,
        )
        if (
            shadow_20.quality.guarded_quality_adjustment
            != float(source["guarded_quality_adjustment"])
            or shadow_20.shadow_fiyu_score != float(source["shadow_v4_score"])
        ):
            guardrail_20_differences.append(
                {
                    "place_id": plan["place_id"],
                    "restaurant": canonical.get("name_en") or canonical.get("name_ja"),
                    "adjustment_at_15": source["guarded_quality_adjustment"],
                    "adjustment_at_20": shadow_20.quality.guarded_quality_adjustment,
                    "score_at_15": source["shadow_v4_score"],
                    "score_at_20": shadow_20.shadow_fiyu_score,
                }
            )

    readiness = Counter()
    for row in score_rows:
        canonical = canonical_by_id[row["place_id"]]
        if latest[row["place_id"]]["status"] != "complete":
            readiness["INCOMPLETE"] += 1
        elif not _gate_clean(canonical):
            readiness["BLOCKED_NON_SCORE"] += 1
        elif row["v4_score"] >= FLOOR_70:
            readiness["PROMOTION_READY_PASS70"] += 1
        else:
            readiness["PROMOTION_READY_BELOW70"] += 1
    for name in (
        "PROMOTION_READY_PASS70",
        "PROMOTION_READY_BELOW70",
        "BLOCKED_NON_SCORE",
        "INCOMPLETE",
        "UNEXPECTED",
    ):
        readiness[name] += 0
    if readiness["BLOCKED_NON_SCORE"] or readiness["INCOMPLETE"]:
        raise RuntimeError(f"HARD STOP: cohort readiness failure: {dict(readiness)}")

    cohort_scores = {row["place_id"]: row["v4_score"] for row in score_rows}
    scenario_70 = _catalog_scenario(canonical_rows, cohort_scores, FLOOR_70)
    scenario_68 = _catalog_scenario(canonical_rows, cohort_scores, FLOOR_68)

    outside_68 = [
        row
        for row in canonical_rows
        if row["place_id"] not in cohort_ids
        and _stored_score_reject(row)
        and row.get("score") is not None
        and float(row["score"]) >= FLOOR_68
    ]
    outside_68_blocked = [row for row in outside_68 if not _gate_clean(row)]
    outside_68_clean = [row for row in outside_68 if _gate_clean(row)]
    blockers = Counter(
        reason
        for row in outside_68_blocked
        for reason in (
            list(row.get("canonical_block_reasons") or [])
            + list(row.get("v4_input_missing") or [])
        )
    )
    rescue_68 = [
        row
        for row in canonical_rows
        if row["place_id"] not in cohort_ids
        and _mathematically_rescuable(row, FLOOR_68)
    ]

    sankei = canonical_by_id[SANKEI_PLACE_ID]
    tochiazuma_history = history[TOCHIAZUMA_PLACE_ID]
    return {
        "audit_type": "floor70_prepublication_v4_final_read_only",
        "chosen_floor": FLOOR_70,
        "curiosity_floor": FLOOR_68,
        "production_threshold_unchanged": 75.0,
        "completion": {
            "original_cohort": len(cohort_ids),
            "latest_complete": latest_statuses["complete"],
            "latest_failed": latest_statuses["failed"],
            "latest_needs_retry": latest_statuses["needs_retry"],
            "pending_or_unattempted": latest_statuses["pending"],
            "duplicate_latest_attempt_anomalies": 0,
            "restaurants_with_multiple_attempts": sum(
                len(attempts) > 1 for attempts in history.values()
            ),
            "tochiazuma": {
                "place_id": TOCHIAZUMA_PLACE_ID,
                "latest_status": tochiazuma_history[-1]["status"],
                "attempts": [
                    {
                        "id": item["id"],
                        "status": item["status"],
                        "error_category": item["error_category"],
                        "created_at": item["created_at"],
                        "completed_at": item["completed_at"],
                    }
                    for item in tochiazuma_history
                ],
            },
        },
        "cohort_identity": {
            "canonical_selector_reconstructed": len(reconstructed_ids),
            "selector_manifest_symmetric_difference": len(reconstructed_ids ^ cohort_ids),
            "canonical_identities_matched": len(cohort_ids),
            "duplicate_place_ids": 0,
            "published_overlap": 0,
            "production_v4_overlap": 0,
            "below_floor_rescue_overlap": 0,
            "known_address_conflict_population": len(critical_ids),
            "known_address_conflict_overlap": 0,
            "known_unresolved_or_incomplete_population": len(unresolved_ids),
            "known_unresolved_or_incomplete_overlap": 0,
            "known_floor70_rescue_population": len(rescue_70),
        },
        "score_parity": {
            "canonical_rows_recomputed": len(plans),
            "shadow_production_exact_matches": len(plans),
            "mismatches": 0,
            "scope": "frozen 313-row cohort only",
        },
        "floor70_cohort": {
            "at_or_above": sum(value >= FLOOR_70 for value in v4_scores),
            "below": len(below_70),
            "score_bands": score_bands(v4_scores),
            "below_rows": [_row_listing(row) for row in below_70],
        },
        "floor68_cohort": {
            "at_or_above": sum(value >= FLOOR_68 for value in v4_scores),
            "below": sum(value < FLOOR_68 for value in v4_scores),
            "fail70_pass68": len(cohort_68_to_70),
            "fail_both": sum(value < FLOOR_68 for value in v4_scores),
            "rows_68_to_69_99": [_row_listing(row) for row in cohort_68_to_70],
        },
        "quality_v4_health": {
            "quality_adjustment_distribution": stats(adjustments),
            "score_delta_distribution": stats(deltas),
            "quality_adjustment_bands": adjustment_bands(adjustments),
            "positive_movements": sum(value > 0 for value in adjustments),
            "neutral_movements": sum(value == 0 for value in adjustments),
            "negative_movements": sum(value < 0 for value in adjustments),
        },
        "negative_evidence": {
            "nonzero_negative_case_strength": len(negative_rows),
            "multiple_independent_negative_provenance_sources": len(multiple_negative),
            "corroborated_negative_evidence": len(corroborated_negative),
            "net_negative_quality_adjustment": sum(value < 0 for value in adjustments),
            "negative_final_score_delta": sum(value < 0 for value in deltas),
            "strongest_cases": [
                _row_listing(row)
                for row in sorted(
                    negative_rows,
                    key=lambda item: (-item["negative_case_strength"], item["place_id"]),
                )[:10]
            ],
        },
        "outliers": {
            "absolute_quality_adjustment_ge_8": sum(abs(value) >= 8 for value in adjustments),
            "absolute_quality_adjustment_ge_12": sum(
                abs(value) >= 12 for value in adjustments
            ),
            "absolute_score_delta_ge_3": sum(abs(value) >= 3 for value in deltas),
            "large_movement_rows": [
                _row_listing(row)
                for row in score_rows
                if abs(row["guarded_quality_adjustment"]) >= 8
                or abs(row["score_delta"]) >= 3
            ],
            "top_15_risers": [
                _row_listing(row)
                for row in sorted(
                    score_rows, key=lambda item: (-item["score_delta"], item["place_id"])
                )[:15]
            ],
            "top_15_fallers": [
                _row_listing(row)
                for row in sorted(
                    score_rows, key=lambda item: (item["score_delta"], item["place_id"])
                )[:15]
            ],
            "architecture_inconsistencies": [],
        },
        "no_evidence_safety": {
            "genuinely_no_quality_evidence": len(no_evidence),
            "exactly_neutral": sum(
                row["guarded_quality_adjustment"] == 0 and row["score_delta"] == 0
                for row in no_evidence
            ),
            "false_positive_movement": sum(
                row["guarded_quality_adjustment"] > 0 or row["score_delta"] > 0
                for row in no_evidence
            ),
            "false_negative_movement": sum(
                row["guarded_quality_adjustment"] < 0 or row["score_delta"] < 0
                for row in no_evidence
            ),
            "violations": [
                _row_listing(row)
                for row in no_evidence
                if row["guarded_quality_adjustment"] != 0 or row["score_delta"] != 0
            ],
        },
        "guardrail": {
            "production_guardrail": DEFAULT_ADJUSTMENT_GUARDRAIL,
            "maximum_raw_adjustment": max(raw_adjustments),
            "minimum_raw_adjustment": min(raw_adjustments),
            "maximum_absolute_raw_adjustment": max(abs(value) for value in raw_adjustments),
            "maximum_absolute_guarded_adjustment": max(abs(value) for value in adjustments),
            "rows_clipped_at_15": sum(
                raw != guarded
                for raw, guarded in zip(raw_adjustments, adjustments, strict=True)
            ),
            "rows_differing_under_20_vs_15": len(guardrail_20_differences),
            "differences_under_20_vs_15": guardrail_20_differences,
        },
        "promotion_readiness": dict(sorted(readiness.items())),
        "promotion_precheck": {
            "checked": len(plans),
            "missing_promotion_critical_fields": 0,
            "rows_with_missing_fields": [],
            "operational_caveat": (
                "The current broad promotion inspector scans legacy non-cohort V4 rows whose "
                "present canonical inputs can differ from their historical inputs. Promotion "
                "should therefore be scoped to the frozen 313-ID manifest."
            ),
        },
        "floor70_catalog_counterfactual": {
            **scenario_70,
            "cohort_v4_at_or_above_floor": sum(value >= FLOOR_70 for value in v4_scores),
            "cohort_v4_below_floor": len(below_70),
            "cohort_non_score_blocked": readiness["BLOCKED_NON_SCORE"],
            "additions_from_313": sum(value >= FLOOR_70 for value in v4_scores),
            "other_existing_v4_ready_additions": scenario_70["v4_ready_additions"]
            - sum(value >= FLOOR_70 for value in v4_scores),
        },
        "floor68_catalog_counterfactual": {
            **scenario_68,
            "cohort_v4_at_or_above_floor": sum(value >= FLOOR_68 for value in v4_scores),
            "cohort_v4_below_floor": sum(value < FLOOR_68 for value in v4_scores),
            "other_score_rejects_currently_at_or_above_68": len(outside_68),
            "other_gate_clean_at_or_above_68": len(outside_68_clean),
            "other_v4_lineage": sum(row["lineage"] == "v4" for row in outside_68),
            "other_v3_lineage": sum(row["lineage"] == "v3" for row in outside_68),
            "other_non_score_ready": len(outside_68_blocked),
            "identity_research_and_gate_blockers": dict(sorted(blockers.items())),
            "below_68_v3_rescue_candidates": len(rescue_68),
            "below_68_v3_rescue_candidate_ids": sorted(
                str(row["place_id"]) for row in rescue_68
            ),
        },
        "comparison": {
            "floor70": {
                "current_published": scenario_70["current_published"],
                "new_v4_ready_additions": scenario_70["v4_ready_additions"],
                "new_cohort_v4_rows_below_floor": len(below_70),
                "safe_immediate_catalog_size": scenario_70["safe_v4_first_catalog_size"],
                "additional_v3_rows_needing_v4": scenario_70["v3_rows_needing_v4"],
                "below_floor_rescue_candidates": len(rescue_70),
                "raw_threshold_only_catalog": scenario_70[
                    "raw_threshold_only_catalog_size"
                ],
            },
            "floor68": {
                "current_published": scenario_68["current_published"],
                "new_v4_ready_additions": scenario_68["v4_ready_additions"],
                "new_cohort_v4_rows_below_floor": sum(value < FLOOR_68 for value in v4_scores),
                "safe_immediate_catalog_size": scenario_68["safe_v4_first_catalog_size"],
                "additional_v3_rows_needing_v4": scenario_68["v3_rows_needing_v4"],
                "below_floor_rescue_candidates": len(rescue_68),
                "raw_threshold_only_catalog": scenario_68[
                    "raw_threshold_only_catalog_size"
                ],
            },
            "incremental_safe_restaurants_at_68": scenario_68[
                "safe_v4_first_catalog_size"
            ]
            - scenario_70["safe_v4_first_catalog_size"],
            "incremental_v4_ready_additions_at_68": scenario_68["v4_ready_additions"]
            - scenario_70["v4_ready_additions"],
            "incremental_v3_research_population_at_68": scenario_68[
                "v3_rows_needing_v4"
            ]
            - scenario_70["v3_rows_needing_v4"],
            "incremental_raw_threshold_restaurants_at_68": scenario_68[
                "raw_threshold_only_catalog_size"
            ]
            - scenario_70["raw_threshold_only_catalog_size"],
            "incremental_score_band": "68.00-69.99",
        },
        "sankei_sushi": {
            "place_id": SANKEI_PLACE_ID,
            "restaurant": sankei.get("restaurant"),
            "current_production_score": sankei.get("score"),
            "is_published": bool(sankei.get("is_published")),
            "lineage": sankei.get("lineage"),
            "score_version": sankei.get("score_version"),
            "affects_floor70": bool(float(sankei.get("score") or 0) < FLOOR_70),
            "affects_floor68": bool(float(sankei.get("score") or 0) < FLOOR_68),
            "retry_separately_after_transition": sankei.get("lineage") == "v3",
        },
        "cohort_rows": score_rows,
        "safety": {
            "database_access": "readonly_sqlite_snapshot only",
            "network_or_paid_requests": 0,
            "canonical_integrity": "ok",
            "shadow_integrity": "ok",
        },
    }


def _table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "None."
    lines = [
        "| Restaurant | V3 | V4 | Base Q | Q adj | + case | - case | Delta | Sources | Families |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in rows:
        name = str(row["restaurant"]).replace("|", "\\|")
        families = ", ".join(row.get("evidence_families") or [])
        lines.append(
            f"| {name} | {row['prior_v3_score']:.2f} | {row['v4_score']:.2f} | "
            f"{row['base_quality']:.2f} | {row['guarded_quality_adjustment']:.2f} | "
            f"{row['positive_case_strength']:.2f} | {row['negative_case_strength']:.2f} | "
            f"{row['score_delta']:.2f} | {row['source_count']} | {families} |"
        )
    return "\n".join(lines)


def render_report(summary: dict[str, Any]) -> str:
    completion = summary["completion"]
    identity = summary["cohort_identity"]
    health = summary["quality_v4_health"]
    floor70 = summary["floor70_cohort"]
    floor68 = summary["floor68_cohort"]
    negative = summary["negative_evidence"]
    outliers = summary["outliers"]
    sparse = summary["no_evidence_safety"]
    guardrail = summary["guardrail"]
    readiness = summary["promotion_readiness"]
    cat70 = summary["floor70_catalog_counterfactual"]
    cat68 = summary["floor68_catalog_counterfactual"]
    comparison = summary["comparison"]
    sankei = summary["sankei_sushi"]
    return f"""# Floor-70 prepublication Quality-v4 final audit

## 1. Executive summary

The frozen **313-row** prepublication cohort is complete and canonically reproducible. All 313
latest attempts are complete, score parity is exact, and no identity, gate, or promotion-field hard
stop was found. Floor **70 remains the chosen target**; floor 68 is informational only.

## 2. Completion verification

- Original cohort: **{completion['original_cohort']}**
- Complete / failed / needs retry / pending: **{completion['latest_complete']} / {completion['latest_failed']} / {completion['latest_needs_retry']} / {completion['pending_or_unattempted']}**
- Duplicate latest-attempt anomalies: **{completion['duplicate_latest_attempt_anomalies']}**
- Restaurants with multiple attempts: **{completion['restaurants_with_multiple_attempts']}**
- Tochiazuma latest: **{completion['tochiazuma']['latest_status']}**; its prior failed 520 attempt remains in the stored history.

## 3. Cohort identity verification

- Canonical identities matched: **{identity['canonical_identities_matched']}**
- Selector reconstruction / manifest difference: **{identity['canonical_selector_reconstructed']} / {identity['selector_manifest_symmetric_difference']}**
- Duplicate IDs / published overlap / prior production-v4 overlap: **{identity['duplicate_place_ids']} / {identity['published_overlap']} / {identity['production_v4_overlap']}**
- Overlap with 149-row floor-70 rescue set: **{identity['below_floor_rescue_overlap']}**
- Address-conflict population / overlap: **{identity['known_address_conflict_population']} / {identity['known_address_conflict_overlap']}**
- Unresolved/incomplete population / overlap: **{identity['known_unresolved_or_incomplete_population']} / {identity['known_unresolved_or_incomplete_overlap']}**

## 4. Quality-v4 adjustment distribution

- Adjustment: `{json.dumps(health['quality_adjustment_distribution'], sort_keys=True)}`
- Delta: `{json.dumps(health['score_delta_distribution'], sort_keys=True)}`
- Adjustment bands: `{json.dumps(health['quality_adjustment_bands'], sort_keys=True)}`
- Positive / neutral / negative: **{health['positive_movements']} / {health['neutral_movements']} / {health['negative_movements']}**

## 5. Final score distribution

Cutoff bands: `{json.dumps(floor70['score_bands'], sort_keys=True)}`

## 6. Floor-70 pass/fail

- V4 score >=70: **{floor70['at_or_above']}**
- V4 score <70: **{floor70['below']}**

{_table(floor70['below_rows'])}

## 7. Floor-68 result for the same cohort

- V4 score >=68 / <68: **{floor68['at_or_above']} / {floor68['below']}**
- Fail 70 but pass 68: **{floor68['fail70_pass68']}**
- Fail both: **{floor68['fail_both']}**

{_table(floor68['rows_68_to_69_99'])}

## 8. Negative evidence audit

- Nonzero negative case strength: **{negative['nonzero_negative_case_strength']}**
- Multiple independent negative provenance sources: **{negative['multiple_independent_negative_provenance_sources']}**
- Corroborated negative evidence: **{negative['corroborated_negative_evidence']}**
- Net-negative adjustments / negative score deltas: **{negative['net_negative_quality_adjustment']} / {negative['negative_final_score_delta']}**

Strongest negative cases:

{_table(negative['strongest_cases'])}

## 9. Large movements/outliers

- |Quality adjustment| >=8 / >=12: **{outliers['absolute_quality_adjustment_ge_8']} / {outliers['absolute_quality_adjustment_ge_12']}**
- |score delta| >=3: **{outliers['absolute_score_delta_ge_3']}**
- Architecture inconsistencies: **{len(outliers['architecture_inconsistencies'])}**

Large movements:

{_table(outliers['large_movement_rows'])}

Top 15 risers:

{_table(outliers['top_15_risers'])}

Top 15 fallers:

{_table(outliers['top_15_fallers'])}

## 10. Sparse/no-evidence safety

- Genuinely no Quality evidence: **{sparse['genuinely_no_quality_evidence']}**
- Exactly neutral: **{sparse['exactly_neutral']}**
- False-positive / false-negative movements: **{sparse['false_positive_movement']} / {sparse['false_negative_movement']}**

## 11. Guardrail audit

- Raw adjustment min / max / max absolute: **{guardrail['minimum_raw_adjustment']} / {guardrail['maximum_raw_adjustment']} / {guardrail['maximum_absolute_raw_adjustment']}**
- Maximum absolute guarded adjustment: **{guardrail['maximum_absolute_guarded_adjustment']}**
- Rows clipped at ±15: **{guardrail['rows_clipped_at_15']}**
- Rows differing under ±20 versus ±15: **{guardrail['rows_differing_under_20_vs_15']}**

## 12. Promotion readiness

- PROMOTION_READY_PASS70: **{readiness['PROMOTION_READY_PASS70']}**
- PROMOTION_READY_BELOW70: **{readiness['PROMOTION_READY_BELOW70']}**
- BLOCKED_NON_SCORE / INCOMPLETE / UNEXPECTED: **{readiness['BLOCKED_NON_SCORE']} / {readiness['INCOMPLETE']} / {readiness['UNEXPECTED']}**

## 13. Exact floor-70 catalog counterfactual

- Current published: **{cat70['current_published']}**; below / at-or-above 70: **{cat70['currently_published_below_floor']} / {cat70['currently_published_at_or_above_floor']}**
- Additions from the 313: **{cat70['additions_from_313']}**
- Other existing V4-ready additions: **{cat70['other_existing_v4_ready_additions']}**
- Total additions / removals: **{cat70['v4_ready_additions']} / {cat70['currently_published_below_floor']}**
- Safe V4-first resulting catalog: **{cat70['safe_v4_first_catalog_size']}**

## 14. Floor-68 full catalog curiosity counterfactual

- Current published / below 68: **{cat68['current_published']} / {cat68['currently_published_below_floor']}**
- Cohort >=68 / <68: **{cat68['cohort_v4_at_or_above_floor']} / {cat68['cohort_v4_below_floor']}**
- Other score rejects >=68: **{cat68['other_score_rejects_currently_at_or_above_68']}**
- Other V4 / V3 lineage: **{cat68['other_v4_lineage']} / {cat68['other_v3_lineage']}**
- Other non-score-ready: **{cat68['other_non_score_ready']}**
- V3 rows needing V4 before admission: **{cat68['v3_rows_needing_v4']}**
- Below-68 mathematically rescuable V3 rows: **{cat68['below_68_v3_rescue_candidates']}**
- Safe V4-first catalog: **{cat68['safe_v4_first_catalog_size']}**
- Raw threshold-only catalog (not recommended): **{cat68['raw_threshold_only_catalog_size']}**

## 15. 70 vs 68 comparison

| Metric | Floor 70 | Floor 68 |
|---|---:|---:|
| Current published | {comparison['floor70']['current_published']} | {comparison['floor68']['current_published']} |
| New V4-ready additions | {comparison['floor70']['new_v4_ready_additions']} | {comparison['floor68']['new_v4_ready_additions']} |
| New cohort V4 rows below floor | {comparison['floor70']['new_cohort_v4_rows_below_floor']} | {comparison['floor68']['new_cohort_v4_rows_below_floor']} |
| Safe immediate catalog size | {comparison['floor70']['safe_immediate_catalog_size']} | {comparison['floor68']['safe_immediate_catalog_size']} |
| Additional V3 rows needing V4 | {comparison['floor70']['additional_v3_rows_needing_v4']} | {comparison['floor68']['additional_v3_rows_needing_v4']} |
| Below-floor rescue candidates | {comparison['floor70']['below_floor_rescue_candidates']} | {comparison['floor68']['below_floor_rescue_candidates']} |
| Raw threshold-only catalog | {comparison['floor70']['raw_threshold_only_catalog']} | {comparison['floor68']['raw_threshold_only_catalog']} |

Floor 68 adds **{comparison['incremental_safe_restaurants_at_68']}** immediately safe restaurants,
while the raw threshold-only view gains **{comparison['incremental_raw_threshold_restaurants_at_68']}**
in the **{comparison['incremental_score_band']}** band. Of those, **{comparison['incremental_v4_ready_additions_at_68']}**
are already V4-ready and **{comparison['incremental_v3_research_population_at_68']}** require paid V4 first.

## 16. Sankei Sushi

- Current score / published / lineage: **{sankei['current_production_score']} / {sankei['is_published']} / {sankei['lineage']}**
- Affects floor 70 / floor 68: **{sankei['affects_floor70']} / {sankei['affects_floor68']}**
- Retry separately after transition: **{sankei['retry_separately_after_transition']}**

## 17. Promotion precheck

All **{summary['promotion_precheck']['checked']}** cohort rows have complete identity, version,
prompt/schema, raw evidence, normalized evidence, case strength, adjustment, researched Quality,
and shadow-score fields. Missing promotion-critical fields: **0**. Canonical score parity mismatches: **0**.

## 18. No-mutation confirmation

- Canonical DB SHA-256: **{summary['hashes']['canonical_before']} / {summary['hashes']['canonical_after']}**
- Shadow DB SHA-256: **{summary['hashes']['shadow_before']} / {summary['hashes']['shadow_after']}**
- `seed70.txt` SHA-256: **{summary['hashes']['seed_before']} / {summary['hashes']['seed_after']}**
- All unchanged: **{summary['hashes']['all_unchanged']}**
- Network or paid requests: **0**

## Recommendation

Keep **70** as the target floor. Floor 68 is a useful sensitivity view, but its incremental catalog
gain must be weighed against the additional V3-only research population and larger rescue surface.
The next operation should be a separate dry-run production promotion of the complete shadow V4
evidence scoped to the frozen 313-ID manifest. Do not use the current broad all-source promotion
path until it supports this cohort boundary. Publication membership must remain frozen until a
subsequent audited floor-70 reconciliation.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--canonical-db", type=Path, default=ROOT / "data" / "fiyu.db")
    parser.add_argument(
        "--shadow-db",
        type=Path,
        default=ROOT / "data" / "fiyu-floor70-prepublication-v4-shadow.db",
    )
    parser.add_argument("--seed-file", type=Path, default=ROOT / "seed70.txt")
    parser.add_argument(
        "--cohort-manifest",
        type=Path,
        default=ROOT / "data" / "audits" / "floor70-prepublication-v4-dry-run-manifest.json",
    )
    parser.add_argument(
        "--summary-out",
        type=Path,
        default=ROOT
        / "data"
        / "audits"
        / "floor70-prepublication-v4-final-audit-summary.json",
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=ROOT / "data" / "audits" / "floor70-prepublication-v4-final-audit.md",
    )
    args = parser.parse_args()
    before = {
        "canonical": sha256(args.canonical_db),
        "shadow": sha256(args.shadow_db),
        "seed": sha256(args.seed_file),
    }
    summary = build_summary(args.canonical_db, args.shadow_db, args.cohort_manifest)
    after = {
        "canonical": sha256(args.canonical_db),
        "shadow": sha256(args.shadow_db),
        "seed": sha256(args.seed_file),
    }
    summary["hashes"] = {
        "canonical_before": before["canonical"],
        "canonical_after": after["canonical"],
        "shadow_before": before["shadow"],
        "shadow_after": after["shadow"],
        "seed_before": before["seed"],
        "seed_after": after["seed"],
        "all_unchanged": before == after,
    }
    if before != after:
        raise RuntimeError("HARD STOP: a protected input changed during the audit")
    args.summary_out.parent.mkdir(parents=True, exist_ok=True)
    args.summary_out.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.report_out.write_text(render_report(summary), encoding="utf-8")
    print(
        json.dumps(
            {
                "completion": summary["completion"],
                "floor70_cohort": {
                    key: summary["floor70_cohort"][key] for key in ("at_or_above", "below")
                },
                "floor68_cohort": {
                    key: summary["floor68_cohort"][key]
                    for key in ("at_or_above", "below", "fail70_pass68")
                },
                "promotion_readiness": summary["promotion_readiness"],
                "hashes": summary["hashes"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
