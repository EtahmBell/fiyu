from fiyu.experimental_quality_case_strength_v4 import (
    adjustment_from_balance,
    calculate_quality_case_strength,
    normalize_aspect,
)
from fiyu.experimental_quality_challenge_v4 import ChallengeObservation


def observation(**overrides: object) -> ChallengeObservation:
    values: dict[str, object] = {
        "evidence_family": "craft_execution",
        "aspect": "broth_sauce",
        "polarity": "positive",
        "strength": "strong",
        "claim": "The ramen broth has deep stock flavor, balanced seasoning, and a clean finish.",
        "food_specific": True,
        "directness": "direct",
        "source_url": "https://example.jp/review/1",
        "source_type": "local_food_blog",
        "source_language": "Japanese",
        "publication_or_observation_date": "2025-01",
        "normalized_author_or_document_identity": "writer-one",
        "provenance_group": "independent-blog",
        "underlying_claim_identity": "arbitrary-model-key",
        "independent_source_key": "example-writer-one",
    }
    values.update(overrides)
    return ChallengeObservation.model_validate(values)


def test_no_evidence_is_exactly_neutral() -> None:
    result = calculate_quality_case_strength([])
    assert result.positive_quality_case_strength == 0
    assert result.negative_quality_case_strength == 0
    assert result.researched_quality_evidence_balance == 0
    assert result.quality_adjustment == 0


def test_different_free_form_claim_ids_consolidate_on_normalized_aspect() -> None:
    observations = [
        observation(
            polarity="negative",
            underlying_claim_identity="thin-stock",
            claim="The ramen broth tasted thin, with little stock depth or umami.",
        ),
        observation(
            polarity="negative",
            aspect="seasoning_balance",
            underlying_claim_identity="weak-miso-aroma",
            claim="The miso soup was thin and had limited miso aroma and umami.",
            source_url="https://second.example/review",
            normalized_author_or_document_identity="writer-two",
            provenance_group="independent-platform-review",
            independent_source_key="second-writer-two",
        ),
        observation(
            polarity="negative",
            underlying_claim_identity="sweet-low-umami-noodles",
            claim="A third source found the noodle broth sweet and weak in umami.",
            source_url="https://third.example/post",
            normalized_author_or_document_identity="writer-three",
            provenance_group="independent-blog-two",
            independent_source_key="third-writer-three",
        ),
    ]
    assert {normalize_aspect(item) for item in observations} == {"broth_quality"}
    result = calculate_quality_case_strength(observations)
    assert result.corroborated_negative_claim_count == 1
    assert result.negative_quality_case_strength >= 25
    assert result.quality_adjustment < 0


def test_one_negative_source_is_near_zero_and_does_not_lower_quality() -> None:
    result = calculate_quality_case_strength(
        [observation(polarity="negative", claim="The ramen broth tasted thin and bland.")]
    )
    assert result.negative_quality_case_strength < 5
    assert result.quality_adjustment == 0


def test_positive_activation_is_milder_than_negative_activation() -> None:
    positive = calculate_quality_case_strength([observation()])
    negative = calculate_quality_case_strength([observation(polarity="negative")])
    assert positive.positive_quality_case_strength > negative.negative_quality_case_strength
    assert positive.quality_adjustment >= 0
    assert negative.quality_adjustment == 0


def test_copied_or_synthetic_sources_do_not_stack() -> None:
    synthetic = observation(
        normalized_author_or_document_identity="cross-source-synthesis",
        independent_source_key="cross_source_summary",
    )
    result = calculate_quality_case_strength([synthetic])
    assert result.qualifying_observation_count == 0
    assert result.quality_adjustment == 0


def test_nonlinear_mapping_reaches_material_but_bounded_adjustments() -> None:
    assert adjustment_from_balance(0) == 0
    assert adjustment_from_balance(20) == 2
    assert adjustment_from_balance(50) == 7
    assert adjustment_from_balance(80) == 14
    assert adjustment_from_balance(-100) == -20
    assert adjustment_from_balance(100, hard_cap=15) == 15


def test_strong_multi_family_cases_can_materially_revise_the_prior() -> None:
    positive = []
    negative = []
    configurations = (
        ("craft_execution", "broth_sauce"),
        ("ingredient_product_quality", "ingredient_freshness"),
        ("food_reputation_specialization", "signature_dish_reputation"),
        ("consistency", "reliable_execution"),
    )
    for family_index, (family, aspect) in enumerate(configurations):
        for source_index in range(3):
            shared = {
                "evidence_family": family,
                "aspect": aspect,
                "claim": (
                    "A detailed source identifies specific broth, texture, freshness, "
                    "and execution evidence for the food itself."
                ),
                "source_url": f"https://source-{family_index}-{source_index}.example/review",
                "normalized_author_or_document_identity": (
                    f"writer-{family_index}-{source_index}"
                ),
                "provenance_group": f"publisher-{family_index}-{source_index}",
                "independent_source_key": f"source-{family_index}-{source_index}",
            }
            positive.append(observation(**shared))
            negative.append(observation(**shared, polarity="negative"))
    positive_result = calculate_quality_case_strength(positive)
    negative_result = calculate_quality_case_strength(negative)
    assert positive_result.quality_adjustment >= 10
    assert negative_result.quality_adjustment <= -10
    assert abs(positive_result.quality_adjustment) <= 20
    assert abs(negative_result.quality_adjustment) <= 20
