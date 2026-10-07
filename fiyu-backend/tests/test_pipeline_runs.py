from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from fiyu.database import SCHEMA, connect
from fiyu.pipeline_runs import (
    claim_next_pipeline_item,
    create_pipeline_run,
    ensure_pipeline_run_schema,
    finalize_pipeline_run,
    finish_pipeline_item,
    get_pipeline_run_item,
    get_pipeline_run_status,
    mark_pipeline_item_running,
)
from fiyu.public_catalog import ensure_public_schema


def _ledger_db(tmp_path):
    path = tmp_path / "ledger.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    return path


def _run(path, items=("place-1", "place-2", "place-3"), *, work_key="work:v1"):
    return create_pipeline_run(
        path,
        run_type="test_work",
        item_keys=items,
        work_key=work_key,
        selector={"limit": len(items)},
        config={"version": "v1"},
        requested_item_count=len(items),
    )


def _claim(path, run_id, worker="worker-a", **kwargs):
    return claim_next_pipeline_item(path, run_id, worker_id=worker, **kwargs)


def _succeed(path, claim):
    mark_pipeline_item_running(path, claim["id"], claim["claim_token"])
    finish_pipeline_item(
        path,
        claim["id"],
        claim["claim_token"],
        state="succeeded",
        provider_requests=1,
        web_search_actions=2,
        token_usage={"input_tokens": 3, "output_tokens": 4, "total_tokens": 7},
    )


def test_schema_is_idempotent_and_run_selection_is_immutable(tmp_path):
    path = _ledger_db(tmp_path)
    ensure_pipeline_run_schema(path)
    ensure_pipeline_run_schema(path)
    run_id = _run(path)

    first = get_pipeline_run_status(path, run_id)
    with connect(path) as connection:
        items = connection.execute(
            "SELECT item_key, ordinal FROM pipeline_run_items WHERE run_id=? ORDER BY ordinal",
            (run_id,),
        ).fetchall()
    second = get_pipeline_run_status(path, run_id)

    assert first == second
    assert [(row["item_key"], row["ordinal"]) for row in items] == [
        ("place-1", 1),
        ("place-2", 2),
        ("place-3", 3),
    ]
    assert first["status"] == "pending"
    assert first["selected"] == first["pending"] == 3


def test_duplicate_item_in_frozen_selection_is_rejected(tmp_path):
    path = _ledger_db(tmp_path)
    with pytest.raises(ValueError, match="duplicate item"):
        _run(path, ("same", "same"))


def test_two_workers_never_claim_the_same_item(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, tuple(f"place-{index}" for index in range(25)))
    claims = []
    for index in range(25):
        claim = _claim(path, run_id, worker=f"worker-{index % 2}")
        assert claim is not None
        claims.append(claim)

    assert len({claim["id"] for claim in claims}) == 25
    assert len({claim["claim_token"] for claim in claims}) == 25
    assert _claim(path, run_id, worker="worker-extra") is None


def test_stale_claim_is_reclaimed_and_attempt_history_is_preserved(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    started = datetime(2026, 1, 1, tzinfo=UTC)
    first = _claim(path, run_id, now=started, lease_seconds=10)
    mark_pipeline_item_running(path, first["id"], first["claim_token"], now=started)

    second = _claim(
        path,
        run_id,
        worker="worker-b",
        now=started + timedelta(seconds=11),
        lease_seconds=10,
    )

    assert second["id"] == first["id"]
    assert second["claim_token"] != first["claim_token"]
    assert second["attempt_count"] == 2
    with connect(path) as connection:
        attempts = connection.execute(
            """
            SELECT attempt_number, claim_owner, state, failure_class
            FROM pipeline_run_item_attempts ORDER BY attempt_number
            """
        ).fetchall()
    assert [tuple(row) for row in attempts] == [
        (1, "worker-a", "abandoned", "stale_claim_reclaimed"),
        (2, "worker-b", "claimed", None),
    ]


def test_unexpired_claim_cannot_be_claimed_by_another_worker(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    now = datetime(2026, 1, 1, tzinfo=UTC)
    first = _claim(path, run_id, now=now, lease_seconds=60)
    assert first is not None
    assert _claim(path, run_id, worker="worker-b", now=now + timedelta(seconds=59)) is None


def test_success_updates_item_and_run_usage_aggregates(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    claim = _claim(path, run_id)
    _succeed(path, claim)

    status = finalize_pipeline_run(path, run_id)
    assert status["status"] == "completed"
    assert status["succeeded"] == status["attempts"] == status["provider_requests"] == 1
    assert status["web_search_actions"] == 2
    assert (status["input_tokens"], status["output_tokens"], status["total_tokens"]) == (
        3,
        4,
        7,
    )
    assert _claim(path, run_id) is None


@pytest.mark.parametrize(
    ("state", "retryable"),
    (("failed_retryable", 1), ("failed_terminal", 0)),
)
def test_failure_states_are_durable(tmp_path, state, retryable):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    claim = _claim(path, run_id)
    mark_pipeline_item_running(path, claim["id"], claim["claim_token"])
    finish_pipeline_item(
        path,
        claim["id"],
        claim["claim_token"],
        state=state,
        failure_class="InjectedFailure",
        failure_message="fixture failure",
        provider_requests=1,
    )

    item = get_pipeline_run_item(path, claim["id"])
    status = get_pipeline_run_status(path, run_id)
    assert item["state"] == state
    assert item["retryable"] == retryable
    assert status["status"] == "completed_with_failures"


def test_retry_failed_reuses_original_item_and_preserves_attempt_count(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1", "place-2"))
    first = _claim(path, run_id)
    mark_pipeline_item_running(path, first["id"], first["claim_token"])
    finish_pipeline_item(
        path,
        first["id"],
        first["claim_token"],
        state="failed_retryable",
        failure_class="TimeoutError",
    )
    second = _claim(path, run_id)
    _succeed(path, second)
    assert _claim(path, run_id) is None

    retry = _claim(path, run_id, worker="worker-b", retry_failed=True)
    assert retry["id"] == first["id"]
    assert retry["attempt_count"] == 2
    _succeed(path, retry)
    assert finalize_pipeline_run(path, run_id)["status"] == "completed"
    assert _claim(path, run_id, retry_failed=True) is None


def test_partial_run_resumes_without_reselection(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, tuple(f"place-{index:03}" for index in range(100)))
    completed_ids = []
    for _ in range(40):
        claim = _claim(path, run_id)
        completed_ids.append(claim["item_key"])
        _succeed(path, claim)

    reopened = get_pipeline_run_status(path, run_id)
    assert reopened["selected"] == 100
    assert reopened["succeeded"] == 40
    assert reopened["pending"] == 60
    next_claim = _claim(path, run_id, worker="after-restart")
    assert next_claim["item_key"] == "place-040"
    assert next_claim["item_key"] not in completed_ids


def test_illegal_item_transitions_fail_clearly(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    claim = _claim(path, run_id)
    with pytest.raises(ValueError, match="not owned"):
        mark_pipeline_item_running(path, claim["id"], "wrong-token")
    mark_pipeline_item_running(path, claim["id"], claim["claim_token"])
    with pytest.raises(ValueError, match="invalid terminal"):
        finish_pipeline_item(path, claim["id"], claim["claim_token"], state="pending")
    with pytest.raises(ValueError, match="require a failure class"):
        finish_pipeline_item(path, claim["id"], claim["claim_token"], state="failed_terminal")


def test_active_and_completed_duplicate_work_is_not_bought_twice(tmp_path):
    path = _ledger_db(tmp_path)
    first_run = _run(path, ("place-1",), work_key="standard:v1")
    second_run = _run(path, ("place-1",), work_key="standard:v1")
    first = _claim(path, first_run)
    assert _claim(path, second_run, worker="worker-b") is None

    _succeed(path, first)
    assert _claim(path, second_run, worker="worker-b") is None
    status = get_pipeline_run_status(path, second_run)
    assert status["status"] == "completed"
    assert status["skipped"] == 1
    assert status["attempts"] == status["provider_requests"] == 0


def test_persisted_standard_research_closes_crash_window_without_second_request(tmp_path):
    path = _ledger_db(tmp_path)
    ensure_public_schema(path)
    with connect(path) as connection:
        restaurant = connection.execute(
            """
            INSERT INTO restaurants (
                place_id, title, rating, review_count, source_areas_json,
                score_reasons_json, source_files_json
            ) VALUES ('place-1', 'Fixture', 4.0, 10, '[]', '[]', '[]')
            """
        )
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, source_restaurant_id, research_status, created_at, updated_at
            ) VALUES ('place-1', ?, 'complete', 'now', 'now')
            """,
            (int(restaurant.lastrowid),),
        )
        connection.execute(
            """
            INSERT INTO restaurant_research_runs (
                public_restaurant_id, provider, model, prompt_version, pipeline_version,
                status, is_current, created_at, completed_at
            ) VALUES ('place-1', 'openai', 'model', 'prompt', 'pipeline',
                      'complete', 1, 'now', 'now')
            """
        )
        connection.commit()
    run_id = create_pipeline_run(
        path,
        run_type="standard_restaurant_research",
        item_keys=["place-1"],
        work_key="standard:pipeline:prompt:model",
        selector={"limit": 1},
        config={"model": "model", "prompt_version": "prompt", "pipeline_version": "pipeline"},
        requested_item_count=1,
    )

    assert _claim(path, run_id) is None
    status = get_pipeline_run_status(path, run_id)
    assert status["skipped"] == 1
    assert status["provider_requests"] == 0


def test_claimed_state_survives_process_crash_before_provider_boundary(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    claim = _claim(path, run_id)
    reopened = get_pipeline_run_item(path, claim["id"])
    assert reopened["state"] == "claimed"
    assert reopened["provider_request_count"] == 0


def test_running_state_records_provider_boundary_before_result_persistence(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    claim = _claim(path, run_id)
    mark_pipeline_item_running(
        path,
        claim["id"],
        claim["claim_token"],
        provider_request_started=True,
    )

    reopened = get_pipeline_run_item(path, claim["id"])
    status = get_pipeline_run_status(path, run_id)
    assert reopened["state"] == "running"
    assert reopened["provider_request_count"] == 1
    assert status["provider_requests"] == 1


def test_result_persistence_failure_can_be_recorded_without_losing_run_identity(tmp_path):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    claim = _claim(path, run_id)
    mark_pipeline_item_running(path, claim["id"], claim["claim_token"])
    finish_pipeline_item(
        path,
        claim["id"],
        claim["claim_token"],
        state="failed_terminal",
        failure_class="OperationalError",
        failure_message="injected persistence failure",
        provider_requests=1,
    )
    status = finalize_pipeline_run(path, run_id)
    assert status["run_id"] == run_id
    assert status["failed_terminal"] == status["provider_requests"] == 1


def test_finalization_failure_does_not_erase_completed_item(tmp_path, monkeypatch):
    path = _ledger_db(tmp_path)
    run_id = _run(path, ("place-1",))
    claim = _claim(path, run_id)
    _succeed(path, claim)
    import fiyu.pipeline_runs as ledger

    monkeypatch.setattr(
        ledger,
        "_refresh_run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    with pytest.raises(RuntimeError, match="boom"):
        finalize_pipeline_run(path, run_id)
    assert get_pipeline_run_item(path, claim["id"])["state"] == "succeeded"
