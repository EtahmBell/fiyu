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
TASTE_TYPE_UNLOCK_THRESHOLD = 20
TASTE_TYPE_REVIEW_INTERVAL = 10

_TAG_LABELS = {
    "counter_seating": "Counter spots",
    "small_capacity": "Small places",
    "private_rooms": "Private rooms",
    "table_dining": "Table dining",
    "solo_friendly": "Solo-friendly",
    "group_friendly": "Good for groups",
    "date_friendly": "Date-friendly",
    "reservation_heavy": "Reservation-led",
    "seasonal": "Seasonal",
    "intimate": "Intimate",
    "lively": "Lively",
    "quiet": "Quiet",
    "casual": "Casual",
    "refined": "Refined",
    "special_occasion": "Special occasion",
    "creative": "Creative",
    "regional": "Regional",
    "traditional": "Traditional",
    "chef_led": "Chef-led",
    "tasting_course": "Tasting menus",
    "noodles": "Noodles",
    "izakaya": "Izakaya",
    "grilled": "Grilled",
    "seafood": "Seafood",
    "neighbourhood": "Neighbourhood",
    "taste_breadth": "Exploring broadly",
}


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


def _confidence_for_type(insight_type: str) -> str:
    if insight_type == "strong_signal":
        return "strong"
    if insight_type == "reliable_pattern":
        return "reliable"
    if insight_type == "emerging":
        return "emerging"
    if insight_type == "contrast":
        return "strong"
    return "early"


def _fallback_copy(
    *,
    facet: TasteFacet,
    insight_type: str,
    direction: str,
    support: int,
    save_rate: float,
    visit_rate: float,
) -> tuple[str, str]:
    """Return varied editorial copy without changing the supported finding."""

    if facet.key == "taste_breadth":
        return (
            "You're still exploring widely",
            "Your strongest experiences are spread across several cuisines rather than clustering around one style.",
        )
    if facet.key == "rating_breadth":
        return (
            "You're using more of the rating scale",
            "Your first reactions include clear highs and lows instead of gathering around one score.",
        )
    if facet.key == "rating_balance":
        return (
            "Your first reactions are balanced",
            "Positive, neutral, and lower reactions all appear in your first Taste snapshot.",
        )
    if facet.key == "rating_baseline":
        return (
            "Your rating style is starting to show",
            "A useful baseline is forming, giving future restaurant patterns something honest to compare against.",
        )

    label = facet.label
    lower = label.lower()
    if insight_type == "contrast" or direction == "negative":
        headline = (
            "Formal dining seems less convincing so far"
            if facet.key in {"refined", "special_occasion", "reservation_heavy"}
            else f"{label} seem less convincing so far"
        )
        return headline, "Restaurants with this quality have landed below your usual ratings so far."
    if insight_type == "strong_signal":
        return (
            f"{label} keep landing well",
            f"{label} are one of the clearest repeated patterns among the places you rate highly.",
        )
    if insight_type == "reliable_pattern":
        return (
            f"{label} keep making the cut",
            "This quality continues to turn up among your better restaurant experiences.",
        )
    if insight_type == "emerging":
        if facet.key == "creative":
            headline = "Creative cooking is showing up more often"
        elif facet.key == "seasonal":
            headline = "Seasonal cooking is becoming a pattern"
        elif facet.key == "counter_seating":
            headline = "Counter spots keep making the cut"
        elif facet.key == "small_capacity":
            headline = "Small places are gaining ground"
        else:
            headline = f"{label} are showing up more often"
        if visit_rate > 0:
            description = (
                "Places with this quality are turning into actual visits more often among the restaurants you see."
            )
        elif save_rate > 0:
            description = "Places with this quality are making your saved list more often."
        else:
            description = "This quality is beginning to recur among the places that rate well for you."
        return headline, description
    if support == 0:
        return (
            f"No clear pattern around {lower} yet",
            "You have seen this quality several times, but non-engagement alone is only a weak signal.",
        )
    return (
        f"{label} are starting to stand out",
        "A few of your rated visits share this quality, though the pattern is still young.",
    )


def _identity_tag(facet: TasteFacet, insight: dict[str, Any]) -> dict[str, str] | None:
    if facet.key.startswith("rating_"):
        return None
    if facet.family == "price" and not (
        insight["type"] in {"strong_signal", "reliable_pattern"}
        and abs(float(insight["delta_from_user_average"])) >= 0.5
    ):
        return None
    label = _TAG_LABELS.get(facet.key)
    if label is None and facet.key.startswith("cuisine_"):
        label = facet.label
    return {"key": facet.key, "label": label or facet.label}


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
    rated_visits: list[dict[str, Any]],
    behavioral_visits: list[dict[str, Any]],
    catalog: dict[str, dict[str, Any]],
    saved_place_ids: set[str],
    exposed_place_ids: set[str],
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

    visited_place_ids = {
        str(visit.get("place_id") or "") for visit in behavioral_visits if visit.get("place_id")
    }
    exposed_by_facet: dict[TasteFacet, set[str]] = defaultdict(set)
    saved_by_facet: dict[TasteFacet, set[str]] = defaultdict(set)
    visited_by_facet: dict[TasteFacet, set[str]] = defaultdict(set)
    for place_id in exposed_place_ids:
        for facet in restaurant_taste_facets(catalog.get(place_id, {})):
            exposed_by_facet[facet].add(place_id)
    for place_id in saved_place_ids | visited_place_ids:
        for facet in restaurant_taste_facets(catalog.get(place_id, {})):
            if place_id in saved_place_ids:
                saved_by_facet[facet].add(place_id)
            if place_id in visited_place_ids:
                visited_by_facet[facet].add(place_id)

    candidates: list[tuple[float, TasteFacet, dict[str, Any]]] = []
    all_facets = set(observations) | set(exposed_by_facet)
    for facet in all_facets:
        ratings = observations.get(facet, [])
        support = len(ratings)
        average = sum(ratings) / support if ratings else baseline
        delta = average - baseline if ratings else 0.0
        high_frequency = sum(rating >= 4 for rating in ratings) / support if support else 0.0
        low_frequency = sum(rating <= 2 for rating in ratings) / support if support else 0.0
        exposed = len(exposed_by_facet.get(facet, set()))
        saved = len(saved_by_facet.get(facet, set()))
        visited = len(visited_by_facet.get(facet, set()))
        # Rates are meaningful only relative to restaurants this account was
        # actually shown. Saves/visits outside that exposure set remain useful
        # positive actions, but never manufacture an exposure-adjusted rate.
        exposed_saved = len(saved_by_facet.get(facet, set()) & exposed_by_facet.get(facet, set()))
        exposed_visited = len(
            visited_by_facet.get(facet, set()) & exposed_by_facet.get(facet, set())
        )
        save_rate = exposed_saved / exposed if exposed else 0.0
        visit_rate = exposed_visited / exposed if exposed else 0.0
        insight_type: str | None = None
        confidence_weight = 0.0
        if support >= MIN_STRONG_SUPPORT and delta >= 0.35 and average >= 4.0:
            insight_type = "strong_signal"
            supporting = f"You rate these {delta:.1f}★ above your {baseline:.1f}★ average."
            confidence_weight = 4.0
        elif support >= MIN_STRONG_SUPPORT and delta <= -0.35 and (
            average <= 3.0 or low_frequency >= 0.5
        ):
            insight_type = "contrast"
            supporting = f"You rate these {abs(delta):.1f}★ below your {baseline:.1f}★ average."
            confidence_weight = 4.0
        elif support >= MIN_STRONG_SUPPORT and average >= 4.25 and high_frequency >= 0.75:
            insight_type = "reliable_pattern"
            supporting = f"{average:.1f}★ across {support} rated visits."
            confidence_weight = 3.5
        elif support >= 2 and average >= 3.75 and delta >= 0.15:
            insight_type = "emerging"
            supporting = (
                f"An early pattern: {average:.1f}★ across {support} rated restaurants."
            )
            confidence_weight = 2.5
        elif exposed >= 3 and exposed_saved >= 2 and save_rate >= 0.4:
            insight_type = "emerging"
            supporting = (
                f"You saved {exposed_saved} of {exposed} surfaced restaurants with this quality."
            )
            confidence_weight = 2.0
        elif exposed >= 3 and exposed_visited >= 2 and visit_rate >= 0.3:
            insight_type = "emerging"
            supporting = (
                f"You visited {exposed_visited} of {exposed} surfaced restaurants with this quality."
            )
            confidence_weight = 1.8
        elif support >= 2 and average >= 3.5:
            insight_type = "early_signal"
            supporting = f"A limited early read: {average:.1f}★ across {support} rated restaurants."
            confidence_weight = 1.2
        elif exposed >= 5 and exposed_saved == 0 and exposed_visited == 0 and support == 0:
            insight_type = "early_signal"
            supporting = (
                f"You were shown {exposed} restaurants with this quality and have not acted on them yet."
            )
            confidence_weight = 0.4
        else:
            continue
        score = confidence_weight * 100 + (abs(delta) + save_rate + visit_rate) * math.sqrt(
            max(support, saved, visited, 1)
        )
        direction = (
            "negative"
            if insight_type == "contrast"
            else "neutral"
            if support == 0
            else "positive"
        )
        headline, description = _fallback_copy(
            facet=facet,
            insight_type=insight_type,
            direction=direction,
            support=support,
            save_rate=save_rate,
            visit_rate=visit_rate,
        )
        candidates.append((score, facet, {
            "id": f"{insight_type}:{facet.key}",
            "type": insight_type,
            "facet_key": facet.key,
            "facet_label": facet.label,
            "confidence": _confidence_for_type(insight_type),
            "direction": direction,
            "headline": headline,
            "description": description,
            "supporting_text": description,
            "support_count": max(support, saved, visited, exposed, 2),
            "average_rating": round(average, 2),
            "delta_from_user_average": round(delta, 2),
            "save_affinity": round(save_rate, 3),
            "visit_affinity": round(visit_rate, 3),
            "evidence_summary": supporting,
            "change_status": None,
        }))

    high_rated_cuisines: dict[str, int] = defaultdict(int)
    high_rated_places = 0
    for place_id, visit in latest_by_place.items():
        if int(visit["rating"]) < 4:
            continue
        high_rated_places += 1
        for facet in restaurant_taste_facets(catalog.get(place_id, {})):
            if facet.family == "cuisine":
                high_rated_cuisines[facet.key] += 1
    if high_rated_places >= 4 and len(high_rated_cuisines) >= 4:
        dominant = max(high_rated_cuisines.values(), default=0)
        if dominant / high_rated_places <= 0.4:
            breadth = TasteFacet("taste_breadth", "Broad exploration", "breadth")
            candidates.append((90.0, breadth, {
                "id": "early_signal:taste_breadth",
                "type": "early_signal",
                "facet_key": breadth.key,
                "facet_label": breadth.label,
                "confidence": "early",
                "direction": "neutral",
                "headline": "You're still exploring widely",
                "description": (
                    "Your strongest experiences are spread across several cuisines rather than "
                    "clustering around one style."
                ),
                "supporting_text": (
                    "Your strongest experiences are spread across several cuisines rather than "
                    "clustering around one style."
                ),
                "evidence_summary": (
                    f"Your higher ratings span {len(high_rated_cuisines)} cuisine families; none dominates yet."
                ),
                "support_count": high_rated_places,
                "average_rating": round(baseline, 2),
                "delta_from_user_average": 0.0,
                "save_affinity": 0.0,
                "visit_affinity": 0.0,
                "change_status": None,
            }))
    candidates.sort(key=lambda item: (-item[0], -item[2]["support_count"], item[1].label))

    selected: list[dict[str, Any]] = []
    selected_facets: dict[str, TasteFacet] = {}
    family_counts: dict[str, int] = defaultdict(int)
    for _, facet, insight in candidates:
        if family_counts[facet.family] >= 2:
            continue
        selected.append(insight)
        selected_facets[facet.key] = facet
        family_counts[facet.family] += 1
        if len(selected) == 4:
            break
    if len(rated_visits) >= TASTE_UNLOCK_THRESHOLD and "rating_breadth" not in selected_facets:
        unique_rating_count = len(latest_by_place)
        rating_values = [int(visit["rating"]) for visit in latest_by_place.values()]
        rating_range = max(rating_values) - min(rating_values) if rating_values else 0
        supporting = (
            f"You used a {rating_range + 1}-point span across {len(rated_visits)} rated visits."
            if rating_range >= 2
            else f"Your first {len(rated_visits)} ratings sit within a narrow {rating_range + 1}-point span."
        )
        if len(selected) < 3:
            selected.append({
                "id": "early_signal:rating_breadth",
                "type": "early_signal",
                "facet_key": "rating_breadth",
                "facet_label": "Rating breadth",
                "confidence": "early",
                "direction": "neutral",
                "headline": "You're using more of the rating scale",
                "description": (
                    "Your first reactions include clear highs and lows instead of gathering around one score."
                ),
                "supporting_text": (
                    "Your first reactions include clear highs and lows instead of gathering around one score."
                ),
                "evidence_summary": supporting,
                "support_count": max(unique_rating_count, len(rated_visits), 2),
                "average_rating": round(baseline, 2),
                "delta_from_user_average": 0.0,
                "save_affinity": 0.0,
                "visit_affinity": 0.0,
                "change_status": None,
            })
        selected_facets["rating_breadth"] = TasteFacet(
            "rating_breadth", "Rating breadth", "rating"
        )

    if len(rated_visits) >= TASTE_UNLOCK_THRESHOLD and len(selected) < 3:
        positive = sum(int(visit["rating"]) >= 4 for visit in rated_visits)
        low = sum(int(visit["rating"]) <= 2 for visit in rated_visits)
        if positive >= 6:
            supporting = f"{positive} of your first {len(rated_visits)} rated visits are 4★ or 5★."
        elif low >= 4:
            supporting = f"{low} of your first {len(rated_visits)} rated visits are 1★ or 2★."
        else:
            supporting = (
                f"Your first {len(rated_visits)} ratings mix positive, neutral, and lower reactions."
            )
        selected.append({
            "id": "early_signal:rating_balance",
            "type": "early_signal",
            "facet_key": "rating_balance",
            "facet_label": "Rating balance",
            "confidence": "early",
            "direction": "neutral",
            "headline": "Your first reactions are balanced",
            "description": (
                "Positive, neutral, and lower reactions all appear in your first Taste snapshot."
            ),
            "supporting_text": (
                "Positive, neutral, and lower reactions all appear in your first Taste snapshot."
            ),
            "evidence_summary": supporting,
            "support_count": len(rated_visits),
            "average_rating": round(baseline, 2),
            "delta_from_user_average": 0.0,
            "save_affinity": 0.0,
            "visit_affinity": 0.0,
            "change_status": None,
        })
        selected_facets["rating_balance"] = TasteFacet(
            "rating_balance", "Rating balance", "rating"
        )

    if len(rated_visits) >= TASTE_UNLOCK_THRESHOLD and len(selected) < 3:
        selected.append({
            "id": "early_signal:rating_baseline",
            "type": "early_signal",
            "facet_key": "rating_baseline",
            "facet_label": "Rating baseline",
            "confidence": "early",
            "direction": "neutral",
            "headline": "Your rating style is starting to show",
            "description": (
                "A useful baseline is forming, giving future restaurant patterns something honest to compare against."
            ),
            "supporting_text": (
                "A useful baseline is forming, giving future restaurant patterns something honest to compare against."
            ),
            "evidence_summary": (
                f"Your average across the first {len(rated_visits)} rated visits is {baseline:.1f}★."
            ),
            "support_count": len(rated_visits),
            "average_rating": round(baseline, 2),
            "delta_from_user_average": 0.0,
            "save_affinity": 0.0,
            "visit_affinity": 0.0,
            "change_status": None,
        })
        selected_facets["rating_baseline"] = TasteFacet(
            "rating_baseline", "Rating baseline", "rating"
        )
    tags: list[dict[str, str]] = []
    seen_tag_keys: set[str] = set()
    for item in selected:
        facet = selected_facets[item["facet_key"]]
        tag = _identity_tag(facet, item)
        if tag is not None and tag["key"] not in seen_tag_keys:
            tags.append(tag)
            seen_tag_keys.add(tag["key"])
    return selected, tags[:8], round(baseline, 2)


def build_taste_snapshot(
    *,
    visits: list[dict[str, Any]],
    catalog: dict[str, dict[str, Any]],
    milestone: int,
    previous_snapshot: dict[str, Any] | None = None,
    saved_place_ids: Iterable[str] = (),
    exposed_place_ids: Iterable[str] = (),
) -> dict[str, Any]:
    rated = _rated_visits_oldest_first(visits)[:milestone]
    cutoff = str(rated[-1].get("visited_at") or "") if rated else ""
    behavioral_visits = [
        visit for visit in visits if not cutoff or str(visit.get("visited_at") or "") <= cutoff
    ]
    insights, tags, baseline = _snapshot_insights(
        rated,
        behavioral_visits,
        catalog,
        set(saved_place_ids),
        set(exposed_place_ids),
    )
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
        "taste_type": None,
        "taste_type_policy": {
            "unlock_threshold": TASTE_TYPE_UNLOCK_THRESHOLD,
            "review_interval": TASTE_TYPE_REVIEW_INTERVAL,
        },
    }


def build_user_fiyu_summary(
    *,
    visits: list[dict[str, Any]],
    saved_place_ids: list[str],
    catalog: dict[str, dict[str, Any]],
    previous_taste_snapshot: dict[str, Any] | None = None,
    exposed_place_ids: Iterable[str] = (),
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
        or build_taste_snapshot(
            visits=visits,
            catalog=catalog,
            milestone=previous_milestone,
            saved_place_ids=saved_place_ids,
            exposed_place_ids=exposed_place_ids,
        )
        if previous_milestone is not None else None
    )
    current_snapshot = (
        build_taste_snapshot(
            visits=visits,
            catalog=catalog,
            milestone=current_milestone,
            previous_snapshot=previous_snapshot,
            saved_place_ids=saved_place_ids,
            exposed_place_ids=exposed_place_ids,
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
        "taste_type": None,
        "recent_visits": recent_visits,
        "_taste_snapshot": current_snapshot,
    }
