from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from fiyu import api
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
                    ) VALUES (?, ?, 'restaurant', '[]', '[]', ?, '[]', 75, 75, 1, 1, 1,
                              ?, ?, 'exact', ?, 'now', 'now')
                    """,
                    (
                        f"{area.lower()}-{index}",
                        f"{area} {index}",
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
