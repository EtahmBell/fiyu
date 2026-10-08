"""Reproduce Phase C SQLite query, ledger, and source-ingestion benchmarks."""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import statistics
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from audit_pipeline_scale_readiness_v2 import (
    PICKS_SQL,
    PUBLIC_LIST_SQL,
    QUALITY_V4_SQL,
    RESEARCH_SQL,
    SEED_SQL,
)

from fiyu.config import ScoringConfig
from fiyu.database import SCHEMA, connect
from fiyu.pipeline_runs import (
    claim_next_pipeline_item,
    create_pipeline_run,
    get_pipeline_run_status,
)
from fiyu.source_ingestion import run_source_ingestion

DETAIL_SQL = """
SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
       r.title, r.address, r.neighborhood, r.city, p.fiyu_score
FROM public_restaurants p
LEFT JOIN restaurants r ON r.place_id=p.place_id
WHERE p.place_id=? AND p.is_published=1 AND p.product_eligible=1
"""


def _readonly(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(
        f"file:{path.resolve().as_posix()}?mode=ro&immutable=1", uri=True
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def _timed(operation: Callable[[], Any], *, iterations: int) -> dict[str, object]:
    samples = []
    count = 0
    for _ in range(iterations):
        started = time.perf_counter()
        result = operation()
        samples.append((time.perf_counter() - started) * 1000)
        count = len(result) if hasattr(result, "__len__") else 1
    ordered = sorted(samples)
    p90_index = max(0, min(len(ordered) - 1, int(len(ordered) * 0.9) - 1))
    return {
        "iterations": iterations,
        "rows": count,
        "median_ms": round(statistics.median(samples), 3),
        "p90_ms": round(ordered[p90_index], 3),
    }


def _query_benchmarks(path: Path) -> dict[str, object]:
    connection = _readonly(path)
    try:
        detail_id = str(
            connection.execute(
                "SELECT place_id FROM public_restaurants "
                "WHERE is_published=1 ORDER BY place_id LIMIT 1"
            ).fetchone()[0]
        )
        queries = {
            "public_catalog": (PUBLIC_LIST_SQL, (), 20),
            "public_detail": (DETAIL_SQL, (detail_id,), 50),
            "picks_map_pool": (PICKS_SQL, (), 20),
            "seed_selector": (SEED_SQL, (), 20),
            "research_selector": (RESEARCH_SQL, (), 20),
            "quality_v4_selector": (QUALITY_V4_SQL, (), 10),
        }
        return {
            name: {
                **_timed(
                    lambda sql=sql, parameters=parameters: connection.execute(
                        sql, parameters
                    ).fetchall(),
                    iterations=iterations,
                ),
                "plan": [
                    str(row[3])
                    for row in connection.execute(
                        "EXPLAIN QUERY PLAN " + sql, parameters
                    )
                ],
            }
            for name, (sql, parameters, iterations) in queries.items()
        }
    finally:
        connection.close()


def _ledger_benchmarks(work_dir: Path) -> dict[str, object]:
    path = work_dir / "ledger-benchmark.db"
    path.unlink(missing_ok=True)
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    started = time.perf_counter()
    run_id = create_pipeline_run(
        path,
        run_type="phase_c_benchmark",
        item_keys=(f"place-{index:05}" for index in range(1000)),
        work_key="phase-c-benchmark:v1",
        selector={"limit": 1000},
        config={"version": 1},
        requested_item_count=1000,
    )
    create_ms = (time.perf_counter() - started) * 1000
    claims = _timed(
        lambda: claim_next_pipeline_item(path, run_id, worker_id="benchmark"),
        iterations=100,
    )
    status = _timed(lambda: get_pipeline_run_status(path, run_id), iterations=50)
    return {
        "create_1000_items_ms": round(create_ms, 3),
        "claim": claims,
        "status": status,
    }


def _write_source(path: Path, count: int) -> None:
    fields = [
        "placeId",
        "title",
        "totalScore",
        "reviewsCount",
        "categoryName",
        "address",
        "city",
        "neighborhood",
        "location/lat",
        "location/lng",
        "website",
        "scrapedAt",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index in range(count):
            writer.writerow(
                {
                    "placeId": f"benchmark-place-{index:06}",
                    "title": f"Benchmark Restaurant {index:06}",
                    "totalScore": f"{4.0 + (index % 10) / 10:.1f}",
                    "reviewsCount": 10 + index % 200,
                    "categoryName": "Japanese restaurant",
                    "address": f"{index} Benchmark Street, Tokyo",
                    "city": "Tokyo",
                    "neighborhood": f"Area {index % 23}",
                    "location/lat": 35.5 + (index % 1000) / 100000,
                    "location/lng": 139.5 + (index % 1000) / 100000,
                    "website": f"https://restaurant-{index:06}.example",
                    "scrapedAt": "2026-10-07T00:00:00Z",
                }
            )


def _source_benchmarks(work_dir: Path, sizes: list[int]) -> dict[str, object]:
    results: dict[str, object] = {}
    for size in sizes:
        source = work_dir / f"source-{size}.csv"
        database = work_dir / f"source-{size}.db"
        database.unlink(missing_ok=True)
        _write_source(source, size)
        started = time.perf_counter()
        result = run_source_ingestion(
            [source],
            source_key=f"phase-c-{size}",
            db_path=database,
            csv_output=None,
            config=ScoringConfig(),
        )
        results[str(size)] = {
            "elapsed_seconds": round(time.perf_counter() - started, 3),
            "canonical_candidates": result["canonical_candidate_count"],
        }
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before-db", type=Path, required=True)
    parser.add_argument("--after-db", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-size", action="append", type=int, default=[])
    args = parser.parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "before": _query_benchmarks(args.before_db),
        "after": _query_benchmarks(args.after_db),
        "pipeline_run_ledger": _ledger_benchmarks(args.work_dir),
        "source_ingestion": _source_benchmarks(args.work_dir, args.source_size),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
