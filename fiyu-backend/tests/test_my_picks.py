from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api, my_picks
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

    assert my_picks.get_canonical_work(catalog, str(work["id"]))["status"] == "failed_retryable"
    assert calls == 1


@pytest.fixture
def my_pick_api(catalog, monkeypatch):
    user_ids = {"token-a": str(uuid4()), "token-b": str(uuid4())}
    rows: dict[tuple[str, str, str], dict[str, object]] = {}

    def authenticate(header):
        token = (header or "").removeprefix("Bearer ")
        if token not in user_ids:
            raise api.SupabaseAuthError("invalid")
        return {"id": user_ids[token]}

    def create_or_get(*, user_id, provider, external_place_id, display_name_hint, canonical_work_id):
        key = (user_id, provider, external_place_id)
        reused = key in rows
        if not reused:
            rows[key] = {
                "id": str(uuid4()),
                "user_id": user_id,
                "provider": provider,
                "external_place_id": external_place_id,
                "display_name_hint": display_name_hint,
                "canonical_work_id": canonical_work_id,
                "status": "pending",
                "created_at": "2026-10-13T00:00:00+00:00",
                "updated_at": "2026-10-13T00:00:00+00:00",
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
