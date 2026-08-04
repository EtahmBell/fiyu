from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from .database import connect
from .restaurant_lists import get_or_create_default_list
from .utils import haversine_km

SmartViewKey = Literal[
    "recently_saved",
    "fiyu_9_plus",
    "not_visited",
    "by_neighborhood",
    "nearby",
]

SMART_VIEW_KEYS: tuple[SmartViewKey, ...] = (
    "recently_saved",
    "fiyu_9_plus",
    "not_visited",
    "by_neighborhood",
    "nearby",
)

SMART_VIEW_META: dict[SmartViewKey, dict[str, str]] = {
    "recently_saved": {
        "label": "Recently saved",
        "description": "Most recently saved restaurants first.",
    },
    "fiyu_9_plus": {
        "label": "Fiyu 9+",
        "description": "Saved restaurants with Fiyu Score 90 and above.",
    },
    "not_visited": {
        "label": "Not visited",
        "description": "Saved restaurants you have not logged as visited.",
    },
    "by_neighborhood": {
        "label": "By neighborhood",
        "description": "Saved restaurants grouped by neighborhood.",
    },
    "nearby": {
        "label": "Nearby",
        "description": "Saved restaurants ordered by distance from a point.",
    },
}


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fetch_saved_rows(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
) -> list[dict[str, object]]:
    row = get_or_create_default_list(db_path, owner_id=owner_id, city_id=city_id)
    list_id = int(row["id"])
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                i.place_id,
                i.added_at,
                p.name_ja,
                p.name_en,
                p.primary_category,
                r.neighborhood,
                p.fiyu_score,
                p.score_band,
                p.latitude,
                p.longitude
            FROM restaurant_list_items i
            JOIN public_restaurants p ON p.place_id = i.place_id
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE i.list_id = ?
            ORDER BY i.added_at DESC, i.id DESC
            """,
            (list_id,),
        ).fetchall()
    return [dict(item) for item in rows]


def _smart_item(row: dict[str, object], *, distance_km: float | None = None) -> dict[str, object]:
    item: dict[str, object] = {
        "place_id": str(row["place_id"]),
        "added_at": str(row["added_at"]),
        "is_visited": False,
        "restaurant": {
            "place_id": str(row["place_id"]),
            "name_ja": row.get("name_ja"),
            "name_en": row.get("name_en"),
            "primary_category": row.get("primary_category"),
            "neighborhood": row.get("neighborhood"),
            "fiyu_score": row.get("fiyu_score"),
            "score_band": row.get("score_band"),
        },
    }
    if distance_km is not None:
        item["distance_km"] = round(distance_km, 2)
    return item


def list_smart_view_entries(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
    view_key: SmartViewKey,
    origin_latitude: float | None = None,
    origin_longitude: float | None = None,
) -> dict[str, object]:
    rows = _fetch_saved_rows(db_path, owner_id=owner_id, city_id=city_id)

    if view_key == "recently_saved":
        return {"items": [_smart_item(row) for row in rows], "groups": []}

    if view_key == "fiyu_9_plus":
        filtered = [row for row in rows if (_as_float(row.get("fiyu_score")) or 0.0) >= 90.0]
        return {"items": [_smart_item(row) for row in filtered], "groups": []}

    if view_key == "not_visited":
        # Visit state is not persisted server-side yet, so every saved item
        # currently qualifies as not visited.
        return {"items": [_smart_item(row) for row in rows], "groups": []}

    if view_key == "by_neighborhood":
        grouped: dict[str, list[dict[str, object]]] = {}
        for row in rows:
            label = str(row.get("neighborhood") or "Unknown neighborhood").strip() or "Unknown neighborhood"
            grouped.setdefault(label, []).append(_smart_item(row))
        groups = [
            {
                "group_key": neighborhood.lower(),
                "title": neighborhood,
                "item_count": len(items),
                "items": items,
            }
            for neighborhood, items in sorted(grouped.items(), key=lambda item: item[0].lower())
        ]
        return {"items": [], "groups": groups}

    if view_key == "nearby":
        if origin_latitude is None or origin_longitude is None:
            raise ValueError("nearby view requires origin_latitude and origin_longitude")

        with_distance: list[tuple[float, str, dict[str, object]]] = []
        without_distance: list[dict[str, object]] = []

        for row in rows:
            lat = _as_float(row.get("latitude"))
            lng = _as_float(row.get("longitude"))
            if lat is None or lng is None:
                without_distance.append(_smart_item(row))
                continue
            km = haversine_km(origin_latitude, origin_longitude, lat, lng)
            with_distance.append((km, str(row["added_at"]), _smart_item(row, distance_km=km)))

        with_distance.sort(key=lambda item: (item[0], item[1]))
        sorted_items = [item[2] for item in with_distance] + without_distance
        return {"items": sorted_items, "groups": []}

    raise ValueError(f"Unsupported smart view: {view_key}")


def list_smart_view_counts(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
) -> dict[SmartViewKey, int]:
    rows = _fetch_saved_rows(db_path, owner_id=owner_id, city_id=city_id)
    nine_plus = [row for row in rows if (_as_float(row.get("fiyu_score")) or 0.0) >= 90.0]
    by_neighborhood_count = len(
        {
            (str(row.get("neighborhood") or "Unknown neighborhood").strip() or "Unknown neighborhood").lower()
            for row in rows
        }
    )
    return {
        "recently_saved": len(rows),
        "fiyu_9_plus": len(nine_plus),
        "not_visited": len(rows),
        "by_neighborhood": by_neighborhood_count,
        "nearby": len(rows),
    }
