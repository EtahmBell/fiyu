from __future__ import annotations

import hashlib
import json
import time

import pytest

from fiyu import cli
from fiyu.database import SCHEMA, connect
from fiyu.operator_reporting import COUNT_FIELDS, operator_summary
from fiyu.operator_status import catalog_status, coverage_report, funnel_report
from fiyu.pipeline_cli import main as pipeline_main
from fiyu.pipeline_runs import (
    claim_next_pipeline_item,
    create_pipeline_run,
    finish_pipeline_item,
    get_pipeline_run_status,
    list_pipeline_runs,
)
from fiyu.public_catalog import ensure_public_schema
from fiyu.source_ingestion import (
    _source_impact,
    get_source_run_status,
    list_source_runs,
)
from fiyu.sqlite_snapshot import create_sqlite_backup
from tests.test_source_ingestion import _import, _write_source


def _digest(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _operator_db(tmp_path):
    path = tmp_path / "operator.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            "INSERT INTO restaurants(place_id, title, rating, review_count, "
            "candidate_eligible, internal_fiyu_score, search_area) "
            "VALUES ('published', 'Published', 4.5, 20, 1, 80, 'Taito')"
        )
        connection.execute(
            "INSERT INTO restaurants(place_id, title, rating, review_count, "
            "candidate_eligible, internal_fiyu_score, search_area) "
            "VALUES ('unseeded', 'Unseeded', 4.4, 25, 1, 72, 'Shibuya')"
        )
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES "
            "('publication_score_threshold', '70')"
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, primary_category, discovery_area, budget_source_value,
                research_status, fiyu_score, score_version, specialist_status,
                specialist_schema_version, product_eligible, review_status,
                review_notes, is_published, map_display_eligible, created_at, updated_at
            ) VALUES (
                'published', 'Sushi', 'Taito', '¥¥', 'complete', 80,
                'public-v4-quality-research-specialist-tristate', 'specialist',
                'specialist-tristate-1', 1, 'auto_published', NULL, 1, 1, 'now', 'now'
            )
            """
        )
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, research_status, fiyu_score, score_version,
                specialist_schema_version, product_eligible, review_status,
                review_notes, is_published, created_at, updated_at
            ) VALUES (
                'blocked', 'needs_retry', 75,
                'public-v3-local-discovery-specialist-tristate',
                'specialist-tristate-1', 0, 'auto_rejected',
                'score_or_product_policy_rejected', 0, 'now', 'now'
            )
            """
        )
        connection.execute(
            """
            INSERT INTO quality_v4_research_runs (
                public_restaurant_id, provider, model, status,
                quality_research_version, quality_case_strength_version,
                score_version, prompt_version, adjustment_guardrail, created_at
            ) VALUES (
                'published', 'test', 'test', 'complete', 'q', 'c', 'v4', 'p', 6.75, 'now'
            )
            """
        )
        connection.commit()
    return path


def test_fiyu_pipeline_routes_to_canonical_cli(monkeypatch):
    called = {}

    def fake_main(argv, *, canonical=False):
        called.update(argv=argv, canonical=canonical)

    monkeypatch.setattr("fiyu.pipeline_cli.main", fake_main)
    cli.main(["pipeline", "--db", "example.db", "catalog-status"])
    assert called == {
        "argv": ["--db", "example.db", "catalog-status"],
        "canonical": True,
    }


def test_source_impact_reports_score_and_eligibility_crossings():
    impact = _source_impact(
        {"up": (59.0, False), "down": (61.0, True), "same": (70.0, True)},
        {"up": (60.0, True), "down": (59.0, False), "same": (70.0, True)},
        source_updated_candidates=1,
    )
    cheap = impact["cheap_score"]
    assert cheap["scores_changed"] == 2
    assert cheap["median_absolute_delta"] == 1.5
    assert cheap["max_absolute_delta"] == 2.0
    assert cheap["became_seed_eligible_place_ids"] == ["up"]
    assert cheap["became_seed_ineligible_place_ids"] == ["down"]


def test_source_run_status_persists_impact_and_lists_runs(tmp_path):
    source = tmp_path / "source.csv"
    database = tmp_path / "source.db"
    _write_source(source, range(20))
    imported = _import(database, source, "operator-source")

    status = get_source_run_status(database, imported["run_id"])
    recent = list_source_runs(database, source_key="operator-source", limit=5)

    assert status["impact"] == imported["impact"]
    assert status["source_key"] == "operator-source"
    assert recent[0]["id"] == imported["run_id"]
    assert recent[0]["valid_rows"] == 20


def test_pipeline_status_and_recent_listing_are_read_only(tmp_path):
    database = tmp_path / "runs.db"
    with connect(database) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    run_id = create_pipeline_run(
        database,
        run_type="standard_restaurant_research",
        item_keys=("one", "two"),
        work_key="research:v1",
        selector={"limit": 2},
        config={"model": "test"},
        requested_item_count=2,
    )
    before = _digest(database)
    status = get_pipeline_run_status(database, run_id)
    recent = list_pipeline_runs(database, run_type="standard_restaurant_research")
    after = _digest(database)

    assert before == after
    assert status["remaining_work"] == 2
    assert status["no_remaining_work"] is False
    assert recent[0]["run_id"] == run_id


def test_resume_and_retry_reject_invalid_or_finished_work(tmp_path):
    database = tmp_path / "runs.db"
    with connect(database) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    completed = create_pipeline_run(
        database,
        run_type="standard_restaurant_research",
        item_keys=(),
        work_key="research:v1",
        selector={},
        config={"model": "test"},
        requested_item_count=0,
    )
    with pytest.raises(ValueError, match="no remaining work"):
        pipeline_main(
            ["--db", str(database), "research-resume", str(completed), "--dry-run"],
            canonical=True,
        )
    with pytest.raises(ValueError, match="no retryable failures"):
        pipeline_main(
            ["--db", str(database), "research-retry", str(completed), "--dry-run"],
            canonical=True,
        )
    with pytest.raises(ValueError, match="fresh selector flags"):
        pipeline_main(
            [
                "--db",
                str(database),
                "research",
                "--resume-run",
                str(completed),
                "--limit",
                "2",
                "--dry-run",
            ],
            canonical=True,
        )


def test_resume_and_retry_dry_runs_use_existing_frozen_run_without_mutation(
    tmp_path, capsys
):
    database = tmp_path / "runs.db"
    with connect(database) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(database)
    pending = create_pipeline_run(
        database,
        run_type="standard_restaurant_research",
        item_keys=("pending",),
        work_key="research:pending",
        selector={},
        config={"model": "test"},
        requested_item_count=1,
    )
    retryable = create_pipeline_run(
        database,
        run_type="standard_restaurant_research",
        item_keys=("retryable",),
        work_key="research:retryable",
        selector={},
        config={"model": "test"},
        requested_item_count=1,
    )
    claim = claim_next_pipeline_item(database, retryable, worker_id="test")
    finish_pipeline_item(
        database,
        claim["id"],
        claim["claim_token"],
        state="failed_retryable",
        failure_class="provider_timeout",
    )
    before = _digest(database)

    assert (
        pipeline_main(
            ["--db", str(database), "research-resume", str(pending), "--dry-run"],
            canonical=True,
        )
        == 0
    )
    assert (
        pipeline_main(
            ["--db", str(database), "research-retry", str(retryable), "--dry-run"],
            canonical=True,
        )
        == 0
    )
    assert _digest(database) == before
    output = capsys.readouterr().out
    assert "Operation: research-resume" in output
    assert "Operation: research-retry" in output


def test_legacy_and_canonical_run_status_aliases_match(tmp_path, capsys):
    database = tmp_path / "runs.db"
    with connect(database) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    run_id = create_pipeline_run(
        database,
        run_type="test",
        item_keys=("one",),
        work_key="test:v1",
        selector={},
        config={},
        requested_item_count=1,
    )
    pipeline_main(["--db", str(database), "pipeline-run-status", str(run_id)])
    legacy = capsys.readouterr().out
    pipeline_main(["--db", str(database), "run-status", str(run_id)], canonical=True)
    canonical = capsys.readouterr().out
    assert legacy == canonical


def test_catalog_funnel_and_coverage_are_read_only_and_report_blocks(tmp_path):
    database = _operator_db(tmp_path)
    before = _digest(database)
    status = catalog_status(database)
    funnel = funnel_report(database)
    coverage = coverage_report(database)
    after = _digest(database)

    assert before == after
    assert status["catalog"] == {
        "raw_candidate_rows": 2,
        "seeded_public_rows": 2,
        "total": 2,
        "published": 1,
        "unpublished": 1,
        "publication_threshold": 70.0,
    }
    assert status["readiness"]["score_at_or_above_threshold_but_unpublished"] == 1
    assert status["readiness"]["block_reasons"] == {
        "score_or_product_policy_rejected": 1
    }
    assert funnel["stages"]["published"] == 1
    assert coverage["completeness"] == {
        "published": 1,
        "price_complete": 1,
        "discovery_area_complete": 1,
        "map_ready": 1,
    }


def test_operator_summary_schema_and_dry_run_semantics(tmp_path):
    summary = operator_summary(
        "seed",
        status="planned",
        dry_run=True,
        counts={"selected": 3},
        canonical_db=tmp_path / "catalog.db",
        external_requests=0,
        mutations="planned",
    )
    assert summary["operation_version"] == "operator-summary-v1"
    assert summary["mode"] == "dry_run"
    assert summary["safety"]["dry_run"] is True
    assert summary["safety"]["external_requests"] == 0
    assert set(summary["counts"]) == set(COUNT_FIELDS)
    json.dumps(summary)


def test_catalog_status_cli_writes_envelope_without_database_mutation(
    tmp_path, capsys
):
    database = _operator_db(tmp_path)
    output = tmp_path / "catalog-status.json"
    before = _digest(database)
    started = time.perf_counter()
    exit_code = pipeline_main(
        [
            "--db",
            str(database),
            "catalog-status",
            "--summary-out",
            str(output),
        ],
        canonical=True,
    )
    elapsed = time.perf_counter() - started
    payload = json.loads(output.read_text(encoding="utf-8"))

    assert exit_code == 0
    assert elapsed < 1
    assert _digest(database) == before
    assert payload["operation"] == "catalog-status"
    assert payload["safety"] == {
        "canonical_db": str(database),
        "dry_run": False,
        "external_requests": 0,
        "mutations": 0,
    }
    assert "published: 1" in capsys.readouterr().out


def test_backup_is_integrity_checked_non_overwriting_and_source_safe(tmp_path):
    database = _operator_db(tmp_path)
    backup = tmp_path / "backups" / "operator.db"
    before = _digest(database)

    report = create_sqlite_backup(database, backup)

    assert _digest(database) == before
    assert report["integrity"] == "ok"
    assert report["sha256"] == _digest(backup)
    with pytest.raises(FileExistsError, match="already exists"):
        create_sqlite_backup(database, backup)
