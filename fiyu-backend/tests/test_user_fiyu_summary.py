from datetime import UTC, datetime, timedelta

from fiyu.user_fiyu_summary import build_taste_snapshot, build_user_fiyu_summary


def _visit(place_id: str, rating: int | None, index: int = 0, note: str = "private"):
    timestamp = (datetime(2026, 8, 1, tzinfo=UTC) + timedelta(days=index)).isoformat()
    return {
        "id": f"visit-{place_id}-{index}",
        "place_id": place_id,
        "visited_at": timestamp,
        "created_at": timestamp,
        "rating": rating,
        "private_note": note,
    }


def _restaurant(
    *, counter: bool | None = None, small: bool | None = None, category: str = "Japanese"
):
    return {
        "primary_category": category,
        "practical_info": {
            "seating": {
                "counter": counter,
                "small_capacity": small,
                "tables": None,
                "private_rooms": None,
            }
        },
        "review_themes": [],
    }


def test_new_user_has_separate_thresholds_and_no_fake_insights():
    summary = build_user_fiyu_summary(visits=[], saved_place_ids=[], catalog={})

    assert summary["rated_visit_count"] == 0
    assert summary["together_unlock_threshold"] == 5
    assert summary["together_unlocked"] is False
    assert summary["taste_unlock_threshold"] == 10
    assert summary["taste_unlocked"] is False
    assert summary["taste_insights"] == []
    assert summary["taste_tags"] == []
    assert summary["taste_next_milestone"] == 10


def test_nine_ratings_stay_locked_and_ten_unlock_first_snapshot():
    catalog = {f"p-{index}": _restaurant(counter=index < 3) for index in range(10)}
    nine = build_user_fiyu_summary(
        visits=[_visit(f"p-{index}", 4, index) for index in range(9)],
        saved_place_ids=[],
        catalog=catalog,
    )
    ten = build_user_fiyu_summary(
        visits=[_visit(f"p-{index}", 4, index) for index in range(10)],
        saved_place_ids=[],
        catalog=catalog,
    )

    assert nine["together_unlocked"] is True
    assert nine["taste_unlocked"] is False
    assert nine["ratings_until_next_taste_update"] == 1
    assert ten["taste_unlocked"] is True
    assert ten["taste_current_milestone"] == 10
    assert ten["taste_next_milestone"] == 15
    assert ten["ratings_until_next_taste_update"] == 5


def test_one_five_star_occurrence_is_not_a_supported_insight():
    visits = [_visit(f"p-{index}", 5 if index == 0 else 3, index) for index in range(10)]
    catalog = {f"p-{index}": _restaurant(counter=index == 0) for index in range(10)}

    summary = build_user_fiyu_summary(visits=visits, saved_place_ids=[], catalog=catalog)

    assert all(item["facet_key"] != "counter_seating" for item in summary["taste_insights"])


def test_repeated_high_ratings_create_baseline_aware_positive_insight_and_tags():
    ratings = [5, 5, 5, 3, 3, 3, 3, 3, 3, 3]
    visits = [_visit(f"p-{index}", rating, index) for index, rating in enumerate(ratings)]
    catalog = {
        f"p-{index}": _restaurant(counter=index < 3, small=index < 3)
        for index in range(10)
    }

    summary = build_user_fiyu_summary(visits=visits, saved_place_ids=[], catalog=catalog)
    counter = next(item for item in summary["taste_insights"] if item["facet_key"] == "counter_seating")

    assert counter["type"] == "strong_signal"
    assert counter["support_count"] == 3
    assert counter["average_rating"] == 5
    assert counter["delta_from_user_average"] > 1
    assert {tag["key"] for tag in summary["taste_tags"]} >= {"counter_seating"}


def test_repeated_low_ratings_are_negative_evidence_while_three_is_neutral():
    ratings = [1, 2, 2, 4, 4, 4, 4, 4, 3, 3]
    visits = [_visit(f"p-{index}", rating, index) for index, rating in enumerate(ratings)]
    catalog = {f"p-{index}": _restaurant(small=index < 3) for index in range(10)}

    summary = build_user_fiyu_summary(visits=visits, saved_place_ids=[], catalog=catalog)
    small = next(item for item in summary["taste_insights"] if item["facet_key"] == "small_capacity")

    assert small["type"] == "contrast"
    assert small["average_rating"] < 3
    assert small["delta_from_user_average"] < 0


def test_unknown_budget_is_ignored_and_private_notes_never_change_taste():
    visits_a = [_visit(f"p-{index}", 4, index, note="counter seasonal") for index in range(10)]
    visits_b = [{**visit, "private_note": "private rooms tasting menus"} for visit in visits_a]
    catalog = {f"p-{index}": {**_restaurant(), "budget": None} for index in range(10)}

    first = build_user_fiyu_summary(visits=visits_a, saved_place_ids=[], catalog=catalog)
    second = build_user_fiyu_summary(visits=visits_b, saved_place_ids=[], catalog=catalog)

    assert first["taste_insights"] == second["taste_insights"] == []
    assert first["taste_tags"] == second["taste_tags"] == []


def test_milestones_remain_stable_between_refreshes_and_compare_at_fifteen():
    visits = [_visit(f"p-{index}", 5 if index < 4 else 3, index) for index in range(15)]
    catalog = {f"p-{index}": _restaurant(counter=index < 4) for index in range(15)}
    fourteen = build_user_fiyu_summary(
        visits=visits[:14], saved_place_ids=[], catalog=catalog
    )
    fifteen = build_user_fiyu_summary(visits=visits, saved_place_ids=[], catalog=catalog)

    assert fourteen["taste_current_milestone"] == 10
    assert fourteen["ratings_until_next_taste_update"] == 1
    assert fifteen["taste_current_milestone"] == 15
    assert fifteen["taste_previous_milestone"] == 10
    assert fifteen["ratings_until_next_taste_update"] == 5
    counter = next(item for item in fifteen["taste_insights"] if item["facet_key"] == "counter_seating")
    assert counter["change_status"] in {"still_true", "stronger"}


def test_new_facet_at_fifteen_is_labelled_new():
    visits = [_visit(f"p-{index}", 5 if index >= 10 else 3, index) for index in range(15)]
    catalog = {f"p-{index}": _restaurant(counter=index >= 10) for index in range(15)}
    previous = build_taste_snapshot(visits=visits, catalog=catalog, milestone=10)
    current = build_taste_snapshot(
        visits=visits, catalog=catalog, milestone=15, previous_snapshot=previous
    )

    counter = next(item for item in current["insights"] if item["facet_key"] == "counter_seating")
    assert counter["change_status"] == "new"


def test_twenty_rating_snapshot_compares_with_fifteen():
    visits = [_visit(f"p-{index}", 5 if index < 4 else 3, index) for index in range(20)]
    catalog = {f"p-{index}": _restaurant(counter=index < 4) for index in range(20)}

    summary = build_user_fiyu_summary(visits=visits, saved_place_ids=[], catalog=catalog)

    assert summary["taste_current_milestone"] == 20
    assert summary["taste_previous_milestone"] == 15
    assert summary["taste_next_milestone"] == 25


def test_later_low_ratings_do_not_keep_a_former_positive_pattern_strong():
    visits = [_visit(f"p-{index}", 5 if index < 3 else 3, index) for index in range(10)]
    visits.extend(_visit(f"p-{index}", 1, 10 + index) for index in range(3))
    visits.extend(_visit(f"new-{index}", 4, 13 + index) for index in range(2))
    catalog = {
        **{f"p-{index}": _restaurant(counter=index < 3) for index in range(10)},
        **{f"new-{index}": _restaurant() for index in range(2)},
    }

    summary = build_user_fiyu_summary(visits=visits, saved_place_ids=[], catalog=catalog)
    counter = next(item for item in summary["taste_insights"] if item["facet_key"] == "counter_seating")

    assert counter["type"] == "contrast"


def test_legacy_reactions_without_stars_do_not_count():
    visits = [
        {**_visit(f"legacy-{index}", None, index), "reaction": "love_it"}
        for index in range(12)
    ]
    summary = build_user_fiyu_summary(visits=visits, saved_place_ids=[], catalog={})
    assert summary["rated_visit_count"] == 0
    assert summary["taste_unlocked"] is False
