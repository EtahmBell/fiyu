import pytest

from fiyu.local_discovery import ProductEligibility
from fiyu.public_score import (
    FiyuEvidence,
    InternalSignals,
    assess_chain_classification,
    assess_publication_conflict,
    calculate_fiyu_score,
)


def test_strong_local_independent_restaurant_scores_well() -> None:
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.95,
        official_language="ja",
        japanese_source_count=5,
        english_tourist_source_count=1,
        japanese_review_share=0.85,
        tourist_coverage="low",
        reservation_platform_count=0,
        official_website_found=False,
        social_profile_count=1,
        likely_chain=False,
        known_location_count=1,
        specialist_restaurant=True,
        independent_positive_source_count=3,
        total_evidence_sources=6,
    )
    internal = InternalSignals(
        quality_score=82,
        underexposure_score=88,
        digital_footprint_score=90,
    )
    result = calculate_fiyu_score(evidence, internal)
    assert result.fiyu_score >= 80
    assert result.fiyu_confidence >= 80
    assert result.publishable is True


def test_weak_web_identity_is_diagnostic_not_a_score_or_publication_cap() -> None:
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.50,
        official_language="ja",
        japanese_source_count=8,
        tourist_coverage="low",
        likely_chain=False,
        total_evidence_sources=8,
    )
    internal = InternalSignals(quality_score=95, underexposure_score=95, digital_footprint_score=95)
    result = calculate_fiyu_score(evidence, internal)
    assert result.fiyu_score > 65
    assert result.fiyu_confidence < 80
    assert result.publishable is True


def test_restricted_access_is_a_publication_gate_not_a_score_penalty() -> None:
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.95,
        official_language="ja",
        japanese_source_count=4,
        tourist_coverage="low",
        known_location_count=1,
        total_evidence_sources=4,
    )
    internal = InternalSignals(quality_score=85, underexposure_score=85, digital_footprint_score=85)
    eligible = calculate_fiyu_score(evidence, internal)
    restricted = calculate_fiyu_score(
        evidence,
        internal,
        product_eligibility=ProductEligibility(
            False,
            "ineligible_restricted_access",
            ("affirmative_members_only",),
        ),
    )
    assert restricted.fiyu_score == eligible.fiyu_score
    assert restricted.product_eligible is False
    assert restricted.publishable is False


def test_chain_is_not_publishable() -> None:
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.98,
        official_language="ja",
        japanese_source_count=5,
        tourist_coverage="low",
        likely_chain=True,
        chain_classification="large_chain_or_franchise",
        known_location_count=20,
        total_evidence_sources=6,
    )
    internal = InternalSignals(quality_score=90, underexposure_score=90, digital_footprint_score=90)
    result = calculate_fiyu_score(evidence, internal)
    assert result.publishable is False
    assert result.independence_signal < 30


def _chain_evidence(**overrides):
    values = {
        "matched_restaurant": True,
        "identity_confidence": 0.95,
        "total_evidence_sources": 4,
        "known_location_count": 1,
        "specialist_restaurant": True,
    }
    values.update(overrides)
    return FiyuEvidence(**values)


@pytest.mark.parametrize(
    ("structured", "classification", "excluded"),
    [
        (
            {"chain_evidence": ["A single independent restaurant with no multi-venue affiliation."]},
            "independent_single",
            False,
        ),
        (
            {
                "restaurant_group_affiliated": True,
                "chain_evidence": ["A small hospitality group operating multiple distinct concepts."],
            },
            "small_group_distinct_concept",
            False,
        ),
        (
            {
                "restaurant_group_affiliated": True,
                "chain_evidence": ["A chef group with three differently named restaurants."],
            },
            "small_group_distinct_concept",
            False,
        ),
        (
            {"chain_evidence": ["The same-brand locations have a substantially replicated menu."]},
            "small_same_brand_chain",
            True,
        ),
        (
            {"chain_evidence": ["The restaurant is operated as a franchise."]},
            "large_chain_or_franchise",
            True,
        ),
        (
            {"chain_evidence": ["This is a large standardized chain."]},
            "large_chain_or_franchise",
            True,
        ),
        (
            {
                "chain_evidence": [
                    "Explicit branch terminology identifies repeated branches of the same concept."
                ]
            },
            "small_same_brand_chain",
            True,
        ),
    ],
)
def test_chain_behavior_is_classified_from_explicit_evidence(
    structured, classification, excluded
):
    result = assess_chain_classification(_chain_evidence(), structured)
    assert result.classification == classification
    assert result.excluded is excluded


@pytest.mark.parametrize(
    "text",
    [
        "Part of the Kiku restaurant group.",
        "The restaurant has the same parent company as another venue.",
    ],
)
def test_ownership_affiliation_alone_is_not_chain_excluded(text):
    result = assess_chain_classification(
        _chain_evidence(likely_chain=True), {"chain_evidence": [text]}
    )
    assert result.group_affiliated is True
    assert result.classification == "unknown"
    assert result.excluded is False


def test_unknown_chain_evidence_stays_unknown_without_fabrication():
    result = assess_chain_classification(_chain_evidence(), {})
    assert result.classification == "unknown"
    assert result.excluded is False


@pytest.mark.parametrize(
    "classification",
    ["small_same_brand_chain", "large_chain_or_franchise"],
)
def test_excluded_chain_label_requires_positive_behavioral_corroboration(classification):
    result = assess_chain_classification(
        _chain_evidence(likely_chain=True, chain_classification=classification),
        {
            "chain_classification": classification,
            "chain_evidence": [
                (
                    "Available evidence identifies one location and does not establish "
                    "repeated same-brand branches or franchise operation."
                )
            ],
        },
    )
    assert result.classification == "unknown"
    assert result.excluded is False


def test_small_group_distinct_concept_has_reduced_but_nonblocking_independence():
    evidence = _chain_evidence(
        restaurant_group_affiliated=True,
        chain_classification="small_group_distinct_concept",
        known_location_count=2,
    )
    score = calculate_fiyu_score(evidence, InternalSignals(80, 80, 80))
    assert 70 < score.independence_signal < 100
    assert score.chain_excluded is False
    assert score.publishable is True


def _conflicting_evidence():
    return FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.98,
        total_evidence_sources=4,
        conflicting_evidence=True,
    )


def _structured(warning, **address):
    return {
        "address_evidence": {
            "identity_status": "confirmed",
            "branch_name": None,
            "conflicting_address_candidates": [],
            "warnings": [warning],
            **address,
        }
    }


@pytest.mark.parametrize(
    "warning",
    [
        "Sources disagree on the holiday schedule; this is an operational conflict only.",
        "Opening hours differ between listings.",
        "Pricing differs between otherwise matching sources.",
        "Menu availability differs by source.",
    ],
)
def test_explicit_operational_conflicts_do_not_block_publication(warning):
    result = assess_publication_conflict(_conflicting_evidence(), _structured(warning))
    assert result.classification == "non_material_operational"
    assert result.blocking_conflict is False


def test_phone_difference_explicitly_not_affecting_address_is_non_material():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "Phone numbers differ across controlled pages, but this does not alter "
            "the address match."
        ),
    )
    assert result.classification == "non_material_operational"
    assert result.blocking_conflict is False


def test_navigation_only_address_candidate_does_not_block_score_policy():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "Navigation address differs from the restaurant address.",
            conflicting_address_candidates=[
                {
                    "address_raw": "1-6-4 Kojimachi",
                    "summary": "Neighboring-building navigation reference, not the restaurant address.",
                }
            ],
        ),
    )
    assert result.classification == "non_material_identity_irrelevant_address"
    assert result.blocking_conflict is False


def test_similarly_named_restaurant_address_does_not_block_score_policy():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "A similarly named restaurant was found, but this does not alter the identity match.",
            conflicting_address_candidates=[
                {
                    "address_raw": "2-5-3 Asakusa",
                    "summary": "A separate similarly named restaurant, not the candidate.",
                }
            ],
        ),
    )
    assert result.classification == "non_material_identity_irrelevant_address"
    assert result.blocking_conflict is False


def test_same_core_address_with_omitted_unit_does_not_block_score_policy():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "The second source omits only the suite suffix.",
            conflicting_address_candidates=[
                {
                    "municipality_or_ward": "渋谷区",
                    "neighborhood": "本町",
                    "street_or_block": "1-2-2",
                    "summary": "Same street address but without unit 3.",
                }
            ],
            municipality_or_ward="渋谷区",
            neighborhood="本町",
            street_or_block="1-2-2",
        ),
    )
    assert result.classification == "non_material_identity_irrelevant_address"
    assert result.blocking_conflict is False


@pytest.mark.parametrize(
    "warning",
    [
        "Restaurant identity conflicts between sources.",
        "Sources disagree on closure and continued existence.",
        "Business type and category conflict.",
        "Holiday schedule differs and restaurant identity conflicts.",
    ],
)
def test_material_or_mixed_conflicts_block_publication(warning):
    assert assess_publication_conflict(
        _conflicting_evidence(), _structured(warning)
    ).blocking_conflict


def test_genuine_branch_conflict_blocks_but_address_only_conflict_does_not():
    branch = assess_publication_conflict(
        _conflicting_evidence(), _structured("Branch differs.", branch_name="Ginza")
    )
    address = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "Addresses disagree.",
            conflicting_address_candidates=[{"address_raw": "Tokyo"}],
        ),
    )
    assert branch.blocking_conflict
    assert not address.blocking_conflict


def test_bare_legacy_conflict_without_current_material_cause_does_not_block():
    result = assess_publication_conflict(_conflicting_evidence(), {})
    assert result.classification == "non_material_unexplained_legacy_flag"
    assert not result.blocking_conflict


def test_negative_closure_finding_does_not_create_a_protected_conflict():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "No official website, closure notice, or conflicting address was found."
        ),
    )
    assert result.classification == "non_material_unexplained_legacy_flag"
    assert not result.blocking_conflict


def test_no_conflict_never_blocks():
    evidence = _conflicting_evidence()
    evidence.conflicting_evidence = False
    assert not assess_publication_conflict(evidence, {}).blocking_conflict


def test_numeric_score_is_independent_from_conflict_publication_gate():
    evidence = _conflicting_evidence()
    internal = InternalSignals(80, 80, 80)
    blocked = calculate_fiyu_score(evidence, internal)
    operational = assess_publication_conflict(
        evidence, _structured("Holiday schedule differs between sources.")
    )
    allowed = calculate_fiyu_score(
        evidence, internal, conflict_assessment=operational
    )
    assert blocked.fiyu_score == allowed.fiyu_score
    assert blocked.publishable is True
    assert allowed.publishable is True


def test_historical_address_is_excluded_from_current_conflict_voting():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "The former address is retained as historical provenance.",
            municipality_or_ward="Minato",
            neighborhood="Motoazabu",
            street_or_block="2-1-20",
            conflicting_address_candidates=[
                {
                    "address_temporality": "historical",
                    "municipality_or_ward": "Minato",
                    "neighborhood": "Shirokane",
                    "street_or_block": "6-19-8",
                    "summary": "Former location before relocation.",
                }
            ],
        ),
    )
    assert not result.blocking_conflict


def test_unsupported_google_hint_cannot_outvote_independent_current_address():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "Independent sources agree on the current address.",
            municipality_or_ward="Ota",
            neighborhood="Honhaneda",
            street_or_block="1-20-3",
            conflicting_address_candidates=[
                {
                    "address_raw": "Honhaneda 1-20-20",
                    "source_urls": [],
                    "summary": "Unsupported Google-derived address hint; no qualifying independent source supports it.",
                    "municipality_or_ward": "Ota",
                    "neighborhood": "Honhaneda",
                    "street_or_block": "1-20-20",
                }
            ],
        ),
    )
    assert not result.blocking_conflict


def test_same_restaurant_block_disagreement_is_nonblocking_location_uncertainty():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "Exact restaurant sources disagree on the final block number.",
            identity_status="confirmed",
            identity_confidence=0.99,
            municipality_or_ward="Taito",
            neighborhood="Asakusa",
            street_or_block="3-42-12",
            component_agreement={
                "material_conflicting_components": ["street_or_block"]
            },
            conflicting_address_candidates=[
                {
                    "summary": "The same restaurant and building are listed at 3-42-11.",
                    "municipality_or_ward": "Taito",
                    "neighborhood": "Asakusa",
                    "street_or_block": "3-42-11",
                }
            ],
        ),
    )
    assert result.classification == "non_material_address_uncertainty"
    assert not result.blocking_conflict


def test_confirmed_locality_discriminator_is_not_branch_ambiguity():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "A separate restaurant appears in unqualified searches.",
            identity_status="confirmed",
            branch_name="Ichibancho",
            conflicting_address_candidates=[
                {
                    "summary": "A separate same-name restaurant, not the candidate.",
                    "address_raw": "Sangenjaya",
                }
            ],
        ),
    )
    assert not result.blocking_conflict


def test_genuine_identity_and_branch_ambiguity_still_block():
    identity = assess_publication_conflict(
        _conflicting_evidence(),
        _structured("Restaurant identity conflicts.", identity_status="ambiguous"),
    )
    branch = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "Multiple plausible same-brand branches leave branch mapping unresolved.",
            branch_name="Ginza",
        ),
    )
    assert identity.blocking_conflict
    assert branch.blocking_conflict


def test_mobile_service_fixed_venue_ambiguity_remains_material():
    result = assess_publication_conflict(
        _conflicting_evidence(),
        _structured(
            "This is a mobile service operating at customer-selected venues, not a fixed restaurant."
        ),
    )
    assert result.blocking_conflict
    assert "material_fixed_venue_identity_ambiguity" in result.reasons
