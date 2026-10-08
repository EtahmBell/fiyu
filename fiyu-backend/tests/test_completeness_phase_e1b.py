from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from fiyu.completeness import (
    DETERMINISTIC_BACKFILL_SCHEMA,
    _insert_deterministic_run,
    run_cuisine_dry_run,
    run_discovery_area_dry_run,
    run_missing_budget_selector,
    run_price_dry_run,
)
from fiyu.pipeline_runs import PIPELINE_RUN_SCHEMA

DB = Path("data/fiyu.db")
AUDITS = Path("data/audits")
BACKUP = Path("data/backups/fiyu-pre-completeness-e1b-20261007T2315-PDT.db")


def _json(name: str) -> dict[str, object]:
    return json.loads((AUDITS / name).read_text(encoding="utf-8"))


def _jsonl(name: str) -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in (AUDITS / name).read_text(encoding="utf-8").splitlines()
    ]


def test_exact_applied_artifact_counts():
    assert len(_jsonl("cuisine-normalization-v1-applied.jsonl")) == 678
    assert len(_jsonl("discovery-area-backfill-v1-applied.jsonl")) == 803
    assert len(_jsonl("price-normalization-v1-applied.jsonl")) == 155


def test_cuisine_apply_preserves_raw_and_is_idempotent():
    with sqlite3.connect(DB) as connection:
        rows = connection.execute(
            """
            SELECT n.raw_cuisine, p.primary_category, r.category, n.taxonomy_version
            FROM restaurant_cuisine_normalizations n
            JOIN public_restaurants p ON p.place_id=n.public_restaurant_id
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            """
        ).fetchall()
    assert len(rows) == 678
    assert all(raw == (primary or category) for raw, primary, category, _ in rows)
    assert {version for *_, version in rows} == {"cuisine-taxonomy-v1"}
    assert run_cuisine_dry_run(DB)["proposed_change_count"] == 0


def test_discovery_apply_leaves_exact_conflict_unresolved():
    result = run_discovery_area_dry_run(DB)
    assert result["current_complete"] == 850
    assert result["conflicts"] == 1
    assert result["proposed_change_count"] == 0
    unresolved = _json("discovery-area-unresolved-v1.json")
    assert unresolved["unresolved_count"] == 1


def test_price_apply_preserves_raw_evidence_and_is_idempotent():
    changes = _jsonl("price-normalization-v1-applied.jsonl")
    expected = {str(row["place_id"]): row for row in changes}
    with sqlite3.connect(DB) as connection:
        rows = connection.execute(
            """
            SELECT p.place_id, r.price, p.budget_json
            FROM public_restaurants p JOIN restaurants r ON r.place_id=p.place_id
            WHERE p.place_id IN ({})
            """.format(",".join("?" for _ in expected)),
            tuple(expected),
        ).fetchall()
    assert len(rows) == 155
    for place_id, raw_price, budget_json in rows:
        assert raw_price == expected[place_id]["raw_evidence"]["candidate_price"]
        assert json.loads(budget_json) == expected[place_id]["proposed_budget"]
    assert run_price_dry_run(DB)["proposed_change_count"] == 0


def test_missing_budget_selector_exact_prior_parity():
    prior = _json("missing-budget-selector-v1.json")
    after = _json("missing-budget-selector-v1-post-backfill.json")
    current = run_missing_budget_selector(DB)
    assert prior["selected_place_ids"] == after["selected_place_ids"]
    assert after["selected_place_ids"] == current["selected_place_ids"]
    assert current["selected_count"] == 73


def test_score_publication_and_product_parity_certified():
    summary = _json("completeness-e1b-apply-summary.json")
    parity = summary["product_parity"]
    assert parity["public_score_parity"] == 1203
    assert parity["score_version_parity"] == 1203
    assert parity["publication_parity"] == 1203
    assert parity["score_changes"] == parity["publication_changes"] == 0
    assert parity["picks_algorithm_changed"] is False
    assert parity["taste_inputs_changed"] is False
    assert parity["api_schema_changed"] is False


def test_backup_is_readable_and_integrity_checked():
    connection = sqlite3.connect(f"file:{BACKUP.resolve().as_posix()}?mode=ro", uri=True)
    try:
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert connection.execute("SELECT COUNT(*) FROM public_restaurants").fetchone()[0] == 1203
    finally:
        connection.close()


def test_run_ledger_and_audit_trail_have_zero_external_requests():
    with sqlite3.connect(DB) as connection:
        runs = connection.execute(
            """
            SELECT run_type, selected_item_count, completed_count,
                   provider_request_count, web_search_action_count
            FROM pipeline_runs ORDER BY id
            """
        ).fetchall()
        audit_count = connection.execute(
            "SELECT COUNT(*) FROM deterministic_backfill_items WHERE status='applied'"
        ).fetchone()[0]
    assert runs == [
        ("cuisine_normalization", 678, 678, 0, 0),
        ("discovery_area_backfill", 803, 803, 0, 0),
        ("price_normalization", 155, 155, 0, 0),
    ]
    assert audit_count == 1636


def test_transaction_rollback_does_not_leave_run_items():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(PIPELINE_RUN_SCHEMA)
    connection.executescript(DETERMINISTIC_BACKFILL_SCHEMA)
    connection.execute("CREATE TABLE public_restaurants(place_id TEXT PRIMARY KEY)")
    connection.execute("INSERT INTO public_restaurants VALUES ('x')")
    connection.commit()
    connection.execute("BEGIN IMMEDIATE")
    _insert_deterministic_run(
        connection,
        operation="rollback_test",
        version="v1",
        changes=[{"place_id": "x"}],
        now="2026-10-07T00:00:00+00:00",
    )
    connection.rollback()
    assert connection.execute("SELECT COUNT(*) FROM pipeline_runs").fetchone()[0] == 0
    assert connection.execute("SELECT COUNT(*) FROM pipeline_run_items").fetchone()[0] == 0
    connection.close()
