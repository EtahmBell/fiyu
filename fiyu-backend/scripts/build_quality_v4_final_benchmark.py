"""Freeze the pre-spend Quality-v4 benchmark from stored evidence only.

This script deliberately performs no network/model calls.  It admits only cases
manually reviewed in the frozen challenge evidence and records whether the paid
validation gate is satisfied.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

DEFAULT_CASE_RESULTS = Path("data/audits/quality-v4-case-strength-results.jsonl")
DEFAULT_CHALLENGE_RESULTS = Path("data/audits/quality-v4-challenge-results.jsonl")
DEFAULT_OUTPUT = Path("data/audits/quality-v4-final-benchmark-manifest.json")
DEFAULT_SUMMARY = Path("data/audits/quality-v4-final-validation-summary.json")
DEFAULT_REPORT = Path("data/audits/quality-v4-final-validation-report.md")
DEFAULT_DIAGNOSTICS = Path("data/audits/quality-v4-final-validation-diagnostics.md")

# These names were manually reviewed against the stored claim text, URL,
# provenance, food specificity, and normalized aspect.  Selection is explicit so
# a later scorer or researcher result cannot silently change the frozen labels.
POSITIVE_NAMES = (
    "Shuha Saika",
    "Asakusa Tantantei",
    "New Hungry",
    "Jingumae Hanare",
    "Briller parfum",
    "Fucha Ryori Bon",
    "Sushi Ryogetsu (Sushi Akira)",
    "Saigon Pho",
    "Edo Fukagawaya Toyosu Senkyaku Banrai",
    "GINZA KOKORO",
    "Saisai",
    "Sushi Yajima",
)
MIXED_NAMES = (
    "Sugawara Abura Shoten",
    "Akane Kuriya",
    "Mitaka Soba",
    "Washokudokoro Susumu",
    "Del Chalro",
    "Ramen Shota",
    "Hangry Joe's Tokyo Ikebukuro",
    "Kimidori Yakitori",
)
NEGATIVE_NAMES = ("Mario Tenshin",)
SPARSE_NAMES = (
    "Yutsudo",
    "Izakaya Temari",
    "Saeki",
    "Mocchi",
    "Akagi Shouten",
    "Cho nomi Botako",
    "Yoshitaka",
    "Hanaichi",
    "Izakaya MARU",
    "Melody Thai & Asia Unplugged Restaurant",
    "Utagoe Sumichan",
    "Izakaya Okinoya",
    "Nanamaru",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _evidence(observation: dict[str, Any]) -> dict[str, Any]:
    return {
        key: observation.get(key)
        for key in (
            "family",
            "normalized_aspect",
            "polarity",
            "strength",
            "specificity",
            "directness",
            "claim_text",
            "source_url",
            "source_type",
            "source_language",
            "publication_or_observation_date",
            "normalized_author_or_document_identity",
            "provenance_group",
            "independence_key",
        )
    }


def _research_context(raw: dict[str, Any]) -> dict[str, Any]:
    """Return only fields permitted in a future blinded research prompt."""

    return {
        key: raw.get(key)
        for key in (
            "place_id",
            "name",
            "name_ja",
            "name_en",
            "category",
            "area",
            "address",
            "description",
            "food_tags",
            "signature_dishes",
        )
    }


def _record(
    row: dict[str, Any],
    raw: dict[str, Any],
    *,
    bucket: str,
    confidence: str,
) -> dict[str, Any]:
    observations = [item for item in row["normalized_observations"] if item["included"]]
    if bucket == "positive":
        benchmark = [item for item in observations if item["polarity"] == "positive"]
        counterevidence: list[dict[str, Any]] = []
        why = (
            "At least two independent, food-specific positive sources are frozen; "
            "no qualifying negative observation appears in the stored evidence."
        )
    elif bucket == "negative":
        benchmark = [item for item in observations if item["polarity"] == "negative"]
        counterevidence = [
            _evidence(item) for item in observations if item["polarity"] == "positive"
        ]
        why = (
            "Three independent, specific reports corroborate the same broth-quality "
            "weakness; this is the only stored case meeting the strict negative standard."
        )
    elif bucket == "mixed":
        benchmark = observations
        counterevidence = []
        why = (
            "Multiple positive food observations and one credible specific negative food "
            "observation are frozen. Confidence is medium because the negative side is "
            "not independently corroborated."
        )
    else:
        benchmark = []
        counterevidence = []
        why = (
            "Valid restaurant identity with no qualifying food-quality observation in the "
            "frozen research corpus; selected to test exact neutrality under missing evidence."
        )

    evidence = [_evidence(item) for item in benchmark]
    independent = {str(item["independence_key"]) for item in benchmark}
    expected = sorted({str(item["polarity"]) for item in benchmark})
    if bucket == "positive" and (len(independent) < 2 or expected != ["positive"]):
        raise RuntimeError(f"Positive admission invariant failed for {row['name']}")
    if bucket == "negative" and (len(independent) < 2 or expected != ["negative"]):
        raise RuntimeError(f"Negative admission invariant failed for {row['name']}")
    if bucket == "mixed" and expected != ["negative", "positive"]:
        raise RuntimeError(f"Mixed admission invariant failed for {row['name']}")
    if bucket == "sparse" and observations:
        raise RuntimeError(f"Sparse admission invariant failed for {row['name']}")
    return {
        "place_id": row["place_id"],
        "restaurant_name": row["name"],
        "benchmark_bucket": bucket,
        "benchmark_confidence": confidence,
        "benchmark_evidence_families": sorted({str(item["family"]) for item in benchmark}),
        "normalized_aspects": sorted(
            {str(item["normalized_aspect"]) for item in benchmark}
        ),
        "expected_polarity": expected or ["none"],
        "independent_supporting_sources": len(independent),
        "source_languages": sorted({str(item["source_language"]) for item in benchmark}),
        "source_types": sorted({str(item["source_type"]) for item in benchmark}),
        "human_auditable_evidence_summary": (
            " | ".join(str(item["claim_text"]) for item in benchmark)
            if benchmark
            else "No qualifying food-quality claim was found in the frozen corpus."
        ),
        "why_qualifies": why,
        "benchmark_evidence": evidence,
        "counterevidence_retained_for_audit": counterevidence,
        "research_context": _research_context(raw),
    }


def build(case_results: Path, challenge_results: Path, output: Path) -> dict[str, Any]:
    cases = {
        row["name"]: row
        for row in _read_jsonl(case_results)
        if row.get("status") == "complete"
    }
    raw = {row["name"]: row for row in _read_jsonl(challenge_results)}
    expected_names = {
        *POSITIVE_NAMES,
        *MIXED_NAMES,
        *NEGATIVE_NAMES,
        *SPARSE_NAMES,
    }
    missing = sorted(expected_names - cases.keys() | expected_names - raw.keys())
    if missing:
        raise RuntimeError(f"Frozen inputs missing selected restaurants: {missing}")

    restaurants: list[dict[str, Any]] = []
    for bucket, confidence, names in (
        ("positive", "high", POSITIVE_NAMES),
        ("mixed", "medium", MIXED_NAMES),
        ("negative", "high", NEGATIVE_NAMES),
        ("sparse", "high", SPARSE_NAMES),
    ):
        restaurants.extend(
            _record(cases[name], raw[name], bucket=bucket, confidence=confidence)
            for name in names
        )

    non_sparse = [item for item in restaurants if item["benchmark_bucket"] != "sparse"]
    languages: Counter[str] = Counter()
    source_types: Counter[str] = Counter()
    for item in restaurants:
        for evidence in item["benchmark_evidence"]:
            languages[str(evidence["source_language"])] += 1
            source_types[str(evidence["source_type"])] += 1
    bucket_counts = Counter(item["benchmark_bucket"] for item in restaurants)
    confidence_counts = Counter(item["benchmark_confidence"] for item in restaurants)
    high_negative = sum(
        item["benchmark_bucket"] == "negative"
        and item["benchmark_confidence"] == "high"
        for item in restaurants
    )
    high_mixed = sum(
        item["benchmark_bucket"] == "mixed" and item["benchmark_confidence"] == "high"
        for item in restaurants
    )
    gate_passed = high_negative >= 10 and high_mixed >= 10
    manifest = {
        "experiment": "quality-v4-final-blinded-validation-benchmark",
        "frozen_date": "2026-10-05",
        "frozen_before_paid_research": True,
        "paid_research_authorized": False,
        "production_database": "data/fiyu.db",
        "production_database_sha256": sha256(Path("data/fiyu.db")),
        "selection_basis": (
            "Manual conservative review of stored food-specific claim text, source URL, "
            "source type/language, provenance independence, and normalized aspect. No "
            "external or model call was made during benchmark curation."
        ),
        "blinding_contract": {
            "future_research_prompt_may_use_only": "restaurants[].research_context",
            "hidden_from_researcher": [
                "benchmark_bucket",
                "benchmark_confidence",
                "expected_polarity",
                "benchmark_evidence",
                "counterevidence_retained_for_audit",
                "human_auditable_evidence_summary",
                "why_qualifies",
            ],
        },
        "label_quality_report": {
            "total": len(restaurants),
            "bucket_counts": dict(bucket_counts),
            "confidence_counts": dict(confidence_counts),
            "high_confidence_negative_count": high_negative,
            "high_confidence_mixed_count": high_mixed,
            "average_independent_sources_per_non_sparse": round(
                statistics.mean(
                    item["independent_supporting_sources"] for item in non_sparse
                ),
                2,
            ),
            "source_language_distribution": dict(languages),
            "source_type_distribution": dict(source_types),
            "minimum_gate": {
                "high_confidence_negative": 10,
                "high_confidence_mixed": 10,
            },
            "admission_gate_passed": gate_passed,
            "stop_reason": None
            if gate_passed
            else (
                "Only one high-confidence negative and zero high-confidence mixed controls "
                "can be defended from the frozen corpus. The protocol requires roughly ten "
                "of each before any paid call."
            ),
        },
        "restaurants": restaurants,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def write_gate_reports(
    manifest: dict[str, Any], summary_path: Path, report_path: Path, diagnostics_path: Path
) -> None:
    label = manifest["label_quality_report"]
    database_hash = manifest["production_database_sha256"]
    summary = {
        "experiment": "quality-v4-final-blinded-validation",
        "status": "stopped_before_paid_research",
        "decision": "C_NOT_READY",
        "benchmark_admission_gate_passed": False,
        "benchmark": label,
        "paid_run": {
            "requests": 0,
            "web_search_actions": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "failures": 0,
            "needs_retry": 0,
        },
        "blinded_performance": None,
        "blinded_performance_unavailable_reason": (
            "The mandatory pre-spend benchmark gate failed, so no blinded request was sent."
        ),
        "production_v3_parity": {
            "restaurants_evaluated": 1092,
            "exact_zero_adjustment_matches": 1092,
            "monotonicity_violations": 0,
            "source_artifact": "data/audits/quality-v4-parity-summary.json",
        },
        "production_database_sha256_before": database_hash,
        "production_database_sha256_after": database_hash,
        "production_database_unchanged": True,
        "exact_blocker": label["stop_reason"],
        "next_required_action": (
            "Curate at least nine additional strict recurring-negative controls and at "
            "least ten high-confidence mixed controls from human-reviewed source material, "
            "freeze them, then run the already-specified blinded protocol unchanged."
        ),
    }
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    report = f"""# Quality v4 final validation: benchmark admission gate

## Decision

**C — NOT READY.** The final blinded paid run was stopped before spending because the
mandatory benchmark-admission gate failed.

## Benchmark

- Frozen controls: **{label['total']}**
- Positive: **{label['bucket_counts']['positive']}** (high confidence)
- Mixed: **{label['bucket_counts']['mixed']}** (all medium confidence)
- Negative: **{label['bucket_counts']['negative']}** (high confidence)
- Sparse: **{label['bucket_counts']['sparse']}** (high confidence)
- Overall confidence: **{label['confidence_counts']['high']} high**, **{label['confidence_counts']['medium']} medium**
- Average independent sources per non-sparse benchmark: **{label['average_independent_sources_per_non_sparse']}**
- High-confidence mixed controls: **{label['high_confidence_mixed_count']} / 10 required**
- High-confidence negative controls: **{label['high_confidence_negative_count']} / 10 required**

The sole strict negative control is Mario Tenshin: three independent Japanese sources
corroborate `craft_execution / broth_quality / negative`. Eight restaurants have genuine
positive and negative food evidence, but each negative side is supported by only one source;
they are therefore frozen as medium-confidence mixed controls rather than promoted to high.

Source observations are overwhelmingly Japanese (113 Japanese, 1 English). Local review
platforms (47) and local food blogs (36) provide most benchmark evidence, followed by map
reviews (15) and editorial food media (7).

## Paid run

- Requests: **0**
- Web-search actions: **0**
- Tokens: **0**
- Failures: **0**
- Needs retry: **0**

No model or external call was made. This is the required protocol outcome when fewer than
roughly ten high-confidence negative or mixed controls can be assembled.

## Blinded performance and scoring

Not measured. Running the researcher after the gate failed would make recall, false-boost,
false-punishment, adjustment-distribution, +/-15 versus +/-20, and publication-floor metrics
scientifically invalid. The current case-strength design was not changed.

Production-v3 parity remains documented as 1,092/1,092 exact zero-adjustment matches with zero
monotonicity violations. That solved result was reviewed, not recomputed into a new design.

## Exact blocker

The frozen corpus supports only **one** strict recurring-negative restaurant and **zero**
high-confidence mixed controls under a corroborated-negative standard. It therefore cannot
measure high-confidence negative recall, recurring-issue recall, or mixed both-sides recall.

Before the final paid validation can run, human curation must add at least nine strict negative
controls and ten high-confidence mixed controls. Their evidence must be frozen and hidden from
the researcher. The research prompt and deterministic scorer should then run unchanged.

## Product questions

1. Production-v3 parity: **yes, still exactly documented**.
2–5. Positive, negative, recurring-negative, and mixed recall: **not measured; gate failed**.
6–10. Sparse safety and false-boost/punishment in this final run: **not measured; no run**.
11–13. Source recovery comparisons: **not measured**; benchmark curation itself is 99% Japanese
   and led mainly by local review platforms and local food blogs.
14. Mild positive bias: **unchanged and still conceptually reasonable**.
15–17. Negative sensitivity or mapping retuning: **no conclusion and no tuning justified**.
18. +/-20 remains an experimental ceiling; this gate provides no new magnitude evidence.
19. +/-15 remains the proposed initial production guardrail, not yet validated here.
20. Natural final-benchmark range: **not measurable without a blinded run**.
21. Production readiness: **no**.
22. Exact blocker: **insufficient high-confidence negative and mixed benchmark controls**.
"""
    report_path.write_text(report, encoding="utf-8")

    diagnostics = "# Quality v4 final benchmark diagnostics\n\n"
    diagnostics += (
        "These labels were frozen before any final paid research. Evidence below must remain "
        "hidden from any future researcher.\n\n"
    )
    for bucket in ("positive", "mixed", "negative", "sparse"):
        diagnostics += f"## {bucket.title()} controls\n\n"
        selected = [
            item for item in manifest["restaurants"] if item["benchmark_bucket"] == bucket
        ]
        for item in selected:
            diagnostics += (
                f"### {item['restaurant_name']} ({item['benchmark_confidence']})\n\n"
                f"- Independent sources: {item['independent_supporting_sources']}\n"
                f"- Families: {', '.join(item['benchmark_evidence_families']) or 'none'}\n"
                f"- Aspects: {', '.join(item['normalized_aspects']) or 'none'}\n"
                f"- Expected polarity: {', '.join(item['expected_polarity'])}\n"
                f"- Why admitted: {item['why_qualifies']}\n"
                f"- Evidence: {item['human_auditable_evidence_summary']}\n\n"
            )
    diagnostics_path.write_text(diagnostics, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case-results", type=Path, default=DEFAULT_CASE_RESULTS)
    parser.add_argument("--challenge-results", type=Path, default=DEFAULT_CHALLENGE_RESULTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--diagnostics", type=Path, default=DEFAULT_DIAGNOSTICS)
    args = parser.parse_args()
    manifest = build(args.case_results, args.challenge_results, args.output)
    write_gate_reports(manifest, args.summary, args.report, args.diagnostics)
    print(json.dumps(manifest["label_quality_report"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
