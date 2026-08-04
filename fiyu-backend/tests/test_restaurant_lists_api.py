from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.restaurant_lists import (
    count_default_lists_for_owner_city,
    ensure_restaurant_list_schema,
    get_or_create_default_list,
)


def _owner_id() -> str:
    return str(uuid4())


def _enable_premium_for_owner(monkeypatch: pytest.MonkeyPatch, owner: str) -> None:
    def resolver(owner_id: str) -> frozenset[str]:
        if owner_id == owner:
            return frozenset({"custom_lists", "premium_smart_views", "live_near_me", "day_planning"})
        return frozenset()

    monkeypatch.setattr(api, "resolve_owner_capabilities", resolver)


@pytest.fixture
def lists_db(tmp_path, monkeypatch):
    path = tmp_path / "lists.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.executemany(
            """
            INSERT INTO restaurants
                (place_id, title, city, neighborhood, latitude, longitude, rating, review_count)
            VALUES (?, ?, ?, ?, 35.0, 139.0, 4.4, 20)
            """,
            [
                ("tokyo-a", "Tokyo A", "Suginami City", "Asakusa"),
                ("tokyo-b", "Tokyo B", "Tokyo", "Ueno"),
                ("osaka-a", "Osaka A", "Osaka", "Namba"),
                ("tokyo-hidden", "Tokyo Hidden", "Tokyo", "Kanda"),
            ],
        )
        connection.commit()

    ensure_public_schema(path)
    with connect(path) as connection:
        connection.executemany(
            """
            INSERT INTO public_restaurants
                (place_id, name_ja, name_en, primary_category, food_tags_json,
                 signature_dishes_json, fiyu_score, score_band, latitude, longitude, is_published,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, 'now', 'now')
            """,
            [
                ("tokyo-a", "東京A", "Tokyo A", "sushi", 91.0, "excellent", 35.7120, 139.7800, 1),
                ("tokyo-b", "東京B", "Tokyo B", "ramen", 84.0, "strong", 35.7168, 139.7967, 1),
                ("osaka-a", "大阪A", "Osaka A", "okonomiyaki", 88.0, "excellent", 34.6937, 135.5023, 1),
                ("tokyo-hidden", "東京Hidden", "Tokyo Hidden", "yakitori", 82.0, "strong", 35.6900, 139.7000, 0),
            ],
        )
        connection.commit()

    monkeypatch.setattr(api, "DB_PATH", path)
    return path


def test_first_request_creates_tokyo_default_list(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    response = client.get(
        "/lists/default",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["city_id"] == "tokyo"
    assert body["name"] == "Tokyo"
    assert body["list_kind"] == "default"
    assert body["item_count"] == 0
    assert body["items"] == []


def test_repeated_requests_return_same_default_list(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    first = client.get(
        "/lists/default", params={"city_id": "tokyo"}, headers={"X-Fiyu-Client-Id": owner}
    ).json()
    second = client.get(
        "/lists/default", params={"city_id": "tokyo"}, headers={"X-Fiyu-Client-Id": owner}
    ).json()

    assert first["list_id"] == second["list_id"]


def test_separate_owners_receive_separate_lists(lists_db):
    client = TestClient(api.app)
    owner_a = _owner_id()
    owner_b = _owner_id()

    list_a = client.get(
        "/lists/default", params={"city_id": "tokyo"}, headers={"X-Fiyu-Client-Id": owner_a}
    ).json()
    list_b = client.get(
        "/lists/default", params={"city_id": "tokyo"}, headers={"X-Fiyu-Client-Id": owner_b}
    ).json()

    assert list_a["list_id"] != list_b["list_id"]


def test_owner_cannot_receive_two_tokyo_default_lists(lists_db):
    owner = _owner_id()
    get_or_create_default_list(lists_db, owner_id=owner, city_id="tokyo")
    get_or_create_default_list(lists_db, owner_id=owner, city_id="tokyo")

    assert count_default_lists_for_owner_city(lists_db, owner_id=owner, city_id="tokyo") == 1

    with connect(lists_db) as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count FROM restaurant_lists
            WHERE owner_id = ? AND city_id = 'tokyo' AND list_kind = 'default'
            """,
            (owner,),
        ).fetchone()
    assert int(row["count"]) == 1


def test_adding_published_tokyo_restaurant_succeeds(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    response = client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["changed"] is True
    assert body["list"]["item_count"] == 1
    assert body["list"]["items"][0]["place_id"] == "tokyo-a"


def test_adding_same_restaurant_twice_is_idempotent(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()
    payload = {"city_id": "tokyo", "place_id": "tokyo-a"}

    first = client.post("/lists/default/items", headers={"X-Fiyu-Client-Id": owner}, json=payload)
    second = client.post("/lists/default/items", headers={"X-Fiyu-Client-Id": owner}, json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["changed"] is True
    assert second.json()["changed"] is False
    assert second.json()["list"]["item_count"] == 1


def test_removing_restaurant_succeeds(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()
    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    response = client.request(
        "DELETE",
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["changed"] is True
    assert body["list"]["item_count"] == 0


def test_removing_missing_restaurant_is_predictable(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    response = client.request(
        "DELETE",
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["changed"] is False
    assert body["list"]["item_count"] == 0


def test_unpublished_or_unknown_restaurants_cannot_be_added(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    unknown = client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "missing-place"},
    )
    hidden = client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-hidden"},
    )

    assert unknown.status_code == 404
    assert hidden.status_code == 404


def test_unsupported_city_cannot_create_list(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    response = client.get(
        "/lists/default",
        params={"city_id": "osaka"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 400


def test_list_item_count_is_correct(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    response = client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-b"},
    )

    assert response.status_code == 200
    assert response.json()["list"]["item_count"] == 2


def test_owner_specific_data_is_isolated(lists_db):
    client = TestClient(api.app)
    owner_a = _owner_id()
    owner_b = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner_a},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    other = client.get(
        "/lists/default",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner_b},
    )

    assert other.status_code == 200
    assert other.json()["item_count"] == 0


def test_free_user_cannot_create_custom_list(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    response = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "Favorites"},
    )

    assert response.status_code == 403
    body = response.json()
    assert body["detail"]["code"] == "premium_required"
    assert body["detail"]["capability"] == "custom_lists"


def test_concurrent_default_creation_produces_no_duplicates(lists_db):
    owner = _owner_id()
    ensure_restaurant_list_schema(lists_db)

    def create_once() -> int:
        row = get_or_create_default_list(lists_db, owner_id=owner, city_id="tokyo")
        return int(row["id"])

    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(pool.map(lambda _: create_once(), range(20)))

    assert len(set(ids)) == 1
    assert count_default_lists_for_owner_city(lists_db, owner_id=owner, city_id="tokyo") == 1


def test_existing_public_endpoints_remain_unchanged(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    before = client.get("/public/restaurants").json()
    before_ids = [row["place_id"] for row in before]

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    client.request(
        "DELETE",
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    after = client.get("/public/restaurants").json()
    after_ids = [row["place_id"] for row in after]

    assert before_ids == after_ids


def test_membership_endpoint_avoids_refetching_whole_list(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    member = client.get(
        "/lists/default/membership",
        params={"city_id": "tokyo", "place_id": "tokyo-a"},
        headers={"X-Fiyu-Client-Id": owner},
    )
    assert member.status_code == 200
    assert member.json()["is_saved"] is False

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    member = client.get(
        "/lists/default/membership",
        params={"city_id": "tokyo", "place_id": "tokyo-a"},
        headers={"X-Fiyu-Client-Id": owner},
    )
    assert member.status_code == 200
    assert member.json()["is_saved"] is True


def test_owner_identifier_errors_and_malformed_request(lists_db):
    client = TestClient(api.app)

    missing_owner = client.get("/lists/default", params={"city_id": "tokyo"})
    invalid_owner = client.get(
        "/lists/default",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": "not-a-uuid"},
    )
    malformed = client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": _owner_id()},
        json={"city_id": "tokyo"},
    )

    assert missing_owner.status_code == 400
    assert invalid_owner.status_code == 400
    assert malformed.status_code == 422


def test_schema_supports_default_uniqueness_constraint(lists_db):
    ensure_restaurant_list_schema(lists_db)
    owner = _owner_id()
    now = "2026-08-03T00:00:00+00:00"

    with connect(lists_db) as connection:
        connection.execute(
            """
            INSERT INTO restaurant_lists (owner_id, city_id, name, list_kind, created_at, updated_at)
            VALUES (?, 'tokyo', 'Tokyo', 'default', ?, ?)
            """,
            (owner, now, now),
        )
        connection.commit()
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO restaurant_lists (owner_id, city_id, name, list_kind, created_at, updated_at)
                VALUES (?, 'tokyo', 'Tokyo', 'default', ?, ?)
                """,
                (owner, now, now),
            )


def test_schema_contains_expected_list_tables(lists_db):
    ensure_restaurant_list_schema(lists_db)

    with connect(lists_db) as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        index_names = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            ).fetchall()
        }

    assert {"restaurant_lists", "restaurant_list_items"}.issubset(tables)
    assert "idx_restaurant_lists_owner_city_default" in index_names


def test_smart_view_catalog_returns_five_views(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-b"},
    )

    response = client.get(
        "/lists/default/smart-views",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    keys = [view["key"] for view in body["views"]]
    assert keys == [
        "recently_saved",
        "fiyu_9_plus",
        "not_visited",
        "by_neighborhood",
        "nearby",
    ]


def test_recently_saved_view_is_reverse_chronological(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-b"},
    )

    response = client.get(
        "/lists/default/smart-views/recently_saved",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["place_id"] for item in body["items"]] == ["tokyo-b", "tokyo-a"]


def test_fiyu_9_plus_view_filters_saved_items(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-b"},
    )

    response = client.get(
        "/lists/default/smart-views/fiyu_9_plus",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["place_id"] for item in body["items"]] == ["tokyo-a"]


def test_not_visited_view_is_deterministic(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-b"},
    )

    response = client.get(
        "/lists/default/smart-views/not_visited",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["place_id"] for item in body["items"]] == ["tokyo-b", "tokyo-a"]
    assert all(item["is_visited"] is False for item in body["items"])


def test_by_neighborhood_view_groups_saved_items(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-b"},
    )

    response = client.get(
        "/lists/default/smart-views/by_neighborhood",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    assert [group["title"] for group in body["groups"]] == ["Asakusa", "Ueno"]
    assert [group["item_count"] for group in body["groups"]] == [1, 1]


def test_nearby_view_requires_origin(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    response = client.get(
        "/lists/default/smart-views/nearby",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 422


def test_nearby_view_orders_by_distance(lists_db):
    client = TestClient(api.app)
    owner = _owner_id()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-b"},
    )

    response = client.get(
        "/lists/default/smart-views/nearby",
        params={
            "city_id": "tokyo",
            "origin_latitude": 35.7120,
            "origin_longitude": 139.7800,
        },
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["place_id"] for item in body["items"]] == ["tokyo-a", "tokyo-b"]
    assert body["items"][0]["distance_km"] == 0.0


def test_premium_user_can_create_custom_list(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    response = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "Late Night"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["list_kind"] == "custom"
    assert body["name"] == "Late Night"


def test_custom_list_name_validation(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    response = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "   "},
    )

    assert response.status_code == 422


def test_get_lists_includes_default_and_custom_for_premium(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    create = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "Weekend"},
    )
    assert create.status_code == 200

    response = client.get(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert response.status_code == 200
    body = response.json()
    kinds = [item["list_kind"] for item in body["lists"]]
    assert "default" in kinds
    assert "custom" in kinds


def test_premium_can_rename_custom_list(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    created = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "Old Name"},
    ).json()

    response = client.patch(
        f"/lists/{created['list_id']}",
        headers={"X-Fiyu-Client-Id": owner},
        json={"name": "New Name"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_default_list_cannot_be_renamed_or_deleted(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    default_list = client.get(
        "/lists/default",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    ).json()

    rename = client.patch(
        f"/lists/{default_list['list_id']}",
        headers={"X-Fiyu-Client-Id": owner},
        json={"name": "Nope"},
    )
    delete = client.delete(
        f"/lists/{default_list['list_id']}",
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert rename.status_code == 400
    assert delete.status_code == 400


def test_custom_list_membership_is_isolated(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    first = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "List A"},
    ).json()
    second = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "List B"},
    ).json()

    add = client.post(
        f"/lists/{first['list_id']}/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"place_id": "tokyo-a"},
    )

    first_state = client.get(f"/lists/{first['list_id']}", headers={"X-Fiyu-Client-Id": owner})
    second_state = client.get(f"/lists/{second['list_id']}", headers={"X-Fiyu-Client-Id": owner})

    assert add.status_code == 200
    assert first_state.json()["item_count"] == 1
    assert second_state.json()["item_count"] == 0


def test_duplicate_custom_list_addition_is_idempotent(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    custom = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "List"},
    ).json()

    first = client.post(
        f"/lists/{custom['list_id']}/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"place_id": "tokyo-a"},
    )
    second = client.post(
        f"/lists/{custom['list_id']}/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"place_id": "tokyo-a"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["changed"] is True
    assert second.json()["changed"] is False


def test_delete_custom_list_preserves_default_list_and_visits(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner)

    with connect(lists_db) as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, place_id TEXT NOT NULL)"
        )
        connection.execute("INSERT INTO visits (id, place_id) VALUES (1, 'tokyo-a')")
        connection.commit()

    client.post(
        "/lists/default/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    custom = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "Temp"},
    ).json()
    client.post(
        f"/lists/{custom['list_id']}/items",
        headers={"X-Fiyu-Client-Id": owner},
        json={"place_id": "tokyo-b"},
    )

    deleted = client.delete(f"/lists/{custom['list_id']}", headers={"X-Fiyu-Client-Id": owner})
    default_after = client.get(
        "/lists/default",
        params={"city_id": "tokyo"},
        headers={"X-Fiyu-Client-Id": owner},
    )

    assert deleted.status_code == 200
    assert deleted.json()["changed"] is True
    assert default_after.json()["item_count"] == 1
    assert default_after.json()["items"][0]["place_id"] == "tokyo-a"

    with connect(lists_db) as connection:
        visit_count = connection.execute("SELECT COUNT(*) AS count FROM visits").fetchone()
    assert int(visit_count["count"]) == 1


def test_owner_isolation_for_custom_lists(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner_a = _owner_id()
    owner_b = _owner_id()
    _enable_premium_for_owner(monkeypatch, owner_a)

    created = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner_a},
        json={"city_id": "tokyo", "name": "Private"},
    ).json()

    read_other = client.get(f"/lists/{created['list_id']}", headers={"X-Fiyu-Client-Id": owner_b})
    delete_other = client.delete(
        f"/lists/{created['list_id']}",
        headers={"X-Fiyu-Client-Id": owner_b},
    )

    assert read_other.status_code == 404
    assert delete_other.status_code == 403


def test_capability_checks_are_centralized(lists_db, monkeypatch):
    client = TestClient(api.app)
    owner = _owner_id()
    calls: list[str] = []

    def resolver(owner_id: str) -> frozenset[str]:
        calls.append(owner_id)
        return frozenset()

    monkeypatch.setattr(api, "resolve_owner_capabilities", resolver)

    create = client.post(
        "/lists",
        headers={"X-Fiyu-Client-Id": owner},
        json={"city_id": "tokyo", "name": "Denied"},
    )

    assert create.status_code == 403
    assert calls == [owner]
