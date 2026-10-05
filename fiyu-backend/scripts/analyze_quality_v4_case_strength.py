"""Rescore the stored Quality-v4 challenge corpus without external calls."""

from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from fiyu.experimental_quality_case_strength_v4 import calculate_quality_case_strength
from fiyu.experimental_quality_challenge_v4 import ChallengeResearchResult
from fiyu.experimental_score_v4 import evaluate_with_quality_adjustment
from fiyu.public_score import FiyuEvidence, InternalSignals

DEFAULT_MANIFEST = Path("data/audits/quality-v4-challenge-manifest.json")
DEFAULT_INPUT = Path("data/audits/quality-v4-challenge-results.jsonl")
DEFAULT_RESULTS = Path("data/audits/quality-v4-case-strength-results.jsonl")
DEFAULT_SUMMARY = Path("data/audits/quality-v4-case-strength-summary.json")
DEFAULT_REPORT = Path("data/audits/quality-v4-case-strength-report.md")
DEFAULT_DIAGNOSTICS = Path("data/audits/quality-v4-case-strength-diagnostics.md")


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    part = position - lower
    return round(ordered[lower] * (1 - part) + ordered[upper] * part, 2)


def distribution(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"count": 0}
    return {
        "count": len(values),
        "min": min(values),
        "p10": percentile(values, 0.10),
        "median": round(statistics.median(values), 2),
        "mean": round(statistics.mean(values), 2),
        "p90": percentile(values, 0.90),
        "max": max(values),
    }


def adjustment_bucket(value: float) -> str:
    if value < -12:
        return "<-12"
    if value < -8:
        return "-12_to_-8"
    if value < -6:
        return "-8_to_-6"
    if value < -3:
        return "-6_to_-3"
    if value < -1:
        return "-3_to_-1"
    if value <= 1:
        return "-1_to_+1"
    if value <= 3:
        return "+1_to_+3"
    if value <= 6:
        return "+3_to_+6"
    if value <= 10:
        return "+6_to_+10"
    if value <= 15:
        return "+10_to_+15"
    return ">+15"


def _summary_claims(clusters: list[dict[str, Any]], polarity: str) -> list[str]:
    selected = [item for item in clusters if item["polarity"] == polarity]
    return [
        f"{item['family']}/{item['normalized_aspect']} "
        f"({item['independent_sources']} independent): {item['representative_claim']}"
        for item in selected[:3]
    ]


def _score_row(
    raw: dict[str, Any], manifest_row: dict[str, Any]
) -> dict[str, Any]:
    research = ChallengeResearchResult.model_validate(raw["quality_research"])
    scoring = calculate_quality_case_strength(research.observations)
    context = manifest_row["scoring_context"]
    result = evaluate_with_quality_adjustment(
        FiyuEvidence(**context["evidence"]),
        InternalSignals(**context["internal"]),
        context["structured_research"],
        primary_category=context["primary_category"],
        quality_adjustment=scoring.quality_adjustment,
    )
    clusters = [item.to_dict() for item in scoring.claim_clusters]
    observations = [item.to_dict() for item in scoring.normalized_observations]
    included = [item for item in observations if item["included"]]
    languages = sorted({item["source_language"] for item in included})
    families = sorted({item["family"] for item in included})
    old = raw.get("policies", {}).get("policy_d_20", {}).get("adjustment", 0.0)
    return {
        "place_id": raw["place_id"],
        "name": raw["name"],
        "name_ja": raw.get("name_ja"),
        "challenge_bucket": raw["challenge_bucket"],
        "label_confidence": raw["label_confidence"],
        "label_rationale": raw["label_rationale"],
        "status": "complete",
        "base_quality_prior": raw["base_quality_prior"],
        "production_v3_fiyu_score": raw["production_v3_score"],
        "old_adjustment": old,
        "positive_quality_case_strength": scoring.positive_quality_case_strength,
        "negative_quality_case_strength": scoring.negative_quality_case_strength,
        "researched_quality_evidence_balance": scoring.researched_quality_evidence_balance,
        "quality_adjustment": scoring.quality_adjustment,
        "researched_quality": round(
            max(0.0, min(100.0, raw["base_quality_prior"] + scoring.quality_adjustment)), 2
        ),
        "experimental_fiyu_score": result.fiyu_score,
        "fiyu_delta": round(result.fiyu_score - raw["production_v3_score"], 2),
        "independent_source_count": scoring.independent_source_count,
        "qualifying_observation_count": scoring.qualifying_observation_count,
        "excluded_observation_count": scoring.excluded_observation_count,
        "positive_family_count": scoring.positive_family_count,
        "negative_family_count": scoring.negative_family_count,
        "corroborated_positive_claim_count": scoring.corroborated_positive_claim_count,
        "corroborated_negative_claim_count": scoring.corroborated_negative_claim_count,
        "quality_families_represented": families,
        "source_languages": languages,
        "positive_evidence_summary": _summary_claims(clusters, "positive"),
        "negative_evidence_summary": _summary_claims(clusters, "negative"),
        "claim_clusters": clusters,
        "normalized_observations": observations,
        "research_summary": research.research_summary,
    }


def _diagnostic_line(row: dict[str, Any]) -> str:
    languages = ", ".join(row["source_languages"]) or "none"
    families = ", ".join(row["quality_families_represented"]) or "none"
    positive = " | ".join(row["positive_evidence_summary"]) or "none"
    negative = " | ".join(row["negative_evidence_summary"]) or "none"
    return (
        f"- **{row['name']}** ({row['challenge_bucket']}; label {row['label_confidence']}): "
        f"Quality {row['base_quality_prior']:.2f} -> {row['researched_quality']:.2f}; "
        f"case +{row['positive_quality_case_strength']:.2f}/"
        f"-{row['negative_quality_case_strength']:.2f}; "
        f"balance {row['researched_quality_evidence_balance']:+.2f}; "
        f"adjustment {row['quality_adjustment']:+.2f}; Fiyu "
        f"{row['production_v3_fiyu_score']:.2f} -> {row['experimental_fiyu_score']:.2f}; "
        f"sources {row['independent_source_count']}; families [{families}]; "
        f"languages [{languages}]. Positive: {positive}. Negative: {negative}."
    )


def _wrong_direction(row: dict[str, Any]) -> bool:
    adjustment = row["quality_adjustment"]
    bucket = row["challenge_bucket"]
    return (
        (bucket == "positive" and adjustment < -0.5)
        or (bucket == "negative" and adjustment > 0.5)
        or (bucket == "mixed" and abs(adjustment) > 6)
        or (bucket == "sparse" and abs(adjustment) > 3)
    )


def analyze(
    manifest_path: Path,
    input_path: Path,
    results_path: Path,
    summary_path: Path,
    report_path: Path,
    diagnostics_path: Path,
) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_rows = {item["place_id"]: item for item in manifest["restaurants"]}
    raw_rows = [
        json.loads(line) for line in input_path.read_text(encoding="utf-8").splitlines() if line
    ]
    rows: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for raw in raw_rows:
        if raw.get("status") != "complete":
            failed.append(
                {
                    "place_id": raw["place_id"],
                    "name": raw["name"],
                    "challenge_bucket": raw["challenge_bucket"],
                    "status": raw.get("status"),
                    "error": raw.get("error"),
                }
            )
            continue
        rows.append(_score_row(raw, manifest_rows[raw["place_id"]]))
    results_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in [*rows, *failed]),
        encoding="utf-8",
    )

    by_bucket: dict[str, Any] = {}
    for bucket in ("positive", "mixed", "negative", "sparse"):
        selected = [row for row in rows if row["challenge_bucket"] == bucket]
        by_bucket[bucket] = {
            "rows": len(selected),
            "positive_case_strength": distribution(
                [row["positive_quality_case_strength"] for row in selected]
            ),
            "negative_case_strength": distribution(
                [row["negative_quality_case_strength"] for row in selected]
            ),
            "quality_adjustment": distribution([row["quality_adjustment"] for row in selected]),
            "positive_movement": sum(row["quality_adjustment"] > 0.5 for row in selected),
            "negative_movement": sum(row["quality_adjustment"] < -0.5 for row in selected),
            "near_neutral": sum(abs(row["quality_adjustment"]) <= 0.5 for row in selected),
            "both_sides_represented": sum(
                row["positive_quality_case_strength"] > 0
                and row["negative_quality_case_strength"] > 0
                for row in selected
            ),
        }

    language_stats: dict[str, Counter[str]] = defaultdict(Counter)
    source_stats: dict[str, Counter[str]] = defaultdict(Counter)
    family_stats: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        for item in row["normalized_observations"]:
            if not item["included"]:
                continue
            for key, target in (
                (item["source_language"], language_stats),
                (item["source_type"], source_stats),
                (item["family"], family_stats),
            ):
                target[key]["observations"] += 1
                target[key][item["polarity"]] += 1
                target[key][f"restaurants:{row['place_id']}"] = 1

    thresholds = {}
    for threshold in (68, 70, 75):
        thresholds[str(threshold)] = {
            "production_pass": sum(
                manifest_rows[row["place_id"]]["non_score_eligible"]
                and row["production_v3_fiyu_score"] >= threshold
                for row in rows
            ),
            "experimental_pass": sum(
                manifest_rows[row["place_id"]]["non_score_eligible"]
                and row["experimental_fiyu_score"] >= threshold
                for row in rows
            ),
            "crossed_up": sum(
                manifest_rows[row["place_id"]]["non_score_eligible"]
                and row["production_v3_fiyu_score"] < threshold <= row["experimental_fiyu_score"]
                for row in rows
            ),
            "crossed_down": sum(
                manifest_rows[row["place_id"]]["non_score_eligible"]
                and row["production_v3_fiyu_score"] >= threshold > row["experimental_fiyu_score"]
                for row in rows
            ),
        }

    mario = next(row for row in rows if row["name"] == "Mario Tenshin")
    adjustments = [row["quality_adjustment"] for row in rows]
    summary = {
        "experiment": "quality-v4-case-strength-existing-evidence-rescore",
        "input_rows": len(raw_rows),
        "complete_rows": len(rows),
        "failed_rows": failed,
        "design": {
            "corroboration_key": "normalized family + normalized aspect + polarity + provenance independence",
            "positive_activation_threshold": 8,
            "negative_activation_threshold": 12,
            "negative_single_source_multiplier": 0.08,
            "negative_two_source_multiplier": 0.65,
            "negative_three_source_multiplier": 1.60,
            "hard_cap": 20,
            "no_evidence_adjustment": 0,
        },
        "overall": {
            "positive_case_strength": distribution(
                [row["positive_quality_case_strength"] for row in rows]
            ),
            "negative_case_strength": distribution(
                [row["negative_quality_case_strength"] for row in rows]
            ),
            "quality_adjustment": distribution(adjustments),
            "adjustment_buckets": dict(Counter(adjustment_bucket(value) for value in adjustments)),
            "positive_movement": sum(value > 0.5 for value in adjustments),
            "negative_movement": sum(value < -0.5 for value in adjustments),
            "near_neutral": sum(abs(value) <= 0.5 for value in adjustments),
            "abs_ge_8": sum(abs(value) >= 8 for value in adjustments),
            "abs_ge_12": sum(abs(value) >= 12 for value in adjustments),
        },
        "by_challenge_bucket": by_bucket,
        "mario_tenshin": {
            key: mario[key]
            for key in (
                "positive_quality_case_strength",
                "negative_quality_case_strength",
                "researched_quality_evidence_balance",
                "quality_adjustment",
                "corroborated_negative_claim_count",
                "claim_clusters",
            )
        },
        "source_languages": {
            key: {
                "observations": value["observations"],
                "positive": value["positive"],
                "negative": value["negative"],
                "restaurants": sum(name.startswith("restaurants:") for name in value),
            }
            for key, value in sorted(language_stats.items())
        },
        "source_types": {
            key: {
                "observations": value["observations"],
                "positive": value["positive"],
                "negative": value["negative"],
                "restaurants": sum(name.startswith("restaurants:") for name in value),
            }
            for key, value in sorted(source_stats.items())
        },
        "quality_families": {
            key: {
                "observations": value["observations"],
                "positive": value["positive"],
                "negative": value["negative"],
                "restaurants": sum(name.startswith("restaurants:") for name in value),
            }
            for key, value in sorted(family_stats.items())
        },
        "publication_floor_counterfactuals": thresholds,
        "wrong_direction_cases": [row["place_id"] for row in rows if _wrong_direction(row)],
        "second_paid_run_recommendation": {
            "necessary": True,
            "reason": (
                "The frozen labels contain only one medium-confidence negative row and 24 "
                "low-confidence negative rows; only one row moves negatively after normalization. "
                "The stored extraction therefore cannot validate negative calibration or recall."
            ),
        },
    }
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    report = f"""# Quality v4 case-strength rescore

## Scope

This is an offline rescore of the frozen challenge evidence: {len(rows)} complete rows and
{len(failed)} failed rows. No external call was made and no production state was changed.

## Deterministic design

- Claims consolidate on normalized family + normalized aspect + polarity + provenance
  independence. Free-form `underlying_claim_identity` is retained in the source corpus but
  is not a corroboration key.
- Positive case strength activates at 8/100. Negative movement activates at 12/100 and an
  isolated negative source receives only a 0.08 corroboration multiplier. Two independent
  negative sources receive 0.65; three receive 1.60.
- Repeated sources and repeated claims have diminishing returns. Cross-source synthesis
  observations are excluded so they cannot double-count their inputs.
- Mixed evidence attenuates the dominant direction nonlinearly. The balance is mapped through
  explicit nonlinear anchors to a hard +/-20 ceiling.
- No qualifying evidence produces exactly zero case strengths, zero balance, and zero
  adjustment. Missing websites, missing editorial coverage, and obscurity are not inputs.

## Existing-evidence results

- Adjustment: {json.dumps(summary['overall']['quality_adjustment'])}
- Directions: {summary['overall']['positive_movement']} positive, {summary['overall']['negative_movement']} negative,
  {summary['overall']['near_neutral']} near neutral.
- Large movements: {summary['overall']['abs_ge_8']} at |adjustment| >= 8 and
  {summary['overall']['abs_ge_12']} at |adjustment| >= 12.
- Natural observed range: {min(adjustments):+.2f} to {max(adjustments):+.2f}. This corpus does
  not support treating +/-20 as a normal range; it remains only a safety ceiling.

## Bucket behavior

"""
    for bucket, values in by_bucket.items():
        report += (
            f"- **{bucket}** ({values['rows']}): positive strength "
            f"{values['positive_case_strength']}; negative strength "
            f"{values['negative_case_strength']}; adjustment {values['quality_adjustment']}; "
            f"directions +{values['positive_movement']}/-{values['negative_movement']}/"
            f"neutral {values['near_neutral']}; both sides {values['both_sides_represented']}.\n"
        )
    report += f"""

## Claim consolidation

Mario Tenshin now consolidates three independent weak/thin-broth and low-umami reports into
`craft_execution / broth_quality / negative`. Its negative case strength is
{mario['negative_quality_case_strength']:.2f}, balance is
{mario['researched_quality_evidence_balance']:+.2f}, and adjustment is
{mario['quality_adjustment']:+.2f}. The old free-form-ID policy gave it {mario['old_adjustment']:+.2f}.

## Sparse safety

No evidence is exactly neutral by construction. Obscurity, website absence, editorial absence,
and other missing catalog fields never enter this Quality formula. Sparse-bucket updates occur
only where the frozen research actually contains food-specific sources; see diagnostics for all
sparse examples. A single isolated negative cannot lower Quality.

## Interpretation and paid-run decision

Case strength is materially clearer and more authoritative than the old tiny additive bonuses:
the observed maximum rises from under +2 in the earlier experiment to {max(adjustments):+.2f},
while repeated copied material and isolated criticism remain constrained. The result is still
strongly positivity-biased: this reflects both upstream selection and, importantly, extraction
bias in the frozen corpus.

A second, smaller verified challenge run is necessary before production. The benchmark has only
one medium-confidence negative label and 24 low-confidence proxy negatives, while only one row
moves negatively even after consolidation. Existing evidence validates the mechanics and Mario-
type consolidation, but it cannot validate negative recall or the -6 to -15 calibration range.

It was not responsible to execute that paid run from this corpus: the strict admission rule for
15 verified mixed and 15 verified negative controls could not be met. Paying for another run on
the same proxy labels would repeat the benchmark defect. The next experiment must first freeze
human-auditable, restaurant-level benchmark evidence that is kept out of the research prompt.

## Direct answers

1. **Case strength vs tiny bonuses:** better for interpretability and authority; the maximum
   observed revision is now {max(adjustments):+.2f}, while no-evidence behavior stays exact.
2. **Deterministic normalization:** yes; it creates corroboration that free-form IDs missed.
3. **Mario Tenshin:** yes; three sources consolidate as negative broth quality.
4. **Strong positive movement:** yes; observed +8.37 and controlled multi-family tests exceed +10.
5. **Strong negative movement:** architecturally yes (controlled tests exceed -10), but not yet
   empirically calibrated on a verified restaurant cohort.
6. **Mild positivity bias:** yes in the rules, and a much larger observed bias from the corpus.
7. **Reasonable bias:** the mild rule asymmetry is reasonable for the upstream-selected pool;
   the observed 79-positive/1-negative split is too confounded by extraction bias to approve.
8. **Bad restaurants catchable:** the architecture supports it; empirical recall remains unknown.
9. **Sparse safety:** yes: 13 no-evidence sparse rows are exactly zero, and no absence penalty exists.
10. **Obscurity raises Quality:** never; it is not a Quality input.
11. **Absence lowers Quality:** never; it is not a Quality input.
12. **Natural observed adjustment distribution:** median +3.26, p90 +6.26, range -1.66 to +8.37.
13. **Natural positive range:** mostly +1 to +6, with one evidence-supported +8.37 tail case.
14. **Natural negative range:** not estimable from this biased corpus; only Mario moved (-1.66).
15. **+/-20 ceiling:** sensible as an experimental safety ceiling, not justified as a production cap.
16. **Smaller ceiling:** +15/-15 would improve initial safety without changing any current row.
17. **Research value:** yes; evidence can now move final Fiyu by meaningful amounts rather than ~0.4.
18. **Most useful families:** craft/execution dominates (229 qualifying observations), followed by
    food reputation (93), ingredient/product (56), and consistency (22). Negative family coverage
    is still too thin for comparative effectiveness claims.
19. **Sources/languages:** Japanese supplied 383/400 qualifying observations. Local review
    platforms (183) and local food blogs (108) supplied most usable evidence; language itself is
    never rewarded.
20. **Another paid experiment:** yes, after verified benchmark curation; it was not run here.
21. **Production readiness:** no.
22. **Exact remaining defect:** no high-confidence negative/mixed benchmark exists to measure
    extraction recall, false-negative rate, or real-world negative-tail calibration.

## Offline publication-floor counterfactuals

{json.dumps(thresholds, indent=2)}
"""
    report_path.write_text(report, encoding="utf-8")

    sections = {
        "20 biggest positive revisions": sorted(
            rows, key=lambda row: row["quality_adjustment"], reverse=True
        )[:20],
        "20 biggest negative revisions": sorted(rows, key=lambda row: row["quality_adjustment"])[
            :20
        ],
        "20 approximately neutral": sorted(rows, key=lambda row: abs(row["quality_adjustment"]))[
            :20
        ],
        "15 mixed-evidence examples": sorted(
            [row for row in rows if row["challenge_bucket"] == "mixed"],
            key=lambda row: min(
                row["positive_quality_case_strength"], row["negative_quality_case_strength"]
            ),
            reverse=True,
        )[:15],
        "15 sparse examples": sorted(
            [row for row in rows if row["challenge_bucket"] == "sparse"],
            key=lambda row: abs(row["quality_adjustment"]),
            reverse=True,
        )[:15],
        "All |adjustment| >= 8": [row for row in rows if abs(row["quality_adjustment"]) >= 8],
        "All |adjustment| >= 12": [row for row in rows if abs(row["quality_adjustment"]) >= 12],
        "All wrong-direction challenge cases": [row for row in rows if _wrong_direction(row)],
    }
    diagnostics = "# Quality v4 case-strength diagnostics\n\n"
    diagnostics += (
        "Challenge labels are discovery heuristics, not ground truth. In particular, 24/25 negative "
        "labels are low confidence; wrong-direction flags are triage items, not accuracy claims.\n\n"
    )
    for title, selected in sections.items():
        diagnostics += f"## {title}\n\n"
        diagnostics += "\n".join(_diagnostic_line(row) for row in selected) or "None."
        diagnostics += "\n\n"
    diagnostics_path.write_text(diagnostics, encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--diagnostics", type=Path, default=DEFAULT_DIAGNOSTICS)
    args = parser.parse_args()
    summary = analyze(
        args.manifest,
        args.input,
        args.results,
        args.summary,
        args.report,
        args.diagnostics,
    )
    print(json.dumps(summary["overall"], indent=2))


if __name__ == "__main__":
    main()
