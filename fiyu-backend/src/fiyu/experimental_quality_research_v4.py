"""Quality-only research primitives for the isolated Fiyu v4 experiment.

This module is deliberately disconnected from the production research, scoring,
and publication paths.  Models extract evidence; deterministic code assigns the
experimental adjustment.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

QualityAspect = Literal[
    "cooking_execution",
    "ingredient_quality",
    "specialist_craft",
    "signature_dish_reputation",
    "consistency",
    "local_food_recognition",
    "review_theme_consensus",
    "quality_concern",
    "inconsistency",
    "food_vs_hype",
]
Polarity = Literal["positive", "negative", "mixed"]
Strength = Literal["weak", "moderate", "strong"]
Directness = Literal["direct", "inferred"]
SourceType = Literal[
    "official_restaurant",
    "local_review_platform",
    "map_review_platform",
    "reservation_platform",
    "local_food_blog",
    "editorial_publication",
    "restaurant_guide",
    "newspaper_or_magazine",
    "other",
]


def _source_host(url: str) -> str:
    host = (urlparse(url).hostname or "").casefold().removeprefix("www.")
    labels = host.split(".")
    if len(labels) <= 2:
        return host
    if ".".join(labels[-2:]) in {"co.jp", "ne.jp", "or.jp", "go.jp", "ac.jp"}:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


class QualityObservation(BaseModel):
    """One auditable food-quality claim from one underlying source."""

    model_config = ConfigDict(extra="forbid")

    aspect: QualityAspect
    polarity: Polarity
    strength: Strength
    claim_key: str = Field(
        min_length=3,
        max_length=80,
        description="Stable short key shared by sources making the same claim.",
    )
    claim: str = Field(min_length=8, max_length=360)
    source_url: str = Field(min_length=8, max_length=2000)
    source_type: SourceType
    independent_source_key: str = Field(min_length=3, max_length=160)
    food_specific: bool
    directness: Directness
    notes: str | None = Field(default=None, max_length=240)

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, value: str) -> str:
        cleaned = value.strip()
        if urlparse(cleaned).scheme not in {"http", "https"}:
            raise ValueError("source_url must use HTTP(S)")
        return cleaned

    @field_validator("claim_key", "independent_source_key")
    @classmethod
    def normalize_keys(cls, value: str) -> str:
        return "-".join(value.strip().casefold().split())


class QualityResearchResult(BaseModel):
    """Strict model output.  It intentionally contains no score or point value."""

    model_config = ConfigDict(extra="forbid")

    evidence_level: Literal["none", "sparse", "moderate", "strong"]
    observations: list[QualityObservation] = Field(default_factory=list, max_length=18)
    research_summary: str = Field(min_length=1, max_length=600)

    @model_validator(mode="after")
    def evidence_level_matches_observations(self) -> QualityResearchResult:
        if self.evidence_level == "none" and self.observations:
            raise ValueError("evidence_level none requires no observations")
        return self


@dataclass(frozen=True, slots=True)
class QualityAdjustment:
    adjustment: float
    confidence_score: float
    confidence_band: Literal["none", "low", "medium", "high"]
    independent_source_count: int
    qualifying_observation_count: int
    corroborated_claim_count: int
    aspect_contributions: dict[str, float]
    excluded_observation_count: int


_POSITIVE_ASPECT_CAPS = {
    "cooking_execution": 2.0,
    "ingredient_quality": 1.25,
    "specialist_craft": 1.0,
    "signature_dish_reputation": 1.0,
    "consistency": 1.0,
    "local_food_recognition": 0.75,
    "review_theme_consensus": 1.0,
}
_NEGATIVE_ASPECT_CAPS = {
    "quality_concern": 2.5,
    "inconsistency": 1.75,
    "food_vs_hype": 1.25,
}
_STRENGTH = {"weak": 0.25, "moderate": 0.6, "strong": 1.0}
_ABSENCE_CLAIM = re.compile(
    r"\b(?:no corroborated|no credible|no repeated|did not (?:find|identify|provide)|"
    r"not identified|none (?:was|were) found)\b",
    re.IGNORECASE,
)


def _observation_source_key(observation: QualityObservation) -> str:
    return observation.independent_source_key or _source_host(observation.source_url)


def is_qualifying_quality_observation(observation: QualityObservation) -> bool:
    """Return whether an observation may affect the deterministic adjustment."""

    return (
        observation.food_specific
        and observation.polarity != "mixed"
        and not _ABSENCE_CLAIM.search(observation.claim)
    )


def calculate_quality_adjustment(
    observations: Iterable[QualityObservation],
) -> QualityAdjustment:
    """Map grounded observations to a conservative, symmetric +/-5 adjustment.

    Repeated URLs or publisher keys do not stack. Claims gain weight from two or
    more independent sources, but source count is never added linearly. Official
    restaurant claims may establish factual craft/sourcing and are capped at a
    weak contribution when they are the only support.
    """

    supplied = list(observations)
    qualifying = [item for item in supplied if is_qualifying_quality_observation(item)]
    excluded = len(supplied) - len(qualifying)
    clusters: dict[tuple[str, str, str], dict[str, QualityObservation]] = defaultdict(dict)
    for item in qualifying:
        sign = "positive" if item.polarity == "positive" else "negative"
        source_key = _observation_source_key(item)
        key = (item.aspect, item.claim_key, sign)
        current = clusters[key].get(source_key)
        if current is None or _STRENGTH[item.strength] > _STRENGTH[current.strength]:
            clusters[key][source_key] = item

    aspect_totals: dict[str, float] = defaultdict(float)
    corroborated = 0
    all_sources: set[str] = set()
    for (aspect, _claim_key, sign), by_source in clusters.items():
        items = list(by_source.values())
        all_sources.update(by_source)
        if len(items) >= 2:
            corroborated += 1
        average_strength = sum(_STRENGTH[item.strength] for item in items) / len(items)
        corroboration = 0.5 if len(items) == 1 else 1.0 if len(items) == 2 else 1.2
        directness = sum(1.0 if item.directness == "direct" else 0.5 for item in items) / len(items)
        value = average_strength * corroboration * directness
        if all(item.source_type == "official_restaurant" for item in items):
            value = min(value, 0.5)
        aspect_totals[aspect] += value if sign == "positive" else -value

    contributions: dict[str, float] = {}
    for aspect, value in aspect_totals.items():
        cap = _POSITIVE_ASPECT_CAPS.get(aspect) or _NEGATIVE_ASPECT_CAPS.get(aspect, 0.0)
        contributions[aspect] = round(max(-cap, min(cap, value)), 3)
    adjustment = round(max(-5.0, min(5.0, sum(contributions.values()))), 2)

    aspect_count = len({item.aspect for item in qualifying})
    confidence = min(
        100.0,
        8.0 * len(qualifying)
        + 8.0 * len(all_sources)
        + 10.0 * corroborated
        + 5.0 * min(aspect_count, 5),
    )
    confidence_band: Literal["none", "low", "medium", "high"]
    if not qualifying:
        confidence_band = "none"
        confidence = 0.0
    elif confidence < 35:
        confidence_band = "low"
    elif confidence < 65:
        confidence_band = "medium"
    else:
        confidence_band = "high"
    return QualityAdjustment(
        adjustment=adjustment,
        confidence_score=round(confidence, 1),
        confidence_band=confidence_band,
        independent_source_count=len(all_sources),
        qualifying_observation_count=len(qualifying),
        corroborated_claim_count=corroborated,
        aspect_contributions=dict(sorted(contributions.items())),
        excluded_observation_count=excluded,
    )
