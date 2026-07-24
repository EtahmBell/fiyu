from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

from .utils import clamp


OfficialLanguage = Literal["ja", "mixed", "en", "unknown"]
TouristCoverage = Literal["low", "medium", "high", "unknown"]


@dataclass(slots=True)
class FiyuEvidence:
    """Research evidence used to calculate the public/provisional Fiyu score.

    The model collects evidence. This module owns the arithmetic so scores remain
    reproducible and can be recalculated without paying for another research run.
    """

    matched_restaurant: bool = False
    identity_confidence: float = 0.0
    official_language: OfficialLanguage = "unknown"
    japanese_source_count: int = 0
    english_tourist_source_count: int = 0
    japanese_review_share: float | None = None
    tourist_coverage: TouristCoverage = "unknown"
    reservation_platform_count: int = 0
    official_website_found: bool = False
    social_profile_count: int = 0
    likely_chain: bool = False
    known_location_count: int = 1
    specialist_restaurant: bool = False
    independent_positive_source_count: int = 0
    total_evidence_sources: int = 0
    conflicting_evidence: bool = False

    def validate(self) -> None:
        if not 0.0 <= self.identity_confidence <= 1.0:
            raise ValueError("identity_confidence must be between 0 and 1")
        if self.japanese_review_share is not None and not 0.0 <= self.japanese_review_share <= 1.0:
            raise ValueError("japanese_review_share must be between 0 and 1")
        for field in (
            "japanese_source_count",
            "english_tourist_source_count",
            "reservation_platform_count",
            "social_profile_count",
            "known_location_count",
            "independent_positive_source_count",
            "total_evidence_sources",
        ):
            if getattr(self, field) < 0:
                raise ValueError(f"{field} cannot be negative")

    def to_dict(self) -> dict[str, object]:
        self.validate()
        return asdict(self)


@dataclass(frozen=True, slots=True)
class InternalSignals:
    """Signals copied from the internal candidate-generation pipeline."""

    quality_score: float
    underexposure_score: float
    digital_footprint_score: float

    def validate(self) -> None:
        for name, value in asdict(self).items():
            if not 0.0 <= float(value) <= 100.0:
                raise ValueError(f"{name} must be between 0 and 100")


@dataclass(frozen=True, slots=True)
class FiyuScoreResult:
    local_signal: float
    hiddenness_signal: float
    quality_signal: float
    independence_signal: float
    fiyu_score: float
    fiyu_confidence: float
    confidence_band: str
    score_band: str
    publishable: bool
    score_version: str = "public-v1"

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _official_language_score(language: OfficialLanguage) -> float:
    return {"ja": 100.0, "mixed": 70.0, "en": 20.0, "unknown": 50.0}[language]


def _tourist_hiddenness_score(coverage: TouristCoverage) -> float:
    return {"low": 100.0, "medium": 55.0, "high": 10.0, "unknown": 50.0}[coverage]


def _location_independence_score(location_count: int) -> float:
    if location_count <= 1:
        return 100.0
    if location_count == 2:
        return 80.0
    if location_count == 3:
        return 60.0
    if location_count == 4:
        return 40.0
    return 10.0


def _confidence_band(confidence: float) -> str:
    if confidence >= 80:
        return "high"
    if confidence >= 60:
        return "moderate"
    if confidence >= 40:
        return "low"
    return "very_low"


def _score_band(score: float) -> str:
    if score >= 85:
        return "exceptional"
    if score >= 75:
        return "strong"
    if score >= 65:
        return "promising"
    if score >= 55:
        return "borderline"
    return "not_recommended"


def calculate_fiyu_score(
    evidence: FiyuEvidence,
    internal: InternalSignals,
) -> FiyuScoreResult:
    """Calculate a reproducible provisional public Fiyu score.

    Public score weights:
      - 30% local-language web signal
      - 30% hiddenness / underexposure
      - 25% quality evidence
      - 15% independence / distinctiveness

    Confidence is calculated separately and never increases the score itself.
    """

    evidence.validate()
    internal.validate()

    # Laplace smoothing prevents one source from producing an extreme ratio.
    local_source_share = (
        (evidence.japanese_source_count + 1)
        / (evidence.japanese_source_count + evidence.english_tourist_source_count + 2)
        * 100.0
    )
    review_language_score = (
        evidence.japanese_review_share * 100.0
        if evidence.japanese_review_share is not None
        else 50.0
    )
    # Measures Japanese-language web presence and source mix.
    # This does not establish customer nationality, residency, or local-customer share.
    local_signal = clamp(
        0.55 * local_source_share
        + 0.25 * _official_language_score(evidence.official_language)
        + 0.20 * review_language_score
    )

    reservation_scarcity = clamp(100.0 - 30.0 * evidence.reservation_platform_count)
    website_scarcity = 20.0 if evidence.official_website_found else 100.0
    social_scarcity = clamp(100.0 - 25.0 * evidence.social_profile_count)
    digital_scarcity = clamp(
        0.60 * internal.digital_footprint_score
        + 0.25 * website_scarcity
        + 0.15 * social_scarcity
    )
    hiddenness_signal = clamp(
        0.40 * internal.underexposure_score
        + 0.25 * _tourist_hiddenness_score(evidence.tourist_coverage)
        + 0.15 * reservation_scarcity
        + 0.20 * digital_scarcity
    )

    independent_source_quality = clamp(
        evidence.independent_positive_source_count / 3.0 * 100.0
    )
    quality_signal = clamp(
        0.80 * internal.quality_score + 0.20 * independent_source_quality
    )

    # Limit quality claims when there is little independent evidence.
    if evidence.independent_positive_source_count == 0:
        quality_signal = min(quality_signal, 60.0)
    elif evidence.independent_positive_source_count == 1:
        quality_signal = min(quality_signal, 72.0)

    chain_independence = 0.0 if evidence.likely_chain else 100.0
    specialist_score = 100.0 if evidence.specialist_restaurant else 40.0
    independence_signal = clamp(
        0.70 * chain_independence
        + 0.20 * _location_independence_score(evidence.known_location_count)
        + 0.10 * specialist_score
    )

    fiyu_score = clamp(
        0.30 * local_signal
        + 0.30 * hiddenness_signal
        + 0.25 * quality_signal
        + 0.15 * independence_signal
    )

    # Sparse evidence should not produce an exceptional or strong public score.
    if evidence.total_evidence_sources < 3:
        fiyu_score = min(fiyu_score, 69.99)

    # A known chain should not receive a strong hidden-gem score.
    if evidence.likely_chain:
        fiyu_score = min(fiyu_score, 54.99)

    source_coverage = clamp(evidence.total_evidence_sources / 5.0 * 100.0)
    review_evidence = 100.0 if evidence.japanese_review_share is not None else 25.0
    consistency = 0.0 if evidence.conflicting_evidence else 100.0
    fiyu_confidence = clamp(
        0.40 * evidence.identity_confidence * 100.0
        + 0.30 * source_coverage
        + 0.15 * review_evidence
        + 0.15 * consistency
    )

    # Prevent weak identity matching from creating a deceptively high score.
    if not evidence.matched_restaurant:
        fiyu_score = min(fiyu_score, 50.0)
    elif evidence.identity_confidence < 0.75:
        fiyu_score = min(fiyu_score, 65.0)

    publishable = (
        evidence.matched_restaurant
        and evidence.identity_confidence >= 0.80
        and evidence.total_evidence_sources >= 2
        and not evidence.conflicting_evidence
        and not evidence.likely_chain
        and fiyu_confidence >= 55.0
    )

    fiyu_score = round(fiyu_score, 2)
    fiyu_confidence = round(fiyu_confidence, 2)
    return FiyuScoreResult(
        local_signal=round(local_signal, 2),
        hiddenness_signal=round(hiddenness_signal, 2),
        quality_signal=round(quality_signal, 2),
        independence_signal=round(independence_signal, 2),
        fiyu_score=fiyu_score,
        fiyu_confidence=fiyu_confidence,
        confidence_band=_confidence_band(fiyu_confidence),
        score_band=_score_band(fiyu_score),
        publishable=publishable,
    )
