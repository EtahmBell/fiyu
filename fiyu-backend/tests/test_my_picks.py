from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Lock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api, my_pick_processor, my_picks, pipeline_cli
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION


@pytest.fixture
def catalog(tmp_path):
    path = tmp_path / "my-picks.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(path)
    my_picks.ensure_my_pick_schema(path)
    return path


def add_canonical(
    path,
    place_id: str,
    *,
    score: float = 65,
    published: bool = False,
    latitude: float | None = 35.68,
    longitude: float | None = 139.75,
    map_ready: bool = True,
    product_eligible: bool = True,
    research_status: str = "complete",
    score_version: str = QUALITY_PRODUCTION_SCORE_VERSION,
    precision: str = "exact",
):
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants(
                place_id, name_en, primary_category, latitude, longitude,
                map_display_eligible, map_location_precision, product_eligible,
                fiyu_score, score_version, research_status, is_published,
                created_at, updated_at
            ) VALUES (?, ?, 'izakaya', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'now', 'now')
            """,
            (
                place_id,
                f"Restaurant {place_id}",
                latitude,
                longitude,
                int(map_ready),
                precision,
                int(product_eligible),
                score,
                score_version,
                research_status,
                int(published),
            ),
        )
        connection.commit()


def test_existing_published_current_score_is_ready_without_worker(catalog):
    add_canonical(catalog, "published", score=82, published=True)
    work, created = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="published"
    )

    assert created is True
    assert work["status"] == "ready"
    assert work["attempt_count"] == 0
    assert work["provider_request_count"] == 0
    result = my_picks.canonical_result(catalog, work)
    assert result["fiyu_score"] == 82
    assert result["score_version"] == QUALITY_PRODUCTION_SCORE_VERSION
    assert result["is_public"] is True
    assert result["recommendation_review_status"] == "not_eligible"


def test_unknown_identity_is_durable_without_seed_floor_or_provider_call(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google_places",
        external_place_id="brand-new",
        display_name_hint="Brand New",
    )

    assert work["status"] == "pending"
    assert work["provider_request_count"] == 0
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM public_restaurants WHERE place_id='brand-new'"
        ).fetchone()[0] == 0


def test_low_score_is_private_ready_result_and_not_reviewed(catalog):
    add_canonical(catalog, "low", score=48)
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="low"
    )

    assert work["status"] == "ready"
    assert my_picks.canonical_result(catalog, work)["fiyu_score"] == 48
    assert my_picks.recommendation_review_count(catalog, "low") == 0


def test_strong_unpublished_result_queues_once_and_never_publishes(catalog):
    add_canonical(catalog, "strong", score=76)
    first, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="strong"
    )
    second, created = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="strong"
    )

    assert created is False
    assert first["id"] == second["id"]
    assert my_picks.recommendation_review_count(catalog, "strong") == 1
    assert my_picks.canonical_result(catalog, second)["recommendation_review_status"] == "pending"
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT submission_count FROM my_pick_recommendation_reviews "
            "WHERE canonical_place_id='strong'"
        ).fetchone()[0] == 2
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id='strong'"
        ).fetchone()[0] == 0


def test_concurrent_duplicate_creates_one_shared_job(catalog):
    def submit(_index):
        return my_picks.create_or_get_canonical_work(
            catalog, provider="google_places", external_place_id="concurrent"
        )[0]["id"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        work_ids = list(pool.map(submit, range(8)))

    assert len(set(work_ids)) == 1
    with connect(catalog) as connection:
        row = connection.execute(
            "SELECT COUNT(*) AS count, MAX(provider_request_count) AS requests "
            "FROM my_pick_canonical_work"
        ).fetchone()
    assert row["count"] == 1
    assert row["requests"] == 0


def test_location_and_coverage_states_use_canonical_map_evidence(catalog):
    add_canonical(catalog, "outside", score=75, latitude=34.6, longitude=135.5)
    add_canonical(
        catalog, "unresolved", score=75, latitude=None, longitude=None, map_ready=False
    )
    add_canonical(catalog, "area", score=75, precision="area")

    outside, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="outside"
    )
    unresolved, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="unresolved"
    )
    area, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="area"
    )

    assert outside["status"] == "outside_coverage"
    assert my_picks.canonical_result(catalog, outside)["map_ready"] is False
    assert unresolved["status"] == "needs_location"
    unresolved_result = my_picks.canonical_result(catalog, unresolved)
    assert unresolved_result["latitude"] is None
    assert unresolved_result["longitude"] is None
    assert area["status"] == "ready"
    assert my_picks.canonical_result(catalog, area)["map_ready"] is True


def test_stale_known_restaurant_reuses_identity_and_requires_research(catalog):
    add_canonical(catalog, "stale", research_status="pending", score_version="old-v3")
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="stale"
    )

    assert work["canonical_place_id"] == "stale"
    assert work["status"] == "researching"
    assert my_picks.canonical_result(catalog, work)["fiyu_score"] is None


def test_mocked_canonical_worker_returns_low_score_without_parallel_scoring(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="new-1"
    )

    def canonical_pipeline(job):
        assert job["id"] == work["id"]
        add_canonical(catalog, "resolved-low", score=41)
        return "resolved-low"

    counts = my_picks.run_my_pick_worker(
        catalog, processor=canonical_pipeline, worker_id="test-worker"
    )

    assert counts == {"completed": 1, "failed": 0}
    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == "ready"
    assert my_picks.canonical_result(catalog, completed)["fiyu_score"] == 41


def test_worker_failure_is_retryable_and_polling_does_not_retry(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="temporary-failure"
    )
    calls = 0

    def unavailable(_job):
        nonlocal calls
        calls += 1
        raise TimeoutError("provider unavailable")

    assert my_picks.run_my_pick_worker(
        catalog, processor=unavailable, worker_id="test-worker"
    ) == {"completed": 0, "failed": 1}
    failed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert failed["status"] == "failed_retryable"
    assert failed["retryable"] == 1
    assert calls == 1
    assert my_picks.get_canonical_work(catalog, str(work["id"]))["status"] == (
        "failed_retryable"
    )
    assert calls == 1


def test_retryable_worker_job_succeeds_without_duplicate_shared_work(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="retry-once"
    )

    def unavailable(_job):
        raise TimeoutError("temporary provider failure")

    my_picks.run_my_pick_worker(
        catalog, processor=unavailable, worker_id="first-attempt"
    )

    def succeeds(_job):
        add_canonical(catalog, "retry-result", score=58)
        return "retry-result"

    result = my_picks.run_my_pick_worker(
        catalog,
        processor=succeeds,
        worker_id="second-attempt",
        retry_failed=True,
        detailed=True,
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == "ready"
    assert completed["attempt_count"] == 2
    assert result["ready"] == 1
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM my_pick_canonical_work"
        ).fetchone()[0] == 1


def test_worker_cli_dry_run_is_read_only(catalog, capsys):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="cli-dry-run"
    )

    assert pipeline_cli.main(
        [
            "--db",
            str(catalog),
            "my-picks-worker",
            "--work-id",
            str(work["id"]),
            "--osm-index",
            "unused.sqlite",
            "--dry-run",
        ],
        canonical=True,
    ) == 0

    output = json.loads(capsys.readouterr().out)
    assert output["jobs_selected"] == 1
    assert output["provider_requests"] == 0
    assert output["catalog_mutations"] == 0
    assert my_picks.get_canonical_work(catalog, str(work["id"]))["attempt_count"] == 0
    assert my_picks.get_canonical_work(catalog, str(work["id"]))["status"] == "pending"


def test_unresolved_canonical_result_never_exposes_internal_identifiers(catalog):
    external_id = "ChIJ-provider-RUyUK4yYI8QE"
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=external_id
    )
    place_id, _ = my_pick_processor.ensure_my_pick_candidate(
        catalog,
        provider="google",
        external_place_id=external_id,
        display_name_hint=None,
    )
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE public_restaurants SET name_en=?, name_ja=? WHERE place_id=?",
            (external_id, str(work["id"]), place_id),
        )
        connection.execute(
            "UPDATE my_pick_canonical_work SET canonical_place_id=? WHERE id=?",
            (place_id, work["id"]),
        )
        connection.commit()

    unresolved = my_picks.canonical_result(
        catalog, my_picks.get_canonical_work(catalog, str(work["id"]))
    )

    assert unresolved["name_en"] is None
    assert unresolved["name_ja"] is None
    assert external_id not in {unresolved["name_en"], unresolved["name_ja"]}
    assert str(work["id"]) not in {unresolved["name_en"], unresolved["name_ja"]}

    with connect(catalog) as connection:
        connection.execute(
            "UPDATE public_restaurants SET name_en='Resolved Izakaya' WHERE place_id=?",
            (place_id,),
        )
        connection.commit()
    resolved = my_picks.canonical_result(
        catalog, my_picks.get_canonical_work(catalog, str(work["id"]))
    )
    assert resolved["name_en"] == "Resolved Izakaya"


def test_missing_research_provider_is_a_safe_retryable_failure(catalog, monkeypatch):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="provider-unconfigured"
    )

    def unavailable(*_args, **_kwargs):
        raise RuntimeError("OPENAI_API_KEY is missing; private-detail-must-not-leak")

    monkeypatch.setattr(my_pick_processor, "run_research_batch", unavailable)
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused-before-location.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="provider-test", detailed=True
    )
    failed = my_picks.get_canonical_work(catalog, str(work["id"]))

    assert summary["failed_retryable"] == 1
    assert failed["status"] == "failed_retryable"
    assert failed["failure_code"] == "research_provider_unconfigured"
    assert "private-detail" not in json.dumps(failed)


def test_unstructured_worker_failure_is_normalized_before_storage(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="unsafe-failure"
    )

    class UnsafeFailure(RuntimeError):
        code = "provider payload: private diagnostic"

    def fails(_job):
        raise UnsafeFailure("raw secret")

    my_picks.run_my_pick_worker(catalog, processor=fails, worker_id="safe-failure")
    failed = my_picks.get_canonical_work(catalog, str(work["id"]))

    assert failed["failure_code"] == "processing_error"


@pytest.mark.parametrize(
    ("score", "precision", "expected_reviews"),
    [(43.0, "exact", 0), (74.0, "area", 1)],
)
def test_production_processor_reuses_canonical_stages_without_publishing(
    catalog, monkeypatch, score, precision, expected_reviews
):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id=f"new-{int(score)}",
        display_name_hint="Provider hint only",
    )
    calls = {"research": 0, "location": 0, "quality": 0, "promotion": 0}

    def research(db_path, **_kwargs):
        calls["research"] += 1
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants
                SET name_en='Independent canonical name', research_status='complete',
                    evidence_json='{"matched_restaurant":true,"identity_confidence":0.95}',
                    product_eligible=1, review_status='ready'
                WHERE place_id=?
                """,
                (f"new-{int(score)}",),
            )
            connection.commit()
        return {"completed": 1, "responses_requests": 1, "web_search_actions": 2}

    def locate(db_path, place_id, **_kwargs):
        calls["location"] += 1
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants
                SET latitude=35.68, longitude=139.75, map_display_eligible=1,
                    map_location_precision=? WHERE place_id=?
                """,
                (precision, place_id),
            )
            connection.commit()
        return {"cost": {"address_fallback_responses_requests": 0}}

    def quality(db_path, *, place_id, **_kwargs):
        calls["quality"] += 1
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants SET fiyu_score=?, score_version=?
                WHERE place_id=?
                """,
                (score, QUALITY_PRODUCTION_SCORE_VERSION, place_id),
            )
            connection.commit()
        return {"completed": 1, "responses_requests": 1, "web_search_actions": 1}

    def promote(db_path, *, place_ids):
        calls["promotion"] += 1
        with connect(db_path) as connection:
            assert connection.execute(
                "SELECT is_published FROM public_restaurants WHERE place_id=?",
                (place_ids[0],),
            ).fetchone()[0] == 0
        return {"promoted": 1}

    monkeypatch.setattr(my_pick_processor, "run_research_batch", research)
    monkeypatch.setattr(my_pick_processor, "verify_location", locate)
    monkeypatch.setattr(my_pick_processor, "run_quality_v4_backfill", quality)
    monkeypatch.setattr(my_pick_processor, "promote_quality_v4_allowlist", promote)
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused-in-mocked-test.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog,
        processor=processor,
        worker_id="actual-adapter-test",
        detailed=True,
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == "ready"
    assert my_picks.canonical_result(catalog, completed)["fiyu_score"] == score
    assert summary["provider_requests"] == 2
    assert summary["web_search_actions"] == 3
    assert summary["review_queue_additions"] == expected_reviews
    assert calls == {"research": 1, "location": 1, "quality": 1, "promotion": 1}
    with connect(catalog) as connection:
        candidate = connection.execute(
            "SELECT rating, review_count, candidate_eligible, source_files_json "
            "FROM restaurants WHERE place_id=?",
            (f"new-{int(score)}",),
        ).fetchone()
        assert tuple(candidate[:3]) == (0.0, 0, 0)
        assert candidate["source_files_json"] == '["my_pick:google"]'
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id=?",
            (f"new-{int(score)}",),
        ).fetchone()[0] == 0


@pytest.mark.parametrize(
    ("coordinates", "expected_status", "quality_calls"),
    [(None, "needs_location", 1), ((34.69, 135.50), "outside_coverage", 0)],
)
def test_production_processor_preserves_unresolved_and_outside_location_states(
    catalog, monkeypatch, coordinates, expected_status, quality_calls
):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=f"location-{expected_status}"
    )

    def research(db_path, **_kwargs):
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants SET research_status='complete',
                    evidence_json='{"matched_restaurant":true,"identity_confidence":0.9}',
                    product_eligible=1, review_status='ready'
                WHERE place_id=?
                """,
                (f"location-{expected_status}",),
            )
            connection.commit()
        return {"completed": 1}

    def locate(db_path, place_id, **_kwargs):
        if coordinates is not None:
            with connect(db_path) as connection:
                connection.execute(
                    """
                    UPDATE public_restaurants SET latitude=?, longitude=?,
                        map_display_eligible=1, map_location_precision='exact'
                    WHERE place_id=?
                    """,
                    (*coordinates, place_id),
                )
                connection.commit()
        return {"cost": {}}

    quality_count = 0

    def quality(db_path, *, place_id, **_kwargs):
        nonlocal quality_count
        quality_count += 1
        with connect(db_path) as connection:
            connection.execute(
                "UPDATE public_restaurants SET fiyu_score=62, score_version=? "
                "WHERE place_id=?",
                (QUALITY_PRODUCTION_SCORE_VERSION, place_id),
            )
            connection.commit()
        return {"completed": 1}

    monkeypatch.setattr(my_pick_processor, "run_research_batch", research)
    monkeypatch.setattr(my_pick_processor, "verify_location", locate)
    monkeypatch.setattr(my_pick_processor, "run_quality_v4_backfill", quality)
    monkeypatch.setattr(
        my_pick_processor, "promote_quality_v4_allowlist", lambda *_args, **_kwargs: {}
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused-in-mocked-test.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="location-test", detailed=True
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == expected_status
    assert summary[expected_status] == 1
    assert quality_count == quality_calls
    if expected_status == "needs_location":
        result = my_picks.canonical_result(catalog, completed)
        assert result["latitude"] is None
        assert result["longitude"] is None


def test_ready_unpublished_my_pick_is_an_independent_personal_map_relationship(
    catalog, monkeypatch
):
    add_canonical(catalog, "private-map-pick", score=64, published=False)
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="private-map-pick"
    )
    monkeypatch.setattr(api, "DB_PATH", catalog)
    monkeypatch.setattr(
        api.shared_user_data,
        "list_my_picks",
        lambda *, user_id: [{"canonical_work_id": work["id"]}],
    )
    monkeypatch.setattr(api.shared_user_data, "get_active_daily_picks", lambda **_kwargs: None)
    monkeypatch.setattr(api.shared_user_data, "get_recent_daily_pick_rounds", lambda **_kwargs: [])
    monkeypatch.setattr(api.shared_user_data, "latest_visit_ratings", lambda **_kwargs: {})
    monkeypatch.setattr(
        api.shared_user_data,
        "saved_place_ids",
        lambda **_kwargs: {"private-map-pick"},
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "visited_place_ids",
        lambda **_kwargs: ["private-map-pick"],
    )
    monkeypatch.setattr(api, "_together_discovery_assignments", lambda *_args: [])

    rows = api._authenticated_map_restaurants("account-a")

    assert [row["place_id"] for row in rows] == ["private-map-pick"]
    assert rows[0]["is_my_pick"] is True
    assert rows[0]["is_saved"] is True
    assert rows[0]["is_visited"] is True
    assert rows[0]["is_discovered"] is False

@pytest.fixture
def my_pick_api(catalog, monkeypatch):
    user_ids = {"token-a": str(uuid4()), "token-b": str(uuid4())}
    rows: dict[tuple[str, str, str], dict[str, object]] = {}

    def authenticate(header):
        token = (header or "").removeprefix("Bearer ")
        if token not in user_ids:
            raise api.SupabaseAuthError("invalid")
        return {"id": user_ids[token]}

    quota_lock = Lock()

    def quota(*, user_id):
        now = datetime.now(UTC)
        recent = sorted(
            datetime.fromisoformat(str(row["created_at"]))
            for key, row in rows.items()
            if key[0] == user_id
            and datetime.fromisoformat(str(row["created_at"])) >= now - timedelta(hours=24)
        )
        used = len(recent)
        return {
            "limit": 3,
            "used": used,
            "remaining": max(3 - used, 0),
            "window_hours": 24,
            "next_available_at": (
                (recent[0] + timedelta(hours=24)).isoformat() if used >= 3 else None
            ),
        }

    def create_or_get(*, user_id, provider, external_place_id, display_name_hint, canonical_work_id):
        with quota_lock:
            key = (user_id, provider, external_place_id)
            reused = key in rows
            if not reused:
                current_quota = quota(user_id=user_id)
                if current_quota["remaining"] == 0:
                    raise api.shared_user_data.MyPickQuotaExceeded(current_quota)
                now = datetime.now(UTC).isoformat()
                rows[key] = {
                    "id": str(uuid4()),
                    "user_id": user_id,
                    "provider": provider,
                    "external_place_id": external_place_id,
                    "display_name_hint": display_name_hint,
                    "canonical_work_id": canonical_work_id,
                    "status": "pending",
                    "created_at": now,
                    "updated_at": now,
                }
            return {**rows[key], "reused": reused}

    def list_rows(*, user_id):
        return [dict(row) for key, row in rows.items() if key[0] == user_id]

    def get_row(*, user_id, my_pick_id):
        return next(
            (
                dict(row)
                for key, row in rows.items()
                if key[0] == user_id and row["id"] == my_pick_id
            ),
            None,
        )

    def sync(**values):
        changed = 0
        for row in rows.values():
            if row["canonical_work_id"] == values["canonical_work_id"]:
                row.update(values)
                changed += 1
        return changed

    monkeypatch.setattr(api, "DB_PATH", catalog)
    monkeypatch.setattr(api, "authenticated_supabase_user", authenticate)
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: True)
    monkeypatch.setattr(api.shared_user_data, "create_or_get_my_pick", create_or_get)
    monkeypatch.setattr(api.shared_user_data, "list_my_picks", list_rows)
    monkeypatch.setattr(api.shared_user_data, "get_my_pick", get_row)
    monkeypatch.setattr(api.shared_user_data, "get_my_pick_quota", quota)
    monkeypatch.setattr(api.shared_user_data, "sync_my_pick_result", sync)
    return TestClient(api.app), user_ids, rows


def test_api_auth_ownership_idempotency_and_shared_work(my_pick_api):
    client, _user_ids, rows = my_pick_api
    payload = {
        "provider": "google_places",
        "external_place_id": "new-shared",
        "display_name_hint": "Shared",
    }
    assert client.post("/my-picks", json=payload).status_code == 401

    first = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-a"}
    )
    repeated = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-a"}
    )
    other = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-b"}
    )

    assert first.status_code == repeated.status_code == other.status_code == 202
    assert first.json()["my_pick_id"] == repeated.json()["my_pick_id"]
    assert first.json()["my_pick_id"] != other.json()["my_pick_id"]
    assert len(rows) == 2
    with connect(api.DB_PATH) as connection:
        work_rows = connection.execute(
            "SELECT submission_count, provider_request_count FROM my_pick_canonical_work"
        ).fetchall()
    assert [(row["submission_count"], row["provider_request_count"]) for row in work_rows] == [
        (2, 0)
    ]

    other_read = client.get(
        f"/my-picks/{first.json()['my_pick_id']}",
        headers={"Authorization": "Bearer token-b"},
    )
    assert other_read.status_code == 404
    own_list = client.get("/my-picks", headers={"Authorization": "Bearer token-a"})
    assert own_list.status_code == 200
    assert [row["my_pick_id"] for row in own_list.json()] == [first.json()["my_pick_id"]]


def test_shared_worker_completion_projects_to_both_waiting_users(my_pick_api):
    client, _user_ids, rows = my_pick_api
    payload = {"provider": "google", "external_place_id": "two-user-new"}
    first = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-a"}
    )
    second = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-b"}
    )
    assert first.status_code == second.status_code == 202

    def canonical_pipeline(_job):
        add_canonical(api.DB_PATH, "two-user-result", score=59)
        return "two-user-result"

    result = my_picks.run_my_pick_worker(
        api.DB_PATH,
        processor=canonical_pipeline,
        worker_id="shared-projection",
        on_update=api._sync_my_pick_projection,
        detailed=True,
    )

    assert result["ready"] == 1
    assert len(rows) == 2
    assert {row["status"] for row in rows.values()} == {"ready"}
    assert {row["canonical_place_id"] for row in rows.values()} == {
        "two-user-result"
    }


def test_api_rejects_user_controlled_canonical_fields(my_pick_api):
    client, _users, _rows = my_pick_api
    response = client.post(
        "/my-picks",
        json={
            "provider": "google_places",
            "external_place_id": "unsafe",
            "latitude": 35.0,
            "fiyu_score": 99,
            "is_published": True,
        },
        headers={"Authorization": "Bearer token-a"},
    )
    assert response.status_code == 422


def test_api_enforces_three_distinct_my_picks_per_rolling_day(my_pick_api):
    client, _users, _rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    responses = [
        client.post(
            "/my-picks",
            json={"provider": "google", "external_place_id": f"quota-{index}"},
            headers=headers,
        )
        for index in range(4)
    ]

    assert [response.status_code for response in responses] == [202, 202, 202, 429]
    detail = responses[-1].json()["detail"]
    assert detail["code"] == "my_pick_quota_exhausted"
    assert detail["quota"]["remaining"] == 0
    assert detail["quota"]["next_available_at"] is not None


def test_same_my_pick_is_reused_after_quota_is_exhausted(my_pick_api):
    client, _users, _rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    payloads = [
        {"provider": "google", "external_place_id": f"same-safe-{index}"}
        for index in range(3)
    ]
    created = [client.post("/my-picks", json=payload, headers=headers) for payload in payloads]
    repeated = client.post("/my-picks", json=payloads[0], headers=headers)

    assert repeated.status_code == 202
    assert repeated.json()["my_pick_id"] == created[0].json()["my_pick_id"]
    assert client.get("/my-picks/quota", headers=headers).json()["used"] == 3


def test_known_public_restaurant_still_consumes_a_new_account_slot(my_pick_api):
    client, _users, _rows = my_pick_api
    add_canonical(api.DB_PATH, "already-public", score=82, published=True)
    headers = {"Authorization": "Bearer token-a"}

    created = client.post(
        "/my-picks",
        json={"provider": "google", "external_place_id": "already-public"},
        headers=headers,
    )

    assert created.status_code == 202
    assert created.json()["status"] == "ready"
    assert client.get("/my-picks/quota", headers=headers).json()["used"] == 1


def test_retrying_same_durable_failed_pick_does_not_consume_another_slot(my_pick_api):
    client, users, rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    payload = {"provider": "google", "external_place_id": "retry-durable"}
    first = client.post("/my-picks", json=payload, headers=headers)
    key = (users["token-a"], "google", "retry-durable")
    rows[key]["status"] = "failed_retryable"

    retried = client.post("/my-picks", json=payload, headers=headers)

    assert retried.status_code == 202
    assert retried.json()["my_pick_id"] == first.json()["my_pick_id"]
    assert client.get("/my-picks/quota", headers=headers).json()["used"] == 1


def test_rolling_quota_restores_a_slot_after_twenty_four_hours(my_pick_api):
    client, user_ids, rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    for index in range(3):
        assert client.post(
            "/my-picks",
            json={"provider": "google", "external_place_id": f"rolling-{index}"},
            headers=headers,
        ).status_code == 202
    rows[(user_ids["token-a"], "google", "rolling-0")]["created_at"] = (
        datetime.now(UTC) - timedelta(hours=24, seconds=1)
    ).isoformat()

    quota = client.get("/my-picks/quota", headers=headers)
    fourth = client.post(
        "/my-picks",
        json={"provider": "google", "external_place_id": "rolling-3"},
        headers=headers,
    )
    assert quota.json() == {
        "limit": 3, "used": 2, "remaining": 1, "window_hours": 24,
        "next_available_at": None,
    }
    assert fourth.status_code == 202


def test_quota_endpoint_is_authenticated_and_account_scoped(my_pick_api):
    client, _users, _rows = my_pick_api
    assert client.get("/my-picks/quota").status_code == 401
    client.post(
        "/my-picks",
        json={"provider": "google", "external_place_id": "owned-quota"},
        headers={"Authorization": "Bearer token-a"},
    )
    assert client.get(
        "/my-picks/quota", headers={"Authorization": "Bearer token-a"}
    ).json()["used"] == 1
    assert client.get(
        "/my-picks/quota", headers={"Authorization": "Bearer token-b"}
    ).json()["used"] == 0


def test_concurrent_distinct_submissions_cannot_exceed_quota(my_pick_api):
    client, users, rows = my_pick_api

    def submit(index):
        return client.post(
            "/my-picks",
            json={"provider": "google", "external_place_id": f"race-{index}"},
            headers={"Authorization": "Bearer token-a"},
        ).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        statuses = list(pool.map(submit, range(6)))

    assert statuses.count(202) == 3
    assert statuses.count(429) == 3
    assert sum(1 for key in rows if key[0] == users["token-a"]) == 3


def test_migration_has_rls_atomic_idempotency_and_server_side_rate_limit():
    migration = (
        api.BACKEND_ROOT / "supabase/migrations/202610130001_my_picks.sql"
    ).read_text(encoding="utf-8")
    assert "enable row level security" in migration
    assert "auth.uid() = user_id" in migration
    assert "unique (user_id, provider, external_place_id)" in migration
    assert "pg_advisory_xact_lock" in migration
    assert "my_pick_rate_limit" in migration
    assert "grant execute" in migration and "service_role" in migration
    assert "authenticated;" in migration
    quota_migration = (
        api.BACKEND_ROOT / "supabase/migrations/202610180001_my_pick_quota.sql"
    ).read_text(encoding="utf-8")
    assert "interval '24 hours'" in quota_migration
    assert ">= 3" in quota_migration
    assert "my_pick_quota_exhausted" in quota_migration
    assert "get_fiyu_my_pick_quota" in quota_migration
    assert quota_migration.index("existing_pick.id is not null") < quota_migration.index(
        "my_pick_quota_exhausted"
    )
    assert "pg_advisory_xact_lock" in quota_migration
