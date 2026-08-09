from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect


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


def test_signup_uses_supabase_id_and_enforces_case_insensitive_username(account_db, monkeypatch):
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
    with connect(account_db) as connection:
        profile = connection.execute("SELECT * FROM user_profiles").fetchone()
    assert profile["user_id"] == first_user_id
    assert profile["username"] == "tokyofan"
    assert profile["auth_email"] == "first@example.com"


def test_signin_accepts_email_username_and_at_prefix_without_exposing_email(
    account_db, monkeypatch
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
