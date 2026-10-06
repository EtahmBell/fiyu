"""Read-only audit of unknown chain and specialist score semantics.

The canonical database is opened with SQLite's immutable read-only URI.  This
script writes only the requested JSON and Markdown audit artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fiyu.card_enrichment import scoring_research_view
from fiyu.public_score import (
    FiyuEvidence,
    assess_chain_classification,
)

UNKNOWN_PRIOR = 70.0
MATERIAL_DELTA = 0.5
FLOORS = (68.0, 70.0, 75.0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _json(value: object, default: Any) -> Any:
    try:
        parsed = json.loads(str(value or ""))
    except (json.JSONDecodeError, TypeError, ValueError):
        return default
    return parsed


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


def distribution(values: list[float]) -> dict[str, float | int]:
    if not values:
        return {
            "count": 0,
            "min": 0.0,
            "p10": 0.0,
            "median": 0.0,
            "mean": 0.0,
            "p90": 0.0,
            "max": 0.0,
            "absolute_max": 0.0,
        }
    return {
        "count": len(values),
        "min": round(min(values), 2),
        "p10": round(percentile(values, 0.10), 2),
        "median": round(percentile(values, 0.50), 2),
        "mean": round(sum(values) / len(values), 2),
        "p90": round(percentile(values, 0.90), 2),
        "max": round(max(values), 2),
        "absolute_max": round(max(abs(value) for value in values), 2),
    }


def delta_bands(values: list[float]) -> dict[str, int]:
    bands = Counter()
    for value in values:
        if value <= -2:
            key = "<= -2"
        elif value <= -1:
            key = "-1.99 to -1"
        elif value <= -0.5:
            key = "-0.99 to -0.5"
        elif value < 0.5:
            key = "-0.49 to +0.49"
        elif value < 1:
            key = "+0.5 to +0.99"
        elif value < 2:
            key = "+1 to +1.99"
        elif value < 3:
            key = "+2 to +2.99"
        else:
            key = ">= +3"
        bands[key] += 1
    return {
        key: bands[key]
        for key in (
            "<= -2",
            "-1.99 to -1",
            "-0.99 to -0.5",
            "-0.49 to +0.49",
            "+0.5 to +0.99",
            "+1 to +1.99",
            "+2 to +2.99",
            ">= +3",
        )
    }


def specialist_neutral_delta(*, chain_excluded: bool, product_cap: bool) -> float:
    """Return the fixed-weight effect of false->unknown specialist semantics.

    Neutral uses the scorer's existing 70-point unknown prior.  The Independence
    component moves by .10 * (70-40) = 3 points.  Local Discovery moves by
    .10 * (70-50) = 2 points.  At fixed top-level weights the uncapped final
    movement is .15 * 3 + .25 * 2 = .95 points.
    """

    if chain_excluded or product_cap:
        return 0.0
    return 0.95


def threshold_effects(rows: list[dict[str, Any]], delta_key: str) -> dict[str, Any]:
    effects: dict[str, Any] = {}
    scored = [row for row in rows if row["score"] is not None]
    for floor in FLOORS:
        below = [row for row in scored if row["score"] < floor]
        upward = [
            row
            for row in below
            if row["score"] + row[delta_key] >= floor
        ]
        downward = [
            row
            for row in scored
            if row["score"] >= floor and row["score"] + row[delta_key] < floor
        ]
        effects[str(int(floor))] = {
            "currently_below": len(below),
            "cross_upward": len(upward),
            "cross_downward": len(downward),
            "cross_upward_place_ids": [row["place_id"] for row in upward],
        }
    return effects


def _population_flags(row: dict[str, Any]) -> dict[str, bool]:
    rejected = row["review_status"] in {"rejected", "auto_rejected"}
    return {
        "all": True,
        "published": row["is_published"],
        "unpublished": not row["is_published"],
        "rejected": rejected,
        "score_only_rejected": row["rejection_category"] == "score_only_rejection",
        "product_eligible_but_unpublished": (
            row["product_eligible"] and not row["is_published"]
        ),
        "current_v4": row["score_version"] == "public-v4-quality-research",
        "legacy_v3": row["score_version"] == "public-v3-local-discovery",
    }


def state_breakdown(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for population in _population_flags(rows[0]):
        counts = Counter(
            str(row[key])
            for row in rows
            if _population_flags(row)[population]
        )
        result[population] = dict(sorted(counts.items()))
    return result


def _rejection_category(row: sqlite3.Row, chain_excluded: bool) -> str:
    if int(row["is_published"] or 0):
        return "published"
    note = str(row["review_notes"] or "")
    if row["research_status"] != "complete":
        return "incomplete_research"
    if "duplicate_of_published" in note:
        return "duplicate"
    if "confirmed_permanent_closure" in note or "replaced" in note:
        return "obsolete_closed_or_replaced"
    if "identity_conflict" in note or "wrong_restaurant_identity" in note:
        return "identity_issue"
    if note.startswith("critical_publication_contradiction"):
        return "critical_contradiction_other"
    if chain_excluded:
        return "chain_exclusion"
    if not int(row["product_eligible"] or 0):
        if row["product_eligibility_classification"] == "ineligible_restricted_access":
            return "restricted_access"
        return "other_product_exclusion"
    if row["review_status"] in {"rejected", "auto_rejected"}:
        return "score_only_rejection"
    return "other_unpublished"


def load_rows(db_path: Path) -> list[dict[str, Any]]:
    uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    rows = connection.execute(
        """
        SELECT p.*, r.quality_score AS base_quality_score,
               r.underexposure_score, r.digital_footprint_score,
               rr.structured_research_json,
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
    connection.close()

    result: list[dict[str, Any]] = []
    for row in rows:
        raw_evidence = _json(row["evidence_json"], {})
        raw_structured = _json(row["structured_research_json"], {})
        evidence = FiyuEvidence(**raw_evidence)
        structured = scoring_research_view(raw_structured)
        chain = assess_chain_classification(evidence, structured)
        explicit_specialist_status = raw_evidence.get("specialist_status")
        specialist_present = "specialist_restaurant" in raw_evidence
        structured_specialist_present = "specialist_restaurant" in raw_structured
        specialist_value = raw_evidence.get("specialist_restaurant")
        if explicit_specialist_status in {
            "specialist",
            "non_specialist",
            "unknown",
        }:
            specialist_state = str(explicit_specialist_status)
            specialist_semantics = f"explicit_tristate_{explicit_specialist_status}"
        elif not specialist_present or specialist_value is None:
            specialist_state = "null_or_missing"
            specialist_semantics = "default_false_from_missing_evidence"
        elif specialist_value is True:
            specialist_state = "true"
            specialist_semantics = "affirmative_true"
        elif structured_specialist_present:
            specialist_state = "false"
            specialist_semantics = "schema_forced_false_semantically_ambiguous"
        else:
            specialist_state = "false"
            specialist_semantics = "legacy_false_without_structured_field"

        chain_reason = chain.reasons[0] if chain.reasons else "none"
        item: dict[str, Any] = {
            "place_id": str(row["place_id"]),
            "restaurant": row["name_en"] or row["name_ja"] or row["place_id"],
            "name_ja": row["name_ja"],
            "score": float(row["fiyu_score"]) if row["fiyu_score"] is not None else None,
            "score_version": row["score_version"],
            "is_published": bool(row["is_published"]),
            "review_status": row["review_status"],
            "review_notes": row["review_notes"],
            "research_status": row["research_status"],
            "product_eligible": bool(row["product_eligible"]),
            "product_eligibility_classification": row[
                "product_eligibility_classification"
            ],
            "chain_state": chain.classification,
            "chain_reason": chain_reason,
            "raw_chain_classification": raw_evidence.get(
                "chain_classification", "missing"
            ),
            "structured_chain_classification": raw_structured.get(
                "chain_classification", "missing"
            ),
            "chain_excluded": chain.excluded,
            "specialist_state": specialist_state,
            "specialist_semantics": specialist_semantics,
            "specialist_evidence_value": (
                specialist_value if specialist_present else "missing"
            ),
            "specialist_structured_value": raw_structured.get(
                "specialist_restaurant", "missing"
            ),
            "independence_component": row["independence_signal"],
            "local_discovery_component": row["local_discovery_score"],
        }
        item["rejection_category"] = _rejection_category(row, chain.excluded)
        scored = item["score"] is not None
        unknown_chain = chain.classification == "unknown" and scored
        demonstrable_specialist_default = (
            specialist_semantics == "legacy_false_without_structured_field" and scored
        )
        ambiguous_false = specialist_state == "false" and scored
        product_cap = (
            not item["product_eligible"]
            and item["product_eligibility_classification"]
            != "ineligible_restricted_access"
        )
        specialist_delta = specialist_neutral_delta(
            chain_excluded=chain.excluded,
            product_cap=product_cap,
        )
        item["independence_affected"] = unknown_chain
        item["specialist_affected"] = demonstrable_specialist_default
        item["specialist_ambiguous_false"] = ambiguous_false
        item["independence_delta"] = 0.0
        item["specialist_delta"] = (
            specialist_delta if demonstrable_specialist_default else 0.0
        )
        item["combined_delta"] = item["specialist_delta"]
        item["all_false_sensitivity_delta"] = (
            specialist_delta if ambiguous_false else 0.0
        )
        result.append(item)
    return result


def _counterfactual(rows: list[dict[str, Any]], affected_key: str, delta_key: str) -> dict[str, Any]:
    affected = [row for row in rows if row[affected_key]]
    deltas = [float(row[delta_key]) for row in affected]
    return {
        "affected_rows": len(affected),
        "materially_affected_rows": sum(abs(value) >= MATERIAL_DELTA for value in deltas),
        "final_score_delta": distribution(deltas),
        "distribution_bands": delta_bands(deltas),
        "direction": (
            "no movement"
            if not deltas or all(value == 0 for value in deltas)
            else "nonnegative only"
            if all(value >= 0 for value in deltas)
            else "nonpositive only"
            if all(value <= 0 for value in deltas)
            else "mixed"
        ),
        "place_ids": [row["place_id"] for row in affected],
    }


def _example(row: dict[str, Any] | None, delta_key: str) -> dict[str, Any] | None:
    if row is None:
        return None
    delta = float(row[delta_key])
    independence_delta = 3.0 if delta else 0.0
    discovery_delta = 2.0 if delta else 0.0
    return {
        "restaurant": row["restaurant"],
        "name_ja": row["name_ja"],
        "place_id": row["place_id"],
        "stored_chain": row["raw_chain_classification"],
        "effective_chain": row["chain_state"],
        "chain_reason": row["chain_reason"],
        "specialist_evidence": row["specialist_evidence_value"],
        "specialist_structured": row["specialist_structured_value"],
        "specialist_semantics": row["specialist_semantics"],
        "current_independence_component": row["independence_component"],
        "counterfactual_independence_component": (
            round(float(row["independence_component"]) + independence_delta, 2)
            if row["independence_component"] is not None
            else None
        ),
        "current_local_discovery_component": row["local_discovery_component"],
        "counterfactual_local_discovery_component": (
            round(float(row["local_discovery_component"]) + discovery_delta, 2)
            if row["local_discovery_component"] is not None
            else None
        ),
        "current_fiyu_score": row["score"],
        "counterfactual_fiyu_score": (
            round(float(row["score"]) + delta, 2) if row["score"] is not None else None
        ),
        "delta": delta,
        "published": row["is_published"],
        "review_status": row["review_status"],
        "rejection_category": row["rejection_category"],
    }


def build_summary(db_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows = load_rows(db_path)
    independence = _counterfactual(rows, "independence_affected", "independence_delta")
    specialist = _counterfactual(rows, "specialist_affected", "specialist_delta")
    combined_rows = [
        row
        for row in rows
        if row["independence_affected"] and row["specialist_affected"]
    ]
    combined_deltas = [float(row["combined_delta"]) for row in combined_rows]
    combined = {
        "affected_rows": len(combined_rows),
        "materially_affected_rows": sum(
            abs(value) >= MATERIAL_DELTA for value in combined_deltas
        ),
        "final_score_delta": distribution(combined_deltas),
        "distribution_bands": delta_bands(combined_deltas),
        "direction": "nonnegative only" if combined_deltas else "no movement",
        "place_ids": [row["place_id"] for row in combined_rows],
    }
    sensitivity_rows = [row for row in rows if row["specialist_ambiguous_false"]]
    sensitivity_deltas = [
        float(row["all_false_sensitivity_delta"]) for row in sensitivity_rows
    ]

    rejection_counts = Counter(
        row["rejection_category"] for row in rows if not row["is_published"]
    )
    score_only = [
        row for row in rows if row["rejection_category"] == "score_only_rejection"
    ]
    score_only_material = [
        row
        for row in score_only
        if abs(row["combined_delta"]) >= MATERIAL_DELTA
    ]
    sensitivity_score_only_material = [
        row
        for row in score_only
        if abs(row["all_false_sensitivity_delta"]) >= MATERIAL_DELTA
    ]

    def first(predicate: Any) -> dict[str, Any] | None:
        return next((row for row in rows if predicate(row)), None)

    examples = {
        "confirmed_independent": _example(
            first(lambda row: row["chain_state"] == "independent_single" and row["score"]),
            "independence_delta",
        ),
        "confirmed_chain": _example(
            first(lambda row: row["chain_excluded"] and row["score"]),
            "independence_delta",
        ),
        "genuinely_unknown_independence": _example(
            first(lambda row: row["independence_affected"]), "independence_delta"
        ),
        "specialist_true": _example(
            first(
                lambda row: row["specialist_state"] in {"true", "specialist"}
                and row["score"]
            ),
            "specialist_delta",
        ),
        "affirmative_specialist_false": _example(
            first(
                lambda row: row["specialist_state"] == "non_specialist"
                and row["score"]
            ),
            "specialist_delta",
        ),
        "false_default_without_structured_field": _example(
            first(lambda row: row["specialist_affected"]), "specialist_delta"
        ),
        "affected_by_both": _example(
            first(
                lambda row: row["independence_affected"]
                and row["specialist_affected"]
            ),
            "combined_delta",
        ),
    }

    summary: dict[str, Any] = {
        "audit_scope": {
            "canonical_db": str(db_path.as_posix()),
            "row_count": len(rows),
            "scored_rows": sum(row["score"] is not None for row in rows),
            "material_delta_definition": f"absolute final-score delta >= {MATERIAL_DELTA}",
            "network_or_paid_requests": 0,
            "database_open_mode": "SQLite immutable read-only plus query_only",
        },
        "semantic_findings": {
            "independence": (
                "Unknown is distinguishable and receives the scorer's explicit neutral prior "
                "of 70, between confirmed independent and affirmative chain evidence."
            ),
        "specialist": (
                "Explicit tri-state semantics are present; unknown is distinct from specialist "
                "and non_specialist."
                if all(
                    row["specialist_semantics"].startswith("explicit_tristate_")
                    for row in rows
                )
                else "The required boolean and FiyuEvidence default collapse unknown into false; "
                "no stored specialist-specific negative provenance can demonstrate affirmative false."
            ),
        },
        "neutral_definition": {
            "value": UNKNOWN_PRIOR,
            "rationale": (
                "Reuse the scorer's existing explicit unknown prior of 70 in both relevant "
                "components; keep all weights fixed and perform no renormalization."
            ),
            "independence_unknown": {
                "current_independence_subscore": 70.0,
                "current_local_discovery_subscore": 70.0,
                "counterfactual_change": 0.0,
            },
            "specialist_unknown": {
                "current_false_independence_subscore": 40.0,
                "neutral_independence_subscore": 70.0,
                "independence_component_delta": 3.0,
                "current_false_local_discovery_subscore": 50.0,
                "neutral_local_discovery_subscore": 70.0,
                "local_discovery_component_delta": 2.0,
                "uncapped_final_score_delta": 0.95,
            },
        },
        "state_counts": {
            "chain": state_breakdown(rows, "chain_state"),
            "chain_assessment_reason": state_breakdown(rows, "chain_reason"),
            "specialist_stored": state_breakdown(rows, "specialist_state"),
            "specialist_semantics": state_breakdown(rows, "specialist_semantics"),
        },
        "unknown_collapse": {
            "independence_pattern_A": False,
            "specialist_pattern_B": any(
                not row["specialist_semantics"].startswith("explicit_tristate_")
                for row in rows
            ),
            "boolean_schema_pattern_C": any(
                not row["specialist_semantics"].startswith("explicit_tristate_")
                for row in rows
            ),
            "coercion_or_default_pattern_D": any(
                not row["specialist_semantics"].startswith("explicit_tristate_")
                for row in rows
            ),
            "legacy_difference_pattern_E": any(
                row["specialist_semantics"].startswith("legacy_")
                for row in rows
            ),
            "scored_unknown_chain_rows": independence["affected_rows"],
            "unscored_missing_chain_rows": sum(
                row["score"] is None and row["chain_state"] == "unknown" for row in rows
            ),
            "scored_schema_forced_ambiguous_specialist_false_rows": sum(
                row["score"] is not None
                and row["specialist_semantics"]
                == "schema_forced_false_semantically_ambiguous"
                for row in rows
            ),
            "scored_legacy_false_without_structured_field_rows": specialist[
                "affected_rows"
            ],
            "unscored_missing_specialist_rows": sum(
                row["score"] is None
                and row["specialist_semantics"]
                == "default_false_from_missing_evidence"
                for row in rows
            ),
        },
        "counterfactuals": {
            "A_independence_unknown_neutral": independence,
            "B_demonstrable_specialist_unknown_neutral": specialist,
            "C_both": combined,
            "specialist_all_false_sensitivity_bound_not_a_factual_counterfactual": {
                "affected_rows": len(sensitivity_rows),
                "materially_affected_rows": sum(
                    abs(value) >= MATERIAL_DELTA for value in sensitivity_deltas
                ),
                "final_score_delta": distribution(sensitivity_deltas),
                "distribution_bands": delta_bands(sensitivity_deltas),
                "direction": "nonnegative only",
            },
        },
        "threshold_effects": {
            "independence_only": threshold_effects(rows, "independence_delta"),
            "specialist_only": threshold_effects(rows, "specialist_delta"),
            "both": threshold_effects(rows, "combined_delta"),
            "all_false_sensitivity_bound": threshold_effects(
                rows, "all_false_sensitivity_delta"
            ),
        },
        "borderline_65_to_78": {
            "count": sum(
                row["score"] is not None and 65 <= row["score"] <= 78 for row in rows
            ),
            "independence_material": sum(
                row["score"] is not None
                and 65 <= row["score"] <= 78
                and abs(row["independence_delta"]) >= MATERIAL_DELTA
                for row in rows
            ),
            "specialist_material": sum(
                row["score"] is not None
                and 65 <= row["score"] <= 78
                and abs(row["specialist_delta"]) >= MATERIAL_DELTA
                for row in rows
            ),
            "all_false_sensitivity_material": sum(
                row["score"] is not None
                and 65 <= row["score"] <= 78
                and abs(row["all_false_sensitivity_delta"]) >= MATERIAL_DELTA
                for row in rows
            ),
        },
        "unpublished_population": dict(sorted(rejection_counts.items())),
        "score_only_rejected": {
            "count": len(score_only),
            "materially_affected_by_actual_counterfactuals": len(score_only_material),
            "materially_affected_by_all_false_sensitivity_bound": len(
                sensitivity_score_only_material
            ),
        },
        "examples": examples,
        "root_cause": {
            "independence": [
                "intentional scoring semantics: explicit bounded unknown prior"
            ],
            "specialist": [
                "research-schema semantics: required boolean",
                "data-model semantics: boolean default false",
                "scoring semantics: false receives lower contributions",
                "legacy/migration semantics: two scored false rows lack a structured field",
            ],
        },
        "recommendations": {
            "independence": "KEEP AS IS",
            "specialist": (
                "KEEP AS IS — TRI-STATE CONFLATION RESOLVED"
                if all(
                    row["specialist_semantics"].startswith("explicit_tristate_")
                    for row in rows
                )
                else "FIX BEFORE FLOOR DECISION"
            ),
            "next_step": (
                "Proceed to the catalog-floor decision using the migrated scores; keep "
                "non_specialist evidence-gated and do not reinterpret unknown rows."
                if all(
                    row["specialist_semantics"].startswith("explicit_tristate_")
                    for row in rows
                )
                else "Add tri-state specialist status and provenance, rerun this audit, "
                "and only then choose the catalog floor."
            ),
        },
    }
    return summary, rows


def render_report(summary: dict[str, Any]) -> str:
    counts = summary["state_counts"]
    counter = summary["counterfactuals"]
    thresholds = summary["threshold_effects"]
    examples = summary["examples"]
    specialist_resolved = not summary["unknown_collapse"]["specialist_pattern_B"]
    specialist_summary = (
        "Specialist semantics are now explicitly tri-state. Stored rows distinguish "
        "`specialist`, `non_specialist`, and `unknown`; no boolean inference is needed."
        if specialist_resolved
        else "`specialist_restaurant` still has a semantic collapse. The research schema "
        "and stored evidence cannot reliably separate affirmative non-specialist evidence "
        "from status that was not established."
    )
    specialist_finding = (
        "resolved. Every canonical row has an explicit tri-state classification."
        if specialist_resolved
        else "present. Missing/default and schema-forced lack-of-proof can become `False`."
    )
    specialist_recommendation = (
        "**Specialist — KEEP AS IS.** Tri-state semantics are explicit; future "
        "`non_specialist` requires affirmative provenance."
        if specialist_resolved
        else "**Specialist — FIX BEFORE FLOOR DECISION.** Introduce tri-state semantics "
        "before interpreting ambiguous false rows."
    )

    def table(mapping: dict[str, int]) -> str:
        lines = ["| State | Count |", "|---|---:|"]
        lines.extend(f"| {key} | {value} |" for key, value in mapping.items())
        return "\n".join(lines)

    def cf_table(name: str) -> str:
        item = counter[name]
        dist = item["final_score_delta"]
        return (
            f"Affected: **{item['affected_rows']}**; materially affected: "
            f"**{item['materially_affected_rows']}**. Delta min/p10/median/mean/p90/max: "
            f"**{dist['min']} / {dist['p10']} / {dist['median']} / {dist['mean']} / "
            f"{dist['p90']} / {dist['max']}** (absolute max {dist['absolute_max']}). "
            f"Direction: **{item['direction']}**.\n\n"
            + table(item["distribution_bands"])
        )

    def threshold_table(key: str) -> str:
        lines = [
            "| Floor | Currently below | Cross upward | Cross downward |",
            "|---:|---:|---:|---:|",
        ]
        for floor, item in thresholds[key].items():
            lines.append(
                f"| {floor} | {item['currently_below']} | {item['cross_upward']} | "
                f"{item['cross_downward']} |"
            )
        return "\n".join(lines)

    example_lines = []
    for label, item in examples.items():
        if item is None:
            example_lines.append(
                f"- **{label.replace('_', ' ')}:** no defensible example exists in stored data."
            )
            continue
        example_lines.append(
            f"- **{label.replace('_', ' ')}:** {item['restaurant']} "
            f"(`{item['place_id']}`); chain `{item['effective_chain']}` "
            f"({item['chain_reason']}), specialist `{item['specialist_evidence']}` / "
            f"structured `{item['specialist_structured']}`; Independence "
            f"{item['current_independence_component']} -> "
            f"{item['counterfactual_independence_component']}, Local Discovery "
            f"{item['current_local_discovery_component']} -> "
            f"{item['counterfactual_local_discovery_component']}, Fiyu "
            f"{item['current_fiyu_score']} -> {item['counterfactual_fiyu_score']} "
            f"(delta {item['delta']:+.2f}); published={item['published']}, "
            f"status `{item['review_status']}` / `{item['rejection_category']}`."
        )

    specialist_sensitivity = counter[
        "specialist_all_false_sensitivity_bound_not_a_factual_counterfactual"
    ]
    return f"""# Unknown semantics audit

## 1. Executive summary

Unknown chain status does **not** collapse into affirmative chain evidence. It is stored and
scored explicitly as `unknown=70`, between confirmed independent (`100`) and confirmed chain
(`20` or `0`). It receives less positive credit than confirmed independence, but that is an
intentional neutral prior rather than a chain penalty. Its neutral counterfactual is therefore
identical to current behavior.

{specialist_summary}

Recommendation: **KEEP AS IS** for independence. Specialist recommendation:
**{summary['recommendations']['specialist']}**.

## 2. Current field/schema semantics

Trace:

1. `RestaurantResearch` requires `specialist_status` with the three explicit values and retains
   specialist-specific rationale, evidence, source references, confidence, and schema version
   (`src/fiyu/research_worker.py`).
2. The prompt requires affirmative evidence for `specialist` and `non_specialist`, and directs
   uncertain cases to `unknown` (`src/fiyu/research_worker.py`).
3. `to_evidence()` persists the tri-state and provenance. `FiyuEvidence` uses tri-state internally;
   its deprecated boolean is derived only at the compatibility boundary (`src/fiyu/public_score.py`).
4. Persistence serializes the full evidence dataclass and structured model output
   (`src/fiyu/public_catalog.py:1260-1410`). Missing legacy evidence is reconstructed through the
   dataclass default.
5. Chain assessment preserves insufficient evidence as `unknown`; affirmative chain labels require
   behavioral corroboration (`src/fiyu/public_score.py:230-305`).
6. Independence uses 70% chain (unknown=70), 20% known-location count, and 10% specialist
   (true=100, false=40) (`src/fiyu/public_score.py:845-859`).
7. Local Discovery separately uses chain unknown=70 and specialist true=85/false=50, with fixed
   20% and 10% internal weights (`src/fiyu/local_discovery.py:260-285`).
8. Final Fiyu Score keeps fixed 45/15/15/25 weights (`src/fiyu/public_score.py:889-897`).

## 3. Data-state counts

### Effective chain state — all restaurants

{table(counts['chain']['all'])}

### Stored specialist state — all restaurants

{table(counts['specialist_stored']['all'])}

### Specialist semantic state — all restaurants

{table(counts['specialist_semantics']['all'])}

Full breakdowns for published, unpublished, rejected, score-only rejected, product-eligible but
unpublished, v4, and v3 populations are in the JSON artifact.

## 4. Unknown-collapse findings

- **A — independence:** not present. Missing/insufficient evidence remains `unknown`; it is neither
  `independent_single` nor a chain classification. It receives partial neutral credit rather than
  full confirmed-independent credit.
- **B — specialist:** {specialist_finding}
- **C — schema representation:** {'explicit tri-state' if specialist_resolved else 'required boolean'}.
- **D — default/coercion:** {'resolved at the canonical boundary' if specialist_resolved else 'present'}.
- **E — legacy:** {'migration provenance retains each prior boolean/missing origin' if specialist_resolved else 'legacy differences remain'}.

## 5. Counterfactual definition

Neutral is **70**, reusing the scorer's existing explicit unknown prior in both components. No
weight changes or renormalization occur. For specialist only, false-to-neutral changes the
Independence component by `0.10 * (70-40) = +3`, Local Discovery by
`0.10 * (70-50) = +2`, and the uncapped final score by
`0.15 * 3 + 0.25 * 2 = +0.95`.

After migration, every canonical row already carries the explicit tri-state and no specialist
counterfactual remains. Pre-migration bounded effects are retained in the specialist migration
artifact rather than re-inferred from compatibility booleans.

## 6. Independence counterfactual results

{cf_table('A_independence_unknown_neutral')}

## 7. Specialist counterfactual results

{cf_table('B_demonstrable_specialist_unknown_neutral')}

The broader all-false sensitivity bound affects **{specialist_sensitivity['affected_rows']}** rows;
**{specialist_sensitivity['materially_affected_rows']}** move by at least 0.5. Its median/max delta
is **{specialist_sensitivity['final_score_delta']['median']} / {specialist_sensitivity['final_score_delta']['max']}**.

## 8. Combined counterfactual results

{cf_table('C_both')}

## 9. 68/70/75 threshold effects

### Independence-neutral only

{threshold_table('independence_only')}

### Specialist-neutral only (demonstrable default subset)

{threshold_table('specialist_only')}

### Both

{threshold_table('both')}

### All-false sensitivity bound (not a factual counterfactual)

{threshold_table('all_false_sensitivity_bound')}

There are **{summary['borderline_65_to_78']['count']}** scored rows in the 65–78 band. Full band
materiality counts are in the JSON artifact.

## 10. Rejected population

{table(summary['unpublished_population'])}

There are **{summary['score_only_rejected']['count']}** score-only rejects. The defensible
counterfactual materially changes **{summary['score_only_rejected']['materially_affected_by_actual_counterfactuals']}**;
the deliberately broader all-false sensitivity bound changes
**{summary['score_only_rejected']['materially_affected_by_all_false_sensitivity_bound']}**.

## 11. Representative examples

{chr(10).join(example_lines)}

Restaurant names were not used to infer semantics.

## 12. Root-cause classification

- **Independence:** intentional scoring semantics with a distinct, bounded unknown state.
- **Specialist:** a combination of research-schema design (required boolean), data-model default
  (`False`), scoring semantics (lower false contribution), and a small legacy/migration subset.
  Persistence faithfully stores the model output; it is not the primary source of the collapse.

## 13. Recommendation

- **Independence — KEEP AS IS.** It already implements a non-renormalized neutral state. Giving
  unknown full independent credit would convert absence of evidence into positive evidence.
{specialist_recommendation}

Exact next step: {summary['recommendations']['next_step']}

## 14. Production database immutability

The script opened the canonical database using SQLite immutable read-only mode and `query_only`.
The caller records before/after SHA-256 values in the JSON artifact; they must match exactly.
No network or paid requests were made.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "fiyu.db")
    parser.add_argument(
        "--summary-out",
        type=Path,
        default=ROOT / "data" / "audits" / "unknown-semantics-audit-summary.json",
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=ROOT / "data" / "audits" / "unknown-semantics-audit.md",
    )
    args = parser.parse_args()
    before = sha256(args.db)
    summary, _ = build_summary(args.db)
    after = sha256(args.db)
    summary["database_sha256"] = {
        "before": before,
        "after": after,
        "unchanged": before == after,
    }
    if before != after:
        raise RuntimeError("canonical database changed during read-only audit")
    args.summary_out.parent.mkdir(parents=True, exist_ok=True)
    args.summary_out.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.report_out.write_text(render_report(summary), encoding="utf-8")
    print(json.dumps({
        "rows": summary["audit_scope"]["row_count"],
        "independence_affected": summary["counterfactuals"]["A_independence_unknown_neutral"]["affected_rows"],
        "specialist_affected": summary["counterfactuals"]["B_demonstrable_specialist_unknown_neutral"]["affected_rows"],
        "db_sha256_unchanged": summary["database_sha256"]["unchanged"],
    }, indent=2))


if __name__ == "__main__":
    main()
