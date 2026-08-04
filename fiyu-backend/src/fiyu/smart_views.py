from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable, Literal

from .database import connect
from .entitlements import CAPABILITY_PREMIUM_SMART_VIEWS, Capability
from .restaurant_lists import get_or_create_default_list
from .utils import haversine_km

SmartViewKey = Literal[
    "recently_saved",
    "fiyu_9_plus",
    "not_visited",
    "by_neighborhood",
    "nearby",
    "ramen_in_shibuya",
    "out_of_the_way_gems",
    "worth_the_detour",
]

SmartViewTier = Literal["free", "premium"]
SmartCollectionType = Literal["deterministic"]


@dataclass(frozen=True)
class SmartViewDefinition:
    key: SmartViewKey
    label: str
    description: str
    tier: SmartViewTier
    collection_type: SmartCollectionType
    required_capability: Capability | None = None
    requires_origin: bool = False
    ordering: str = "saved_newest"

SMART_VIEW_KEYS: tuple[SmartViewKey, ...] = (
    "recently_saved",
    "fiyu_9_plus",
    "not_visited",
    "by_neighborhood",
    "nearby",
    "ramen_in_shibuya",
    "out_of_the_way_gems",
    "worth_the_detour",
)

SMART_VIEW_DEFINITIONS: dict[SmartViewKey, SmartViewDefinition] = {
    "recently_saved": SmartViewDefinition(
        key="recently_saved",
        label="Recently saved",
        description="Most recently saved restaurants first.",
        tier="free",
        collection_type="deterministic",
        ordering="saved_newest",
    ),
    "fiyu_9_plus": SmartViewDefinition(
        key="fiyu_9_plus",
        label="Fiyu 9+",
        description="Saved restaurants with Fiyu Score 90 and above.",
        tier="free",
        collection_type="deterministic",
        ordering="score_threshold_then_saved_newest",
    ),
    "not_visited": SmartViewDefinition(
        key="not_visited",
        label="Not visited",
        description="Saved restaurants you have not logged as visited.",
        tier="free",
        collection_type="deterministic",
        ordering="saved_newest",
    ),
    "by_neighborhood": SmartViewDefinition(
        key="by_neighborhood",
        label="By neighborhood",
        description="Saved restaurants grouped by neighborhood.",
        tier="free",
        collection_type="deterministic",
        ordering="grouped_by_neighborhood_then_saved_newest",
    ),
    "nearby": SmartViewDefinition(
        key="nearby",
        label="Nearby",
        description="Saved restaurants ordered by distance from a point.",
        tier="free",
        collection_type="deterministic",
        requires_origin=True,
        ordering="distance_then_saved_newest",
    ),
    "ramen_in_shibuya": SmartViewDefinition(
        key="ramen_in_shibuya",
        label="Ramen in Shibuya",
        description="Saved ramen spots in Shibuya.",
        tier="premium",
        collection_type="deterministic",
        required_capability=CAPABILITY_PREMIUM_SMART_VIEWS,
        ordering="saved_newest",
    ),
    "out_of_the_way_gems": SmartViewDefinition(
        key="out_of_the_way_gems",
        label="Out-of-the-way gems",
        description="Saved restaurants farther from central Shibuya with strong Fiyu scores.",
        tier="premium",
        collection_type="deterministic",
        required_capability=CAPABILITY_PREMIUM_SMART_VIEWS,
        ordering="distance_desc_then_score_desc_then_saved_newest",
    ),
    "worth_the_detour": SmartViewDefinition(
        key="worth_the_detour",
        label="Worth the detour",
        description="Saved restaurants with standout Fiyu scores, ordered strongest first.",
        tier="premium",
        collection_type="deterministic",
        required_capability=CAPABILITY_PREMIUM_SMART_VIEWS,
        ordering="score_desc_then_saved_newest",
    ),
}

SMART_VIEW_META: dict[SmartViewKey, dict[str, str]] = {
    key: {
        "label": definition.label,
        "description": definition.description,
    }
    for key, definition in SMART_VIEW_DEFINITIONS.items()
}

SHIBUYA_REFERENCE_LATITUDE = 35.6595
SHIBUYA_REFERENCE_LONGITUDE = 139.7005
OUT_OF_THE_WAY_MIN_DISTANCE_KM = 6.0
OUT_OF_THE_WAY_MIN_SCORE = 82.0
WORTH_THE_DETOUR_MIN_SCORE = 88.0


def smart_view_definition(view_key: SmartViewKey) -> SmartViewDefinition:
    return SMART_VIEW_DEFINITIONS[view_key]


def list_available_smart_view_keys(capabilities: Iterable[str]) -> tuple[SmartViewKey, ...]:
    capability_set = set(capabilities)
    return tuple(
        key
        for key in SMART_VIEW_KEYS
        if (
            SMART_VIEW_DEFINITIONS[key].required_capability is None
            or SMART_VIEW_DEFINITIONS[key].required_capability in capability_set
        )
    )


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _distance_from_shibuya_km(row: dict[str, object]) -> float | None:
    lat = _as_float(row.get("latitude"))
    lng = _as_float(row.get("longitude"))
    if lat is None or lng is None:
        return None
    return haversine_km(SHIBUYA_REFERENCE_LATITUDE, SHIBUYA_REFERENCE_LONGITUDE, lat, lng)


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

    definition = SMART_VIEW_DEFINITIONS[view_key]
    if definition.requires_origin and (origin_latitude is None or origin_longitude is None):
        raise ValueError(f"{view_key} view requires origin_latitude and origin_longitude")

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

    if view_key == "ramen_in_shibuya":
        filtered = []
        for row in rows:
            category = _as_text(row.get("primary_category"))
            neighborhood = _as_text(row.get("neighborhood"))
            if "ramen" in category and "shibuya" in neighborhood:
                filtered.append(_smart_item(row))
        return {"items": filtered, "groups": []}

    if view_key == "out_of_the_way_gems":
        ranked: list[tuple[float, float, str, dict[str, object]]] = []
        for row in rows:
            score = _as_float(row.get("fiyu_score")) or 0.0
            if score < OUT_OF_THE_WAY_MIN_SCORE:
                continue
            distance = _distance_from_shibuya_km(row)
            if distance is None or distance < OUT_OF_THE_WAY_MIN_DISTANCE_KM:
                continue
            ranked.append(
                (
                    distance,
                    score,
                    str(row["added_at"]),
                    _smart_item(row, distance_km=distance),
                )
            )
        ranked.sort(key=lambda item: (-item[0], -item[1], item[2]))
        return {"items": [item[3] for item in ranked], "groups": []}

    if view_key == "worth_the_detour":
        ranked: list[tuple[float, str, dict[str, object]]] = []
        for row in rows:
            score = _as_float(row.get("fiyu_score")) or 0.0
            if score < WORTH_THE_DETOUR_MIN_SCORE:
                continue
            ranked.append((score, str(row["added_at"]), _smart_item(row)))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        return {"items": [item[2] for item in ranked], "groups": []}

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
    ramen_in_shibuya = [
        row
        for row in rows
        if "ramen" in _as_text(row.get("primary_category"))
        and "shibuya" in _as_text(row.get("neighborhood"))
    ]
    out_of_the_way = [
        row
        for row in rows
        if (_as_float(row.get("fiyu_score")) or 0.0) >= OUT_OF_THE_WAY_MIN_SCORE
        and (_distance_from_shibuya_km(row) or -1.0) >= OUT_OF_THE_WAY_MIN_DISTANCE_KM
    ]
    worth_the_detour = [
        row for row in rows if (_as_float(row.get("fiyu_score")) or 0.0) >= WORTH_THE_DETOUR_MIN_SCORE
    ]
    return {
        "recently_saved": len(rows),
        "fiyu_9_plus": len(nine_plus),
        "not_visited": len(rows),
        "by_neighborhood": by_neighborhood_count,
        "nearby": len(rows),
        "ramen_in_shibuya": len(ramen_in_shibuya),
        "out_of_the_way_gems": len(out_of_the_way),
        "worth_the_detour": len(worth_the_detour),
    }
