from __future__ import annotations

import sqlite3
import time

import pytest

from fiyu.catalog_pipeline import automatic_publication_decision
from fiyu.database import (
    SCHEMA,
    SQLITE_BUSY_TIMEOUT_MS,
    connect,
    ensure_core_indexes,
)
from fiyu.public_catalog import ensure_public_schema
from fiyu.publication_reconciliation import _evaluate_all
from tests.test_catalog_pipeline import _db, _save


def test_connection_policy_is_explicit(tmp_path):
    path = tmp_path / "policy.db"
    with connect(path) as connection:
        assert connection.row_factory is sqlite3.Row
        assert connection.execute("PRAGMA busy_timeout").fetchone()[0] == SQLITE_BUSY_TIMEOUT_MS
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].casefold() == "wal"


def test_core_index_migration_is_idempotent_and_preserves_rows(tmp_path):
    path = tmp_path / "legacy.db"
    with connect(path) as connection:
        connection.execute(
            "CREATE TABLE restaurants (id INTEGER PRIMARY KEY, place_id TEXT, title TEXT)"
        )
        connection.executemany(
            "INSERT INTO restaurants VALUES (?, ?, ?)",
            ((1, "place-1", "One"), (2, "place-2", "Two")),
        )
        ensure_core_indexes(connection)
        ensure_core_indexes(connection)
        rows = connection.execute("SELECT * FROM restaurants ORDER BY id").fetchall()
        indexes = {
            row["name"]: row for row in connection.execute("PRAGMA index_list(restaurants)")
        }
    assert [tuple(row) for row in rows] == [
        (1, "place-1", "One"),
        (2, "place-2", "Two"),
    ]
    assert indexes["idx_restaurants_place_id"]["unique"] == 1


def test_core_unique_index_rejects_legacy_duplicate_place_ids(tmp_path):
    path = tmp_path / "duplicate.db"
    with connect(path) as connection:
        connection.execute("CREATE TABLE restaurants (id INTEGER PRIMARY KEY, place_id TEXT)")
        connection.executemany(
            "INSERT INTO restaurants(place_id) VALUES (?)",
            (("duplicate",), ("duplicate",)),
        )
        with pytest.raises(sqlite3.IntegrityError):
            ensure_core_indexes(connection)


def test_place_id_join_plan_uses_new_index(tmp_path):
    path = tmp_path / "plan.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            "INSERT INTO restaurants(place_id, title, rating, review_count) "
            "VALUES ('place-1', 'One', 4.0, 1)"
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            "INSERT INTO public_restaurants(place_id, created_at, updated_at) "
            "VALUES ('place-1', 'now', 'now')"
        )
        plan = [
            str(row["detail"])
            for row in connection.execute(
                """
                EXPLAIN QUERY PLAN
                SELECT p.place_id, r.title
                FROM public_restaurants p
                LEFT JOIN restaurants r ON r.place_id=p.place_id
                WHERE p.place_id='place-1'
                """
            )
        ]
    assert any("idx_restaurants_place_id" in step for step in plan)


def test_busy_timeout_waits_then_fails_cleanly(tmp_path):
    path = tmp_path / "locked.db"
    with connect(path) as setup:
        setup.execute("CREATE TABLE sample(value TEXT)")
        setup.commit()
    writer = connect(path)
    contender = connect(path)
    try:
        writer.execute("BEGIN IMMEDIATE")
        writer.execute("INSERT INTO sample VALUES ('held')")
        contender.execute("PRAGMA busy_timeout=25")
        started = time.perf_counter()
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            contender.execute("INSERT INTO sample VALUES ('blocked')")
        assert time.perf_counter() - started >= 0.02
    finally:
        writer.rollback()
        writer.close()
        contender.close()


def test_context_manager_rolls_back_failed_transaction(tmp_path):
    path = tmp_path / "rollback.db"
    with connect(path) as connection:
        connection.execute("CREATE TABLE sample(value TEXT)")
        connection.commit()
    with pytest.raises(RuntimeError, match="injected"), connect(path) as connection:
        connection.execute("INSERT INTO sample VALUES ('must-rollback')")
        raise RuntimeError("injected")
    with connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM sample").fetchone()[0] == 0


def test_preloaded_publication_evaluator_matches_legacy_path(tmp_path):
    path = _db(tmp_path)
    _save(path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET review_status='auto_rejected', "
            "review_notes='score_or_product_policy_rejected' WHERE place_id='place-1'"
        )
        connection.commit()
        legacy = automatic_publication_decision(
            path,
            "place-1",
            publication_threshold=70,
            _connection=connection,
        )
    optimized = _evaluate_all(path, 70)["place-1"]
    assert optimized == legacy
