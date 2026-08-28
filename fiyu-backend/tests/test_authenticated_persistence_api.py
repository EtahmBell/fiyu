from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.restaurant_lists import add_item, get_or_create_default_list
from fiyu.restaurant_visits import create_visit


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
    recent_rounds: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    clock: dict[str, datetime | None] = {"now": None}

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

    def delete_shared_visit(*, user_id, visit_id):
        previous_count = len(visits[user_id])
        visits[user_id] = [visit for visit in visits[user_id] if visit["id"] != visit_id]
        return len(visits[user_id]) != previous_count

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
    monkeypatch.setattr(api.shared_user_data, "delete_visit", delete_shared_visit)
    monkeypatch.setattr(
        api.shared_user_data,
        "list_visits",
        lambda *, user_id: list(reversed(visits[user_id])),
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "visited_place_ids",
        lambda *, user_id: list(
            dict.fromkeys(str(visit["place_id"]) for visit in reversed(visits[user_id]))
        ),
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

    def active_snapshot(*, user_id, city_id):
        snapshot = snapshots.get((user_id, city_id))
        if snapshot is None:
            return None
        now = clock["now"] or datetime.now(UTC)
        expires_at = datetime.fromisoformat(str(snapshot["expires_at"]))
        return snapshot if expires_at > now else None

    monkeypatch.setattr(api.shared_user_data, "get_active_daily_picks", active_snapshot)

    def recent_snapshots(*, user_id, city_id, assigned_after, expired_at_or_before):
        lower = datetime.fromisoformat(assigned_after)
        upper = datetime.fromisoformat(expired_at_or_before)
        return [
            row
            for row in recent_rounds[(user_id, city_id)]
            if datetime.fromisoformat(str(row["assigned_at"])) > lower
            and datetime.fromisoformat(str(row["expires_at"])) <= upper
        ]

    monkeypatch.setattr(
        api.shared_user_data,
        "get_recent_daily_pick_rounds",
        recent_snapshots,
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

    def repair_snapshot(
        *,
        user_id,
        round_id,
        expected_place_ids,
        place_ids,
        selection_metadata,
        repaired_at,
    ):
        key = next(
            key
            for key, value in snapshots.items()
            if key[0] == user_id and str(value["round_id"]) == round_id
        )
        snapshot = snapshots[key]
        if snapshot["place_ids"] == expected_place_ids:
            added = [place_id for place_id in place_ids if place_id not in expected_place_ids]
            snapshot["place_ids"] = list(place_ids)
            snapshot["selection_metadata"] = selection_metadata
            seen[user_id].extend(
                place_id for place_id in added if place_id not in seen[user_id]
            )
        return snapshot

    monkeypatch.setattr(api.shared_user_data, "repair_active_daily_picks", repair_snapshot)
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
    client = TestClient(api.app)
    client.fiyu_test_state = {
        "items": items,
        "visits": visits,
        "snapshots": snapshots,
        "clock": clock,
        "recent_rounds": recent_rounds,
    }
    return client, user_ids, seen


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _add_catalog_restaurants(*place_ids: str) -> None:
    with connect(api.DB_PATH) as connection:
        for index, place_id in enumerate(place_ids, start=4):
            connection.execute(
                """
                INSERT INTO restaurants
                    (place_id, title, city, neighborhood, latitude, longitude,
                     rating, review_count)
                VALUES (?, ?, 'Tokyo', 'Asakusa', ?, ?, 4.4, 20)
                """,
                (place_id, place_id, 35.65 + index * 0.001, 139.70 + index * 0.001),
            )
            connection.execute(
                """
                INSERT INTO public_restaurants
                    (place_id, name_en, primary_category, food_tags_json,
                     signature_dishes_json, latitude, longitude,
                     map_display_eligible, is_published, product_eligible,
                     created_at, updated_at)
                VALUES (?, ?, 'sushi', '[]', '[]', ?, ?, 1, 1, 1, 'now', 'now')
                """,
                (place_id, place_id, 35.65 + index * 0.001, 139.70 + index * 0.001),
            )
        connection.commit()


def test_authenticated_smart_views_use_supabase_relationships_and_sqlite_catalog(
    shared_account_api,
):
    client, user_ids, _ = shared_account_api
    user_id = user_ids["token-a"]
    saved = client.post(
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-0"},
    )
    assert saved.status_code == 200

    local_list = get_or_create_default_list(
        api.DB_PATH, owner_id=user_id, city_id="tokyo"
    )
    assert add_item(api.DB_PATH, list_id=int(local_list["id"]), place_id="tokyo-1")
    assert create_visit(
        api.DB_PATH,
        owner_id=user_id,
        place_id="tokyo-0",
        visited_at="2026-08-27T00:00:00+00:00",
        reaction="like_it",
        private_note="legacy local visit must be ignored",
    )

    recent = client.get(
        "/lists/default/smart-views/recently_saved",
        params={"city_id": "tokyo"},
        headers=_auth("token-a"),
    )
    not_visited = client.get(
        "/lists/default/smart-views/not_visited",
        params={"city_id": "tokyo"},
        headers=_auth("token-a"),
    )

    assert recent.status_code == not_visited.status_code == 200
    assert [item["place_id"] for item in recent.json()["items"]] == ["tokyo-0"]
    assert [item["place_id"] for item in not_visited.json()["items"]] == ["tokyo-0"]
    assert recent.json()["items"][0]["restaurant"]["name_en"] == "Tokyo 0"

    logged = client.post(
        "/log",
        headers=_auth("token-a"),
        json={
            "place_id": "tokyo-0",
            "visited_at": "2026-08-27T01:00:00+00:00",
            "reaction": "love_it",
        },
    )
    assert logged.status_code == 201
    after_log = client.get(
        "/lists/default/smart-views/not_visited",
        params={"city_id": "tokyo"},
        headers=_auth("token-a"),
    )
    assert after_log.status_code == 200
    assert after_log.json()["items"] == []


def test_authenticated_map_does_not_accept_anonymous_owner_fallback(shared_account_api):
    client, user_ids, _ = shared_account_api

    response = client.get(
        "/profiles/me/map-restaurants",
        headers={"X-Fiyu-Client-Id": user_ids["token-a"]},
    )

    assert response.status_code == 401


def test_authenticated_map_uses_current_relationships_not_historical_seen(
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
    assert map_place_ids() == []

    now = datetime.now(UTC)
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": ["tokyo-1", "tokyo-2", "tokyo-3"],
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {},
    }
    assert map_place_ids() == ["tokyo-1", "tokyo-2", "tokyo-3"]
    assert "tokyo-0" not in map_place_ids()


def test_authenticated_legacy_map_never_falls_back_to_local_served_history(
    shared_account_api, monkeypatch
):
    client, _, _ = shared_account_api
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: False)

    response = client.get("/map/restaurants", headers=_auth("token-b"))

    assert response.status_code == 503


def test_map_visibility_expires_but_seen_history_and_retained_relationships_remain(
    shared_account_api,
):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-a"]
    now = datetime.now(UTC)
    assigned_at = now - timedelta(hours=23)
    place_ids = ["tokyo-0", "tokyo-1", "tokyo-2"]
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": place_ids,
        "assigned_at": assigned_at.isoformat(),
        "expires_at": (assigned_at + timedelta(hours=24)).isoformat(),
        "selection_metadata": {},
    }
    client.fiyu_test_state["recent_rounds"][(user_id, "tokyo")].append(
        {
            "round_id": str(uuid4()),
            "place_ids": place_ids,
            "assigned_at": assigned_at.isoformat(),
            "expires_at": (assigned_at + timedelta(hours=24)).isoformat(),
            "selection_metadata": {},
        }
    )
    seen[user_id].extend(place_ids)

    def map_ids() -> list[str]:
        response = client.get("/profiles/me/map-restaurants", headers=_auth("token-a"))
        assert response.status_code == 200
        return [row["place_id"] for row in response.json()]

    assert map_ids() == place_ids
    assert map_ids() == place_ids  # a refresh does not replace the active snapshot

    assert map_ids() == place_ids

    saved = client.post(
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-1"},
    )
    another_saved = client.post(
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-0"},
    )
    visit = client.post(
        "/log",
        headers=_auth("token-a"),
        json={
            "place_id": "tokyo-2",
            "visited_at": "2026-08-22T12:00:00Z",
            "reaction": "like_it",
            "private_note": "Retained by the canonical visit relationship",
        },
    )
    assert saved.status_code == 200
    assert another_saved.status_code == 200
    assert visit.status_code == 201

    # Once the active snapshot expires, the same persisted round remains on the
    # Map for the existing Recent Discoveries retention window.
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")]["expires_at"] = (
        now - timedelta(hours=1)
    ).isoformat()
    recent = client.fiyu_test_state["recent_rounds"][(user_id, "tokyo")][0]
    recent["assigned_at"] = (now - timedelta(hours=25)).isoformat()
    recent["expires_at"] = (now - timedelta(hours=1)).isoformat()
    assert map_ids() == place_ids
    assert seen[user_id] == place_ids
    saved_items = client.get(
        "/lists/default", params={"city_id": "tokyo"}, headers=_auth("token-a")
    ).json()["items"]
    assert {item["place_id"] for item in saved_items} == {"tokyo-0", "tokyo-1"}

    client.fiyu_test_state["recent_rounds"][(user_id, "tokyo")].clear()
    assert map_ids() == ["tokyo-2"]
    assert seen[user_id] == place_ids

    unsaved = client.request(
        "DELETE",
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-1"},
    )
    assert unsaved.status_code == 200
    assert map_ids() == ["tokyo-2"]
    assert seen[user_id] == place_ids

    deleted = client.delete(f"/log/{visit.json()['id']}", headers=_auth("token-a"))
    assert deleted.status_code == 200
    assert map_ids() == []
    assert seen[user_id] == place_ids


def test_new_active_round_replaces_old_unsaved_map_membership(shared_account_api):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-a"]
    now = datetime(2026, 8, 22, 12, tzinfo=UTC)
    seen[user_id].extend(["tokyo-0", "tokyo-1", "tokyo-2", "tokyo-3"])
    client.fiyu_test_state["clock"]["now"] = now
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": ["tokyo-1", "tokyo-2", "tokyo-3"],
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {},
    }

    response = client.get("/profiles/me/map-restaurants", headers=_auth("token-a"))

    assert response.status_code == 200
    assert [row["place_id"] for row in response.json()] == [
        "tokyo-1",
        "tokyo-2",
        "tokyo-3",
    ]
    assert "tokyo-0" not in {row["place_id"] for row in response.json()}
    assert seen[user_id] == ["tokyo-0", "tokyo-1", "tokyo-2", "tokyo-3"]


def test_map_visibility_deduplicates_active_saved_and_visited_membership(
    shared_account_api,
):
    client, user_ids, _ = shared_account_api
    user_id = user_ids["token-a"]
    now = datetime.now(UTC)
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": ["tokyo-0", "tokyo-1", "tokyo-2"],
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {},
    }
    assert (
        client.post(
            "/lists/default/items",
            headers=_auth("token-a"),
            json={"city_id": "tokyo", "place_id": "tokyo-0"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/log",
            headers=_auth("token-a"),
            json={
                "place_id": "tokyo-0",
                "visited_at": "2026-08-22T12:00:00Z",
                "reaction": "love_it",
            },
        ).status_code
        == 201
    )

    response = client.get("/profiles/me/map-restaurants", headers=_auth("token-a"))

    assert response.status_code == 200
    returned = [row["place_id"] for row in response.json()]
    assert returned == ["tokyo-0", "tokyo-1", "tokyo-2"]
    assert len(returned) == len(set(returned)) == 3
    by_place_id = {row["place_id"]: row for row in response.json()}
    assert by_place_id["tokyo-0"]["is_visited"] is True
    assert by_place_id["tokyo-1"]["is_visited"] is False
    assert by_place_id["tokyo-2"]["is_visited"] is False


def test_map_visibility_still_requires_published_map_eligible_catalog_rows(
    shared_account_api,
):
    client, user_ids, _ = shared_account_api
    user_id = user_ids["token-a"]
    now = datetime.now(UTC)
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": ["tokyo-0", "tokyo-1", "tokyo-2"],
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {},
    }
    with connect(api.DB_PATH) as connection:
        connection.execute(
            "UPDATE public_restaurants SET map_display_eligible = 0 WHERE place_id = 'tokyo-1'"
        )
        connection.execute(
            "UPDATE public_restaurants SET is_published = 0 WHERE place_id = 'tokyo-2'"
        )
        connection.commit()

    response = client.get("/profiles/me/map-restaurants", headers=_auth("token-a"))

    assert response.status_code == 200
    assert [row["place_id"] for row in response.json()] == ["tokyo-0"]


def test_product_exclusion_filters_discovery_but_preserves_saved_and_visit_history(
    shared_account_api,
):
    client, user_ids, _ = shared_account_api
    user_id = user_ids["token-a"]
    now = datetime.now(UTC)
    snapshot = {
        "round_id": str(uuid4()),
        "place_ids": ["tokyo-0", "tokyo-1", "tokyo-2"],
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {},
    }
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = snapshot
    client.fiyu_test_state["recent_rounds"][(user_id, "tokyo")].append(
        {
            **snapshot,
            "round_id": str(uuid4()),
            "assigned_at": (now - timedelta(hours=25)).isoformat(),
            "expires_at": (now - timedelta(hours=1)).isoformat(),
        }
    )
    assert client.post(
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-1"},
    ).status_code == 200
    assert client.post(
        "/log",
        headers=_auth("token-a"),
        json={
            "place_id": "tokyo-1",
            "visited_at": "2026-08-22T12:00:00Z",
            "reaction": "like_it",
            "private_note": "Historical relationship remains private and readable",
        },
    ).status_code == 201

    with connect(api.DB_PATH) as connection:
        connection.execute(
            "UPDATE public_restaurants SET product_eligible = 0 WHERE place_id = 'tokyo-1'"
        )
        connection.commit()

    active = client.get(
        "/daily-picks/active", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )
    recent = client.get(
        "/daily-picks/recent", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )
    map_rows = client.get(
        "/profiles/me/map-restaurants", headers=_auth("token-a")
    )
    saved = client.get(
        "/lists/default", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )
    visits = client.get("/log", headers=_auth("token-a"))

    assert active.status_code == recent.status_code == map_rows.status_code == 200
    assert active.json()["place_ids"] == ["tokyo-0", "tokyo-2", "tokyo-3"]
    assert [row["place_id"] for row in active.json()["restaurants"]] == [
        "tokyo-0",
        "tokyo-2",
        "tokyo-3",
    ]
    assert recent.json()[0]["place_ids"] == ["tokyo-0", "tokyo-2"]
    assert "tokyo-1" not in {row["place_id"] for row in map_rows.json()}
    assert [row["place_id"] for row in saved.json()["items"]] == ["tokyo-1"]
    assert [row["place_id"] for row in visits.json()] == ["tokyo-1"]
    assert visits.json()[0]["private_note"] == (
        "Historical relationship remains private and readable"
    )
    assert client.fiyu_test_state["snapshots"][(user_id, "tokyo")]["place_ids"] == [
        "tokyo-0",
        "tokyo-2",
        "tokyo-3",
    ]


@pytest.mark.parametrize("excluded_count", [1, 2, 3])
def test_active_snapshot_repairs_only_ineligible_slots_and_persists(
    shared_account_api, excluded_count
):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-a"]
    _add_catalog_restaurants("tokyo-4", "tokyo-5")
    original = ["tokyo-0", "tokyo-1", "tokyo-2"]
    excluded = original[-excluded_count:]
    preserved = original[:-excluded_count]
    now = datetime.now(UTC)
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": original.copy(),
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {
            "discovery_latitude": 35.65,
            "discovery_longitude": 139.70,
            "discovery_label": "Asakusa",
        },
    }
    seen[user_id].extend(original)
    with connect(api.DB_PATH) as connection:
        connection.executemany(
            "UPDATE public_restaurants SET product_eligible = 0 WHERE place_id = ?",
            ((place_id,) for place_id in excluded),
        )
        connection.commit()

    first = client.get(
        "/daily-picks/active", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )
    second = client.get(
        "/daily-picks/active", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )

    assert first.status_code == second.status_code == 200
    repaired_ids = first.json()["place_ids"]
    assert second.json()["place_ids"] == repaired_ids
    assert repaired_ids[: len(preserved)] == preserved
    assert len(repaired_ids) == 3
    assert not set(repaired_ids).intersection(excluded)
    assert client.fiyu_test_state["snapshots"][(user_id, "tokyo")][
        "place_ids"
    ] == repaired_ids
    assert set(original).issubset(seen[user_id])


def test_snapshot_replacements_respect_saved_cooldown_and_unseen_rules(
    shared_account_api, monkeypatch
):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-a"]
    _add_catalog_restaurants("tokyo-4", "tokyo-5", "tokyo-6")
    now = datetime.now(UTC)
    original = ["tokyo-0", "tokyo-1", "tokyo-2"]
    seen[user_id].extend([*original, "tokyo-4", "tokyo-6"])
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": original.copy(),
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {
            "discovery_latitude": 35.65,
            "discovery_longitude": 139.70,
            "discovery_label": "Asakusa",
        },
    }
    assert client.post(
        "/lists/default/items",
        headers=_auth("token-a"),
        json={"city_id": "tokyo", "place_id": "tokyo-3"},
    ).status_code == 200
    monkeypatch.setattr(
        api.shared_user_data,
        "seen_history",
        lambda *, user_id: {
            **{place_id: (now - timedelta(days=8)).isoformat() for place_id in original},
            "tokyo-4": now.isoformat(),
            "tokyo-6": (now - timedelta(days=8)).isoformat(),
        },
    )
    with connect(api.DB_PATH) as connection:
        connection.execute(
            "UPDATE public_restaurants SET product_eligible = 0 "
            "WHERE place_id IN ('tokyo-1', 'tokyo-2')"
        )
        connection.commit()

    response = client.get(
        "/daily-picks/active", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )

    assert response.status_code == 200
    assert response.json()["place_ids"][0] == "tokyo-0"
    assert set(response.json()["place_ids"][1:]) == {"tokyo-5", "tokyo-6"}
    assert "tokyo-3" not in response.json()["place_ids"]
    assert "tokyo-4" not in response.json()["place_ids"]
    assert {"tokyo-1", "tokyo-2", "tokyo-4"}.issubset(seen[user_id])


def test_active_snapshot_with_no_replacements_returns_and_persists_empty_gracefully(
    shared_account_api,
):
    client, user_ids, seen = shared_account_api
    user_id = user_ids["token-a"]
    now = datetime.now(UTC)
    original = ["tokyo-0", "tokyo-1", "tokyo-2"]
    seen[user_id].extend(original)
    client.fiyu_test_state["snapshots"][(user_id, "tokyo")] = {
        "round_id": str(uuid4()),
        "place_ids": original.copy(),
        "assigned_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "selection_metadata": {
            "discovery_latitude": 35.65,
            "discovery_longitude": 139.70,
            "discovery_label": "Asakusa",
        },
    }
    with connect(api.DB_PATH) as connection:
        connection.execute("UPDATE public_restaurants SET product_eligible = 0")
        connection.commit()

    first = client.get(
        "/daily-picks/active", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )
    second = client.get(
        "/daily-picks/active", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["place_ids"] == first.json()["restaurants"] == []
    assert second.json()["place_ids"] == []
    assert client.fiyu_test_state["snapshots"][(user_id, "tokyo")]["place_ids"] == []
    assert seen[user_id] == original
    assert client.get(
        "/profiles/me/map-restaurants", headers=_auth("token-a")
    ).json() == []


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
    } == set(surfaced.json()["place_ids"]) | {"tokyo-1"}

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
        "location_mode": "preview",
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
    assert first.json()["discovery_mode"] == "preview"
    assert first.json()["discovery_label"] == "Asakusa"
    assert other_account.status_code == 200
    assert other_account.json() is None


def test_recent_discoveries_restore_every_persisted_round_item_with_account_isolation(
    shared_account_api,
):
    client, user_ids, seen = shared_account_api
    assigned_at = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
    round_id = str(uuid4())
    place_ids = ["tokyo-0", "tokyo-1", "tokyo-2"]
    client.fiyu_test_state["recent_rounds"][(user_ids["token-a"], "tokyo")].append(
        {
            "round_id": round_id,
            "assigned_at": assigned_at,
            "expires_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
            "selection_metadata": {},
            "place_ids": place_ids,
        }
    )
    seen[user_ids["token-a"]].extend(place_ids)

    restored = client.get(
        "/daily-picks/recent", params={"city_id": "tokyo"}, headers=_auth("token-a")
    )
    other_account = client.get(
        "/daily-picks/recent", params={"city_id": "tokyo"}, headers=_auth("token-b")
    )

    assert restored.status_code == other_account.status_code == 200
    assert restored.json()[0]["round_id"] == round_id
    assert restored.json()[0]["place_ids"] == place_ids
    assert [row["place_id"] for row in restored.json()[0]["restaurants"]] == place_ids
    assert other_account.json() == []
    assert seen[user_ids["token-a"]] == place_ids


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
