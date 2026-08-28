from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from uuid import UUID, uuid4


class SharedUserDataError(RuntimeError):
    pass


class SharedUserDataConflict(SharedUserDataError):
    pass


def configured() -> bool:
    return bool(
        os.getenv("SUPABASE_URL", "").strip() and os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )


def _service_configuration() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SharedUserDataError("Shared user data is not configured")
    return url, key


def _delete_service_resource(path: str, *, missing_ok: bool = False) -> bool:
    """Delete one Supabase resource without retaining provider response details."""
    url, key = _service_configuration()
    request = Request(
        f"{url}{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        method="DELETE",
    )
    try:
        with urlopen(request, timeout=10):
            return True
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if missing_ok and (
            exc.code == 404
            or (
                exc.code == 400
                and ('"statusCode":"404"' in detail or '"code":"NoSuchKey"' in detail)
            )
        ):
            return False
        raise SharedUserDataError(
            f"Supabase deletion request failed with status {exc.code}"
        ) from None
    except (URLError, TimeoutError):
        raise SharedUserDataError("Supabase deletion request is unavailable") from None


def delete_avatar_object(*, user_id: str) -> bool:
    path = quote(f"{user_id}/avatar.webp", safe="/")
    return _delete_service_resource(f"/storage/v1/object/avatars/{path}", missing_ok=True)


def delete_auth_user(*, user_id: str) -> None:
    normalized = str(UUID(user_id))
    _delete_service_resource(f"/auth/v1/admin/users/{quote(normalized, safe='')}")


def _request(
    path: str,
    *,
    method: str = "GET",
    query: dict[str, str] | None = None,
    body: object | None = None,
    prefer: str | None = None,
) -> Any:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SharedUserDataError("Shared user data is not configured")
    suffix = f"?{urlencode(query)}" if query else ""
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    request = Request(f"{url}/rest/v1/{path}{suffix}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=10) as response:
            raw = response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code == 409 or "23505" in detail:
            raise SharedUserDataConflict("Shared account value is already in use") from None
        raise SharedUserDataError(
            f"Shared user data request failed ({exc.code}): {detail[:300]}"
        ) from None
    except (URLError, TimeoutError):
        raise SharedUserDataError("Shared user data is unavailable") from None
    return json.loads(raw) if raw else None


def _rows(table: str, **filters: object) -> list[dict[str, Any]]:
    query = {"select": "*", **{key: f"eq.{value}" for key, value in filters.items()}}
    result = _request(table, query=query)
    return result if isinstance(result, list) else []


def get_profile(*, user_id: str) -> dict[str, Any] | None:
    rows = _rows("fiyu_user_profiles", user_id=user_id)
    return rows[0] if rows else None


def resolve_auth_email(*, username: str) -> str | None:
    rows = _rows("fiyu_user_profiles", username=username.lower())
    return str(rows[0]["auth_email"]) if rows and rows[0].get("auth_email") else None


def username_available(*, username: str) -> bool:
    return not _rows("fiyu_user_profiles", username=username.lower())


def ensure_profile(
    *, user_id: str, username: str | None, auth_email: str | None
) -> dict[str, Any]:
    existing = get_profile(user_id=user_id)
    if existing is not None:
        return existing

    def insert(candidate_username: str | None) -> dict[str, Any] | None:
        result = _request(
            "fiyu_user_profiles",
            method="POST",
            query={"on_conflict": "user_id"},
            body={
                "user_id": user_id,
                "username": candidate_username,
                "auth_email": auth_email,
            },
            prefer="resolution=ignore-duplicates,return=representation",
        )
        return result[0] if isinstance(result, list) and result else None

    try:
        created = insert(username)
    except SharedUserDataConflict:
        if username is None:
            raise
        created = insert(None)
    if created is not None:
        return created
    existing = get_profile(user_id=user_id)
    if existing is None:
        raise SharedUserDataError("Profile provisioning failed")
    return existing


def update_profile(
    *, user_id: str, username: str, display_name: str | None, bio: str | None
) -> dict[str, Any] | None:
    result = _request(
        "fiyu_user_profiles",
        method="PATCH",
        query={"user_id": f"eq.{user_id}"},
        body={"username": username, "display_name": display_name, "bio": bio, "updated_at": _now()},
        prefer="return=representation",
    )
    return result[0] if isinstance(result, list) and result else None


def update_avatar(*, user_id: str, avatar_url: str | None) -> dict[str, Any] | None:
    result = _request(
        "fiyu_user_profiles",
        method="PATCH",
        query={"user_id": f"eq.{user_id}"},
        body={"avatar_url": avatar_url, "updated_at": _now()},
        prefer="return=representation",
    )
    return result[0] if isinstance(result, list) and result else None


def get_discovery_location(*, user_id: str) -> dict[str, Any] | None:
    rows = _rows("fiyu_user_discovery_locations", user_id=user_id)
    return rows[0] if rows else None


def upsert_discovery_location(*, user_id: str, changes: dict[str, object]) -> dict[str, Any]:
    result = _request(
        "fiyu_user_discovery_locations",
        method="POST",
        query={"on_conflict": "user_id"},
        body={"user_id": user_id, **changes, "updated_at": _now()},
        prefer="resolution=merge-duplicates,return=representation",
    )
    if not isinstance(result, list) or not result:
        raise SharedUserDataError("Discovery location could not be saved")
    return result[0]


def _now() -> str:
    return datetime.now(UTC).isoformat()


def get_or_create_default_list(*, user_id: str, city_id: str) -> dict[str, Any]:
    rows = _rows("fiyu_restaurant_lists", user_id=user_id, city_id=city_id, list_kind="default")
    if rows:
        return rows[0]
    try:
        result = _request(
            "fiyu_restaurant_lists",
            method="POST",
            body={
                "user_id": user_id,
                "city_id": city_id,
                "name": "Tokyo" if city_id == "tokyo" else city_id.title(),
                "list_kind": "default",
            },
            prefer="return=representation",
        )
        if isinstance(result, list) and result:
            return result[0]
    except SharedUserDataError:
        rows = _rows("fiyu_restaurant_lists", user_id=user_id, city_id=city_id, list_kind="default")
        if rows:
            return rows[0]
        raise
    raise SharedUserDataError("Default list creation failed")


def list_lists(*, user_id: str, city_id: str | None = None) -> list[dict[str, Any]]:
    query = {
        "select": "*",
        "user_id": f"eq.{user_id}",
        "order": "list_kind.desc,created_at.asc,id.asc",
    }
    if city_id is not None:
        query["city_id"] = f"eq.{city_id}"
    result = _request("fiyu_restaurant_lists", query=query)
    return result if isinstance(result, list) else []


def get_list(*, user_id: str, list_id: int) -> dict[str, Any] | None:
    rows = _rows("fiyu_restaurant_lists", user_id=user_id, id=list_id)
    return rows[0] if rows else None


def create_list(*, user_id: str, city_id: str, name: str) -> dict[str, Any]:
    result = _request(
        "fiyu_restaurant_lists",
        method="POST",
        body={"user_id": user_id, "city_id": city_id, "name": name, "list_kind": "custom"},
        prefer="return=representation",
    )
    return result[0]


def rename_list(*, user_id: str, list_id: int, name: str) -> dict[str, Any] | None:
    result = _request(
        "fiyu_restaurant_lists",
        method="PATCH",
        query={"user_id": f"eq.{user_id}", "id": f"eq.{list_id}"},
        body={"name": name, "updated_at": _now()},
        prefer="return=representation",
    )
    return result[0] if isinstance(result, list) and result else None


def delete_list(*, user_id: str, list_id: int) -> bool:
    result = _request(
        "fiyu_restaurant_lists",
        method="DELETE",
        query={"user_id": f"eq.{user_id}", "id": f"eq.{list_id}"},
        prefer="return=representation",
    )
    return isinstance(result, list) and bool(result)


def list_items(*, user_id: str, list_id: int) -> list[dict[str, Any]]:
    result = _request(
        "fiyu_restaurant_list_items",
        query={
            "select": "place_id,created_at",
            "user_id": f"eq.{user_id}",
            "list_id": f"eq.{list_id}",
            "order": "created_at.asc,id.asc",
        },
    )
    return (
        [{"place_id": row["place_id"], "added_at": row["created_at"]} for row in result]
        if isinstance(result, list)
        else []
    )


def add_item(*, user_id: str, list_id: int, place_id: str) -> bool:
    existing = _request(
        "fiyu_restaurant_list_items",
        query={
            "select": "id",
            "user_id": f"eq.{user_id}",
            "list_id": f"eq.{list_id}",
            "place_id": f"eq.{place_id}",
        },
    )
    if isinstance(existing, list) and existing:
        return False
    _request(
        "fiyu_restaurant_list_items",
        method="POST",
        body={"user_id": user_id, "list_id": list_id, "place_id": place_id},
    )
    return True


def remove_item(*, user_id: str, list_id: int, place_id: str) -> bool:
    result = _request(
        "fiyu_restaurant_list_items",
        method="DELETE",
        query={
            "user_id": f"eq.{user_id}",
            "list_id": f"eq.{list_id}",
            "place_id": f"eq.{place_id}",
        },
        prefer="return=representation",
    )
    return isinstance(result, list) and bool(result)


def create_visit(
    *, user_id: str, place_id: str, visited_at: str, reaction: str, private_note: str | None
) -> dict[str, Any]:
    now = _now()
    result = _request(
        "fiyu_restaurant_visits",
        method="POST",
        body={
            "id": str(uuid4()),
            "user_id": user_id,
            "place_id": place_id,
            "visited_at": visited_at,
            "reaction": reaction,
            "private_note": private_note,
            "created_at": now,
            "updated_at": now,
        },
        prefer="return=representation",
    )
    return result[0]


def list_visits(*, user_id: str) -> list[dict[str, Any]]:
    result = _request(
        "fiyu_restaurant_visits",
        query={
            "select": "*",
            "user_id": f"eq.{user_id}",
            "order": "visited_at.desc,created_at.desc,id.desc",
        },
    )
    return result if isinstance(result, list) else []


def visited_place_ids(*, user_id: str) -> list[str]:
    """Return unique visited restaurants, ordered by the owner's latest visit."""
    result = _request(
        "fiyu_restaurant_visits",
        query={
            "select": "place_id",
            "user_id": f"eq.{user_id}",
            "order": "visited_at.desc,created_at.desc,id.desc",
        },
    )
    if not isinstance(result, list):
        return []
    return list(dict.fromkeys(str(row["place_id"]) for row in result))


def get_visit(*, user_id: str, visit_id: str) -> dict[str, Any] | None:
    rows = _rows("fiyu_restaurant_visits", user_id=user_id, id=visit_id)
    return rows[0] if rows else None


def update_visit(
    *, user_id: str, visit_id: str, changes: dict[str, object]
) -> dict[str, Any] | None:
    result = _request(
        "fiyu_restaurant_visits",
        method="PATCH",
        query={"user_id": f"eq.{user_id}", "id": f"eq.{visit_id}"},
        body={**changes, "updated_at": _now()},
        prefer="return=representation",
    )
    return result[0] if isinstance(result, list) and result else None


def delete_visit(*, user_id: str, visit_id: str) -> bool:
    result = _request(
        "fiyu_restaurant_visits",
        method="DELETE",
        query={"user_id": f"eq.{user_id}", "id": f"eq.{visit_id}"},
        prefer="return=representation",
    )
    return isinstance(result, list) and bool(result)


def seen_place_ids(*, user_id: str) -> list[str]:
    result = _request(
        "fiyu_restaurant_seen",
        query={"select": "place_id", "user_id": f"eq.{user_id}", "order": "last_seen_at.desc"},
    )
    return [str(row["place_id"]) for row in result] if isinstance(result, list) else []


def seen_history(*, user_id: str) -> dict[str, str]:
    result = _request(
        "fiyu_restaurant_seen",
        query={
            "select": "place_id,last_seen_at",
            "user_id": f"eq.{user_id}",
            "order": "last_seen_at.desc",
        },
    )
    return (
        {str(row["place_id"]): str(row["last_seen_at"]) for row in result}
        if isinstance(result, list)
        else {}
    )


def saved_place_ids(*, user_id: str, city_id: str) -> set[str]:
    lists = _rows(
        "fiyu_restaurant_lists",
        user_id=user_id,
        city_id=city_id,
        list_kind="default",
    )
    if not lists:
        return set()
    return {
        str(row["place_id"])
        for row in list_items(user_id=user_id, list_id=int(lists[0]["id"]))
    }


def get_active_daily_picks(*, user_id: str, city_id: str) -> dict[str, Any] | None:
    rounds = _request(
        "fiyu_daily_pick_rounds",
        query={
            "select": "id,assigned_at,expires_at,revealed_at,selection_metadata",
            "user_id": f"eq.{user_id}",
            "city_id": f"eq.{city_id}",
            "expires_at": f"gt.{_now()}",
            "order": "assigned_at.desc,id.desc",
            "limit": "1",
        },
    )
    if not isinstance(rounds, list) or not rounds:
        return None
    row = rounds[0]
    items = _request(
        "fiyu_daily_pick_round_items",
        query={
            "select": "place_id,position",
            "user_id": f"eq.{user_id}",
            "round_id": f"eq.{row['id']}",
            "order": "position.asc",
        },
    )
    if not isinstance(items, list) or len(items) > 3:
        return None
    return {**row, "place_ids": [str(item["place_id"]) for item in items]}


def get_recent_daily_pick_rounds(
    *, user_id: str, city_id: str, assigned_after: str, expired_at_or_before: str
) -> list[dict[str, Any]]:
    """Return complete historical rounds without consulting interaction state."""
    rounds = _request(
        "fiyu_daily_pick_rounds",
        query={
            "select": "id,assigned_at,expires_at,revealed_at,selection_metadata",
            "user_id": f"eq.{user_id}",
            "city_id": f"eq.{city_id}",
            "assigned_at": f"gt.{assigned_after}",
            "expires_at": f"lte.{expired_at_or_before}",
            "order": "assigned_at.desc,id.desc",
        },
    )
    if not isinstance(rounds, list) or not rounds:
        return []
    round_ids = [str(row["id"]) for row in rounds]
    items = _request(
        "fiyu_daily_pick_round_items",
        query={
            "select": "round_id,place_id,position",
            "user_id": f"eq.{user_id}",
            "round_id": f"in.({','.join(round_ids)})",
            "order": "round_id.asc,position.asc",
        },
    )
    if not isinstance(items, list):
        return []
    items_by_round: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        items_by_round.setdefault(str(item["round_id"]), []).append(item)
    result: list[dict[str, Any]] = []
    for row in rounds:
        round_items = sorted(
            items_by_round.get(str(row["id"]), []), key=lambda item: int(item["position"])
        )
        if len(round_items) <= 3:
            result.append({**row, "place_ids": [str(item["place_id"]) for item in round_items]})
    return result


def assign_or_get_active_daily_picks(
    *,
    user_id: str,
    city_id: str,
    place_ids: list[str],
    assigned_at: str,
    expires_at: str,
    selection_metadata: dict[str, object],
) -> dict[str, Any]:
    result = _request(
        "rpc/assign_or_get_active_fiyu_picks",
        method="POST",
        body={
            "p_user_id": user_id,
            "p_city_id": city_id,
            "p_place_ids": place_ids,
            "p_assigned_at": assigned_at,
            "p_expires_at": expires_at,
            "p_selection_metadata": selection_metadata,
        },
    )
    if isinstance(result, list) and result:
        result = result[0]
    result_place_ids = result.get("place_ids", []) if isinstance(result, dict) else []
    if (
        not isinstance(result, dict)
        or not isinstance(result_place_ids, list)
        or len(result_place_ids) > 3
        or len(set(result_place_ids)) != len(result_place_ids)
    ):
        raise SharedUserDataError("Daily Picks snapshot could not be saved")
    return result


def repair_active_daily_picks(
    *,
    user_id: str,
    round_id: str,
    expected_place_ids: list[str],
    place_ids: list[str],
    selection_metadata: dict[str, object],
    repaired_at: str,
) -> dict[str, Any]:
    """Atomically replace only the expected active snapshot and record new seen rows."""
    result = _request(
        "rpc/repair_active_fiyu_picks",
        method="POST",
        body={
            "p_user_id": user_id,
            "p_round_id": round_id,
            "p_expected_place_ids": expected_place_ids,
            "p_place_ids": place_ids,
            "p_selection_metadata": selection_metadata,
            "p_repaired_at": repaired_at,
        },
    )
    if isinstance(result, list) and result:
        result = result[0]
    returned_ids = result.get("place_ids", []) if isinstance(result, dict) else None
    if (
        not isinstance(result, dict)
        or not isinstance(returned_ids, list)
        or len(returned_ids) > 3
        or len(returned_ids) != len(set(returned_ids))
    ):
        raise SharedUserDataError("Daily Picks snapshot could not be repaired")
    return result


def reveal_daily_pick(
    *, user_id: str, round_id: str, place_id: str, revealed_at: str
) -> tuple[str, tuple[str, ...], str | None] | None:
    result = _request(
        "rpc/reveal_fiyu_daily_pick",
        method="POST",
        body={
            "p_user_id": user_id,
            "p_round_id": round_id,
            "p_place_id": place_id,
            "p_revealed_at": revealed_at,
        },
    )
    if isinstance(result, list) and result:
        result = result[0]
    revealed_ids = result.get("revealed_place_ids") if isinstance(result, dict) else None
    if (
        not isinstance(result, dict)
        or not result.get("pick_revealed_at")
        or not isinstance(revealed_ids, list)
    ):
        return None
    return (
        str(result["pick_revealed_at"]),
        tuple(str(value) for value in revealed_ids),
        str(result["revealed_at"]) if result.get("revealed_at") else None,
    )


def record_seen(*, user_id: str, place_ids: list[str]) -> None:
    if place_ids:
        _request(
            "rpc/record_fiyu_seen",
            method="POST",
            body={"p_user_id": user_id, "p_place_ids": list(dict.fromkeys(place_ids))},
        )


NOTIFICATION_TYPES = frozenset(
    {"picks_ready", "smart_list_ready", "new_drop", "early_access_unlocked", "trip_reminder"}
)


def create_notification(
    *,
    user_id: str,
    notification_type: str,
    title: str,
    body: str,
    target_url: str | None = None,
    metadata: dict[str, object] | None = None,
) -> dict[str, Any]:
    """Service-only creation hook for real product events; no event emits notifications today."""
    if notification_type not in NOTIFICATION_TYPES:
        raise ValueError("Unsupported notification type")
    result = _request(
        "fiyu_user_notifications",
        method="POST",
        body={
            "id": str(uuid4()),
            "user_id": user_id,
            "type": notification_type,
            "title": title,
            "body": body,
            "target_url": target_url,
            "metadata": metadata,
        },
        prefer="return=representation",
    )
    if not isinstance(result, list) or not result:
        raise SharedUserDataError("Notification could not be created")
    return result[0]


def list_notifications(*, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    result = _request(
        "fiyu_user_notifications",
        query={
            "select": "id,type,title,body,target_url,metadata,created_at,read_at",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc,id.desc",
            "limit": str(limit),
        },
    )
    return result if isinstance(result, list) else []


def mark_notification_read(*, user_id: str, notification_id: str) -> dict[str, Any] | None:
    result = _request(
        "fiyu_user_notifications",
        method="PATCH",
        query={"user_id": f"eq.{user_id}", "id": f"eq.{UUID(notification_id)!s}"},
        body={"read_at": _now()},
        prefer="return=representation",
    )
    return result[0] if isinstance(result, list) and result else None


def mark_all_notifications_read(*, user_id: str) -> int:
    result = _request(
        "fiyu_user_notifications",
        method="PATCH",
        query={"user_id": f"eq.{user_id}", "read_at": "is.null"},
        body={"read_at": _now()},
        prefer="return=representation",
    )
    return len(result) if isinstance(result, list) else 0


def upsert_city_poll_vote(
    *, voter_id: str, choice: str, other_city: str | None
) -> dict[str, Any]:
    """Persist one anonymous browser's campaign vote in hosted shared storage."""
    now = _now()
    result = _request(
        "fiyu_city_poll_votes",
        method="POST",
        query={"on_conflict": "voter_id"},
        body={
            "voter_id": voter_id,
            "choice": choice,
            "other_city": other_city,
            "updated_at": now,
        },
        prefer="resolution=merge-duplicates,return=representation",
    )
    if not isinstance(result, list) or not result:
        raise SharedUserDataError("City vote could not be recorded")
    return result[0]
