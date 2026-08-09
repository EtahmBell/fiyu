from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from fiyu import api
from fiyu.discovery_location import TOKYO_SERVICE_AREA


def _setup_store(monkeypatch):
    store: dict[str, dict[str, object]] = {}
    monkeypatch.setattr(api, "authenticated_supabase_user", lambda _: {"id": current[0]})
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: True)
    monkeypatch.setattr(
        api.shared_user_data,
        "get_discovery_location",
        lambda *, user_id: store.get(user_id),
    )

    def upsert(*, user_id, changes):
        store[user_id] = {
            **store.get(user_id, {}),
            "user_id": user_id,
            **changes,
            "updated_at": "2026-08-09T00:00:00+00:00",
        }
        return store[user_id]

    monkeypatch.setattr(api.shared_user_data, "upsert_discovery_location", upsert)
    return store


current = [str(uuid4())]


def test_tokyo_current_location_is_saved_as_account_discovery_center(monkeypatch):
    store = _setup_store(monkeypatch)
    current[0] = str(uuid4())
    response = TestClient(api.app).post(
        "/profiles/me/discovery-location/check-current",
        headers={"Authorization": "Bearer valid"},
        json={"latitude": 35.658, "longitude": 139.7016},
    )
    assert response.status_code == 200
    assert response.json()["inside_service_area"] is True
    assert response.json()["location"]["location_mode"] == "current"
    assert store[current[0]]["discovery_label"] == "Shibuya"


def test_outside_tokyo_check_does_not_persist_device_coordinates(monkeypatch):
    store = _setup_store(monkeypatch)
    current[0] = str(uuid4())
    response = TestClient(api.app).post(
        "/profiles/me/discovery-location/check-current",
        headers={"Authorization": "Bearer valid"},
        json={"latitude": 34.6937, "longitude": 135.5023},
    )
    assert response.status_code == 200
    assert response.json()["inside_service_area"] is False
    assert "discovery_latitude" not in store[current[0]]
    assert store[current[0]]["last_location_check_at"]


def test_manual_location_is_canonical_optional_arrival_and_owner_isolated(monkeypatch):
    store = _setup_store(monkeypatch)
    first, second = str(uuid4()), str(uuid4())
    client = TestClient(api.app)
    current[0] = first
    saved = client.put(
        "/profiles/me/discovery-location",
        headers={"Authorization": "Bearer first"},
        json={
            "location_mode": "preview",
            "discovery_label": "Shimokitazawa",
            "discovery_latitude": 35.6616,
            "discovery_longitude": 139.6666,
            "arrival_date": "2026-10-01",
        },
    )
    current[0] = second
    isolated = client.get(
        "/profiles/me/discovery-location", headers={"Authorization": "Bearer second"}
    )
    assert saved.status_code == 200
    assert saved.json()["location_mode"] == "preview"
    assert saved.json()["discovery_label"] == "Shimokitazawa"
    assert saved.json()["arrival_date"] == "2026-10-01"
    assert isolated.json()["configured"] is False
    assert store[first]["discovery_latitude"] == 35.6616

    current[0] = first
    refreshed = client.get(
        "/profiles/me/discovery-location", headers={"Authorization": "Bearer first-again"}
    )
    assert refreshed.json()["discovery_label"] == "Shimokitazawa"


def test_manual_location_rejects_coordinates_that_do_not_match_canonical_area(monkeypatch):
    _setup_store(monkeypatch)
    current[0] = str(uuid4())
    response = TestClient(api.app).put(
        "/profiles/me/discovery-location",
        headers={"Authorization": "Bearer valid"},
        json={
            "location_mode": "preview",
            "discovery_label": "Shibuya",
            "discovery_latitude": 1,
            "discovery_longitude": 1,
            "arrival_date": None,
        },
    )
    assert response.status_code == 422


def test_service_area_boundary_is_deterministic():
    assert TOKYO_SERVICE_AREA.contains(35.658, 139.7016)
    assert not TOKYO_SERVICE_AREA.contains(34.6937, 135.5023)
