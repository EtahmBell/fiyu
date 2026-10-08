"""Fast, stored-state-only operator status and coverage reports."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .database import connect_readonly
from .pipeline_runs import list_pipeline_runs
from .source_ingestion import list_source_runs


def _one(connection: Any, sql: str, parameters: tuple[object, ...] = ()) -> int:
    row = connection.execute(sql, parameters).fetchone()
    return int(row[0] or 0)


def _threshold(connection: Any) -> float:
    row = connection.execute(
        "SELECT value FROM metadata WHERE key='publication_score_threshold'"
    ).fetchone()
    return float(row[0]) if row else 75.0


def _distribution(connection: Any, sql: str) -> dict[str, int]:
    return {str(row[0] or "unknown"): int(row[1]) for row in connection.execute(sql)}


def catalog_status(db_path: str | Path) -> dict[str, object]:
    """Return a cheap catalog overview without invoking publication evaluation."""

    with connect_readonly(db_path) as connection:
        threshold = _threshold(connection)
        raw_candidates = _one(connection, "SELECT COUNT(*) FROM restaurants")
        seeded = _one(connection, "SELECT COUNT(*) FROM public_restaurants")
        published = _one(
            connection, "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1"
        )
        score_versions = _distribution(
            connection,
            "SELECT COALESCE(score_version, 'unscored'), COUNT(*) "
            "FROM public_restaurants GROUP BY score_version",
        )
        v4_name = "public-v4-quality-research-specialist-tristate"
        v3_name = "public-v3-local-discovery-specialist-tristate"
        stale_v4 = _one(
            connection,
            """
            SELECT COUNT(*) FROM public_restaurants
            WHERE score_version=?
              AND COALESCE(specialist_schema_version, '')!='specialist-tristate-1'
            """,
            (v4_name,),
        )
        blocked = _one(
            connection,
            "SELECT COUNT(*) FROM public_restaurants "
            "WHERE is_published=0 AND fiyu_score>=?",
            (threshold,),
        )
        block_reasons = _distribution(
            connection,
            "SELECT COALESCE(NULLIF(review_notes, ''), COALESCE(review_status, 'unknown')), "
            "COUNT(*) FROM public_restaurants "
            f"WHERE is_published=0 AND fiyu_score>={threshold:g} "
            "GROUP BY COALESCE(NULLIF(review_notes, ''), COALESCE(review_status, 'unknown')) "
            "ORDER BY COUNT(*) DESC",
        )
        status = {
            "catalog": {
                "raw_candidate_rows": raw_candidates,
                "seeded_public_rows": seeded,
                "total": seeded,
                "published": published,
                "unpublished": seeded - published,
                "publication_threshold": threshold,
            },
            "lineage": {
                "v4_specialist": score_versions.get(v4_name, 0) - stale_v4,
                "stale_v4": stale_v4,
                "v3_specialist": score_versions.get(v3_name, 0),
                "unscored": score_versions.get("unscored", 0),
                "score_versions": score_versions,
            },
            "readiness": {
                "research_pending": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants WHERE research_status='pending'",
                ),
                "retryable_research_failures": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants "
                    "WHERE research_status='needs_retry'",
                ),
                "quality_v4_complete": _one(
                    connection,
                    "SELECT COUNT(DISTINCT public_restaurant_id) "
                    "FROM quality_v4_research_runs WHERE status='complete'",
                ),
                "quality_v4_remaining": seeded - score_versions.get(v4_name, 0),
                "score_at_or_above_threshold_but_unpublished": blocked,
                "block_reasons": block_reasons,
                "map_picks_ready_published": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants "
                    "WHERE is_published=1 AND map_display_eligible=1",
                ),
            },
        }
    source_runs = list_source_runs(db_path, limit=1)
    pipeline_runs = list_pipeline_runs(db_path, limit=1)
    status["recent_operations"] = {
        "source_run": source_runs[0] if source_runs else None,
        "pipeline_run": pipeline_runs[0] if pipeline_runs else None,
    }
    return status


def funnel_report(db_path: str | Path) -> dict[str, object]:
    """Return a read-only stored-state funnel for expansion planning."""

    with connect_readonly(db_path) as connection:
        threshold = _threshold(connection)
        result = {
            "threshold": threshold,
            "stages": {
                "raw_candidates": _one(connection, "SELECT COUNT(*) FROM restaurants"),
                "internal_eligible": _one(
                    connection, "SELECT COUNT(*) FROM restaurants WHERE candidate_eligible=1"
                ),
                "seeded": _one(connection, "SELECT COUNT(*) FROM public_restaurants"),
                "researched": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants WHERE research_status='complete'",
                ),
                "quality_v4_complete": _one(
                    connection,
                    "SELECT COUNT(DISTINCT public_restaurant_id) "
                    "FROM quality_v4_research_runs WHERE status='complete'",
                ),
                "score_at_or_above_threshold": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants WHERE fiyu_score>=?",
                    (threshold,),
                ),
                "publication_ready": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1",
                ),
                "published": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1",
                ),
            },
            "research_status": _distribution(
                connection,
                "SELECT research_status, COUNT(*) FROM public_restaurants "
                "GROUP BY research_status ORDER BY COUNT(*) DESC",
            ),
            "review_status": _distribution(
                connection,
                "SELECT COALESCE(review_status, 'unknown'), COUNT(*) "
                "FROM public_restaurants GROUP BY review_status ORDER BY COUNT(*) DESC",
            ),
            "unpublished_at_threshold_blocks": _distribution(
                connection,
                "SELECT COALESCE(NULLIF(review_notes, ''), COALESCE(review_status, 'unknown')), "
                "COUNT(*) FROM public_restaurants "
                f"WHERE is_published=0 AND fiyu_score>={threshold:g} "
                "GROUP BY COALESCE(NULLIF(review_notes, ''), COALESCE(review_status, 'unknown')) "
                "ORDER BY COUNT(*) DESC",
            ),
        }
    return result


def coverage_report(db_path: str | Path) -> dict[str, object]:
    """Report stored coverage only; no normalization or backfill is performed."""

    with connect_readonly(db_path) as connection:
        published = _one(
            connection, "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1"
        )
        seeded_ids = "SELECT place_id FROM public_restaurants"
        return {
            "published_by_ward": _distribution(
                connection,
                "SELECT COALESCE(NULLIF(discovery_area, ''), 'unknown'), COUNT(*) "
                "FROM public_restaurants WHERE is_published=1 "
                "GROUP BY COALESCE(NULLIF(discovery_area, ''), 'unknown') "
                "ORDER BY COUNT(*) DESC",
            ),
            "candidate_unseeded_by_area": _distribution(
                connection,
                "SELECT COALESCE(NULLIF(search_area, ''), NULLIF(neighborhood, ''), "
                "NULLIF(city, ''), 'unknown'), COUNT(*) FROM restaurants "
                f"WHERE place_id NOT IN ({seeded_ids}) "
                "GROUP BY COALESCE(NULLIF(search_area, ''), NULLIF(neighborhood, ''), "
                "NULLIF(city, ''), 'unknown') ORDER BY COUNT(*) DESC",
            ),
            "published_cuisine": _distribution(
                connection,
                "SELECT COALESCE(NULLIF(primary_category, ''), 'unknown'), COUNT(*) "
                "FROM public_restaurants WHERE is_published=1 "
                "GROUP BY COALESCE(NULLIF(primary_category, ''), 'unknown') "
                "ORDER BY COUNT(*) DESC",
            ),
            "completeness": {
                "published": published,
                "price_complete": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 "
                    "AND (NULLIF(budget_source_value, '') IS NOT NULL "
                    "OR (budget_json IS NOT NULL AND budget_json NOT IN ('', '{}', 'null')))",
                ),
                "discovery_area_complete": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 "
                    "AND NULLIF(discovery_area, '') IS NOT NULL",
                ),
                "map_ready": _one(
                    connection,
                    "SELECT COUNT(*) FROM public_restaurants "
                    "WHERE is_published=1 AND map_display_eligible=1",
                ),
            },
        }


def compact_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)
