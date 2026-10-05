"""Evidence schema and deterministic policies for the v4 Quality challenge set."""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EvidenceFamily = Literal[
    "craft_execution",
    "ingredient_product_quality",
    "food_reputation_specialization",
    "consistency",
]
Aspect = Literal[
    "technique",
    "seasoning_balance",
    "doneness_texture",
    "broth_sauce",
    "ingredient_freshness",
    "ingredient_sourcing",
    "handmade_components",
    "specialist_craft",
    "signature_dish_reputation",
    "food_editorial_recognition",
    "repeated_food_praise",
    "reliable_execution",
    "inconsistency",
    "recurring_preparation_problem",
    "quality_concern",
]
SourceType = Literal[
    "local_review_platform",
    "map_review_platform",
    "local_food_blog",
    "editorial_food_media",
    "restaurant_guide",
    "reservation_platform",
    "official_restaurant",
    "newspaper_magazine",
    "other",
]

_ABSENCE = re.compile(
    r"\b(?:no|not any) (?:credible |corroborated |repeated )?"
    r"(?:negative evidence|complaints?|concerns?|problems?)\b|"
    r"\b(?:nothing negative|none (?:was|were) found|did not (?:find|identify|locate))\b",
    re.IGNORECASE,
)


class ChallengeObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_family: EvidenceFamily
    aspect: Aspect
    polarity: Literal["positive", "negative", "mixed"]
    strength: Literal["weak", "moderate", "strong"]
    claim: str = Field(min_length=8)
    food_specific: bool
    directness: Literal["direct", "inferred"]
    source_url: str = Field(min_length=8, max_length=2000)
    source_type: SourceType
    source_language: Literal["Japanese", "English", "other", "unknown"]
    publication_or_observation_date: str | None = None
    normalized_author_or_document_identity: str = Field(min_length=2)
    provenance_group: str = Field(min_length=2)
    underlying_claim_identity: str = Field(min_length=3)
    independent_source_key: str = Field(min_length=2)
    notes: str | None = None

    @field_validator("source_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = value.strip()
        if urlparse(cleaned).scheme not in {"http", "https"}:
            raise ValueError("source_url must use HTTP(S)")
        return cleaned

    @field_validator(
        "normalized_author_or_document_identity",
        "provenance_group",
        "underlying_claim_identity",
        "independent_source_key",
    )
    @classmethod
    def normalize_identity(cls, value: str) -> str:
        return "-".join(value.strip().casefold().split())


class ChallengeResearchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_level: Literal["none", "sparse", "moderate", "strong"]
    quality_evidence_confidence: Literal["none", "low", "medium", "high"]
    observations: list[ChallengeObservation] = Field(default_factory=list, max_length=20)
    research_summary: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_none(self) -> ChallengeResearchResult:
        if self.evidence_level == "none" and self.observations:
            raise ValueError("none evidence may not contain observations")
        return self


def is_qualifying(observation: ChallengeObservation) -> bool:
    return (
        observation.food_specific
        and observation.polarity != "mixed"
        and not _ABSENCE.search(observation.claim)
    )


@dataclass(frozen=True, slots=True)
class PolicyAdjustment:
    name: str
    hard_cap: int
    adjustment: float
    positive_evidence_value: float
    negative_evidence_value: float
    positive_tier: str
    negative_tier: str


@dataclass(frozen=True, slots=True)
class ChallengeScoring:
    policies: dict[str, PolicyAdjustment]
    qualifying_observations: int
    excluded_observations: int
    independent_sources: int
    quality_families: int
    corroborated_positive_claims: int
    corroborated_negative_claims: int
    strong_positive_observations: int
    strong_negative_observations: int


_STRENGTH = {"weak": 0.3, "moderate": 0.75, "strong": 1.25}
_SOURCE = {
    "local_review_platform": 0.9,
    "map_review_platform": 0.8,
    "local_food_blog": 1.0,
    "editorial_food_media": 1.15,
    "restaurant_guide": 1.1,
    "reservation_platform": 0.8,
    "official_restaurant": 0.75,
    "newspaper_magazine": 1.15,
    "other": 0.7,
}


def _direction_metrics(
    observations: list[ChallengeObservation], polarity: Literal["positive", "negative"]
) -> tuple[float, dict[str, int]]:
    selected = [item for item in observations if item.polarity == polarity]
    clusters: dict[tuple[str, str], dict[str, ChallengeObservation]] = defaultdict(dict)
    for item in selected:
        key = (item.evidence_family, item.underlying_claim_identity)
        source_key = f"{item.provenance_group}:{item.independent_source_key}"
        current = clusters[key].get(source_key)
        if current is None or _STRENGTH[item.strength] > _STRENGTH[current.strength]:
            clusters[key][source_key] = item

    family_claims: dict[str, list[float]] = defaultdict(list)
    corroborated = 0
    sources: set[str] = set()
    strong = 0
    for (family, _claim), by_source in clusters.items():
        items = list(by_source.values())
        sources.update(by_source)
        strong += sum(item.strength == "strong" for item in items)
        if len(items) >= 2:
            corroborated += 1
        strength = sum(_STRENGTH[item.strength] for item in items) / len(items)
        source_quality = sum(_SOURCE[item.source_type] for item in items) / len(items)
        directness = sum(1.0 if item.directness == "direct" else 0.55 for item in items) / len(
            items
        )
        if polarity == "negative":
            corroboration = (
                0.0
                if len(items) == 1
                else 1.0
                if len(items) == 2
                else 1.35
                if len(items) == 3
                else 1.55
            )
        else:
            corroboration = (
                0.4
                if len(items) == 1
                else 1.0
                if len(items) == 2
                else 1.35
                if len(items) == 3
                else 1.55
            )
        value = strength * source_quality * directness * corroboration
        if polarity == "positive" and all(
            item.source_type == "official_restaurant" for item in items
        ):
            value = min(value, 0.3)
        family_claims[family].append(value)

    total = 0.0
    for values in family_claims.values():
        ordered = sorted(values, reverse=True)
        total += sum(
            value * (1.0 if index == 0 else 0.5 if index == 1 else 0.25)
            for index, value in enumerate(ordered)
        )
    return total, {
        "sources": len(sources),
        "families": len(family_claims),
        "corroborated": corroborated,
        "strong": strong,
    }


def _policy_value(raw: float, metrics: dict[str, int], cap: int) -> tuple[float, str]:
    if raw == 0:
        return 0.0, "none"
    broad = metrics["sources"] >= 3 and metrics["families"] >= 2 and metrics["corroborated"] >= 1
    strong = (
        metrics["sources"] >= 4
        and metrics["families"] >= 2
        and metrics["corroborated"] >= 2
        and metrics["strong"] >= 3
    )
    exceptional = (
        metrics["sources"] >= 6
        and metrics["families"] >= 3
        and metrics["corroborated"] >= 3
        and metrics["strong"] >= 5
    )
    if cap == 5:
        factor, tier = 1.0, "ordinary"
    elif cap == 10:
        factor, tier = (1.4, "strong") if broad else (1.0, "ordinary")
    elif cap == 15:
        factor, tier = (
            (1.8, "multi_family_strong")
            if strong
            else (1.4, "strong")
            if broad
            else (1.0, "ordinary")
        )
    else:
        factor, tier = (
            (2.5, "exceptional")
            if exceptional
            else (1.8, "multi_family_strong")
            if strong
            else (1.4, "strong")
            if broad
            else (1.0, "ordinary")
        )
    return min(float(cap), raw * factor), tier


def calculate_policy_adjustments(
    observations: list[ChallengeObservation],
) -> ChallengeScoring:
    qualifying = [item for item in observations if is_qualifying(item)]
    positive_raw, positive_metrics = _direction_metrics(qualifying, "positive")
    negative_raw, negative_metrics = _direction_metrics(qualifying, "negative")
    policies: dict[str, PolicyAdjustment] = {}
    for name, cap in (
        ("policy_a_5", 5),
        ("policy_b_10", 10),
        ("policy_c_15", 15),
        ("policy_d_20", 20),
    ):
        positive, positive_tier = _policy_value(positive_raw, positive_metrics, cap)
        negative, negative_tier = _policy_value(negative_raw, negative_metrics, cap)
        policies[name] = PolicyAdjustment(
            name=name,
            hard_cap=cap,
            adjustment=round(max(-cap, min(cap, positive - negative)), 2),
            positive_evidence_value=round(positive, 3),
            negative_evidence_value=round(negative, 3),
            positive_tier=positive_tier,
            negative_tier=negative_tier,
        )
    all_sources = {f"{item.provenance_group}:{item.independent_source_key}" for item in qualifying}
    return ChallengeScoring(
        policies=policies,
        qualifying_observations=len(qualifying),
        excluded_observations=len(observations) - len(qualifying),
        independent_sources=len(all_sources),
        quality_families=len({item.evidence_family for item in qualifying}),
        corroborated_positive_claims=positive_metrics["corroborated"],
        corroborated_negative_claims=negative_metrics["corroborated"],
        strong_positive_observations=positive_metrics["strong"],
        strong_negative_observations=negative_metrics["strong"],
    )
