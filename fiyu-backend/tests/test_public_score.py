from fiyu.public_score import FiyuEvidence, InternalSignals, calculate_fiyu_score


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


def test_weak_identity_caps_score_and_blocks_publication() -> None:
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
    assert result.fiyu_score <= 65
    assert result.publishable is False


def test_chain_is_not_publishable() -> None:
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.98,
        official_language="ja",
        japanese_source_count=5,
        tourist_coverage="low",
        likely_chain=True,
        known_location_count=20,
        total_evidence_sources=6,
    )
    internal = InternalSignals(quality_score=90, underexposure_score=90, digital_footprint_score=90)
    result = calculate_fiyu_score(evidence, internal)
    assert result.publishable is False
    assert result.independence_signal < 30
