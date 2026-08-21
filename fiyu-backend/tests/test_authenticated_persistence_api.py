from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema


@pytest.fixture
def shared_account_api(tmp_path, monkeypatch):
    path = tmp_path / "shared-account-catalog.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        for index in range(4):
            connection.execute(
                """
                INSERT INTO restaurants
                    (place_id, title, city, neighborhood, latitude, longitude, rating, review_count)
                VALUES (?, ?, 'Tokyo', 'Asakusa', 35.0, 139.0, 4.4, 20)
                """,
                (f"tokyo-{index}", f"Tokyo {index}"),
            )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        for index in range(4):
            connection.execute(
                """
                INSERT INTO public_restaurants
                    (place_id, name_en, primary_category, food_tags_json,
                     signature_dishes_json, latitude, longitude,
                     map_display_eligible, is_published, created_at, updated_at)
                VALUES (?, ?, 'sushi', '[]', '[]', ?, ?, 1, 1, 'now', 'now')
                """,
                (
                    f"tokyo-{index}",
                    f"Tokyo {index}",
                    35.65 + index * 0.01,
                    139.70 + index * 0.01,
                ),
            )
        connection.commit()

    user_ids = {"token-a": str(uuid4()), "token-b": str(uuid4())}
    lists: dict[str, dict[str, object]] = {}
    items: dict[str, list[dict[str, object]]] = defaultdict(list)
    visits: dict[str, list[dict[str, object]]] = defaultdict(list)
    seen: dict[str, list[str]] = defaultdict(list)
    snapshots: dict[tuple[str, str], dict[str, object]] = {}

    def current_user(header):
        token = (header or "").removeprefix("Bearer ")
        if token not in user_ids:
            raise api.SupabaseAuthError("invalid")
        return {"id": user_ids[token]}

    def default_list(*, user_id, city_id):
        if user_id not in lists:
            lists[user_id] = {
                "id": len(lists) + 1,
                "user_id": user_id,
                "city_id": city_id,
                "name": "Tokyo",
                "list_kind": "default",
                "created_at": "2026-08-08T00:00:00+00:00",
                "updated_at": "2026-08-08T00:00:00+00:00",
            }
        return lists[user_id]

    def add_item(*, user_id, list_id, place_id):
        assert lists[user_id]["id"] == list_id
        if any(item["place_id"] == place_id for item in items[user_id]):
            return False
        items[user_id].append({"place_id": place_id, "added_at": "2026-08-08T00:00:00+00:00"})
        return True

    def remove_item(*, user_id, list_id, place_id):
        assert lists[user_id]["id"] == list_id
        previous_count = len(items[user_id])
        items[user_id] = [item for item in items[user_id] if item["place_id"] != place_id]
        return len(items[user_id]) != previous_count

    def create_visit(*, user_id, place_id, visited_at, reaction, private_note):
        row = {
            "id": str(uuid4()),
            "user_id": user_id,
            "place_id": place_id,
            "visited_at": visited_at,
            "reaction": reaction,
            "private_note": private_note,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        visits[user_id].append(row)
        return row

    monkeypatch.setattr(api, "DB_PATH", path)
    monkeypatch.setattr(api, "authenticated_supabase_user", current_user)
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: True)
    monkeypatch.setattr(api.shared_user_data, "get_or_create_default_list", default_list)
    monkeypatch.setattr(
        api.shared_user_data,
        "list_items",
        lambda *, user_id, list_id: list(items[user_id]),
    )
    monkeypatch.setattr(api.shared_user_data, "add_item", add_item)
    monkeypatch.setattr(api.shared_user_data, "remove_item", remove_item)
    monkeypatch.setattr(api.shared_user_data, "create_visit", create_visit)
    monkeypatch.setattr(
        api.shared_user_data,
        "list_visits",
        lambda *, user_id: list(reversed(visits[user_id])),
    )
    monkeypatch.setattr(
        api.shared_user_data, "seen_place_ids", lambda *, user_id: list(seen[user_id])
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "seen_history",
        lambda *, user_id: {
            place_id: "2026-08-08T00:00:00+00:00" for place_id in seen[user_id]
        },
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "saved_place_ids",
        lambda *, user_id, city_id: {
            str(item["place_id"]) for item in items[user_id]
        },
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "get_active_daily_picks",
        lambda *, user_id, city_id: snapshots.get((user_id, city_id)),
    )

    def assign_snapshot(
        *, user_id, city_id, place_ids, assigned_at, expires_at, selection_metadata
    ):
        key = (user_id, city_id)
        if key not in snapshots:
            snapshots[key] = {
                "round_id": str(uuid4()),
                "place_ids": list(place_ids),
                "assigned_at": assigned_at,
                "expires_at": expires_at,
                "selection_metadata": selection_metadata,
            }
            seen[user_id].extend(
                place_id for place_id in place_ids if place_id not in seen[user_id]
            )
        return snapshots[key]

    monkeypatch.setattr(
        api.shared_user_data, "assign_or_get_active_daily_picks", assign_snapshot
    )
    monkeypatch.setattr(
        api.shared_user_data, "get_discovery_location", lambda *, user_id: None
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "record_seen",
        lambda *, user_id, place_ids: seen[user_id].extend(
            place_id for place_id in place_ids if place_id not in seen[user_id]
        ),
    )
    return TestClient(api.app), user_ids, seen


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_authenticated_map_does_not_accept_anonymous_owner_fallback(shared_account_api):
    client, user_ids, _ = shared_account_api

    response = client.get(
        "/profiles/me/map-restaurants",
        headers={"X-Fiyu-Client-Id": user_ids["token-a"]},
    )

    assert response.status_code == 401


def test_authenticated_map_intersects_four_eligible_rows_with_seen_history_exactly(
    shared_account_api,
):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-b"]

    def map_place_ids() -> list[str]:
        responses = [
            client.get("/profiles/me/map-restaurants", headers=_auth("token-b")),
            client.get("/map/restaurants", headers=_auth("token-b")),
        ]
        assert all(response.status_code == 200 for response in responses)
        place_id_sets = [
            [restaurant["place_id"] for restaurant in response.json()]
            for response in responses
        ]
        assert place_id_sets[0] == place_id_sets[1]
        return place_id_sets[0]

    global_rows = client.get("/public/restaurants").json()
    assert len(global_rows) == 4
    assert all(row["map_display_eligible"] for row in global_rows)
    assert all(row["latitude"] is not None and row["longitude"] is not None for row in global_rows)

    assert seen[user_id] == []
    assert map_place_ids() == []

    seen[user_id].append("tokyo-0")
    assert map_place_ids() == ["tokyo-0"]

    seen[user_id].append("tokyo-1")
    assert map_place_ids() == ["tokyo-0", "tokyo-1"]
    assert "tokyo-2" not in map_place_ids()
    assert "tokyo-3" not in map_place_ids()


def test_authenticated_legacy_map_never_falls_back_to_local_served_history(
    shared_account_api, monkeypatch
):
    client, _, _ = shared_account_api
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: False)

    response = client.get("/map/restaurants", headers=_auth("token-b"))

    assert response.status_code == 503


def test_authenticated_lists_log_and_seen_are_account_owned(shared_account_api):
    client, _, _ = shared_account_api

    saved = client.post(
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-0"},
    )
    visit = client.post(
        "/log",
        headers=_auth("token-a"),
        json={
            "place_id": "tokyo-1",
            "visited_at": "2026-08-08T12:00:00Z",
            "reaction": "love_it",
            "private_note": "User A private note",
        },
    )
    surfaced = client.post(
        "/daily-picks/assign",
        headers=_auth("token-a"),
        json={
            "city_id": "tokyo",
            "candidate_place_ids": ["tokyo-0", "tokyo-1", "tokyo-2", "tokyo-3"],
            "seed": 7,
            "requested_count": 3,
        },
    )

    assert saved.status_code == 200
    assert visit.status_code == 201
    assert visit.json()["reaction"] == "love_it"
    assert visit.json()["private_note"] == "User A private note"
    assert surfaced.status_code == 200
    assert {
        item["place_id"]
        for item in client.get(
            "/profiles/me/map-restaurants", headers=_auth("token-a")
        ).json()
    } == set(surfaced.json()["place_ids"])

    assert (
        client.get("/lists/default", params={"city_id": "tokyo"}, headers=_auth("token-b")).json()[
            "items"
        ]
        == []
    )
    assert client.get("/log", headers=_auth("token-b")).json() == []
    assert client.get("/seen/restaurants", headers=_auth("token-b")).json()["place_ids"] == []
    assert client.get(
        "/profiles/me/map-restaurants", headers=_auth("token-b")
    ).json() == []

    surfaced_for_b = client.post(
        "/daily-picks/assign",
        headers=_auth("token-b"),
        json={
            "city_id": "tokyo",
            "candidate_place_ids": ["tokyo-0", "tokyo-1", "tokyo-2", "tokyo-3"],
            "seed": 7,
            "requested_count": 3,
        },
    )
    assert surfaced_for_b.status_code == 200
    assert len(client.get("/seen/restaurants", headers=_auth("token-b")).json()["place_ids"]) == 3
    assert {
        item["place_id"]
        for item in client.get(
            "/profiles/me/map-restaurants", headers=_auth("token-b")
        ).json()
    } == set(surfaced_for_b.json()["place_ids"])

    assert (
        client.get("/lists/default", params={"city_id": "tokyo"}, headers=_auth("token-a")).json()[
            "items"
        ][0]["place_id"]
        == "tokyo-0"
    )
    assert (
        client.get("/log", headers=_auth("token-a")).json()[0]["private_note"]
        == "User A private note"
    )
    assert len(client.get("/seen/restaurants", headers=_auth("token-a")).json()["place_ids"]) == 3

    removed = client.request(
        "DELETE",
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-0"},
    )
    assert removed.status_code == 200
    assert removed.json()["changed"] is True
    assert removed.json()["list"]["item_count"] == 0
    assert client.get(
        "/lists/default", params={"city_id": "tokyo"}, headers=_auth("token-a")
    ).json()["items"] == []


def test_authenticated_reads_do_not_create_seen_history(shared_account_api):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-b"]

    responses = [
        client.get("/public/restaurants"),
        client.get("/profiles/me/map-restaurants", headers=_auth("token-b")),
        client.get("/seen/restaurants", headers=_auth("token-b")),
        client.get("/lists/default", params={"city_id": "tokyo"}, headers=_auth("token-b")),
        client.get("/log", headers=_auth("token-b")),
    ]

    assert all(response.status_code == 200 for response in responses)
    assert seen[user_id] == []


def test_authenticated_assignment_records_only_returned_picks_not_legacy_or_candidate_pool(
    shared_account_api,
):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-b"]
    candidates = [f"candidate-{index}" for index in range(50)]
    response = client.post(
        "/daily-picks/assign",
        headers=_auth("token-b"),
        json={
            "city_id": "tokyo",
            "candidate_place_ids": candidates,
            "legacy_served_place_ids": [f"stale-{index}" for index in range(18)],
            "seed": 11,
            "requested_count": 3,
        },
    )

    assert response.status_code == 200
    surfaced = response.json()["place_ids"]
    assert len(surfaced) == 3
    assert set(surfaced) <= {"tokyo-0", "tokyo-1", "tokyo-2", "tokyo-3"}
    assert seen[user_id] == surfaced


def test_authenticated_daily_pick_snapshot_is_reused_and_account_specific(
    shared_account_api,
):
    client, _, _ = shared_account_api
    payload = {
        "city_id": "tokyo",
        "discovery_latitude": 35.65,
        "discovery_longitude": 139.70,
        "active_area": "Asakusa",
        "seed": 3,
        "requested_count": 3,
    }

    first = client.post("/daily-picks/assign", headers=_auth("token-a"), json=payload)
    repeated = client.post(
        "/daily-picks/assign",
        headers=_auth("token-a"),
        json={**payload, "seed": 99},
    )
    restored = client.get(
        "/daily-picks/active",
        params={"city_id": "tokyo"},
        headers=_auth("token-a"),
    )
    other_account = client.get(
        "/daily-picks/active",
        params={"city_id": "tokyo"},
        headers=_auth("token-b"),
    )

    assert first.status_code == repeated.status_code == restored.status_code == 200
    assert repeated.json() == first.json() == restored.json()
    assert other_account.status_code == 200
    assert other_account.json() is None


def test_invalid_bearer_cannot_select_another_account(shared_account_api):
    client, user_ids, _ = shared_account_api
    response = client.get(
        "/log",
        headers={
            "Authorization": "Bearer invalid",
            "X-Fiyu-Client-Id": user_ids["token-a"],
        },
    )
    assert response.status_code == 401
