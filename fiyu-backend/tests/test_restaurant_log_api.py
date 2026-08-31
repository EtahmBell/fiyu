from __future__ import annotations

import sqlite3
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.restaurant_visits import ensure_restaurant_visit_schema


def _owner_id() -> str:
    return str(uuid4())


def _headers(owner_id: str) -> dict[str, str]:
    return {"X-Fiyu-Client-Id": owner_id}


@pytest.fixture
def log_db(tmp_path, monkeypatch):
    path = tmp_path / "log.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.executemany(
            """
            INSERT INTO restaurants
                (place_id, title, city, neighborhood, latitude, longitude, rating, review_count)
            VALUES (?, ?, 'Tokyo', ?, 35.0, 139.0, 4.4, 20)
            """,
            [
                ("tokyo-a", "Tokyo A", "Asakusa"),
                ("tokyo-b", "Tokyo B", "Ueno"),
                ("tokyo-hidden", "Tokyo Hidden", "Kanda"),
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
                 why_fiyu, created_at, updated_at)
            VALUES (?, ?, ?, ?, '[]', '[]', ?, ?, 35.0, 139.0, ?, ?, 'now', 'now')
            """,
            [
                ("tokyo-a", "Tokyo A JA", "Tokyo A", "sushi", 91.0, "excellent", 1, "internal-a"),
                ("tokyo-b", "Tokyo B JA", "Tokyo B", "ramen", 84.0, "strong", 1, "internal-b"),
                (
                    "tokyo-hidden",
                    "Tokyo Hidden JA",
                    "Tokyo Hidden",
                    "yakitori",
                    82.0,
                    "strong",
                    0,
                    "internal-hidden",
                ),
            ],
        )
        connection.commit()

    monkeypatch.setattr(api, "DB_PATH", path)
    return path


def _create_visit(
    client: TestClient,
    owner_id: str,
    place_id: str = "tokyo-a",
    visited_at: str = "2026-08-08T12:00:00Z",
    rating: float = 4,
    private_note: str | None = None,
):
    return client.post(
        "/log",
        headers=_headers(owner_id),
        json={
            "place_id": place_id,
            "visited_at": visited_at,
            "rating": rating,
            "private_note": private_note,
        },
    )


def test_existing_visit_table_adds_nullable_constrained_rating_column(log_db):
    owner = _owner_id()
    with connect(log_db) as connection:
        connection.execute(
            """
            CREATE TABLE restaurant_visits (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                place_id TEXT NOT NULL,
                visited_at TEXT NOT NULL,
                private_note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.commit()

    ensure_restaurant_visit_schema(log_db)

    with connect(log_db) as connection:
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(restaurant_visits)")
        }
        assert "reaction" in columns
        assert "rating" in columns
        connection.execute(
            """
            INSERT INTO restaurant_visits
                (id, owner_id, place_id, visited_at, private_note, created_at, updated_at)
            VALUES ('legacy', ?, 'tokyo-a', '2026-08-08T12:00:00+00:00', NULL, 'now', 'now')
            """,
            (owner,),
        )
        connection.commit()
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO restaurant_visits
                    (id, owner_id, place_id, visited_at, reaction, rating, created_at, updated_at)
                VALUES ('bad', 'owner', 'tokyo-a', 'now', 'like_it', 6, 'now', 'now')
                """
            )

    client = TestClient(api.app)
    missing = client.patch(
        "/log/legacy", headers=_headers(owner), json={"private_note": "updated"}
    )
    completed = client.patch(
        "/log/legacy", headers=_headers(owner), json={"rating": 4}
    )

    assert missing.status_code == 200
    assert missing.json()["rating"] is None
    assert completed.status_code == 200
    assert completed.json()["rating"] == 4
    assert completed.json()["reaction"] == "like_it"


def test_owner_can_create_visit_with_safe_defaults(log_db):
    client = TestClient(api.app)
    owner = _owner_id()

    response = client.post(
        "/log",
        headers=_headers(owner),
        json={"place_id": "tokyo-a", "rating": 5},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["place_id"] == "tokyo-a"
    assert body["reaction"] == "love_it"
    assert body["rating"] == 5
    assert body["private_note"] is None
    assert datetime.fromisoformat(body["visited_at"]).tzinfo is not None
    assert body["restaurant"] == {
        "place_id": "tokyo-a",
        "name_ja": "Tokyo A JA",
        "name_en": "Tokyo A",
        "primary_category": "sushi",
        "neighborhood": "Asakusa",
        "display_area": "Asakusa",
        "fiyu_score": 91.0,
        "score_band": "excellent",
    }
    assert "owner_id" not in body
    assert "why_fiyu" not in body["restaurant"]


@pytest.mark.parametrize(
    ("rating", "compatibility_reaction"),
    [(1, "not_for_me"), (3, "like_it"), (5, "love_it")],
)
def test_integer_star_ratings_persist_exactly(log_db, rating, compatibility_reaction):
    client = TestClient(api.app)
    response = _create_visit(client, _owner_id(), rating=rating)

    assert response.status_code == 201
    assert response.json()["rating"] == rating
    assert response.json()["reaction"] == compatibility_reaction


def test_visit_input_validation(log_db):
    client = TestClient(api.app)
    owner = _owner_id()

    naive_time = _create_visit(client, owner, visited_at="2026-08-08T12:00:00")
    long_note = _create_visit(client, owner, private_note="x" * 2001)
    missing_rating = client.post(
        "/log", headers=_headers(owner), json={"place_id": "tokyo-a"}
    )
    zero_rating = _create_visit(client, owner, rating=0)
    high_rating = _create_visit(client, owner, rating=6)
    non_integer_rating = _create_visit(client, owner, rating=3.5)

    assert naive_time.status_code == 422
    assert long_note.status_code == 422
    assert missing_rating.status_code == 422
    assert zero_rating.status_code == 422
    assert high_rating.status_code == 422
    assert non_integer_rating.status_code == 422


def test_owner_may_log_same_restaurant_multiple_times(log_db):
    client = TestClient(api.app)
    owner = _owner_id()

    first = _create_visit(client, owner, visited_at="2026-08-07T12:00:00Z")
    second = _create_visit(client, owner, visited_at="2026-08-08T12:00:00Z")

    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert len(client.get("/log", headers=_headers(owner)).json()) == 2


def test_visits_and_private_notes_are_owner_isolated(log_db):
    client = TestClient(api.app)
    owner_a = _owner_id()
    owner_b = _owner_id()
    created = _create_visit(client, owner_a, private_note="For my eyes only").json()

    assert client.get("/log", headers=_headers(owner_b)).json() == []
    assert client.get(f"/log/{created['id']}", headers=_headers(owner_b)).status_code == 404
    public = client.get("/public/restaurants/tokyo-a").json()
    assert "private_note" not in public
    assert "reaction" not in public
    assert "rating" not in public
    assert "For my eyes only" not in str(public)


def test_visit_requires_valid_published_restaurant(log_db):
    client = TestClient(api.app)
    owner = _owner_id()

    missing = _create_visit(client, owner, place_id="missing")
    hidden = _create_visit(client, owner, place_id="tokyo-hidden")

    assert missing.status_code == 404
    assert hidden.status_code == 404


def test_owner_can_edit_and_delete_visit(log_db):
    client = TestClient(api.app)
    owner = _owner_id()
    visit_id = _create_visit(client, owner, private_note="first").json()["id"]

    updated = client.patch(
        f"/log/{visit_id}",
        headers=_headers(owner),
        json={
            "visited_at": "2026-08-09T15:30:00+09:00",
            "rating": 1,
            "private_note": " revised ",
        },
    )
    deleted = client.delete(f"/log/{visit_id}", headers=_headers(owner))

    assert updated.status_code == 200
    assert updated.json()["visited_at"] == "2026-08-09T06:30:00+00:00"
    assert updated.json()["reaction"] == "not_for_me"
    assert updated.json()["rating"] == 1
    assert updated.json()["private_note"] == "revised"
    assert deleted.json() == {"deleted": True}
    assert client.get(f"/log/{visit_id}", headers=_headers(owner)).status_code == 404


def test_visits_are_sorted_by_visited_at_newest_first(log_db):
    client = TestClient(api.app)
    owner = _owner_id()
    _create_visit(client, owner, place_id="tokyo-a", visited_at="2026-08-07T12:00:00Z")
    _create_visit(client, owner, place_id="tokyo-b", visited_at="2026-08-09T12:00:00Z")

    body = client.get("/log", headers=_headers(owner)).json()

    assert [visit["place_id"] for visit in body] == ["tokyo-b", "tokyo-a"]


def test_not_visited_uses_visit_existence_and_final_visit_deletion(log_db):
    client = TestClient(api.app)
    owner = _owner_id()
    for place_id in ("tokyo-a", "tokyo-b"):
        saved = client.post(
            "/lists/default/items",
            headers=_headers(owner),
            json={"city_id": "tokyo", "place_id": place_id},
        )
        assert saved.status_code == 200

    first_visit = _create_visit(client, owner, place_id="tokyo-a").json()
    second_visit = _create_visit(
        client,
        owner,
        place_id="tokyo-a",
        visited_at="2026-08-09T12:00:00Z",
    ).json()

    def not_visited_ids() -> list[str]:
        response = client.get(
            "/lists/default/smart-views/not_visited",
            params={"city_id": "tokyo"},
            headers=_headers(owner),
        )
        assert response.status_code == 200
        return [item["place_id"] for item in response.json()["items"]]

    assert not_visited_ids() == ["tokyo-b"]
    client.delete(f"/log/{first_visit['id']}", headers=_headers(owner))
    assert not_visited_ids() == ["tokyo-b"]
    client.delete(f"/log/{second_visit['id']}", headers=_headers(owner))
    assert not_visited_ids() == ["tokyo-b", "tokyo-a"]


def test_save_state_remains_independent_from_visits(log_db):
    client = TestClient(api.app)
    owner = _owner_id()

    visit = _create_visit(client, owner, place_id="tokyo-a")
    membership = client.get(
        "/lists/default/membership",
        params={"city_id": "tokyo", "place_id": "tokyo-a"},
        headers=_headers(owner),
    )
    save = client.post(
        "/lists/default/items",
        headers=_headers(owner),
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )
    unsave = client.request(
        "DELETE",
        "/lists/default/items",
        headers=_headers(owner),
        json={"city_id": "tokyo", "place_id": "tokyo-a"},
    )

    assert visit.status_code == 201
    assert membership.json()["is_saved"] is False
    assert save.json()["changed"] is True
    assert unsave.json()["changed"] is True
    assert len(client.get("/log", headers=_headers(owner)).json()) == 1
