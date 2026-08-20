from dataclasses import replace

import pytest

from fiyu.local_discovery import (
    LOCAL_DISCOVERY_WEIGHTS,
    LocalDiscoveryInputs,
    ProductEligibility,
    assess_low_footprint_eligibility,
    assess_product_eligibility,
    calculate_local_discovery,
)
from fiyu.public_score import (
    FIYU_SCORE_WEIGHTS,
    HIDDENNESS_WEIGHTS,
    FiyuEvidence,
    InternalSignals,
    evaluate_fiyu_candidate,
)


def _inputs(**overrides):
    values = {
        "underexposure_score": 90.0,
        "digital_footprint_score": 95.0,
        "japanese_source_count": 3,
        "english_tourist_source_count": 0,
        "japanese_review_share": 0.9,
        "tourist_coverage": "low",
        "reservation_platform_count": 0,
        "official_website_found": False,
        "social_profile_count": 0,
        "chain_classification": "independent_single",
        "specialist_restaurant": True,
        "local_audience": "high",
        "international_visibility": "low",
        "corporate_visibility": "low",
    }
    values.update(overrides)
    return LocalDiscoveryInputs(**values)


def _evidence(**overrides):
    values = {
        "matched_restaurant": True,
        "identity_confidence": 0.95,
        "official_language": "ja",
        "japanese_source_count": 3,
        "english_tourist_source_count": 0,
        "tourist_coverage": "low",
        "known_location_count": 1,
        "specialist_restaurant": True,
        "total_evidence_sources": 3,
        "chain_classification": "independent_single",
        "local_audience": "high",
        "international_visibility": "low",
        "corporate_visibility": "low",
        "venue_format": "fixed_venue",
        "food_drink_primary": True,
    }
    values.update(overrides)
    return FiyuEvidence(**values)


def test_independent_underexposed_local_audience_can_score_high():
    result = calculate_local_discovery(_inputs())
    assert result.score >= 80
    assert result.classification == "high_local_discovery_low_footprint"


@pytest.mark.parametrize(
    "change",
    [
        {"japanese_source_count": 10, "underexposure_score": 20, "digital_footprint_score": 20},
        {"english_tourist_source_count": 0, "underexposure_score": 20, "digital_footprint_score": 20},
        {"digital_footprint_score": 100, "underexposure_score": 20, "tourist_coverage": "high"},
    ],
)
def test_single_obscurity_signal_alone_cannot_create_high_local_discovery(change):
    base = _inputs(
        local_audience="unknown",
        international_visibility="high",
        chain_classification="unknown",
        specialist_restaurant=False,
        official_website_found=True,
        reservation_platform_count=3,
        social_profile_count=4,
    )
    result = calculate_local_discovery(replace(base, **change))
    assert result.score < 70


def test_chain_and_tourist_or_corporate_visibility_reduce_discovery():
    local = calculate_local_discovery(_inputs())
    chain = calculate_local_discovery(
        _inputs(chain_classification="large_chain_or_franchise")
    )
    tourist = calculate_local_discovery(
        _inputs(
            tourist_coverage="high",
            international_visibility="high",
            english_tourist_source_count=5,
            corporate_visibility="high",
            digital_footprint_score=10,
        )
    )
    assert chain.score < local.score
    assert tourist.score < local.score


def test_small_group_distinct_concept_can_still_score_well():
    result = calculate_local_discovery(
        _inputs(chain_classification="small_group_distinct_concept")
    )
    assert result.score >= 75


@pytest.mark.parametrize(
    ("category", "venue_format", "text", "classification"),
    [
        ("Catering", "catering_mobile", "Customer-selected venues.", "ineligible_mobile_or_catering"),
        ("Snack bar", "entertainment_first", "Karaoke is primary.", "ineligible_entertainment_first"),
        ("Service", "non_dining_service", "Event service.", "ineligible_non_dining_service"),
    ],
)
def test_clear_product_mismatches_are_ineligible(category, venue_format, text, classification):
    result = assess_product_eligibility(
        primary_category=category,
        venue_format=venue_format,
        food_drink_primary=False,
        structured_research={"product_eligibility_evidence": [text]},
    )
    assert not result.eligible
    assert result.classification == classification


def test_neighborhood_bar_remains_product_eligible():
    result = assess_product_eligibility(
        primary_category="Neighborhood bar",
        venue_format="fixed_venue",
        food_drink_primary=True,
        structured_research={"description_en": "A small seven-seat neighborhood bar."},
    )
    assert result.eligible


def test_negated_product_exclusion_does_not_misclassify_fixed_venue():
    result = assess_product_eligibility(
        primary_category="bar",
        venue_format="fixed_venue",
        food_drink_primary=True,
        structured_research={
            "product_eligibility_evidence": [
                (
                    "No evidence suggests catering-only, mobile, service-only, "
                    "or entertainment-first operation."
                )
            ]
        },
    )
    assert result.eligible


def test_local_discovery_materially_changes_main_score_but_cannot_overwhelm_quality():
    internal = InternalSignals(80, 80, 80)
    local = evaluate_fiyu_candidate(_evidence(), internal, {})
    visible = evaluate_fiyu_candidate(
        _evidence(
            tourist_coverage="high",
            english_tourist_source_count=5,
            international_visibility="high",
            corporate_visibility="high",
        ),
        internal,
        {},
    )
    poor_quality = evaluate_fiyu_candidate(
        _evidence(), InternalSignals(10, 100, 100), {}
    )
    assert local.fiyu_score - visible.fiyu_score >= 5
    assert local.local_discovery_contribution > visible.local_discovery_contribution
    assert poor_quality.fiyu_score < 75


def test_score_is_bounded_and_deterministic():
    first = evaluate_fiyu_candidate(_evidence(), InternalSignals(100, 100, 100), {})
    second = evaluate_fiyu_candidate(_evidence(), InternalSignals(100, 100, 100), {})
    assert first == second
    assert 0 <= first.fiyu_score <= 100
    assert 0 <= first.local_discovery_score <= 100


@pytest.mark.parametrize(
    "changes",
    [
        {"matched_restaurant": False},
        {"identity_confidence": 0.05},
        {"total_evidence_sources": 0},
        {"conflicting_evidence": True},
    ],
)
def test_candidate_existence_and_sparse_web_diagnostics_do_not_block(changes):
    result = evaluate_fiyu_candidate(
        _evidence(**changes), InternalSignals(90, 90, 90), {}
    )
    assert result.fiyu_score >= 75
    assert result.publishable


def test_low_score_chain_and_product_exclusions_still_block():
    low = evaluate_fiyu_candidate(_evidence(), InternalSignals(5, 5, 5), {})
    chain = evaluate_fiyu_candidate(
        _evidence(
            likely_chain=True,
            chain_classification="large_chain_or_franchise",
        ),
        InternalSignals(95, 95, 95),
        {
            "chain_classification": "large_chain_or_franchise",
            "chain_evidence": ["A national franchise with standardized locations."],
        },
    )
    catering = evaluate_fiyu_candidate(
        _evidence(venue_format="catering_mobile", food_drink_primary=False),
        InternalSignals(95, 95, 95),
        {"venue_format": "catering_mobile"},
    )
    assert not low.publishable
    assert not chain.publishable and chain.chain_excluded
    assert not catering.publishable and not catering.product_eligible


def _route(**overrides):
    values = {
        "local_discovery_score": 85.0,
        "fiyu_score": 80.0,
        "research_confidence": 30.0,
        "evidence_source_count": 1,
        "product_eligibility": ProductEligibility(True, "eligible", ()),
        "chain_excluded": False,
        "fingerprint_payload": {"evidence": "one"},
    }
    values.update(overrides)
    return assess_low_footprint_eligibility(**values)


def test_promising_sparse_candidate_triggers_low_footprint_route():
    assert _route().eligible


def test_mainstream_or_well_enriched_candidate_does_not_trigger_second_pass():
    assert not _route(local_discovery_score=45).eligible
    assert not _route(research_confidence=75, evidence_source_count=5).eligible


def test_chain_and_product_exclusions_cannot_trigger_rescue_research():
    assert not _route(chain_excluded=True).eligible
    assert not _route(
        product_eligibility=ProductEligibility(False, "catering", ("mobile",))
    ).eligible


def test_low_footprint_route_is_evaluation_not_publication_and_is_fingerprinted():
    first = _route()
    second = _route()
    changed = _route(fingerprint_payload={"evidence": "two"})
    assert first.eligible
    assert first.evidence_fingerprint == second.evidence_fingerprint
    assert first.evidence_fingerprint != changed.evidence_fingerprint
    assert not hasattr(first, "published")


def test_new_evidence_changes_discovery_through_deterministic_recomputation():
    before = calculate_local_discovery(
        _inputs(tourist_coverage="unknown", local_audience="unknown")
    )
    after = calculate_local_discovery(
        _inputs(tourist_coverage="low", local_audience="high")
    )
    assert after.score > before.score


@pytest.mark.parametrize(
    "closure_text",
    [
        "Possible closure has been reported.",
        "The restaurant is confirmed permanently closed.",
        "Independent research could not establish current existence.",
    ],
)
def test_closure_or_nonexistence_is_diagnostic_only(closure_text):
    internal = InternalSignals(90, 80, 80)
    baseline = evaluate_fiyu_candidate(_evidence(), internal, {})
    result = evaluate_fiyu_candidate(
        _evidence(conflicting_evidence=True),
        internal,
        {"warnings": [closure_text]},
    )
    assert result.product_eligible
    assert result.publishable
    assert result.fiyu_score == baseline.fiyu_score


def test_explicit_supported_tourist_orientation_reduces_discovery():
    neutral = calculate_local_discovery(
        _inputs(tourist_coverage="unknown", tourist_orientation="unknown")
    )
    tourist = calculate_local_discovery(
        _inputs(
            tourist_coverage="unknown",
            tourist_orientation="high",
            tourist_signals=("Prominent inbound travel-guide positioning.",),
        )
    )
    assert neutral.tourist_orientation == "unknown"
    assert tourist.tourist_orientation == "high"
    assert neutral.score - tourist.score >= 4.5


def test_unsupported_tourist_enum_is_neutral():
    unknown = calculate_local_discovery(
        _inputs(tourist_coverage="unknown", tourist_orientation="unknown")
    )
    unsupported = calculate_local_discovery(
        _inputs(tourist_coverage="unknown", tourist_orientation="high")
    )
    assert unsupported.score == unknown.score
    assert unsupported.components == unknown.components
    assert unsupported.tourist_orientation == "unknown"
    assert unsupported.tourist_orientation_basis == (
        "unsupported_orientation_treated_as_unknown"
    )


def test_language_mix_and_tourist_district_alone_do_not_imply_tourist_orientation():
    internal = InternalSignals(80, 80, 80)
    japanese = evaluate_fiyu_candidate(
        _evidence(official_language="ja"), internal, {"neighborhood": "Tsukiji"}
    )
    multilingual = evaluate_fiyu_candidate(
        _evidence(official_language="mixed"), internal, {"neighborhood": "Tsukiji"}
    )
    assert japanese.tourist_orientation == multilingual.tourist_orientation == "unknown"
    assert japanese.local_discovery_score == multilingual.local_discovery_score


def test_language_source_dominance_does_not_establish_local_audience():
    few_japanese = calculate_local_discovery(
        _inputs(
            local_audience="unknown",
            japanese_source_count=0,
            english_tourist_source_count=0,
        )
    )
    japanese_dominant = calculate_local_discovery(
        _inputs(
            local_audience="unknown",
            japanese_source_count=10,
            english_tourist_source_count=0,
        )
    )
    assert few_japanese.components["local_audience_orientation"] == 50
    assert japanese_dominant.components["local_audience_orientation"] == 50


def test_explicit_local_audience_evidence_increases_local_component():
    unknown = calculate_local_discovery(_inputs(local_audience="unknown"))
    supported = calculate_local_discovery(
        _inputs(
            local_audience="high",
            local_audience_signals=("Neighborhood association coverage.",),
        )
    )
    assert (
        supported.components["local_audience_orientation"]
        > unknown.components["local_audience_orientation"]
    )


def test_tourist_orientation_lowers_score_only_through_bounded_discovery_weight():
    internal = InternalSignals(80, 80, 80)
    neutral = evaluate_fiyu_candidate(
        _evidence(tourist_coverage="unknown"), internal, {}
    )
    tourist = evaluate_fiyu_candidate(
        _evidence(tourist_coverage="unknown"),
        internal,
        {
            "tourist_orientation": "high",
            "tourist_signals": ["Strong inbound travel-platform prominence."],
        },
    )
    assert tourist.product_eligible
    assert tourist.fiyu_score < neutral.fiyu_score
    assert neutral.fiyu_score - tourist.fiyu_score < 3


def test_effective_weights_keep_quality_largest_and_overlap_controlled():
    effective_independence = (
        FIYU_SCORE_WEIGHTS["independence"]
        + FIYU_SCORE_WEIGHTS["local_discovery"]
        * LOCAL_DISCOVERY_WEIGHTS["independence"]
    )
    effective_underexposure = (
        FIYU_SCORE_WEIGHTS["hiddenness"] * HIDDENNESS_WEIGHTS["underexposure"]
        + FIYU_SCORE_WEIGHTS["local_discovery"]
        * LOCAL_DISCOVERY_WEIGHTS["underexposure"]
    )
    assert FIYU_SCORE_WEIGHTS["quality"] == 0.45
    assert effective_independence == pytest.approx(0.20)
    assert effective_underexposure == pytest.approx(0.1225)
    assert FIYU_SCORE_WEIGHTS["quality"] > effective_independence


def test_extreme_obscurity_cannot_make_poor_quality_exceptional():
    result = evaluate_fiyu_candidate(
        _evidence(), InternalSignals(10, 100, 100), {}
    )
    assert result.local_discovery_score >= 80
    assert result.fiyu_score < 75
