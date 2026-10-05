from fiyu.experimental_quality_challenge_v4 import (
    ChallengeObservation,
    calculate_policy_adjustments,
)


def observation(**overrides: object) -> ChallengeObservation:
    values: dict[str, object] = {
        "evidence_family": "craft_execution",
        "aspect": "technique",
        "polarity": "positive",
        "strength": "moderate",
        "claim": "The broth shows careful temperature control and balanced seasoning.",
        "food_specific": True,
        "directness": "direct",
        "source_url": "https://example.jp/review/1",
        "source_type": "local_food_blog",
        "source_language": "Japanese",
        "publication_or_observation_date": "2026-01",
        "normalized_author_or_document_identity": "writer-one",
        "provenance_group": "example-original",
        "underlying_claim_identity": "balanced-broth",
        "independent_source_key": "example.jp:writer-one",
    }
    values.update(overrides)
    return ChallengeObservation.model_validate(values)


def test_no_evidence_is_zero_under_every_policy() -> None:
    result = calculate_policy_adjustments([])
    assert {item.adjustment for item in result.policies.values()} == {0}


def test_absence_statement_and_non_food_claim_are_excluded() -> None:
    result = calculate_policy_adjustments(
        [
            observation(
                polarity="negative",
                claim="No corroborated concerns or complaints were identified.",
            ),
            observation(food_specific=False, claim="The room is attractive and popular."),
        ]
    )
    assert result.excluded_observations == 2
    assert {item.adjustment for item in result.policies.values()} == {0}


def test_one_isolated_negative_review_cannot_lower_quality() -> None:
    result = calculate_policy_adjustments(
        [
            observation(
                polarity="negative",
                strength="strong",
                claim="One diner reported that the fish was overcooked.",
            )
        ]
    )
    assert {item.adjustment for item in result.policies.values()} == {0}


def test_independent_negative_corroboration_lowers_quality() -> None:
    first = observation(
        polarity="negative",
        strength="strong",
        claim="The fish was repeatedly reported as overcooked and dry.",
        underlying_claim_identity="overcooked-fish",
    )
    second = observation(
        polarity="negative",
        strength="strong",
        claim="A second report describes the same fish as overcooked and dry.",
        source_url="https://another.jp/story",
        normalized_author_or_document_identity="writer-two",
        provenance_group="another-original",
        independent_source_key="another.jp:writer-two",
        underlying_claim_identity="overcooked-fish",
    )
    result = calculate_policy_adjustments([first, second])
    assert all(item.adjustment < 0 for item in result.policies.values())


def test_broader_policies_require_evidence_unlocks_not_simple_multiplication() -> None:
    observations = []
    for family in (
        "craft_execution",
        "ingredient_product_quality",
        "food_reputation_specialization",
    ):
        for index in range(2):
            observations.append(
                observation(
                    evidence_family=family,
                    strength="strong",
                    source_url=f"https://source{family}{index}.jp/item",
                    normalized_author_or_document_identity=f"writer-{family}-{index}",
                    provenance_group=f"group-{family}-{index}",
                    independent_source_key=f"source-{family}-{index}",
                    underlying_claim_identity=f"claim-{family}",
                )
            )
    result = calculate_policy_adjustments(observations)
    values = [result.policies[name].adjustment for name in result.policies]
    assert values == sorted(values)
    assert values[1] != values[0] * 2
    assert result.policies["policy_d_20"].positive_tier == "exceptional"
