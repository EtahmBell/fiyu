"""Offline-only helpers for the Fiyu public-score v4 experiment.

Nothing in the production scoring or publication path imports this module.  It
deliberately consumes stored structured evidence and returns plain values so an
analysis script can evaluate counterfactuals without mutating the catalog.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from urllib.parse import urlparse

from .public_score import (
    FiyuEvidence,
    FiyuScoreResult,
    InternalSignals,
    evaluate_fiyu_candidate,
)
from .utils import clamp


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def _level(value: object, *, low: float, medium: float, high: float) -> float | None:
    return {
        "low": low,
        "medium": medium,
        "mixed": medium,
        "high": high,
    }.get(str(value or "unknown").casefold())


def _weighted_known(
    parts: Iterable[tuple[float, float | None]],
) -> float | None:
    known = [(weight, value) for weight, value in parts if value is not None]
    denominator = sum(weight for weight, _ in known)
    if not denominator:
        return None
    return _clamp(sum(weight * float(value) for weight, value in known) / denominator)


_FOOD = re.compile(
    r"\b(?:food|cook(?:ing|ed)?|dish(?:es)?|ingredient(?:s)?|broth|stock|sauce|"
    r"noodles?|ramen|soba|udon|sushi|sashimi|tempura|yakitori|grill(?:ed|ing)?|"
    r"meat|beef|pork|chicken|duck|fish|seafood|vegetable(?:s)?|rice|curry|naan|"
    r"pizza|pasta|bread|pastr(?:y|ies)|dessert(?:s)?|coffee|tea|cocktail(?:s)?|"
    r"wine|sake|tofu|dumplings?|gyoza|tonkatsu|unagi|eel|kaiseki|omakase|"
    r"izakaya|bistro|cuisine|menu|flavou?r|texture|prepar(?:e|ed|ation))\b",
    re.IGNORECASE,
)
_PRAISE = re.compile(
    r"\b(?:careful(?:ly)?|expert(?:ly)?|excellent|exceptional|outstanding|"
    r"standout|notable|praised|acclaimed|celebrated|fresh(?:ly)?|flavou?rful|"
    r"rich|delicate|crisp|tender|refined|well[- ](?:made|prepared|executed)|"
    r"high[- ]quality|quality ingredients?|precision|balanced|deeply savoury|"
    r"developed sauces?)\b",
    re.IGNORECASE,
)
_CRAFT = re.compile(
    r"\b(?:craft|artisan(?:al)?|handmade|house[- ]made|traditional technique|"
    r"wood[- ]fired|charcoal[- ]grill(?:ed|ing)|aged|fermented|speciali[sz](?:e|es|ed|t)|"
    r"chef[- ]driven|meticulous|precision)\b",
    re.IGNORECASE,
)
_SIGNATURE = re.compile(
    r"\b(?:signature|standout|renowned|known for|noted for|recurring (?:lunch )?"
    r"highlight|specialty|speciality|defining (?:dish|menu|food)|destination for)\b",
    re.IGNORECASE,
)
_RECOGNITION = re.compile(
    r"\b(?:michelin|bib gourmand|award(?:ed|[- ]winning)?|guide[- ]listed|"
    r"critic(?:al)? acclaim|local favourite|local favorite|editorial recognition|"
    r"food publication)\b",
    re.IGNORECASE,
)
_CONSISTENCY = re.compile(
    r"\b(?:consistent(?:ly| quality)?|long[- ]running|decades?|since (?:19|20)\d\d|"
    r"repeat (?:local )?(?:patronage|customers?)|sustained reputation)\b",
    re.IGNORECASE,
)
_QUALITY_CONCERN = re.compile(
    r"\b(?:stale|bland|poor(?:ly)?|disappoint(?:ing|ed)|overcooked|undercooked|"
    r"low[- ]quality|weak food|mediocre food|lack(?:s|ing) freshness|"
    r"quality concerns?)\b",
    re.IGNORECASE,
)
_INCONSISTENCY = re.compile(
    r"\b(?:inconsisten(?:t|cy)|uneven (?:food|cooking|execution|quality)|"
    r"variable (?:food|cooking|execution|quality)|hit[- ]or[- ]miss)\b",
    re.IGNORECASE,
)
_HYPE_WEAKNESS = re.compile(
    r"\b(?:hype|experience|atmosphere|instagram|popularity)\b[^.]{0,60}"
    r"\b(?:stronger|better|outweighs?)\b[^.]{0,50}\b(?:food|cooking)\b|"
    r"\b(?:food|cooking)\b[^.]{0,50}\b(?:weaker than|does not match)\b[^.]{0,60}"
    r"\b(?:hype|experience|atmosphere|popularity)\b",
    re.IGNORECASE,
)


def source_family(url: str) -> str:
    """Return a conservative host family for source-corroboration checks."""

    host = (urlparse(url).hostname or "").casefold().removeprefix("www.")
    labels = host.split(".")
    if len(labels) <= 2:
        return host
    suffix = ".".join(labels[-2:])
    if suffix in {"co.jp", "ne.jp", "or.jp", "go.jp", "ac.jp"}:
        return ".".join(labels[-3:])
    return suffix


@dataclass(frozen=True, slots=True)
class ResearchedQualityEvidence:
    raw_adjustment: float
    positive_evidence: tuple[str, ...]
    negative_evidence: tuple[str, ...]
    unknown_fields: tuple[str, ...]
    qualifying_theme_count: int
    independent_source_families: tuple[str, ...]

    def capped_adjustment(self, cap: float) -> float:
        if cap <= 0:
            raise ValueError("cap must be positive")
        return max(-cap, min(cap, self.raw_adjustment))


def assess_researched_quality(
    review_themes: Sequence[Mapping[str, object]],
) -> ResearchedQualityEvidence:
    """Score only food-specific claims corroborated by independent source hosts.

    The current card schema guarantees distinct URLs, not distinct publishers.
    This additional host-family check avoids treating two pages on the same review
    platform as independent corroboration.
    """

    qualifying: list[tuple[str, set[str]]] = []
    duplicate_only = 0
    for theme in review_themes:
        text = " ".join(str(theme.get("theme") or "").split())
        urls = [str(url) for url in theme.get("source_urls", []) if str(url).strip()]
        families = {family for url in urls if (family := source_family(url))}
        confidence = float(theme.get("confidence") or 0.0)
        if len(families) < 2:
            duplicate_only += 1
            continue
        if confidence < 0.70 or not _FOOD.search(text):
            continue
        qualifying.append((text, families))

    execution = [(text, hosts) for text, hosts in qualifying if _PRAISE.search(text)]
    craft = [(text, hosts) for text, hosts in qualifying if _CRAFT.search(text)]
    signature = [(text, hosts) for text, hosts in qualifying if _SIGNATURE.search(text)]
    recognition = [(text, hosts) for text, hosts in qualifying if _RECOGNITION.search(text)]
    consistency = [(text, hosts) for text, hosts in qualifying if _CONSISTENCY.search(text)]
    concerns = [(text, hosts) for text, hosts in qualifying if _QUALITY_CONCERN.search(text)]
    inconsistency = [(text, hosts) for text, hosts in qualifying if _INCONSISTENCY.search(text)]
    hype = [(text, hosts) for text, hosts in qualifying if _HYPE_WEAKNESS.search(text)]

    raw = 0.0
    positive: list[str] = []
    negative: list[str] = []
    if execution:
        points = 3.0 if len(execution) >= 2 else 1.5
        raw += points
        positive.append(f"food/execution praise +{points:g}: {execution[0][0]}")
    if craft:
        raw += 2.0
        positive.append(f"specialist/craft evidence +2: {craft[0][0]}")
    if signature:
        raw += 2.0
        positive.append(f"signature-dish reputation +2: {signature[0][0]}")
    if recognition:
        raw += 2.0
        positive.append(f"food-specific recognition +2: {recognition[0][0]}")
    if consistency:
        raw += 1.0
        positive.append(f"consistency/longevity +1: {consistency[0][0]}")
    if concerns:
        points = -4.0 if len(concerns) >= 2 else -2.0
        raw += points
        negative.append(f"food-quality concern {points:g}: {concerns[0][0]}")
    if inconsistency:
        raw -= 2.0
        negative.append(f"material inconsistency -2: {inconsistency[0][0]}")
    if hype:
        raw -= 2.0
        negative.append(f"food weaker than hype/experience -2: {hype[0][0]}")

    unknown: list[str] = []
    if not review_themes:
        unknown.append("quality_review_themes_unavailable")
    elif not qualifying:
        unknown.append("no_independently_corroborated_food_quality_theme")
    if duplicate_only:
        unknown.append(f"same_source_family_themes_excluded:{duplicate_only}")
    # The current ReviewTheme schema cannot encode a negative sentiment, so a
    # zero negative adjustment is not evidence that no concerns exist.
    unknown.append("negative_quality_evidence_not_structurally_captured")

    families = sorted({host for _, hosts in qualifying for host in hosts})
    return ResearchedQualityEvidence(
        raw_adjustment=raw,
        positive_evidence=tuple(positive),
        negative_evidence=tuple(negative),
        unknown_fields=tuple(unknown),
        qualifying_theme_count=len(qualifying),
        independent_source_families=tuple(families),
    )


@dataclass(frozen=True, slots=True)
class NeutralComponentResult:
    hiddenness: float
    independence: float
    local_discovery: float
    unknown_fields: tuple[str, ...]


def calculate_neutral_components(
    *,
    evidence: Mapping[str, object],
    underexposure_score: float,
    digital_footprint_score: float,
    chain_classification: str,
) -> NeutralComponentResult:
    """Recalculate v3 non-Quality components with null + renormalization.

    Required count/boolean research fields remain observed values.  Explicit
    ``unknown`` enums and ``specialist_restaurant=False`` are omitted because the
    current schema cannot distinguish a negative finding from absence of proof.
    """

    unknown: list[str] = []
    tourist_coverage = str(evidence.get("tourist_coverage") or "unknown").casefold()
    tourist_hiddenness = {
        "low": 100.0,
        "medium": 55.0,
        "high": 10.0,
    }.get(tourist_coverage)
    if tourist_hiddenness is None:
        unknown.append("tourist_coverage")

    reservations = int(evidence.get("reservation_platform_count") or 0)
    official_website = bool(evidence.get("official_website_found"))
    social_profiles = int(evidence.get("social_profile_count") or 0)
    reservation_scarcity = _clamp(100.0 - 30.0 * reservations)
    website_scarcity = 20.0 if official_website else 100.0
    social_scarcity = _clamp(100.0 - 25.0 * social_profiles)
    digital_scarcity = _clamp(
        0.60 * digital_footprint_score + 0.25 * website_scarcity + 0.15 * social_scarcity
    )
    hiddenness = _weighted_known(
        (
            (0.40, _clamp(underexposure_score)),
            (0.25, tourist_hiddenness),
            (0.15, reservation_scarcity),
            (0.20, digital_scarcity),
        )
    )
    assert hiddenness is not None

    chain_value = {
        "independent_single": 100.0,
        "small_group_distinct_concept": 75.0,
        "small_same_brand_chain": 20.0,
        "large_chain_or_franchise": 0.0,
    }.get(chain_classification)
    if chain_value is None:
        unknown.append("chain_classification")
    locations = max(1, int(evidence.get("known_location_count") or 1))
    location_value = (
        100.0
        if locations <= 1
        else 80.0
        if locations == 2
        else 60.0
        if locations == 3
        else 40.0
        if locations == 4
        else 10.0
    )
    specialist = evidence.get("specialist_restaurant") is True
    if not specialist:
        unknown.append("specialist_restaurant")
    independence = _weighted_known(
        (
            (0.70, chain_value),
            (0.20, location_value),
            (0.10, 100.0 if specialist else None),
        )
    )
    assert independence is not None

    japanese_sources = int(evidence.get("japanese_source_count") or 0)
    english_sources = int(evidence.get("english_tourist_source_count") or 0)
    source_share = (japanese_sources + 1) / (japanese_sources + english_sources + 2) * 100.0
    review_share_value = evidence.get("japanese_review_share")
    review_share = (
        float(review_share_value) * 100.0 if isinstance(review_share_value, (int, float)) else 50.0
    )
    explicit_local = _level(evidence.get("local_audience"), low=20.0, medium=60.0, high=100.0)
    local_audience = (
        None
        if explicit_local is None
        else _clamp(0.70 * explicit_local + 0.15 * source_share + 0.15 * review_share)
    )
    if local_audience is None:
        unknown.append("local_audience")

    tourist_orientation = str(evidence.get("tourist_orientation") or "unknown").casefold()
    tourist_signals = evidence.get("tourist_signals")
    tourist_obscurity = None
    if tourist_orientation != "unknown" and isinstance(tourist_signals, list) and tourist_signals:
        tourist_obscurity = _level(tourist_orientation, low=95.0, medium=50.0, high=5.0)
    elif tourist_coverage != "unknown":
        tourist_obscurity = _level(tourist_coverage, low=95.0, medium=50.0, high=5.0)
    if tourist_obscurity is None:
        unknown.append("tourist_orientation")
    international_visibility = _level(
        evidence.get("international_visibility"),
        low=95.0,
        medium=50.0,
        high=5.0,
    )
    if international_visibility is None:
        unknown.append("international_visibility")
    english_scarcity = _clamp(100.0 - 22.0 * english_sources)
    international_obscurity = _weighted_known(
        (
            (0.60, tourist_obscurity),
            (0.25, international_visibility),
            (0.15, english_scarcity),
        )
    )
    assert international_obscurity is not None

    web_website = 25.0 if official_website else 90.0
    web_reservation = _clamp(100.0 - 25.0 * reservations)
    web_social = _clamp(100.0 - 20.0 * social_profiles)
    corporate_scarcity = _level(
        evidence.get("corporate_visibility"), low=95.0, medium=50.0, high=5.0
    )
    if corporate_scarcity is None:
        unknown.append("corporate_visibility")
    web_scarcity = _weighted_known(
        (
            (0.50, _clamp(digital_footprint_score)),
            (0.20, web_website),
            (0.15, web_reservation),
            (0.10, web_social),
            (0.05, corporate_scarcity),
        )
    )
    assert web_scarcity is not None
    discovery_independence = {
        "independent_single": 100.0,
        "small_group_distinct_concept": 82.0,
        "small_same_brand_chain": 20.0,
        "large_chain_or_franchise": 0.0,
    }.get(chain_classification)
    distinctiveness = 85.0 if specialist else None
    local_discovery = _weighted_known(
        (
            (0.25, _clamp(underexposure_score)),
            (0.15, web_scarcity),
            (0.15, international_obscurity),
            (0.15, local_audience),
            (0.20, discovery_independence),
            (0.10, distinctiveness),
        )
    )
    assert local_discovery is not None
    return NeutralComponentResult(
        hiddenness=round(hiddenness, 2),
        independence=round(independence, 2),
        local_discovery=round(local_discovery, 2),
        unknown_fields=tuple(dict.fromkeys(unknown)),
    )


def experimental_score(
    *,
    quality: float,
    hiddenness: float,
    independence: float,
    local_discovery: float,
    quality_weight: float = 0.45,
    local_discovery_weight: float = 0.25,
) -> float:
    weights = (quality_weight, 0.15, 0.15, local_discovery_weight)
    if abs(sum(weights) - 1.0) > 1e-9:
        raise ValueError("experimental top-level weights must sum to 1")
    return round(
        _clamp(
            quality_weight * quality
            + 0.15 * hiddenness
            + 0.15 * independence
            + local_discovery_weight * local_discovery
        ),
        2,
    )


def evaluate_with_quality_adjustment(
    evidence: FiyuEvidence,
    internal: InternalSignals,
    structured_research: Mapping[str, object] | None = None,
    *,
    primary_category: str | None = None,
    quality_adjustment: float = 0.0,
) -> FiyuScoreResult:
    """Run production v3 with only its Quality input experimentally changed."""

    adjusted = replace(
        internal,
        quality_score=clamp(internal.quality_score + quality_adjustment),
    )
    return evaluate_fiyu_candidate(
        evidence,
        adjusted,
        structured_research,
        primary_category=primary_category,
    )
