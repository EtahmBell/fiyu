from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.daily_picks import seed_served_history, served_place_ids
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema


@pytest.fixture
def daily_picks_db(tmp_path, monkeypatch):
    path = tmp_path / "daily-picks.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.executemany(
            """
            INSERT INTO public_restaurants (
                place_id, name_en, primary_category, food_tags_json,
                signature_dishes_json, discovery_area, discovery_areas_json,
                fiyu_score, is_published, created_at, updated_at
            ) VALUES (?, ?, ?, ?, '[]', 'Shibuya', '[]', ?, 1, 'now', 'now')
            """,
            [
                ("one", "One", "sushi", '["sushi"]', 91.0),
                ("two", "Two", "ramen", '["ramen"]', 89.0),
                ("three", "Three", "yakitori", '["yakitori"]', 87.0),
                ("four", "Four", "tempura", '["tempura"]', 85.0),
                ("five", "Five", "izakaya", '["izakaya"]', 83.0),
                ("six", "Six", "yakiniku", '["yakiniku"]', 81.0),
                ("seven", "Seven", "Japanese", '["Japanese cuisine"]', 79.0),
            ],
        )
        connection.commit()
    monkeypatch.setattr(api, "DB_PATH", path)
    return path


def _owner() -> str:
    return str(uuid4())


def _payload(candidate_ids: list[str] | None = None, *, seed: int = 1) -> dict[str, object]:
    return {
        "city_id": "tokyo",
        "candidate_place_ids": candidate_ids or [
            "one", "two", "three", "four", "five", "six", "seven"
        ],
        "legacy_served_place_ids": [],
        "categories": [],
        "non_japanese": "occasionally",
        "active_area": "Shibuya",
        "seed": seed,
        "requested_count": 3,
    }


def _assign(client: TestClient, owner: str, payload: dict[str, object]):
    return client.post(
        "/daily-picks/assign",
        headers={"X-Fiyu-Client-Id": owner},
        json=payload,
    )


def test_assignment_records_all_picks_as_served_before_any_reveal_or_save(daily_picks_db):
    owner = _owner()
    response = _assign(TestClient(api.app), owner, _payload())

    assert response.status_code == 200
    assigned = set(response.json()["place_ids"])
    assert len(assigned) == 3
    assert served_place_ids(daily_picks_db, owner_id=owner) == assigned


def test_future_assignment_excludes_revealed_and_concealed_assignments_equally(daily_picks_db):
    client = TestClient(api.app)
    owner = _owner()
    first = _assign(client, owner, _payload(seed=1)).json()["place_ids"]
    second_response = _assign(client, owner, _payload(seed=2))

    assert second_response.status_code == 200
    second = second_response.json()["place_ids"]
    assert set(first).isdisjoint(second)
    assert served_place_ids(daily_picks_db, owner_id=owner) == set(first + second)


def test_save_state_is_not_part_of_repeat_eligibility(daily_picks_db):
    client = TestClient(api.app)
    owner = _owner()
    first = _assign(client, owner, _payload(seed=3)).json()["place_ids"]

    # The assignment contract intentionally contains no saved/unsaved input.
    second = _assign(client, owner, _payload(seed=4)).json()["place_ids"]
    assert set(first).isdisjoint(second)


def test_same_restaurants_remain_eligible_for_a_different_owner(daily_picks_db):
    client = TestClient(api.app)
    first = _assign(client, _owner(), _payload(seed=5)).json()["place_ids"]
    second = _assign(client, _owner(), _payload(seed=5)).json()["place_ids"]

    assert first == second


def test_legacy_history_seed_is_unique(daily_picks_db):
    owner = _owner()
    assert seed_served_history(daily_picks_db, owner_id=owner, place_ids=["one", "one"]) == 1
    assert seed_served_history(daily_picks_db, owner_id=owner, place_ids=["one"]) == 0
    assert served_place_ids(daily_picks_db, owner_id=owner) == {"one"}

    with connect(daily_picks_db) as connection:
        count = connection.execute(
            "SELECT COUNT(*) AS count FROM daily_pick_served_history WHERE owner_id = ?",
            (owner,),
        ).fetchone()["count"]
    assert count == 1


def test_insufficient_unseen_pool_never_repeats_or_creates_partial_round(daily_picks_db):
    client = TestClient(api.app)
    owner = _owner()
    candidates = ["one", "two", "three", "four", "five"]
    first = _assign(client, owner, _payload(candidates, seed=6)).json()["place_ids"]
    response = _assign(client, owner, _payload(candidates, seed=7))

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "insufficient_unseen_pool"
    assert served_place_ids(daily_picks_db, owner_id=owner) == set(first)
    with connect(daily_picks_db) as connection:
        rounds = connection.execute(
            "SELECT COUNT(*) AS count FROM daily_pick_rounds WHERE owner_id = ?",
            (owner,),
        ).fetchone()["count"]
    assert rounds == 1


def test_reliable_legacy_assignment_is_excluded_before_selection(daily_picks_db):
    client = TestClient(api.app)
    owner = _owner()
    payload = _payload(seed=8)
    payload["legacy_served_place_ids"] = ["one", "two", "three"]
    response = _assign(client, owner, payload)

    assert response.status_code == 200
    assert {"one", "two", "three"}.isdisjoint(response.json()["place_ids"])
