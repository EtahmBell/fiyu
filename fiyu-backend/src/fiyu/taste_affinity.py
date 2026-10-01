from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from .user_fiyu_summary import restaurant_taste_facets


@dataclass(frozen=True)
class UserTasteProfile:
    """Private, deterministic affinities. This object is never returned by the API."""

    facet_affinities: Mapping[str, float]
    confidence: float
    rated_count: int


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
    rated_count = 0
    for visit in visits:
        rating = visit.get("rating")
        if not isinstance(rating, int) or isinstance(rating, bool) or not 1 <= rating <= 5:
            continue
        rated_count += 1
        restaurant = catalog.get(str(visit.get("place_id") or ""), {})
        for facet in restaurant_taste_facets(dict(restaurant)):
            observations[facet.key].append((rating - 3) / 2)

    affinities: dict[str, float] = {}
    for key, values in observations.items():
        mean = sum(values) / len(values)
        # Two neutral pseudo-observations keep one rating from becoming certainty.
        affinities[key] = round(mean * (len(values) / (len(values) + 2)), 6)
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
