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
        for index, category in enumerate(("sushi", "ramen", "tempura", "izakaya")):
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

    users = {"initiator": str(uuid4()), "invitee": str(uuid4()), "other": str(uuid4())}
    profiles = {
        users["initiator"]: {"username": "ethan", "display_name": "Ethan", "avatar_url": None},
        users["invitee"]: {"username": "lianne", "display_name": "Lianne", "avatar_url": None},
        users["other"]: {"username": "other", "display_name": None, "avatar_url": None},
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
        if any(
            existing["status"] == "generated"
            and ({existing["initiator_user_id"], existing.get("invitee_user_id")} & {row["initiator_user_id"], values["invitee_user_id"]})
            for existing in sessions.values()
        ):
            raise api.shared_user_data.SharedUserDataError("together_cycle_quota_used")
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
    monkeypatch.setattr(api.shared_user_data, "get_discovery_location", lambda *, user_id: {"configured": True, "location_mode": "preview", "discovery_label": "Shibuya", "discovery_latitude": 35.66, "discovery_longitude": 139.70})
    monkeypatch.setattr(api.shared_user_data, "get_active_daily_picks", lambda **_: None)
    monkeypatch.setattr(api.shared_user_data, "get_recent_daily_pick_rounds", lambda **_: [])
    monkeypatch.setattr(api.shared_user_data, "create_together_invite", create_invite)
    monkeypatch.setattr(api.shared_user_data, "get_together_session_by_token_hash", lambda *, token_hash: sessions.get(by_hash.get(token_hash, "")))
    monkeypatch.setattr(api.shared_user_data, "accept_together_invite", accept_invite)
    monkeypatch.setattr(api.shared_user_data, "cancel_together_invite", cancel_invite)
    monkeypatch.setattr(api.shared_user_data, "saved_place_ids", lambda **_: set())
    monkeypatch.setattr(api.shared_user_data, "seen_history", lambda **_: {})
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
    assert len(accepted.json()["restaurants"]) == 3
    assert accepted.json()["partner"]["display_name"] == "Ethan"
    assert users["initiator"] in consumed


def test_self_accept_is_rejected(together_api):
    client, _, _, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    response = client.post(f"/together/invites/{token}/accept", headers=auth("initiator"))
    assert response.status_code == 409


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
    assert client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).status_code == 200
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


def test_generated_participant_cannot_start_second_session_in_cycle(together_api):
    client, users, _, _, visits = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    assert client.post(f"/together/invites/{token}/accept", headers=auth("invitee")).status_code == 200
    visits[users["invitee"]] = [
        {"id": str(uuid4()), "place_id": f"invitee-rated-{index}", "rating": 4}
        for index in range(5)
    ]
    response = client.post("/together/invites", headers=auth("invitee"))
    assert response.status_code == 409
    state = client.get("/together/me", headers=auth("invitee")).json()
    assert state["block_reason"] == "cycle_quota_used"
    assert state["session"]["status"] == "generated"


def test_generated_picks_enter_both_participants_discovery_and_map_state(together_api):
    client, _, _, _, _ = together_api
    created = client.post("/together/invites", headers=auth("initiator")).json()
    token = created["invite_url"].rsplit("/", 1)[-1]
    accepted = client.post(f"/together/invites/{token}/accept", headers=auth("invitee"))
    place_ids = [restaurant["place_id"] for restaurant in accepted.json()["restaurants"]]
    for participant in ("initiator", "invitee"):
        mapped = client.get("/map/restaurants", headers=auth(participant))
        assert mapped.status_code == 200
        assert {restaurant["place_id"] for restaurant in mapped.json()} == set(place_ids)
        assert all(restaurant["is_discovered"] for restaurant in mapped.json())


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
