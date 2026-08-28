from __future__ import annotations

import hashlib
import sqlite3

import pytest

from fiyu.production_snapshot import (
    RUNTIME_TABLES,
    SCRUBBED_PUBLIC_COLUMNS,
    SCRUBBED_TABLES,
    ProductionSnapshotError,
    create_production_snapshot,
)


def _digest(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _source_database(path, *, unknown_table: bool = False) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE restaurants (
                place_id TEXT,
                source_files_json TEXT NOT NULL DEFAULT '[]'
            );
            CREATE TABLE public_restaurants (
                place_id TEXT PRIMARY KEY,
                evidence_json TEXT NOT NULL DEFAULT '{}',
                card_enrichment_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE description_research_runs (
                public_restaurant_id TEXT,
                status TEXT NOT NULL
            );
            CREATE TABLE community_recommendations (place_id TEXT);
            """
        )
        for table in SCRUBBED_TABLES:
            connection.execute(f'CREATE TABLE "{table}" (value TEXT)')
            connection.execute(f'INSERT INTO "{table}" VALUES (?)', (f"private-{table}",))
        connection.execute(
            "INSERT INTO public_restaurants VALUES "
            "('published', '{\"internal\": true}', '{\"description\": \"public\"}')"
        )
        connection.executemany(
            "INSERT INTO restaurants VALUES (?, ?)",
            (("published", '["C:/private/source.csv"]'), ("candidate-only", '["raw.csv"]')),
        )
        connection.executemany(
            "INSERT INTO description_research_runs VALUES (?, ?)",
            (("published", "accepted"), ("published", "failed")),
        )
        connection.execute("INSERT INTO community_recommendations VALUES ('published')")
        if unknown_table:
            connection.execute("CREATE TABLE newly_added_unclassified_data (value TEXT)")
        connection.commit()
    finally:
        connection.close()


def test_production_snapshot_retains_runtime_catalog_and_scrubs_private_state(tmp_path):
    source = tmp_path / "source.db"
    output = tmp_path / "production" / "fiyu.db"
    _source_database(source)
    source_before = _digest(source)

    report = create_production_snapshot(source, output)

    assert output.is_file()
    assert _digest(source) == source_before
    assert set(report["retained_tables"]) == set(RUNTIME_TABLES)
    assert set(report["scrubbed_tables"]) == set(SCRUBBED_TABLES)
    assert set(report["scrubbed_public_columns"]) == {
        column for column in SCRUBBED_PUBLIC_COLUMNS if column == "evidence_json"
    }
    connection = sqlite3.connect(output)
    try:
        for table in SCRUBBED_TABLES:
            assert connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] == 0
        assert connection.execute("SELECT place_id FROM restaurants").fetchall() == [
            ("published",)
        ]
        assert connection.execute("SELECT source_files_json FROM restaurants").fetchone()[0] == "[]"
        assert connection.execute(
            "SELECT evidence_json, card_enrichment_json FROM public_restaurants"
        ).fetchone() == ("{}", '{"description": "public"}')
        assert connection.execute(
            "SELECT status FROM description_research_runs"
        ).fetchall() == [("accepted",)]
        assert connection.execute(
            "SELECT COUNT(*) FROM community_recommendations"
        ).fetchone()[0] == 1
    finally:
        connection.close()


def test_production_snapshot_is_fail_closed_for_unclassified_tables(tmp_path):
    source = tmp_path / "source.db"
    _source_database(source, unknown_table=True)

    with pytest.raises(ProductionSnapshotError, match="Unclassified SQLite tables"):
        create_production_snapshot(source, tmp_path / "output.db")


def test_production_snapshot_requires_force_to_replace_output(tmp_path):
    source = tmp_path / "source.db"
    output = tmp_path / "output.db"
    _source_database(source)
    create_production_snapshot(source, output)

    with pytest.raises(ProductionSnapshotError, match="--force"):
        create_production_snapshot(source, output)

    create_production_snapshot(source, output, force=True)
