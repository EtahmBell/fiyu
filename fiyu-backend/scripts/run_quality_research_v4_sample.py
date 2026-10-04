"""Run the isolated, paid Quality-only v4 research sample.

This script never opens the production database for writing.  Use ``prepare`` to
freeze the sample before any external calls, ``run`` to append isolated JSONL
results, and ``analyze`` to create the summary and diagnostic report.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import sqlite3
import statistics
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import APIConnectionError, APITimeoutError, OpenAI

from fiyu.address_research import extract_response_metadata
from fiyu.experimental_quality_research_v4 import (
    QualityResearchResult,
    calculate_quality_adjustment,
    is_qualifying_quality_observation,
)
from fiyu.experimental_score_v4 import experimental_score

DEFAULT_DB = Path("data/fiyu.db")
DEFAULT_BASELINE = Path("data/audits/fiyu-score-v4-comparison.csv")
DEFAULT_MANIFEST = Path("data/audits/quality-research-v4-sample-manifest.json")
DEFAULT_RESULTS = Path("data/audits/quality-research-v4-sample.jsonl")
DEFAULT_SUMMARY = Path("data/audits/quality-research-v4-summary.json")
DEFAULT_REPORT = Path("data/audits/quality-research-v4-report.md")
SEED = "fiyu-quality-v4-paid-20261004"
PROMPT_VERSION = "quality-only-v4-experiment-2026-10-04"
MAX_SEARCH_ACTIONS = 5

BANDS = (
    ("65-67.99", 65.0, 68.0),
    ("68-69.99", 68.0, 70.0),
    ("70-74.99", 70.0, 75.0),
    ("75-79.99", 75.0, 80.0),
    ("80+", 80.0, float("inf")),
)

SYSTEM_PROMPT = """You are performing a bounded, experimental QUALITY-ONLY research pass for a Tokyo restaurant.

Search for NEW, grounded evidence about FOOD and CULINARY QUALITY only. Do not redo identity, address, chain, eligibility, card copy, popularity, hiddenness, or local-discovery research. Use no more than five web searches. Search Japanese-language and local sources where useful.

Critical rules:
- Failure to find evidence is neutral, never evidence of poor quality.
- Do not use aggregate star ratings as a Quality signal.
- Do not infer quality from low review count, obscurity, independence, localness, reservation scarcity, or weak web presence.
- Return none/sparse and no negative observation when credible quality evidence is absent.
- Individual user reviews are weak; repeated independent qualitative themes may be stronger.
- Negative evidence requires corroboration. Never generalize from one angry review.
- Official restaurant sources may establish factual technique, sourcing, or specialization, but cannot by themselves establish excellence.
- Every observation must be food-specific, source-grounded, and use the exact page URL.
- Give copied, mirrored, syndicated, platform-duplicated, or PR-derived claims the same claim_key and underlying independent_source_key.
- Do not output a Quality score, point adjustment, eligibility recommendation, or publication recommendation.

Use aspects only as defined by the response schema. For review_theme_consensus, require a recurring qualitative food theme, not a rating average. Keep claims compact and auditable."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json(value: object, default: Any) -> Any:
    try:
        return json.loads(str(value or ""))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _database_rows(db_path: Path) -> dict[str, dict[str, Any]]:
    uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
                   p.discovery_area, p.normalized_address, p.evidence_json,
                   p.evidence_urls_json, p.review_themes_json, p.description_en,
                   p.signature_dishes_json, p.food_tags_json,
                   r.title, r.category AS source_category, r.search_area,
                   r.rating, r.review_count, r.website,
                   r.digital_footprint_type, r.digital_footprint_score,
                   r.quality_score, r.internal_fiyu_score,
                   rr.structured_research_json
            FROM public_restaurants p
            JOIN restaurants r ON r.id = p.source_restaurant_id
            LEFT JOIN restaurant_research_runs rr
              ON rr.public_restaurant_id = p.place_id AND rr.is_current = 1
            WHERE p.research_status = 'complete'
            """
        ).fetchall()
    finally:
        connection.close()
    return {str(row["place_id"]): dict(row) for row in rows}


def _band(score: float) -> str | None:
    for name, low, high in BANDS:
        if low <= score < high:
            return name
    return None


def _low_footprint(row: dict[str, Any]) -> bool:
    structured = _read_json(row.get("structured_research_json"), {})
    evidence_urls = _read_json(row.get("evidence_urls_json"), [])
    return (
        float(row.get("digital_footprint_score") or 0) >= 70
        and not row.get("website")
        and structured.get("official_website_found") is not True
        and len(evidence_urls) <= 5
    )


def _diversity_key(row: dict[str, Any]) -> tuple[str, ...]:
    quality = float(row.get("base_quality_prior") or 0)
    reviews = int(row.get("review_count") or 0)
    return (
        str(row.get("category") or "unknown").casefold(),
        str(row.get("area") or "unknown").casefold(),
        str(int(quality // 10)),
        "0" if reviews < 20 else "1" if reviews < 100 else "2" if reviews < 500 else "3",
        str(row.get("digital_footprint_type") or "unknown"),
    )


def _select_diverse(
    pool: list[dict[str, Any]], count: int, rng: random.Random
) -> list[dict[str, Any]]:
    shuffled = list(pool)
    rng.shuffle(shuffled)
    selected: list[dict[str, Any]] = []
    seen: list[set[str]] = [set() for _ in range(5)]
    while shuffled and len(selected) < count:
        best_index = max(
            range(len(shuffled)),
            key=lambda index: (
                sum(
                    value not in seen[position]
                    for position, value in enumerate(_diversity_key(shuffled[index]))
                ),
                hashlib.sha256(f"{SEED}:{shuffled[index]['place_id']}".encode()).hexdigest(),
            ),
        )
        item = shuffled.pop(best_index)
        selected.append(item)
        for position, value in enumerate(_diversity_key(item)):
            seen[position].add(value)
    return selected


def prepare_manifest(db_path: Path, baseline_path: Path, manifest_path: Path) -> dict[str, Any]:
    database = _database_rows(db_path)
    with baseline_path.open(encoding="utf-8", newline="") as handle:
        baseline = list(csv.DictReader(handle))
    eligible: list[dict[str, Any]] = []
    for item in baseline:
        place_id = item["place_id"]
        db_row = database.get(place_id)
        if not db_row:
            continue
        score = float(item["v3_current_recomputed_score"])
        band = _band(score)
        if not band:
            continue
        row = {
            "place_id": place_id,
            "name": item["name"],
            "category": item["category"],
            "area": item["area"],
            "score_band": band,
            "current_v3_score": score,
            "internal_candidate_score": float(item["internal_candidate_score"]),
            "base_quality_prior": float(item["base_quality_prior"]),
            "hiddenness": float(item["current_hiddenness"]),
            "independence": float(item["current_independence"]),
            "local_discovery": float(item["current_local_discovery"]),
            "non_score_eligible": item["non_score_eligible"].casefold() == "true",
            "rating": float(db_row.get("rating") or 0),
            "review_count": int(db_row.get("review_count") or 0),
            "digital_footprint_type": db_row.get("digital_footprint_type"),
            "digital_footprint_score": float(db_row.get("digital_footprint_score") or 0),
            "low_digital_footprint": _low_footprint(db_row),
            "existing_evidence_url_count": len(_read_json(db_row.get("evidence_urls_json"), [])),
        }
        row["research_context"] = {
            "name_ja": db_row.get("name_ja"),
            "name_en": db_row.get("name_en"),
            "address": db_row.get("normalized_address"),
            "description": db_row.get("description_en"),
            "food_tags": _read_json(db_row.get("food_tags_json"), []),
            "signature_dishes": _read_json(db_row.get("signature_dishes_json"), []),
            "existing_review_themes": _read_json(db_row.get("review_themes_json"), []),
            "existing_source_urls": _read_json(db_row.get("evidence_urls_json"), [])[:12],
        }
        eligible.append(row)

    rng = random.Random(SEED)
    selected: list[dict[str, Any]] = []
    allocation: dict[str, int] = {}
    for band_name, _low, _high in BANDS:
        pool = [row for row in eligible if row["score_band"] == band_name]
        low_pool = [row for row in pool if row["low_digital_footprint"]]
        low_selected = _select_diverse(low_pool, min(6, len(low_pool)), rng)
        remaining = [row for row in pool if row not in low_selected]
        band_selected = low_selected + _select_diverse(remaining, 20 - len(low_selected), rng)
        selected.extend(band_selected)
        allocation[band_name] = len(band_selected)

    # Neighbor-band redistribution is deterministic if any target band is short.
    if len(selected) < 100:
        remainder = [row for row in eligible if row not in selected]
        selected.extend(_select_diverse(remainder, 100 - len(selected), rng))

    payload = {
        "experiment": "fiyu-quality-research-v4",
        "created_at": datetime.now(UTC).isoformat(),
        "seed": SEED,
        "production_database": str(db_path),
        "production_database_sha256": sha256(db_path),
        "baseline_artifact": str(baseline_path),
        "baseline_sha256": sha256(baseline_path),
        "requested_sample_size": 100,
        "sample_size": len(selected),
        "band_allocation": allocation,
        "low_digital_footprint_count": sum(bool(row["low_digital_footprint"]) for row in selected),
        "restaurants": selected,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def _prompt(item: dict[str, Any]) -> str:
    context = {
        "established_identity": {
            "place_id": item["place_id"],
            "name": item["name"],
            "category": item["category"],
            "area": item["area"],
            **item["research_context"],
        },
        "task": "Find new positive and negative food-quality evidence without rescoring the restaurant.",
        "search_budget": {"maximum_web_search_actions": MAX_SEARCH_ACTIONS},
    }
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))


def _existing_results(path: Path) -> set[str]:
    if not path.exists():
        return set()
    completed: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            completed.add(str(json.loads(line)["place_id"]))
    return completed


def run_sample(
    manifest_path: Path, results_path: Path, *, limit: int | None, model: str | None
) -> dict[str, int]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    db_path = Path(manifest["production_database"])
    if sha256(db_path) != manifest["production_database_sha256"]:
        raise RuntimeError("production database hash changed after manifest creation")
    load_dotenv()
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is missing")
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    client = OpenAI(max_retries=0)
    already = _existing_results(results_path)
    queue = [item for item in manifest["restaurants"] if item["place_id"] not in already]
    if limit is not None:
        queue = queue[:limit]
    counts = Counter()
    results_path.parent.mkdir(parents=True, exist_ok=True)
    with results_path.open("a", encoding="utf-8") as output:
        for item in queue:
            started = datetime.now(UTC).isoformat()
            record: dict[str, Any] = {
                **{key: value for key, value in item.items() if key != "research_context"},
                "status": "running",
                "model": selected_model,
                "prompt_version": PROMPT_VERSION,
                "requested_maximum_web_search_actions": MAX_SEARCH_ACTIONS,
                "started_at": started,
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
                        {"role": "user", "content": _prompt(item)},
                    ],
                    text_format=QualityResearchResult,
                    store=False,
                )
                parsed = getattr(response, "output_parsed", None)
                if parsed is None:
                    raise RuntimeError("OpenAI returned no parsed Quality research result")
                research = QualityResearchResult.model_validate(parsed)
                adjustment = calculate_quality_adjustment(research.observations)
                researched_quality = round(
                    max(0.0, min(100.0, item["base_quality_prior"] + adjustment.adjustment)), 2
                )
                v4 = experimental_score(
                    quality=researched_quality,
                    hiddenness=item["hiddenness"],
                    independence=item["independence"],
                    local_discovery=item["local_discovery"],
                )
                metadata = extract_response_metadata(response, fallback_model=selected_model)
                record.update(
                    {
                        "status": "complete",
                        "quality_research": research.model_dump(mode="json"),
                        "positive_observations": [
                            item.model_dump(mode="json")
                            for item in research.observations
                            if is_qualifying_quality_observation(item)
                            and item.polarity == "positive"
                        ],
                        "negative_observations": [
                            item.model_dump(mode="json")
                            for item in research.observations
                            if is_qualifying_quality_observation(item)
                            and item.polarity == "negative"
                        ],
                        "source_list": sorted({item.source_url for item in research.observations}),
                        "quality_evidence_confidence": {
                            "score": adjustment.confidence_score,
                            "band": adjustment.confidence_band,
                        },
                        "research_quality_adjustment": adjustment.adjustment,
                        "researched_quality": researched_quality,
                        "experimental_v4_score": v4,
                        "v4_minus_v3": round(v4 - item["current_v3_score"], 2),
                        "independent_source_count": adjustment.independent_source_count,
                        "quality_specific_observation_count": adjustment.qualifying_observation_count,
                        "corroborated_claim_count": adjustment.corroborated_claim_count,
                        "aspect_contributions": adjustment.aspect_contributions,
                        "excluded_observation_count": adjustment.excluded_observation_count,
                        "usage": {
                            "response_id": metadata.response_id,
                            "model": metadata.model,
                            "web_search_action_count": metadata.web_search_action_count,
                            "token_usage": metadata.usage_metadata,
                        },
                    }
                )
                counts["complete"] += 1
            except (APITimeoutError, APIConnectionError) as exc:
                record.update({"status": "needs_retry", "error": f"{type(exc).__name__}: {exc}"})
                counts["needs_retry"] += 1
            except Exception as exc:  # noqa: BLE001 - paid attempts must remain auditable
                record.update({"status": "failed", "error": f"{type(exc).__name__}: {exc}"})
                counts["failed"] += 1
            record["completed_at"] = datetime.now(UTC).isoformat()
            output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            output.flush()
    if sha256(db_path) != manifest["production_database_sha256"]:
        raise RuntimeError("production database changed during isolated experiment")
    return dict(counts)


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * fraction)]


def analyze(
    manifest_path: Path, results_path: Path, summary_path: Path, report_path: Path
) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rows = [
        json.loads(line)
        for line in results_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    completed = [row for row in rows if row["status"] == "complete"]
    for row in completed:
        research = QualityResearchResult.model_validate(row["quality_research"])
        adjustment = calculate_quality_adjustment(research.observations)
        researched_quality = round(
            max(0.0, min(100.0, row["base_quality_prior"] + adjustment.adjustment)), 2
        )
        v4 = experimental_score(
            quality=researched_quality,
            hiddenness=row["hiddenness"],
            independence=row["independence"],
            local_discovery=row["local_discovery"],
        )
        row.update(
            {
                "derived_scoring_version": "quality-v4-experiment-1",
                "positive_observations": [
                    item.model_dump(mode="json")
                    for item in research.observations
                    if is_qualifying_quality_observation(item) and item.polarity == "positive"
                ],
                "negative_observations": [
                    item.model_dump(mode="json")
                    for item in research.observations
                    if is_qualifying_quality_observation(item) and item.polarity == "negative"
                ],
                "source_list": sorted({item.source_url for item in research.observations}),
                "research_quality_adjustment": adjustment.adjustment,
                "researched_quality": researched_quality,
                "experimental_v4_score": v4,
                "v4_minus_v3": round(v4 - row["current_v3_score"], 2),
                "independent_source_count": adjustment.independent_source_count,
                "quality_specific_observation_count": adjustment.qualifying_observation_count,
                "corroborated_claim_count": adjustment.corroborated_claim_count,
                "aspect_contributions": adjustment.aspect_contributions,
                "excluded_observation_count": adjustment.excluded_observation_count,
            }
        )
    results_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows),
        encoding="utf-8",
    )
    levels = Counter(row["quality_research"]["evidence_level"] for row in completed)
    adjustments = [float(row["research_quality_adjustment"]) for row in completed]
    adjustment_bands = Counter()
    for value in adjustments:
        adjustment_bands[
            "-5 to -3"
            if value <= -3
            else "-2.99 to -1"
            if value <= -1
            else "-0.99 to +0.99"
            if value < 1
            else "+1 to +2.99"
            if value < 3
            else "+3 to +5"
        ] += 1
    aspects = Counter()
    polarities = Counter()
    source_type_observations: Counter[str] = Counter()
    source_type_restaurants: dict[str, set[str]] = defaultdict(set)
    source_type_direct: Counter[str] = Counter()
    source_type_strong: Counter[str] = Counter()
    for row in completed:
        research = QualityResearchResult.model_validate(row["quality_research"])
        for observation in research.observations:
            if is_qualifying_quality_observation(observation):
                aspects[observation.aspect] += 1
                polarities[observation.polarity] += 1
                source_type_observations[observation.source_type] += 1
                source_type_restaurants[observation.source_type].add(row["place_id"])
                if observation.directness == "direct":
                    source_type_direct[observation.source_type] += 1
                if observation.strength in {"moderate", "strong"}:
                    source_type_strong[observation.source_type] += 1
    threshold_summary: dict[str, Any] = {}
    for threshold in (68, 70, 75):
        threshold_summary[str(threshold)] = {
            "v3_score_pass_and_non_score_eligible": sum(
                row["non_score_eligible"] and row["current_v3_score"] >= threshold
                for row in completed
            ),
            "v4_score_pass_and_non_score_eligible": sum(
                row["non_score_eligible"] and row["experimental_v4_score"] >= threshold
                for row in completed
            ),
            "upward_crossings": sum(
                row["non_score_eligible"]
                and row["current_v3_score"] < threshold <= row["experimental_v4_score"]
                for row in completed
            ),
            "downward_crossings": sum(
                row["non_score_eligible"]
                and row["current_v3_score"] >= threshold > row["experimental_v4_score"]
                for row in completed
            ),
        }
    ordered_digital = sorted(
        completed, key=lambda row: float(row["digital_footprint_score"]), reverse=True
    )
    low_quartile = ordered_digital[: max(1, len(ordered_digital) // 4)]
    by_digital: dict[str, Counter[str]] = defaultdict(Counter)
    for row in completed:
        label = "low_digital_footprint" if row["low_digital_footprint"] else "other"
        by_digital[label][row["quality_research"]["evidence_level"]] += 1
    summary = {
        "experiment": manifest["experiment"],
        "sample_size": manifest["sample_size"],
        "result_count": len(rows),
        "completed": len(completed),
        "failures": sum(row["status"] == "failed" for row in rows),
        "needs_retry": sum(row["status"] == "needs_retry" for row in rows),
        "responses_requests": len(rows),
        "web_search_actions": sum(
            int(row.get("usage", {}).get("web_search_action_count", 0)) for row in completed
        ),
        "token_usage": {
            key: sum(
                int(row.get("usage", {}).get("token_usage", {}).get(key, 0) or 0)
                for row in completed
            )
            for key in ("input_tokens", "output_tokens", "total_tokens")
        },
        "evidence_levels": dict(levels),
        "evidence_level_percentages": {
            key: round(value / len(completed) * 100, 1) for key, value in levels.items()
        },
        "evidence_levels_by_digital_footprint": {
            key: dict(value) for key, value in by_digital.items()
        },
        "adjustment_bands": dict(adjustment_bands),
        "adjustment_statistics": {
            "mean": round(statistics.mean(adjustments), 3) if adjustments else 0,
            "median": round(statistics.median(adjustments), 3) if adjustments else 0,
            "p90_absolute": round(_percentile([abs(value) for value in adjustments], 0.9), 3),
            "min": min(adjustments, default=0),
            "max": max(adjustments, default=0),
        },
        "adjustment_directions": {
            "negative": sum(value < 0 for value in adjustments),
            "zero": sum(value == 0 for value in adjustments),
            "positive": sum(value > 0 for value in adjustments),
        },
        "no_observation_rows_neutral": sum(
            not row["quality_research"]["observations"] and row["research_quality_adjustment"] == 0
            for row in completed
        ),
        "aspect_observation_counts": dict(aspects),
        "polarity_observation_counts": dict(polarities),
        "source_type_usefulness": {
            source_type: {
                "specific_quality_observations": count,
                "restaurants_with_observation": len(source_type_restaurants[source_type]),
                "direct_observations": source_type_direct[source_type],
                "moderate_or_strong_observations": source_type_strong[source_type],
            }
            for source_type, count in source_type_observations.most_common()
        },
        "threshold_counterfactual": threshold_summary,
        "lowest_digital_footprint_quartile": {
            "count": len(low_quartile),
            "mean_base_quality": round(
                statistics.mean(row["base_quality_prior"] for row in low_quartile), 2
            )
            if low_quartile
            else 0,
            "mean_adjustment": round(
                statistics.mean(row["research_quality_adjustment"] for row in low_quartile), 3
            )
            if low_quartile
            else 0,
            "mean_researched_quality": round(
                statistics.mean(row["researched_quality"] for row in low_quartile), 2
            )
            if low_quartile
            else 0,
            "mean_v4_movement": round(
                statistics.mean(row["v4_minus_v3"] for row in low_quartile), 3
            )
            if low_quartile
            else 0,
            "evidence_levels": dict(
                Counter(row["quality_research"]["evidence_level"] for row in low_quartile)
            ),
        },
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
            "| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |",
            "|---|---:|---:|---:|---:|---:|---|---|---|---|",
        ]
        for row in selected:
            observations = row["quality_research"]["observations"]
            reasons = (
                "; ".join(item["claim"] for item in observations[:2]).replace("|", "/")
                or "No new quality evidence"
            )
            sources = ", ".join(sorted({item["source_type"] for item in observations})) or "none"
            lines.append(
                f"| {row['name']} | {row['base_quality_prior']:.2f} | {row['research_quality_adjustment']:+.2f} | "
                f"{row['researched_quality']:.2f} | {row['current_v3_score']:.2f} | {row['experimental_v4_score']:.2f} | "
                f"{row['quality_research']['evidence_level']} | {reasons} | {sources} | {row['digital_footprint_type']} |"
            )
        return lines + [""]

    lines = [
        "# Fiyu Quality-only v4 paid sample",
        "",
        "This report is experimental and does not change production scoring or publication state.",
        "",
        "## Summary",
        "",
        "```json",
        json.dumps(summary, ensure_ascii=False, indent=2),
        "```",
        "",
    ]
    lines += table(
        "15 biggest Quality risers",
        sorted(completed, key=lambda row: row["research_quality_adjustment"], reverse=True)[:15],
    )
    lines += table(
        "15 biggest Quality fallers",
        sorted(completed, key=lambda row: row["research_quality_adjustment"])[:15],
    )
    sparse_neutral = [
        row
        for row in completed
        if row["quality_research"]["evidence_level"] in {"none", "sparse"}
        and abs(row["research_quality_adjustment"]) < 1
    ]
    lines += table("15 sparse-evidence neutral restaurants", sparse_neutral[:15])
    for title, low, high in (
        ("Experimental score 68–70", 68, 70),
        ("Experimental score 70–75", 70, 75),
        ("Experimental score 75–80", 75, 80),
    ):
        lines += table(
            title, [row for row in completed if low <= row["experimental_v4_score"] < high][:15]
        )
    high_rows = [row for row in completed if row["experimental_v4_score"] >= 80]
    lines += table("Experimental score 80+", high_rows if len(high_rows) <= 40 else high_rows[:40])
    lines += table("Lowest-digital-footprint manual inspection", low_quartile[:15])
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "run", "analyze"))
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--model")
    args = parser.parse_args()
    if args.command == "prepare":
        output = prepare_manifest(args.db, args.baseline, args.manifest)
        output = {
            "sample_size": output["sample_size"],
            "band_allocation": output["band_allocation"],
            "low_digital_footprint_count": output["low_digital_footprint_count"],
            "production_database_sha256": output["production_database_sha256"],
            "manifest": str(args.manifest),
        }
    elif args.command == "run":
        output = run_sample(args.manifest, args.results, limit=args.limit, model=args.model)
    else:
        output = analyze(args.manifest, args.results, args.summary, args.report)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
