from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema


@pytest.fixture
def personalized_pick_api(tmp_path, monkeypatch):
    path = tmp_path / "personalized-picks.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        for index in range(3):
            connection.execute(
                """
                INSERT INTO restaurants
                    (place_id, title, city, neighborhood, latitude, longitude, rating, review_count)
                VALUES (?, ?, 'Tokyo', 'Asakusa', ?, ?, 4.5, 20)
                """,
                (f"pick-{index}", f"Secret {index}", 35.70 + index / 100, 139.70),
            )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        for index in range(3):
            connection.execute(
                """
                INSERT INTO public_restaurants(
                    place_id, name_en, primary_category, food_tags_json,
                    signature_dishes_json, latitude, longitude, map_display_eligible,
                    is_published, created_at, updated_at
                ) VALUES (?, ?, 'sushi', '[]', '[]', ?, ?, 1, 1, 'now', 'now')
                """,
                (f"pick-{index}", f"Secret {index}", 35.70 + index / 100, 139.70),
            )
        connection.commit()

    user_id = str(uuid4())
    event_id = str(uuid4())
    state = {"rating_count": 9, "event": None}

    monkeypatch.setattr(api, "DB_PATH", path)
    monkeypatch.setattr(api, "authenticated_supabase_user", lambda _header: {"id": user_id})
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: True)
    monkeypatch.setattr(
        api.shared_user_data,
        "latest_visit_ratings",
        lambda *, user_id: {f"rated-{index}": 4 for index in range(state["rating_count"])},
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "get_personalized_pick_event",
        lambda *, user_id: state["event"],
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "get_discovery_location",
        lambda *, user_id: {
            "configured": True,
            "location_mode": "manual",
            "discovery_label": "Asakusa",
            "discovery_latitude": 35.71,
            "discovery_longitude": 139.79,
        },
    )
    monkeypatch.setattr(
        api,
        "_plan_shared_daily_picks",
        lambda **_kwargs: (
            ("pick-0", "pick-1", "pick-2"),
            {"algorithm": "personalized-solo-v1", "source": "personalized_pick_event"},
        ),
    )

    def create_event(**kwargs):
        if state["event"] is None:
            state["event"] = {
                "id": event_id,
                "user_id": user_id,
                "city_id": "tokyo",
                "status": "available",
                "source": "personalized_pick_event",
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
        return state["event"]

    def dismiss_event(**kwargs):
        event = state["event"]
        if event is None or event["status"] != "available":
            return None
        event["dismissed_until"] = kwargs["dismissed_until"]
        event["dismissal_count"] += 1
        return event

    def select_event(**kwargs):
        event = state["event"]
        if event is None:
            return None
        if event["status"] == "selected":
            return event if event["selected_position"] == kwargs["position"] else None
        event["status"] = "selected"
        event["selected_position"] = kwargs["position"]
        event["selected_place_id"] = event["place_ids"][kwargs["position"]]
        event["selected_at"] = kwargs["selected_at"]
        event["active_until"] = kwargs["active_until"]
        event["dismissed_until"] = None
        return event

    monkeypatch.setattr(api.shared_user_data, "create_personalized_pick_event", create_event)
    monkeypatch.setattr(api.shared_user_data, "dismiss_personalized_pick_event", dismiss_event)
    monkeypatch.setattr(api.shared_user_data, "select_personalized_pick_event", select_event)
    return TestClient(api.app), state, event_id


def _headers():
    return {"Authorization": "Bearer test"}


def test_unique_rating_unlock_count_ignores_duplicate_restaurant_logs():
    visits = [
        {"place_id": "same", "rating": 5},
        {"place_id": "same", "rating": 2},
        *({"place_id": f"other-{index}", "rating": 4} for index in range(8)),
        {"place_id": "unrated", "rating": None},
    ]
    assert len(api._qualifying_rating_place_ids(visits)) == 9


def test_nine_unique_ratings_locked_and_exactly_ten_unlocks(personalized_pick_api):
    client, state, _ = personalized_pick_api
    locked_response = client.get("/personalized-picks/me", headers=_headers())
    assert locked_response.status_code == 200, locked_response.text
    locked = locked_response.json()
    assert locked["status"] == "locked"
    assert locked["qualifying_rating_count"] == 9

    state["rating_count"] = 10
    unlocked = client.get("/personalized-picks/me", headers=_headers()).json()
    assert unlocked["status"] == "unlocked_idle"
    assert unlocked["event_eligible"] is True


def test_event_is_stable_hidden_dismissible_and_selects_exactly_one(personalized_pick_api):
    client, state, event_id = personalized_pick_api
    state["rating_count"] = 10

    created = client.post("/personalized-picks/events", headers=_headers()).json()
    assert created["status"] == "event_available"
    assert created["card_count"] == 3
    assert "place_ids" not in created
    assert "Secret" not in str(created)
    assert client.get("/personalized-picks/me", headers=_headers()).json()["event_id"] == event_id

    dismissed = client.post(
        f"/personalized-picks/{event_id}/dismiss", headers=_headers()
    ).json()
    assert dismissed["status"] == "event_available"
    assert dismissed["dismissal_count"] == 1
    assert dismissed["dismissed_until"] is not None

    selected = client.post(
        f"/personalized-picks/{event_id}/select",
        headers=_headers(),
        json={"position": 1},
    ).json()
    assert selected["status"] == "selected"
    assert selected["selected_position"] == 1
    assert selected["selected_restaurant"]["place_id"] == "pick-1"
    assert "pick-0" not in str(selected)
    assert "pick-2" not in str(selected)

    conflict = client.post(
        f"/personalized-picks/{event_id}/select",
        headers=_headers(),
        json={"position": 2},
    )
    assert conflict.status_code == 409
    refreshed = client.get("/personalized-picks/me", headers=_headers()).json()
    assert refreshed["selected_restaurant"]["place_id"] == "pick-1"


def test_expired_selected_event_is_not_represented(personalized_pick_api):
    client, state, _ = personalized_pick_api
    state["rating_count"] = 10
    state["event"] = {
        "id": str(uuid4()),
        "created_at": (datetime.now(UTC) - timedelta(days=2)).isoformat(),
        "expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        "dismissal_count": 0,
        "selected_position": 0,
        "selected_place_id": "pick-0",
        "selected_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
        "active_until": (datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
        "place_ids": ["pick-0", "pick-1", "pick-2"],
    }
    response = client.get("/personalized-picks/me", headers=_headers()).json()
    assert response["status"] == "expired"
    assert response["card_count"] is None
    assert response["selected_restaurant"] is None
