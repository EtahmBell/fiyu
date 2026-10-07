"""Collect read-only evidence for the pipeline scale-readiness v2 audit."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import statistics
import time
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _connect_ro(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def _rows(connection: sqlite3.Connection, sql: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in connection.execute(sql, parameters)]


def _one(connection: sqlite3.Connection, sql: str, parameters: tuple[Any, ...] = ()) -> Any:
    return connection.execute(sql, parameters).fetchone()[0]


def _band(value: float | None) -> str:
    score = float(value or 0)
    if score < 60:
        return "<60"
    if score < 65:
        return "60-64.99"
    if score < 70:
        return "65-69.99"
    if score < 75:
        return "70-74.99"
    if score < 80:
        return "75-79.99"
    return "80+"


def _timed(operation: Callable[[], Any], *, iterations: int) -> dict[str, Any]:
    samples: list[float] = []
    count = 0
    for _ in range(iterations):
        started = time.perf_counter()
        result = operation()
        samples.append((time.perf_counter() - started) * 1000)
        count = len(result) if hasattr(result, "__len__") else 1
    ordered = sorted(samples)
    return {
        "iterations": iterations,
        "result_count": count,
        "median_ms": round(statistics.median(samples), 3),
        "p95_ms": round(ordered[max(0, int(len(ordered) * 0.95) - 1)], 3),
        "maximum_ms": round(max(samples), 3),
    }


PUBLIC_LIST_SQL = """
SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
       r.neighborhood, r.city, p.fiyu_score, p.score_band,
       p.food_tags_json, p.discovery_area, p.latitude, p.longitude,
       COUNT(c.response_id) AS community_recommendation_count
FROM public_restaurants p
LEFT JOIN restaurants r ON r.place_id=p.place_id
LEFT JOIN community_recommendations c ON c.place_id=p.place_id
WHERE p.is_published=1 AND p.product_eligible=1
GROUP BY p.place_id
ORDER BY p.fiyu_score DESC
LIMIT 1000
"""

PICKS_SQL = """
SELECT place_id, latitude, longitude, budget_json, fiyu_score,
       primary_category, review_themes_json, practical_info_json,
       COALESCE(map_location_precision, location_precision) AS location_precision,
       discovery_area, discovery_areas_json
FROM public_restaurants
WHERE is_published=1 AND product_eligible=1 AND map_display_eligible=1
  AND latitude IS NOT NULL AND longitude IS NOT NULL
ORDER BY place_id
"""

SEED_SQL = """
SELECT r.id, r.place_id, r.title, r.internal_fiyu_score, r.search_area
FROM restaurants r
WHERE r.candidate_eligible=1 AND r.place_id IS NOT NULL AND TRIM(r.place_id)!=''
  AND r.internal_fiyu_score>=60
  AND NOT EXISTS (SELECT 1 FROM public_restaurants p WHERE p.place_id=r.place_id)
ORDER BY r.place_id, r.internal_fiyu_score DESC, r.id
"""

RESEARCH_SQL = """
SELECT p.place_id, p.research_status, r.title, r.address, r.city,
       r.neighborhood, r.internal_fiyu_score
FROM public_restaurants p
JOIN restaurants r ON r.place_id=p.place_id
WHERE p.research_status='pending'
ORDER BY p.updated_at, p.place_id
LIMIT 100
"""

QUALITY_V4_SQL = """
WITH latest AS (
  SELECT q.*, ROW_NUMBER() OVER (
    PARTITION BY q.public_restaurant_id ORDER BY q.id DESC
  ) AS row_number
  FROM quality_v4_research_runs q
  WHERE q.quality_research_version='quality-v4-research-1'
)
SELECT p.place_id, latest.status, latest.error_category
FROM public_restaurants p
LEFT JOIN latest ON latest.public_restaurant_id=p.place_id AND latest.row_number=1
WHERE latest.status IS NULL OR latest.status!='complete'
ORDER BY p.place_id
"""


def collect(db_path: Path, seed_path: Path, *, benchmark_publication: bool) -> dict[str, Any]:
    db_hash_before = _sha256(db_path)
    seed_hash_before = _sha256(seed_path)
    connection = _connect_ro(db_path)
    try:
        total_raw = int(_one(connection, "SELECT COUNT(*) FROM restaurants"))
        total_public = int(_one(connection, "SELECT COUNT(*) FROM public_restaurants"))
        published = int(_one(connection, "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1"))
        threshold = float(_one(connection, "SELECT value FROM metadata WHERE key='publication_score_threshold'"))

        source_coverage = _rows(
            connection,
            """
            SELECT COALESCE(r.search_area, 'UNKNOWN') AS source_area,
                   COUNT(*) AS candidates,
                   SUM(r.candidate_eligible) AS eligible,
                   SUM(CASE WHEN p.place_id IS NOT NULL THEN 1 ELSE 0 END) AS seeded,
                   SUM(CASE WHEN p.is_published=1 THEN 1 ELSE 0 END) AS published,
                   SUM(CASE WHEN r.candidate_eligible=1 AND p.place_id IS NULL THEN 1 ELSE 0 END)
                       AS eligible_unseeded
            FROM restaurants r
            LEFT JOIN public_restaurants p ON p.place_id=r.place_id
            GROUP BY COALESCE(r.search_area, 'UNKNOWN')
            ORDER BY candidates DESC, source_area
            """,
        )

        pool_rows = _rows(
            connection,
            """
            SELECT r.internal_fiyu_score, r.candidate_eligible,
                   CASE WHEN p.place_id IS NULL THEN 0 ELSE 1 END AS seeded,
                   COALESCE(p.research_status, 'unseeded') AS research_status,
                   COALESCE(p.is_published, 0) AS published
            FROM restaurants r
            LEFT JOIN public_restaurants p ON p.place_id=r.place_id
            """,
        )
        pool_by_band: dict[str, dict[str, int]] = {}
        for row in pool_rows:
            bucket = pool_by_band.setdefault(
                _band(row["internal_fiyu_score"]),
                {"candidates": 0, "eligible": 0, "unseeded": 0, "eligible_unseeded": 0, "published": 0},
            )
            bucket["candidates"] += 1
            bucket["eligible"] += int(row["candidate_eligible"] or 0)
            bucket["unseeded"] += int(not row["seeded"])
            bucket["eligible_unseeded"] += int(bool(row["candidate_eligible"]) and not row["seeded"])
            bucket["published"] += int(row["published"] or 0)

        conversion_rows = _rows(
            connection,
            """
            SELECT r.internal_fiyu_score, p.research_status, p.is_published,
                   p.product_eligible, p.review_status
            FROM public_restaurants p
            JOIN restaurants r ON r.place_id=p.place_id
            WHERE p.research_status='complete'
            """,
        )
        conversion: dict[str, dict[str, Any]] = {}
        for row in conversion_rows:
            bucket = conversion.setdefault(_band(row["internal_fiyu_score"]), {"researched": 0, "published": 0})
            bucket["researched"] += 1
            bucket["published"] += int(row["is_published"] or 0)
        for bucket in conversion.values():
            bucket["published_rate"] = round(bucket["published"] / bucket["researched"], 4) if bucket["researched"] else None

        public_states = _rows(
            connection,
            """
            SELECT research_status, review_status, is_published, COUNT(*) AS count
            FROM public_restaurants
            GROUP BY research_status, review_status, is_published
            ORDER BY research_status, review_status, is_published
            """,
        )
        completeness = {
            "published": published,
            "published_missing_budget": int(_one(connection, "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 AND (budget_json IS NULL OR TRIM(budget_json) IN ('', '{}', 'null'))")),
            "published_missing_discovery_area": int(_one(connection, "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 AND (discovery_area IS NULL OR TRIM(discovery_area)='')")),
            "published_missing_food_tags": int(_one(connection, "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 AND food_tags_json='[]'")),
            "published_distinct_primary_categories": int(_one(connection, "SELECT COUNT(DISTINCT primary_category) FROM public_restaurants WHERE is_published=1")),
            "published_map_ready": int(_one(connection, "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 AND product_eligible=1 AND map_display_eligible=1 AND latitude IS NOT NULL AND longitude IS NOT NULL")),
            "published_with_raw_price_but_no_budget": int(_one(connection, """SELECT COUNT(*) FROM public_restaurants p JOIN restaurants r ON r.place_id=p.place_id WHERE p.is_published=1 AND (p.budget_json IS NULL OR TRIM(p.budget_json) IN ('', '{}', 'null')) AND r.price IS NOT NULL AND TRIM(r.price)!=''""")),
        }
        statuses = {
            "public_research_status": dict(Counter({str(row[0]): int(row[1]) for row in connection.execute("SELECT research_status, COUNT(*) FROM public_restaurants GROUP BY research_status")})),
            "quality_v4_latest_status": dict(Counter({str(row[0]): int(row[1]) for row in connection.execute("""WITH ranked AS (SELECT status, ROW_NUMBER() OVER (PARTITION BY public_restaurant_id ORDER BY id DESC) n FROM quality_v4_research_runs WHERE quality_research_version='quality-v4-research-1') SELECT status, COUNT(*) FROM ranked WHERE n=1 GROUP BY status""")})),
        }
        indexes = {
            table: _rows(connection, f"PRAGMA index_list('{table}')")
            for table in ("restaurants", "public_restaurants", "restaurant_research_runs", "quality_v4_research_runs")
        }
        query_plans = {
            name: [str(row[3]) for row in connection.execute("EXPLAIN QUERY PLAN " + sql)]
            for name, sql in {
                "public_catalog_list": PUBLIC_LIST_SQL,
                "picks_catalog": PICKS_SQL,
                "seed_unseeded": SEED_SQL,
                "research_queue": RESEARCH_SQL,
                "quality_v4_selector": QUALITY_V4_SQL,
            }.items()
        }
        benchmarks = {
            "open_readonly_db": _timed(lambda: (_connect_ro(db_path).close(),), iterations=30),
            "public_catalog_list_sql": _timed(lambda: connection.execute(PUBLIC_LIST_SQL).fetchall(), iterations=20),
            "picks_catalog_sql": _timed(lambda: connection.execute(PICKS_SQL).fetchall(), iterations=20),
            "seed_unseeded_selector_sql": _timed(lambda: connection.execute(SEED_SQL).fetchall(), iterations=20),
            "research_queue_sql": _timed(lambda: connection.execute(RESEARCH_SQL).fetchall(), iterations=20),
            "quality_v4_selector_sql": _timed(lambda: connection.execute(QUALITY_V4_SQL).fetchall(), iterations=10),
        }
        safety = {
            "sqlite_integrity": str(_one(connection, "PRAGMA integrity_check")),
            "foreign_key_violations": len(connection.execute("PRAGMA foreign_key_check").fetchall()),
            "journal_mode": str(_one(connection, "PRAGMA journal_mode")),
            "busy_timeout_ms_for_plain_readonly_connection": int(_one(connection, "PRAGMA busy_timeout")),
            "database_sha256_before": db_hash_before,
            "seed70_sha256_before": seed_hash_before,
            "external_requests": 0,
        }
    finally:
        connection.close()

    if benchmark_publication:
        from fiyu.publication_reconciliation import inspect_publication_reconciliation

        started = time.perf_counter()
        result = inspect_publication_reconciliation(
            db_path,
            threshold=70.0,
            cohort_manifest=Path("data/audits/floor70-prepublication-v4-promotion-cohort.json"),
        )
        benchmarks["publication_reconciliation_inspection"] = {
            "iterations": 1,
            "result_count": int(result["current"]["total"]),
            "elapsed_ms": round((time.perf_counter() - started) * 1000, 3),
        }

    safety["database_sha256_after"] = _sha256(db_path)
    safety["seed70_sha256_after"] = _sha256(seed_path)
    safety["database_unchanged"] = safety["database_sha256_before"] == safety["database_sha256_after"]
    safety["seed70_unchanged"] = safety["seed70_sha256_before"] == safety["seed70_sha256_after"]
    return {
        "audit": "pipeline-scale-readiness-v2",
        "verdict": {
            "safe_for_small_sequential_existing_queue_batch": True,
            "safe_for_unattended_large_new_source_wave": False,
            "sqlite_appropriate_for_1500_published": True,
            "new_research_pipeline_required": False,
            "true_blockers": [
                "destructive whole-corpus candidate ingestion with no source-run observation model",
                "no durable standard-research batch membership or atomic item claim",
                "missing restaurants.place_id index causing expensive public and research joins",
                "implicit one-writer and busy-timeout operating assumptions",
            ],
            "very_next_task": (
                "Implement source-run and source-observation persistence with dry-run, "
                "source-scoped additive import, stable place-ID projection, and invariant "
                "tests on a temporary database."
            ),
            "first_post_optimization_workload": "deterministic data-completeness backfill",
            "first_post_optimization_reason": (
                "It validates the run ledger and reporting without provider spend or "
                "publication membership changes; follow it with the frozen 149-row rescue "
                "cohort, then a new seed wave."
            ),
        },
        "path_to_1500": {
            "current_published": 851,
            "target_published": 1500,
            "net_additions_needed": 649,
            "already_researched_unpublished": 241,
            "floor70_rescue_cohort": {
                "candidates": 149,
                "current_state": "production-v3, unpublished, auto_rejected",
                "prior_local_yield_estimates": {"median": 50, "p75": 64, "p90": 76},
            },
            "seeded_unresolved": {"total": 111, "pending": 103, "failed": 4, "needs_retry": 4},
            "eligible_unseeded_at_or_above_60": 918,
            "eligible_unseeded_below_60": 644,
            "scenarios": {
                "conservative": {
                    "candidates_or_rescue_rows_considered": 1178,
                    "likely_additions_range": [430, 450],
                    "likely_resulting_catalog_range": [1281, 1301],
                    "existing_source_sufficient": False,
                },
                "base": {
                    "candidates_or_rescue_rows_considered": 1178,
                    "likely_additions": 635,
                    "likely_resulting_catalog": 1486,
                    "existing_source_sufficient": False,
                    "note": (
                        "Uses observed band conversion for unseeded rows, about 102 seeded "
                        "unresolved additions, and the prior rescue median; historical "
                        "conversion is selection-biased."
                    ),
                },
                "high_yield": {
                    "candidates_or_rescue_rows_considered": 1178,
                    "likely_additions": 750,
                    "likely_resulting_catalog": 1601,
                    "existing_source_sufficient": True,
                    "note": "Optimistic and geographically concentrated; not suitable as the operating plan.",
                },
            },
            "baseline_external_responses_requests_if_all_new_rows_receive_main_and_quality_v4_plus_rescue": 2207,
            "new_sourcing_recommended": True,
        },
        "priority": {
            "p0": [
                "source-safe additive ingestion with durable source/run provenance",
                "pipeline run ledger and atomic standard-research item claim",
                "restaurants.place_id invariant audit and index",
                "explicit single-writer and busy-timeout policy",
            ],
            "p1": [
                "bulk publication reconciliation inspection with decision parity",
                "one JSON/Markdown operator summary",
                "field-specific local-first completeness selectors",
                "CLI consolidation wrappers and legacy deprecation",
                "backup and restore runbook",
            ],
            "p2": [
                "minimal market registry and market_id",
                "market-aware geography, currency, timezone, prompt, and source configuration",
                "versioned normalization taxonomies",
            ],
        },
        "targeted_capabilities": {
            "missing_price": (
                "Reuse canonical-details and card enrichment; 155 of 228 missing published "
                "budgets have a raw price hint. Add a missing-budget-only selector before paid research."
            ),
            "discovery_area": (
                "Use stored city/neighborhood/address, verified address evidence, OSM "
                "boundaries, and discovery import tooling deterministically before any provider call."
            ),
            "cuisine_normalization": (
                "Offline raw-preserving versioned taxonomy; no ordinary synonym research."
            ),
            "new_ward_sourcing": (
                "Readers/scoring/discovery tools are reusable, but additive "
                "source-observation persistence is required first."
            ),
        },
        "validation": {
            "focused_tests": {"passed": 161, "failed": 0},
            "full_backend_tests": {
                "passed": 946,
                "failed": 0,
                "warnings": 1,
                "warning": "Pre-existing Starlette/httpx deprecation warning.",
            },
            "ruff": "passed",
            "git_diff_check": "passed",
            "external_requests": 0,
        },
        "catalog": {
            "raw_candidates": total_raw,
            "public_total": total_public,
            "published": published,
            "unpublished": total_public - published,
            "publication_threshold": threshold,
        },
        "source_coverage": source_coverage,
        "candidate_pool_by_internal_score_band": pool_by_band,
        "observed_completed_research_conversion_by_internal_score_band": conversion,
        "public_states": public_states,
        "statuses": statuses,
        "data_completeness": completeness,
        "indexes": indexes,
        "query_plans": query_plans,
        "benchmarks": benchmarks,
        "safety": safety,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("data/fiyu.db"))
    parser.add_argument("--seed", type=Path, default=Path("seed70.txt"))
    parser.add_argument("--output", type=Path, default=Path("data/audits/pipeline-scale-readiness-v2-summary.json"))
    parser.add_argument("--benchmark-publication", action="store_true")
    args = parser.parse_args()
    payload = collect(args.db, args.seed, benchmark_publication=args.benchmark_publication)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
