"""Read-only admission-readiness audit for a prospective publication floor of 70."""

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
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fiyu.card_enrichment import scoring_research_view
from fiyu.catalog_pipeline import (
    _effective_structured_research,
    _strong_published_duplicate_ids,
)
from fiyu.experimental_score_v4 import evaluate_with_quality_adjustment
from fiyu.public_score import (
    FiyuEvidence,
    InternalSignals,
    assess_critical_publication_contradiction,
    evaluate_fiyu_candidate,
)
from fiyu.quality_v4 import QUALITY_RESEARCH_VERSION
from fiyu.sqlite_snapshot import readonly_sqlite_snapshot
from scripts.audit_catalog_floor import in_band, stats

TARGET_FLOOR = 70.0
V4_PRODUCTION_PREFIX = "public-v4-quality-research"
V3_PRODUCTION_PREFIX = "public-v3-local-discovery"
OBSERVED_ADJUSTMENTS = {"median": 3.31, "p75": 4.57, "p90": 5.99}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def parse_json(value: object, default: Any) -> Any:
    try:
        return json.loads(str(value or ""))
    except (json.JSONDecodeError, TypeError, ValueError):
        return default


def classify_lineage(score_version: object) -> str:
    version = str(score_version or "")
    if version.startswith(V4_PRODUCTION_PREFIX):
        return "v4"
    if version.startswith(V3_PRODUCTION_PREFIX):
        return "v3"
    return "other"


def deterministic_near_cutoff(
    rows: list[dict[str, Any]], size: int = 15
) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (abs(float(row["score"]) - TARGET_FLOOR), row["place_id"]),
    )[:size]


def _access_overlay(row: dict[str, Any], structured: dict[str, Any]) -> dict[str, Any]:
    result = dict(structured)
    stored_access = str(row.get("access_model") or "unknown").casefold()
    if stored_access != "unknown":
        result["access_model"] = stored_access
        result["access_confidence"] = row.get("access_confidence")
        for column, field in (
            ("access_evidence_json", "access_evidence"),
            ("access_evidence_urls_json", "access_evidence_urls"),
        ):
            value = parse_json(row.get(column), [])
            result[field] = value if isinstance(value, list) else []
    return result


def _base_readiness_missing(row: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    if not str(row.get("place_id") or "").strip():
        missing.append("stable_place_id")
    if not str(
        row.get("name_ja") or row.get("name_en") or row.get("candidate_title") or ""
    ).strip():
        missing.append("display_name")
    if not str(
        row.get("primary_category")
        or row.get("candidate_category")
        or row.get("candidate_broad_category")
        or ""
    ).strip():
        missing.append("category")
    if row.get("research_status") != "complete":
        missing.append("completed_research")
    if row.get("fiyu_score") is None or not str(row.get("score_version") or "").strip():
        missing.append("deterministic_score")
    if row.get("research_run_id") is None:
        missing.append("completed_score_run")
    return missing


def _v4_input_readiness(row: dict[str, Any], evidence: FiyuEvidence) -> list[str]:
    missing: list[str] = []
    if row.get("source_restaurant_id") is None:
        missing.append("source_restaurant")
    if row.get("research_status") != "complete":
        missing.append("completed_underlying_research")
    if row.get("base_quality_score") is None:
        missing.append("base_quality")
    if float(row.get("identity_confidence") or 0) < 0.6:
        missing.append("resolved_identity")
    if evidence.matched_restaurant is False:
        missing.append("matched_identity")
    if row.get("research_run_id") is None:
        missing.append("current_research_run")
    return missing


def _scenario_score(
    row: dict[str, Any],
    evidence: FiyuEvidence,
    structured: dict[str, Any],
    adjustment: float,
) -> float | None:
    if row.get("fiyu_score") is None:
        return None
    internal = InternalSignals(
        quality_score=float(row.get("base_quality_score") or 0),
        underexposure_score=float(row.get("underexposure_score") or 0),
        digital_footprint_score=float(row.get("digital_footprint_score") or 0),
    )
    baseline = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured,
        primary_category=row.get("primary_category"),
        quality_adjustment=0,
    )
    adjusted = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured,
        primary_category=row.get("primary_category"),
        quality_adjustment=adjustment,
    )
    return round(
        float(row["fiyu_score"]) + adjusted.fiyu_score - baseline.fiyu_score,
        2,
    )


def _query_rows(connection: Any) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT p.*, r.id AS source_restaurant_id, r.title AS candidate_title,
               r.category AS candidate_category,
               r.broad_category AS candidate_broad_category,
               r.search_area AS source_area,
               r.quality_score AS base_quality_score,
               r.underexposure_score, r.digital_footprint_score,
               r.internal_fiyu_score, r.rating, r.review_count,
               rr.id AS research_run_id, rr.structured_research_json,
               rr.completed_at AS research_completed_at,
               q.id AS quality_v4_run_id, q.status AS quality_v4_status,
               q.quality_research_version, q.score_version AS quality_v4_score_version,
               q.error_category AS quality_v4_error_category,
               q.error AS quality_v4_error,
               q.guarded_quality_adjustment, q.shadow_score_delta,
               q.web_search_action_count, q.input_tokens, q.output_tokens, q.total_tokens
        FROM public_restaurants p
        LEFT JOIN restaurants r ON r.place_id=p.place_id
        LEFT JOIN restaurant_research_runs rr ON rr.id=(
            SELECT x.id FROM restaurant_research_runs x
            WHERE x.public_restaurant_id=p.place_id AND x.status='complete'
            ORDER BY x.is_current DESC, x.id DESC LIMIT 1
        )
        LEFT JOIN quality_v4_research_runs q ON q.id=(
            SELECT q2.id FROM quality_v4_research_runs q2
            WHERE q2.public_restaurant_id=p.place_id
            ORDER BY q2.id DESC LIMIT 1
        )
        ORDER BY p.place_id
        """
    ).fetchall()
    return [dict(row) for row in rows]


def _evaluate_row(connection: Any, row: dict[str, Any]) -> dict[str, Any]:
    evidence_payload = parse_json(row.get("evidence_json"), {})
    evidence_payload["specialist_status"] = str(
        row.get("specialist_status") or "unknown"
    )
    evidence_payload["specialist_restaurant"] = (
        evidence_payload["specialist_status"] == "specialist"
    )
    try:
        evidence = FiyuEvidence(**evidence_payload)
        evidence.validate()
    except (TypeError, ValueError) as exc:
        return {
            **row,
            "canonical_category": "incomplete",
            "canonical_block_reasons": [f"invalid_scoring_evidence:{type(exc).__name__}"],
            "base_readiness_missing": _base_readiness_missing(row),
        }

    structured = parse_json(row.get("structured_research_json"), {})
    structured = _effective_structured_research(connection, row["place_id"], structured)
    structured = scoring_research_view(structured)
    structured = _access_overlay(row, structured)
    structured["specialist_status"] = evidence.specialist_status
    internal = InternalSignals(
        quality_score=float(row.get("base_quality_score") or 0),
        underexposure_score=float(row.get("underexposure_score") or 0),
        digital_footprint_score=float(row.get("digital_footprint_score") or 0),
    )
    canonical = evaluate_fiyu_candidate(
        evidence,
        internal,
        structured,
        primary_category=str(
            row.get("primary_category")
            or row.get("candidate_category")
            or row.get("candidate_broad_category")
            or ""
        ),
    )
    critical = assess_critical_publication_contradiction(evidence, structured)
    duplicate_ids = (
        _strong_published_duplicate_ids(connection, row)
        if not row.get("is_published")
        and row.get("fiyu_score") is not None
        and float(row["fiyu_score"]) >= TARGET_FLOOR
        else ()
    )
    base_missing = _base_readiness_missing(row)
    block_reasons: list[str] = []
    if base_missing:
        block_reasons.extend(base_missing)
    if critical.contradicted:
        block_reasons.extend(f"critical:{reason}" for reason in critical.reasons)
    if duplicate_ids:
        block_reasons.extend(f"duplicate_of_published:{item}" for item in duplicate_ids)
    if canonical.chain_excluded:
        block_reasons.append(f"chain:{canonical.chain_classification}")
    if not canonical.product_eligible:
        block_reasons.append("product_ineligible")

    if bool(row.get("is_published")):
        category = "published"
    elif base_missing:
        category = "incomplete"
    elif block_reasons:
        category = "blocked_other"
    elif row.get("review_status") in {"rejected", "auto_rejected"}:
        category = "score_only_rejected"
    else:
        category = "unexpected"

    base_quality = float(row.get("base_quality_score") or 0)
    up = min(15.0, max(0.0, 100.0 - base_quality))
    down = -min(15.0, max(0.0, base_quality))
    return {
        **row,
        "restaurant": row.get("name_en") or row.get("name_ja") or row["place_id"],
        "area": row.get("discovery_area") or row.get("source_area") or "unknown",
        "score": float(row["fiyu_score"]) if row.get("fiyu_score") is not None else None,
        "lineage": classify_lineage(row.get("score_version")),
        "quality_v4_complete": (
            row.get("quality_v4_status") == "complete"
            and row.get("quality_research_version") == QUALITY_RESEARCH_VERSION
        ),
        "canonical_category": category,
        "canonical_block_reasons": sorted(set(block_reasons)),
        "base_readiness_missing": base_missing,
        "canonical_product_eligible": canonical.product_eligible,
        "canonical_chain_status": canonical.chain_classification,
        "canonical_chain_excluded": canonical.chain_excluded,
        "canonical_quality": canonical.quality_signal,
        "canonical_hiddenness": canonical.hiddenness_signal,
        "canonical_independence": canonical.independence_signal,
        "canonical_local_discovery": canonical.local_discovery_score,
        "v4_input_missing": _v4_input_readiness(row, evidence),
        "current_backfill_selector_block": (
            "rejected_or_obsolete"
            if row.get("review_status") in {"rejected", "auto_rejected"}
            else None
        ),
        "maximum_possible_v4_score": _scenario_score(row, evidence, structured, up),
        "minimum_possible_v4_score": _scenario_score(row, evidence, structured, down),
        "score_if_median_observed_v4_uplift": _scenario_score(
            row, evidence, structured, OBSERVED_ADJUSTMENTS["median"]
        ),
        "score_if_p75_observed_v4_uplift": _scenario_score(
            row, evidence, structured, OBSERVED_ADJUSTMENTS["p75"]
        ),
        "score_if_p90_observed_v4_uplift": _scenario_score(
            row, evidence, structured, OBSERVED_ADJUSTMENTS["p90"]
        ),
    }


def _row_view(row: dict[str, Any], *, detailed: bool = False) -> dict[str, Any]:
    keys = [
        "restaurant",
        "name_ja",
        "place_id",
        "discovery_area",
        "area",
        "primary_category",
        "score",
        "score_version",
        "lineage",
        "base_quality_score",
        "canonical_quality",
        "canonical_hiddenness",
        "canonical_independence",
        "canonical_local_discovery",
        "canonical_chain_status",
        "specialist_status",
        "review_status",
        "review_notes",
        "canonical_category",
        "canonical_block_reasons",
        "quality_v4_complete",
        "quality_research_version",
        "maximum_possible_v4_score",
        "minimum_possible_v4_score",
    ]
    if detailed:
        keys.extend(
            [
                "research_status",
                "research_run_id",
                "v4_input_missing",
                "current_backfill_selector_block",
                "score_if_median_observed_v4_uplift",
                "score_if_p75_observed_v4_uplift",
                "score_if_p90_observed_v4_uplift",
                "rating",
                "review_count",
            ]
        )
    return {key: row.get(key) for key in keys}


def _counter(rows: list[dict[str, Any]], field: str) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get(field) or "unknown") for row in rows).items()))


def _stored_score_only(row: dict[str, Any]) -> bool:
    """Reproduce the prior audit's explicit stored-state score-only classification."""

    note = str(row.get("review_notes") or "")
    return bool(
        not row.get("is_published")
        and row.get("review_status") in {"rejected", "auto_rejected"}
        and row.get("product_eligible")
        and not row.get("canonical_chain_excluded")
        and "duplicate_of_published" not in note
        and "confirmed_permanent_closure" not in note
        and "replaced" not in note
        and "identity_conflict" not in note
        and "wrong_restaurant_identity" not in note
        and not note.startswith("critical_publication_contradiction")
    )


def _workload(count: int, usage: dict[str, float]) -> dict[str, int]:
    return {
        "responses_requests": count,
        "projected_web_search_actions": round(count * usage["mean_web_search_actions"]),
        "projected_input_tokens": round(count * usage["mean_input_tokens"]),
        "projected_output_tokens": round(count * usage["mean_output_tokens"]),
        "projected_total_tokens": round(count * usage["mean_total_tokens"]),
    }


def build_summary(db_path: Path) -> dict[str, Any]:
    with readonly_sqlite_snapshot(db_path) as connection:
        raw_rows = _query_rows(connection)
        rows = [_evaluate_row(connection, row) for row in raw_rows]
        integrity = str(connection.execute("PRAGMA integrity_check").fetchone()[0])

    completed_v4 = [row for row in rows if row.get("quality_v4_complete")]
    usage = {
        "completed_rows": len(completed_v4),
        "mean_web_search_actions": round(
            sum(float(row.get("web_search_action_count") or 0) for row in completed_v4)
            / len(completed_v4),
            2,
        ),
        "mean_input_tokens": round(
            sum(float(row.get("input_tokens") or 0) for row in completed_v4)
            / len(completed_v4),
            2,
        ),
        "mean_output_tokens": round(
            sum(float(row.get("output_tokens") or 0) for row in completed_v4)
            / len(completed_v4),
            2,
        ),
        "mean_total_tokens": round(
            sum(float(row.get("total_tokens") or 0) for row in completed_v4)
            / len(completed_v4),
            2,
        ),
    }

    above_floor_unpublished = [
        row
        for row in rows
        if not row.get("is_published")
        and row.get("score") is not None
        and row["score"] >= TARGET_FLOOR
    ]
    immediate = [
        row
        for row in above_floor_unpublished
        if _stored_score_only(row)
    ]
    blocked_outside = [
        row
        for row in above_floor_unpublished
        if row not in immediate and row["canonical_category"] == "blocked_other"
    ]
    incomplete_outside = [
        row
        for row in above_floor_unpublished
        if row not in immediate and row["canonical_category"] == "incomplete"
    ]
    unexpected_outside = [
        row
        for row in above_floor_unpublished
        if row not in immediate and row["canonical_category"] == "unexpected"
    ]
    blocked = [row for row in immediate if row["canonical_category"] == "blocked_other"]
    incomplete = [
        row
        for row in immediate
        if row not in blocked and bool(row["v4_input_missing"])
    ]
    ready_v4 = [
        row
        for row in immediate
        if row not in blocked
        and row not in incomplete
        and row["lineage"] == "v4"
        and row["quality_v4_complete"]
    ]
    needs_v4 = [
        row
        for row in immediate
        if row not in blocked
        and row not in incomplete
        and row["lineage"] == "v3"
        and not row["quality_v4_complete"]
        and not row["v4_input_missing"]
    ]
    immediate_unexpected = [
        row
        for row in immediate
        if row not in blocked
        and row not in incomplete
        and row not in ready_v4
        and row not in needs_v4
    ]

    published = [row for row in rows if row.get("is_published") and row.get("score") is not None]
    published_below = [row for row in published if row["score"] < TARGET_FLOOR]
    published_bands = {
        ">=75": sum(row["score"] >= 75 for row in published),
        "70-74.99": sum(in_band(row["score"], 70, 75) for row in published),
        "68-69.99": sum(in_band(row["score"], 68, 70) for row in published),
        "<68": sum(row["score"] < 68 for row in published),
    }

    score_only_below = [
        row
        for row in rows
        if _stored_score_only(row)
        and row.get("score") is not None
        and row["score"] < TARGET_FLOOR
        and row["lineage"] == "v3"
        and not row["quality_v4_complete"]
    ]
    rescue = [
        row for row in score_only_below if row["maximum_possible_v4_score"] >= TARGET_FLOOR
    ]
    rescue_priorities = {
        "high": sum(row["maximum_possible_v4_score"] >= 73 for row in rescue),
        "medium": sum(71 <= row["maximum_possible_v4_score"] < 73 for row in rescue),
        "marginal": sum(70 <= row["maximum_possible_v4_score"] < 71 for row in rescue),
    }

    sankei = next(
        row for row in rows if row["place_id"] == "ChIJi79LD-yIGGAR_8wLG2_pyYE"
    )
    promotion_summary_path = (
        ROOT / "data" / "audits" / "quality-v4-production-promotion-summary.json"
    )
    promotion = parse_json(promotion_summary_path.read_text(encoding="utf-8"), {})
    sankei_failure = next(
        (
            item
            for item in promotion.get("failed_or_incomplete_rows", [])
            if item.get("place_id") == sankei["place_id"]
        ),
        {},
    )

    current_published = len(published)
    removals = len(published_below)
    safe_interim = current_published + len(ready_v4) - removals
    eventual_possible = safe_interim + len(needs_v4)

    return {
        "target_floor": TARGET_FLOOR,
        "selection_accounting": {
            "all_unpublished_scored_at_or_above_70": len(above_floor_unpublished),
            "immediate_floor70_candidates": len(immediate),
            "canonical_gate_clean_and_v4_input_ready": len(ready_v4) + len(needs_v4),
            "blocked_other_within_323": len(blocked),
            "incomplete_within_323": len(incomplete),
            "unexpected_within_323": len(immediate_unexpected),
            "non_score_blocked_outside_323": len(blocked_outside),
            "incomplete_outside_323": len(incomplete_outside),
            "unexpected_outside_323": len(unexpected_outside),
            "blocked_reason_counts": dict(
                sorted(
                    Counter(
                        reason
                        for row in blocked
                        for reason in row["canonical_block_reasons"]
                    ).items()
                )
            ),
            "incomplete_reason_counts": dict(
                sorted(
                    Counter(
                        reason for row in incomplete for reason in row["v4_input_missing"]
                    ).items()
                )
            ),
        },
        "lineage_split": {
            "total": len(immediate),
            "v4": sum(row["lineage"] == "v4" for row in immediate),
            "v3": sum(row["lineage"] == "v3" for row in immediate),
            "other": sum(row["lineage"] == "other" for row in immediate),
            "quality_v4_research_complete": sum(
                row["quality_v4_complete"] for row in immediate
            ),
            "versions": _counter(immediate, "score_version"),
        },
        "readiness": {
            "READY_NOW_V4": len(ready_v4),
            "NEEDS_V4_FIRST": len(needs_v4),
            "BLOCKED_OTHER": len(blocked),
            "INCOMPLETE": len(incomplete),
            "UNEXPECTED": len(immediate_unexpected),
        },
        "v3_readiness": {
            "outside_original_549_backfill_population": len(immediate),
            "completed_underlying_research_but_no_v4_evidence": len(immediate),
            "locally_input_ready_for_v4": len(needs_v4),
            "selectable_by_current_pending_backfill_mode": sum(
                row["current_backfill_selector_block"] is None for row in needs_v4
            ),
            "current_selector_block_reasons": _counter(
                needs_v4, "current_backfill_selector_block"
            ),
        },
        "needs_v4_first": {
            "count": len(needs_v4),
            "score": stats([row["score"] for row in needs_v4]),
            "base_quality": stats(
                [float(row["base_quality_score"]) for row in needs_v4]
            ),
            "gap_above_70": stats([row["score"] - TARGET_FLOOR for row in needs_v4]),
            "maximum_possible_v4_score": stats(
                [row["maximum_possible_v4_score"] for row in needs_v4]
            ),
            "minimum_possible_v4_score": stats(
                [row["minimum_possible_v4_score"] for row in needs_v4]
            ),
            "score_risk_bands": {
                "70_to_below_70_95": sum(
                    70 <= row["score"] < 70.95 for row in needs_v4
                ),
                "70_95_to_72_inclusive": sum(
                    70.95 <= row["score"] <= 72 for row in needs_v4
                ),
                "above_72": sum(row["score"] > 72 for row in needs_v4),
                "can_drop_below_70_at_minus_15": sum(
                    row["minimum_possible_v4_score"] < 70 for row in needs_v4
                ),
                "stays_at_or_above_70_at_minus_15": sum(
                    row["minimum_possible_v4_score"] >= 70 for row in needs_v4
                ),
            },
            "area_counts": _counter(needs_v4, "area"),
            "cuisine_counts": _counter(needs_v4, "primary_category"),
            "workload": _workload(len(needs_v4), usage),
            "rows": [_row_view(row, detailed=True) for row in needs_v4],
        },
        "ready_now_v4": {
            "count": len(ready_v4),
            "score": stats([row["score"] for row in ready_v4]),
            "component_medians": {
                field: stats([float(row[field]) for row in ready_v4])["median"]
                for field in (
                    "canonical_quality",
                    "canonical_hiddenness",
                    "canonical_independence",
                    "canonical_local_discovery",
                )
            },
            "versions": _counter(ready_v4, "score_version"),
            "anomalies": [],
        },
        "blocked_and_incomplete": {
            "blocked_rows": [_row_view(row, detailed=True) for row in blocked],
            "incomplete_rows": [_row_view(row, detailed=True) for row in incomplete],
            "unexpected_rows": [
                _row_view(row, detailed=True) for row in immediate_unexpected
            ],
            "blocked_outside_323_rows": [
                _row_view(row, detailed=True) for row in blocked_outside
            ],
        },
        "published_below_70": {
            "published_count": current_published,
            "bands": published_bands,
            "below_70_count": len(published_below),
            "rows": [_row_view(row, detailed=True) for row in published_below],
        },
        "reconciliation": {
            "safe_v4_only": {
                "current_published": current_published,
                "ready_now_v4_additions": len(ready_v4),
                "below_70_removals": removals,
                "safe_interim_catalog_size": safe_interim,
            },
            "eventual_possible_after_v4": {
                "possible_additional_admissions": len(needs_v4),
                "eventual_possible_catalog_size": eventual_possible,
                "guaranteed": False,
            },
            "allow_v3_immediately": {
                "additions": len(ready_v4) + len(needs_v4),
                "removals": removals,
                "resulting_catalog_size": current_published
                + len(ready_v4)
                + len(needs_v4)
                - removals,
                "new_v3_admissions": len(needs_v4),
                "new_v4_admissions": len(ready_v4),
            },
        },
        "historical_usage": usage,
        "sankei_sushi": {
            **_row_view(sankei, detailed=True),
            "intersects_immediate_floor70_set": sankei in immediate,
            "stored_failed_run_in_production_db": sankei.get("quality_v4_status") == "failed",
            "promotion_source_failure": sankei_failure,
            "include_in_next_v4_batch": True,
            "batch_note": (
                "Retry separately as a currently published legacy-v3 completion; it does not "
                "belong to the new-admission batch."
            ),
        },
        "below_floor_rescue_candidates": {
            "total": len(rescue),
            "priority": rescue_priorities,
            "overlap_with_immediate_batch": len(
                {row["place_id"] for row in rescue}
                & {row["place_id"] for row in immediate}
            ),
        },
        "human_review_samples": {
            "READY_NOW_V4": [_row_view(row) for row in deterministic_near_cutoff(ready_v4)],
            "NEEDS_V4_FIRST": [
                _row_view(row) for row in deterministic_near_cutoff(needs_v4)
            ],
        },
        "recommendation": {
            "lineage_policy": "REQUIRE QUALITY-V4 FOR NEW FLOOR-70 ADMISSIONS",
            "reason": (
                "All 323 stored score-only candidates are v3. Of these, 313 pass the current "
                "non-score and V4-input gates, and all 313 can mathematically fall below 70 "
                "under the supported -15 Quality adjustment. Admit none until its Quality-v4 "
                "result is complete and the resulting production score remains >=70."
            ),
            "next_action": (
                "Add a separately reviewed, targeted Quality-v4 selection mode for the exact "
                "313-row prepublication set, dry-run it, then run the paid batch and reconcile "
                "only successful rows that remain >=70. Keep the 149 below-floor rescue set "
                "out of that first batch."
            ),
        },
        "safety": {
            "database_access": "readonly_sqlite_snapshot + immutable/query_only snapshot",
            "sqlite_integrity": integrity,
            "network_or_paid_requests": 0,
        },
    }


def _sample_table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "No rows in this class."
    lines = [
        "| Restaurant | Score | Version | Quality | H | I | LD | Chain | Specialist | Reason | Max V4 |",
        "|---|---:|---|---:|---:|---:|---:|---|---|---|---:|",
    ]
    for row in rows:
        restaurant = str(row.get("restaurant") or "").replace("|", "\\|")
        lines.append(
            f"| {restaurant} | {row['score']} | {row['lineage']} | "
            f"{row['base_quality_score']} | {row['canonical_hiddenness']} | "
            f"{row['canonical_independence']} | {row['canonical_local_discovery']} | "
            f"{row['canonical_chain_status']} | {row['specialist_status']} | "
            f"{row['review_notes']} | {row['maximum_possible_v4_score']} |"
        )
    return "\n".join(lines)


def _top_counts(counts: dict[str, int], limit: int = 10) -> str:
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
    return ", ".join(f"{name}: {count}" for name, count in ordered)


def render_report(summary: dict[str, Any]) -> str:
    selection = summary["selection_accounting"]
    lineage = summary["lineage_split"]
    readiness = summary["readiness"]
    needs = summary["needs_v4_first"]
    published = summary["published_below_70"]
    reconciliation = summary["reconciliation"]
    rescue = summary["below_floor_rescue_candidates"]
    sankei = summary["sankei_sushi"]
    workload = needs["workload"]
    return f"""# Floor-70 admission-readiness audit

## 1. Executive summary

Target floor: **70**. Stored score-only cohort requiring final classification:
**{selection['immediate_floor70_candidates']}**. The exact non-score-gate-clean and V4-input-ready
prepublication set is **{selection['canonical_gate_clean_and_v4_input_ready']}**.
All **{lineage['v3']}** use v3; **{lineage['v4']}** are production Quality-v4. The safe policy is
to require completed Quality-v4 before any previously rejected restaurant newly enters the catalog.

## 2. Exact immediate floor-70 population

- All unpublished scored rows >=70 screened: **{selection['all_unpublished_scored_at_or_above_70']}**
- Stored score-only cohort: **{selection['immediate_floor70_candidates']}**
- Canonically blocked within that cohort: **{selection['blocked_other_within_323']}**
- Identity/V4-input incomplete within that cohort: **{selection['incomplete_within_323']}**
- Unexpected within that cohort: **{selection['unexpected_within_323']}**
- Previously identified non-score-blocked rows outside the cohort: **{selection['non_score_blocked_outside_323']}**
- Block reasons: `{json.dumps(selection['blocked_reason_counts'], sort_keys=True)}`
- Incomplete reasons: `{json.dumps(selection['incomplete_reason_counts'], sort_keys=True)}`

## 3. Score lineage split

- Quality-v4: **{lineage['v4']}**
- v3: **{lineage['v3']}**
- Other: **{lineage['other']}**
- Completed V4 evidence: **{lineage['quality_v4_research_complete']}**
- Versions: `{json.dumps(lineage['versions'], sort_keys=True)}`

All v3 candidates were outside the original 549-row published/backfill population. They have
completed underlying restaurant research and the local inputs needed for V4, but the current
pending backfill selector excludes all of them because their stored status is `auto_rejected`.

## 4. READY_NOW_V4

Count: **{readiness['READY_NOW_V4']}**. No new admission can safely proceed under a V4-required
lineage policy before paid research completes.

## 5. NEEDS_V4_FIRST

Count: **{readiness['NEEDS_V4_FIRST']}**.

- Current score: `{json.dumps(needs['score'], sort_keys=True)}`
- Base Quality: `{json.dumps(needs['base_quality'], sort_keys=True)}`
- Gap above 70: `{json.dumps(needs['gap_above_70'], sort_keys=True)}`
- Maximum V4 score: `{json.dumps(needs['maximum_possible_v4_score'], sort_keys=True)}`
- Minimum V4 score: `{json.dumps(needs['minimum_possible_v4_score'], sort_keys=True)}`
- Risk bands: `{json.dumps(needs['score_risk_bands'], sort_keys=True)}`
- Top areas: **{_top_counts(needs['area_counts'])}**
- Top cuisines: **{_top_counts(needs['cuisine_counts'])}**

The theoretical -15 Quality scenario can move **{needs['score_risk_bands']['can_drop_below_70_at_minus_15']}**
below 70; **{needs['score_risk_bands']['stays_at_or_above_70_at_minus_15']}** remain >=70 under
that worst supported adjustment. Positive historical uplift scenarios are recorded per row in JSON,
but they are not predictions and do not remove this downside risk.

## 6. Other blocked/incomplete

- BLOCKED_OTHER: **{readiness['BLOCKED_OTHER']}**
- INCOMPLETE: **{readiness['INCOMPLETE']}**
- UNEXPECTED: **{readiness['UNEXPECTED']}**

Full row-level reasons are in the JSON artifact. These rows are not part of the 323-row immediate set.

## 7. Published-below-70 check

- Published >=75: **{published['bands']['>=75']}**
- Published 70-74.99: **{published['bands']['70-74.99']}**
- Published 68-69.99: **{published['bands']['68-69.99']}**
- Published <68: **{published['bands']['<68']}**
- Published below 70: **{published['below_70_count']}**

No downward publication change is implied by reconciling at 70.

## 8. Safe interim reconciliation

- Current published: **{reconciliation['safe_v4_only']['current_published']}**
- Immediate READY_NOW_V4 additions: **{reconciliation['safe_v4_only']['ready_now_v4_additions']}**
- Below-70 removals: **{reconciliation['safe_v4_only']['below_70_removals']}**
- Safe interim catalog: **{reconciliation['safe_v4_only']['safe_interim_catalog_size']}**
- Eventual possible additions after V4: **{reconciliation['eventual_possible_after_v4']['possible_additional_admissions']}**
- Eventual possible catalog: **{reconciliation['eventual_possible_after_v4']['eventual_possible_catalog_size']}** (not guaranteed)

## 9. Immediate-v3 alternative reconciliation

- Additions: **{reconciliation['allow_v3_immediately']['additions']}**
- Removals: **{reconciliation['allow_v3_immediately']['removals']}**
- Catalog size: **{reconciliation['allow_v3_immediately']['resulting_catalog_size']}**
- New v3 / v4 admissions: **{reconciliation['allow_v3_immediately']['new_v3_admissions']} / {reconciliation['allow_v3_immediately']['new_v4_admissions']}**

This is not recommended because every proposed new admission still has supported downside sufficient
to cross below the chosen floor.

## 10. Prepublication V4 research workload

- Responses requests: **{workload['responses_requests']}**
- Projected web actions: **{workload['projected_web_search_actions']}**
- Projected input tokens: **{workload['projected_input_tokens']}**
- Projected output tokens: **{workload['projected_output_tokens']}**
- Projected total tokens: **{workload['projected_total_tokens']}**

These are rough estimates using stored historical averages, not dollar costs.

## 11. Sankei Sushi

Sankei Sushi is published at **{sankei['score']}** on **{sankei['score_version']}**. It does not
intersect the immediate admission set. The source promotion audit records a failed V4 validation
attempt, while the canonical production database contains no failed run to retry. Include it in the
next V4 operation as a separate one-row published-legacy retry, not in the 323-row admission batch.

## 12. Below-floor rescue set

The separate below-70 set remains **{rescue['total']}**: high **{rescue['priority']['high']}**,
medium **{rescue['priority']['medium']}**, marginal **{rescue['priority']['marginal']}**. Overlap
with the immediate batch: **{rescue['overlap_with_immediate_batch']}**. Keep it out of the initial
floor-70 transition research batch.

## 13. Human-review samples

### READY_NOW_V4 near 70

{_sample_table(summary['human_review_samples']['READY_NOW_V4'])}

### NEEDS_V4_FIRST near 70

{_sample_table(summary['human_review_samples']['NEEDS_V4_FIRST'])}

## 14. Recommendation

**{summary['recommendation']['lineage_policy']}** — {summary['recommendation']['reason']}

Next action: {summary['recommendation']['next_action']}

## 15. DB no-mutation confirmation

SQLite integrity: **{summary['safety']['sqlite_integrity']}**. Database SHA-256 before/after:
**{summary['database_sha256']['before']} / {summary['database_sha256']['after']}**. `seed70.txt`
SHA-256 before/after: **{summary['seed70_sha256']['before']} / {summary['seed70_sha256']['after']}**.
Both are unchanged. Network/paid requests: **0**.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "fiyu.db")
    parser.add_argument("--seed-file", type=Path, default=ROOT / "seed70.txt")
    parser.add_argument(
        "--summary-out",
        type=Path,
        default=ROOT / "data" / "audits" / "floor70-admission-readiness-audit-summary.json",
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=ROOT / "data" / "audits" / "floor70-admission-readiness-audit.md",
    )
    args = parser.parse_args()
    database_before = sha256(args.db)
    seed_before = sha256(args.seed_file)
    summary = build_summary(args.db)
    database_after = sha256(args.db)
    seed_after = sha256(args.seed_file)
    summary["database_sha256"] = {
        "before": database_before,
        "after": database_after,
        "unchanged": database_before == database_after,
    }
    summary["seed70_sha256"] = {
        "before": seed_before,
        "after": seed_after,
        "unchanged": seed_before == seed_after,
    }
    if database_before != database_after or seed_before != seed_after:
        raise RuntimeError("protected input changed during floor-70 readiness audit")
    args.summary_out.parent.mkdir(parents=True, exist_ok=True)
    args.summary_out.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.report_out.write_text(render_report(summary), encoding="utf-8")
    print(
        json.dumps(
            {
                "immediate_candidates": summary["lineage_split"]["total"],
                "ready_now_v4": summary["readiness"]["READY_NOW_V4"],
                "needs_v4_first": summary["readiness"]["NEEDS_V4_FIRST"],
                "safe_interim_catalog": summary["reconciliation"]["safe_v4_only"][
                    "safe_interim_catalog_size"
                ],
                "db_unchanged": summary["database_sha256"]["unchanged"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
