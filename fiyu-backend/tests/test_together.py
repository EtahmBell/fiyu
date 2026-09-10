from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fiyu.together import (
    UserTasteProfile,
    build_user_taste_profile,
    combine_user_affinities,
    score_candidate_for_user,
    select_together_pick_plan,
)


def restaurant(place_id: str, category: str, *, score: float = 80, budget: int = 5000):
    return {
        "place_id": place_id,
        "primary_category": category,
        "fiyu_score": score,
        "latitude": 35.66,
        "longitude": 139.70,
        "is_published": True,
        "product_eligible": True,
        "map_display_eligible": True,
        "location_precision": "exact",
        "discovery_area": "Shibuya",
        "discovery_areas": [],
        "budget": {"maximum": budget, "band": "budget" if budget <= 3000 else "upscale"},
        "practical_info": {},
        "review_themes": [],
        "cuisine_terms_en": [],
    }


def visit(place_id: str, rating: int, note: str = "private"):
    return {"place_id": place_id, "rating": rating, "private_note": note}


def test_taste_profile_uses_ratings_and_never_private_notes():
    catalog = {"sushi": restaurant("sushi", "sushi")}
    first = build_user_taste_profile(visits=[visit("sushi", 5, "love counter")], catalog=catalog)
    second = build_user_taste_profile(visits=[visit("sushi", 5, "hate counter")], catalog=catalog)
    assert first == second
    assert first.rated_count == 1
    assert score_candidate_for_user(first, restaurant("other", "sushi")) > 0


def test_shared_fit_rewards_agreement_and_penalizes_disagreement():
    mutual = combine_user_affinities(0.8, 0.8)
    neutral = combine_user_affinities(0.8, 0.0)
    disagreement = combine_user_affinities(0.8, -0.8)
    assert mutual > neutral > disagreement


def test_sparse_user_is_neutral_and_does_not_block_selection():
    rows = [restaurant(str(index), "sushi", score=80 + index) for index in range(4)]
    picks, _ = select_together_pick_plan(
        rows,
        profile_a=UserTasteProfile({"seafood": 0.8}, 1, 10),
        profile_b=UserTasteProfile({}, 0, 0),
        discovery_latitude=35.66,
        discovery_longitude=139.70,
        active_area="Shibuya",
        hard_excluded_place_ids=set(),
        recent_seen_a={},
        recent_seen_b={},
        now=datetime(2026, 9, 9, tzinfo=UTC),
        seed="session",
    )
    assert len(picks) == 3


def test_selection_is_deterministic_excludes_history_and_preserves_affordable_slot():
    now = datetime(2026, 9, 9, tzinfo=UTC)
    rows = [
        restaurant("visited", "sushi"),
        restaurant("active", "ramen"),
        restaurant("recent", "izakaya"),
        restaurant("affordable", "tempura", budget=2500),
        restaurant("one", "sushi", score=88),
        restaurant("two", "ramen", score=87),
        restaurant("three", "yakitori", score=86),
    ]
    args = {
        "profile_a": UserTasteProfile({}, 0, 0),
        "profile_b": UserTasteProfile({}, 0, 0),
        "discovery_latitude": 35.66,
        "discovery_longitude": 139.70,
        "active_area": "Shibuya",
        "hard_excluded_place_ids": {"visited", "active"},
        "recent_seen_a": {"recent": now - timedelta(days=1)},
        "recent_seen_b": {},
        "now": now,
        "seed": "fixed-session",
    }
    first, metadata = select_together_pick_plan(rows, **args)
    second, _ = select_together_pick_plan(rows, **args)
    assert first == second
    assert "visited" not in first and "active" not in first and "recent" not in first
    assert "affordable" in first
    assert metadata["affordable_slot_applied"] is True


def test_old_seen_is_only_used_as_fallback_and_partial_is_safe():
    now = datetime(2026, 9, 9, tzinfo=UTC)
    rows = [restaurant("fresh", "sushi"), restaurant("old", "ramen")]
    picks, _ = select_together_pick_plan(
        rows,
        profile_a=UserTasteProfile({}, 0, 0),
        profile_b=UserTasteProfile({}, 0, 0),
        discovery_latitude=35.66,
        discovery_longitude=139.70,
        active_area="Shibuya",
        hard_excluded_place_ids=set(),
        recent_seen_a={"old": now - timedelta(days=8)},
        recent_seen_b={},
        now=now,
        seed="partial",
    )
    assert set(picks) == {"fresh", "old"}


def test_selection_never_admits_currently_ineligible_catalog_rows():
    now = datetime(2026, 9, 9, tzinfo=UTC)
    eligible = [restaurant(str(index), "sushi") for index in range(3)]
    excluded = [
        {**restaurant("unpublished", "sushi"), "is_published": False},
        {**restaurant("product-blocked", "sushi"), "product_eligible": False},
        {**restaurant("map-blocked", "sushi"), "map_display_eligible": False},
        {**restaurant("missing-location", "sushi"), "latitude": None},
    ]
    picks, _ = select_together_pick_plan(
        [*excluded, *eligible],
        profile_a=UserTasteProfile({}, 0, 0),
        profile_b=UserTasteProfile({}, 0, 0),
        discovery_latitude=35.66,
        discovery_longitude=139.70,
        active_area="Shibuya",
        hard_excluded_place_ids=set(),
        recent_seen_a={},
        recent_seen_b={},
        now=now,
        seed="eligibility",
    )
    assert set(picks) == {"0", "1", "2"}
