from fiyu.experimental_score_v4 import (
    assess_researched_quality,
    calculate_neutral_components,
    experimental_score,
    source_family,
)


def _theme(text: str, *urls: str, confidence: float = 0.9):
    return {
        "theme": text,
        "sentiment": "positive",
        "supporting_source_count": len(urls),
        "confidence": confidence,
        "source_urls": list(urls),
    }


def test_quality_adjustment_requires_food_specific_independent_corroboration():
    result = assess_researched_quality(
        [
            _theme(
                "Carefully prepared yakitori with precise charcoal grilling",
                "https://tabelog.com/a",
                "https://example.jp/review",
            ),
            _theme(
                "Friendly service in an intimate room",
                "https://blog.example/a",
                "https://news.example/b",
            ),
        ]
    )

    assert result.raw_adjustment == 3.5
    assert len(result.positive_evidence) == 2
    assert not result.negative_evidence


def test_same_platform_pages_do_not_count_as_independent_sources():
    result = assess_researched_quality(
        [
            _theme(
                "A standout ramen dish with carefully developed broth",
                "https://tabelog.com/restaurant",
                "https://tabelog.com/restaurant/reviews",
            )
        ]
    )

    assert result.raw_adjustment == 0
    assert "no_independently_corroborated_food_quality_theme" in result.unknown_fields


def test_unknown_is_zero_adjustment_and_caps_are_bounded():
    unknown = assess_researched_quality([])
    assert unknown.raw_adjustment == 0
    assert unknown.capped_adjustment(5) == 0

    strong = assess_researched_quality(
        [
            _theme(
                "Award-winning signature ramen with exceptional handmade noodles and consistent quality",
                "https://one.example/review",
                "https://two.example/article",
            ),
            _theme(
                "Carefully prepared ramen praised for fresh ingredients",
                "https://three.example/review",
                "https://four.example/article",
            ),
        ]
    )
    assert strong.raw_adjustment == 10
    assert strong.capped_adjustment(5) == 5
    assert strong.capped_adjustment(8) == 8
    assert strong.capped_adjustment(10) == 10


def test_neutral_components_omit_unknown_chain_and_false_specialist_defaults():
    evidence = {
        "tourist_coverage": "unknown",
        "reservation_platform_count": 0,
        "official_website_found": False,
        "social_profile_count": 0,
        "known_location_count": 1,
        "specialist_restaurant": False,
        "japanese_source_count": 2,
        "english_tourist_source_count": 1,
        "japanese_review_share": None,
        "local_audience": "unknown",
        "tourist_orientation": "unknown",
        "tourist_signals": [],
        "international_visibility": "unknown",
        "corporate_visibility": "unknown",
    }

    result = calculate_neutral_components(
        evidence=evidence,
        underexposure_score=70,
        digital_footprint_score=55,
        chain_classification="unknown",
    )

    assert result.independence == 100
    assert "chain_classification" in result.unknown_fields
    assert "specialist_restaurant" in result.unknown_fields
    assert 0 <= result.hiddenness <= 100
    assert 0 <= result.local_discovery <= 100


def test_experimental_weights_are_deterministic_and_validated():
    assert (
        experimental_score(
            quality=80,
            hiddenness=70,
            independence=90,
            local_discovery=75,
        )
        == 78.75
    )
    assert source_family("https://selection.tabelog.com/path") == "tabelog.com"
