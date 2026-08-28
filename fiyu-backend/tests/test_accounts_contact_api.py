from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect


@pytest.fixture(autouse=True)
def shared_profile_store(monkeypatch):
    profiles: dict[str, dict[str, object]] = {}

    def ensure_profile(*, user_id, username, auth_email):
        if user_id in profiles:
            return profiles[user_id]
        row = {
            "user_id": user_id,
            "username": username,
            "auth_email": auth_email,
            "display_name": None,
            "bio": None,
            "avatar_url": None,
            "created_at": "2026-08-09T00:00:00+00:00",
            "updated_at": "2026-08-09T00:00:00+00:00",
        }
        profiles[user_id] = row
        return row

    def update_profile(*, user_id, username, display_name, bio):
        row = profiles.get(user_id)
        if row is None:
            return None
        row.update(
            username=username,
            display_name=display_name,
            bio=bio,
            updated_at="2026-08-09T01:00:00+00:00",
        )
        return row

    def update_avatar(*, user_id, avatar_url):
        row = profiles.get(user_id)
        if row is None:
            return None
        row.update(avatar_url=avatar_url, updated_at="2026-08-09T02:00:00+00:00")
        return row

    monkeypatch.setattr(api.shared_user_data, "configured", lambda: True)
    monkeypatch.setattr(api.shared_user_data, "ensure_profile", ensure_profile)
    monkeypatch.setattr(
        api.shared_user_data,
        "username_available",
        lambda *, username: not any(
            str(row.get("username") or "").lower() == username.lower()
            for row in profiles.values()
        ),
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "resolve_auth_email",
        lambda *, username: next(
            (
                str(row["auth_email"])
                for row in profiles.values()
                if str(row.get("username") or "").lower() == username.lower()
            ),
            None,
        ),
    )
    monkeypatch.setattr(api.shared_user_data, "update_profile", update_profile)
    monkeypatch.setattr(api.shared_user_data, "update_avatar", update_avatar)
    return profiles


@pytest.fixture
def account_db(tmp_path, monkeypatch):
    path = tmp_path / "accounts.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    monkeypatch.setattr(api, "DB_PATH", path)
    return path


def test_contact_submission_is_validated_normalized_and_private(account_db):
    client = TestClient(api.app)

    invalid = client.post("/contact", json={"name": " ", "email": "bad", "message": " "})
    created = client.post(
        "/contact",
        json={
            "name": "  Ethan Bell  ",
            "email": "  ETHAN@example.com ",
            "message": "  A restaurant suggestion.  ",
        },
    )

    assert invalid.status_code == 422
    assert created.status_code == 201
    assert created.json()["status"] == "new"
    assert client.get("/contact").status_code == 405
    with connect(account_db) as connection:
        row = connection.execute("SELECT * FROM contact_submissions").fetchone()
    assert row["name"] == "Ethan Bell"
    assert row["email"] == "ethan@example.com"
    assert row["message"] == "A restaurant suggestion."


def test_city_poll_vote_is_validated_recorded_and_totals_are_not_public(
    account_db, monkeypatch
):
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: False)
    client = TestClient(api.app)

    missing_other = client.post(
        "/city-poll/votes", json={"voter_id": "browser-voter-0001", "choice": "other", "other_city": " "}
    )
    invalid_choice = client.post(
        "/city-poll/votes", json={"voter_id": "browser-voter-0001", "choice": "tokyo", "other_city": None}
    )
    created = client.post(
        "/city-poll/votes", json={"voter_id": "browser-voter-0001", "choice": "other", "other_city": "  Seoul  "}
    )

    assert missing_other.status_code == invalid_choice.status_code == 422
    assert created.status_code == 201
    assert created.json()["status"] == "recorded"
    assert client.get("/city-poll/votes").status_code == 405
    with connect(account_db) as connection:
        row = connection.execute("SELECT * FROM city_poll_votes").fetchone()
    assert row["choice"] == "other"
    assert row["other_city"] == "Seoul"


def test_city_poll_vote_is_anonymous_and_updates_one_browser_vote(account_db, monkeypatch):
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: False)
    client = TestClient(api.app)
    payload = {"voter_id": "anonymous-browser-01", "choice": "rome", "other_city": None}

    first = client.post("/city-poll/votes", json=payload)
    second = client.post(
        "/city-poll/votes",
        json={**payload, "choice": "paris"},
    )

    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    with connect(account_db) as connection:
        rows = connection.execute("SELECT * FROM city_poll_votes").fetchall()
    assert len(rows) == 1
    assert rows[0]["choice"] == "paris"
    assert rows[0]["voter_id"] == "anonymous-browser-01"


def test_city_poll_vote_uses_shared_storage_without_authentication(account_db, monkeypatch):
    captured: dict[str, object] = {}

    def upsert(**payload):
        captured.update(payload)
        return {
            "id": "vote-1",
            "created_at": "2026-08-28T00:00:00+00:00",
            "updated_at": "2026-08-28T00:00:00+00:00",
        }

    monkeypatch.setattr(api.shared_user_data, "upsert_city_poll_vote", upsert)
    response = TestClient(api.app).post(
        "/city-poll/votes",
        json={
            "voter_id": "anonymous-browser-02",
            "choice": "hong_kong",
            "other_city": None,
        },
    )

    assert response.status_code == 201
    assert captured == {
        "voter_id": "anonymous-browser-02",
        "choice": "hong_kong",
        "other_city": None,
    }


def test_city_poll_vote_returns_generic_error_and_logs_provider_failure(
    account_db, monkeypatch, caplog
):
    def fail(**_payload):
        raise api.shared_user_data.SharedUserDataError("provider detail")

    monkeypatch.setattr(api.shared_user_data, "upsert_city_poll_vote", fail)
    with caplog.at_level("ERROR"):
        response = TestClient(api.app).post(
            "/city-poll/votes",
            json={
                "voter_id": "anonymous-browser-03",
                "choice": "paris",
                "other_city": None,
            },
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "Vote could not be recorded"}
    assert "City poll vote persistence failed" in caplog.text
    assert "anonymous-browser-03" not in caplog.text


def test_city_poll_vote_stays_public_in_production_while_profile_is_private(
    account_db, monkeypatch
):
    monkeypatch.setenv("FIYU_ENVIRONMENT", "production")
    monkeypatch.setattr(
        api.shared_user_data,
        "upsert_city_poll_vote",
        lambda **_: {
            "id": "vote-production",
            "created_at": "2026-08-28T00:00:00+00:00",
            "updated_at": "2026-08-28T00:00:00+00:00",
        },
    )
    client = TestClient(api.app)

    vote = client.post(
        "/city-poll/votes",
        json={
            "voter_id": "anonymous-browser-04",
            "choice": "sydney",
            "other_city": None,
        },
    )
    private_profile = client.get("/profiles/me")

    assert vote.status_code == 201
    assert private_profile.status_code == 401


def test_signup_uses_supabase_id_and_enforces_case_insensitive_username(
    account_db, monkeypatch, shared_profile_store
):
    client = TestClient(api.app)
    first_user_id = str(uuid4())
    monkeypatch.setattr(
        api,
        "sign_up_with_supabase",
        lambda **_: {
            "id": first_user_id,
            "email": "first@example.com",
            "user_metadata": {"username": "tokyofan"},
        },
    )

    created = client.post(
        "/auth/signup",
        json={"email": "first@example.com", "password": "provider-valid", "username": "TokyoFan"},
    )
    duplicate = client.post(
        "/auth/signup",
        json={"email": "other@example.com", "password": "provider-valid", "username": "TOKYOFAN"},
    )

    assert created.status_code == 201
    assert created.json() == {
        "status": "verification_required",
        "user_id": first_user_id,
        "email": "first@example.com",
        "username": "tokyofan",
        "session": None,
        "email_verification_required": True,
    }
    assert duplicate.status_code == 409
    profile = shared_profile_store[first_user_id]
    assert profile["user_id"] == first_user_id
    assert profile["username"] == "tokyofan"
    assert profile["auth_email"] == "first@example.com"


def test_signin_accepts_email_username_and_at_prefix_without_exposing_email(
    account_db, monkeypatch, shared_profile_store
):
    client = TestClient(api.app)
    user_id = str(uuid4())
    monkeypatch.setattr(
        api,
        "sign_up_with_supabase",
        lambda **_: {"id": user_id, "email": "person@example.com"},
    )
    client.post(
        "/auth/signup",
        json={"email": "person@example.com", "password": "provider-valid", "username": "Person"},
    )
    calls: list[str] = []

    def authenticate(*, email, password):
        calls.append(email)
        assert password == "provider-valid"
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_in": 3600,
            "token_type": "bearer",
            "user": {"id": user_id, "email": email, "user_metadata": {"username": "person"}},
        }

    monkeypatch.setattr(api, "sign_in_with_supabase", authenticate)
    responses = [
        client.post(
            "/auth/signin",
            json={"identifier": identifier, "password": "provider-valid"},
        )
        for identifier in ("person@example.com", "PERSON", "@person")
    ]

    assert [response.status_code for response in responses] == [200, 200, 200]
    assert calls == ["person@example.com", "person@example.com", "person@example.com"]
    assert all("email" not in response.json() for response in responses)
    assert all(response.json()["user_id"] == user_id for response in responses)
    assert list(shared_profile_store) == [user_id]


def test_signin_uses_generic_errors_and_identifies_unverified_accounts(account_db, monkeypatch):
    client = TestClient(api.app)

    def reject_credentials(**_):
        raise api.SupabaseAuthError("Invalid login credentials")

    monkeypatch.setattr(api, "sign_in_with_supabase", reject_credentials)
    wrong_email = client.post(
        "/auth/signin",
        json={"identifier": "missing@example.com", "password": "wrong"},
    )
    wrong_username = client.post(
        "/auth/signin",
        json={"identifier": "missing", "password": "wrong"},
    )
    assert wrong_email.status_code == wrong_username.status_code == 401
    assert wrong_email.json()["detail"] == wrong_username.json()["detail"]
    assert wrong_email.json()["detail"] == "Incorrect email/username or password."

    user_id = str(uuid4())
    monkeypatch.setattr(
        api,
        "sign_up_with_supabase",
        lambda **_: {"id": user_id, "email": "pending@example.com"},
    )
    client.post(
        "/auth/signup",
        json={"email": "pending@example.com", "password": "provider-valid", "username": "pending"},
    )

    def reject_unverified(**_):
        raise api.SupabaseAuthError("Email not confirmed")

    monkeypatch.setattr(api, "sign_in_with_supabase", reject_unverified)
    pending = client.post(
        "/auth/signin",
        json={"identifier": "@pending", "password": "provider-valid"},
    )
    assert pending.status_code == 403
    assert pending.json()["detail"].startswith("Please verify your email")


def test_authenticated_profile_read_update_and_owner_identity(account_db, monkeypatch):
    client = TestClient(api.app)
    user_id = str(uuid4())
    monkeypatch.setattr(
        api,
        "sign_up_with_supabase",
        lambda **_: {
            "user": {"id": user_id, "email": "person@example.com"},
            "session": {
                "access_token": "access",
                "refresh_token": "refresh",
                "expires_in": 3600,
                "token_type": "bearer",
            },
        },
    )
    monkeypatch.setattr(api, "authenticated_supabase_user", lambda _: {"id": user_id})
    client.post(
        "/auth/signup",
        json={"email": "person@example.com", "password": "provider-valid", "username": "person"},
    )
    headers = {"Authorization": "Bearer valid"}

    fetched = client.get("/profiles/me", headers=headers)
    updated = client.patch(
        "/profiles/me",
        headers=headers,
        json={"username": "new_name", "display_name": " Person ", "bio": " Notes "},
    )

    assert fetched.status_code == 200
    assert updated.status_code == 200
    assert updated.json()["display_name"] == "Person"
    assert updated.json()["bio"] == "Notes"
    assert api._owner_id_from_header(authorization="Bearer valid") == user_id


def test_avatar_reference_is_limited_to_authenticated_users_storage_path(
    account_db, monkeypatch, shared_profile_store
):
    client = TestClient(api.app)
    user_id = str(uuid4())
    other_user_id = str(uuid4())
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(
        api,
        "authenticated_supabase_user",
        lambda _: {
            "id": user_id,
            "email": "avatar@example.com",
            "user_metadata": {"username": "avatar_user"},
        },
    )
    headers = {"Authorization": "Bearer valid"}
    own_url = (
        "https://project.supabase.co/storage/v1/object/public/avatars/"
        f"{user_id}/avatar.webp?v=123"
    )
    other_url = (
        "https://project.supabase.co/storage/v1/object/public/avatars/"
        f"{other_user_id}/avatar.webp"
    )

    updated = client.patch(
        "/profiles/me/avatar", headers=headers, json={"avatar_url": own_url}
    )
    rejected = client.patch(
        "/profiles/me/avatar", headers=headers, json={"avatar_url": other_url}
    )
    removed = client.patch(
        "/profiles/me/avatar", headers=headers, json={"avatar_url": None}
    )

    assert updated.status_code == 200
    assert updated.json()["avatar_url"] == own_url
    assert rejected.status_code == 422
    assert removed.status_code == 200
    assert removed.json()["avatar_url"] is None
    assert shared_profile_store[user_id]["avatar_url"] is None


def test_missing_profile_is_idempotently_backfilled_then_persists_edits(
    account_db, monkeypatch, shared_profile_store
):
    client = TestClient(api.app)
    user_id = str(uuid4())
    auth_user = {
        "id": user_id,
        "email": "existing@example.com",
        "user_metadata": {"username": "existing_user"},
    }
    monkeypatch.setattr(api, "authenticated_supabase_user", lambda _: auth_user)
    headers = {"Authorization": "Bearer existing"}

    first = client.get("/profiles/me", headers=headers)
    second = client.get("/profiles/me", headers=headers)
    saved = client.patch(
        "/profiles/me",
        headers=headers,
        json={
            "username": "confirmed_user",
            "display_name": "Existing User",
            "bio": "Tokyo profile",
        },
    )
    hydrated = client.get("/profiles/me", headers=headers)

    assert first.status_code == second.status_code == saved.status_code == 200
    assert len(shared_profile_store) == 1
    assert first.json()["username"] == "existing_user"
    assert hydrated.json()["username"] == "confirmed_user"
    assert hydrated.json()["display_name"] == "Existing User"
    assert hydrated.json()["bio"] == "Tokyo profile"


def test_missing_profile_without_username_is_created_without_inventing_one(
    account_db, monkeypatch, shared_profile_store
):
    client = TestClient(api.app)
    user_id = str(uuid4())
    monkeypatch.setattr(
        api,
        "authenticated_supabase_user",
        lambda _: {"id": user_id, "email": "legacy@example.com", "user_metadata": {}},
    )

    response = client.get(
        "/profiles/me", headers={"Authorization": "Bearer existing"}
    )

    assert response.status_code == 200
    assert response.json()["username"] == ""
    assert shared_profile_store[user_id]["username"] is None


def test_avatar_storage_migration_enforces_uuid_folder_ownership():
    migration = (
        api.BACKEND_ROOT
        / "supabase"
        / "migrations"
        / "202608090002_profile_avatars.sql"
    ).read_text(encoding="utf-8")

    assert "'avatars'" in migration
    assert "public = excluded.public" in migration
    assert migration.count("(storage.foldername(name))[1] = (select auth.uid()::text)") == 5
    assert "for insert to authenticated" in migration
    assert "for select to authenticated" in migration
    assert "for update to authenticated" in migration
    assert "for delete to authenticated" in migration


def test_profile_provisioning_migration_backfills_and_enforces_one_auth_profile():
    initial = (
        api.BACKEND_ROOT
        / "supabase"
        / "migrations"
        / "202608090001_authenticated_user_data.sql"
    ).read_text(encoding="utf-8")
    provisioning = (
        api.BACKEND_ROOT
        / "supabase"
        / "migrations"
        / "202608090003_profile_provisioning.sql"
    ).read_text(encoding="utf-8")

    assert "user_id uuid primary key references auth.users(id)" in initial
    assert "after insert on auth.users" in provisioning
    assert "from auth.users as users" in provisioning
    assert "on conflict (user_id) do nothing" in provisioning
    assert "alter column username drop not null" in provisioning
