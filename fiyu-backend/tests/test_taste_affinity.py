from __future__ import annotations

from fiyu.taste_affinity import (
    build_budget_preference_profile,
    build_user_taste_profile,
)


def _restaurant(place_id: str, *, maximum: object = 8000) -> dict[str, object]:
    return {
        "place_id": place_id,
        "primary_category": "sushi",
        "budget": (
            None
            if maximum is None
            else {"maximum": maximum, "band": "budget" if maximum == 2000 else "upscale"}
        ),
        "practical_info": {},
        "review_themes": [],
    }


def _visit(place_id: str, rating: int, day: int) -> dict[str, object]:
    return {
        "id": f"{place_id}-{day}",
        "place_id": place_id,
        "rating": rating,
        "visited_at": f"2026-01-{day:02d}T12:00:00+00:00",
        "created_at": f"2026-01-{day:02d}T12:00:00+00:00",
        "private_note": "never model this",
    }


def test_recommendation_taste_uses_latest_rating_once_per_restaurant():
    catalog = {"same": _restaurant("same")}
    profile = build_user_taste_profile(
        visits=[_visit("same", 5, 1), _visit("same", 4, 2), _visit("same", 1, 3)],
        catalog=catalog,
    )

    assert profile.rated_count == 1
    assert profile.confidence == 0.1
    assert profile.facet_affinities["seafood"] == -0.333333


def test_editing_current_rating_updates_taste_without_reading_notes():
    catalog = {"same": _restaurant("same")}
    positive = build_user_taste_profile(
        visits=[_visit("same", 5, 1)],
        catalog=catalog,
    )
    edited = build_user_taste_profile(
        visits=[{**_visit("same", 1, 1), "private_note": "opposite words"}],
        catalog=catalog,
    )

    assert positive.facet_affinities["seafood"] == 0.333333
    assert edited.facet_affinities["seafood"] == -0.333333


def test_global_confidence_counts_distinct_rated_restaurants():
    repeated_catalog = {"same": _restaurant("same")}
    repeated = build_user_taste_profile(
        visits=[_visit("same", 5, day) for day in range(1, 11)],
        catalog=repeated_catalog,
    )
    distinct_catalog = {
        f"place-{index}": _restaurant(f"place-{index}") for index in range(10)
    }
    distinct = build_user_taste_profile(
        visits=[_visit(f"place-{index}", 5, index + 1) for index in range(10)],
        catalog=distinct_catalog,
    )

    assert repeated.rated_count == 1
    assert repeated.confidence == 0.1
    assert distinct.rated_count == 10
    assert distinct.confidence == 1.0


def test_budget_profile_has_price_specific_floor_and_continuous_confidence():
    catalog = {f"high-{index}": _restaurant(f"high-{index}") for index in range(10)}
    visits = [_visit(f"high-{index}", 5, index + 1) for index in range(10)]

    five = build_budget_preference_profile(visits=visits[:5], catalog=catalog)
    six = build_budget_preference_profile(visits=visits[:6], catalog=catalog)
    ten = build_budget_preference_profile(visits=visits, catalog=catalog)

    assert five.confidence == five.affordability_relaxation_strength == 0
    assert six.confidence == 0.2
    assert 0 < six.affordability_relaxation_strength < ten.affordability_relaxation_strength
    assert ten.confidence == 1
    assert ten.affordability_relaxation_strength == 0.833333


def test_budget_profile_counts_repeated_restaurant_once():
    catalog = {"same": _restaurant("same")}
    profile = build_budget_preference_profile(
        visits=[_visit("same", 5, day) for day in range(1, 11)],
        catalog=catalog,
    )

    assert profile.known_price_rated_count == 1
    assert profile.higher_price_rated_count == 1
    assert profile.confidence == 0
    assert profile.affordability_relaxation_strength == 0


def test_budget_profile_requires_expensive_preference_without_affordable_preference():
    catalog = {
        **{f"high-{index}": _restaurant(f"high-{index}") for index in range(5)},
        **{
            f"cheap-{index}": _restaurant(f"cheap-{index}", maximum=2000)
            for index in range(5)
        },
    }
    both = build_budget_preference_profile(
        visits=[
            *[_visit(f"high-{index}", 5, index + 1) for index in range(5)],
            *[_visit(f"cheap-{index}", 5, index + 6) for index in range(5)],
        ],
        catalog=catalog,
    )

    assert both.confidence == 1
    assert both.higher_price_affinity > 0
    assert both.affordable_affinity > 0
    assert both.affordability_relaxation_strength == 0


def test_budget_profile_is_fail_closed_for_malformed_budget():
    catalog = {f"high-{index}": _restaurant(f"high-{index}") for index in range(6)}
    catalog["high-5"] = _restaurant("high-5", maximum=float("nan"))
    profile = build_budget_preference_profile(
        visits=[_visit(f"high-{index}", 5, index + 1) for index in range(6)],
        catalog=catalog,
    )

    assert profile.valid is False
    assert profile.confidence == 0
    assert profile.affordability_relaxation_strength == 0
