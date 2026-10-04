from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

from fiyu.card_enrichment import scoring_research_view
from fiyu.catalog_pipeline import _effective_structured_research
from fiyu.experimental_score_v4 import (
    assess_researched_quality,
    calculate_neutral_components,
    experimental_score,
    source_family,
)
from fiyu.public_score import (
    FiyuEvidence,
    InternalSignals,
    assess_chain_classification,
    assess_critical_publication_contradiction,
    evaluate_fiyu_candidate,
)
from fiyu.utils import normalize_name

VARIANTS = ("v4_a_cap5", "v4_a_cap8", "v4_a_cap10", "v4_b_cap8")
FLOORS = (68, 69, 70, 72, 75)


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Offline Fiyu public-score v4 experiment")
    parser.add_argument("--db", default="data/fiyu.db")
    parser.add_argument(
        "--csv-out", default="data/audits/fiyu-score-v4-comparison.csv"
    )
    parser.add_argument(
        "--summary-out", default="data/audits/fiyu-score-v4-summary.json"
    )
    parser.add_argument(
        "--samples-out",
        default="data/audits/fiyu-score-v4-diagnostic-samples.md",
    )
    return parser.parse_args()


def _json(value: object, fallback: object) -> Any:
    try:
        parsed = json.loads(str(value or ""))
    except (json.JSONDecodeError, TypeError):
        return fallback
    return parsed


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] * (1.0 - fraction) + ordered[upper] * fraction


def _distribution(values: list[float]) -> dict[str, float]:
    return {
        "min": round(min(values), 2),
        "p10": round(_percentile(values, 0.10), 2),
        "p25": round(_percentile(values, 0.25), 2),
        "median": round(statistics.median(values), 2),
        "mean": round(statistics.mean(values), 2),
        "p75": round(_percentile(values, 0.75), 2),
        "p90": round(_percentile(values, 0.90), 2),
        "max": round(max(values), 2),
    }


def _score_bucket(score: float) -> str:
    if score < 60:
        return "<60"
    if score < 65:
        return "60–64.99"
    if score < 68:
        return "65–67.99"
    if score < 70:
        return "68–69.99"
    if score < 72.5:
        return "70–72.49"
    if score < 75:
        return "72.5–74.99"
    if score < 80:
        return "75–79.99"
    if score < 85:
        return "80–84.99"
    return "85+"


def _movement_bucket(value: float) -> str:
    if value <= -8:
        return "<= -8"
    if value < -5:
        return "-7.99 to -5"
    if value < -2:
        return "-4.99 to -2"
    if value < 2:
        return "-1.99 to +1.99"
    if value < 5:
        return "+2 to +4.99"
    if value < 8:
        return "+5 to +7.99"
    return ">= +8"


def _source_type(url: str) -> str:
    family = source_family(url)
    if family in {
        "tabelog.com",
        "retty.me",
        "hotpepper.jp",
        "hitosara.com",
        "gnavi.co.jp",
        "r.gnavi.co.jp",
        "ikyu.com",
        "tripadvisor.com",
        "tripadvisor.jp",
        "restaurantguru.com",
        "lavietaste.com",
        "ekiten.jp",
    }:
        return "review_or_reservation_platform"
    if family in {"ameblo.jp", "livedoor.jp", "note.com", "doorblog.jp"}:
        return "blog_platform"
    if any(token in family for token in ("city.", "metro.tokyo", "tokyo.jp")):
        return "government_or_local_official"
    if family in {
        "san-tatsu.jp",
        "enjoytokyo.jp",
        "goguynet.jp",
        "timeout.com",
        "friday.news",
        "guide.michelin.com",
    }:
        return "editorial_or_guide"
    if family in {"instagram.com", "facebook.com", "x.com"}:
        return "social"
    return "other_or_restaurant_controlled"


def _row_query() -> str:
    return """
        SELECT p.*, r.title AS candidate_title, r.category AS candidate_category,
               r.broad_category AS candidate_broad_category,
               r.search_area, r.internal_fiyu_score, r.quality_score,
               r.underexposure_score, r.digital_footprint_score,
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


def _apply_existing_score_caps(
    score: float,
    *,
    chain_excluded: bool,
    product_eligible: bool,
    product_classification: str,
) -> float:
    if chain_excluded:
        score = min(score, 54.99)
    if not product_eligible and product_classification != "ineligible_restricted_access":
        score = min(score, 49.99)
    return round(score, 2)


def _published_name_index(
    connection: sqlite3.Connection,
) -> dict[str, list[dict[str, object]]]:
    index: dict[str, list[dict[str, object]]] = {}
    published = connection.execute(
        """
        SELECT p.*, r.title AS candidate_title
        FROM public_restaurants p
        LEFT JOIN restaurants r ON r.place_id=p.place_id
        WHERE p.is_published=1
        """
    ).fetchall()
    for sqlite_row in published:
        row = dict(sqlite_row)
        for value in (row.get("name_ja"), row.get("name_en"), row.get("candidate_title")):
            normalized = normalize_name(str(value or ""))
            if normalized:
                index.setdefault(normalized, []).append(row)
    return index


def _strong_duplicates(
    row: dict[str, object], name_index: dict[str, list[dict[str, object]]]
) -> tuple[str, ...]:
    candidates: dict[str, dict[str, object]] = {}
    for value in (row.get("name_ja"), row.get("name_en"), row.get("candidate_title")):
        normalized = normalize_name(str(value or ""))
        for candidate in name_index.get(normalized, []):
            if candidate["place_id"] != row["place_id"]:
                candidates[str(candidate["place_id"])] = candidate
    duplicates: list[str] = []
    for candidate in candidates.values():
        same_osm = bool(
            row.get("map_display_eligible")
            and candidate.get("map_display_eligible")
            and not row.get("map_location_approximate")
            and not candidate.get("map_location_approximate")
            and row.get("location_osm_type")
            and row.get("location_osm_type") == candidate.get("location_osm_type")
            and row.get("location_osm_id") is not None
            and row.get("location_osm_id") == candidate.get("location_osm_id")
        )
        current_address = normalize_name(str(row.get("verified_core_address") or ""))
        candidate_address = normalize_name(
            str(candidate.get("verified_core_address") or "")
        )
        same_address = bool(
            row.get("core_address_verified")
            and candidate.get("core_address_verified")
            and current_address
            and current_address == candidate_address
        )
        same_coordinates = bool(
            row.get("map_display_eligible")
            and candidate.get("map_display_eligible")
            and not row.get("map_location_approximate")
            and not candidate.get("map_location_approximate")
            and row.get("location_precision") == "exact"
            and candidate.get("location_precision") == "exact"
            and row.get("latitude") is not None
            and row.get("longitude") is not None
            and row.get("latitude") == candidate.get("latitude")
            and row.get("longitude") == candidate.get("longitude")
        )
        if same_osm or same_address or same_coordinates:
            duplicates.append(str(candidate["place_id"]))
    return tuple(sorted(duplicates))


def _analyze(connection: sqlite3.Connection) -> list[dict[str, object]]:
    analyzed: list[dict[str, object]] = []
    name_index = _published_name_index(connection)
    for sqlite_row in connection.execute(_row_query()).fetchall():
        row = dict(sqlite_row)
        place_id = str(row["place_id"])
        evidence_payload = _json(row.get("evidence_json"), {})
        if not isinstance(evidence_payload, dict):
            continue
        evidence = FiyuEvidence(**evidence_payload)
        structured = _json(row.get("structured_research_json"), {})
        if not isinstance(structured, dict):
            structured = {}
        effective = scoring_research_view(
            _effective_structured_research(connection, place_id, structured)
        )
        chain = assess_chain_classification(evidence, effective)
        critical = assess_critical_publication_contradiction(evidence, effective)
        duplicates = _strong_duplicates(row, name_index)
        internal = InternalSignals(
            quality_score=float(row.get("quality_score") or 0),
            underexposure_score=float(row.get("underexposure_score") or 0),
            digital_footprint_score=float(row.get("digital_footprint_score") or 0),
        )
        current = evaluate_fiyu_candidate(
            evidence,
            internal,
            effective,
            primary_category=str(
                row.get("primary_category")
                or row.get("candidate_category")
                or row.get("candidate_broad_category")
                or ""
            ),
        )
        themes = _json(row.get("review_themes_json"), [])
        if not isinstance(themes, list):
            themes = []
        quality_evidence = assess_researched_quality(
            [theme for theme in themes if isinstance(theme, dict)]
        )
        neutral = calculate_neutral_components(
            evidence=evidence_payload,
            underexposure_score=internal.underexposure_score,
            digital_footprint_score=internal.digital_footprint_score,
            chain_classification=chain.classification,
        )
        base_quality = internal.quality_score
        q5 = max(0.0, min(100.0, base_quality + quality_evidence.capped_adjustment(5)))
        q8 = max(0.0, min(100.0, base_quality + quality_evidence.capped_adjustment(8)))
        q10 = max(0.0, min(100.0, base_quality + quality_evidence.capped_adjustment(10)))
        score_context = {
            "chain_excluded": chain.excluded,
            "product_eligible": current.product_eligible,
            "product_classification": current.product_eligibility_classification,
        }
        neutral_only = _apply_existing_score_caps(
            experimental_score(
                quality=base_quality,
                hiddenness=neutral.hiddenness,
                independence=neutral.independence,
                local_discovery=neutral.local_discovery,
            ),
            **score_context,
        )
        uncapped_scores = {
            "v4_a_cap5": experimental_score(
                quality=q5,
                hiddenness=neutral.hiddenness,
                independence=neutral.independence,
                local_discovery=neutral.local_discovery,
            ),
            "v4_a_cap8": experimental_score(
                quality=q8,
                hiddenness=neutral.hiddenness,
                independence=neutral.independence,
                local_discovery=neutral.local_discovery,
            ),
            "v4_a_cap10": experimental_score(
                quality=q10,
                hiddenness=neutral.hiddenness,
                independence=neutral.independence,
                local_discovery=neutral.local_discovery,
            ),
            "v4_b_cap8": experimental_score(
                quality=q8,
                hiddenness=neutral.hiddenness,
                independence=neutral.independence,
                local_discovery=neutral.local_discovery,
                quality_weight=0.40,
                local_discovery_weight=0.30,
            ),
        }
        scores = {
            variant: _apply_existing_score_caps(score, **score_context)
            for variant, score in uncapped_scores.items()
        }
        quality_urls = sorted(
            {
                str(url)
                for theme in themes
                if isinstance(theme, dict)
                for url in theme.get("source_urls", [])
            }
        )
        non_score_blocks = []
        if not current.product_eligible:
            non_score_blocks.append("product_ineligible")
        if chain.excluded:
            non_score_blocks.append("chain_excluded")
        non_score_blocks.extend(
            f"critical:{reason}" for reason in critical.reasons
        )
        non_score_blocks.extend(f"duplicate:{duplicate}" for duplicate in duplicates)
        name = str(
            row.get("name_en") or row.get("name_ja") or row.get("candidate_title") or place_id
        )
        output: dict[str, object] = {
            "place_id": place_id,
            "name": name,
            "category": str(
                row.get("primary_category")
                or row.get("candidate_category")
                or row.get("candidate_broad_category")
                or "unknown"
            ),
            "area": str(row.get("discovery_area") or row.get("search_area") or "unknown"),
            "internal_candidate_score": float(row.get("internal_fiyu_score") or 0),
            "v3_stored_score": float(row.get("fiyu_score") or 0),
            "v3_current_recomputed_score": current.fiyu_score,
            "v3_current_delta_vs_stored": round(
                current.fiyu_score - float(row.get("fiyu_score") or 0), 2
            ),
            "v3_score_version": str(row.get("score_version") or ""),
            "base_quality_prior": round(base_quality, 2),
            "raw_research_quality_adjustment": quality_evidence.raw_adjustment,
            "quality_adjustment_cap5": quality_evidence.capped_adjustment(5),
            "quality_adjustment_cap8": quality_evidence.capped_adjustment(8),
            "quality_adjustment_cap10": quality_evidence.capped_adjustment(10),
            "researched_quality_cap5": round(q5, 2),
            "researched_quality_cap8": round(q8, 2),
            "researched_quality_cap10": round(q10, 2),
            "current_hiddenness": float(row.get("hiddenness_signal") or 0),
            "current_independence": float(row.get("independence_signal") or 0),
            "current_local_discovery": float(row.get("local_discovery_score") or 0),
            "neutral_hiddenness": neutral.hiddenness,
            "neutral_independence": neutral.independence,
            "neutral_local_discovery": neutral.local_discovery,
            "neutral_unknown_score": neutral_only,
            "neutral_unknown_delta_vs_v3": round(
                neutral_only - current.fiyu_score, 2
            ),
            **scores,
            **{
                f"{variant}_delta_vs_v3": round(
                    float(score) - current.fiyu_score, 2
                )
                for variant, score in scores.items()
            },
            "is_published": bool(row.get("is_published")),
            "product_eligible": current.product_eligible,
            "map_display_eligible": bool(row.get("map_display_eligible")),
            "chain_classification": chain.classification,
            "chain_excluded": chain.excluded,
            "critical_publication_contradiction": critical.contradicted,
            "critical_reasons": " | ".join(critical.reasons),
            "duplicate_place_ids": " | ".join(duplicates),
            "non_score_eligible": not non_score_blocks,
            "non_score_blocks": " | ".join(non_score_blocks),
            "fiyu_confidence": float(row.get("fiyu_confidence") or 0),
            "positive_quality_evidence": " | ".join(
                quality_evidence.positive_evidence
            ),
            "negative_quality_evidence": " | ".join(
                quality_evidence.negative_evidence
            ),
            "quality_source_families": " | ".join(
                quality_evidence.independent_source_families
            ),
            "quality_source_types": " | ".join(
                sorted({_source_type(url) for url in quality_urls})
            ),
            "qualifying_quality_theme_count": quality_evidence.qualifying_theme_count,
            "review_theme_count": len(themes),
            "unknown_fields": " | ".join(
                (*quality_evidence.unknown_fields, *neutral.unknown_fields)
            ),
        }
        analyzed.append(output)
    return analyzed


def _sample(rows: list[dict[str, object]], predicate) -> list[dict[str, object]]:
    matches = [row for row in rows if predicate(row)]
    matches.sort(key=lambda row: (float(row["v4_a_cap8"]), str(row["place_id"])))
    if len(matches) <= 15:
        selected = matches
    else:
        selected = [
            matches[round(index * (len(matches) - 1) / 14)] for index in range(15)
        ]
    return [
        {
            key: row[key]
            for key in (
                "place_id",
                "name",
                "category",
                "area",
                "internal_candidate_score",
                "v3_stored_score",
                "v3_current_recomputed_score",
                "v4_a_cap8",
                "base_quality_prior",
                "quality_adjustment_cap8",
                "researched_quality_cap8",
                "neutral_hiddenness",
                "neutral_independence",
                "neutral_local_discovery",
                "positive_quality_evidence",
                "negative_quality_evidence",
                "quality_source_types",
                "non_score_blocks",
                "unknown_fields",
            )
        }
        for row in selected
    ]


def _summary(rows: list[dict[str, object]]) -> dict[str, object]:
    scores = {
        "v3_current_recomputed": [
            float(row["v3_current_recomputed_score"]) for row in rows
        ],
        "v3_stored": [float(row["v3_stored_score"]) for row in rows],
        **{
            variant: [float(row[variant]) for row in rows] for variant in VARIANTS
        },
    }
    current_production = sum(bool(row["is_published"]) for row in rows)
    counterfactuals: dict[str, object] = {}
    for variant in VARIANTS:
        counterfactuals[variant] = {}
        for floor in FLOORS:
            score_passers = [row for row in rows if float(row[variant]) >= floor]
            eligible = [row for row in score_passers if row["non_score_eligible"]]
            block_counts = Counter(
                block.split(":", 1)[0]
                for row in score_passers
                for block in str(row["non_score_blocks"]).split(" | ")
                if block
            )
            counterfactuals[variant][str(floor)] = {
                "eligible": len(eligible),
                "additional_vs_current_published": len(eligible) - current_production,
                "percent_of_researched": round(len(eligible) / len(rows) * 100, 2),
                "eligible_score_bands": dict(
                    Counter(_score_bucket(float(row[variant])) for row in eligible)
                ),
                "blocked_despite_score": len(score_passers) - len(eligible),
                "block_reasons": dict(block_counts),
            }

    cap8_adjustments = [float(row["quality_adjustment_cap8"]) for row in rows]
    cap8_deltas = [float(row["v4_a_cap8_delta_vs_v3"]) for row in rows]
    source_types = Counter(
        source_type
        for row in rows
        for source_type in str(row["quality_source_types"]).split(" | ")
        if source_type
    )
    unknown_fields = Counter(
        field.split(":", 1)[0]
        for row in rows
        for field in str(row["unknown_fields"]).split(" | ")
        if field
    )
    positive = [row for row in rows if float(row["quality_adjustment_cap8"]) >= 2]
    negative = [row for row in rows if float(row["quality_adjustment_cap8"]) <= -2]
    barely = [row for row in rows if abs(float(row["quality_adjustment_cap8"])) < 2]
    samples = {
        "A_v3_below68_v4_at_least68": _sample(
            rows,
            lambda row: float(row["v3_current_recomputed_score"]) < 68
            <= float(row["v4_a_cap8"]),
        ),
        "B_v3_below70_v4_at_least70": _sample(
            rows,
            lambda row: float(row["v3_current_recomputed_score"]) < 70
            <= float(row["v4_a_cap8"]),
        ),
        "C_v3_below75_v4_at_least75": _sample(
            rows,
            lambda row: float(row["v3_current_recomputed_score"]) < 75
            <= float(row["v4_a_cap8"]),
        ),
        "D_v3_at_least75_v4_below75": _sample(
            rows,
            lambda row: float(row["v3_current_recomputed_score"]) >= 75
            > float(row["v4_a_cap8"]),
        ),
        "E_v4_68_to69_99": _sample(
            rows, lambda row: 68 <= float(row["v4_a_cap8"]) < 70
        ),
        "F_v4_70_to72_99": _sample(
            rows, lambda row: 70 <= float(row["v4_a_cap8"]) < 73
        ),
        "G_v4_75_to79_99": _sample(
            rows, lambda row: 75 <= float(row["v4_a_cap8"]) < 80
        ),
        "H_v4_80_plus": _sample(
            rows, lambda row: float(row["v4_a_cap8"]) >= 80
        ),
    }
    crossings = {
        str(floor): {
            "up": sum(
                float(row["v3_current_recomputed_score"])
                < floor
                <= float(row["v4_a_cap8"])
                for row in rows
            ),
            "down": sum(
                float(row["v3_current_recomputed_score"])
                >= floor
                > float(row["v4_a_cap8"])
                for row in rows
            ),
        }
        for floor in (68, 70, 75, 80)
    }
    return {
        "researched_restaurants": len(rows),
        "current_published_in_researched_set": current_production,
        "score_distributions": {
            name: {
                "statistics": _distribution(values),
                "buckets": dict(Counter(_score_bucket(value) for value in values)),
            }
            for name, values in scores.items()
        },
        "quality_adjustment_caps": {
            str(cap): {
                "nonzero": sum(
                    float(row[f"quality_adjustment_cap{cap}"]) != 0 for row in rows
                ),
                "mean": round(
                    statistics.mean(
                        float(row[f"quality_adjustment_cap{cap}"]) for row in rows
                    ),
                    3,
                ),
                "at_positive_cap": sum(
                    float(row[f"quality_adjustment_cap{cap}"]) == cap for row in rows
                ),
                "at_negative_cap": sum(
                    float(row[f"quality_adjustment_cap{cap}"]) == -cap for row in rows
                ),
            }
            for cap in (5, 8, 10)
        },
        "neutral_unknown_semantics": {
            "statistics": _distribution(
                [float(row["neutral_unknown_delta_vs_v3"]) for row in rows]
            ),
            "movement_buckets": dict(
                Counter(
                    _movement_bucket(float(row["neutral_unknown_delta_vs_v3"]))
                    for row in rows
                )
            ),
        },
        "movement": {
            "quality_adjustment_cap8": dict(
                Counter(_movement_bucket(value) for value in cap8_adjustments)
            ),
            "final_v4_a_cap8_delta": dict(
                Counter(_movement_bucket(value) for value in cap8_deltas)
            ),
            "meaningfully_positive_quality": len(positive),
            "meaningfully_negative_quality": len(negative),
            "quality_barely_moves": len(barely),
            "positive_top_categories": Counter(
                str(row["category"]) for row in positive
            ).most_common(15),
            "positive_top_areas": Counter(str(row["area"]) for row in positive).most_common(
                15
            ),
        },
        "quality_evidence_coverage": {
            "restaurants_with_review_themes": sum(
                int(row["review_theme_count"]) > 0 for row in rows
            ),
            "restaurants_with_qualifying_quality_themes": sum(
                int(row["qualifying_quality_theme_count"]) > 0 for row in rows
            ),
            "restaurants_with_scored_quality_adjustment": sum(
                float(row["raw_research_quality_adjustment"]) != 0 for row in rows
            ),
            "source_type_presence": dict(source_types),
            "unknown_field_counts": dict(unknown_fields),
        },
        "non_score_blocks": dict(
            Counter(
                block.split(":", 1)[0]
                for row in rows
                for block in str(row["non_score_blocks"]).split(" | ")
                if block
            )
        ),
        "counterfactuals": counterfactuals,
        "threshold_crossings_v4_a_cap8": crossings,
        "diagnostic_samples": samples,
    }


def _markdown_cell(value: object) -> str:
    return " ".join(str("" if value is None else value).split()).replace("|", "•")


def _write_samples(path: Path, samples: dict[str, list[dict[str, object]]]) -> None:
    lines = [
        "# Fiyu Score v4 diagnostic samples",
        "",
        (
            "Generated from stored evidence only. V4 is V4-A with the ±8 experimental "
            "cap; current v3 is recomputed offline with today's deterministic v3 code. "
            "H/I/LD are the experimental null-renormalized component values."
        ),
        "",
    ]
    columns = (
        ("name", "Restaurant"),
        ("internal_candidate_score", "Internal"),
        ("v3_current_recomputed_score", "Current v3"),
        ("v4_a_cap8", "V4"),
        ("base_quality_prior", "Base Q"),
        ("quality_adjustment_cap8", "Q adj"),
        ("researched_quality_cap8", "Final Q"),
        ("neutral_hiddenness", "H"),
        ("neutral_independence", "I"),
        ("neutral_local_discovery", "LD"),
        ("positive_quality_evidence", "Why Quality moved"),
        ("quality_source_types", "Stored source types"),
        ("non_score_blocks", "Non-score blocks"),
        ("unknown_fields", "Unknown"),
    )
    for title, rows in samples.items():
        lines.extend((f"## {title}", ""))
        if not rows:
            lines.extend(("No matching restaurants.", ""))
            continue
        lines.append("| " + " | ".join(label for _, label in columns) + " |")
        lines.append("| " + " | ".join("---" for _ in columns) + " |")
        lines.extend(
            "| "
            + " | ".join(_markdown_cell(row.get(key)) for key, _ in columns)
            + " |"
            for row in rows
        )
        lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = _arguments()
    db_path = Path(args.db).resolve()
    before_hash = _hash(db_path)
    connection = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = _analyze(connection)
    finally:
        connection.close()
    after_hash = _hash(db_path)
    if before_hash != after_hash:
        raise RuntimeError("database hash changed during read-only experiment")

    csv_path = Path(args.csv_out)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    summary = _summary(rows)
    summary["database_sha256_before"] = before_hash
    summary["database_sha256_after"] = after_hash
    summary["database_unchanged"] = before_hash == after_hash
    summary_path = Path(args.summary_out)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    samples_path = Path(args.samples_out)
    _write_samples(samples_path, summary["diagnostic_samples"])
    print(
        json.dumps(
            {
                "rows": len(rows),
                "csv": str(csv_path),
                "summary": str(summary_path),
                "samples": str(samples_path),
                "database_sha256": before_hash,
                "database_unchanged": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
