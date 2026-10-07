from __future__ import annotations

import csv
import json
import sqlite3
from pathlib import Path

import pytest

from fiyu.cli import build_parser
from fiyu.config import ScoringConfig
from fiyu.database import INSERT_COLUMNS
from fiyu.ingest import run_destructive_ingestion
from fiyu.public_catalog import ensure_public_schema, seed_unseeded_public_queue
from fiyu.source_ingestion import ensure_source_ingestion_schema, run_source_ingestion


def _write_source(
    path: Path,
    indexes: range | list[int],
    *,
    overrides: dict[int, dict[str, object]] | None = None,
    extra_rows: list[dict[str, object]] | None = None,
) -> None:
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
    rows: list[dict[str, object]] = []
    for index in indexes:
        row: dict[str, object] = {
            "placeId": f"place-{index:03d}",
            "title": f"Restaurant {index:03d}",
            "totalScore": f"{4.1 + (index % 8) / 10:.1f}",
            "reviewsCount": 10 + index % 80,
            "categoryName": "Japanese restaurant",
            "address": f"{index} Example Street, Tokyo",
            "city": "Tokyo",
            "neighborhood": f"Area {index % 5}",
            "location/lat": 35.60 + index / 10000,
            "location/lng": 139.60 + index / 10000,
            "website": f"https://restaurant-{index:03d}.example",
            "scrapedAt": "2026-10-01T00:00:00Z",
        }
        row.update((overrides or {}).get(index, {}))
        rows.append(row)
    rows.extend(extra_rows or [])
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _import(db: Path, source: Path, source_key: str) -> dict[str, object]:
    return run_source_ingestion(
        [source],
        source_key=source_key,
        db_path=db,
        csv_output=None,
        config=ScoringConfig(),
    )


def _connection(db: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db)
    connection.row_factory = sqlite3.Row
    return connection


def _candidate_ids(db: Path) -> dict[str, int]:
    with _connection(db) as connection:
        return {
            str(row["place_id"]): int(row["id"])
            for row in connection.execute("SELECT id, place_id FROM restaurants")
        }


def test_source_imports_are_additive_idempotent_and_source_scoped(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    source_a = tmp_path / "source_a.csv"
    source_b = tmp_path / "source_b.csv"

    _write_source(source_a, range(100))
    first = _import(db, source_a, "source-a")
    initial_ids = _candidate_ids(db)
    assert first["new_candidates"] == 100
    assert first["new_observations"] == 100

    identical = _import(db, source_a, "source-a")
    assert identical["canonical_candidate_count"] == 100
    assert identical["new_candidates"] == 0
    assert identical["unchanged_observations"] == 100
    assert _candidate_ids(db) == initial_ids

    _write_source(source_a, range(120))
    expanded = _import(db, source_a, "source-a")
    expanded_ids = _candidate_ids(db)
    assert expanded["canonical_candidate_count"] == 120
    assert expanded["new_candidates"] == 20
    assert all(expanded_ids[place_id] == row_id for place_id, row_id in initial_ids.items())

    _write_source(source_a, range(10, 120))
    omitted = _import(db, source_a, "source-a")
    assert omitted["canonical_candidate_count"] == 120
    assert omitted["source_local_missing"] == 10
    assert _candidate_ids(db) == expanded_ids
    with _connection(db) as connection:
        assert connection.execute(
            """
            SELECT COUNT(*) FROM candidate_source_observations
            WHERE source_key='source-a' AND seen_in_latest_run=0
            """
        ).fetchone()[0] == 10

    _write_source(source_b, list(range(30, 60)) + list(range(120, 140)))
    second_source = _import(db, source_b, "source-b")
    assert second_source["canonical_candidate_count"] == 140
    assert second_source["new_candidates"] == 20
    assert second_source["updated_candidates"] == 30
    final_ids = _candidate_ids(db)
    assert all(final_ids[place_id] == row_id for place_id, row_id in expanded_ids.items())
    with _connection(db) as connection:
        assert connection.execute("SELECT COUNT(*) FROM restaurants").fetchone()[0] == 140
        assert connection.execute(
            "SELECT COUNT(*) FROM candidate_source_observations"
        ).fetchone()[0] == 170
        assert connection.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT place_id FROM candidate_source_observations
                GROUP BY place_id HAVING COUNT(*)=2
            )
            """
        ).fetchone()[0] == 30


def test_same_source_update_preserves_candidate_id(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    source = tmp_path / "source.csv"
    _write_source(source, range(3))
    _import(db, source, "source-a")
    original_id = _candidate_ids(db)["place-000"]

    _write_source(
        source,
        range(3),
        overrides={0: {"totalScore": "4.9", "reviewsCount": "77"}},
    )
    result = _import(db, source, "source-a")

    with _connection(db) as connection:
        row = connection.execute(
            "SELECT id, rating, review_count FROM restaurants WHERE place_id='place-000'"
        ).fetchone()
    assert result["updated_observations"] == 1
    assert row["id"] == original_id
    assert row["rating"] == 4.9
    assert row["review_count"] == 77


def test_source_refresh_preserves_all_downstream_state(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    source = tmp_path / "source.csv"
    _write_source(source, range(2))
    _import(db, source, "source-a")
    ensure_public_schema(db)
    source_id = _candidate_ids(db)["place-000"]
    with _connection(db) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, source_restaurant_id, research_status, evidence_json,
                fiyu_score, score_version, is_published, review_status,
                specialist_status, specialist_provenance_json, created_at, updated_at
            ) VALUES (?, ?, 'complete', ?, 82.5, 'certified-version', 1,
                      'auto_published', 'specialist', ?, 'created', 'updated')
            """,
            ("place-000", source_id, '{"durable":true}', '{"source":"test"}'),
        )
        connection.execute(
            """
            INSERT INTO restaurant_research_runs (
                public_restaurant_id, provider, model, prompt_version,
                pipeline_version, status, structured_research_json,
                evidence_json, evidence_urls_json, score_json,
                location_snapshot_json, usage_metadata_json, is_current,
                created_at, completed_at
            ) VALUES ('place-000', 'test', 'test', 'v1', 'v1', 'complete',
                      '{"research":true}', '{}', '[]', '{}', '{}', '{}', 1,
                      'created', 'completed')
            """
        )
        connection.execute(
            """
            INSERT INTO quality_v4_research_runs (
                public_restaurant_id, provider, model, status,
                quality_research_version, quality_case_strength_version,
                score_version, prompt_version, adjustment_guardrail,
                created_at, completed_at
            ) VALUES ('place-000', 'test', 'test', 'complete', 'quality-v4-research-1',
                      'case-v1', 'certified-version', 'prompt-v1', 6.75,
                      'created', 'completed')
            """
        )
        connection.execute(
            """
            INSERT INTO score_calculation_runs (
                public_restaurant_id, score_version, evidence_fingerprint,
                score_json, created_at
            ) VALUES ('place-000', 'certified-version', 'fingerprint',
                      '{"score":82.5}', 'created')
            """
        )
        connection.commit()
        before = {
            table: [tuple(row) for row in connection.execute(f"SELECT * FROM {table}")]
            for table in (
                "public_restaurants",
                "restaurant_research_runs",
                "quality_v4_research_runs",
                "score_calculation_runs",
            )
        }

    _write_source(
        source,
        range(2),
        overrides={0: {"reviewsCount": "78", "address": "Updated source address"}},
    )
    _import(db, source, "source-a")

    assert _candidate_ids(db)["place-000"] == source_id
    with _connection(db) as connection:
        after = {
            table: [tuple(row) for row in connection.execute(f"SELECT * FROM {table}")]
            for table in before
        }
    assert after == before


def test_invalid_and_duplicate_rows_are_reported_deterministically(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    source = tmp_path / "source.csv"
    _write_source(
        source,
        [],
        extra_rows=[
            {
                "placeId": "place-001",
                "title": "One",
                "totalScore": "4.4",
                "reviewsCount": "10",
                "categoryName": "Restaurant",
                "scrapedAt": "2026-10-01T00:00:00Z",
            },
            {
                "placeId": "place-001",
                "title": "One",
                "totalScore": "4.4",
                "reviewsCount": "15",
                "categoryName": "Restaurant",
                "scrapedAt": "2026-10-02T00:00:00Z",
            },
            {
                "placeId": "",
                "title": "No durable key",
                "totalScore": "4.4",
                "reviewsCount": "10",
                "categoryName": "Restaurant",
            },
            {
                "placeId": "bad-rating",
                "title": "Bad rating",
                "totalScore": "not-a-number",
                "reviewsCount": "10",
                "categoryName": "Restaurant",
            },
            {
                "placeId": "bad-reviews",
                "title": "Bad reviews",
                "totalScore": "4.4",
                "reviewsCount": "not-an-integer",
                "categoryName": "Restaurant",
            },
        ],
    )
    result = _import(db, source, "source-a")
    assert result["cleaning"]["input_rows"] == 5
    assert result["cleaning"]["duplicate_rows"] == 1
    assert result["cleaning"]["invalid_rows"] == 3
    assert result["canonical_candidate_count"] == 1
    with _connection(db) as connection:
        assert connection.execute(
            "SELECT review_count FROM restaurants WHERE place_id='place-001'"
        ).fetchone()[0] == 15


def test_parse_failure_records_failed_run_without_candidate_mutation(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    source = tmp_path / "bad.json"
    source.write_text("{not valid json", encoding="utf-8")

    with pytest.raises(json.JSONDecodeError):
        _import(db, source, "source-a")

    with _connection(db) as connection:
        run = connection.execute("SELECT * FROM candidate_source_runs").fetchone()
        assert run["status"] == "failed"
        assert "JSONDecodeError" in run["error_summary"]
        assert connection.execute("SELECT COUNT(*) FROM restaurants").fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM candidate_source_observations"
        ).fetchone()[0] == 0


def test_validation_failure_records_failed_run_without_mutation(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    source = tmp_path / "source.csv"
    _write_source(
        source,
        [],
        extra_rows=[
            {
                "placeId": "",
                "title": "Missing durable identity",
                "totalScore": "4.5",
                "reviewsCount": "20",
                "categoryName": "Restaurant",
            }
        ],
    )

    with pytest.raises(ValueError, match="no valid candidates with a Place ID"):
        _import(db, source, "source-a")

    with _connection(db) as connection:
        run = connection.execute("SELECT * FROM candidate_source_runs").fetchone()
        assert run["status"] == "failed"
        assert "no valid candidates with a Place ID" in run["error_summary"]
        assert connection.execute("SELECT COUNT(*) FROM restaurants").fetchone()[0] == 0


@pytest.mark.parametrize("failure_target", ["_upsert_observations", "_upsert_canonical_candidates"])
def test_transaction_rolls_back_on_persistence_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure_target: str
) -> None:
    from fiyu import source_ingestion

    db = tmp_path / "catalog.db"
    source_a = tmp_path / "source_a.csv"
    source_b = tmp_path / "source_b.csv"
    _write_source(source_a, range(2))
    _import(db, source_a, "source-a")
    before_ids = _candidate_ids(db)
    with _connection(db) as connection:
        before_observations = [
            tuple(row)
            for row in connection.execute(
                "SELECT * FROM candidate_source_observations ORDER BY source_key, place_id"
            )
        ]

    _write_source(source_b, range(2, 4))

    def fail(*args, **kwargs):
        raise sqlite3.OperationalError("injected persistence failure")

    monkeypatch.setattr(source_ingestion, failure_target, fail)
    with pytest.raises(sqlite3.OperationalError, match="injected persistence failure"):
        _import(db, source_b, "source-b")

    assert _candidate_ids(db) == before_ids
    with _connection(db) as connection:
        after_observations = [
            tuple(row)
            for row in connection.execute(
                "SELECT * FROM candidate_source_observations ORDER BY source_key, place_id"
            )
        ]
        failed = connection.execute(
            "SELECT status, error_summary FROM candidate_source_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert after_observations == before_observations
    assert failed["status"] == "failed"
    assert "injected persistence failure" in failed["error_summary"]


def test_source_safe_import_has_exact_legacy_score_parity(tmp_path: Path) -> None:
    source = tmp_path / "source.csv"
    safe_db = tmp_path / "safe.db"
    legacy_db = tmp_path / "legacy.db"
    _write_source(source, range(40))
    config = ScoringConfig()

    run_destructive_ingestion(
        [source],
        db_path=legacy_db,
        csv_output=None,
        config=config,
        allow_destructive=True,
    )
    run_source_ingestion(
        [source],
        source_key="source-a",
        db_path=safe_db,
        csv_output=None,
        config=config,
    )

    columns = ", ".join(INSERT_COLUMNS)
    with _connection(legacy_db) as legacy, _connection(safe_db) as safe:
        legacy_rows = [
            tuple(row) for row in legacy.execute(f"SELECT {columns} FROM restaurants ORDER BY place_id")
        ]
        safe_rows = [
            tuple(row) for row in safe.execute(f"SELECT {columns} FROM restaurants ORDER BY place_id")
        ]
    assert safe_rows == legacy_rows


def test_seed_unseeded_works_after_source_safe_import(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    source = tmp_path / "source.csv"
    _write_source(source, range(8), overrides={index: {"totalScore": "4.8"} for index in range(8)})
    _import(db, source, "source-a")
    ensure_public_schema(db)

    preview = seed_unseeded_public_queue(
        db, limit=20, min_internal_score=0, seed="test", dry_run=True
    )
    assert preview["selected_count"] == 8
    applied = seed_unseeded_public_queue(
        db, limit=20, min_internal_score=0, seed="test", dry_run=False
    )
    assert applied["seeded_count"] == 8
    repeated = seed_unseeded_public_queue(
        db, limit=20, min_internal_score=0, seed="test", dry_run=True
    )
    assert repeated["selected_count"] == 0
    with _connection(db) as connection:
        assert connection.execute("SELECT COUNT(*) FROM public_restaurants").fetchone()[0] == 8


def test_source_schema_initialization_is_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "catalog.db"
    ensure_source_ingestion_schema(db)
    ensure_source_ingestion_schema(db)
    with _connection(db) as connection:
        tables = {
            str(row[0])
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
    assert {"restaurants", "candidate_source_runs", "candidate_source_observations"} <= tables


def test_cli_requires_explicit_source_key_for_normal_ingest() -> None:
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["ingest", "source.csv"])
    parsed = parser.parse_args(
        ["ingest", "source.csv", "--source-key", "source-a", "--db", "disposable.db"]
    )
    assert parsed.source_key == "source-a"


def test_destructive_ingestion_requires_explicit_internal_guard(tmp_path: Path) -> None:
    source = tmp_path / "source.csv"
    _write_source(source, range(1))
    with pytest.raises(ValueError, match="destructive ingestion is disabled"):
        run_destructive_ingestion(
            [source],
            db_path=tmp_path / "catalog.db",
            csv_output=None,
            config=ScoringConfig(),
        )
