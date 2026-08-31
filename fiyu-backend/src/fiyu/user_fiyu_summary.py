from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

TASTE_UNLOCK_THRESHOLD = 5

_BUDGET_ORDER = ("budget", "moderate", "upscale", "splurge")
_BUDGET_LABELS = {
    "budget": "Under ¥3,000",
    "moderate": "¥3,000–¥5,000",
    "upscale": "¥5,000–¥10,000",
    "splurge": "¥10,000+",
}


def _text(value: object) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _note_excerpt(value: object, *, limit: int = 120) -> str | None:
    note = _text(value)
    if note is None or len(note) <= limit:
        return note
    shortened = note[: limit - 1].rstrip()
    if " " in shortened:
        shortened = shortened.rsplit(" ", 1)[0]
    return f"{shortened}…"


def _rating(value: object) -> int | None:
    return value if isinstance(value, int) and 1 <= value <= 5 else None


def _top_cuisines(
    visits: list[dict[str, Any]], catalog: dict[str, dict[str, Any]]
) -> list[str]:
    ratings: dict[str, list[int]] = defaultdict(list)
    labels: dict[str, str] = {}
    for visit in visits:
        rating = _rating(visit.get("rating"))
        restaurant = catalog.get(str(visit.get("place_id")), {})
        category = _text(restaurant.get("primary_category"))
        if rating is None or category is None:
            continue
        key = category.casefold()
        labels.setdefault(key, category)
        ratings[key].append(rating)

    ranked: list[tuple[float, float, int, str]] = []
    for key, values in ratings.items():
        positive_count = sum(value >= 4 for value in values)
        preference_score = sum(value - 3 for value in values)
        average = sum(values) / len(values)
        if positive_count < 2 or preference_score <= 0 or average < 3.75:
            continue
        ranked.append((preference_score, average, len(values), labels[key]))
    ranked.sort(key=lambda item: (-item[0], -item[1], -item[2], item[3].casefold()))
    return [label for _, _, _, label in ranked[:3]]


def _usual_budget(
    visits: list[dict[str, Any]], catalog: dict[str, dict[str, Any]]
) -> str | None:
    bands: list[str] = []
    for visit in visits:
        budget = catalog.get(str(visit.get("place_id")), {}).get("budget")
        if not isinstance(budget, dict):
            continue
        band = budget.get("band")
        if band in _BUDGET_LABELS:
            bands.append(str(band))
    if len(bands) < 2:
        return None
    counts = Counter(bands)
    midpoint = (len(bands) - 1) // 2
    seen = 0
    for band in _BUDGET_ORDER:
        seen += counts[band]
        if seen > midpoint:
            return _BUDGET_LABELS[band]
    return None


def _top_areas(
    visits: list[dict[str, Any]], catalog: dict[str, dict[str, Any]]
) -> list[str]:
    counts: Counter[str] = Counter()
    for visit in visits:
        area = _text(catalog.get(str(visit.get("place_id")), {}).get("area_label"))
        if area and area != "Unknown neighborhood":
            counts[area] += 1
    return [area for area, count in counts.most_common() if count >= 2][:3]


def build_user_fiyu_summary(
    *,
    visits: list[dict[str, Any]],
    saved_place_ids: list[str],
    catalog: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Build private, deterministic taste analytics from structured account data."""

    rated_visit_count = sum(_rating(visit.get("rating")) is not None for visit in visits)
    taste_unlocked = rated_visit_count >= TASTE_UNLOCK_THRESHOLD
    visited_place_ids = list(
        dict.fromkeys(str(visit["place_id"]) for visit in visits if visit.get("place_id"))
    )
    areas = {
        area
        for place_id in visited_place_ids
        if (
            area := _text(catalog.get(place_id, {}).get("area_label"))
        )
        and area != "Unknown neighborhood"
    }

    recent_visits = []
    for visit in visits[:3]:
        place_id = str(visit.get("place_id") or "")
        restaurant = catalog.get(place_id, {})
        recent_visits.append(
            {
                "id": str(visit.get("id") or ""),
                "place_id": place_id,
                "name_ja": _text(restaurant.get("name_ja")),
                "name_en": _text(restaurant.get("name_en")),
                "area": _text(restaurant.get("area_label")),
                "visited_at": str(visit.get("visited_at") or ""),
                "rating": _rating(visit.get("rating")),
                "private_note_excerpt": _note_excerpt(visit.get("private_note")),
            }
        )

    return {
        "visited_count": len(visited_place_ids),
        "saved_count": len(set(saved_place_ids)),
        "area_count": len(areas),
        "rated_visit_count": rated_visit_count,
        "taste_unlock_threshold": TASTE_UNLOCK_THRESHOLD,
        "taste_unlocked": taste_unlocked,
        "top_cuisines": _top_cuisines(visits, catalog) if taste_unlocked else [],
        "usual_budget": _usual_budget(visits, catalog) if taste_unlocked else None,
        "top_areas": _top_areas(visits, catalog) if taste_unlocked else [],
        "top_traits": [],
        "recent_visits": recent_visits,
    }
