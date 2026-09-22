from copy import deepcopy

import pytest

from fiyu.public_score import FiyuEvidence, InternalSignals, calculate_fiyu_score
from fiyu.score_transparency import explain_score


def record(**changes):
    evidence = {
        "matched_restaurant": True, "identity_confidence": 0.95,
        "total_evidence_sources": 6, "japanese_source_count": 5,
        "english_tourist_source_count": 0, "international_visibility": "low",
        "tourist_coverage": "low", "chain_classification": "independent_single",
        "known_location_count": 1, "conflicting_evidence": False,
    }
    evidence.update(changes)
    return {"fiyu_score": 87.62, "score_version": "public-v3-local-discovery",
            "quality_signal": 91.23, "hiddenness_signal": 78.9,
            "independence_signal": 100, "local_discovery_score": 72.3,
            "confidence_band": "high", "evidence_json": evidence}


def test_supported_reasons_and_exact_stored_signal_normalization():
    row = record()
    before = deepcopy(row)
    explanation = explain_score(row)
    assert "limited international visibility" in " ".join(explanation.reasons)
    assert "single independent" in " ".join(explanation.reasons)
    assert [signal.value for signal in explanation.signals] == [9.1, 7.9, 10, 7.2]
    assert explanation.evidence_confidence == "High"
    assert explain_score(row) == explanation
    assert row == before


@pytest.mark.parametrize("changes", [
    {"english_tourist_source_count": 3},
    {"international_visibility": "medium"},
    {"international_visibility": "high"},
    {"tourist_coverage": "high"},
    {"tourist_orientation": "high"},
])
def test_visibility_never_implies_obscurity_when_not_supported(changes):
    explanation = explain_score(record(**changes))
    assert "limited international" not in " ".join(explanation.reasons)
    assert "stored quality signal is strong" in " ".join(explanation.reasons)


@pytest.mark.parametrize("changes", [
    {"known_location_count": 2}, {"likely_chain": True},
    {"restaurant_group_affiliated": True}, {"chain_classification": "unknown"},
    {"chain_classification": "small_same_brand_chain"},
])
def test_no_false_independent_claim(changes):
    assert "single independent" not in " ".join(explain_score(record(**changes)).reasons)


def test_structured_override_and_conflicting_evidence_suppress_claims():
    row = record()
    row["structured_research_json"] = {"chain_classification": "small_same_brand_chain", "international_visibility": "high"}
    text = " ".join(explain_score(row).reasons)
    assert "single independent" not in text
    assert "limited international" not in text
    row["evidence_json"]["conflicting_evidence"] = True
    assert len(explain_score(row).reasons) == 1  # numeric quality only


@pytest.mark.parametrize("evidence", [None, "broken", "[]", {}, {"secret": "private"}])
def test_missing_legacy_evidence_has_no_invented_claims(evidence):
    result = explain_score({"evidence_json": evidence, "fiyu_score": 80})
    assert result.reasons == []
    assert result.signals == []
    assert result.evidence_confidence is None


@pytest.mark.parametrize("value", [None, -1, 101, float("nan"), float("inf"), True, "90"])
def test_invalid_signal_is_omitted_not_zero(value):
    row = record()
    row["quality_signal"] = value
    assert "quality_signal" not in {item.key for item in explain_score(row).signals}


def test_legacy_uses_stored_language_signal_not_new_discovery_formula():
    row = record()
    row.update(score_version="public-v1", local_signal=83, local_discovery_score=None)
    result = explain_score(row)
    assert result.model_label == "Historical scoring model"
    assert result.signals[-1].key == "local_signal"
    assert result.signals[-1].value == 8.3
    assert "Historical rating" in result.signals[0].description


def test_score_outputs_unchanged_for_high_low_and_capped_scores():
    for internal in (InternalSignals(100, 100, 100), InternalSignals(75, 70, 55), InternalSignals(50, 20, 10)):
        evidence = FiyuEvidence(matched_restaurant=True, identity_confidence=0.9,
                                chain_classification="independent_single", total_evidence_sources=5)
        score = calculate_fiyu_score(evidence, internal)
        row = {**score.to_dict(), "evidence_json": evidence.to_dict()}
        before = deepcopy(row)
        explain_score(row)
        assert row == before
        assert calculate_fiyu_score(evidence, internal) == score


def test_duplicate_editorial_sentence_is_not_repeated():
    row = record()
    row["card_description"] = "Stored research identifies a single independent restaurant."
    assert row["card_description"] not in explain_score(row).reasons


def test_conflicting_base_and_structured_findings_do_not_become_positive_claims():
    row = record(chain_classification="small_same_brand_chain", international_visibility="high")
    row["structured_research_json"] = {"chain_classification": "independent_single", "international_visibility": "low"}
    text = " ".join(explain_score(row).reasons)
    assert "single independent" not in text
    assert "limited international" not in text


def test_single_source_does_not_support_broad_independence_or_visibility_claims():
    result = explain_score(record(total_evidence_sources=1))
    assert len(result.reasons) == 1
    assert "stored quality signal" in result.reasons[0]
