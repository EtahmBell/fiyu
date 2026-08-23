from __future__ import annotations

from fiyu import supabase_user_data


def test_visited_place_ids_are_unique_and_latest_first(monkeypatch):
    captured: dict[str, object] = {}

    def request(path, *, query):
        captured.update({"path": path, "query": query})
        return [
            {"place_id": "recent"},
            {"place_id": "older"},
            {"place_id": "recent"},
        ]

    monkeypatch.setattr(supabase_user_data, "_request", request)

    assert supabase_user_data.visited_place_ids(user_id="user-a") == [
        "recent",
        "older",
    ]
    assert captured == {
        "path": "fiyu_restaurant_visits",
        "query": {
            "select": "place_id",
            "user_id": "eq.user-a",
            "order": "visited_at.desc,created_at.desc,id.desc",
        },
    }


def test_active_pick_lookup_uses_strict_expiration_boundary(monkeypatch):
    requests: list[tuple[str, dict[str, str]]] = []

    def request(path, *, query):
        requests.append((path, query))
        if path == "fiyu_daily_pick_rounds":
            return [
                {
                    "id": "round-a",
                    "assigned_at": "2026-08-21T12:00:00+00:00",
                    "expires_at": "2026-08-22T12:00:00+00:00",
                    "selection_metadata": {},
                }
            ]
        return [
            {"place_id": "a", "position": 0},
            {"place_id": "b", "position": 1},
            {"place_id": "c", "position": 2},
        ]

    monkeypatch.setattr(supabase_user_data, "_now", lambda: "2026-08-22T12:00:00+00:00")
    monkeypatch.setattr(supabase_user_data, "_request", request)

    active = supabase_user_data.get_active_daily_picks(user_id="user-a", city_id="tokyo")

    assert active is not None
    assert active["place_ids"] == ["a", "b", "c"]
    assert requests[0][1]["expires_at"] == "gt.2026-08-22T12:00:00+00:00"
