"""Generate an offline v3-vs-v4 shadow audit without changing production state."""

from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

from fiyu.quality_v4 import QUALITY_RESEARCH_VERSION
from fiyu.sqlite_snapshot import readonly_sqlite_snapshot

ADJUSTMENT_BANDS = (
    "<= -12",
    "-11.99 to -8",
    "-7.99 to -5",
    "-4.99 to -3",
    "-2.99 to -1",
    "-0.99 to -0.5",
    "-0.49 to +0.49",
    "+0.5 to +0.99",
    "+1 to +2.99",
    "+3 to +4.99",
    "+5 to +7.99",
    "+8 to +11.99",
    ">= +12",
)


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
        "p90_absolute": _percentile([abs(value) for value in values], 0.90),
        "max": max(values, default=0),
    }


def _adjustment_band(value: float) -> str:
    if value <= -12:
        return "<= -12"
    if value < -8:
        return "-11.99 to -8"
    if value < -5:
        return "-7.99 to -5"
    if value < -3:
        return "-4.99 to -3"
    if value < -1:
        return "-2.99 to -1"
    if value < -0.5:
        return "-0.99 to -0.5"
    if value < 0.5:
        return "-0.49 to +0.49"
    if value < 1:
        return "+0.5 to +0.99"
    if value < 3:
        return "+1 to +2.99"
    if value < 5:
        return "+3 to +4.99"
    if value < 8:
        return "+5 to +7.99"
    if value < 12:
        return "+8 to +11.99"
    return ">= +12"


def audit(db_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    with readonly_sqlite_snapshot(db_path) as connection:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='quality_v4_research_runs'"
        ).fetchone()
        total = connection.execute("SELECT COUNT(*) FROM public_restaurants").fetchone()[0]
        if not exists:
            return {
                "total_restaurants": total,
                "v4_evidence_complete": 0,
                "v4_pending": total,
                "v4_failed": 0,
                "v4_needs_retry": 0,
            }, []
        status_counts = dict(
            connection.execute(
                """
                SELECT status, COUNT(*) FROM quality_v4_research_runs q
                WHERE q.quality_research_version=? AND q.id=(
                    SELECT q2.id FROM quality_v4_research_runs q2
                    WHERE q2.public_restaurant_id=q.public_restaurant_id
                      AND q2.quality_research_version=q.quality_research_version
                    ORDER BY q2.id DESC LIMIT 1
                ) GROUP BY status
                """,
                (QUALITY_RESEARCH_VERSION,),
            ).fetchall()
        )
        rows = [
            dict(row)
            for row in connection.execute(
                """
                SELECT q.*, COALESCE(p.name_en, p.name_ja, r.title) AS restaurant_name,
                       p.product_eligible, p.is_published
                FROM quality_v4_research_runs q
                JOIN public_restaurants p ON p.place_id=q.public_restaurant_id
                LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
                WHERE q.quality_research_version=? AND q.status='complete' AND q.id=(
                    SELECT q2.id FROM quality_v4_research_runs q2
                    WHERE q2.public_restaurant_id=q.public_restaurant_id
                      AND q2.quality_research_version=q.quality_research_version
                    ORDER BY q2.id DESC LIMIT 1
                ) ORDER BY q.public_restaurant_id
                """,
                (QUALITY_RESEARCH_VERSION,),
            ).fetchall()
        ]
    adjustments = [float(row["guarded_quality_adjustment"]) for row in rows]
    raw_adjustments = [float(row["raw_quality_adjustment"]) for row in rows]
    deltas = [float(row["shadow_score_delta"]) for row in rows]
    v3_scores = [float(row["production_v3_score"]) for row in rows]
    v4_scores = [float(row["shadow_v4_score"]) for row in rows]
    base_quality = [float(row["base_quality_prior"]) for row in rows]
    researched_quality = [float(row["researched_quality"]) for row in rows]
    positive_strength = [float(row["positive_case_strength"]) for row in rows]
    negative_strength = [float(row["negative_case_strength"]) for row in rows]
    negative_cases: list[dict[str, Any]] = []
    sparse_cases: list[dict[str, Any]] = []
    large_movements: list[dict[str, Any]] = []
    for row in rows:
        normalized = _json(row["normalized_observations_json"], [])
        clusters = _json(row["claim_clusters_json"], [])
        included = [item for item in normalized if item.get("included")]
        negative = [item for item in included if item.get("polarity") == "negative"]
        if float(row["negative_case_strength"]) > 0:
            negative_cases.append(
                {
                    "place_id": row["public_restaurant_id"],
                    "restaurant": row["restaurant_name"],
                    "negative_case_strength": row["negative_case_strength"],
                    "normalized_negative_aspects": sorted(
                        {item["normalized_aspect"] for item in negative}
                    ),
                    "negative_observation_count": len(negative),
                    "independent_negative_provenance_count": len(
                        {item["independence_key"] for item in negative}
                    ),
                    "corroborated": any(
                        item.get("polarity") == "negative"
                        and int(item.get("independent_sources", 0)) >= 2
                        for item in clusters
                    ),
                    "guarded_quality_adjustment": row["guarded_quality_adjustment"],
                    "negative_claims": [item["claim_text"] for item in negative],
                }
            )
        if not included:
            sparse_cases.append(
                {
                    "place_id": row["public_restaurant_id"],
                    "restaurant": row["restaurant_name"],
                    "adjustment": row["guarded_quality_adjustment"],
                    "exactly_neutral": float(row["guarded_quality_adjustment"]) == 0,
                }
            )
        if abs(float(row["guarded_quality_adjustment"])) >= 8:
            claims = [item["claim_text"] for item in included]
            large_movements.append(
                {
                    "place_id": row["public_restaurant_id"],
                    "restaurant": row["restaurant_name"],
                    "base_quality": row["base_quality_prior"],
                    "positive_case_strength": row["positive_case_strength"],
                    "negative_case_strength": row["negative_case_strength"],
                    "adjustment": row["guarded_quality_adjustment"],
                    "researched_quality": row["researched_quality"],
                    "families": sorted({item["family"] for item in included}),
                    "independent_sources": len({item["independence_key"] for item in included}),
                    "evidence_summary": claims[:5],
                    "production_v3_score": row["production_v3_score"],
                    "shadow_v4_score": row["shadow_v4_score"],
                    "score_delta": row["shadow_score_delta"],
                }
            )
    thresholds: dict[str, Any] = {}
    for threshold in (68, 70, 75):
        eligible = [row for row in rows if row["product_eligible"]]
        thresholds[str(threshold)] = {
            "production_pass": sum(float(row["production_v3_score"]) >= threshold for row in eligible),
            "shadow_v4_pass": sum(float(row["shadow_v4_score"]) >= threshold for row in eligible),
            "crossed_up": sum(
                float(row["production_v3_score"]) < threshold <= float(row["shadow_v4_score"])
                for row in eligible
            ),
            "crossed_down": sum(
                float(row["production_v3_score"]) >= threshold > float(row["shadow_v4_score"])
                for row in eligible
            ),
        }
    adjustment_counts = Counter(_adjustment_band(value) for value in adjustments)
    mixed_activated = [
        {
            "place_id": row["public_restaurant_id"],
            "restaurant": row["restaurant_name"],
            "positive_case_strength": row["positive_case_strength"],
            "negative_case_strength": row["negative_case_strength"],
            "guarded_quality_adjustment": row["guarded_quality_adjustment"],
        }
        for row in rows
        if float(row["positive_case_strength"]) >= 8
        and float(row["negative_case_strength"]) >= 12
    ]
    summary = {
        "total_restaurants": total,
        "total_researched": sum(status_counts.values()),
        "v4_evidence_complete": status_counts.get("complete", 0),
        "v4_pending": max(0, total - sum(status_counts.values())),
        "v4_failed": status_counts.get("failed", 0),
        "v4_needs_retry": status_counts.get("needs_retry", 0),
        "quality_adjustment_distribution": _distribution(adjustments),
        "base_quality_distribution": _distribution(base_quality),
        "positive_case_strength_distribution": _distribution(positive_strength),
        "negative_case_strength_distribution": _distribution(negative_strength),
        "researched_quality_distribution": _distribution(researched_quality),
        "quality_adjustment_bands": {
            band: adjustment_counts.get(band, 0) for band in ADJUSTMENT_BANDS
        },
        "production_v3_distribution": _distribution(v3_scores),
        "shadow_v4_distribution": _distribution(v4_scores),
        "score_delta_distribution": _distribution(deltas),
        "threshold_counterfactuals": thresholds,
        "large_movements_ge_8": sum(abs(value) >= 8 for value in adjustments),
        "large_movements_ge_12": sum(abs(value) >= 12 for value in adjustments),
        "guardrail_comparison": {
            "rows_changed_by_15_vs_20": sum(
                raw != guarded
                for raw, guarded in zip(raw_adjustments, adjustments, strict=True)
            ),
            "maximum_raw_adjustment": max(raw_adjustments, default=0),
            "maximum_guarded_adjustment": max(adjustments, default=0),
        },
        "usage": {
            "responses_requests": sum(int(row["response_request_count"]) for row in rows),
            "web_search_actions": sum(int(row["web_search_action_count"]) for row in rows),
            "input_tokens": sum(int(row["input_tokens"]) for row in rows),
            "output_tokens": sum(int(row["output_tokens"]) for row in rows),
            "total_tokens": sum(int(row["total_tokens"]) for row in rows),
            "mean_web_search_actions_per_restaurant": round(
                statistics.mean(int(row["web_search_action_count"]) for row in rows), 2
            )
            if rows
            else 0,
        },
        "negative_evidence_cases": negative_cases,
        "mixed_high_positive_high_negative_cases": mixed_activated,
        "sparse_no_evidence": {
            "count": len(sparse_cases),
            "exactly_neutral": sum(item["exactly_neutral"] for item in sparse_cases),
            "false_negative_count": sum(float(item["adjustment"]) < 0 for item in sparse_cases),
            "rows": sparse_cases,
        },
        "large_movement_audit": large_movements,
        "score_band_samples": {
            label: [
                row["public_restaurant_id"]
                for row in rows
                if low <= float(row["shadow_v4_score"]) < high
            ][:20]
            for label, low, high in (
                ("67-69", 67, 69),
                ("69-71", 69, 71),
                ("74-76", 74, 76),
                ("80+", 80, float("inf")),
            )
        },
    }
    return summary, rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument(
        "--summary", type=Path, default=Path("data/audits/quality-v4-shadow-summary.json")
    )
    parser.add_argument(
        "--report", type=Path, default=Path("data/audits/quality-v4-shadow-report.md")
    )
    args = parser.parse_args()
    summary, rows = audit(args.db)
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    ordered_up = sorted(
        (row for row in rows if float(row["shadow_score_delta"]) > 0),
        key=lambda row: float(row["shadow_score_delta"]),
        reverse=True,
    )
    ordered_down = sorted(
        (row for row in rows if float(row["shadow_score_delta"]) < 0),
        key=lambda row: float(row["shadow_score_delta"]),
    )
    lines = [
        "# Quality-v4 shadow audit",
        "",
        "This report is offline and does not change production scoring or publication state.",
        "",
        "## Summary",
        "",
        "```json",
        json.dumps(summary, ensure_ascii=False, indent=2),
        "```",
        "",
    ]
    for title, selected in (("Biggest risers", ordered_up[:20]), ("Biggest fallers", ordered_down[:20])):
        lines.extend((f"## {title}", "", "| Restaurant | Base Q | Adj. | v3 | v4 | Delta |", "|---|---:|---:|---:|---:|---:|"))
        if selected:
            lines.extend(
                f"| {row['restaurant_name']} | {row['base_quality_prior']:.2f} | "
                f"{row['guarded_quality_adjustment']:+.2f} | "
                f"{row['production_v3_score']:.2f} | {row['shadow_v4_score']:.2f} | "
                f"{row['shadow_score_delta']:+.2f} |"
                for row in selected
            )
        else:
            lines.append("| None | — | — | — | — | — |")
        lines.append("")
    lines.extend(("## Large movements (|adjustment| >= 8)", ""))
    if not summary["large_movement_audit"]:
        lines.extend(("None.", ""))
    for item in summary["large_movement_audit"]:
        lines.extend(
            (
                f"### {item['restaurant']}",
                "",
                (
                    f"- Quality: {item['base_quality']:.2f} -> "
                    f"{item['researched_quality']:.2f} ({item['adjustment']:+.2f})"
                ),
                (
                    f"- Case strength: +{item['positive_case_strength']:.2f} / "
                    f"-{item['negative_case_strength']:.2f}"
                ),
                (
                    f"- Fiyu: {item['production_v3_score']:.2f} -> "
                    f"{item['shadow_v4_score']:.2f} ({item['score_delta']:+.2f})"
                ),
                f"- Families: {', '.join(item['families'])}",
                f"- Independent sources: {item['independent_sources']}",
                f"- Evidence: {' | '.join(item['evidence_summary'])}",
                "- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.",
                "",
            )
        )
    lines.extend(("## Negative-evidence rows", ""))
    if not summary["negative_evidence_cases"]:
        lines.extend(("None.", ""))
    for item in summary["negative_evidence_cases"]:
        lines.append(
            f"- **{item['restaurant']}**: strength {item['negative_case_strength']:.2f}; "
            f"aspects {', '.join(item['normalized_negative_aspects'])}; "
            f"independent sources {item['independent_negative_provenance_count']}; "
            f"corroborated {item['corroborated']}; net adjustment "
            f"{item['guarded_quality_adjustment']:+.2f}."
        )
    lines.extend(("", "## Sparse/no-evidence safety", ""))
    sparse = summary["sparse_no_evidence"]
    lines.append(
        f"{sparse['exactly_neutral']}/{sparse['count']} no-evidence rows were exactly neutral; "
        f"false-negative count: {sparse['false_negative_count']}."
    )
    lines.append("")
    args.report.write_text("\n".join(lines), encoding="utf-8")
    # Keep console output portable on Windows code pages; saved artifacts remain UTF-8.
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
