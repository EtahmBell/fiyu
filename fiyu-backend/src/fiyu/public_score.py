from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Literal

from .utils import clamp

OfficialLanguage = Literal["ja", "mixed", "en", "unknown"]
TouristCoverage = Literal["low", "medium", "high", "unknown"]
ChainClassification = Literal[
    "independent_single",
    "small_group_distinct_concept",
    "small_same_brand_chain",
    "large_chain_or_franchise",
    "unknown",
]


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
    restaurant_group_affiliated: bool = False
    chain_classification: ChainClassification = "unknown"
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
    blocking_conflict: bool
    conflict_classification: str
    chain_classification: str = "unknown"
    chain_excluded: bool = False
    score_version: str = "public-v2-chain-classification"

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ConflictAssessment:
    conflicting_evidence: bool
    blocking_conflict: bool
    classification: str
    reasons: tuple[str, ...]
    explanation: str


@dataclass(frozen=True, slots=True)
class ChainAssessment:
    classification: ChainClassification
    group_affiliated: bool
    excluded: bool
    reasons: tuple[str, ...]


_GROUP_LANGUAGE = re.compile(
    r"\b(?:restaurant|hospitality|chef) group\b|\bparent company\b|"
    r"\bsister restaurants?\b|\bgroup affiliation\b|\bwider\b[^.]{0,40}\bgroup\b",
    re.IGNORECASE,
)
_DISTINCT_CONCEPT_LANGUAGE = re.compile(
    r"\bdistinct (?:restaurant )?(?:identity|concept|menu|brand)\b|"
    r"\b(?:\w+\s+){0,3}different(?:ly named)? (?:restaurants?|concepts?|menus?|brands?)\b|"
    r"\bmultiple distinct concepts?\b|\bunrelated restaurants?\b",
    re.IGNORECASE,
)
_SAME_BRAND_CHAIN_LANGUAGE = re.compile(
    r"\bsame[- ]brand\b|\brepeated (?:brand|concept|menu)\b|"
    r"\bsubstantially (?:identical|replicated) (?:locations?|concept|menu)\b|"
    r"\binterchangeable locations?\b|\bbranches? of (?:the )?same\b",
    re.IGNORECASE,
)
_LARGE_CHAIN_LANGUAGE = re.compile(
    r"\bfranchis(?:e|ed|ing)\b|\bnational chain\b|\bmass[- ]market chain\b|"
    r"\blarge standardized chain\b|\bstandardized multi[- ]location\b",
    re.IGNORECASE,
)
_INDEPENDENT_SINGLE_LANGUAGE = re.compile(
    r"\bindependent single(?: restaurant)?\b|\bsingle independent restaurant\b|"
    r"\bone independent restaurant\b|\bno multi[- ]venue affiliation\b",
    re.IGNORECASE,
)


def assess_chain_classification(
    evidence: FiyuEvidence,
    structured_research: Mapping[str, object] | None = None,
) -> ChainAssessment:
    """Classify chain behavior; ownership affiliation alone never proves a chain."""

    structured = structured_research or {}
    explicit = str(
        structured.get("chain_classification")
        or evidence.chain_classification
        or "unknown"
    ).casefold()
    allowed = {
        "independent_single",
        "small_group_distinct_concept",
        "small_same_brand_chain",
        "large_chain_or_franchise",
        "unknown",
    }
    group_affiliated = bool(
        structured.get("restaurant_group_affiliated")
        or evidence.restaurant_group_affiliated
    )
    evidence_parts = []
    for field in ("chain_evidence", "why_fiyu", "description_en"):
        value = structured.get(field)
        if isinstance(value, list):
            evidence_parts.extend(str(item) for item in value)
        elif value:
            evidence_parts.append(str(value))
    text = " ".join(evidence_parts)
    group_affiliated = group_affiliated or bool(_GROUP_LANGUAGE.search(text))

    if explicit in allowed and explicit != "unknown":
        classification = explicit
        reasons = ("explicit_structured_classification",)
    elif _LARGE_CHAIN_LANGUAGE.search(text):
        classification = "large_chain_or_franchise"
        reasons = ("explicit_franchise_or_large_standardized_chain_evidence",)
    elif _SAME_BRAND_CHAIN_LANGUAGE.search(text):
        classification = "small_same_brand_chain"
        reasons = ("explicit_repeated_same_brand_or_concept_evidence",)
    elif group_affiliated and _DISTINCT_CONCEPT_LANGUAGE.search(text):
        classification = "small_group_distinct_concept"
        reasons = ("group_affiliation_with_explicit_distinct_concept_evidence",)
    elif _INDEPENDENT_SINGLE_LANGUAGE.search(text):
        classification = "independent_single"
        reasons = ("explicit_single_independent_evidence",)
    elif group_affiliated:
        classification = "unknown"
        reasons = ("group_affiliation_alone_is_not_chain_evidence",)
    elif evidence.likely_chain:
        classification = "unknown"
        reasons = ("legacy_likely_chain_without_behavioral_evidence",)
    else:
        classification = "unknown"
        reasons = ("insufficient_chain_evidence",)

    excluded = classification in {
        "small_same_brand_chain",
        "large_chain_or_franchise",
    }
    return ChainAssessment(classification, group_affiliated, excluded, reasons)


_MATERIAL_CONFLICT = re.compile(
    r"\b(identity|wrong restaurant|separate business|branch|address|location|"
    r"permanently closed|closure|ceased trading|chain status|business type|category|"
    r"evidence integrity|fabricat(?:ed|ion)|source mismatch)\b|"
    r"別店舗|別の店|支店|住所|所在地|閉店|廃業|業態|証拠",
    re.IGNORECASE,
)
_OPERATIONAL_CONFLICT = re.compile(
    r"\b(holiday|opening hours?|business hours?|last[ -]?order|temporary closure|"
    r"reservation polic(?:y|ies)|menu availability|dish availability|pricing|price|"
    r"phone numbers?|telephone numbers?|navigation reference|access reference|"
    r"landmark reference|navigation address)\b|"
    r"定休日|営業時間|ラストオーダー|臨時休業|予約|メニュー|料理.*提供|価格|料金",
    re.IGNORECASE,
)
_CONFLICT_LANGUAGE = re.compile(
    r"\b(conflict|disagree(?:ment)?|differ(?:ence|ent|s)?)\b|"
    r"不一致|相違|矛盾|異なる",
    re.IGNORECASE,
)
_NON_ADDRESS_REFERENCE = re.compile(
    r"\b(?:navigation|access|landmark) reference\b|"
    r"\bneighbor(?:ing|ing-building)? building\b|\bbuilding next door\b|"
    r"\bnot (?:as |the )?(?:the )?restaurant(?:'s)? (?:own )?address\b|"
    r"隣のビル|ナビ(?:ゲーション)?(?:用|設定|住所)|目印",
    re.IGNORECASE,
)


def _is_non_address_candidate(value: object) -> bool:
    if not isinstance(value, Mapping):
        return False
    text = " ".join(str(value.get(field) or "") for field in ("summary", "address_raw"))
    return bool(_NON_ADDRESS_REFERENCE.search(text))


def _conflict_text(structured_research: Mapping[str, object] | None) -> str:
    if not structured_research:
        return ""
    address = structured_research.get("address_evidence")
    candidates: list[str] = []
    for field in ("warnings", "recommended_action", "research_summary"):
        if isinstance(address, Mapping) and address.get(field):
            value = address[field]
            candidates.extend(str(item) for item in value) if isinstance(
                value, list
            ) else candidates.append(str(value))
    for field in ("warnings", "conflict_explanation", "conflicting_fields"):
        if structured_research.get(field):
            value = structured_research[field]
            candidates.extend(str(item) for item in value) if isinstance(
                value, list
            ) else candidates.append(str(value))
    conflict_statements = [
        statement
        for candidate in candidates
        for statement in re.split(r"(?<=[.!?。！？])\s*", candidate)
        if statement and _CONFLICT_LANGUAGE.search(statement)
    ]
    return " ".join(conflict_statements)


def assess_publication_conflict(
    evidence: FiyuEvidence,
    structured_research: Mapping[str, object] | None = None,
) -> ConflictAssessment:
    """Conservatively classify a stored source disagreement for publication."""

    if not evidence.conflicting_evidence:
        return ConflictAssessment(False, False, "none", (), "")

    address = (
        structured_research.get("address_evidence")
        if isinstance(structured_research, Mapping)
        else None
    )
    reasons: list[str] = []
    if isinstance(address, Mapping):
        if address.get("identity_status") in {"ambiguous", "conflicting", "error"}:
            reasons.append("material_address_identity_status")
        if address.get("branch_name"):
            reasons.append("material_branch_ambiguity")
        conflicts = address.get("conflicting_address_candidates")
        if isinstance(conflicts, list) and any(
            not _is_non_address_candidate(candidate) for candidate in conflicts
        ):
            reasons.append("material_conflicting_address_candidates")
    if not evidence.matched_restaurant:
        reasons.append("material_unmatched_identity")
    if reasons:
        return ConflictAssessment(True, True, "material", tuple(reasons), _conflict_text(structured_research))

    explanation = _conflict_text(structured_research)
    if not explanation or not _CONFLICT_LANGUAGE.search(explanation):
        return ConflictAssessment(
            True, True, "unknown", ("unclassified_conflict_defaults_blocking",), explanation
        )

    # Explicit negations prevent phrases such as "not an address conflict" from
    # turning an otherwise operational disagreement into a material one.
    material_text = re.sub(
        r"\bnot (?:an? )?(?:address|location|identity|branch) conflict\b",
        "",
        explanation,
        flags=re.IGNORECASE,
    )
    material_text = re.sub(
        r"\b(?:does not|doesn't|did not|didn't) (?:alter|change|affect) "
        r"(?:the )?(?:address|location|identity|branch)(?: match)?\b",
        "",
        material_text,
        flags=re.IGNORECASE,
    )
    material_text = re.sub(
        r"[^.!?]*(?:navigation|access|landmark|neighboring-building)[^.!?]*[.!?]?",
        "",
        material_text,
        flags=re.IGNORECASE,
    )
    material = bool(_MATERIAL_CONFLICT.search(material_text))
    operational = bool(_OPERATIONAL_CONFLICT.search(explanation))
    if material:
        return ConflictAssessment(
            True, True, "material", ("material_conflict_explanation",), explanation
        )
    if operational:
        return ConflictAssessment(
            True, False, "non_material_operational",
            ("explicitly_operational_conflict_only",), explanation,
        )
    return ConflictAssessment(
        True, True, "unknown", ("unclassified_conflict_defaults_blocking",), explanation
    )


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
    *,
    conflict_assessment: ConflictAssessment | None = None,
    chain_assessment: ChainAssessment | None = None,
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

    chain = chain_assessment or assess_chain_classification(evidence)
    chain_independence = {
        "independent_single": 100.0,
        "small_group_distinct_concept": 75.0,
        "small_same_brand_chain": 20.0,
        "large_chain_or_franchise": 0.0,
        "unknown": 70.0,
    }[chain.classification]
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
    if chain.excluded:
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

    conflict = conflict_assessment or assess_publication_conflict(evidence)
    publishable = (
        evidence.matched_restaurant
        and evidence.identity_confidence >= 0.80
        and evidence.total_evidence_sources >= 2
        and not conflict.blocking_conflict
        and not chain.excluded
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
        blocking_conflict=conflict.blocking_conflict,
        conflict_classification=conflict.classification,
        chain_classification=chain.classification,
        chain_excluded=chain.excluded,
    )
