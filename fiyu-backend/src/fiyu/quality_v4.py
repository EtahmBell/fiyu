"""Versioned production candidate for deterministic Quality-v4 shadow scoring.

The validated case-strength implementation remains the single source of truth.
This module adds the version contract, initial production guardrail, prior clamp,
and canonical production-v3 shadow-score composition used by the pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from .experimental_quality_case_strength_v4 import (
    ClaimCluster,
    NormalizedQualityObservation,
    QualityCaseStrength,
    calculate_quality_case_strength,
)
from .experimental_quality_challenge_v4 import ChallengeObservation
from .experimental_score_v4 import evaluate_with_quality_adjustment
from .public_score import FiyuEvidence, FiyuScoreResult, InternalSignals
from .utils import clamp

QUALITY_RESEARCH_VERSION: Final = "quality-v4-research-1"
QUALITY_CASE_STRENGTH_VERSION: Final = "quality-v4-case-strength-1"
QUALITY_SCORE_VERSION: Final = "quality-v4-shadow-1"
QUALITY_PRODUCTION_SCORE_VERSION: Final = (
    "public-v4-quality-research-specialist-tristate"
)
QUALITY_PROMPT_VERSION: Final = "quality-v4-two-sided-2026-10-05"
DEFAULT_ADJUSTMENT_GUARDRAIL: Final = 15.0
EXPERIMENTAL_HARD_CEILING: Final = 20.0


@dataclass(frozen=True, slots=True)
class QualityV4Result:
    base_quality_prior: float
    positive_case_strength: float
    negative_case_strength: float
    evidence_balance: float
    raw_quality_adjustment: float
    guarded_quality_adjustment: float
    adjustment_guardrail: float
    researched_quality: float
    quality_evidence_confidence: str
    independent_source_count: int
    qualifying_observation_count: int
    excluded_observation_count: int
    normalized_observations: tuple[NormalizedQualityObservation, ...]
    claim_clusters: tuple[ClaimCluster, ...]


@dataclass(frozen=True, slots=True)
class QualityV4ShadowResult:
    quality: QualityV4Result
    production_v3: FiyuScoreResult
    shadow_v4: FiyuScoreResult
    shadow_score_version: str
    shadow_fiyu_score: float
    score_delta: float


def _confidence(case: QualityCaseStrength) -> str:
    if not case.qualifying_observation_count:
        return "none"
    peak = max(
        case.positive_quality_case_strength,
        case.negative_quality_case_strength,
    )
    corroborated = (
        case.corroborated_positive_claim_count + case.corroborated_negative_claim_count
    )
    if case.independent_source_count >= 4 and corroborated >= 1 and peak >= 35:
        return "high"
    if case.independent_source_count >= 2 and peak >= 15:
        return "medium"
    return "low"


def calculate_quality_v4(
    observations: list[ChallengeObservation],
    *,
    base_quality_prior: float,
    adjustment_guardrail: float = DEFAULT_ADJUSTMENT_GUARDRAIL,
    as_of_year: int = 2026,
) -> QualityV4Result:
    """Calculate the frozen v4 design and apply the versioned production guardrail."""

    if not 0 < adjustment_guardrail <= EXPERIMENTAL_HARD_CEILING:
        raise ValueError("adjustment_guardrail must be in (0, 20]")
    case = calculate_quality_case_strength(
        observations,
        hard_cap=EXPERIMENTAL_HARD_CEILING,
        as_of_year=as_of_year,
    )
    guarded = round(
        max(-adjustment_guardrail, min(adjustment_guardrail, case.quality_adjustment)),
        2,
    )
    return QualityV4Result(
        base_quality_prior=round(clamp(base_quality_prior), 2),
        positive_case_strength=case.positive_quality_case_strength,
        negative_case_strength=case.negative_quality_case_strength,
        evidence_balance=case.researched_quality_evidence_balance,
        raw_quality_adjustment=case.quality_adjustment,
        guarded_quality_adjustment=guarded,
        adjustment_guardrail=adjustment_guardrail,
        researched_quality=round(clamp(base_quality_prior + guarded), 2),
        quality_evidence_confidence=_confidence(case),
        independent_source_count=case.independent_source_count,
        qualifying_observation_count=case.qualifying_observation_count,
        excluded_observation_count=case.excluded_observation_count,
        normalized_observations=case.normalized_observations,
        claim_clusters=case.claim_clusters,
    )


def calculate_quality_v4_shadow(
    observations: list[ChallengeObservation],
    *,
    evidence: FiyuEvidence,
    internal: InternalSignals,
    structured_research: dict[str, object] | None = None,
    primary_category: str | None = None,
    adjustment_guardrail: float = DEFAULT_ADJUSTMENT_GUARDRAIL,
    as_of_year: int = 2026,
) -> QualityV4ShadowResult:
    quality = calculate_quality_v4(
        observations,
        base_quality_prior=internal.quality_score,
        adjustment_guardrail=adjustment_guardrail,
        as_of_year=as_of_year,
    )
    production = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured_research,
        primary_category=primary_category,
        quality_adjustment=0,
    )
    shadow = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured_research,
        primary_category=primary_category,
        quality_adjustment=quality.guarded_quality_adjustment,
    )
    return QualityV4ShadowResult(
        quality=quality,
        production_v3=production,
        shadow_v4=shadow,
        shadow_score_version=QUALITY_SCORE_VERSION,
        shadow_fiyu_score=shadow.fiyu_score,
        score_delta=round(shadow.fiyu_score - production.fiyu_score, 2),
    )
