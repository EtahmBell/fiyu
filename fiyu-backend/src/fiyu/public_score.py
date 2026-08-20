from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from dataclasses import field as dataclass_field
from typing import Literal

from .address_identity import address_candidate_identity_relevant
from .local_discovery import (
    LocalDiscoveryInputs,
    LocalDiscoveryResult,
    ProductEligibility,
    assess_product_eligibility,
    calculate_local_discovery,
)
from .utils import clamp

SCORE_VERSION = "public-v3-local-discovery"
PUBLICATION_SCORE_THRESHOLD = 75.0
FIYU_SCORE_WEIGHTS = {
    "quality": 0.45,
    "hiddenness": 0.15,
    "independence": 0.15,
    "local_discovery": 0.25,
}
HIDDENNESS_WEIGHTS = {
    "underexposure": 0.40,
    "tourist_hiddenness": 0.25,
    "reservation_scarcity": 0.15,
    "digital_scarcity": 0.20,
}

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
    local_audience: Literal["low", "mixed", "high", "unknown"] = "unknown"
    local_audience_signals: list[str] = dataclass_field(default_factory=list)
    tourist_orientation: Literal["low", "mixed", "high", "unknown"] = "unknown"
    tourist_signals: list[str] = dataclass_field(default_factory=list)
    international_visibility: Literal["low", "medium", "high", "unknown"] = "unknown"
    corporate_visibility: Literal["low", "medium", "high", "unknown"] = "unknown"
    venue_format: Literal[
        "fixed_venue",
        "catering_mobile",
        "entertainment_first",
        "service_only",
        "non_dining_service",
        "unknown",
    ] = "unknown"
    food_drink_primary: bool | None = None

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
    local_discovery_score: float
    local_discovery_classification: str
    local_discovery_components: dict[str, float]
    local_discovery_contribution: float
    tourist_visibility_classification: str
    tourist_orientation: str
    tourist_orientation_basis: str
    product_eligible: bool
    product_eligibility_classification: str
    product_eligibility_reasons: tuple[str, ...]
    fiyu_score: float
    fiyu_confidence: float
    confidence_band: str
    score_band: str
    publishable: bool
    blocking_conflict: bool
    conflict_classification: str
    chain_classification: str = "unknown"
    chain_excluded: bool = False
    score_version: str = SCORE_VERSION

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
_CHAIN_EVIDENCE_NEGATION = re.compile(
    r"\b(?:no|without) (?:reliable |sufficient )?evidence\b|"
    r"\b(?:does|do|did) not (?:establish|show|provide|identify|demonstrate)\b|"
    r"\binsufficient evidence\b|\bnot enough evidence\b",
    re.IGNORECASE,
)


def _positive_chain_evidence(text: str) -> str:
    """Exclude explicitly negative/insufficient claims from chain corroboration."""

    return " ".join(
        sentence
        for sentence in re.split(r"(?<=[.!?])\s+", text)
        if sentence and not _CHAIN_EVIDENCE_NEGATION.search(sentence)
    )


def assess_chain_classification(
    evidence: FiyuEvidence,
    structured_research: Mapping[str, object] | None = None,
) -> ChainAssessment:
    """Classify chain behavior; ownership affiliation alone never proves a chain."""

    structured = structured_research or {}
    structured_explicit = structured.get("chain_classification")
    explicit = str(
        structured_explicit or evidence.chain_classification or "unknown"
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
    positive_text = _positive_chain_evidence(text)
    group_affiliated = group_affiliated or bool(_GROUP_LANGUAGE.search(text))

    explicit_chain_supported = (
        explicit == "small_same_brand_chain"
        and bool(_SAME_BRAND_CHAIN_LANGUAGE.search(positive_text))
    ) or (
        explicit == "large_chain_or_franchise"
        and bool(_LARGE_CHAIN_LANGUAGE.search(positive_text))
    )
    if (
        structured_explicit
        and explicit in {"small_same_brand_chain", "large_chain_or_franchise"}
        and not explicit_chain_supported
    ):
        classification = "unknown"
        reasons = ("excluded_chain_classification_lacks_behavioral_corroboration",)
    elif explicit in allowed and explicit != "unknown":
        classification = explicit
        reasons = ("explicit_structured_classification",)
    elif _LARGE_CHAIN_LANGUAGE.search(positive_text):
        classification = "large_chain_or_franchise"
        reasons = ("explicit_franchise_or_large_standardized_chain_evidence",)
    elif _SAME_BRAND_CHAIN_LANGUAGE.search(positive_text):
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
    r"\b(conflict(?:s|ed|ing)?|disagree(?:ment)?|differ(?:ence|ent|s)?)\b|"
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

_UNSUPPORTED_CANDIDATE_HINT = re.compile(
    r"\b(?:google[- ]derived|candidate|supplied) (?:address )?hint\b.*"
    r"\b(?:untrusted|unsupported|not independent|no qualifying|no independent)\b|"
    r"\b(?:untrusted|unsupported|not independent|no qualifying|no independent)\b.*"
    r"\b(?:google[- ]derived|candidate|supplied) (?:address )?hint\b",
    re.IGNORECASE,
)
_FIXED_VENUE_IDENTITY_RISK = re.compile(
    r"\bmobile (?:service|business|operation)\b|"
    r"\bcustomer[- ]selected venues?\b|\bnot (?:a )?fixed (?:restaurant|venue)\b|"
    r"\bmapped service label\b|\bnot necessarily the location\b",
    re.IGNORECASE,
)
_PROTECTED_MATERIAL_RISK = re.compile(
    r"\bpermanently closed\b|\bclosure\b|\bceased trading\b|"
    r"\bevidence integrity\b|\bfabricat(?:ed|ion)\b|\bsource mismatch\b|"
    r"\b(?:business type|category|chain status)\b[^.]{0,80}"
    r"\b(?:conflict(?:s|ed|ing)?|disagree(?:ment)?|mismatch|ambiguous|unresolved)\b|"
    r"\b(?:conflict(?:s|ed|ing)?|disagree(?:ment)?|mismatch|ambiguous|unresolved)\b"
    r"[^.]{0,80}\b(?:business type|category|chain status)\b",
    re.IGNORECASE,
)
_NEGATED_CLOSURE_RISK = re.compile(
    r"\bno\b[^.]{0,160}\b(?:closure|closed|ceased trading)\b"
    r"[^.]{0,160}\b(?:found|identified|reported|known|evidenced)\b|"
    r"\bno (?:evidence|indication|record|report) of (?:a )?"
    r"(?:closure|being (?:permanently )?closed|ceased trading)\b",
    re.IGNORECASE,
)
_NEGATED_CONFLICT_FINDING = re.compile(
    r"\bno\b[^.!?]{0,200}\b(?:conflict(?:s|ed|ing)?|disagree(?:ment)?|"
    r"mismatch|ambiguity)\b[^.!?]{0,120}\b"
    r"(?:found|identified|reported|known|evidenced)\b[.!?]?",
    re.IGNORECASE,
)
_UNRESOLVED_BRANCH = re.compile(
    r"\bunresolved (?:candidate |restaurant )?(?:branch|location)\b|"
    r"\bmultiple plausible (?:same[- ]brand )?branches\b|"
    r"\bwhich branch\b|\bbranch (?:identity|mapping) (?:is |remains )?"
    r"(?:ambiguous|conflicting|unresolved)\b",
    re.IGNORECASE,
)


def _is_non_address_candidate(value: object) -> bool:
    if not isinstance(value, Mapping):
        return False
    text = " ".join(str(value.get(field) or "") for field in ("summary", "address_raw"))
    return bool(_NON_ADDRESS_REFERENCE.search(text))


def _is_historical_candidate(value: object) -> bool:
    return isinstance(value, Mapping) and str(
        value.get("address_temporality") or ""
    ).casefold() in {"historical", "future"}


def _is_unsupported_candidate_hint(value: object) -> bool:
    if not isinstance(value, Mapping):
        return False
    if value.get("source_urls"):
        return False
    text = " ".join(
        str(value.get(field) or "") for field in ("summary", "address_raw")
    )
    return bool(_UNSUPPORTED_CANDIDATE_HINT.search(text))


def _component_agreement(address: Mapping[str, object]) -> Mapping[str, object]:
    value = address.get("component_agreement") or address.get(
        "component_agreement_json"
    )
    return value if isinstance(value, Mapping) else {}


def _branch_is_ambiguous(address: Mapping[str, object], conflict_text: str) -> bool:
    branch = str(address.get("branch_name") or "").strip()
    if not branch:
        return False
    if str(address.get("identity_status") or "").casefold() in {
        "ambiguous", "conflicting", "error"
    }:
        return True
    return bool(_UNRESOLVED_BRANCH.search(conflict_text))


def _has_protected_material_risk(text: str) -> bool:
    """Ignore explicit negative findings while preserving real protected risks."""

    return bool(_PROTECTED_MATERIAL_RISK.search(_NEGATED_CLOSURE_RISK.sub("", text)))


def _address_component_key(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = text.translate({ord(character): "-" for character in "‐‑‒–—―ー－−"})
    return re.sub(r"[\s,、]", "", text)


def _address_candidate_materially_competes(
    primary: Mapping[str, object], candidate: Mapping[str, object]
) -> bool:
    """Treat an alternate as competing only when comparable core fields differ."""

    comparable = False
    for field in ("municipality_or_ward", "neighborhood", "street_or_block"):
        first = _address_component_key(primary.get(field))
        second = _address_component_key(candidate.get(field))
        if first and second:
            comparable = True
            if first != second:
                return True
    return not comparable


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
    explanation = _conflict_text(structured_research)
    all_context = " ".join(
        [
            explanation,
            str(
                structured_research.get("prior_material_conflict_context") or ""
            )
            if isinstance(structured_research, Mapping)
            else "",
            *(
                str(item)
                for field in ("warnings", "recommended_action", "research_summary")
                for item in (
                    address.get(field, [])
                    if isinstance(address, Mapping)
                    and isinstance(address.get(field), list)
                    else [address.get(field)]
                    if isinstance(address, Mapping) and address.get(field)
                    else []
                )
            ),
        ]
    )
    protected = _has_protected_material_risk(all_context)
    fixed_venue_risk = bool(_FIXED_VENUE_IDENTITY_RISK.search(all_context))
    reasons: list[str] = []
    if isinstance(address, Mapping):
        if address.get("identity_status") in {"ambiguous", "conflicting", "error"}:
            reasons.append("material_address_identity_status")
        if _branch_is_ambiguous(address, all_context):
            reasons.append("material_branch_ambiguity")
        conflicts = address.get("conflicting_address_candidates")
    if not evidence.matched_restaurant:
        reasons.append("material_unmatched_identity")
    if protected:
        reasons.append("material_protected_conflict")
    if fixed_venue_risk:
        reasons.append("material_fixed_venue_identity_ambiguity")
    if reasons:
        return ConflictAssessment(True, True, "material", tuple(reasons), explanation)

    conflicts = address.get("conflicting_address_candidates") if isinstance(address, Mapping) else None
    active_conflicts = [
        candidate
        for candidate in conflicts or []
        if isinstance(candidate, Mapping)
        and not _is_historical_candidate(candidate)
        and not _is_unsupported_candidate_hint(candidate)
        and address_candidate_identity_relevant(candidate)
        and not _is_non_address_candidate(candidate)
    ]
    agreement = _component_agreement(address) if isinstance(address, Mapping) else {}
    structurally_equivalent = agreement.get("material_conflicting_components") == []
    identity_confirmed = (
        evidence.matched_restaurant
        and evidence.identity_confidence >= 0.80
        and str(address.get("identity_status") or "").casefold()
        in {"confirmed", "matched", "verified", "probable"}
        if isinstance(address, Mapping)
        else False
    )
    if isinstance(conflicts, list) and conflicts and (
        not active_conflicts
        or all(
            not _address_candidate_materially_competes(address, candidate)
            for candidate in active_conflicts
        )
        or structurally_equivalent
        or identity_confirmed
    ):
        classification = (
            "non_material_identity_irrelevant_address"
            if not active_conflicts
            or all(
                not _address_candidate_materially_competes(address, candidate)
                for candidate in active_conflicts
            )
            else "non_material_address_uncertainty"
        )
        return ConflictAssessment(
            True,
            False,
            classification,
            ("address_uncertainty_or_irrelevant_alternate_is_nonblocking",),
            explanation,
        )

    meaningful_explanation = _NEGATED_CONFLICT_FINDING.sub("", explanation)
    if not meaningful_explanation or not _CONFLICT_LANGUAGE.search(
        meaningful_explanation
    ):
        return ConflictAssessment(
            True,
            False,
            "non_material_unexplained_legacy_flag",
            ("no_current_material_conflict_identified",),
            explanation,
        )

    # Explicit negations prevent phrases such as "not an address conflict" from
    # turning an otherwise operational disagreement into a material one.
    material_text = re.sub(
        r"\bnot (?:an? )?(?:address|location|identity|branch) conflict\b",
        "",
        meaningful_explanation,
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
    operational = bool(_OPERATIONAL_CONFLICT.search(meaningful_explanation))
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
    local_discovery: LocalDiscoveryResult | None = None,
    product_eligibility: ProductEligibility | None = None,
) -> FiyuScoreResult:
    """Calculate a reproducible provisional public Fiyu score.

    Public v3 weights:
      - 45% candidate quality
      - 15% hiddenness / underexposure
      - 15% independence / distinctiveness
      - 25% Local Discovery

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
        HIDDENNESS_WEIGHTS["underexposure"] * internal.underexposure_score
        + HIDDENNESS_WEIGHTS["tourist_hiddenness"]
        * _tourist_hiddenness_score(evidence.tourist_coverage)
        + HIDDENNESS_WEIGHTS["reservation_scarcity"] * reservation_scarcity
        + HIDDENNESS_WEIGHTS["digital_scarcity"] * digital_scarcity
    )

    # Candidate rating/review evidence owns quality. Sparse public-web enrichment
    # lowers confidence, not the candidate's intrinsic recommendation value.
    quality_signal = clamp(internal.quality_score)

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

    discovery = local_discovery or calculate_local_discovery(
        LocalDiscoveryInputs(
            underexposure_score=internal.underexposure_score,
            digital_footprint_score=internal.digital_footprint_score,
            japanese_source_count=evidence.japanese_source_count,
            english_tourist_source_count=evidence.english_tourist_source_count,
            japanese_review_share=evidence.japanese_review_share,
            tourist_coverage=evidence.tourist_coverage,
            reservation_platform_count=evidence.reservation_platform_count,
            official_website_found=evidence.official_website_found,
            social_profile_count=evidence.social_profile_count,
            chain_classification=chain.classification,
            specialist_restaurant=evidence.specialist_restaurant,
            local_audience=evidence.local_audience,
            international_visibility=evidence.international_visibility,
            corporate_visibility=evidence.corporate_visibility,
            tourist_orientation=evidence.tourist_orientation,
            tourist_signals=tuple(evidence.tourist_signals),
            local_audience_signals=tuple(evidence.local_audience_signals),
        )
    )
    product = product_eligibility or assess_product_eligibility(
        primary_category=None,
        venue_format=evidence.venue_format,
        food_drink_primary=evidence.food_drink_primary,
        structured_research=None,
    )

    fiyu_score = clamp(
        FIYU_SCORE_WEIGHTS["quality"] * quality_signal
        + FIYU_SCORE_WEIGHTS["hiddenness"] * hiddenness_signal
        + FIYU_SCORE_WEIGHTS["independence"] * independence_signal
        + FIYU_SCORE_WEIGHTS["local_discovery"] * discovery.score
    )

    # A known chain should not receive a strong hidden-gem score.
    if chain.excluded:
        fiyu_score = min(fiyu_score, 54.99)
    if not product.eligible:
        fiyu_score = min(fiyu_score, 49.99)

    source_coverage = clamp(evidence.total_evidence_sources / 5.0 * 100.0)
    review_evidence = 100.0 if evidence.japanese_review_share is not None else 25.0
    consistency = 0.0 if evidence.conflicting_evidence else 100.0
    fiyu_confidence = clamp(
        0.40 * evidence.identity_confidence * 100.0
        + 0.30 * source_coverage
        + 0.15 * review_evidence
        + 0.15 * consistency
    )

    conflict = conflict_assessment or assess_publication_conflict(evidence)
    publishable = (
        product.eligible
        and not chain.excluded
        and fiyu_score >= PUBLICATION_SCORE_THRESHOLD
    )

    fiyu_score = round(fiyu_score, 2)
    fiyu_confidence = round(fiyu_confidence, 2)
    return FiyuScoreResult(
        local_signal=round(local_signal, 2),
        hiddenness_signal=round(hiddenness_signal, 2),
        quality_signal=round(quality_signal, 2),
        independence_signal=round(independence_signal, 2),
        local_discovery_score=discovery.score,
        local_discovery_classification=discovery.classification,
        local_discovery_components=discovery.components,
        local_discovery_contribution=round(
            FIYU_SCORE_WEIGHTS["local_discovery"] * discovery.score, 2
        ),
        tourist_visibility_classification=discovery.visibility_classification,
        tourist_orientation=discovery.tourist_orientation,
        tourist_orientation_basis=discovery.tourist_orientation_basis,
        product_eligible=product.eligible,
        product_eligibility_classification=product.classification,
        product_eligibility_reasons=product.reasons,
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


def evaluate_fiyu_candidate(
    evidence: FiyuEvidence,
    internal: InternalSignals,
    structured_research: Mapping[str, object] | None = None,
    *,
    primary_category: str | None = None,
) -> FiyuScoreResult:
    """Canonical deterministic recommendation, discovery, and eligibility path."""

    structured = structured_research or {}
    chain = assess_chain_classification(evidence, structured)
    product = assess_product_eligibility(
        primary_category=primary_category or str(structured.get("primary_category") or ""),
        venue_format=str(structured.get("venue_format") or evidence.venue_format),
        food_drink_primary=(
            structured.get("food_drink_primary")
            if isinstance(structured.get("food_drink_primary"), bool)
            else evidence.food_drink_primary
        ),
        structured_research=structured,
    )
    discovery = calculate_local_discovery(
        LocalDiscoveryInputs(
            underexposure_score=internal.underexposure_score,
            digital_footprint_score=internal.digital_footprint_score,
            japanese_source_count=evidence.japanese_source_count,
            english_tourist_source_count=evidence.english_tourist_source_count,
            japanese_review_share=evidence.japanese_review_share,
            tourist_coverage=evidence.tourist_coverage,
            reservation_platform_count=evidence.reservation_platform_count,
            official_website_found=evidence.official_website_found,
            social_profile_count=evidence.social_profile_count,
            chain_classification=chain.classification,
            specialist_restaurant=evidence.specialist_restaurant,
            local_audience=str(structured.get("local_audience") or evidence.local_audience),
            international_visibility=str(
                structured.get("international_visibility")
                or evidence.international_visibility
            ),
            corporate_visibility=str(
                structured.get("corporate_visibility") or evidence.corporate_visibility
            ),
            tourist_orientation=str(
                structured.get("tourist_orientation") or evidence.tourist_orientation
            ),
            tourist_signals=tuple(
                str(item)
                for item in (
                    structured.get("tourist_signals")
                    if isinstance(structured.get("tourist_signals"), list)
                    else evidence.tourist_signals
                )
            ),
            local_audience_signals=tuple(
                str(item)
                for item in (
                    structured.get("local_audience_signals")
                    if isinstance(structured.get("local_audience_signals"), list)
                    else evidence.local_audience_signals
                )
            ),
        )
    )
    return calculate_fiyu_score(
        evidence,
        internal,
        conflict_assessment=assess_publication_conflict(evidence, structured),
        chain_assessment=chain,
        local_discovery=discovery,
        product_eligibility=product,
    )
