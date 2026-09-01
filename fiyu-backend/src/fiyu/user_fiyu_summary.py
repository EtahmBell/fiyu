from __future__ import annotations

import math
import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

TOGETHER_UNLOCK_THRESHOLD = 5
TASTE_UNLOCK_THRESHOLD = 10
TASTE_REFRESH_INTERVAL = 5
MIN_STRONG_SUPPORT = 3


@dataclass(frozen=True)
class TasteFacet:
    key: str
    label: str
    family: str


_FACETS = {
    facet.key: facet
    for facet in (
        TasteFacet("counter_seating", "Counter spots", "dining_format"),
        TasteFacet("small_capacity", "Small restaurants", "dining_format"),
        TasteFacet("private_rooms", "Private rooms", "dining_format"),
        TasteFacet("table_dining", "Table dining", "dining_format"),
        TasteFacet("solo_friendly", "Solo-friendly", "occasion"),
        TasteFacet("group_friendly", "Group-friendly", "occasion"),
        TasteFacet("date_friendly", "Date-friendly", "occasion"),
        TasteFacet("reservation_heavy", "Reservation-led", "venue_character"),
        TasteFacet("seasonal", "Seasonal cooking", "food_style"),
        TasteFacet("intimate", "Intimate settings", "atmosphere"),
        TasteFacet("lively", "Lively rooms", "atmosphere"),
        TasteFacet("quiet", "Quiet rooms", "atmosphere"),
        TasteFacet("casual", "Casual spots", "atmosphere"),
        TasteFacet("refined", "Refined dining", "atmosphere"),
        TasteFacet("special_occasion", "Special-occasion dining", "occasion"),
        TasteFacet("creative", "Creative cooking", "food_style"),
        TasteFacet("regional", "Regional cooking", "food_style"),
        TasteFacet("traditional", "Traditional cooking", "food_style"),
        TasteFacet("chef_led", "Chef-led restaurants", "venue_character"),
        TasteFacet("tasting_course", "Tasting menus", "food_style"),
        TasteFacet("noodles", "Noodle shops", "food_style"),
        TasteFacet("izakaya", "Izakaya", "cuisine"),
        TasteFacet("grilled", "Grilled cooking", "food_style"),
        TasteFacet("seafood", "Seafood", "food_style"),
        TasteFacet("neighbourhood", "Neighbourhood spots", "venue_character"),
        TasteFacet("budget", "Under ¥3,000", "price"),
        TasteFacet("moderate", "¥3,000–¥5,000", "price"),
        TasteFacet("upscale", "¥5,000–¥10,000", "price"),
        TasteFacet("splurge", "¥10,000+", "price"),
    )
}

_THEME_PATTERNS = tuple(
    (key, re.compile(pattern, re.IGNORECASE))
    for key, pattern in (
        ("seasonal", r"\bseasonal|seasonality|旬"),
        ("intimate", r"\bintimate|cozy|cosy|こぢんまり"),
        ("lively", r"\blively|energetic|bustling|活気"),
        ("quiet", r"\bquiet|calm|peaceful|落ち着"),
        ("casual", r"\bcasual|relaxed|laid-back|気軽"),
        ("refined", r"\brefined|elegant|polished|洗練"),
        ("special_occasion", r"special occasion|anniversary|記念日"),
        ("creative", r"\bcreative|inventive|innovative|独創"),
        ("regional", r"\bregional|local cuisine|郷土|地方料理|沖縄料理"),
        ("traditional", r"\btraditional|classic technique|伝統|昔ながら"),
        ("chef_led", r"\bchef-led|chef driven|owner-chef|店主|料理人"),
        ("tasting_course", r"tasting menu|course menu|omakase|おまかせ|コース"),
        ("noodles", r"\bnoodle|ramen|soba|udon|ラーメン|蕎麦|うどん"),
        ("grilled", r"\bgrill|charcoal|yakitori|yakiniku|焼鳥|焼肉|炭火"),
        ("seafood", r"\bseafood|fish|sushi|鮨|寿司|魚介"),
        ("neighbourhood", r"\bneighbou?rhood|local regular|community spot|地域密着"),
    )
)

_CUISINE_PATTERNS = tuple(
    (key, label, re.compile(pattern, re.IGNORECASE))
    for key, label, pattern in (
        ("cuisine_sushi", "Sushi", r"sushi|鮨|寿司"),
        ("cuisine_french", "French", r"french|フレンチ"),
        ("cuisine_italian", "Italian", r"italian|trattoria|イタリア"),
        ("cuisine_chinese", "Chinese", r"chinese|中華|中国料理"),
        ("cuisine_indian", "Indian", r"indian|インド料理"),
        ("cuisine_okinawan", "Okinawan", r"okinawa|沖縄"),
        ("cuisine_thai", "Thai", r"thai|タイ料理"),
        ("cuisine_korean", "Korean", r"korean|韓国料理"),
    )
)


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


def _boolean_path(value: object, *path: str) -> bool:
    current = value
    for key in path:
        if not isinstance(current, dict):
            return False
        current = current.get(key)
    return current is True


def _facet(key: str, *, label: str | None = None, family: str | None = None) -> TasteFacet:
    known = _FACETS.get(key)
    return known or TasteFacet(key, label or key.replace("_", " ").title(), family or "cuisine")


def restaurant_taste_facets(restaurant: dict[str, Any]) -> set[TasteFacet]:
    """Derive reviewed deterministic facets from structured public catalog data."""

    facets: set[TasteFacet] = set()
    practical = restaurant.get("practical_info")
    for key, path in (
        ("counter_seating", ("seating", "counter")),
        ("small_capacity", ("seating", "small_capacity")),
        ("private_rooms", ("seating", "private_rooms")),
        ("table_dining", ("seating", "tables")),
        ("solo_friendly", ("visit_style", "solo_friendly")),
        ("group_friendly", ("visit_style", "group_friendly")),
        ("date_friendly", ("visit_style", "date_friendly")),
    ):
        if _boolean_path(practical, *path):
            facets.add(_facet(key))
    if isinstance(practical, dict):
        reservation = practical.get("reservation")
        status = reservation.get("status") if isinstance(reservation, dict) else None
        if status in {"required", "strongly_recommended"}:
            facets.add(_facet("reservation_heavy"))

    budget = restaurant.get("budget")
    if isinstance(budget, dict) and budget.get("band") in {
        "budget", "moderate", "upscale", "splurge"
    }:
        facets.add(_facet(str(budget["band"])))

    terms = restaurant.get("cuisine_terms_en")
    cuisine_terms = terms if isinstance(terms, list) else []
    category_text = " ".join(
        filter(
            None,
            (
                _text(restaurant.get("primary_category")),
                _text(restaurant.get("category")),
                _text(restaurant.get("restaurant_type_en")),
                *(_text(item) for item in cuisine_terms),
            ),
        )
    )
    if re.search(r"izakaya|居酒屋", category_text, re.IGNORECASE):
        facets.add(_facet("izakaya"))
    if re.search(r"ramen|soba|udon|noodle|ラーメン|蕎麦|うどん", category_text, re.IGNORECASE):
        facets.add(_facet("noodles"))
    if re.search(r"yakiniku|yakitori|grill|barbecue|焼肉|焼鳥", category_text, re.IGNORECASE):
        facets.add(_facet("grilled"))
    if re.search(r"seafood|sushi|fish|鮨|寿司|魚介", category_text, re.IGNORECASE):
        facets.add(_facet("seafood"))
    for key, label, pattern in _CUISINE_PATTERNS:
        if pattern.search(category_text):
            facets.add(_facet(key, label=label, family="cuisine"))

    themes = restaurant.get("review_themes")
    if isinstance(themes, list):
        for theme in themes:
            if not isinstance(theme, dict):
                continue
            confidence = theme.get("confidence")
            source_count = theme.get("supporting_source_count")
            if not isinstance(confidence, (int, float)) or confidence < 0.65:
                continue
            if not isinstance(source_count, int) or source_count < 1:
                continue
            theme_text = _text(theme.get("theme")) or ""
            for key, pattern in _THEME_PATTERNS:
                if pattern.search(theme_text):
                    facets.add(_facet(key))
    return facets


def _rated_visits_oldest_first(visits: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    rated = [visit for visit in visits if _rating(visit.get("rating")) is not None]
    return sorted(
        rated,
        key=lambda visit: (
            str(visit.get("visited_at") or ""),
            str(visit.get("created_at") or ""),
            str(visit.get("id") or ""),
        ),
    )


def _snapshot_insights(
    rated_visits: list[dict[str, Any]], catalog: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, str]], float | None]:
    if not rated_visits:
        return [], [], None
    baseline = sum(int(visit["rating"]) for visit in rated_visits) / len(rated_visits)
    latest_by_place: dict[str, dict[str, Any]] = {}
    for visit in rated_visits:
        place_id = str(visit.get("place_id") or "")
        if place_id:
            latest_by_place[place_id] = visit

    observations: dict[TasteFacet, list[int]] = defaultdict(list)
    for place_id, visit in latest_by_place.items():
        rating = _rating(visit.get("rating"))
        if rating is None:
            continue
        for facet in restaurant_taste_facets(catalog.get(place_id, {})):
            observations[facet].append(rating)

    candidates: list[tuple[float, TasteFacet, dict[str, Any]]] = []
    for facet, ratings in observations.items():
        support = len(ratings)
        if support < MIN_STRONG_SUPPORT:
            continue
        average = sum(ratings) / support
        delta = average - baseline
        high_frequency = sum(rating >= 4 for rating in ratings) / support
        low_frequency = sum(rating <= 2 for rating in ratings) / support
        insight_type: str | None = None
        if delta >= 0.35 and average >= 4.0:
            insight_type = "strong_signal"
            supporting = f"You rate these {delta:.1f}★ above your {baseline:.1f}★ average."
        elif delta <= -0.35 and (average <= 3.0 or low_frequency >= 0.5):
            insight_type = "contrast"
            supporting = f"You rate these {abs(delta):.1f}★ below your {baseline:.1f}★ average."
        elif average >= 4.25 and high_frequency >= 0.75:
            insight_type = "reliable_pattern"
            supporting = f"{average:.1f}★ across {support} rated visits."
        else:
            continue
        score = (abs(delta) + (0.3 if insight_type == "reliable_pattern" else 0)) * math.sqrt(support)
        headline = (
            f"{facet.label} keep landing well"
            if insight_type == "strong_signal"
            else f"{facet.label} are a consistent favorite"
            if insight_type == "reliable_pattern"
            else f"{facet.label} land below your usual"
        )
        candidates.append((score, facet, {
            "id": f"{insight_type}:{facet.key}",
            "type": insight_type,
            "facet_key": facet.key,
            "headline": headline,
            "supporting_text": supporting,
            "support_count": support,
            "average_rating": round(average, 2),
            "delta_from_user_average": round(delta, 2),
            "change_status": None,
        }))
    candidates.sort(key=lambda item: (-item[0], -item[2]["support_count"], item[1].label))

    selected: list[dict[str, Any]] = []
    selected_labels: dict[str, str] = {}
    family_counts: dict[str, int] = defaultdict(int)
    for _, facet, insight in candidates:
        if family_counts[facet.family] >= 2:
            continue
        selected.append(insight)
        selected_labels[facet.key] = facet.label
        family_counts[facet.family] += 1
        if len(selected) == 4:
            break
    tags = [
        {"key": item["facet_key"], "label": selected_labels[item["facet_key"]]}
        for item in selected
    ]
    return selected, tags[:8], round(baseline, 2)


def build_taste_snapshot(
    *,
    visits: list[dict[str, Any]],
    catalog: dict[str, dict[str, Any]],
    milestone: int,
    previous_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rated = _rated_visits_oldest_first(visits)[:milestone]
    insights, tags, baseline = _snapshot_insights(rated, catalog)
    previous_by_facet = {
        str(insight.get("facet_key")): insight
        for insight in (previous_snapshot or {}).get("insights", [])
        if isinstance(insight, dict) and insight.get("facet_key")
    }
    for insight in insights:
        previous = previous_by_facet.get(str(insight["facet_key"]))
        if previous is None:
            insight["change_status"] = "new" if previous_snapshot is not None else None
            continue
        previous_delta = abs(float(previous.get("delta_from_user_average") or 0))
        current_delta = abs(float(insight.get("delta_from_user_average") or 0))
        insight["change_status"] = "stronger" if current_delta >= previous_delta + 0.2 else "still_true"
    return {
        "milestone": milestone,
        "rated_visit_count": len(rated),
        "overall_average": baseline,
        "insights": insights,
        "tags": tags,
        "uniqueness": None,
    }


def build_user_fiyu_summary(
    *,
    visits: list[dict[str, Any]],
    saved_place_ids: list[str],
    catalog: dict[str, dict[str, Any]],
    previous_taste_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build account-private Taste analytics without reading private-note text."""

    rated = _rated_visits_oldest_first(visits)
    rated_visit_count = len(rated)
    taste_unlocked = rated_visit_count >= TASTE_UNLOCK_THRESHOLD
    current_milestone = (
        (rated_visit_count // TASTE_REFRESH_INTERVAL) * TASTE_REFRESH_INTERVAL
        if taste_unlocked else None
    )
    previous_milestone = (
        current_milestone - TASTE_REFRESH_INTERVAL
        if current_milestone is not None and current_milestone > TASTE_UNLOCK_THRESHOLD else None
    )
    previous_snapshot = (
        previous_taste_snapshot
        or build_taste_snapshot(visits=visits, catalog=catalog, milestone=previous_milestone)
        if previous_milestone is not None else None
    )
    current_snapshot = (
        build_taste_snapshot(
            visits=visits,
            catalog=catalog,
            milestone=current_milestone,
            previous_snapshot=previous_snapshot,
        ) if current_milestone is not None else None
    )
    next_milestone = (
        current_milestone + TASTE_REFRESH_INTERVAL
        if current_milestone is not None else TASTE_UNLOCK_THRESHOLD
    )

    visited_place_ids = list(dict.fromkeys(
        str(visit["place_id"]) for visit in visits if visit.get("place_id")
    ))
    areas = {
        area for place_id in visited_place_ids
        if (area := _text(catalog.get(place_id, {}).get("area_label")))
        and area != "Unknown neighborhood"
    }
    recent_visits = []
    for visit in visits[:3]:
        place_id = str(visit.get("place_id") or "")
        restaurant = catalog.get(place_id, {})
        recent_visits.append({
            "id": str(visit.get("id") or ""),
            "place_id": place_id,
            "name_ja": _text(restaurant.get("name_ja")),
            "name_en": _text(restaurant.get("name_en")),
            "area": _text(restaurant.get("area_label")),
            "visited_at": str(visit.get("visited_at") or ""),
            "rating": _rating(visit.get("rating")),
            "private_note_excerpt": _note_excerpt(visit.get("private_note")),
        })

    return {
        "visited_count": len(visited_place_ids),
        "saved_count": len(set(saved_place_ids)),
        "area_count": len(areas),
        "rated_visit_count": rated_visit_count,
        "together_unlock_threshold": TOGETHER_UNLOCK_THRESHOLD,
        "together_unlocked": rated_visit_count >= TOGETHER_UNLOCK_THRESHOLD,
        "taste_unlock_threshold": TASTE_UNLOCK_THRESHOLD,
        "taste_unlocked": taste_unlocked,
        "taste_current_milestone": current_milestone,
        "taste_previous_milestone": previous_milestone,
        "taste_next_milestone": next_milestone,
        "ratings_until_next_taste_update": max(next_milestone - rated_visit_count, 0),
        "taste_insights": current_snapshot["insights"] if current_snapshot else [],
        "taste_tags": current_snapshot["tags"] if current_snapshot else [],
        "taste_has_unseen_update": False,
        "taste_uniqueness": None,
        "recent_visits": recent_visits,
        "_taste_snapshot": current_snapshot,
    }
