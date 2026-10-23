from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api, my_picks
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.supabase_auth import SupabaseAuthError

DEV_USER = "11111111-1111-4111-8111-111111111111"
NORMAL_USER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture
def developer_api(tmp_path, monkeypatch):
    path = tmp_path / "developer-tools.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(path)
    anchors = api.load_location_anchors()
    ginza = next(row for row in anchors if row["area_name"] == "Ginza")
    shinjuku = next(row for row in anchors if row["area_name"] == "Shinjuku")
    with connect(path) as connection:
        for area, anchor in (("Ginza", ginza), ("Shinjuku", shinjuku)):
            for index in range(12):
                affordable = index == 0
                connection.execute(
                    """
                    INSERT INTO public_restaurants (
                        place_id, name_en, primary_category, food_tags_json,
                        signature_dishes_json, discovery_area, discovery_areas_json,
                        fiyu_score, local_discovery_score, is_published,
                        product_eligible, map_display_eligible, latitude, longitude,
                        map_location_precision, budget_json, created_at, updated_at
                    ) VALUES (?, ?, ?, '[]', '[]', ?, '[]', 75, 75, 1, 1, 1,
                              ?, ?, 'exact', ?, 'now', 'now')
                    """,
                    (
                        f"{area.lower()}-{index}",
                        f"{area} {index}",
                        "sushi" if index < 6 else "ramen",
                        area,
                        float(anchor["latitude"]),
                        float(anchor["longitude"]) + index * 0.0001,
                        json.dumps({
                            "currency": "JPY",
                            "minimum": 1000,
                            "maximum": 3000 if affordable else 7000,
                        }),
                    ),
                )
        connection.commit()

    state = {
        "settings": {},
        "seen": {DEV_USER: {}, NORMAL_USER: {"other": datetime.now(UTC).isoformat()}},
        "active": {DEV_USER: None, NORMAL_USER: {"round_id": "normal-round"}},
        "expired": [],
        "reset": [],
        "visits": {
            DEV_USER: [{"id": "dev-visit", "rating": 5, "private_note": "private"}],
            NORMAL_USER: [{"id": "normal-visit", "rating": 2, "private_note": "other"}],
        },
        "taste": {DEV_USER: [{"milestone": 10}], NORMAL_USER: [{"milestone": 10}]},
        "saved": {DEV_USER: {"saved-place"}, NORMAL_USER: {"other-saved"}},
        "profiles": {DEV_USER: {"username": "dev"}, NORMAL_USER: {"username": "normal"}},
        "visit_taste_reset": [],
        "personalized_pick": {DEV_USER: None, NORMAL_USER: None},
        "planner_visits": {
            DEV_USER: [
                {
                    "place_id": f"ginza-{index}",
                    "rating": 5 if index < 5 else 1,
                }
                for index in range(9)
            ],
            NORMAL_USER: [],
        },
    }

    def authenticate(authorization):
        if authorization == "Bearer dev":
            return {"id": DEV_USER}
        if authorization == "Bearer normal":
            return {"id": NORMAL_USER}
        raise SupabaseAuthError("invalid")

    monkeypatch.setattr(api, "DB_PATH", path)
    monkeypatch.setenv("FIYU_ENABLE_DEV_TOOLS", "true")
    monkeypatch.setenv("FIYU_DEV_USER_IDS", DEV_USER)
    monkeypatch.setattr(api, "authenticated_supabase_user", authenticate)
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: True)
    monkeypatch.setattr(
        api.shared_user_data,
        "get_developer_settings",
        lambda *, user_id: state["settings"].get(
            user_id, {"location_mode": "real", "area_name": None}
        ),
    )

    def set_settings(*, user_id, location_mode, area_name):
        state["settings"][user_id] = {
            "location_mode": location_mode,
            "area_name": area_name,
        }
        return state["settings"][user_id]

    monkeypatch.setattr(api.shared_user_data, "set_developer_settings", set_settings)
    monkeypatch.setattr(
        api.shared_user_data,
        "seen_history",
        lambda *, user_id: dict(state["seen"].get(user_id, {})),
    )
    monkeypatch.setattr(api.shared_user_data, "saved_place_ids", lambda **_kwargs: set())
    monkeypatch.setattr(
        api.shared_user_data,
        "list_visits",
        lambda *, user_id: list(state["planner_visits"].get(user_id, [])),
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "latest_visit_ratings",
        lambda *, user_id: {
            str(visit["place_id"]): int(visit["rating"])
            for visit in state["planner_visits"].get(user_id, [])
        },
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "get_personalized_pick_event",
        lambda *, user_id: state["personalized_pick"].get(user_id),
    )

    def create_personalized_pick(**kwargs):
        existing = state["personalized_pick"].get(kwargs["user_id"])
        if existing is not None:
            return existing
        event = {
            "id": str(uuid4()),
            "user_id": kwargs["user_id"],
            "city_id": kwargs["city_id"],
            "status": "available",
            "created_at": kwargs["created_at"],
            "expires_at": kwargs["expires_at"],
            "dismissed_until": None,
            "dismissal_count": 0,
            "selected_position": None,
            "selected_place_id": None,
            "selected_at": None,
            "active_until": None,
            "selection_metadata": kwargs["selection_metadata"],
            "place_ids": list(kwargs["place_ids"]),
        }
        state["personalized_pick"][kwargs["user_id"]] = event
        return event

    def reset_personalized_pick(*, user_id):
        deleted = int(state["personalized_pick"].get(user_id) is not None)
        state["personalized_pick"][user_id] = None
        return deleted

    def clear_personalized_pick(*, user_id, event_id):
        event = state["personalized_pick"].get(user_id)
        if event is None or event["id"] != event_id:
            return None
        event["dismissed_until"] = None
        return event

    def expire_personalized_pick(*, user_id, event_id, expired_at):
        event = state["personalized_pick"].get(user_id)
        if event is None or event["id"] != event_id:
            return None
        event["expires_at"] = expired_at
        event["active_until"] = expired_at
        return event

    monkeypatch.setattr(
        api.shared_user_data, "create_personalized_pick_event", create_personalized_pick
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "reset_personalized_pick_test_state",
        reset_personalized_pick,
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "clear_personalized_pick_dismissal",
        clear_personalized_pick,
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "expire_personalized_pick_event",
        expire_personalized_pick,
    )

    def expire(*, user_id, city_id, expired_at):
        state["expired"].append((user_id, city_id, expired_at))
        existed = state["active"].get(user_id) is not None
        state["active"][user_id] = None
        return int(existed)

    monkeypatch.setattr(api.shared_user_data, "expire_active_daily_picks", expire)

    def assign(*, user_id, city_id, place_ids, assigned_at, expires_at, selection_metadata):
        active = state["active"].get(user_id)
        if active:
            return active
        row = {
            "round_id": f"dev-round-{len(state['expired'])}",
            "assigned_at": assigned_at,
            "expires_at": expires_at,
            "revealed_at": None,
            "selection_metadata": selection_metadata,
            "place_ids": place_ids,
        }
        state["active"][user_id] = row
        for place_id in place_ids:
            state["seen"].setdefault(user_id, {})[place_id] = assigned_at
        return row

    monkeypatch.setattr(api.shared_user_data, "assign_or_get_active_daily_picks", assign)

    def reset(*, user_id, city_id):
        state["reset"].append((user_id, city_id))
        deleted_rounds = int(state["active"].get(user_id) is not None)
        deleted_seen = len(state["seen"].get(user_id, {}))
        state["active"][user_id] = None
        state["seen"][user_id] = {}
        return {"deleted_rounds": deleted_rounds, "deleted_seen": deleted_seen}

    monkeypatch.setattr(api.shared_user_data, "reset_daily_pick_test_state", reset)

    def reset_visit_taste(*, user_id):
        state["visit_taste_reset"].append(user_id)
        deleted_visits = len(state["visits"].get(user_id, []))
        deleted_taste_snapshots = len(state["taste"].get(user_id, []))
        state["visits"][user_id] = []
        state["taste"][user_id] = []
        return {
            "deleted_visits": deleted_visits,
            "deleted_taste_snapshots": deleted_taste_snapshots,
        }

    monkeypatch.setattr(
        api.shared_user_data, "reset_visit_taste_test_data", reset_visit_taste
    )
    return TestClient(api.app), state


def test_developer_status_requires_auth_flag_and_allowlist(developer_api, monkeypatch):
    client, _state = developer_api
    assert client.get("/developer/status").status_code == 401
    assert client.get("/developer/status", headers={"Authorization": "Bearer normal"}).status_code == 404

    monkeypatch.setenv("FIYU_ENABLE_DEV_TOOLS", "false")
    assert client.get("/developer/status", headers={"Authorization": "Bearer dev"}).status_code == 404
    monkeypatch.setenv("FIYU_ENABLE_DEV_TOOLS", "true")

    response = client.get("/developer/status", headers={"Authorization": "Bearer dev"})
    assert response.status_code == 200
    assert response.json()["enabled"] is True
    assert response.json()["authorized"] is True
    assert any(row["area_name"] == "Kichijoji" for row in response.json()["location_options"])


def test_location_override_is_canonical_and_account_owned(developer_api):
    client, state = developer_api
    response = client.post(
        "/developer/location-override",
        headers={"Authorization": "Bearer dev"},
        json={"location_mode": "area", "area_name": "Ginza"},
    )
    assert response.status_code == 200
    assert state["settings"] == {DEV_USER: {"location_mode": "area", "area_name": "Ginza"}}

    forbidden_authority = client.post(
        "/developer/location-override",
        headers={"Authorization": "Bearer dev"},
        json={"location_mode": "area", "area_name": "Shinjuku", "user_id": NORMAL_USER},
    )
    assert forbidden_authority.status_code == 422
    assert NORMAL_USER not in state["settings"]

    response = client.post(
        "/developer/location-override",
        headers={"Authorization": "Bearer dev"},
        json={"location_mode": "real"},
    )
    assert response.status_code == 200
    assert state["settings"][DEV_USER] == {"location_mode": "real", "area_name": None}


def test_generation_uses_real_selector_affordable_rule_and_persists(developer_api):
    client, state = developer_api
    state["settings"][DEV_USER] = {"location_mode": "area", "area_name": "Ginza"}
    state["active"][DEV_USER] = {"round_id": "old"}

    response = client.post(
        "/developer/daily-picks/generate",
        headers={"Authorization": "Bearer dev"},
        json={"seed": 7},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["diagnostics"]["effective_location_source"] == "DEV_OVERRIDE"
    assert body["diagnostics"]["effective_area"] == "Ginza"
    assert body["diagnostics"]["affordable_slot_satisfied"] is True
    assert len(body["assignment"]["place_ids"]) == 3
    assert body["assignment"]["revealed_place_ids"] == []
    assert body["assignment"]["revealed_at"] is None
    assert any(place_id == "ginza-0" for place_id in body["assignment"]["place_ids"])
    assert state["active"][DEV_USER]["selection_metadata"]["is_dev_generated"] is True
    assert state["active"][NORMAL_USER] == {"round_id": "normal-round"}

    restored = state["active"][DEV_USER]
    assert restored["place_ids"] == body["assignment"]["place_ids"]


def test_repeated_generation_keeps_real_seen_and_cooldown_semantics(developer_api):
    client, state = developer_api
    state["settings"][DEV_USER] = {"location_mode": "area", "area_name": "Shinjuku"}
    first = client.post(
        "/developer/daily-picks/generate",
        headers={"Authorization": "Bearer dev"},
        json={"seed": 1},
    ).json()["assignment"]["place_ids"]
    second = client.post(
        "/developer/daily-picks/generate",
        headers={"Authorization": "Bearer dev"},
        json={"seed": 2},
    ).json()["assignment"]["place_ids"]
    assert set(first).isdisjoint(second)
    assert len(state["seen"][DEV_USER]) == 6


def test_outside_tokyo_requires_preview_then_uses_preview_area(developer_api):
    client, state = developer_api
    state["settings"][DEV_USER] = {"location_mode": "outside_tokyo", "area_name": None}
    blocked = client.post(
        "/developer/daily-picks/generate",
        headers={"Authorization": "Bearer dev"},
        json={},
    )
    assert blocked.status_code == 422
    assert blocked.json()["detail"]["code"] == "location_outside_service_area"
    assert state["expired"] == []

    generated = client.post(
        "/developer/daily-picks/generate",
        headers={"Authorization": "Bearer dev"},
        json={"preview_area": "Shinjuku", "seed": 4},
    )
    assert generated.status_code == 200
    assert generated.json()["diagnostics"]["effective_location_source"] == "PREVIEW_AREA"
    assert generated.json()["assignment"]["discovery_mode"] == "preview"


def test_real_device_mode_uses_fresh_browser_coordinates(developer_api):
    client, state = developer_api
    state["settings"][DEV_USER] = {"location_mode": "real", "area_name": None}

    missing = client.post(
        "/developer/daily-picks/generate",
        headers={"Authorization": "Bearer dev"},
        json={},
    )
    assert missing.status_code == 422
    assert missing.json()["detail"]["code"] == "fresh_location_required"

    generated = client.post(
        "/developer/daily-picks/generate",
        headers={"Authorization": "Bearer dev"},
        json={"current_latitude": 35.6717, "current_longitude": 139.7650, "seed": 9},
    )
    assert generated.status_code == 200
    assert generated.json()["diagnostics"]["effective_location_source"] == "LIVE_GPS"
    assert generated.json()["diagnostics"]["effective_area"] == "Ginza"


def test_reset_is_minimal_and_cannot_touch_another_account(developer_api):
    client, state = developer_api
    state["active"][DEV_USER] = {"round_id": "dev"}
    state["seen"][DEV_USER] = {"one": datetime.now(UTC).isoformat()}
    normal_before = (state["active"][NORMAL_USER].copy(), state["seen"][NORMAL_USER].copy())

    response = client.post(
        "/developer/daily-picks/reset",
        headers={"Authorization": "Bearer dev"},
    )
    assert response.status_code == 200
    assert response.json() == {"reset": True, "deleted_rounds": 1, "deleted_seen": 1}
    assert state["active"][DEV_USER] is None
    assert state["seen"][DEV_USER] == {}
    assert (state["active"][NORMAL_USER], state["seen"][NORMAL_USER]) == normal_before
    assert state["reset"] == [(DEV_USER, "tokyo")]


def test_visit_taste_reset_is_account_owned_and_preserves_other_state(developer_api):
    client, state = developer_api
    preserved = {
        "saved": {key: set(value) for key, value in state["saved"].items()},
        "active": {key: value.copy() if value else None for key, value in state["active"].items()},
        "seen": {key: value.copy() for key, value in state["seen"].items()},
        "profiles": {key: value.copy() for key, value in state["profiles"].items()},
        "normal_visits": list(state["visits"][NORMAL_USER]),
        "normal_taste": list(state["taste"][NORMAL_USER]),
    }

    response = client.post(
        "/developer/visit-taste/reset",
        headers={"Authorization": "Bearer dev"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "reset": True,
        "deleted_visits": 1,
        "deleted_taste_snapshots": 1,
    }
    assert state["visits"][DEV_USER] == []
    assert state["taste"][DEV_USER] == []
    assert state["visits"][NORMAL_USER] == preserved["normal_visits"]
    assert state["taste"][NORMAL_USER] == preserved["normal_taste"]
    assert state["saved"] == preserved["saved"]
    assert state["active"] == preserved["active"]
    assert state["seen"] == preserved["seen"]
    assert state["profiles"] == preserved["profiles"]
    assert state["visit_taste_reset"] == [DEV_USER]


def test_visit_taste_reset_reuses_developer_authorization(developer_api, monkeypatch):
    client, _state = developer_api
    endpoint = "/developer/visit-taste/reset"

    assert client.post(endpoint).status_code == 401
    assert client.post(endpoint, headers={"Authorization": "Bearer normal"}).status_code == 404
    monkeypatch.setenv("FIYU_ENABLE_DEV_TOOLS", "false")
    assert client.post(endpoint, headers={"Authorization": "Bearer dev"}).status_code == 404


def test_visit_taste_reset_migration_is_service_role_only():
    migration = (
        api.BACKEND_ROOT
        / "supabase"
        / "migrations"
        / "202608310002_reset_visit_taste_test_data.sql"
    ).read_text(encoding="utf-8")

    assert "security definer" in migration
    assert "delete from public.fiyu_restaurant_visits where user_id = p_user_id" in migration
    assert "delete from public.fiyu_user_taste_snapshots where user_id = p_user_id" in migration
    assert "from public, anon, authenticated" in migration
    assert "to service_role" in migration
    assert "fiyu_restaurant_lists" not in migration
    assert "fiyu_daily_pick_rounds" not in migration
    assert "fiyu_restaurant_seen" not in migration


def test_personalized_pick_force_uses_canonical_planner_and_reset_allows_repeat(
    developer_api,
):
    client, state = developer_api
    state["settings"][DEV_USER] = {"location_mode": "area", "area_name": "Ginza"}

    first = client.post(
        "/developer/personalized-picks/force",
        headers={"Authorization": "Bearer dev"},
        json={"seed": 23},
    )
    assert first.status_code == 200, first.text
    first_body = first.json()
    first_event_id = first_body["state"]["event_id"]
    assert first_body["state"]["status"] == "event_available"
    assert first_body["state"]["qualifying_rating_count"] == 9
    assert first_body["candidate_place_ids"] == state["personalized_pick"][DEV_USER]["place_ids"]
    assert first_body["selection_metadata"]["algorithm"] == "personalized-solo-v1"
    assert first_body["developer_forced"] is True
    assert client.get(
        "/personalized-picks/me", headers={"Authorization": "Bearer dev"}
    ).json()["status"] == "event_available"

    state["personalized_pick"][NORMAL_USER] = {"id": "normal-event"}
    reset = client.post(
        "/developer/personalized-picks/reset",
        headers={"Authorization": "Bearer dev"},
    )
    assert reset.status_code == 200
    assert reset.json()["deleted_events"] == 1
    assert reset.json()["state"]["status"] == "locked"
    assert state["personalized_pick"][NORMAL_USER] == {"id": "normal-event"}

    second = client.post(
        "/developer/personalized-picks/force",
        headers={"Authorization": "Bearer dev"},
        json={"seed": 24},
    )
    assert second.status_code == 200
    assert second.json()["state"]["event_id"] != first_event_id


def test_personalized_pick_dismissal_and_expiration_controls(developer_api):
    client, state = developer_api
    state["settings"][DEV_USER] = {"location_mode": "area", "area_name": "Ginza"}
    created = client.post(
        "/developer/personalized-picks/force",
        headers={"Authorization": "Bearer dev"},
        json={},
    ).json()
    event = state["personalized_pick"][DEV_USER]
    event["dismissed_until"] = "2099-01-01T00:00:00+00:00"

    cleared = client.post(
        "/developer/personalized-picks/clear-dismissal",
        headers={"Authorization": "Bearer dev"},
    )
    assert cleared.status_code == 200
    assert cleared.json()["state"]["dismissed_until"] is None

    event["status"] = "selected"
    event["selected_position"] = 0
    event["selected_place_id"] = event["place_ids"][0]
    event["selected_at"] = datetime.now(UTC).isoformat()
    event["active_until"] = "2099-01-01T00:00:00+00:00"
    expired = client.post(
        "/developer/personalized-picks/expire",
        headers={"Authorization": "Bearer dev"},
    )
    assert expired.status_code == 200
    assert expired.json()["state"]["status"] == "expired"
    assert expired.json()["state"]["event_id"] == created["state"]["event_id"]


def test_personalized_pick_dev_routes_reuse_server_side_authorization(
    developer_api, monkeypatch
):
    client, _state = developer_api
    endpoint = "/developer/personalized-picks/reset"
    assert client.post(endpoint).status_code == 401
    assert client.post(
        endpoint, headers={"Authorization": "Bearer normal"}
    ).status_code == 404
    monkeypatch.setenv("FIYU_ENABLE_DEV_TOOLS", "false")
    assert client.post(
        endpoint, headers={"Authorization": "Bearer dev"}
    ).status_code == 404


def test_production_personalized_pick_stays_locked_for_non_developer(developer_api):
    client, _state = developer_api
    response = client.post(
        "/personalized-picks/events",
        headers={"Authorization": "Bearer normal"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "locked"


def test_my_pick_dev_process_is_owned_and_server_side_gated(developer_api, monkeypatch):
    client, _state = developer_api
    work, _ = my_picks.create_or_get_canonical_work(
        api.DB_PATH, provider="google", external_place_id="dev-new"
    )
    my_pick_id = str(uuid4())
    account_row = {
        "id": my_pick_id,
        "provider": "google",
        "external_place_id": "dev-new",
        "display_name_hint": "Dev New",
        "canonical_work_id": work["id"],
        "status": "pending",
        "created_at": "2026-10-14T00:00:00+00:00",
        "updated_at": "2026-10-14T00:00:00+00:00",
    }
    monkeypatch.setattr(
        api.shared_user_data,
        "get_my_pick",
        lambda *, user_id, my_pick_id: (
            dict(account_row) if user_id == DEV_USER and my_pick_id == account_row["id"] else None
        ),
    )
    monkeypatch.setenv("FIYU_MY_PICK_OSM_INDEX", "dev-osm.sqlite")
    captured = {}

    def run_worker(_db_path, **kwargs):
        captured.update(kwargs)
        return {"jobs_claimed": 1, "ready": 0}

    monkeypatch.setattr(api.my_picks, "run_my_pick_worker", run_worker)
    endpoint = "/developer/my-picks/process"
    payload = {"my_pick_id": my_pick_id}

    assert client.post(endpoint, json=payload).status_code == 401
    assert client.post(
        endpoint, json=payload, headers={"Authorization": "Bearer normal"}
    ).status_code == 404
    response = client.post(
        endpoint, json=payload, headers={"Authorization": "Bearer dev"}
    )

    assert response.status_code == 200
    assert response.json()["my_pick"]["status"] == "pending"
    assert response.json()["stage_diagnostics"] == {
        "identity_bootstrap_attempted": False,
        "identity_bootstrap_completed": False,
        "identity_bootstrap_status": "pending",
        "canonical_research_scheduled": False,
        "canonical_research_attempted": False,
        "canonical_research_provider_requests": 0,
        "canonical_research_claim_status": "not_selected",
        "canonical_research_skip_reason": None,
        "canonical_research_completed": False,
        "canonical_research_status": None,
        "canonical_research_failure_code": None,
        "accepted_source_count": None,
        "rejected_source_count": None,
        "canonical_research_missing_requirements": ["canonical_identity"],
        "location_attempted": False,
        "location_completed": False,
        "location_precision": None,
        "quality_v4_attempted": False,
        "quality_v4_completed": False,
        "quality_v4_internal_score_present": False,
        "quality_v4_status": None,
        "score_version": None,
        "quality_v4_promotion_attempted": False,
        "quality_v4_promotion_status": "not_attempted",
        "quality_v4_promotion_failure_code": None,
        "private_result_eligible": False,
        "recommendation_review_eligible": False,
        "ready": False,
    }
    assert captured["work_id"] == work["id"]
    assert captured["limit"] == 1
    assert captured["retry_failed"] is True


def test_my_pick_dev_process_openapi_contract_is_post_only():
    operation = api.app.openapi()["paths"]["/developer/my-picks/process"]

    assert set(operation) == {"post"}


def test_my_pick_dev_reset_deletes_only_calling_accounts_rows(developer_api, monkeypatch):
    client, _state = developer_api
    deleted_for = []
    monkeypatch.setattr(
        api.shared_user_data,
        "reset_my_pick_test_state",
        lambda *, user_id: deleted_for.append(user_id) or 2,
    )
    endpoint = "/developer/my-picks/reset"

    assert client.post(
        endpoint, headers={"Authorization": "Bearer normal"}
    ).status_code == 404
    response = client.post(endpoint, headers={"Authorization": "Bearer dev"})

    assert response.status_code == 200
    assert response.json() == {"reset": True, "deleted_my_picks": 2}
    assert deleted_for == [DEV_USER]


def test_my_pick_dev_hard_reset_refuses_shared_canonical_work(
    developer_api, monkeypatch
):
    client, _state = developer_api
    work, _ = my_picks.create_or_get_canonical_work(
        api.DB_PATH, provider="google", external_place_id="shared-hard-reset"
    )
    my_pick_id = str(uuid4())
    account_row = {
        "id": my_pick_id,
        "canonical_work_id": work["id"],
        "status": "failed_retryable",
    }
    monkeypatch.setattr(
        api.shared_user_data,
        "get_my_pick",
        lambda *, user_id, my_pick_id: (
            account_row if user_id == DEV_USER and my_pick_id == account_row["id"] else None
        ),
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "hard_reset_my_pick_projection",
        lambda **_kwargs: {"deleted": False, "shared": True, "other_reference_count": 1},
    )
    endpoint = "/developer/my-picks/hard-reset"

    assert client.post(endpoint, json={"my_pick_id": my_pick_id}).status_code == 401
    assert client.post(
        endpoint,
        json={"my_pick_id": my_pick_id},
        headers={"Authorization": "Bearer normal"},
    ).status_code == 404
    response = client.post(
        endpoint,
        json={"my_pick_id": my_pick_id},
        headers={"Authorization": "Bearer dev"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "This canonical work is shared by another account and cannot be hard-reset."
    )
    assert my_picks.get_canonical_work(api.DB_PATH, str(work["id"])) is not None


def test_my_pick_dev_hard_reset_removes_unshared_work_and_restores_projection_slot(
    developer_api, monkeypatch
):
    client, _state = developer_api
    work, _ = my_picks.create_or_get_canonical_work(
        api.DB_PATH, provider="google", external_place_id="unshared-hard-reset"
    )
    my_pick_id = str(uuid4())
    account_rows = {
        my_pick_id: {
            "id": my_pick_id,
            "canonical_work_id": work["id"],
            "status": "pending",
        }
    }
    monkeypatch.setattr(
        api.shared_user_data,
        "get_my_pick",
        lambda *, user_id, my_pick_id: (
            account_rows.get(my_pick_id) if user_id == DEV_USER else None
        ),
    )

    def delete_projection(*, user_id, my_pick_id, canonical_work_id):
        assert user_id == DEV_USER
        assert canonical_work_id == work["id"]
        account_rows.pop(my_pick_id)
        return {"deleted": True, "shared": False, "other_reference_count": 0}

    monkeypatch.setattr(
        api.shared_user_data,
        "hard_reset_my_pick_projection",
        delete_projection,
    )

    response = client.post(
        "/developer/my-picks/hard-reset",
        json={"my_pick_id": my_pick_id},
        headers={"Authorization": "Bearer dev"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "reset": True,
        "deleted_my_picks": 1,
        "deleted_canonical_work": 1,
        "deleted_transient_placeholder": False,
        "preserved_canonical_restaurant": False,
    }
    assert account_rows == {}
    assert my_picks.get_canonical_work(api.DB_PATH, str(work["id"])) is None


@pytest.mark.parametrize(
    ("scenario", "status", "score", "review_status"),
    [
        ("below_70", "ready", 58.0, "not_eligible"),
        ("review_eligible", "ready", 74.0, "pending"),
        ("needs_location", "needs_location", 64.0, "not_eligible"),
        ("outside_coverage", "outside_coverage", None, "not_eligible"),
        ("failed_retryable", "failed_retryable", None, "not_eligible"),
    ],
)
def test_my_pick_dev_previews_are_gated_and_non_persistent(
    developer_api, scenario, status, score, review_status
):
    client, _state = developer_api
    endpoint = "/developer/my-picks/preview"
    payload = {"scenario": scenario}
    assert client.post(
        endpoint, json=payload, headers={"Authorization": "Bearer normal"}
    ).status_code == 404

    response = client.post(
        endpoint, json=payload, headers={"Authorization": "Bearer dev"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["preview_only"] is True
    assert body["my_pick"]["status"] == status
    assert body["my_pick"]["fiyu_score"] == score
    assert body["my_pick"]["recommendation_review_status"] == review_status
    with connect(api.DB_PATH) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM sqlite_master "
            "WHERE type='table' AND name='my_pick_canonical_work'"
        ).fetchone()[0] == 0
