from fiyu.experimental_quality_research_v4 import (
    QualityObservation,
    QualityResearchResult,
    calculate_quality_adjustment,
)


def observation(**overrides: object) -> QualityObservation:
    values: dict[str, object] = {
        "aspect": "cooking_execution",
        "polarity": "positive",
        "strength": "moderate",
        "claim_key": "charcoal-grilling",
        "claim": "The yakitori shows careful charcoal grilling and precise doneness.",
        "source_url": "https://example.jp/review/1",
        "source_type": "local_food_blog",
        "independent_source_key": "example.jp",
        "food_specific": True,
        "directness": "direct",
    }
    values.update(overrides)
    return QualityObservation.model_validate(values)


def test_no_evidence_is_exactly_neutral() -> None:
    result = calculate_quality_adjustment([])
    assert result.adjustment == 0
    assert result.confidence_score == 0
    assert result.confidence_band == "none"


def test_non_food_observations_never_move_quality() -> None:
    result = calculate_quality_adjustment(
        [observation(food_specific=False, claim="The room has a lively neighborhood atmosphere.")]
    )
    assert result.adjustment == 0
    assert result.excluded_observation_count == 1


def test_absence_of_negative_evidence_is_not_a_negative_observation() -> None:
    result = calculate_quality_adjustment(
        [
            observation(
                aspect="quality_concern",
                polarity="negative",
                claim="No corroborated negative food-quality concern was identified.",
            )
        ]
    )
    assert result.adjustment == 0
    assert result.excluded_observation_count == 1


def test_duplicate_source_does_not_stack_and_independent_corroboration_does() -> None:
    first = observation()
    duplicate = observation(source_url="https://example.jp/review/2", strength="strong")
    independent = observation(
        source_url="https://localfood.jp/story",
        independent_source_key="localfood.jp",
        source_type="editorial_publication",
    )
    one_source = calculate_quality_adjustment([first, duplicate])
    two_sources = calculate_quality_adjustment([first, independent])
    assert one_source.independent_source_count == 1
    assert two_sources.independent_source_count == 2
    assert two_sources.adjustment > one_source.adjustment
    assert two_sources.corroborated_claim_count == 1


def test_positive_and_negative_evidence_are_symmetric_and_bounded() -> None:
    positive = [
        observation(claim_key=f"positive-{index}", strength="strong") for index in range(20)
    ]
    negative = [
        observation(
            aspect="quality_concern",
            polarity="negative",
            claim_key=f"negative-{index}",
            claim="Multiple diners describe recurring preparation and freshness problems.",
            strength="strong",
        )
        for index in range(20)
    ]
    assert calculate_quality_adjustment(positive).adjustment == 2.0
    assert calculate_quality_adjustment(negative).adjustment == -2.5
    combined = (
        positive
        + negative
        + [
            observation(
                aspect="inconsistency",
                polarity="negative",
                claim_key=f"inconsistent-{index}",
                claim="Food execution varies materially between otherwise similar visits.",
                strength="strong",
            )
            for index in range(20)
        ]
    )
    assert -5 <= calculate_quality_adjustment(combined).adjustment <= 5


def test_official_only_claim_cannot_establish_excellence() -> None:
    result = calculate_quality_adjustment(
        [
            observation(
                aspect="specialist_craft",
                source_type="official_restaurant",
                independent_source_key="restaurant.example",
                strength="strong",
            )
        ]
    )
    assert result.adjustment <= 0.5


def test_result_schema_forbids_observations_at_none_level() -> None:
    try:
        QualityResearchResult(
            evidence_level="none",
            observations=[observation()],
            research_summary="No usable evidence was found.",
        )
    except ValueError as exc:
        assert "none requires no observations" in str(exc)
    else:
        raise AssertionError("invalid none result was accepted")
