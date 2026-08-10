from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from fiyu import api
from fiyu.account_deletion import delete_local_account_data
from fiyu.daily_picks import ensure_daily_picks_schema
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.restaurant_lists import ensure_restaurant_list_schema
from fiyu.restaurant_visits import ensure_restaurant_visit_schema
from fiyu.user_accounts import ensure_account_schema


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_authenticated_account_deletion_removes_all_owned_stores_and_isolates_other_user(
    tmp_path, monkeypatch
):
    db_path = tmp_path / "account-deletion.db"
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_daily_picks_schema(db_path)

    deleted_user = str(uuid4())
    other_user = str(uuid4())
    with connect(db_path) as connection:
        for owner_id, round_id in ((deleted_user, "round-a"), (other_user, "round-b")):
            connection.execute(
                "INSERT INTO daily_pick_rounds(id, owner_id, city_id, assigned_at) VALUES (?, ?, 'tokyo', 'now')",
                (round_id, owner_id),
            )
            connection.execute(
                """
                INSERT INTO daily_pick_served_history(
                    owner_id, restaurant_place_id, first_served_at, selection_round_id
                ) VALUES (?, ?, 'now', ?)
                """,
                (owner_id, f"place-{round_id}", round_id),
            )
        connection.commit()

    supabase_rows = {
        table: {deleted_user, other_user}
        for table in (
            "auth.users",
            "fiyu_user_profiles",
            "fiyu_restaurant_lists",
            "fiyu_restaurant_list_items",
            "fiyu_restaurant_visits",
            "fiyu_restaurant_seen",
            "fiyu_user_discovery_locations",
        )
    }
    avatars = {deleted_user, other_user}

    def delete_avatar_object(*, user_id: str) -> bool:
        existed = user_id in avatars
        avatars.discard(user_id)
        return existed

    def delete_auth_user(*, user_id: str) -> None:
        # Simulate the inspected ON DELETE CASCADE constraints.
        for rows in supabase_rows.values():
            rows.discard(user_id)

    monkeypatch.setattr(api, "DB_PATH", db_path)
    monkeypatch.setattr(
        api,
        "authenticated_supabase_user",
        lambda header: {"id": deleted_user} if header == "Bearer token-a" else None,
    )
    monkeypatch.setattr(api.shared_user_data, "delete_avatar_object", delete_avatar_object)
    monkeypatch.setattr(api.shared_user_data, "delete_auth_user", delete_auth_user)

    response = TestClient(api.app).delete(
        "/profiles/me/account",
        headers=_auth("token-a"),
    )

    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert deleted_user not in avatars
    assert other_user in avatars
    assert all(deleted_user not in rows for rows in supabase_rows.values())
    assert all(other_user in rows for rows in supabase_rows.values())
    with connect(db_path) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM daily_pick_rounds WHERE owner_id = ?", (deleted_user,)
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM daily_pick_served_history WHERE owner_id = ?", (deleted_user,)
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM daily_pick_rounds WHERE owner_id = ?", (other_user,)
        ).fetchone()[0] == 1
        assert connection.execute(
            "SELECT COUNT(*) FROM daily_pick_served_history WHERE owner_id = ?", (other_user,)
        ).fetchone()[0] == 1


def test_account_deletion_requires_verified_bearer(tmp_path, monkeypatch):
    db_path = tmp_path / "account-deletion-auth.db"
    db_path.touch()
    monkeypatch.setattr(api, "DB_PATH", db_path)
    monkeypatch.setattr(
        api,
        "authenticated_supabase_user",
        lambda _header: (_ for _ in ()).throw(api.SupabaseAuthError("invalid")),
    )

    response = TestClient(api.app).delete("/profiles/me/account")

    assert response.status_code == 401


def test_account_deletion_does_not_report_success_when_auth_deletion_fails(
    tmp_path, monkeypatch
):
    db_path = tmp_path / "account-deletion-failure.db"
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    user_id = str(uuid4())
    monkeypatch.setattr(api, "DB_PATH", db_path)
    monkeypatch.setattr(api, "authenticated_supabase_user", lambda _header: {"id": user_id})
    monkeypatch.setattr(api.shared_user_data, "delete_avatar_object", lambda **_kwargs: True)
    monkeypatch.setattr(
        api.shared_user_data,
        "delete_auth_user",
        lambda **_kwargs: (_ for _ in ()).throw(
            api.shared_user_data.SharedUserDataError("provider unavailable")
        ),
    )

    response = TestClient(api.app).delete(
        "/profiles/me/account",
        headers=_auth("token"),
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Account could not be deleted"}


def test_local_account_cleanup_removes_legacy_owned_rows_only(tmp_path):
    db_path = tmp_path / "legacy-account-data.db"
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants(place_id, title, rating, review_count)
            VALUES ('published', 'Published', 4.5, 20)
            """
        )
        connection.commit()
    ensure_public_schema(db_path)
    ensure_restaurant_list_schema(db_path)
    ensure_restaurant_visit_schema(db_path)
    ensure_account_schema(db_path)

    deleted_user = str(uuid4())
    other_user = str(uuid4())
    with connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants(
                place_id, is_published, created_at, updated_at
            ) VALUES ('published', 1, 'now', 'now')
            """
        )
        for index, owner_id in enumerate((deleted_user, other_user), start=1):
            connection.execute(
                """
                INSERT INTO user_profiles(
                    user_id, username, auth_email, created_at, updated_at
                ) VALUES (?, ?, ?, 'now', 'now')
                """,
                (owner_id, f"user{index}", f"user{index}@example.com"),
            )
            cursor = connection.execute(
                """
                INSERT INTO restaurant_lists(
                    owner_id, city_id, name, list_kind, created_at, updated_at
                ) VALUES (?, 'tokyo', 'Tokyo', 'default', 'now', 'now')
                """,
                (owner_id,),
            )
            connection.execute(
                """
                INSERT INTO restaurant_list_items(list_id, place_id, added_at)
                VALUES (?, 'published', 'now')
                """,
                (cursor.lastrowid,),
            )
            connection.execute(
                """
                INSERT INTO restaurant_visits(
                    id, owner_id, place_id, visited_at, reaction, private_note,
                    created_at, updated_at
                ) VALUES (?, ?, 'published', 'now', 'love_it', 'private', 'now', 'now')
                """,
                (f"visit-{index}", owner_id),
            )
            connection.execute(
                """
                INSERT INTO community_recommendations(
                    response_id, place_id, user_subject_id, recommends, created_at
                ) VALUES (?, 'published', ?, 1, 'now')
                """,
                (f"response-{index}", owner_id),
            )
        connection.commit()

    delete_local_account_data(db_path, user_id=deleted_user)

    with connect(db_path) as connection:
        checks = (
            ("user_profiles", "user_id"),
            ("restaurant_lists", "owner_id"),
            ("restaurant_visits", "owner_id"),
            ("community_recommendations", "user_subject_id"),
        )
        for table, owner_column in checks:
            assert connection.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {owner_column} = ?", (deleted_user,)
            ).fetchone()[0] == 0
            assert connection.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {owner_column} = ?", (other_user,)
            ).fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM restaurant_list_items").fetchone()[0] == 1


def test_internal_routes_require_admin_key_and_health_is_minimal(tmp_path, monkeypatch):
    db_path = tmp_path / "internal-routes.db"
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants(
                place_id, title, rating, review_count, candidate_eligible, internal_fiyu_score
            ) VALUES ('private-row', 'Private row', 4.5, 20, 1, 80)
            """
        )
        connection.commit()
    monkeypatch.setattr(api, "DB_PATH", db_path)
    monkeypatch.setenv("FIYU_ADMIN_API_KEY", "test-admin-secret")
    client = TestClient(api.app)

    requests = (
        ("/stats", {}),
        ("/areas", {}),
        ("/restaurants/candidates", {}),
        ("/restaurants/candidates/random", {}),
        ("/restaurants/nearby", {"lat": 35.0, "lng": 139.0}),
        ("/restaurants/1", {}),
    )
    for path, params in requests:
        assert client.get(path, params=params).status_code == 403

    authorized = client.get(
        "/restaurants/candidates",
        headers={"X-Fiyu-Admin-Key": "test-admin-secret"},
    )
    assert authorized.status_code == 200
    assert authorized.json()[0]["place_id"] == "private-row"
    assert client.get("/health").json() == {"status": "ok"}


def test_internal_routes_are_unavailable_when_admin_api_is_not_configured(
    tmp_path, monkeypatch
):
    db_path = tmp_path / "internal-routes-disabled.db"
    db_path.touch()
    monkeypatch.setattr(api, "DB_PATH", db_path)
    monkeypatch.delenv("FIYU_ADMIN_API_KEY", raising=False)

    response = TestClient(api.app).get("/restaurants/candidates")

    assert response.status_code == 404
