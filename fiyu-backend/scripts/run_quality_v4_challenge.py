"""Prepare, run, and analyze the isolated paid Quality-v4 challenge set."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import statistics
import time
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import APIConnectionError, APITimeoutError, OpenAI

from fiyu.address_research import extract_response_metadata
from fiyu.card_enrichment import scoring_research_view
from fiyu.catalog_pipeline import _effective_structured_research
from fiyu.experimental_quality_challenge_v4 import (
    ChallengeObservation,
    ChallengeResearchResult,
    calculate_policy_adjustments,
    is_qualifying,
)
from fiyu.experimental_score_v4 import evaluate_with_quality_adjustment
from fiyu.public_score import FiyuEvidence, InternalSignals

DB = Path("data/fiyu.db")
PRIOR_RESULTS = Path("data/audits/quality-research-v4-sample.jsonl")
MANIFEST = Path("data/audits/quality-v4-challenge-manifest.json")
RESULTS = Path("data/audits/quality-v4-challenge-results.jsonl")
SUMMARY = Path("data/audits/quality-v4-challenge-summary.json")
REPORT = Path("data/audits/quality-v4-challenge-report.md")
POLICY_REPORT = Path("data/audits/quality-v4-policy-comparison.md")
DIAGNOSTICS = Path("data/audits/quality-v4-challenge-diagnostics.md")
SEED = "quality-v4-challenge-20261004"
PROMPT_VERSION = "quality-v4-neutral-challenge-2026-10-04"
MAX_SEARCH_ACTIONS = 5

SYSTEM_PROMPT = """Research one established Tokyo restaurant neutrally and answer only:
What credible evidence is available about the quality of the food itself?

Search for praise, criticism, mixed evidence, execution, ingredients, specialization,
signature dishes, consistency, and inconsistency. Use at most five web searches and
include Japanese-language/local sources when useful.

Do not output a Fiyu Score, Quality score, adjustment, recommendation, challenge label,
or publication decision. Do not use aggregate ratings as evidence. Never infer Quality
from obscurity, review count, website absence, localness, independence, tourist interest,
reservation scarcity, atmosphere, aesthetics, service, price alone, or popularity.

Failure to find food-quality evidence is neutral. Return no observation rather than
inferring mediocrity, fabricating criticism, or requiring accolades. One isolated or vague
negative review is weak and must not be generalized. Capture credible criticism when it
exists, but label provenance and common underlying claims so copied material cannot count
as corroboration. Official sources establish factual craft/sourcing only, not excellence.

Each observation represents one source document or independent reviewer. Give observations
the same underlying_claim_identity when they support the same theme, and the same
provenance_group when material is copied, syndicated, mirrored, PR-derived, or platform-
duplicated. Record source language and the best available date. Evidence families are only
craft/execution, ingredient/product quality, food reputation/specialization, and consistency."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json(value: object, fallback: Any) -> Any:
    try:
        return json.loads(str(value or ""))
    except (json.JSONDecodeError, TypeError):
        return fallback


def _prior_rows(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    return {
        str(row["place_id"]): row
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
        for row in [json.loads(line)]
        if row.get("status") == "complete"
    }


def _catalog(db_path: Path) -> list[dict[str, Any]]:
    connection = sqlite3.connect(f"file:{db_path.resolve().as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    query = """
        SELECT p.*, r.title AS candidate_title, r.category AS candidate_category,
               r.broad_category AS candidate_broad_category, r.rating, r.review_count,
               r.website, r.digital_footprint_type, r.internal_fiyu_score,
               r.quality_score, r.underexposure_score, r.digital_footprint_score,
               rr.structured_research_json
        FROM public_restaurants p
        JOIN restaurants r ON r.place_id=p.place_id
        LEFT JOIN restaurant_research_runs rr ON rr.id=(
            SELECT latest.id FROM restaurant_research_runs latest
            WHERE latest.public_restaurant_id=p.place_id AND latest.status='complete'
            ORDER BY latest.is_current DESC, latest.id DESC LIMIT 1
        )
        WHERE p.research_status='complete' AND p.fiyu_score IS NOT NULL
        ORDER BY p.place_id
    """
    rows: list[dict[str, Any]] = []
    try:
        for sqlite_row in connection.execute(query).fetchall():
            row = dict(sqlite_row)
            evidence = _json(row.get("evidence_json"), {})
            structured = _json(row.get("structured_research_json"), {})
            if not isinstance(evidence, dict) or not isinstance(structured, dict):
                continue
            effective = scoring_research_view(
                _effective_structured_research(connection, str(row["place_id"]), structured)
            )
            internal = {
                "quality_score": float(row.get("quality_score") or 0),
                "underexposure_score": float(row.get("underexposure_score") or 0),
                "digital_footprint_score": float(row.get("digital_footprint_score") or 0),
            }
            primary_category = str(
                row.get("primary_category")
                or row.get("candidate_category")
                or row.get("candidate_broad_category")
                or "unknown"
            )
            baseline = evaluate_with_quality_adjustment(
                FiyuEvidence(**evidence),
                InternalSignals(**internal),
                effective,
                primary_category=primary_category,
            )
            themes = _json(row.get("review_themes_json"), [])
            urls = _json(row.get("evidence_urls_json"), [])
            rows.append(
                {
                    "place_id": str(row["place_id"]),
                    "name": str(
                        row.get("name_en") or row.get("name_ja") or row.get("candidate_title")
                    ),
                    "name_ja": row.get("name_ja"),
                    "name_en": row.get("name_en"),
                    "category": primary_category,
                    "area": str(row.get("discovery_area") or "unknown"),
                    "address": row.get("normalized_address"),
                    "rating": float(row.get("rating") or 0),
                    "review_count": int(row.get("review_count") or 0),
                    "website": row.get("website"),
                    "digital_footprint_type": row.get("digital_footprint_type"),
                    "digital_footprint_score": internal["digital_footprint_score"],
                    "internal_candidate_score": float(row.get("internal_fiyu_score") or 0),
                    "base_quality_prior": internal["quality_score"],
                    "production_v3_score": baseline.fiyu_score,
                    "non_score_eligible": bool(
                        baseline.product_eligible and not baseline.chain_excluded
                    ),
                    "review_themes": themes if isinstance(themes, list) else [],
                    "evidence_urls": urls if isinstance(urls, list) else [],
                    "description": row.get("description_en"),
                    "food_tags": _json(row.get("food_tags_json"), []),
                    "signature_dishes": _json(row.get("signature_dishes_json"), []),
                    "scoring_context": {
                        "evidence": evidence,
                        "structured_research": effective,
                        "internal": internal,
                        "primary_category": primary_category,
                    },
                }
            )
    finally:
        connection.close()
    return rows


def _tie(row: dict[str, Any]) -> str:
    return hashlib.sha256(f"{SEED}:{row['place_id']}".encode()).hexdigest()


def _theme_text(row: dict[str, Any]) -> list[str]:
    return [
        str(theme.get("theme") or "")
        for theme in row["review_themes"]
        if isinstance(theme, dict) and theme.get("theme")
    ]


def prepare(db_path: Path, prior_path: Path, manifest_path: Path) -> dict[str, Any]:
    rows = _catalog(db_path)
    prior = _prior_rows(prior_path)
    used: set[str] = set()
    selected: list[dict[str, Any]] = []

    def add(bucket: str, candidates: list[tuple[dict[str, Any], str, str]]) -> None:
        for row, rationale, confidence in candidates:
            if row["place_id"] in used:
                continue
            item = {**row}
            item["challenge_bucket"] = bucket
            item["label_rationale"] = rationale
            item["label_confidence"] = confidence
            item["supporting_stored_evidence"] = _theme_text(row)[:5]
            selected.append(item)
            used.add(row["place_id"])
            if sum(x["challenge_bucket"] == bucket for x in selected) == 25:
                break

    negative_candidates: list[tuple[dict[str, Any], str, str]] = []
    for row in rows:
        old = prior.get(row["place_id"], {})
        negatives = old.get("negative_observations", [])
        if negatives:
            negative_candidates.append(
                (
                    row,
                    "Prior blinded Quality research extracted food-specific criticism: "
                    + "; ".join(str(item.get("claim")) for item in negatives[:3]),
                    "medium" if len(negatives) >= 2 else "low",
                )
            )
    negative_candidates.sort(
        key=lambda item: (
            -len(prior.get(item[0]["place_id"], {}).get("negative_observations", [])),
            item[0]["base_quality_prior"],
            _tie(item[0]),
        )
    )
    supplements = sorted(
        rows,
        key=lambda row: (row["base_quality_prior"], -row["review_count"], _tie(row)),
    )
    negative_candidates.extend(
        (
            row,
            (
                "Low cheap Quality prior selected as a blinded concern challenge; no stored "
                "qualitative negative evidence proves the expected direction."
            ),
            "low",
        )
        for row in supplements
    )
    add("negative", negative_candidates)

    mixed_candidates: list[tuple[dict[str, Any], str, str]] = []
    for row in rows:
        mixed = [
            theme
            for theme in row["review_themes"]
            if isinstance(theme, dict) and theme.get("sentiment") == "mixed"
        ]
        old = prior.get(row["place_id"], {})
        if mixed or (old.get("positive_observations") and old.get("negative_observations")):
            mixed_candidates.append(
                (
                    row,
                    (
                        "Stored mixed review theme or prior extraction contains both positive "
                        "and negative food observations."
                    ),
                    "medium" if old.get("negative_observations") else "low",
                )
            )
    mixed_candidates.sort(key=lambda item: _tie(item[0]))
    mixed_candidates.extend(
        (
            row,
            (
                "Multiple stored qualitative themes but no reliable polarity split; included "
                "as a low-confidence mixed challenge."
            ),
            "low",
        )
        for row in sorted(
            rows,
            key=lambda row: (-len(row["review_themes"]), _tie(row)),
        )
    )
    add("mixed", mixed_candidates)

    sparse_candidates = sorted(
        rows,
        key=lambda row: (
            not (
                row["digital_footprint_score"] >= 70
                and not row["website"]
                and len(row["evidence_urls"]) <= 4
                and len(row["review_themes"]) <= 1
            ),
            -row["digital_footprint_score"],
            len(row["evidence_urls"]),
            _tie(row),
        ),
    )
    add(
        "sparse",
        [
            (
                row,
                (
                    f"No official website={not bool(row['website'])}; stored sources="
                    f"{len(row['evidence_urls'])}; review themes={len(row['review_themes'])}; "
                    f"digital-scarcity score={row['digital_footprint_score']:.2f}."
                ),
                "high" if not row["website"] and len(row["evidence_urls"]) <= 4 else "medium",
            )
            for row in sparse_candidates
        ],
    )

    positive_candidates = sorted(
        rows,
        key=lambda row: (
            -float(prior.get(row["place_id"], {}).get("research_quality_adjustment", 0)),
            -len(row["review_themes"]),
            -row["base_quality_prior"],
            _tie(row),
        ),
    )
    add(
        "positive",
        [
            (
                row,
                (
                    "Stored food-specific themes or prior blinded Quality extraction indicate "
                    "positive execution, ingredients, craft, or signature-dish evidence."
                ),
                "high"
                if prior.get(row["place_id"], {}).get("research_quality_adjustment", 0) >= 1
                else "medium",
            )
            for row in positive_candidates
        ],
    )

    selected.sort(
        key=lambda row: (
            ("positive", "mixed", "negative", "sparse").index(row["challenge_bucket"]),
            _tie(row),
        )
    )
    payload = {
        "experiment": "quality-v4-challenge",
        "created_at": datetime.now(UTC).isoformat(),
        "seed": SEED,
        "sample_size": len(selected),
        "bucket_counts": dict(Counter(row["challenge_bucket"] for row in selected)),
        "label_confidence_counts": dict(Counter(row["label_confidence"] for row in selected)),
        "label_limitations": (
            "The catalog lacks a robust stored negative corpus. Negative/mixed supplements "
            "selected from the cheap prior or theme density are explicitly low-confidence."
        ),
        "production_database": str(db_path),
        "production_database_sha256": sha256(db_path),
        "restaurants": selected,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def _prompt(row: dict[str, Any]) -> str:
    context = {
        "established_identity": {
            "place_id": row["place_id"],
            "name_ja": row["name_ja"],
            "name_en": row["name_en"],
            "category": row["category"],
            "area": row["area"],
            "address": row["address"],
            "description": row["description"],
            "food_tags": row["food_tags"],
            "signature_dishes": row["signature_dishes"],
        },
        "task": "What credible evidence is available about the quality of the food itself?",
        "maximum_web_search_actions": MAX_SEARCH_ACTIONS,
    }
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))


def _done(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {
        str(json.loads(line)["place_id"])
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }


def _score_row(row: dict[str, Any], research: ChallengeResearchResult) -> dict[str, Any]:
    scoring = calculate_policy_adjustments(research.observations)
    context = row["scoring_context"]
    outputs: dict[str, Any] = {}
    for name, policy in scoring.policies.items():
        result = evaluate_with_quality_adjustment(
            FiyuEvidence(**context["evidence"]),
            InternalSignals(**context["internal"]),
            context["structured_research"],
            primary_category=context["primary_category"],
            quality_adjustment=policy.adjustment,
        )
        outputs[name] = {
            **asdict(policy),
            "researched_quality": round(
                max(
                    0.0,
                    min(100.0, row["base_quality_prior"] + policy.adjustment),
                ),
                2,
            ),
            "experimental_fiyu_score": result.fiyu_score,
            "fiyu_delta": round(result.fiyu_score - row["production_v3_score"], 2),
        }
    return {
        "policies": outputs,
        "qualifying_observations": scoring.qualifying_observations,
        "excluded_observations": scoring.excluded_observations,
        "independent_sources": scoring.independent_sources,
        "quality_families": scoring.quality_families,
        "corroborated_positive_claims": scoring.corroborated_positive_claims,
        "corroborated_negative_claims": scoring.corroborated_negative_claims,
        "strong_positive_observations": scoring.strong_positive_observations,
        "strong_negative_observations": scoring.strong_negative_observations,
    }


def run(
    manifest_path: Path,
    results_path: Path,
    *,
    model: str | None,
    limit: int | None,
) -> dict[str, int]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    db_path = Path(manifest["production_database"])
    if sha256(db_path) != manifest["production_database_sha256"]:
        raise RuntimeError("production database changed after manifest creation")
    load_dotenv()
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is missing")
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    client = OpenAI(max_retries=0)
    queue = [row for row in manifest["restaurants"] if row["place_id"] not in _done(results_path)]
    if limit is not None:
        queue = queue[:limit]
    counts: Counter[str] = Counter()
    with results_path.open("a", encoding="utf-8") as output:
        for row in queue:
            started_at = datetime.now(UTC).isoformat()
            started = time.perf_counter()
            record = {
                **{key: value for key, value in row.items() if key not in {"scoring_context"}},
                "status": "running",
                "model": selected_model,
                "prompt_version": PROMPT_VERSION,
                "started_at": started_at,
            }
            try:
                response = client.responses.parse(
                    model=selected_model,
                    reasoning={"effort": "low"},
                    tools=[{"type": "web_search", "search_context_size": "low"}],
                    include=["web_search_call.results"],
                    max_tool_calls=MAX_SEARCH_ACTIONS,
                    input=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": _prompt(row)},
                    ],
                    text_format=ChallengeResearchResult,
                    store=False,
                )
                parsed = getattr(response, "output_parsed", None)
                if parsed is None:
                    raise RuntimeError("OpenAI returned no parsed challenge result")
                research = ChallengeResearchResult.model_validate(parsed)
                metadata = extract_response_metadata(response, fallback_model=selected_model)
                record.update(
                    {
                        "status": "complete",
                        "quality_research": research.model_dump(mode="json"),
                        **_score_row(row, research),
                        "usage": {
                            "response_id": metadata.response_id,
                            "model": metadata.model,
                            "web_search_action_count": metadata.web_search_action_count,
                            "token_usage": metadata.usage_metadata,
                            "latency_seconds": round(time.perf_counter() - started, 3),
                        },
                    }
                )
                counts["complete"] += 1
            except (APITimeoutError, APIConnectionError) as exc:
                record.update({"status": "needs_retry", "error": f"{type(exc).__name__}: {exc}"})
                counts["needs_retry"] += 1
            except Exception as exc:  # noqa: BLE001 - every paid attempt is recorded
                record.update({"status": "failed", "error": f"{type(exc).__name__}: {exc}"})
                counts["failed"] += 1
            record["completed_at"] = datetime.now(UTC).isoformat()
            record.setdefault("usage", {})["latency_seconds"] = round(
                time.perf_counter() - started, 3
            )
            output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            output.flush()
    if sha256(db_path) != manifest["production_database_sha256"]:
        raise RuntimeError("production database changed during challenge run")
    return dict(counts)


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def _adjustment_bucket(value: float) -> str:
    if value <= -12:
        return "<= -12"
    if value < -7:
        return "-11.99 to -7"
    if value < -4:
        return "-6.99 to -4"
    if value < -2:
        return "-3.99 to -2"
    if value < -0.5:
        return "-1.99 to -0.5"
    if value < 0.5:
        return "-0.49 to +0.49"
    if value < 2:
        return "+0.5 to +1.99"
    if value < 4:
        return "+2 to +3.99"
    if value < 7:
        return "+4 to +6.99"
    if value < 12:
        return "+7 to +11.99"
    return ">= +12"


def _rank(values: list[float]) -> list[float]:
    ordered = sorted((value, index) for index, value in enumerate(values))
    ranks = [0.0] * len(values)
    cursor = 0
    while cursor < len(ordered):
        end = cursor
        while end + 1 < len(ordered) and ordered[end + 1][0] == ordered[cursor][0]:
            end += 1
        rank = (cursor + end) / 2 + 1
        for position in range(cursor, end + 1):
            ranks[ordered[position][1]] = rank
        cursor = end + 1
    return ranks


def _correlation(left: list[float], right: list[float]) -> float:
    left_rank, right_rank = _rank(left), _rank(right)
    left_mean, right_mean = statistics.mean(left_rank), statistics.mean(right_rank)
    numerator = sum(
        (a - left_mean) * (b - right_mean) for a, b in zip(left_rank, right_rank, strict=True)
    )
    denominator = (
        sum((a - left_mean) ** 2 for a in left_rank)
        * sum((b - right_mean) ** 2 for b in right_rank)
    ) ** 0.5
    return round(numerator / denominator, 4) if denominator else 1.0


def analyze(
    manifest_path: Path,
    results_path: Path,
    summary_path: Path,
    report_path: Path,
    policy_report_path: Path,
    diagnostics_path: Path,
) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rows = [
        json.loads(line)
        for line in results_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    complete = [row for row in rows if row["status"] == "complete"]
    manifest_rows = {row["place_id"]: row for row in manifest["restaurants"]}
    for row in complete:
        research = ChallengeResearchResult.model_validate(row["quality_research"])
        row.update(_score_row(manifest_rows[row["place_id"]], research))
    # The model output is immutable evidence, while policy derivations are cheap and
    # deterministic. Persist the current derivations so the JSONL and reports cannot
    # disagree after an offline policy correction.
    results_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    policy_names = ("policy_a_5", "policy_b_10", "policy_c_15", "policy_d_20")
    evidence_levels = Counter(row["quality_research"]["evidence_level"] for row in complete)
    source_analysis: dict[str, Counter[str]] = defaultdict(Counter)
    language_analysis: dict[str, Counter[str]] = defaultdict(Counter)
    family_analysis: dict[str, Counter[str]] = defaultdict(Counter)
    for row in complete:
        for raw in row["quality_research"]["observations"]:
            observation = ChallengeObservation.model_validate(raw)
            if not is_qualifying(observation):
                continue
            for key, target in (
                (observation.source_type, source_analysis),
                (observation.source_language, language_analysis),
            ):
                target[key]["observations"] += 1
                target[key][observation.polarity] += 1
                target[key][f"bucket_{row['challenge_bucket']}"] += 1
                target[key]["moderate_or_strong"] += observation.strength in {
                    "moderate",
                    "strong",
                }
                target[key][f"restaurant:{row['place_id']}"] = 1
                target[key][f"bucket_restaurant:{row['challenge_bucket']}:{row['place_id']}"] = 1
            family = family_analysis[observation.evidence_family]
            family["observations"] += 1
            family[observation.polarity] += 1
            family["moderate_or_strong"] += observation.strength in {"moderate", "strong"}
            family[f"restaurant:{row['place_id']}"] = 1

    policies: dict[str, Any] = {}
    baseline_scores = [float(row["production_v3_score"]) for row in complete]
    for name in policy_names:
        adjustments = [float(row["policies"][name]["adjustment"]) for row in complete]
        scores = [float(row["policies"][name]["experimental_fiyu_score"]) for row in complete]
        score_deltas = [score - baseline for score, baseline in zip(scores, baseline_scores, strict=True)]
        baseline_ranks = _rank(baseline_scores)
        policy_ranks = _rank(scores)
        rank_changes = [
            abs(policy - baseline)
            for policy, baseline in zip(policy_ranks, baseline_ranks, strict=True)
        ]
        bucket_results: dict[str, Any] = {}
        for bucket in ("positive", "mixed", "negative", "sparse"):
            values = [
                float(row["policies"][name]["adjustment"])
                for row in complete
                if row["challenge_bucket"] == bucket
            ]
            bucket_results[bucket] = {
                "negative": sum(value < -0.49 for value in values),
                "near_neutral": sum(-0.49 <= value <= 0.49 for value in values),
                "positive": sum(value > 0.49 for value in values),
                "mean": round(statistics.mean(values), 3) if values else 0,
            }
        thresholds = {}
        for threshold in (68, 70, 75):
            thresholds[str(threshold)] = {
                "v3_pass": sum(
                    row["non_score_eligible"] and row["production_v3_score"] >= threshold
                    for row in complete
                ),
                "experimental_pass": sum(
                    row["non_score_eligible"]
                    and row["policies"][name]["experimental_fiyu_score"] >= threshold
                    for row in complete
                ),
                "up": sum(
                    row["non_score_eligible"]
                    and row["production_v3_score"]
                    < threshold
                    <= row["policies"][name]["experimental_fiyu_score"]
                    for row in complete
                ),
                "down": sum(
                    row["non_score_eligible"]
                    and row["production_v3_score"]
                    >= threshold
                    > row["policies"][name]["experimental_fiyu_score"]
                    for row in complete
                ),
            }
        policies[name] = {
            "distribution": dict(Counter(_adjustment_bucket(value) for value in adjustments)),
            "statistics": {
                "mean": round(statistics.mean(adjustments), 3),
                "median": round(statistics.median(adjustments), 3),
                "p90_absolute": round(_percentile([abs(value) for value in adjustments], 0.9), 3),
                "min": min(adjustments),
                "max": max(adjustments),
            },
            "by_challenge_bucket": bucket_results,
            "rank_correlation_vs_v3": _correlation(baseline_scores, scores),
            "rank_change": {
                "mean_absolute": round(statistics.mean(rank_changes), 3),
                "maximum_absolute": round(max(rank_changes), 3),
            },
            "final_score_delta": {
                "mean": round(statistics.mean(score_deltas), 3),
                "median": round(statistics.median(score_deltas), 3),
                "min": round(min(score_deltas), 3),
                "max": round(max(score_deltas), 3),
            },
            "thresholds": thresholds,
            "wrong_direction_cases": {
                "negative_boosted": sum(
                    row["challenge_bucket"] == "negative"
                    and row["policies"][name]["adjustment"] > 0.49
                    for row in complete
                ),
                "positive_downgraded": sum(
                    row["challenge_bucket"] == "positive"
                    and row["policies"][name]["adjustment"] < -0.49
                    for row in complete
                ),
                "sparse_non_neutral": sum(
                    row["challenge_bucket"] == "sparse"
                    and abs(row["policies"][name]["adjustment"]) > 0.49
                    for row in complete
                ),
            },
        }

    def normalize_source(values: dict[str, Counter[str]]) -> dict[str, Any]:
        output = {}
        for key, counts in values.items():
            restaurants = sum(name.startswith("restaurant:") for name in counts)
            bucket_restaurants = {
                bucket: sum(name.startswith(f"bucket_restaurant:{bucket}:") for name in counts)
                for bucket in ("positive", "mixed", "negative", "sparse")
            }
            output[key] = {
                "restaurants": restaurants,
                "restaurants_by_challenge_bucket": bucket_restaurants,
                **{
                    name: value
                    for name, value in counts.items()
                    if not name.startswith(("restaurant:", "bucket_restaurant:"))
                },
            }
        return output

    sparse_rows = [row for row in complete if row["challenge_bucket"] == "sparse"]
    mixed_rows = [row for row in complete if row["challenge_bucket"] == "mixed"]

    def polarities(row: dict[str, Any]) -> set[str]:
        return {
            item["polarity"]
            for item in row["quality_research"]["observations"]
            if is_qualifying(ChallengeObservation.model_validate(item))
        }

    no_evidence = [
        row
        for row in complete
        if not any(
            is_qualifying(ChallengeObservation.model_validate(item))
            for item in row["quality_research"]["observations"]
        )
    ]
    summary = {
        "experiment": manifest["experiment"],
        "sample_size": manifest["sample_size"],
        "bucket_counts": manifest["bucket_counts"],
        "label_confidence_counts": manifest["label_confidence_counts"],
        "label_limitations": manifest["label_limitations"],
        "requests": len(rows),
        "completed": len(complete),
        "failures": sum(row["status"] == "failed" for row in rows),
        "needs_retry": sum(row["status"] == "needs_retry" for row in rows),
        "web_search_actions": sum(
            int(row.get("usage", {}).get("web_search_action_count", 0)) for row in complete
        ),
        "token_usage": {
            key: sum(
                int(row.get("usage", {}).get("token_usage", {}).get(key, 0) or 0)
                for row in complete
            )
            for key in ("input_tokens", "output_tokens", "total_tokens")
        },
        "latency_seconds": {
            "mean": round(statistics.mean(row["usage"]["latency_seconds"] for row in complete), 3),
            "p90": round(
                _percentile([row["usage"]["latency_seconds"] for row in complete], 0.9),
                3,
            ),
        },
        "evidence_levels": dict(evidence_levels),
        "positive_observations": sum(
            item["polarity"] == "positive"
            for row in complete
            for item in row["quality_research"]["observations"]
            if is_qualifying(ChallengeObservation.model_validate(item))
        ),
        "negative_observations": sum(
            item["polarity"] == "negative"
            for row in complete
            for item in row["quality_research"]["observations"]
            if is_qualifying(ChallengeObservation.model_validate(item))
        ),
        "mixed_rows_with_both_polarities": sum(
            row["challenge_bucket"] == "mixed"
            and {
                item["polarity"]
                for item in row["quality_research"]["observations"]
                if is_qualifying(ChallengeObservation.model_validate(item))
            }
            >= {"positive", "negative"}
            for row in complete
        ),
        "no_evidence_rows": len(no_evidence),
        "no_evidence_all_policy_zero": sum(
            all(row["policies"][name]["adjustment"] == 0 for name in policy_names)
            for row in no_evidence
        ),
        "source_types": normalize_source(source_analysis),
        "source_languages": normalize_source(language_analysis),
        "quality_families": normalize_source(family_analysis),
        "mixed_extraction": {
            "rows": len(mixed_rows),
            "both_positive_and_negative": sum(
                polarities(row) >= {"positive", "negative"} for row in mixed_rows
            ),
            "positive_only": sum(polarities(row) == {"positive"} for row in mixed_rows),
            "negative_only": sum(polarities(row) == {"negative"} for row in mixed_rows),
            "neither": sum(not polarities(row) for row in mixed_rows),
        },
        "sparse_safety_policy_d_20": {
            "rows": len(sparse_rows),
            "near_zero": sum(
                abs(row["policies"]["policy_d_20"]["adjustment"]) <= 0.49
                for row in sparse_rows
            ),
            "near_zero_percent": round(
                100
                * sum(
                    abs(row["policies"]["policy_d_20"]["adjustment"]) <= 0.49
                    for row in sparse_rows
                )
                / len(sparse_rows),
                1,
            ),
            "negative": sum(
                row["policies"]["policy_d_20"]["adjustment"] < -0.49
                for row in sparse_rows
            ),
            "positive": sum(
                row["policies"]["policy_d_20"]["adjustment"] > 0.49
                for row in sparse_rows
            ),
            "no_evidence": sum(
                row["quality_research"]["evidence_level"] == "none" for row in sparse_rows
            ),
        },
        "policies": policies,
        "policy_d_20_abs_at_least_7": sum(
            abs(row["policies"]["policy_d_20"]["adjustment"]) >= 7 for row in complete
        ),
        "policy_d_20_abs_at_least_12": sum(
            abs(row["policies"]["policy_d_20"]["adjustment"]) >= 12 for row in complete
        ),
        "production_database_sha256_before": manifest["production_database_sha256"],
        "production_database_sha256_after": sha256(Path(manifest["production_database"])),
    }
    summary["production_database_unchanged"] = (
        summary["production_database_sha256_before"] == summary["production_database_sha256_after"]
    )
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    def table(title: str, selected: list[dict[str, Any]]) -> list[str]:
        lines = [
            f"## {title}",
            "",
            "| Restaurant | Bucket | Base Q | ±5 | ±10 | ±15 | ±20 | Q±5 | Q±10 | Q±15 | Q±20 | v3 | score ±5 | score ±10 | score ±15 | score ±20 | +obs | -obs | Confidence | Sources | Types | Languages |",
            "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|",
        ]
        for row in selected:
            observations = [
                ChallengeObservation.model_validate(item)
                for item in row["quality_research"]["observations"]
                if is_qualifying(ChallengeObservation.model_validate(item))
            ]
            languages = ", ".join(sorted({item.source_language for item in observations})) or "none"
            source_types = ", ".join(sorted({item.source_type for item in observations})) or "none"
            positive_count = sum(item.polarity == "positive" for item in observations)
            negative_count = sum(item.polarity == "negative" for item in observations)
            p = row["policies"]
            lines.append(
                f"| {row['name']} | {row['challenge_bucket']} | {row['base_quality_prior']:.2f} | "
                f"{p['policy_a_5']['adjustment']:+.2f} | {p['policy_b_10']['adjustment']:+.2f} | "
                f"{p['policy_c_15']['adjustment']:+.2f} | {p['policy_d_20']['adjustment']:+.2f} | "
                f"{p['policy_a_5']['researched_quality']:.2f} | {p['policy_b_10']['researched_quality']:.2f} | "
                f"{p['policy_c_15']['researched_quality']:.2f} | {p['policy_d_20']['researched_quality']:.2f} | "
                f"{row['production_v3_score']:.2f} | {p['policy_a_5']['experimental_fiyu_score']:.2f} | "
                f"{p['policy_b_10']['experimental_fiyu_score']:.2f} | {p['policy_c_15']['experimental_fiyu_score']:.2f} | "
                f"{p['policy_d_20']['experimental_fiyu_score']:.2f} | {positive_count} | {negative_count} | "
                f"{row['quality_research']['quality_evidence_confidence']} | {row['independent_sources']} | "
                f"{source_types} | {languages} |"
            )
        return lines + [""]

    policy_lines = [
        "# Quality-v4 policy comparison",
        "",
        "The four caps were not meaningfully exercised. The largest Quality adjustment was ",
        f"{policies['policy_d_20']['statistics']['max']:+.2f}; no result reached ±2, let alone ±5. ",
        "Policies C and D were identical, and B differed from A only when the broad-evidence ",
        "unlock activated. This run therefore supplies no empirical justification for a cap ",
        "above ±5.",
        "",
        "The comparison is also one-sided: no restaurant received a net negative adjustment. ",
        "That is a research/extraction defect, not evidence that negative corrections are ",
        "unnecessary. Until a better negative challenge corpus and claim-clustering pass ",
        "demonstrate symmetric behavior, none of these policies should ship.",
        "",
        "```json",
        json.dumps(policies, ensure_ascii=False, indent=2),
        "```",
        "",
    ]
    diagnostic_lines = ["# Quality-v4 challenge diagnostics", ""]
    for name in policy_names:
        diagnostic_lines += table(
            f"{name}: 15 biggest risers",
            sorted(complete, key=lambda row: row["policies"][name]["adjustment"], reverse=True)[
                :15
            ],
        )
        diagnostic_lines += table(
            f"{name}: 15 biggest fallers",
            sorted(complete, key=lambda row: row["policies"][name]["adjustment"])[:15],
        )
    diagnostic_lines += table(
        "15 mixed restaurants",
        [row for row in complete if row["challenge_bucket"] == "mixed"][:15],
    )
    diagnostic_lines += table(
        "15 sparse near-zero restaurants",
        [
            row
            for row in complete
            if row["challenge_bucket"] == "sparse"
            and abs(row["policies"]["policy_d_20"]["adjustment"]) <= 0.49
        ][:15],
    )
    wrong = [
        row
        for row in complete
        if (
            row["challenge_bucket"] == "negative"
            and row["policies"]["policy_d_20"]["adjustment"] > 0.49
        )
        or (
            row["challenge_bucket"] == "positive"
            and row["policies"]["policy_d_20"]["adjustment"] < -0.49
        )
    ]
    diagnostic_lines += table("All wrong-direction challenge cases under ±20", wrong)
    for title, low, high in (
        ("Scores 67–69", 67, 69),
        ("Scores 69–71", 69, 71),
        ("Scores 74–76", 74, 76),
    ):
        diagnostic_lines += table(
            title,
            [
                row
                for row in complete
                if low <= row["policies"]["policy_d_20"]["experimental_fiyu_score"] < high
            ],
        )
    diagnostic_lines += table(
        "Scores 80+ under ±20",
        [
            row
            for row in complete
            if row["policies"]["policy_d_20"]["experimental_fiyu_score"] >= 80
        ],
    )
    diagnostic_lines += table(
        "Dedicated ±20 review: absolute adjustment at least 7",
        [row for row in complete if abs(row["policies"]["policy_d_20"]["adjustment"]) >= 7],
    )
    policy_report_path.write_text("\n".join(policy_lines), encoding="utf-8")
    diagnostics_path.write_text("\n".join(diagnostic_lines), encoding="utf-8")
    report_lines = [
        "# Quality-v4 challenge-set report",
        "",
        "Experimental only; no production state was changed.",
        "",
        "## Executive finding",
        "",
        "Stage 1 passed, but Stage 2 did not demonstrate a production-ready researched-Quality ",
        "update. Extraction found positive food evidence readily, preserved exact neutrality ",
        "when it found no evidence, and did not penalize sparse restaurants. It did not reliably ",
        "find or consolidate negative evidence: 387 qualifying positive observations versus 16 ",
        "negative observations, only 4 of 25 mixed rows contained both polarities, and every net ",
        "adjustment was non-negative. Twenty-three of 25 nominal negative challenge rows were ",
        "boosted, although 24 of those labels were low-confidence because the stored catalog lacks ",
        "a robust negative corpus.",
        "",
        "Recommendation: do not promote this experiment to production v4. Retain the evidence ",
        "schema, build a verified negative/mixed benchmark, normalize semantically equivalent ",
        "claims before corroboration, and rerun. If a provisional safety limit were required, ±5 ",
        "is the only defensible hard cap from this sample; the intended healthy normal range ",
        "remains roughly -3 to +3, with symmetric hard caps and nonlinear unlocks in principle.",
        "",
        "## Run accounting",
        "",
        "- Challenge set: 100 (25 each positive, mixed, negative, sparse); labels: 50 high, 1 medium, 49 low confidence.",
        f"- Requests: {summary['requests']}; completed: {summary['completed']}; failures: {summary['failures']}; needs retry: {summary['needs_retry']}.",
        f"- Web-search actions: {summary['web_search_actions']}; tokens: {summary['token_usage']['total_tokens']:,} total.",
        "- The two failures were schema-validation failures caused by an overly short `notes` maximum. They were deliberately not retried; the offline schema was corrected for future runs.",
        "",
        "## Extraction and sparse safety",
        "",
        f"- Evidence levels among completed rows: {json.dumps(summary['evidence_levels'], ensure_ascii=False)}.",
        f"- No-evidence rows: {summary['no_evidence_rows']}; all {summary['no_evidence_all_policy_zero']} remained exactly zero under every policy.",
        f"- Sparse controls near zero under ±20: {summary['sparse_safety_policy_d_20']['near_zero']}/{summary['sparse_safety_policy_d_20']['rows']} ({summary['sparse_safety_policy_d_20']['near_zero_percent']}%).",
        f"- Sparse controls with a negative adjustment: {summary['sparse_safety_policy_d_20']['negative']}; with a positive adjustment above +0.49: {summary['sparse_safety_policy_d_20']['positive']}.",
        "- Sparse movement came from explicit food-specific review/blog observations, not from no-site, low-review-count, Japanese language, or obscurity fields. A no-official-site restaurant can therefore remain neutral or move from actual evidence.",
        "- The largest sparse adjustment was modest; ±20 caused no amplification because no broad/strong unlock reached large values.",
        "",
        "## Human observation-precision audit",
        "",
        "The audit covered 30 positive observations, all 16 negative observations, 20 observations ",
        "from mixed rows, and 20 sparse restaurant cases. This checked extraction semantics and ",
        "stored provenance; it was not a second external verification of every linked page.",
        "",
        "- Most audited positive observations were genuinely food-focused and specific, especially preparation, texture, broth, ingredient sourcing, and signature dishes. Borderline cases remained: generic 'tasted good' language, culinary lineage, editorial interest, and evidence transferred from a related group/branch can be over-rated as Quality.",
        "- Of 16 negative observations, several were specific execution or ingredient complaints, but La Cocina de Gastón and Semolina were vague, Gorio lacked the actual defect, and Taiyaki Isuzu described an equipment-maintenance incident rather than stable restaurant quality.",
        "- Every isolated negative was correctly prevented from creating a negative value. However, Mario Tenshin had three independent, directionally similar ramen criticisms that failed to corroborate because the model emitted three different `underlying_claim_identity` values. Claim normalization is therefore too literal.",
        "- Mixed extraction was weak: 4 rows had both positive and negative qualifying observations, 21 were positive-only, and none were negative-only. Absence statements tagged `mixed` were deterministically excluded and did not affect scores.",
        "- No copied-source case created a large boost and no adjustment reached ±2, but provenance identities are still model-authored and need deterministic normalization/audit before production use.",
        "",
        "## Source findings",
        "",
        "- Japanese-language sources dominated (386/403 qualifying observations) and were useful for 11 of 25 sparse controls. This supports their practical importance, but not a causal language bonus.",
        "- Local review platforms produced 185 observations (145 moderate/strong) and were the largest source of dish-level and recurring themes.",
        "- Local food blogs produced 108 observations (92 moderate/strong) and were especially useful for technique, texture, and preparation detail.",
        "- Editorial food media were rarer (22 observations) but 21 were moderate/strong; this is consistent with higher specificity, not proof of higher precision.",
        "- Map-review platforms produced 33 observations (27 moderate/strong), useful for direct dish reports but rarely enough to establish consensus alone.",
        "- Source/language counts describe qualifying model extractions, not independently verified source accuracy.",
        "",
        "## Policy conclusion",
        "",
        "- ±5: mean +0.788, median +0.815, max +1.89 Quality; 3 upward crossings at 70 and 2 at 75. No downward crossings.",
        "- ±10: mean +0.799, median +0.840, max +1.89. The broader unlock changed little and produced the same threshold counts.",
        "- ±15: identical to ±10 in this run; it added no useful correction.",
        "- ±20: identical to ±15; zero cases reached |7| or |12|, so the dedicated large-movement review set was empty.",
        "- The largest final Fiyu Score increase was +0.84 (Gorio under ±10/±15/±20). Production caps made some positive Quality changes produce zero final-score change, which is expected and monotonic.",
        "- Rank correlations were 0.999 for all policies. Broader caps did not let materially stronger evidence matter; they were essentially inactive.",
        "",
        "## Direct answers",
        "",
        "1. Zero-adjustment parity is exact across the full researched catalog: yes.",
        "2. The prior downward-crossing bug mixed freshly recomputed Quality with historical stored H/I/LD component columns, then recomposed outside the canonical evaluator.",
        "3. Positive evidence detection: yes, readily, though some borderline evidence is over-classified.",
        "4. Negative evidence detection: no, not reliably enough for a posterior update.",
        "5. Genuinely mixed representation: schema yes; extraction no (only 4/25 mixed controls captured both polarities).",
        "6. No evidence remains exactly neutral: yes, 13/13 rows.",
        "7. Sparse restaurants are protected from missing-evidence penalties: yes in this run.",
        "8. Obscurity is not directly rewarded as Quality; sparse positive movement was tied to extracted food evidence.",
        "9. Isolated negative reviews are ignored for downward adjustment: yes.",
        "10. Most useful families were craft/execution and food reputation/specialization; ingredient and consistency evidence was thinner.",
        "11. Local review platforms and detailed local food blogs supplied the most usable volume; editorial sources were rarer but usually specific.",
        "12. Japanese sources were particularly useful in coverage, including 11 sparse controls, but language itself must not score.",
        "13. ±5 is not shown to be restrictive; the maximum observed movement was +1.89.",
        "14. ±10 was not materially better.",
        "15. ±15 added no useful correction.",
        "16. ±20 enabled no justified correction suppressed by smaller policies.",
        "17. ±20 produced no implausibly large changes because it never activated beyond +1.89.",
        "18. A production hard cap is not validated. If forced provisionally, use symmetric ±5.",
        "19. A healthy normal range still appears to be roughly -3 to +3, but this run only demonstrated 0 to +1.89.",
        "20. Positive and negative hard caps should be symmetric in principle; negative corroboration may retain a slightly higher evidence threshold.",
        "21. Strong evidence should unlock movement nonlinearly: yes, with deterministic, normalized corroboration gates.",
        "22. Researched Quality is not sufficiently informative for production v4.",
        "23. The exact remaining defect is positivity-biased retrieval/extraction plus overly literal cross-source claim identity, compounded by a weak negative/mixed benchmark.",
        "24. Preserve the four-family observation schema, polarity/strength, food specificity, directness, source URL/type/language/date, document identity, provenance group, underlying claim identity, independent source key, evidence level, and separate confidence—but normalize/audit identities outside the model.",
        "25. Production policy recommendation: none yet. Rerun after the defect above; ±5 is only a temporary safety ceiling, not a validated launch policy.",
        "",
        "## Machine-readable summary",
        "",
        "```json",
        json.dumps(summary, ensure_ascii=False, indent=2),
        "```",
        "",
    ]
    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "run", "analyze"))
    parser.add_argument("--db", type=Path, default=DB)
    parser.add_argument("--prior-results", type=Path, default=PRIOR_RESULTS)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--results", type=Path, default=RESULTS)
    parser.add_argument("--summary", type=Path, default=SUMMARY)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--policy-report", type=Path, default=POLICY_REPORT)
    parser.add_argument("--diagnostics", type=Path, default=DIAGNOSTICS)
    parser.add_argument("--model")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if args.command == "prepare":
        manifest = prepare(args.db, args.prior_results, args.manifest)
        output = {
            "sample_size": manifest["sample_size"],
            "bucket_counts": manifest["bucket_counts"],
            "label_confidence_counts": manifest["label_confidence_counts"],
            "database_sha256": manifest["production_database_sha256"],
        }
    elif args.command == "run":
        output = run(args.manifest, args.results, model=args.model, limit=args.limit)
    else:
        output = analyze(
            args.manifest,
            args.results,
            args.summary,
            args.report,
            args.policy_report,
            args.diagnostics,
        )
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
