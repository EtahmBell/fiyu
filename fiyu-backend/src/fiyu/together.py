from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Mapping
from datetime import datetime
from typing import Any

from .daily_picks import (
    PICKS_RADII_KM,
    REPEAT_COOLDOWN,
    _admitted_at_radius,
    _known_affordable_budget,
)
from .taste_affinity import (
    UserTasteProfile,
    blend_affinity_and_quality,
    build_user_taste_profile,
    normalized_fiyu_quality,
    score_candidate_for_user,
)
from .user_fiyu_summary import restaurant_taste_facets

TOGETHER_PICK_COUNT = 3

__all__ = [
    "UserTasteProfile",
    "build_user_taste_profile",
    "combine_user_affinities",
    "score_candidate_for_user",
    "select_together_pick_plan",
]


def combine_user_affinities(affinity_a: float, affinity_b: float) -> float:
    """Balanced shared fit: the weaker fit matters more than the arithmetic mean.

    A 65/35 soft-min/mean blend rewards mutual agreement, tolerates neutrality,
    and strongly penalizes a candidate one participant actively dislikes.
    """

    return round(0.65 * min(affinity_a, affinity_b) + 0.35 * ((affinity_a + affinity_b) / 2), 6)


def _stable_tiebreak(seed: str, place_id: str) -> int:
    return int.from_bytes(hashlib.sha256(f"{seed}:{place_id}".encode()).digest()[:8], "big")


def _product_candidate_is_eligible(row: Mapping[str, Any]) -> bool:
    """Defensively enforce current product/map eligibility at selection time.

    Public-catalog callers already filter publication and product eligibility,
    but Together also requires a usable map location. Optional flag checks keep
    this helper compatible with the compact catalog rows used by unit tests.
    """

    if row.get("is_published") is False or row.get("product_eligible") is False:
        return False
    if row.get("map_display_eligible") is False:
        return False
    latitude = row.get("latitude")
    longitude = row.get("longitude")
    return (
        isinstance(latitude, (int, float))
        and not isinstance(latitude, bool)
        and math.isfinite(float(latitude))
        and isinstance(longitude, (int, float))
        and not isinstance(longitude, bool)
        and math.isfinite(float(longitude))
    )


def _score_row(
    row: dict[str, Any], profile_a: UserTasteProfile, profile_b: UserTasteProfile
) -> dict[str, Any]:
    affinity_a = score_candidate_for_user(profile_a, row)
    affinity_b = score_candidate_for_user(profile_b, row)
    shared_fit = combine_user_affinities(affinity_a, affinity_b)
    quality = normalized_fiyu_quality(row)
    # Personal evidence earns at most 70%; global quality and exploration remain.
    total = blend_affinity_and_quality(shared_fit, quality)
    return {**row, "_affinity_a": affinity_a, "_affinity_b": affinity_b, "_shared_fit": shared_fit, "_together_score": total}


def select_together_pick_plan(
    rows: Iterable[dict[str, Any]],
    *,
    profile_a: UserTasteProfile,
    profile_b: UserTasteProfile,
    discovery_latitude: float,
    discovery_longitude: float,
    active_area: str | None,
    hard_excluded_place_ids: set[str],
    recent_seen_a: Mapping[str, datetime],
    recent_seen_b: Mapping[str, datetime],
    now: datetime,
    seed: str,
    requested_count: int = TOGETHER_PICK_COUNT,
) -> tuple[tuple[str, ...], dict[str, object]]:
    """Select a deterministic shared set from already product-eligible catalog rows."""

    catalog = []
    for source in rows:
        row = dict(source)
        if not _product_candidate_is_eligible(row):
            continue
        if "budget_json" not in row and isinstance(row.get("budget"), dict):
            row["budget_json"] = json.dumps(row["budget"], sort_keys=True)
        if "discovery_areas_json" not in row and isinstance(row.get("discovery_areas"), list):
            row["discovery_areas_json"] = json.dumps(row["discovery_areas"], sort_keys=True)
        if str(row.get("place_id") or "") not in hard_excluded_place_ids:
            catalog.append(row)
    recent_ids = {
        place_id
        for history in (recent_seen_a, recent_seen_b)
        for place_id, seen_at in history.items()
        if now - seen_at < REPEAT_COOLDOWN
    }
    old_seen = (set(recent_seen_a) | set(recent_seen_b)) - recent_ids
    final_pool: list[dict[str, Any]] = []
    final_radius = PICKS_RADII_KM[-1]
    for radius in PICKS_RADII_KM:
        pool = [
            row for row in catalog
            if _admitted_at_radius(
                row,
                radius_km=radius,
                latitude=discovery_latitude,
                longitude=discovery_longitude,
                active_area=active_area,
            )
        ]
        unseen = [row for row in pool if str(row["place_id"]) not in recent_ids and str(row["place_id"]) not in old_seen]
        final_pool, final_radius = pool, radius
        if len(unseen) >= requested_count:
            break

    fresh = [row for row in final_pool if str(row["place_id"]) not in recent_ids and str(row["place_id"]) not in old_seen]
    fallback = [row for row in final_pool if str(row["place_id"]) in old_seen]
    candidates = [*fresh, *fallback]
    ranked = sorted(
        (_score_row(row, profile_a, profile_b) for row in candidates),
        key=lambda row: (-float(row["_together_score"]), _stable_tiebreak(seed, str(row["place_id"]))),
    )

    selected: list[dict[str, Any]] = []
    affordable = next((row for row in ranked if _known_affordable_budget(row)), None)
    if affordable is not None and requested_count == 3:
        selected.append(affordable)
    while len(selected) < requested_count:
        remaining = [row for row in ranked if row not in selected]
        if not remaining:
            break
        if selected:
            used_facets = {
                facet.key for row in selected for facet in restaurant_taste_facets(row)
            }
            diverse = [
                row for row in remaining
                if any(facet.key not in used_facets for facet in restaurant_taste_facets(row))
            ]
            selected.append((diverse or remaining)[0])
        else:
            selected.append(remaining[0])

    chosen = tuple(str(row["place_id"]) for row in selected)
    metadata: dict[str, object] = {
        "algorithm": "together-v1",
        "blend": "0.65*min + 0.35*mean; 70% shared affinity + 30% Fiyu quality",
        "final_radius_km": final_radius,
        "affordable_slot_applied": affordable in selected if affordable is not None else False,
        "candidate_count": len(candidates),
        "chosen_place_ids": list(chosen),
    }
    return chosen, metadata
