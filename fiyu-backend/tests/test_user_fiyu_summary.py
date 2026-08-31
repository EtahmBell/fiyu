from fiyu.user_fiyu_summary import build_user_fiyu_summary


def _visit(place_id: str, rating: int | None, index: int = 0) -> dict[str, object]:
    return {
        "id": f"visit-{place_id}-{index}",
        "place_id": place_id,
        "visited_at": f"2026-08-{20 - index:02d}T12:00:00+00:00",
        "rating": rating,
        "private_note": "A private note that stays out of taste analytics.",
    }


def test_new_user_has_real_zero_counts_and_no_fake_insights():
    summary = build_user_fiyu_summary(visits=[], saved_place_ids=[], catalog={})

    assert summary["visited_count"] == 0
    assert summary["saved_count"] == 0
    assert summary["area_count"] == 0
    assert summary["rated_visit_count"] == 0
    assert summary["taste_unlocked"] is False
    assert summary["top_cuisines"] == []
    assert summary["usual_budget"] is None


def test_four_rated_visits_remain_locked_and_five_unlock():
    catalog = {
        f"place-{index}": {"primary_category": "Sushi", "area_label": "Ginza"}
        for index in range(5)
    }
    four = build_user_fiyu_summary(
        visits=[_visit(f"place-{index}", 5, index) for index in range(4)],
        saved_place_ids=[],
        catalog=catalog,
    )
    five = build_user_fiyu_summary(
        visits=[_visit(f"place-{index}", 5, index) for index in range(5)],
        saved_place_ids=[],
        catalog=catalog,
    )

    assert four["rated_visit_count"] == 4
    assert four["taste_unlocked"] is False
    assert five["rated_visit_count"] == 5
    assert five["taste_unlocked"] is True


def test_taste_uses_positive_repeated_ratings_and_not_low_ratings():
    visits = [
        _visit("sushi-a", 5),
        _visit("sushi-b", 4, 1),
        _visit("ramen-a", 1, 2),
        _visit("ramen-b", 2, 3),
        _visit("french-a", 5, 4),
    ]
    catalog = {
        "sushi-a": {"primary_category": "Sushi", "area_label": "Ginza"},
        "sushi-b": {"primary_category": "Sushi", "area_label": "Ginza"},
        "ramen-a": {"primary_category": "Ramen", "area_label": "Ueno"},
        "ramen-b": {"primary_category": "Ramen", "area_label": "Ueno"},
        "french-a": {"primary_category": "French", "area_label": "Shibuya"},
    }

    summary = build_user_fiyu_summary(
        visits=visits, saved_place_ids=["saved-only"], catalog=catalog
    )

    assert summary["top_cuisines"] == ["Sushi"]
    assert "Ramen" not in summary["top_cuisines"]
    assert "French" not in summary["top_cuisines"]
    assert summary["visited_count"] == 5
    assert summary["saved_count"] == 1


def test_unknown_budget_is_ignored_and_canonical_bands_choose_the_median_range():
    visits = [_visit(f"place-{index}", 4, index) for index in range(5)]
    catalog = {
        "place-0": {"budget": None},
        "place-1": {"budget": {"band": "moderate"}},
        "place-2": {"budget": {"band": "moderate"}},
        "place-3": {"budget": {"band": "upscale"}},
        "place-4": {"budget": {"band": "splurge"}},
    }

    summary = build_user_fiyu_summary(
        visits=visits, saved_place_ids=[], catalog=catalog
    )

    assert summary["usual_budget"] == "¥3,000–¥5,000"


def test_area_count_uses_canonical_labels_and_recent_notes_are_private_excerpts():
    visits = [
        _visit("one", 5),
        _visit("two", 4, 1),
        _visit("three", 3, 2),
        _visit("four", 4, 3),
        _visit("five", 5, 4),
    ]
    visits[0]["private_note"] = "x" * 140
    catalog = {
        "one": {"area_label": "Ueno", "name_en": "One"},
        "two": {"area_label": "Ueno", "name_en": "Two"},
        "three": {"area_label": "Ginza", "name_en": "Three"},
        "four": {"area_label": "Ginza", "name_en": "Four"},
        "five": {"area_label": "Unknown neighborhood", "name_en": "Five"},
    }

    summary = build_user_fiyu_summary(
        visits=visits, saved_place_ids=[], catalog=catalog
    )

    assert summary["area_count"] == 2
    assert summary["top_areas"] == ["Ueno", "Ginza"]
    assert len(summary["recent_visits"]) == 3
    assert summary["recent_visits"][0]["private_note_excerpt"].endswith("…")
    assert "private_note" not in summary["top_cuisines"]
