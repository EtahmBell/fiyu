from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema


@pytest.fixture
def together_api(tmp_path, monkeypatch):
    db_path = tmp_path / "together.db"
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        categories = ("sushi", "ramen", "tempura", "izakaya")
        for index in range(16):
            category = categories[index % len(categories)]
            connection.execute(
                """
                INSERT INTO public_restaurants(
                  place_id, name_en, primary_category, latitude, longitude,
                  map_display_eligible, is_published, product_eligible, fiyu_score,
                  budget_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, ?, 'now', 'now')
                """,
                (f"place-{index}", f"Place {index}", category, 35.66, 139.70, 85 - index, '{"maximum":2500}' if index == 0 else None),
            )
        connection.commit()

    users = {name: str(uuid4()) for name in ("initiator", "invitee", "other", "partner3", "partner4")}
    profiles = {
        users["initiator"]: {"username": "ethan", "display_name": "Ethan", "avatar_url": None},
        users["invitee"]: {"username": "lianne", "display_name": "Lianne", "avatar_url": None},
        users["other"]: {"username": "other", "display_name": None, "avatar_url": None},
        users["partner3"]: {"username": "three", "display_name": "Partner Three", "avatar_url": None},
        users["partner4"]: {"username": "four", "display_name": "Partner Four", "avatar_url": None},
    }
    visits = defaultdict(list)
    visits[users["initiator"]] = [
        {"id": str(uuid4()), "place_id": f"rated-{index}", "rating": 5, "private_note": "secret"}
        for index in range(5)
    ]
    sessions: dict[str, dict] = {}
    by_hash: dict[str, str] = {}
    items = defaultdict(list)
    consumed = set()
    seen = defaultdict(dict)

    def authenticated(header):
        token = (header or "").removeprefix("Bearer ")
        if token not in users:
            raise api.SupabaseAuthError("invalid")
        return {"id": users[token]}

    def create_invite(**values):
        for row in sessions.values():
            if row["initiator_user_id"] == values["user_id"] and row["status"] == "pending":
                row["status"] = "cancelled"
        session_id = str(uuid4())
        row = {
            "id": session_id,
            "initiator_user_id": values["user_id"],
            "invitee_user_id": None,
            "status": "pending",
            "consumed_trial": False,
            "selection_metadata": {},
            "initiator_revealed_at": None,
            "invitee_revealed_at": None,
            **{key: value for key, value in values.items() if key != "user_id"},
        }
        row.update({
            "location_latitude": values["location_latitude"],
            "location_longitude": values["location_longitude"],
            "location_label": values["location_label"],
        })
        sessions[session_id] = row
        by_hash[values["token_hash"]] = session_id
        return row

    def accept_invite(**values):
        row = sessions[by_hash[values["token_hash"]]]
        if row["status"] != "pending":
            raise api.shared_user_data.SharedUserDataError("together_invite_not_pending")
        if row["initiator_user_id"] == values["invitee_user_id"]:
            raise api.shared_user_data.SharedUserDataError("together_self_invite")
        pair = {row["initiator_user_id"], values["invitee_user_id"]}
        generated_at = datetime.fromisoformat(values["generated_at"])
        current_generated = [
            existing for existing in sessions.values()
            if existing["status"] == "generated"
            and datetime.fromisoformat(existing["cycle_expires_at"]) > generated_at
        ]
        if any(
            {existing["initiator_user_id"], existing.get("invitee_user_id")} == pair
            for existing in current_generated
        ):
            raise api.shared_user_data.SharedUserDataError("together_pair_already_used")
        for participant in pair:
            count = sum(
                participant in {existing["initiator_user_id"], existing.get("invitee_user_id")}
                for existing in current_generated
            )
            if count >= 3:
                raise api.shared_user_data.SharedUserDataError("together_cycle_limit_reached")
        use_trial = not values["initiator_is_premium"]
        if use_trial and row["initiator_user_id"] in consumed:
            raise api.shared_user_data.SharedUserDataError("together_trial_consumed")
        row.update({
            "invitee_user_id": values["invitee_user_id"], "status": "generated",
            "generated_at": values["generated_at"], "accepted_at": values["generated_at"],
            "selection_metadata": values["selection_metadata"], "consumed_trial": use_trial,
        })
        items[row["id"]] = [
            {"place_id": place_id, "position": position}
            for position, place_id in enumerate(values["place_ids"])
        ]
        if use_trial:
            consumed.add(row["initiator_user_id"])
        return {"session_id": row["id"], "place_ids": values["place_ids"], "consumed_trial": use_trial}

    def reveal_session(*, session_id, user_id, revealed_at):
        row = sessions[session_id]
        if user_id == row["initiator_user_id"]:
            field = "initiator_revealed_at"
        elif user_id == row.get("invitee_user_id"):
            field = "invitee_revealed_at"
        else:
            raise api.shared_user_data.SharedUserDataError("together_session_forbidden")
        row[field] = row.get(field) or revealed_at
        for item in items[session_id]:
            seen[user_id][item["place_id"]] = row[field]
        return row[field]

    def cancel_invite(*, user_id, session_id, cancelled_at):
        row = sessions.get(session_id)
        if not row or row["initiator_user_id"] != user_id or row["status"] != "pending":
            return False
        row.update({"status": "cancelled", "cancelled_at": cancelled_at})
        return True

    monkeypatch.setattr(api, "DB_PATH", db_path)
    monkeypatch.setattr(api, "_legacy_client_identity_allowed", lambda: False)
    monkeypatch.setattr(api, "authenticated_supabase_user", authenticated)
    monkeypatch.setattr(api, "has_premium_access", lambda _: False)
    monkeypatch.setattr(api.shared_user_data, "get_profile", lambda *, user_id: profiles[user_id])
    monkeypatch.setattr(api.shared_user_data, "list_visits", lambda *, user_id: list(visits[user_id]))
    monkeypatch.setattr(api.shared_user_data, "together_trial_consumed", lambda *, user_id: user_id in consumed)
    monkeypatch.setattr(api.shared_user_data, "list_together_sessions", lambda *, user_id: [row for row in sessions.values() if user_id in {row["initiator_user_id"], row.get("invitee_user_id")}])
    monkeypatch.setattr(api.shared_user_data, "together_pick_items", lambda *, session_id: list(items[session_id]))
    monkeypatch.setattr(api.shared_user_data, "get_together_session", lambda *, session_id: sessions.get(session_id))
    monkeypatch.setattr(api.shared_user_data, "reveal_together_session", reveal_session)
    monkeypatch.setattr(api.shared_user_data, "get_discovery_location", lambda *, user_id: {"configured": True, "location_mode": "preview", "discovery_label": "Shibuya", "discovery_latitude": 35.66, "discovery_longitude": 139.70})
    monkeypatch.setattr(api.shared_user_data, "get_active_daily_picks", lambda **_: None)
    monkeypatch.setattr(api.shared_user_data, "get_recent_daily_pick_rounds", lambda **_: [])
    monkeypatch.setattr(api.shared_user_data, "create_together_invite", create_invite)
    monkeypatch.setattr(api.shared_user_data, "get_together_session_by_token_hash", lambda *, token_hash: sessions.get(by_hash.get(token_hash, "")))
    monkeypatch.setattr(api.shared_user_data, "accept_together_invite", accept_invite)
    monkeypatch.setattr(api.shared_user_data, "cancel_together_invite", cancel_invite)
    monkeypatch.setattr(api.shared_user_data, "saved_place_ids", lambda **_: set())
    monkeypatch.setattr(api.shared_user_data, "seen_history", lambda *, user_id: dict(seen[user_id]))
    monkeypatch.setattr(api.shared_user_data, "visited_place_ids", lambda **_: [])
    monkeypatch.setattr(api.shared_user_data, "latest_visit_ratings", lambda **_: {})
    return TestClient(api.app), users, sessions, consumed, visits


def auth(name: str):
    return {"Authorization": f"Bearer {name}"}


def test_free_initiator_creates_pending_without_consuming_trial(together_api):
    client, users, sessions, consumed, _ = together_api
    response = client.post("/together/invites", headers=auth("initiator"))
    assert response.status_code == 200, response.text
    assert response.json()["session"]["status"] == "pending"
    assert users["initiator"] not in consumed
    assert len(sessions) == 1


def test_invitee_without_ratings_accepts_and_private_taste_is_not_exposed(together_api):
    client, users, _, consumed, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    preview = client.get(f"/together/invites/{token}")
    assert preview.status_code == 200
    assert preview.json()["initiator"] == {"display_name": "Ethan", "username": "ethan", "avatar_url": None}
    assert "private" not in preview.text and users["initiator"] not in preview.text
    accepted = client.post(f"/together/invites/{token}/accept", headers=auth("invitee"))
    assert accepted.status_code == 200
    assert accepted.json()["restaurants"] == []
    assert accepted.json()["partner"]["display_name"] == "Ethan"
    assert users["initiator"] in consumed


def test_self_accept_is_rejected(together_api):
    client, _, sessions, consumed, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    response = client.post(f"/together/invites/{token}/accept", headers=auth("initiator"))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "together_self_invite"
    assert sessions[created["session"]["session_id"]]["status"] == "pending"
    assert consumed == set()
    preview = client.get(f"/together/invites/{token}", headers=auth("initiator"))
    assert preview.json()["is_own_invite"] is True


def test_invite_preview_is_public_but_account_state_requires_auth(together_api):
    client, _, _, _, _ = together_api
    assert client.get("/together/me").status_code == 401
    assert client.get("/together/invites/not-a-valid-token").status_code == 200
    assert client.get("/together/invites/not-a-valid-token").json()["status"] == "invalid"


def test_initiator_needs_five_explicit_ratings(together_api):
    client, users, sessions, consumed, visits = together_api
    visits[users["initiator"]].pop()
    response = client.post("/together/invites", headers=auth("initiator"))
    assert response.status_code == 403
    assert sessions == {}
    assert consumed == set()


def test_cancelled_free_invite_does_not_consume_trial(together_api):
    client, users, _, consumed, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    response = client.delete(
        f"/together/sessions/{created['session']['session_id']}",
        headers=auth("initiator"),
    )
    assert response.status_code == 204
    assert users["initiator"] not in consumed
    assert client.post("/together/invites", headers=auth("initiator")).status_code == 200


def test_consumed_trial_blocks_free_initiation_but_not_premium(together_api, monkeypatch):
    client, users, _, consumed, _ = together_api
    consumed.add(users["initiator"])
    assert client.post("/together/invites", headers=auth("initiator")).status_code == 403
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["initiator"])
    response = client.post("/together/invites", headers=auth("initiator"))
    assert response.status_code == 200


def test_second_accept_cannot_replace_first_invitee(together_api):
    client, users, sessions, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    first = client.post(f"/together/invites/{token}/accept", headers=auth("invitee"))
    assert first.status_code == 200
    response = client.post(f"/together/invites/{token}/accept", headers=auth("other"))
    assert response.status_code == 409
    assert sessions[created["session"]["session_id"]]["invitee_user_id"] == users["invitee"]


def test_invite_uses_immutable_initiator_location_snapshot(together_api, monkeypatch):
    client, _, sessions, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    session_id = created["session"]["session_id"]
    monkeypatch.setattr(
        api.shared_user_data,
        "get_discovery_location",
        lambda *, user_id: {
            "location_mode": "current",
            "discovery_label": "Ginza",
            "discovery_latitude": 35.671,
            "discovery_longitude": 139.765,
        },
    )
    row = sessions[session_id]
    assert row["location_mode"] == "preview"
    assert row["location_label"] == "Shibuya"
    assert row["location_latitude"] == 35.66
    assert row["location_longitude"] == 139.70


def test_pending_invite_keeps_full_24_hour_window_near_solo_rollover(
    together_api, monkeypatch
):
    client, _, _, _, _ = together_api
    now = datetime.now(UTC)
    monkeypatch.setattr(
        api.shared_user_data,
        "get_active_daily_picks",
        lambda **_: {
            "id": "solo-near-rollover",
            "expires_at": (now + timedelta(minutes=5)).isoformat(),
        },
    )
    created = client.post("/together/invites", headers=auth("initiator")).json()
    expires_at = datetime.fromisoformat(created["session"]["expires_at"])
    cycle_expires_at = datetime.fromisoformat(created["session"]["cycle_expires_at"])
    assert expires_at >= now + timedelta(hours=23, minutes=59)
    assert cycle_expires_at >= expires_at


def test_unresolved_location_cannot_create_session(together_api, monkeypatch):
    client, _, sessions, consumed, _ = together_api
    monkeypatch.setattr(
        api.shared_user_data,
        "get_discovery_location",
        lambda *, user_id: None,
    )
    response = client.post("/together/invites", headers=auth("initiator"))
    assert response.status_code == 409
    assert sessions == {}
    assert consumed == set()


def test_expired_invite_preview_is_restrained_and_trial_remains_unused(together_api):
    client, users, sessions, consumed, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    sessions[created["session"]["session_id"]]["expires_at"] = "2000-01-01T00:00:00+00:00"
    preview = client.get(f"/together/invites/{token}")
    assert preview.status_code == 200
    assert preview.json()["status"] == "expired"
    assert users["initiator"] not in consumed


def test_premium_generation_does_not_consume_lifetime_trial(together_api, monkeypatch):
    client, users, _, consumed, _ = together_api
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["initiator"])
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    accepted = client.post(f"/together/invites/{token}/accept", headers=auth("invitee"))
    assert accepted.status_code == 200
    assert accepted.json()["consumed_trial"] is False
    assert users["initiator"] not in consumed


def test_generated_participant_can_start_with_a_different_partner_in_cycle(together_api, monkeypatch):
    client, users, _, _, _ = together_api
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["initiator"])
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    first = client.post(f"/together/invites/{token}/accept", headers=auth("invitee"))
    assert first.status_code == 200
    first_revealed = client.post(
        f"/together/sessions/{first.json()['session_id']}/reveal",
        headers=auth("initiator"),
    ).json()
    second = client.post("/together/invites", headers=auth("initiator"))
    assert second.status_code == 200
    second_token = second.json()["invite_url"].rsplit("/", 1)[-1]
    second_result = client.post(f"/together/invites/{second_token}/accept", headers=auth("other"))
    assert second_result.status_code == 200
    second_revealed = client.post(
        f"/together/sessions/{second_result.json()['session_id']}/reveal",
        headers=auth("initiator"),
    ).json()
    assert {
        restaurant["place_id"] for restaurant in first_revealed["restaurants"]
    }.isdisjoint(
        restaurant["place_id"] for restaurant in second_revealed["restaurants"]
    )
    state = client.get("/together/me", headers=auth("initiator")).json()
    assert state["generated_session_count"] == 2
    assert len(state["current_sessions"]) == 2
    assert state["can_initiate"] is True


def test_same_pair_is_blocked_in_reverse_direction(together_api):
    client, users, _, _, visits = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    assert client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).status_code == 200
    visits[users["invitee"]] = [
        {"id": str(uuid4()), "place_id": f"invitee-rated-{index}", "rating": 4}
        for index in range(5)
    ]
    reverse = client.post("/together/invites", headers=auth("invitee")).json()
    reverse_token = reverse["invite_url"].rsplit("/", 1)[-1]
    rejected = client.post(f"/together/invites/{reverse_token}/accept", headers=auth("initiator"))
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "together_pair_already_used"


def test_participant_cycle_cap_is_three_generated_sessions(together_api, monkeypatch):
    client, users, _, _, _ = together_api
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["initiator"])
    for partner in ("invitee", "other", "partner3"):
        created = client.post("/together/invites", headers=auth("initiator")).json()
        token = created["invite_url"].rsplit("/", 1)[-1]
        assert client.post(f"/together/invites/{token}/accept", headers=auth(partner)).status_code == 200
    state = client.get("/together/me", headers=auth("initiator")).json()
    assert state["generated_session_count"] == 3
    assert state["block_reason"] == "cycle_limit_reached"
    assert state["can_initiate"] is False
    assert client.post("/together/invites", headers=auth("initiator")).status_code == 409


def test_same_pair_is_eligible_after_the_existing_cycle_expires(together_api, monkeypatch):
    client, users, sessions, _, _ = together_api
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["initiator"])
    first = client.post("/together/invites", headers=auth("initiator")).json()
    token = first["invite_url"].rsplit("/", 1)[-1]
    assert client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).status_code == 200
    sessions[first["session"]["session_id"]]["cycle_expires_at"] = "2000-01-01T00:00:00+00:00"
    second = client.post("/together/invites", headers=auth("initiator")).json()
    second_token = second["invite_url"].rsplit("/", 1)[-1]
    assert client.post(f"/together/invites/{second_token}/accept", headers=auth("invitee")).status_code == 200


def test_failed_generation_does_not_consume_pair_slot(together_api, monkeypatch):
    client, _, sessions, consumed, _ = together_api
    original_selector = api.select_together_pick_plan
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    monkeypatch.setattr(api, "select_together_pick_plan", lambda *args, **kwargs: ((), {}))
    failed = client.post(f"/together/invites/{token}/accept", headers=auth("invitee"))
    assert failed.status_code == 409
    assert sessions[created["session"]["session_id"]]["status"] == "pending"
    assert consumed == set()
    monkeypatch.setattr(api, "select_together_pick_plan", original_selector)
    assert client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).status_code == 200


def test_cancelled_pending_invite_does_not_consume_pair_slot(together_api):
    client, _, _, _, _ = together_api
    first = client.post("/together/invites", headers=auth("initiator")).json()
    assert client.delete(
        f"/together/sessions/{first['session']['session_id']}", headers=auth("initiator")
    ).status_code == 204
    second = client.post("/together/invites", headers=auth("initiator")).json()
    token = second["invite_url"].rsplit("/", 1)[-1]
    assert client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).status_code == 200


def test_invitee_can_accept_multiple_partners_without_consuming_trial(together_api, monkeypatch):
    client, users, _, consumed, visits = together_api
    for initiator in ("initiator", "other"):
        visits[users[initiator]] = [
            {"id": str(uuid4()), "place_id": f"{initiator}-rated-{index}", "rating": 5}
            for index in range(5)
        ]
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["other"])
    for initiator in ("initiator", "other"):
        created = client.post("/together/invites", headers=auth(initiator)).json()
        token = created["invite_url"].rsplit("/", 1)[-1]
        assert client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).status_code == 200
    assert users["invitee"] not in consumed
    state = client.get("/together/me", headers=auth("invitee")).json()
    assert state["generated_session_count"] == 2


def test_generated_picks_enter_each_participants_discovery_only_when_revealed(together_api):
    client, _, _, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    accepted = client.post(f"/together/invites/{token}/accept", headers=auth("invitee"))
    session_id = accepted.json()["session_id"]
    assert accepted.json()["restaurants"] == []
    assert accepted.json()["reveal_pending"] is True
    assert client.get("/map/restaurants", headers=auth("initiator")).json() == []
    assert client.get("/map/restaurants", headers=auth("invitee")).json() == []

    revealed = client.post(f"/together/sessions/{session_id}/reveal", headers=auth("initiator"))
    assert revealed.status_code == 200
    assert revealed.json()["reveal_pending"] is False
    assert len(revealed.json()["restaurants"]) == 3
    place_ids = [restaurant["place_id"] for restaurant in revealed.json()["restaurants"]]
    assert client.get("/map/restaurants", headers=auth("invitee")).json() == []
    mapped = client.get("/map/restaurants", headers=auth("initiator"))
    assert {restaurant["place_id"] for restaurant in mapped.json()} == set(place_ids)

    invitee_state = client.get("/together/me", headers=auth("invitee")).json()
    assert invitee_state["session"]["reveal_pending"] is True
    client.post(f"/together/sessions/{session_id}/reveal", headers=auth("invitee"))
    assert {restaurant["place_id"] for restaurant in client.get("/map/restaurants", headers=auth("invitee")).json()} == set(place_ids)


def test_generated_session_and_reveal_are_participant_scoped(together_api):
    client, _, _, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    accepted = client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).json()
    session_id = accepted["session_id"]
    assert client.get(f"/together/sessions/{session_id}", headers=auth("other")).status_code == 403
    assert client.post(f"/together/sessions/{session_id}/reveal", headers=auth("other")).status_code == 403
    assert client.get(f"/together/sessions/{session_id}", headers=auth("invitee")).status_code == 200


def test_unrevealed_participant_can_resume_after_cycle_expiry(together_api):
    client, _, sessions, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    accepted = client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).json()
    sessions[accepted["session_id"]]["cycle_expires_at"] = "2000-01-01T00:00:00+00:00"
    state = client.get("/together/me", headers=auth("invitee")).json()
    assert state["session"]["session_id"] == accepted["session_id"]
    assert state["session"]["reveal_pending"] is True


def test_prior_cycle_revealed_session_stays_visible_but_does_not_consume_current_quota(
    together_api, monkeypatch
):
    client, users, sessions, _, _ = together_api
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["initiator"])
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    generated = client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).json()
    client.post(f"/together/sessions/{generated['session_id']}/reveal", headers=auth("initiator"))
    sessions[generated["session_id"]]["cycle_expires_at"] = "2000-01-01T00:00:00+00:00"

    state = client.get("/together/me", headers=auth("initiator")).json()
    assert [item["session_id"] for item in state["current_sessions"]] == [generated["session_id"]]
    assert state["generated_session_count"] == 0
    assert state["can_initiate"] is True


def test_same_pair_can_have_two_active_rounds_across_cycles(together_api, monkeypatch):
    client, users, sessions, _, _ = together_api
    monkeypatch.setattr(api, "has_premium_access", lambda user_id: user_id == users["initiator"])
    session_ids = []
    for index in range(2):
        created = client.post("/together/invites", headers=auth("initiator")).json()
        token = created["invite_url"].rsplit("/", 1)[-1]
        generated = client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).json()
        session_ids.append(generated["session_id"])
        client.post(f"/together/sessions/{generated['session_id']}/reveal", headers=auth("initiator"))
        if index == 0:
            sessions[generated["session_id"]]["cycle_expires_at"] = "2000-01-01T00:00:00+00:00"

    state = client.get("/together/me", headers=auth("initiator")).json()
    assert {item["session_id"] for item in state["current_sessions"]} == set(session_ids)
    assert state["generated_session_count"] == 1


def test_revealed_lifecycle_is_participant_specific(together_api):
    client, _, sessions, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    generated = client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).json()
    row = sessions[generated["session_id"]]
    row["cycle_expires_at"] = "2000-01-01T00:00:00+00:00"
    row["initiator_revealed_at"] = (datetime.now(UTC) - timedelta(hours=73)).isoformat()
    row["invitee_revealed_at"] = (datetime.now(UTC) - timedelta(hours=63)).isoformat()

    initiator_state = client.get("/together/me", headers=auth("initiator")).json()
    invitee_state = client.get("/together/me", headers=auth("invitee")).json()
    assert initiator_state["current_sessions"] == []
    assert [item["session_id"] for item in invitee_state["current_sessions"]] == [generated["session_id"]]


def test_unrevealed_session_expires_without_seen_mutation(together_api):
    client, users, sessions, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    generated = client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).json()
    row = sessions[generated["session_id"]]
    row["generated_at"] = (datetime.now(UTC) - timedelta(hours=73)).isoformat()
    row["cycle_expires_at"] = "2000-01-01T00:00:00+00:00"

    state = client.get("/together/me", headers=auth("invitee")).json()
    assert state["current_sessions"] == []
    expired = client.post(
        f"/together/sessions/{generated['session_id']}/reveal",
        headers=auth("invitee"),
    )
    assert expired.status_code == 410
    assert expired.json()["detail"]["code"] == "together_reveal_expired"
    assert api.shared_user_data.seen_history(user_id=users["invitee"]) == {}


def test_together_migration_keeps_generation_atomic_and_account_scoped():
    migration = (
        Path(__file__).parents[1]
        / "supabase"
        / "migrations"
        / "202609090001_fiyu_together_v1.sql"
    ).read_text(encoding="utf-8").lower()
    assert "invite_token_hash text not null unique" in migration
    assert "pg_advisory_xact_lock" in migration
    assert "where invite_token_hash = p_token_hash for update" in migration
    assert "status = 'generated'" in migration
    assert "fiyu_together_trials" in migration
    assert "fiyu_restaurant_seen" in migration
    assert "on delete cascade" in migration
    assert "enable row level security" in migration
    assert "initiator_user_id = auth.uid() or invitee_user_id = auth.uid()" in migration
    assert "from public, anon, authenticated" in migration
    assert "to service_role" in migration
    reveal_migration = (
        Path(__file__).parents[1]
        / "supabase"
        / "migrations"
        / "202609100001_together_participant_reveal.sql"
    ).read_text(encoding="utf-8").lower()
    assert "initiator_revealed_at" in reveal_migration
    assert "invitee_revealed_at" in reveal_migration
    assert "reveal_fiyu_together_session" in reveal_migration
    assert "set initiator_revealed_at = coalesce(initiator_revealed_at, generated_at)" in reveal_migration
    assert "together_session_forbidden" in reveal_migration
    assert "to service_role" in reveal_migration
    multi_partner_migration = (
        Path(__file__).parents[1]
        / "supabase"
        / "migrations"
        / "202609110001_together_multi_partner.sql"
    ).read_text(encoding="utf-8").lower()
    assert "fiyu_together_one_pair_per_cycle" in multi_partner_migration
    assert "together:pair:" in multi_partner_migration
    assert "together_pair_already_used" in multi_partner_migration
    assert "together_cycle_limit_reached" in multi_partner_migration
    assert ">= 3" in multi_partner_migration
    assert "fiyu_together_pick_items ti" in multi_partner_migration
    lifecycle_migration = (
        Path(__file__).parents[1]
        / "supabase"
        / "migrations"
        / "202609120001_together_reveal_readiness_expiry.sql"
    ).read_text(encoding="utf-8").lower()
    assert "interval '72 hours'" in lifecycle_migration
    assert "together_reveal_expired" in lifecycle_migration
    assert "prior_revealed_at is null" in lifecycle_migration
