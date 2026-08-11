from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from fiyu import api


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_notifications_are_account_owned_and_support_read_mutations(monkeypatch):
    user_ids = {"token-a": str(uuid4()), "token-b": str(uuid4())}
    rows: dict[str, list[dict[str, object]]] = defaultdict(list)
    notification_id = str(uuid4())
    rows[user_ids["token-a"]].append(
        {
            "id": notification_id,
            "type": "new_drop",
            "title": "New Tokyo Drop",
            "body": "This month's new Fiyu restaurants are here.",
            "target_url": "/picks",
            "metadata": {"city_id": "tokyo"},
            "created_at": "2026-08-10T12:00:00+00:00",
            "read_at": None,
        }
    )

    def current_user(header):
        token = (header or "").removeprefix("Bearer ")
        if token not in user_ids:
            raise api.SupabaseAuthError("invalid")
        return {"id": user_ids[token]}

    def mark_one(*, user_id, notification_id):
        for row in rows[user_id]:
            if row["id"] == notification_id:
                row["read_at"] = datetime.now(UTC).isoformat()
                return row
        return None

    def mark_all(*, user_id):
        updated = 0
        for row in rows[user_id]:
            if row["read_at"] is None:
                row["read_at"] = datetime.now(UTC).isoformat()
                updated += 1
        return updated

    monkeypatch.setattr(api, "authenticated_supabase_user", current_user)
    monkeypatch.setattr(
        api.shared_user_data,
        "list_notifications",
        lambda *, user_id, limit: list(rows[user_id])[:limit],
    )
    monkeypatch.setattr(api.shared_user_data, "mark_notification_read", mark_one)
    monkeypatch.setattr(api.shared_user_data, "mark_all_notifications_read", mark_all)
    client = TestClient(api.app)

    assert client.get("/notifications", headers=_auth("token-b")).json() == []
    listed = client.get("/notifications", headers=_auth("token-a"))
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == notification_id
    assert listed.json()[0]["read_at"] is None

    forbidden = client.patch(f"/notifications/{notification_id}/read", headers=_auth("token-b"))
    assert forbidden.status_code == 404

    marked = client.patch(f"/notifications/{notification_id}/read", headers=_auth("token-a"))
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None

    rows[user_ids["token-a"]][0]["read_at"] = None
    marked_all = client.patch("/notifications/read-all", headers=_auth("token-a"))
    assert marked_all.json() == {"updated": 1}
    assert client.get("/notifications", headers=_auth("token-a")).json()[0]["read_at"] is not None


def test_notifications_require_verified_auth(monkeypatch):
    monkeypatch.setattr(
        api,
        "authenticated_supabase_user",
        lambda _header: (_ for _ in ()).throw(api.SupabaseAuthError("invalid")),
    )
    assert TestClient(api.app).get("/notifications").status_code == 401
