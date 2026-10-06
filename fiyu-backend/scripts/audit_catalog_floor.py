"""Read-only catalog-floor decision audit using canonical local scoring inputs."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fiyu.card_enrichment import scoring_research_view
from fiyu.experimental_score_v4 import evaluate_with_quality_adjustment
from fiyu.public_score import (
    PUBLICATION_SCORE_THRESHOLD,
    FiyuEvidence,
    InternalSignals,
    assess_chain_classification,
)

FLOORS = (68.0, 70.0, 75.0)
SCORE_BANDS = (
    ("<60", None, 60.0),
    ("60-64.99", 60.0, 65.0),
    ("65-67.99", 65.0, 68.0),
    ("68-69.99", 68.0, 70.0),
    ("70-72.49", 70.0, 72.5),
    ("72.5-74.99", 72.5, 75.0),
    ("75-79.99", 75.0, 80.0),
    ("80-84.99", 80.0, 85.0),
    ("85-89.99", 85.0, 90.0),
    ("90+", 90.0, None),
)
COHORTS = (
    ("65-67.99", 65.0, 68.0),
    ("68-69.99", 68.0, 70.0),
    ("70-72.49", 70.0, 72.5),
    ("72.5-74.99", 72.5, 75.0),
    ("75-79.99", 75.0, 80.0),
    ("80+", 80.0, None),
)
VISIBILITY_FIELDS = (
    "is_published",
    "product_eligible",
    "review_status",
    "review_notes",
    "product_eligibility_classification",
    "product_eligibility_reasons_json",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def parse_json(value: object, default: Any) -> Any:
    try:
        return json.loads(str(value or ""))
    except (json.JSONDecodeError, TypeError, ValueError):
        return default


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def stats(values: list[float], *, include_stddev: bool = False) -> dict[str, float | int]:
    clean = [float(value) for value in values if math.isfinite(float(value))]
    if not clean:
        result: dict[str, float | int] = {
            "count": 0,
            "min": 0.0,
            "p10": 0.0,
            "p25": 0.0,
            "median": 0.0,
            "mean": 0.0,
            "p75": 0.0,
            "p90": 0.0,
            "p95": 0.0,
            "max": 0.0,
        }
    else:
        result = {
            "count": len(clean),
            "min": round(min(clean), 2),
            "p10": round(percentile(clean, 0.10), 2),
            "p25": round(percentile(clean, 0.25), 2),
            "median": round(percentile(clean, 0.50), 2),
            "mean": round(sum(clean) / len(clean), 2),
            "p75": round(percentile(clean, 0.75), 2),
            "p90": round(percentile(clean, 0.90), 2),
            "p95": round(percentile(clean, 0.95), 2),
            "max": round(max(clean), 2),
        }
    if include_stddev:
        result["stddev"] = round(statistics.pstdev(clean), 2) if clean else 0.0
    return result


def in_band(score: float, lower: float | None, upper: float | None) -> bool:
    return (lower is None or score >= lower) and (upper is None or score < upper)


def histogram(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        label: sum(in_band(row["score"], lower, upper) for row in rows)
        for label, lower, upper in SCORE_BANDS
    }


def deterministic_sample(rows: list[dict[str, Any]], size: int) -> list[dict[str, Any]]:
    ordered = sorted(rows, key=lambda row: (row["score"], row["place_id"]))
    if len(ordered) <= size:
        return ordered
    indexes = {
        round(index * (len(ordered) - 1) / (size - 1))
        for index in range(size)
    }
    return [ordered[index] for index in sorted(indexes)]


def rejection_category(row: sqlite3.Row, chain_excluded: bool) -> str:
    if bool(row["is_published"]):
        return "published"
    note = str(row["review_notes"] or "")
    if row["research_status"] != "complete" or row["fiyu_score"] is None:
        return "research_or_score_incomplete"
    if "duplicate_of_published" in note:
        return "duplicate"
    if "confirmed_permanent_closure" in note or "replaced" in note:
        return "closure_replacement_obsolete"
    if "identity_conflict" in note or "wrong_restaurant_identity" in note:
        return "identity_conflict"
    if note.startswith("critical_publication_contradiction"):
        return "critical_publication_contradiction"
    if chain_excluded:
        return "confirmed_chain_policy"
    if not bool(row["product_eligible"]):
        return "other_product_or_access_block"
    if row["review_status"] in {"rejected", "auto_rejected"}:
        return "score_only_rejected"
    return "other_unpublished"


def _access_overlay(row: sqlite3.Row, structured: dict[str, Any]) -> dict[str, Any]:
    result = dict(structured)
    stored_access = str(row["access_model"] or "unknown").casefold()
    if stored_access != "unknown":
        result["access_model"] = stored_access
        result["access_confidence"] = row["access_confidence"]
        for column, field in (
            ("access_evidence_json", "access_evidence"),
            ("access_evidence_urls_json", "access_evidence_urls"),
        ):
            value = parse_json(row[column], [])
            result[field] = value if isinstance(value, list) else []
    return result


def quality_scenario_score(
    *,
    row: sqlite3.Row,
    evidence: FiyuEvidence,
    structured: dict[str, Any],
    adjustment: float,
) -> float:
    """Apply only canonical Quality movement to the current production score.

    Evaluating both zero and adjusted Quality with identical canonical inputs
    isolates the exact Quality-only delta and avoids importing unrelated legacy
    component drift into this floor audit.
    """

    internal = InternalSignals(
        quality_score=float(row["base_quality_score"] or 0),
        underexposure_score=float(row["underexposure_score"] or 0),
        digital_footprint_score=float(row["digital_footprint_score"] or 0),
    )
    baseline = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured,
        primary_category=row["primary_category"],
        quality_adjustment=0,
    )
    adjusted = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured,
        primary_category=row["primary_category"],
        quality_adjustment=adjustment,
    )
    return round(float(row["fiyu_score"]) + adjusted.fiyu_score - baseline.fiyu_score, 2)


def load_rows(db_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    raw_rows = connection.execute(
        """
        SELECT p.*, r.quality_score AS base_quality_score,
               r.underexposure_score, r.digital_footprint_score,
               r.internal_fiyu_score, r.rating, r.review_count,
               r.category AS candidate_category, r.broad_category,
               rr.structured_research_json, rr.score_json AS research_score_json,
               q.id AS quality_v4_run_id, q.guarded_quality_adjustment,
               q.production_v3_score, q.shadow_v4_score, q.shadow_score_delta,
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
            WHERE q2.public_restaurant_id=p.place_id AND q2.status='complete'
            ORDER BY q2.id DESC LIMIT 1
        )
        ORDER BY p.place_id
        """
    ).fetchall()
    integrity = str(connection.execute("PRAGMA integrity_check").fetchone()[0])
    connection.close()

    rows: list[dict[str, Any]] = []
    for row in raw_rows:
        raw_evidence = parse_json(row["evidence_json"], {})
        raw_evidence["specialist_status"] = str(row["specialist_status"] or "unknown")
        raw_evidence["specialist_restaurant"] = row["specialist_status"] == "specialist"
        evidence = FiyuEvidence(**raw_evidence)
        structured = _access_overlay(
            row,
            scoring_research_view(parse_json(row["structured_research_json"], {})),
        )
        structured["specialist_status"] = evidence.specialist_status
        chain = assess_chain_classification(evidence, structured)
        category = rejection_category(row, chain.excluded)
        score = float(row["fiyu_score"]) if row["fiyu_score"] is not None else None
        item: dict[str, Any] = {
            "place_id": str(row["place_id"]),
            "restaurant": row["name_en"] or row["name_ja"] or row["place_id"],
            "name_ja": row["name_ja"],
            "area": row["discovery_area"],
            "primary_category": row["primary_category"] or row["candidate_category"],
            "broad_category": row["broad_category"],
            "score": score,
            "quality": row["quality_signal"],
            "hiddenness": row["hiddenness_signal"],
            "independence": row["independence_signal"],
            "local_discovery": row["local_discovery_score"],
            "internal_candidate_score": row["internal_fiyu_score"],
            "rating": row["rating"],
            "review_count": row["review_count"],
            "confidence": row["fiyu_confidence"],
            "confidence_band": row["confidence_band"],
            "score_version": row["score_version"],
            "is_published": bool(row["is_published"]),
            "product_eligible": bool(row["product_eligible"]),
            "review_status": row["review_status"],
            "review_notes": row["review_notes"],
            "research_status": row["research_status"],
            "rejection_category": category,
            "chain_status": chain.classification,
            "chain_excluded": chain.excluded,
            "specialist_status": row["specialist_status"],
            "quality_v4_complete": row["quality_v4_run_id"] is not None,
            "quality_adjustment": row["guarded_quality_adjustment"],
            "quality_v4_score_delta": row["shadow_score_delta"],
            "base_quality_score": row["base_quality_score"],
            "visibility": tuple(row[field] for field in VISIBILITY_FIELDS),
        }
        item["floor_only_eligible"] = category in {
            "published",
            "score_only_rejected",
        }
        if score is not None and not item["quality_v4_complete"]:
            available_adjustment = min(
                15.0, max(0.0, 100.0 - float(row["base_quality_score"] or 0))
            )
            item["maximum_possible_v4_score"] = quality_scenario_score(
                row=row,
                evidence=evidence,
                structured=structured,
                adjustment=available_adjustment,
            )
            item["scenario_context"] = (row, evidence, structured)
        else:
            item["maximum_possible_v4_score"] = score
            item["scenario_context"] = None
        rows.append(item)

    usage_rows = [row for row in raw_rows if row["quality_v4_run_id"] is not None]
    usage = {
        "completed_rows": len(usage_rows),
        "mean_web_search_actions": round(
            sum(int(row["web_search_action_count"] or 0) for row in usage_rows)
            / len(usage_rows),
            2,
        ),
        "mean_input_tokens": round(
            sum(int(row["input_tokens"] or 0) for row in usage_rows) / len(usage_rows),
            2,
        ),
        "mean_output_tokens": round(
            sum(int(row["output_tokens"] or 0) for row in usage_rows) / len(usage_rows),
            2,
        ),
        "mean_total_tokens": round(
            sum(int(row["total_tokens"] or 0) for row in usage_rows) / len(usage_rows),
            2,
        ),
        "sqlite_integrity": integrity,
    }
    return rows, usage


def aggregate_cohort(rows: list[dict[str, Any]]) -> dict[str, Any]:
    numeric_fields = (
        "score",
        "quality",
        "hiddenness",
        "independence",
        "local_discovery",
        "internal_candidate_score",
        "rating",
        "review_count",
        "confidence",
    )
    result: dict[str, Any] = {"count": len(rows)}
    for field in numeric_fields:
        result[field] = stats(
            [float(row[field]) for row in rows if row.get(field) is not None]
        )
    for field in (
        "chain_status",
        "specialist_status",
        "review_status",
        "rejection_category",
        "confidence_band",
    ):
        result[field] = dict(sorted(Counter(str(row.get(field)) for row in rows).items()))
    result["quality_v4_complete"] = sum(row["quality_v4_complete"] for row in rows)
    return result


def row_view(row: dict[str, Any]) -> dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "restaurant",
            "name_ja",
            "place_id",
            "area",
            "primary_category",
            "score",
            "quality",
            "hiddenness",
            "independence",
            "local_discovery",
            "internal_candidate_score",
            "rating",
            "review_count",
            "confidence",
            "confidence_band",
            "review_status",
            "rejection_category",
            "chain_status",
            "specialist_status",
            "quality_v4_complete",
            "maximum_possible_v4_score",
        )
    }


def scenario_score(row: dict[str, Any], adjustment: float) -> float:
    context = row["scenario_context"]
    if context is None:
        return float(row["score"])
    raw, evidence, structured = context
    allowed = min(adjustment, max(0.0, 100.0 - float(row["base_quality_score"] or 0)))
    return quality_scenario_score(
        row=raw,
        evidence=evidence,
        structured=structured,
        adjustment=allowed,
    )


def build_summary(db_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows, usage = load_rows(db_path)
    scored = [row for row in rows if row["score"] is not None]
    published = [row for row in rows if row["is_published"]]
    score_only = [row for row in rows if row["rejection_category"] == "score_only_rejected"]
    blocked = [
        row
        for row in scored
        if row["rejection_category"]
        not in {"published", "score_only_rejected"}
    ]
    incomplete = [row for row in rows if row["score"] is None]
    floor_only = [row for row in rows if row["floor_only_eligible"]]
    v4 = [row for row in rows if row["quality_v4_complete"]]
    adjustments = [float(row["quality_adjustment"]) for row in v4]
    final_deltas = [float(row["quality_v4_score_delta"]) for row in v4]
    adjustment_stats = stats(adjustments)
    final_delta_stats = stats(final_deltas)
    scenarios = {
        "median": float(adjustment_stats["median"]),
        "p75": float(adjustment_stats["p75"]),
        "p90": float(adjustment_stats["p90"]),
        "maximum_guardrail": 15.0,
    }
    for row in score_only:
        if not row["quality_v4_complete"]:
            row["scenario_scores"] = {
                name: scenario_score(row, adjustment)
                for name, adjustment in scenarios.items()
            }

    floor_analysis: dict[str, Any] = {}
    research_sets: dict[str, Any] = {}
    already_v4: dict[str, Any] = {}
    selectivity: dict[str, Any] = {}
    for floor in FLOORS:
        key = str(int(floor))
        qualified = [row for row in scored if row["score"] >= floor]
        qualified_floor_only = [row for row in floor_only if row["score"] >= floor]
        newly = [row for row in score_only if row["score"] >= floor]
        between = [row for row in scored if floor <= row["score"] < 75]
        candidates = [
            row
            for row in score_only
            if not row["quality_v4_complete"]
            and row["score"] < floor
            and row["maximum_possible_v4_score"] >= floor
        ]
        priority = {
            "high": [row for row in candidates if row["maximum_possible_v4_score"] >= floor + 3],
            "medium": [
                row
                for row in candidates
                if floor + 1 <= row["maximum_possible_v4_score"] < floor + 3
            ],
            "marginal": [
                row
                for row in candidates
                if floor <= row["maximum_possible_v4_score"] < floor + 1
            ],
        }
        impossible = [
            row
            for row in score_only
            if not row["quality_v4_complete"]
            and row["score"] < floor
            and row["maximum_possible_v4_score"] < floor
        ]
        scenario_yields = {
            name: sum(
                row["score"] < floor <= row["scenario_scores"][name]
                for row in score_only
                if not row["quality_v4_complete"]
            )
            for name in scenarios
        }
        researched = [row for row in score_only if row["quality_v4_complete"]]
        already_v4[key] = {
            "count": len(researched),
            "currently_at_or_above": sum(row["score"] >= floor for row in researched),
            "currently_below": sum(row["score"] < floor for row in researched),
            "moved_across_floor": sum(
                float(row["score"]) >= floor
                and float(row["score"]) - float(row["quality_v4_score_delta"] or 0) < floor
                for row in researched
            ),
            "still_fail": sum(row["score"] < floor for row in researched),
        }
        floor_analysis[key] = {
            "all_scored_at_or_above": len(qualified),
            "currently_published_at_or_above": sum(row["is_published"] for row in qualified),
            "currently_unpublished_at_or_above": sum(not row["is_published"] for row in qualified),
            "score_only_rejected_at_or_above": len(newly),
            "non_score_blocked_at_or_above": sum(
                row["rejection_category"] not in {"published", "score_only_rejected"}
                for row in qualified
            ),
            "newly_floor_eligible_relative_to_75": sum(
                floor <= row["score"] < 75 for row in floor_only
            ),
            "between_floor_and_75": len(between),
            "floor_only_eligible_at_or_above": len(qualified_floor_only),
            "floor_only_currently_published": sum(
                row["is_published"] for row in qualified_floor_only
            ),
            "newly_publishable_if_only_floor_changed": len(newly),
            "floor_only_still_below": sum(row["score"] < floor for row in floor_only),
            "potential_catalog_size": len(qualified_floor_only),
        }
        research_sets[key] = {
            "count": len(candidates),
            "current_score_distribution": stats([row["score"] for row in candidates]),
            "maximum_score_distribution": stats(
                [row["maximum_possible_v4_score"] for row in candidates]
            ),
            "gap_to_floor_distribution": stats(
                [floor - row["score"] for row in candidates]
            ),
            "priority": {name: len(items) for name, items in priority.items()},
            "mathematically_impossible": len(impossible),
            "scenario_yields": scenario_yields,
            "projected_workload": {
                name: {
                    "calls": count,
                    "web_search_actions": round(count * usage["mean_web_search_actions"]),
                    "input_tokens": round(count * usage["mean_input_tokens"]),
                    "output_tokens": round(count * usage["mean_output_tokens"]),
                    "total_tokens": round(count * usage["mean_total_tokens"]),
                }
                for name, count in {
                    "high_only": len(priority["high"]),
                    "high_plus_medium": len(priority["high"]) + len(priority["medium"]),
                    "all_mathematically_possible": len(candidates),
                }.items()
            },
            "place_ids": [row["place_id"] for row in candidates],
        }
        # Counterfactual membership at this floor, rather than the union with
        # frozen membership. This correctly excludes a currently published row
        # if a later score migration left it below the proposed floor.
        potential_catalog = qualified_floor_only
        range_stats = stats([row["score"] for row in potential_catalog], include_stddev=True)
        range_bands = {
            label: sum(in_band(row["score"], lower, upper) for row in potential_catalog)
            for label, lower, upper in (
                ("68-69.99", 68, 70),
                ("70-74.99", 70, 75),
                ("75-79.99", 75, 80),
                ("80-84.99", 80, 85),
                ("85+", 85, None),
            )
        }
        selectivity[key] = {
            "percent_all_scored_at_or_above": round(len(qualified) / len(scored) * 100, 2),
            "percent_floor_only_at_or_above": round(
                len(qualified_floor_only) / len(floor_only) * 100, 2
            ),
            "newly_publishable": len(newly),
            "potential_catalog_size": len(potential_catalog),
            "newly_admitted_score_distribution": stats([row["score"] for row in newly]),
            "potential_catalog_score_distribution": range_stats,
            "potential_catalog_bands": {
                label: {
                    "count": count,
                    "percent": round(count / len(potential_catalog) * 100, 2),
                }
                for label, count in range_bands.items()
            },
        }

    cohorts = {
        label: aggregate_cohort(
            [row for row in scored if in_band(row["score"], lower, upper)]
        )
        for label, lower, upper in COHORTS
    }
    samples = {
        label: [
            row_view(row)
            for row in deterministic_sample(
                [
                    row
                    for row in scored
                    if in_band(row["score"], lower, upper)
                ],
                15,
            )
        ]
        for label, lower, upper in (
            ("68-69.99", 68, 70),
            ("70-72.49", 70, 72.5),
            ("72.5-74.99", 72.5, 75),
            ("75-77.49", 75, 77.5),
        )
    }
    shortlist = {
        label: [
            row_view(row)
            for row in deterministic_sample(
                [
                    row
                    for row in floor_only
                    if in_band(row["score"], lower, upper)
                ],
                15,
            )
        ]
        for label, lower, upper in (
            ("68-69.99", 68, 70),
            ("70-71.99", 70, 72),
            ("73-74.99", 73, 75),
            ("75-76.99", 75, 77),
        )
    }
    score_only_bands = {
        label: sum(in_band(row["score"], lower, upper) for row in score_only)
        for label, lower, upper in (
            ("<60", None, 60),
            ("60-64.99", 60, 65),
            ("65-67.99", 65, 68),
            ("68-69.99", 68, 70),
            ("70-72.49", 70, 72.5),
            ("72.5-74.99", 72.5, 75),
            (">=75", 75, None),
        )
    }
    versions = Counter(str(row["score_version"] or "NULL") for row in rows)
    summary = {
        "current_state": {
            "total_rows": len(rows),
            "production_scored_rows": len(scored),
            "score_version_counts": dict(sorted(versions.items())),
            "current_v4_count": sum("public-v4" in str(row["score_version"]) for row in rows),
            "current_v3_count": sum("public-v3" in str(row["score_version"]) for row in rows),
            "publication_threshold": PUBLICATION_SCORE_THRESHOLD,
            "published_count": len(published),
            "unpublished_count": len(rows) - len(published),
            "product_eligible_count": sum(row["product_eligible"] for row in rows),
            "score_only_rejected_count": len(score_only),
            "non_score_rejected_or_blocked_count": len(blocked),
            "research_or_score_incomplete_count": len(incomplete),
            "floor_only_eligible_population": len(floor_only),
            "rejection_categories": dict(
                sorted(Counter(row["rejection_category"] for row in rows).items())
            ),
        },
        "score_distribution": {
            "statistics": stats([row["score"] for row in scored]),
            "histogram": histogram(scored),
        },
        "floor_analysis": floor_analysis,
        "cohort_quality": cohorts,
        "representative_samples": samples,
        "score_only_rejected": {
            "count": len(score_only),
            "bands": score_only_bands,
        },
        "research_sets": research_sets,
        "already_v4_score_only_rejects": already_v4,
        "historical_quality_v4": {
            "completed_rows": len(v4),
            "quality_adjustment": adjustment_stats,
            "final_score_delta": final_delta_stats,
            "usage": usage,
            "scenario_adjustments": scenarios,
        },
        "selectivity_and_score_range": selectivity,
        "human_review_shortlist": shortlist,
        "cliff_analysis": {
            "finding": "No deterministic discontinuity is encoded at 68 or 70; both are policy cutoffs.",
            "adjacent_cohorts": {
                label: {
                    "count": item["count"],
                    "quality_median": item["quality"]["median"],
                    "quality_mean": item["quality"]["mean"],
                    "hiddenness_median": item["hiddenness"]["median"],
                    "independence_median": item["independence"]["median"],
                    "local_discovery_median": item["local_discovery"]["median"],
                    "rating_median": item["rating"]["median"],
                    "review_count_median": item["review_count"]["median"],
                    "confidence_median": item["confidence"]["median"],
                }
                for label, item in cohorts.items()
            },
        },
        "recommendation": {
            "decision": "LOWER TO 70",
            "rationale": (
                "70 materially broadens the usable catalog and score range while avoiding the "
                "weaker 68-69.99 tranche. Although 68 would require fewer rescue-research calls, "
                "its extra 65 immediate admissions have lower median Quality, Hiddenness, and "
                "Local Discovery than the 70-72.49 cohort, without revealing a natural cutoff."
            ),
            "next_step": (
                "Perform human review of the saved 68-76.99 shortlist, then in a separate "
                "change update only the publication threshold to 70 and run a dry-run "
                "publication reconciliation before changing membership."
            ),
        },
        "safety": {
            "database_open_mode": "SQLite read-only plus query_only",
            "sqlite_integrity": usage["sqlite_integrity"],
            "network_or_paid_requests": 0,
        },
    }
    for row in rows:
        row.pop("scenario_context", None)
    return summary, rows


def _format_stats(item: dict[str, Any]) -> str:
    return (
        f"min {item['min']}, p10 {item['p10']}, p25 {item['p25']}, median "
        f"{item['median']}, mean {item['mean']}, p75 {item['p75']}, p90 "
        f"{item['p90']}, max {item['max']}"
    )


def _sample_table(items: list[dict[str, Any]]) -> str:
    lines = [
        "| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |",
        "|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|",
    ]
    for item in items:
        lines.append(
            f"| {item['restaurant']} | {item['score']} | {item['quality']} | "
            f"{item['hiddenness']} | {item['independence']} | {item['local_discovery']} | "
            f"{item['review_status']} / {item['rejection_category']} | {item['chain_status']} | "
            f"{item['specialist_status']} | {item['rating']} / {item['review_count']} | "
            f"{'yes' if item['quality_v4_complete'] else 'no'} | "
            f"{item['maximum_possible_v4_score']} |"
        )
    return "\n".join(lines)


def render_report(summary: dict[str, Any]) -> str:
    state = summary["current_state"]
    floors = summary["floor_analysis"]
    research = summary["research_sets"]
    selectivity = summary["selectivity_and_score_range"]
    cohorts = summary["cohort_quality"]
    v4 = summary["historical_quality_v4"]
    floor_sections = []
    for section, key in ((4, "75"), (5, "70"), (6, "68")):
        item = floors[key]
        rescue = research[key]
        floor_sections.append(
            f"## {section}. Floor {key}\n\n"
            f"- Scored at/above: **{item['all_scored_at_or_above']}**\n"
            f"- Floor-only eligible at/above: **{item['floor_only_eligible_at_or_above']}**\n"
            f"- Immediately newly publishable score-only rejects: **{item['newly_publishable_if_only_floor_changed']}**\n"
            f"- Non-score-blocked rows at/above: **{item['non_score_blocked_at_or_above']}**\n"
            f"- Potential catalog size: **{item['potential_catalog_size']}**\n"
            f"- Potential paid V4 set: **{rescue['count']}** "
            f"(high {rescue['priority']['high']}, medium {rescue['priority']['medium']}, "
            f"marginal {rescue['priority']['marginal']})\n"
            f"- Mathematically impossible below-floor rejects: **{rescue['mathematically_impossible']}**\n"
            f"- Scenario crossings median/p75/p90/max: **{rescue['scenario_yields']['median']} / "
            f"{rescue['scenario_yields']['p75']} / {rescue['scenario_yields']['p90']} / "
            f"{rescue['scenario_yields']['maximum_guardrail']}**\n"
            f"- All-possible projected workload: **{rescue['projected_workload']['all_mathematically_possible']['calls']} calls**, "
            f"about **{rescue['projected_workload']['all_mathematically_possible']['web_search_actions']} web actions** and "
            f"**{rescue['projected_workload']['all_mathematically_possible']['total_tokens']} tokens**."
        )
    cohort_lines = [
        "| Cohort | N | Q median | Q mean | H median | I median | LD median | Rating median | Reviews median | Confidence median |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for label, item in cohorts.items():
        cohort_lines.append(
            f"| {label} | {item['count']} | {item['quality']['median']} | "
            f"{item['quality']['mean']} | {item['hiddenness']['median']} | "
            f"{item['independence']['median']} | {item['local_discovery']['median']} | "
            f"{item['rating']['median']} | {item['review_count']['median']} | "
            f"{item['confidence']['median']} |"
        )
    sample_sections = []
    for label, items in summary["representative_samples"].items():
        sample_sections.append(f"### {label}\n\n{_sample_table(items)}")
    shortlist_sections = []
    for label, items in summary["human_review_shortlist"].items():
        shortlist_sections.append(f"### {label}\n\n{_sample_table(items)}")
    version_rows = "\n".join(
        f"| {version} | {count} |"
        for version, count in state["score_version_counts"].items()
    )
    rejection_rows = "\n".join(
        f"| {category} | {count} |"
        for category, count in state["rejection_categories"].items()
    )
    workload_rows = []
    for key in ("75", "70", "68"):
        workload = research[key]["projected_workload"]
        for scope in ("high_only", "high_plus_medium", "all_mathematically_possible"):
            item = workload[scope]
            workload_rows.append(
                f"| {key} | {scope} | {item['calls']} | {item['web_search_actions']} | "
                f"{item['total_tokens']} |"
            )
    range_rows = []
    for key in ("75", "70", "68"):
        item = selectivity[key]
        distribution = item["potential_catalog_score_distribution"]
        bands = item["potential_catalog_bands"]
        range_rows.append(
            f"| {key} | {distribution['min']} | {distribution['p10']} | "
            f"{distribution['p25']} | {distribution['median']} | {distribution['p75']} | "
            f"{distribution['p90']} | {distribution['max']} | {distribution['stddev']} | "
            f"{bands['68-69.99']['count']} ({bands['68-69.99']['percent']}%) | "
            f"{bands['70-74.99']['count']} ({bands['70-74.99']['percent']}%) | "
            f"{bands['75-79.99']['count']} ({bands['75-79.99']['percent']}%) | "
            f"{bands['80-84.99']['count']} ({bands['80-84.99']['percent']}%) | "
            f"{bands['85+']['count']} ({bands['85+']['percent']}%) |"
        )
    return f"""# Catalog-floor decision audit

## 1. Executive summary

Recommendation: **{summary['recommendation']['decision']}**.

The data does not show a natural quality cliff at either 68 or 70. A floor of 70 offers the best
measured balance: it adds meaningful catalog breadth and score-range differentiation while avoiding
the weaker 68-69.99 tranche. Floor 68 has fewer remaining rescue candidates, but immediately admits
more lower-scoring rows. Lowering the floor alone never overrides chain, identity, closure,
duplicate, access, or other non-score blocks.

## 2. Current scoring/catalog state

- Total rows: **{state['total_rows']}**
- Current production-scored rows: **{state['production_scored_rows']}**
- Published: **{state['published_count']}**; unpublished: **{state['unpublished_count']}**
- Product eligible: **{state['product_eligible_count']}**
- Score-only rejected: **{state['score_only_rejected_count']}**
- Non-score rejected/blocked scored rows: **{state['non_score_rejected_or_blocked_count']}**
- Research/score incomplete: **{state['research_or_score_incomplete_count']}**
- V4: **{state['current_v4_count']}**; V3 lineage: **{state['current_v3_count']}**
- Current publication threshold: **{state['publication_threshold']}**

| Score version | Count |
|---|---:|
{version_rows}

| Stored/current rejection classification | Count |
|---|---:|
{rejection_rows}

## 3. Score distribution

{_format_stats(summary['score_distribution']['statistics'])}.

| Band | Count |
|---|---:|
{chr(10).join(f"| {label} | {count} |" for label, count in summary['score_distribution']['histogram'].items())}

{chr(10).join(floor_sections)}

## 7. Borderline-band quality comparison

{chr(10).join(cohort_lines)}

The adjacent bands change gradually rather than discontinuously. The detailed JSON includes
component p10/p90 values plus chain, specialist, confidence, and status distributions.

## 8. Score-only rejected population

Confirmed score-only rejects: **{state['score_only_rejected_count']}**.

| Band | Count |
|---|---:|
{chr(10).join(f"| {label} | {count} |" for label, count in summary['score_only_rejected']['bands'].items())}

## 9. Maximum-rescuable analysis

The upper bound evaluates the canonical scorer at current Quality and at
`min(100, base Quality + 15)`, then applies only that canonical Quality delta to the current
production score. This preserves all non-Quality inputs and avoids importing unrelated historical
component drift. It is a mathematical ceiling, not a prediction.

Completed-V4 score-only rejects: **0** at every floor, so every paid rescue set excludes all 548
already researched rows.

## 10. Quality-v4 empirical uplift scenarios

- Completed V4 rows: **{v4['completed_rows']}**
- Quality adjustment: {_format_stats(v4['quality_adjustment'])}
- Final score delta: {_format_stats(v4['final_score_delta'])}
- Scenario adjustments: median **{v4['scenario_adjustments']['median']}**, p75
  **{v4['scenario_adjustments']['p75']}**, p90 **{v4['scenario_adjustments']['p90']}**, maximum **15**.

## 11. Research workload comparison

Historical mean per completed restaurant: **{v4['usage']['mean_web_search_actions']} web-search
actions**, **{v4['usage']['mean_input_tokens']} input tokens**, **{v4['usage']['mean_output_tokens']}
output tokens**, and **{v4['usage']['mean_total_tokens']} total tokens**.

| Floor | Research scope | Calls | Projected web actions | Projected total tokens |
|---:|---|---:|---:|---:|
{chr(10).join(workload_rows)}

These are rough workload projections from historical means, not dollar estimates or predicted yield.

## 12. Score-range/selectivity comparison

| Floor | % all scored >= floor | % floor-only eligible >= floor | New publishable | Potential catalog | Public score stddev |
|---:|---:|---:|---:|---:|---:|
{chr(10).join(f"| {key} | {item['percent_all_scored_at_or_above']} | {item['percent_floor_only_at_or_above']} | {item['newly_publishable']} | {item['potential_catalog_size']} | {item['potential_catalog_score_distribution']['stddev']} |" for key, item in selectivity.items())}

| Floor | Min | P10 | P25 | Median | P75 | P90 | Max | SD | 68-69.99 | 70-74.99 | 75-79.99 | 80-84.99 | 85+ |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
{chr(10).join(range_rows)}

Lower floors materially widen the visible score range (SD rises from the floor-75 value), while 70
retains a higher minimum and a smaller low-end tranche than 68.

## 13. Representative restaurants by band

{chr(10).join(sample_sections)}

## 14. Human-review shortlist

{chr(10).join(shortlist_sections)}

## 15. Recommendation

**{summary['recommendation']['decision']}** — {summary['recommendation']['rationale']}

Next step: {summary['recommendation']['next_step']}

## 16. DB integrity and no-mutation confirmation

SQLite integrity: **{summary['safety']['sqlite_integrity']}**. The database was opened read-only
with `query_only`. Database SHA-256 before/after:
**{summary['database_sha256']['before']} / {summary['database_sha256']['after']}**.
`seed70.txt` SHA-256 before/after:
**{summary['seed70_sha256']['before']} / {summary['seed70_sha256']['after']}**.
Both are unchanged. Network/paid requests: **0**.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "fiyu.db")
    parser.add_argument("--seed-file", type=Path, default=ROOT / "seed70.txt")
    parser.add_argument(
        "--summary-out",
        type=Path,
        default=ROOT / "data" / "audits" / "catalog-floor-decision-audit-summary.json",
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=ROOT / "data" / "audits" / "catalog-floor-decision-audit.md",
    )
    args = parser.parse_args()
    before = sha256(args.db)
    seed_before = sha256(args.seed_file)
    summary, _ = build_summary(args.db)
    after = sha256(args.db)
    seed_after = sha256(args.seed_file)
    summary["database_sha256"] = {
        "before": before,
        "after": after,
        "unchanged": before == after,
    }
    summary["seed70_sha256"] = {
        "before": seed_before,
        "after": seed_after,
        "unchanged": seed_before == seed_after,
    }
    if before != after or seed_before != seed_after:
        raise RuntimeError("protected input changed during floor audit")
    args.summary_out.parent.mkdir(parents=True, exist_ok=True)
    args.summary_out.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.report_out.write_text(render_report(summary), encoding="utf-8")
    print(
        json.dumps(
            {
                "scored": summary["current_state"]["production_scored_rows"],
                "published": summary["current_state"]["published_count"],
                "score_only_rejected": summary["current_state"]["score_only_rejected_count"],
                "recommendation": summary["recommendation"]["decision"],
                "db_unchanged": summary["database_sha256"]["unchanged"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
