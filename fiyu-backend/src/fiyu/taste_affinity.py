from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from .user_fiyu_summary import latest_rated_visits_by_place, restaurant_taste_facets

MIN_PRICED_RESTAURANTS_FOR_RELAXATION = 6
FULL_PRICE_CONFIDENCE_RESTAURANTS = 10
AFFORDABLE_PREFERENCE_BLOCKING_AFFINITY = 0.5


@dataclass(frozen=True)
class UserTasteProfile:
    """Private, deterministic affinities. This object is never returned by the API."""

    facet_affinities: Mapping[str, float]
    confidence: float
    rated_count: int


@dataclass(frozen=True)
class BudgetPreferenceProfile:
    """Private price-specific evidence used only by Solo affordability policy."""

    affordable_affinity: float
    higher_price_affinity: float
    affordable_rated_count: int
    higher_price_rated_count: int
    known_price_rated_count: int
    confidence: float
    affordability_relaxation_strength: float
    valid: bool = True


def _shrunk_affinity(values: list[float]) -> float:
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    return round(mean * (len(values) / (len(values) + 2)), 6)


def _canonical_budget_maximum(restaurant: Mapping[str, Any]) -> float | None:
    budget = restaurant.get("budget")
    if budget is None:
        return None
    if not isinstance(budget, dict):
        raise TypeError("budget must be an object")
    maximum = budget.get("maximum")
    if (
        not isinstance(maximum, (int, float))
        or isinstance(maximum, bool)
        or not 0 <= float(maximum) < float("inf")
    ):
        raise ValueError("budget maximum must be a finite non-negative number")
    return float(maximum)


def build_budget_preference_profile(
    *,
    visits: Iterable[dict[str, Any]],
    catalog: Mapping[str, dict[str, Any]],
) -> BudgetPreferenceProfile:
    """Build conservative, price-specific evidence from current explicit ratings."""

    affordable: list[float] = []
    higher_price: list[float] = []
    valid = True
    for place_id, visit in latest_rated_visits_by_place(visits).items():
        restaurant = catalog.get(place_id, {})
        try:
            maximum = _canonical_budget_maximum(restaurant)
        except (TypeError, ValueError, OverflowError):
            valid = False
            continue
        if maximum is None:
            continue
        rating = int(visit["rating"])
        observation = (rating - 3) / 2
        (affordable if maximum <= 3000 else higher_price).append(observation)

    known_count = len(affordable) + len(higher_price)
    affordable_affinity = _shrunk_affinity(affordable)
    higher_price_affinity = _shrunk_affinity(higher_price)
    confidence = round(
        max(
            0.0,
            min(
                (known_count - (MIN_PRICED_RESTAURANTS_FOR_RELAXATION - 1))
                / (
                    FULL_PRICE_CONFIDENCE_RESTAURANTS
                    - (MIN_PRICED_RESTAURANTS_FOR_RELAXATION - 1)
                ),
                1.0,
            ),
        ),
        6,
    )
    affordable_block = min(
        max(affordable_affinity, 0.0) / AFFORDABLE_PREFERENCE_BLOCKING_AFFINITY,
        1.0,
    )
    relaxation = round(
        confidence * max(higher_price_affinity, 0.0) * (1.0 - affordable_block),
        6,
    )
    if not valid or known_count < MIN_PRICED_RESTAURANTS_FOR_RELAXATION:
        confidence = 0.0
        relaxation = 0.0
    return BudgetPreferenceProfile(
        affordable_affinity=affordable_affinity,
        higher_price_affinity=higher_price_affinity,
        affordable_rated_count=len(affordable),
        higher_price_rated_count=len(higher_price),
        known_price_rated_count=known_count,
        confidence=confidence,
        affordability_relaxation_strength=relaxation,
        valid=valid,
    )


def build_user_taste_profile(
    *,
    visits: Iterable[dict[str, Any]],
    catalog: Mapping[str, dict[str, Any]],
) -> UserTasteProfile:
    """Build reusable per-facet affinity from explicit ratings only.

    Private notes are deliberately never read. Ratings are centred on neutral
    (3 stars), averaged by facet, and shrunk toward neutral for sparse evidence.
    """

    observations: dict[str, list[float]] = defaultdict(list)
    latest_ratings = latest_rated_visits_by_place(visits)
    for place_id, visit in latest_ratings.items():
        rating = int(visit["rating"])
        restaurant = catalog.get(place_id, {})
        for facet in restaurant_taste_facets(dict(restaurant)):
            observations[facet.key].append((rating - 3) / 2)

    affinities: dict[str, float] = {}
    for key, values in observations.items():
        # Two neutral pseudo-observations keep one rating from becoming certainty.
        affinities[key] = _shrunk_affinity(values)
    rated_count = len(latest_ratings)
    return UserTasteProfile(
        facet_affinities=affinities,
        confidence=round(min(rated_count / 10, 1.0), 6),
        rated_count=rated_count,
    )


def score_candidate_for_user(
    profile: UserTasteProfile, restaurant: Mapping[str, Any]
) -> float:
    """Return a confidence-bounded affinity in [-1, 1]."""

    facets = restaurant_taste_facets(dict(restaurant))
    values = [
        profile.facet_affinities[facet.key]
        for facet in facets
        if facet.key in profile.facet_affinities
    ]
    if not values:
        return 0.0
    return round((sum(values) / len(values)) * profile.confidence, 6)


def normalized_fiyu_quality(restaurant: Mapping[str, Any]) -> float:
    """Normalize the existing global Fiyu score without changing its calculation."""

    raw_quality = restaurant.get("fiyu_score")
    if isinstance(raw_quality, (int, float)) and not isinstance(raw_quality, bool):
        return max(0.0, min(float(raw_quality) / 100, 1.0))
    return 0.5


def blend_affinity_and_quality(affinity: float, quality: float) -> float:
    """Reuse Together's existing 70/30 personal-fit/global-quality blend."""

    return 0.7 * ((affinity + 1) / 2) + 0.3 * quality
