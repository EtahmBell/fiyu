"""Offline case-strength scoring for the experimental Fiyu Quality v4 work.

The module consumes already-collected challenge observations.  It has no model,
network, database, publication, or production-scoring side effects.  Free-form
claim identities are intentionally ignored for corroboration; claims consolidate
on a deterministic family/aspect/polarity taxonomy and provenance independence.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from itertools import pairwise
from typing import Literal
from urllib.parse import urlparse

from .experimental_quality_challenge_v4 import ChallengeObservation, is_qualifying

NormalizedFamily = Literal[
    "craft_execution",
    "ingredient_product",
    "food_reputation",
    "consistency",
]
Specificity = Literal["low", "moderate", "high"]

_SOURCE_CREDIBILITY = {
    "local_review_platform": 0.82,
    "map_review_platform": 0.72,
    "local_food_blog": 0.90,
    "editorial_food_media": 1.00,
    "restaurant_guide": 0.98,
    "reservation_platform": 0.72,
    "official_restaurant": 0.45,
    "newspaper_magazine": 1.00,
    "other": 0.65,
}
_STRENGTH = {"weak": 0.35, "moderate": 0.68, "strong": 1.0}
_SPECIFICITY = {"low": 0.45, "moderate": 0.72, "high": 1.0}
_DIRECTNESS = {"inferred": 0.62, "direct": 1.0}

_TECHNICAL = re.compile(
    r"\b(?:broth|stock|soup|dashi|miso|season(?:ing|ed)|balance|umami|depth|"
    r"texture|crisp|crispy|soft|tender|chewy|juicy|dry|moist|doneness|raw|"
    r"overcook|undercook|grill|charcoal|fried|frying|temperature|knife|fresh|"
    r"stale|sourc|ingredient|handmade|house-made|noodles?|rice|fish|seafood|"
    r"meat|produce|sauce|aroma|flavou?r|sweet|salty|bitter)\w*\b",
    re.IGNORECASE,
)
_GENERIC = re.compile(
    r"^(?:the )?(?:food|meal|dish(?:es)?) (?:was|were|is|are) "
    r"(?:good|great|excellent|bad|poor|delicious|tasty)[.!]?$",
    re.IGNORECASE,
)
_SYNTHESIS = re.compile(r"cross[-_ ]source|synthesis", re.IGNORECASE)


def _host(url: str) -> str:
    host = (urlparse(url).hostname or "unknown").casefold().removeprefix("www.")
    labels = host.split(".")
    if len(labels) > 2 and ".".join(labels[-2:]) in {
        "co.jp",
        "ne.jp",
        "or.jp",
        "go.jp",
        "ac.jp",
    }:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:]) if len(labels) > 1 else host


def normalize_family(observation: ChallengeObservation) -> NormalizedFamily:
    return {
        "craft_execution": "craft_execution",
        "ingredient_product_quality": "ingredient_product",
        "food_reputation_specialization": "food_reputation",
        "consistency": "consistency",
    }[observation.evidence_family]


def normalize_aspect(observation: ChallengeObservation) -> str:
    """Normalize conservatively, with text cues repairing known schema splits."""

    text = observation.claim.casefold()
    raw = observation.aspect
    family = normalize_family(observation)
    if family == "craft_execution":
        if re.search(r"\b(?:broth|stock|soup|dashi|miso|ramen|出汁|スープ|味噌)\b", text):
            return "broth_quality"
        if re.search(r"\b(?:overcook|undercook|doneness|raw|火入れ)\w*\b", text):
            return "doneness"
        if re.search(r"\b(?:texture|crisp|soft|tender|chewy|moist|dry|食感)\w*\b", text):
            return "texture"
        if re.search(r"\b(?:charcoal|grill|焼き)\w*\b", text):
            return "grilling"
        if re.search(r"\b(?:fried|frying|deep-fried|揚げ)\w*\b", text):
            return "frying"
        if re.search(r"\b(?:temperature|温度)\w*\b", text):
            return "temperature"
        if re.search(r"\b(?:knife|切り付け|包丁)\w*\b", text):
            return "knife_work"
        if raw == "seasoning_balance":
            return "balance" if re.search(r"balanc|調和", text) else "seasoning"
        if raw == "technique":
            return "technique"
        if raw == "doneness_texture":
            return "texture"
        if raw == "broth_sauce":
            return "broth_quality"
        return "other_execution"
    if family == "ingredient_product":
        if re.search(r"\b(?:seafood|fish|shellfish|鮮魚|魚介)\w*\b", text):
            return "seafood_quality"
        if re.search(r"\b(?:meat|beef|pork|chicken|lamb|肉)\w*\b", text):
            return "meat_quality"
        if re.search(r"\b(?:produce|vegetable|fruit|野菜|果物)\w*\b", text):
            return "produce_quality"
        return {
            "ingredient_freshness": "freshness",
            "ingredient_sourcing": "sourcing",
            "handmade_components": "handmade_component_quality",
        }.get(raw, "ingredient_quality" if raw == "quality_concern" else "other_ingredient")
    if family == "food_reputation":
        return {
            "specialist_craft": "specialist_reputation",
            "signature_dish_reputation": "signature_dish",
            "food_editorial_recognition": "editorial_food_recognition",
            "repeated_food_praise": "repeated_food_praise",
        }.get(raw, "other_reputation")
    if re.search(r"fresh|stale|鮮度", text):
        return "recurring_freshness_issue" if observation.polarity == "negative" else "sustained_quality"
    return {
        "reliable_execution": "sustained_quality",
        "inconsistency": "visit_to_visit",
        "recurring_preparation_problem": "recurring_execution_issue",
        "quality_concern": "recurring_execution_issue",
    }.get(raw, "other_consistency")


def infer_specificity(observation: ChallengeObservation) -> Specificity:
    text = observation.claim.strip()
    if _GENERIC.match(text):
        return "low"
    technical_hits = len(_TECHNICAL.findall(text))
    if observation.directness == "direct" and len(text) >= 90 and technical_hits >= 2:
        return "high"
    if observation.directness == "direct" and (technical_hits or len(text) >= 70):
        return "moderate"
    return "low"


def _recency_factor(observation: ChallengeObservation, *, as_of_year: int) -> float:
    match = re.search(r"(?:19|20)\d{2}", observation.publication_or_observation_date or "")
    if not match:
        return 0.95
    age = max(0, as_of_year - int(match.group()))
    if normalize_family(observation) == "consistency":
        return 1.0 if age <= 5 else 0.9 if age <= 10 else 0.78
    return 1.0 if age <= 8 else 0.93 if age <= 15 else 0.85


@dataclass(frozen=True, slots=True)
class NormalizedQualityObservation:
    family: str
    normalized_aspect: str
    polarity: str
    strength: str
    specificity: str
    directness: str
    claim_text: str
    source_url: str
    source_type: str
    source_language: str
    publication_or_observation_date: str | None
    normalized_author_or_document_identity: str
    provenance_group: str
    independence_key: str
    included: bool
    exclusion_reason: str | None
    evidence_weight: float

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def normalize_observation(
    observation: ChallengeObservation, *, as_of_year: int = 2026
) -> NormalizedQualityObservation:
    author = observation.normalized_author_or_document_identity
    synthetic = bool(
        _SYNTHESIS.search(author)
        or _SYNTHESIS.search(observation.independent_source_key)
        or _SYNTHESIS.search(observation.provenance_group)
    )
    included = is_qualifying(observation) and not synthetic
    reason = None
    if not is_qualifying(observation):
        reason = "non_food_mixed_or_absence"
    elif synthetic:
        reason = "cross_source_synthesis_not_independent_evidence"
    specificity = infer_specificity(observation)
    independence_key = ":".join(
        (
            observation.provenance_group,
            author or observation.independent_source_key or _host(observation.source_url),
        )
    )
    weight = (
        _STRENGTH[observation.strength]
        * _SPECIFICITY[specificity]
        * _DIRECTNESS[observation.directness]
        * _SOURCE_CREDIBILITY[observation.source_type]
        * _recency_factor(observation, as_of_year=as_of_year)
    )
    return NormalizedQualityObservation(
        family=normalize_family(observation),
        normalized_aspect=normalize_aspect(observation),
        polarity=observation.polarity,
        strength=observation.strength,
        specificity=specificity,
        directness=observation.directness,
        claim_text=observation.claim,
        source_url=observation.source_url,
        source_type=observation.source_type,
        source_language=observation.source_language,
        publication_or_observation_date=observation.publication_or_observation_date,
        normalized_author_or_document_identity=author,
        provenance_group=observation.provenance_group,
        independence_key=independence_key,
        included=included,
        exclusion_reason=reason,
        evidence_weight=round(weight, 4) if included else 0.0,
    )


@dataclass(frozen=True, slots=True)
class ClaimCluster:
    family: str
    normalized_aspect: str
    polarity: str
    independent_sources: int
    average_evidence_weight: float
    corroboration_multiplier: float
    raw_value: float
    representative_claim: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class QualityCaseStrength:
    positive_quality_case_strength: float
    negative_quality_case_strength: float
    researched_quality_evidence_balance: float
    quality_adjustment: float
    independent_source_count: int
    qualifying_observation_count: int
    excluded_observation_count: int
    positive_family_count: int
    negative_family_count: int
    corroborated_positive_claim_count: int
    corroborated_negative_claim_count: int
    normalized_observations: tuple[NormalizedQualityObservation, ...]
    claim_clusters: tuple[ClaimCluster, ...]


def _clusters(
    observations: list[NormalizedQualityObservation], polarity: str
) -> list[ClaimCluster]:
    grouped: dict[tuple[str, str], dict[str, NormalizedQualityObservation]] = defaultdict(dict)
    for observation in observations:
        if not observation.included or observation.polarity != polarity:
            continue
        key = (observation.family, observation.normalized_aspect)
        current = grouped[key].get(observation.independence_key)
        if current is None or observation.evidence_weight > current.evidence_weight:
            grouped[key][observation.independence_key] = observation
    output: list[ClaimCluster] = []
    for (family, aspect), by_source in grouped.items():
        items = list(by_source.values())
        count = len(items)
        if polarity == "positive":
            corroboration = (0.55, 1.0, 1.25, 1.40)[min(count, 4) - 1]
            if count > 4:
                corroboration = min(1.55, 1.40 + 0.05 * (count - 4))
        else:
            corroboration = (0.08, 0.65, 1.60, 1.75)[min(count, 4) - 1]
            if count > 4:
                corroboration = min(1.95, 1.75 + 0.05 * (count - 4))
        average = sum(item.evidence_weight for item in items) / count
        representative = max(items, key=lambda item: item.evidence_weight).claim_text
        output.append(
            ClaimCluster(
                family=family,
                normalized_aspect=aspect,
                polarity=polarity,
                independent_sources=count,
                average_evidence_weight=round(average, 4),
                corroboration_multiplier=round(corroboration, 3),
                raw_value=round(average * corroboration, 4),
                representative_claim=representative,
            )
        )
    return sorted(output, key=lambda item: item.raw_value, reverse=True)


def _direction_strength(clusters: list[ClaimCluster], polarity: str) -> float:
    by_family: dict[str, list[float]] = defaultdict(list)
    for cluster in clusters:
        by_family[cluster.family].append(cluster.raw_value)
    raw = 0.0
    for values in by_family.values():
        ordered = sorted(values, reverse=True)
        raw += sum(
            value * (1.0 if index == 0 else 0.48 if index == 1 else 0.22)
            for index, value in enumerate(ordered)
        )
    if len(by_family) > 1:
        raw += 0.18 * (len(by_family) - 1)
    # Evidence units saturate into a 0-100 case strength.  Positive evidence is
    # slightly easier to assemble, while the separate negative corroboration
    # multipliers and activation threshold keep complaints more conservative.
    scale = 2.5 if polarity == "positive" else 2.3
    return round(100.0 * (1.0 - math.exp(-raw / scale)), 2)


def _evidence_balance(positive: float, negative: float) -> float:
    if positive == 0 and negative == 0:
        return 0.0
    # Intentional benefit of the doubt: positive evidence activates at 8/100;
    # negative evidence at 12/100.  Once activated, conflict suppresses the
    # dominant side nonlinearly so a genuinely mixed case stays near neutral.
    positive_active = max(0.0, positive - 8.0) / 92.0 * 100.0
    negative_active = max(0.0, negative - 12.0) / 88.0 * 100.0
    difference = positive_active - negative_active
    conflict = min(positive_active, negative_active)
    return round(difference * (1.0 - 0.55 * conflict / 100.0), 2)


_ADJUSTMENT_ANCHORS = (
    (0.0, 0.0),
    (5.0, 0.0),
    (10.0, 0.75),
    (20.0, 2.0),
    (35.0, 4.0),
    (50.0, 7.0),
    (65.0, 10.0),
    (80.0, 14.0),
    (100.0, 20.0),
)


def adjustment_from_balance(balance: float, *, hard_cap: float = 20.0) -> float:
    if hard_cap <= 0 or hard_cap > 20:
        raise ValueError("hard_cap must be in (0, 20]")
    magnitude = abs(balance)
    mapped = 0.0
    for (left_x, left_y), (right_x, right_y) in pairwise(_ADJUSTMENT_ANCHORS):
        if magnitude <= right_x:
            fraction = (magnitude - left_x) / (right_x - left_x)
            mapped = left_y + fraction * (right_y - left_y)
            break
    else:
        mapped = 20.0
    signed = mapped if balance >= 0 else -mapped
    return round(max(-hard_cap, min(hard_cap, signed)), 2)


def calculate_quality_case_strength(
    observations: Iterable[ChallengeObservation],
    *,
    hard_cap: float = 20.0,
    as_of_year: int = 2026,
) -> QualityCaseStrength:
    supplied = list(observations)
    normalized = tuple(normalize_observation(item, as_of_year=as_of_year) for item in supplied)
    positive_clusters = _clusters(list(normalized), "positive")
    negative_clusters = _clusters(list(normalized), "negative")
    positive = _direction_strength(positive_clusters, "positive")
    negative = _direction_strength(negative_clusters, "negative")
    balance = _evidence_balance(positive, negative)
    adjustment = adjustment_from_balance(balance, hard_cap=hard_cap)
    included = [item for item in normalized if item.included]
    all_clusters = tuple(positive_clusters + negative_clusters)
    return QualityCaseStrength(
        positive_quality_case_strength=positive,
        negative_quality_case_strength=negative,
        researched_quality_evidence_balance=balance,
        quality_adjustment=adjustment,
        independent_source_count=len({item.independence_key for item in included}),
        qualifying_observation_count=len(included),
        excluded_observation_count=len(normalized) - len(included),
        positive_family_count=len({item.family for item in included if item.polarity == "positive"}),
        negative_family_count=len({item.family for item in included if item.polarity == "negative"}),
        corroborated_positive_claim_count=sum(
            cluster.independent_sources >= 2 for cluster in positive_clusters
        ),
        corroborated_negative_claim_count=sum(
            cluster.independent_sources >= 2 for cluster in negative_clusters
        ),
        normalized_observations=normalized,
        claim_clusters=all_clusters,
    )
