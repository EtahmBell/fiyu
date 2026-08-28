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
                    "revealed_at": "2026-08-21T12:05:00+00:00",
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
    assert active["revealed_at"] == "2026-08-21T12:05:00+00:00"
    assert "revealed_at" in requests[0][1]["select"]
    assert requests[0][1]["expires_at"] == "gt.2026-08-22T12:00:00+00:00"


def test_reveal_pick_round_uses_atomic_service_role_rpc(monkeypatch):
    captured: dict[str, object] = {}

    def request(path, *, method, body):
        captured.update({"path": path, "method": method, "body": body})
        return {
            "round_id": "round-a",
            "revealed_at": "2026-08-21T12:05:00+00:00",
        }

    monkeypatch.setattr(supabase_user_data, "_request", request)

    revealed_at = supabase_user_data.reveal_active_daily_picks(
        user_id="user-a",
        round_id="round-a",
        revealed_at="2026-08-21T12:05:00+00:00",
    )

    assert revealed_at == "2026-08-21T12:05:00+00:00"
    assert captured == {
        "path": "rpc/reveal_fiyu_daily_picks",
        "method": "POST",
        "body": {
            "p_user_id": "user-a",
            "p_round_id": "round-a",
            "p_revealed_at": "2026-08-21T12:05:00+00:00",
        },
    }


def test_active_pick_repair_accepts_partial_snapshot_and_uses_atomic_rpc(monkeypatch):
    captured: dict[str, object] = {}

    def request(path, *, method, body):
        captured.update({"path": path, "method": method, "body": body})
        return {
            "round_id": "round-a",
            "assigned_at": "2026-08-21T12:00:00+00:00",
            "expires_at": "2026-08-22T12:00:00+00:00",
            "selection_metadata": body["p_selection_metadata"],
            "place_ids": body["p_place_ids"],
        }

    monkeypatch.setattr(supabase_user_data, "_request", request)

    repaired = supabase_user_data.repair_active_daily_picks(
        user_id="user-a",
        round_id="round-a",
        expected_place_ids=["a", "excluded-b", "excluded-c"],
        place_ids=["a", "d"],
        selection_metadata={"snapshot_repaired_at": "now"},
        repaired_at="2026-08-21T13:00:00+00:00",
    )

    assert repaired["place_ids"] == ["a", "d"]
    assert captured["path"] == "rpc/repair_active_fiyu_picks"
    assert captured["method"] == "POST"
    assert captured["body"] == {
        "p_user_id": "user-a",
        "p_round_id": "round-a",
        "p_expected_place_ids": ["a", "excluded-b", "excluded-c"],
        "p_place_ids": ["a", "d"],
        "p_selection_metadata": {"snapshot_repaired_at": "now"},
        "p_repaired_at": "2026-08-21T13:00:00+00:00",
    }


def test_recent_round_lookup_returns_all_three_persisted_items(monkeypatch):
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
            {"round_id": "round-a", "place_id": "c", "position": 2},
            {"round_id": "round-a", "place_id": "a", "position": 0},
            {"round_id": "round-a", "place_id": "b", "position": 1},
        ]

    monkeypatch.setattr(supabase_user_data, "_request", request)

    rounds = supabase_user_data.get_recent_daily_pick_rounds(
        user_id="user-a",
        city_id="tokyo",
        assigned_after="2026-08-20T12:00:00+00:00",
        expired_at_or_before="2026-08-22T13:00:00+00:00",
    )

    assert rounds[0]["place_ids"] == ["a", "b", "c"]
    assert requests[0][1]["assigned_at"] == "gt.2026-08-20T12:00:00+00:00"
    assert requests[0][1]["expires_at"] == "lte.2026-08-22T13:00:00+00:00"
