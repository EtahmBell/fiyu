from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Literal

from .utils import clamp

LocalDiscoveryClassification = Literal[
    "mainstream_visible",
    "moderately_local",
    "local_discovery",
    "high_local_discovery_low_footprint",
]

LOCAL_DISCOVERY_WEIGHTS = {
    "underexposure": 0.25,
    "web_scarcity": 0.15,
    "international_obscurity": 0.15,
    "local_audience_orientation": 0.15,
    "independence": 0.20,
    "distinctiveness": 0.10,
}
INTERNATIONAL_OBSCURITY_WEIGHTS = {
    "tourist_orientation": 0.60,
    "international_visibility": 0.25,
    "english_source_scarcity": 0.15,
}


@dataclass(frozen=True, slots=True)
class LocalDiscoveryInputs:
    underexposure_score: float
    digital_footprint_score: float
    japanese_source_count: int
    english_tourist_source_count: int
    japanese_review_share: float | None
    tourist_coverage: str
    reservation_platform_count: int
    official_website_found: bool
    social_profile_count: int
    chain_classification: str
    specialist_restaurant: bool
    local_audience: str = "unknown"
    international_visibility: str = "unknown"
    corporate_visibility: str = "unknown"
    tourist_orientation: str = "unknown"
    tourist_signals: tuple[str, ...] = ()
    local_audience_signals: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class LocalDiscoveryResult:
    score: float
    classification: LocalDiscoveryClassification
    components: dict[str, float]
    visibility_classification: str
    tourist_orientation: str
    tourist_orientation_basis: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ProductEligibility:
    eligible: bool
    classification: str
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class FixedVisitReadyVenue:
    established: bool
    evidence: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class LowFootprintEligibility:
    evaluated: bool
    eligible: bool
    reason: str
    evidence_fingerprint: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


_NON_DINING_SERVICE = re.compile(
    r"\b(?:event service|rental service|party equipment|meal delivery service|"
    r"food wholesaler|cooking class)\b",
    re.IGNORECASE,
)
_CONFIRMED_CLOSURE = re.compile(
    r"\b(?:confirmed |currently |permanently )?(?:closed|closure|ceased trading)\b|"
    r"閉店|廃業",
    re.IGNORECASE,
)
_NEGATED_CLOSURE = re.compile(
    r"\bno\b[^.]{0,160}\b(?:closure|closed|ceased trading)\b"
    r"[^.]{0,160}\b(?:found|identified|reported|known|evidenced)\b|"
    r"\bno (?:evidence|indication|record|report) of (?:a )?"
    r"(?:closure|being (?:permanently )?closed|ceased trading)\b",
    re.IGNORECASE,
)
_NEGATED_PRODUCT_EXCLUSION = re.compile(
    r"\bno (?:evidence|indication|sign|suggestion)\b[^.]{0,200}"
    r"\b(?:catering|caterer|mobile|service[- ]only|entertainment[- ]first|"
    r"karaoke[- ]first|non[- ]dining)\b[^.]*[.!]?",
    re.IGNORECASE,
)
_EVIDENCE_INTEGRITY = re.compile(
    r"\b(?:evidence integrity|fabricat(?:ed|ion)|confirmed source mismatch)\b",
    re.IGNORECASE,
)

_AFFIRMATIVE_MOBILE_CATERING = re.compile(
    r"\b(?:catering[- ]only|delivery[- ]only|event cater(?:er|ing)|private chef|"
    r"pop[- ]?up[- ]only|food truck|mobile (?:service|business|operation)|"
    r"customer[- ]selected venues?|no (?:fixed|permanent) (?:restaurant|venue)|"
    r"service[- ]only operation)\b",
    re.IGNORECASE,
)
_AFFIRMATIVE_ENTERTAINMENT_FIRST = re.compile(
    r"\b(?:entertainment[- ]first|karaoke[- ]first|nightclub[- ]first|"
    r"live entertainment (?:is )?(?:the )?primary|events? (?:are|is) (?:the )?primary|"
    r"food (?:and drink )?(?:is|are|appears?) (?:clearly )?secondary)\b",
    re.IGNORECASE,
)


def _level(value: str, *, low: float, medium: float, high: float, unknown: float) -> float:
    return {
        "low": low,
        "medium": medium,
        "mixed": medium,
        "high": high,
        "unknown": unknown,
    }.get(str(value or "unknown").casefold(), unknown)


def calculate_local_discovery(inputs: LocalDiscoveryInputs) -> LocalDiscoveryResult:
    """Calculate discovery value, not restaurant quality, from inspectable signals."""

    source_share = (
        (inputs.japanese_source_count + 1)
        / (inputs.japanese_source_count + inputs.english_tourist_source_count + 2)
        * 100.0
    )
    review_share = (
        inputs.japanese_review_share * 100.0
        if inputs.japanese_review_share is not None
        else 50.0
    )
    explicit_local = _level(
        inputs.local_audience, low=20.0, medium=60.0, high=100.0, unknown=50.0
    )
    # Source-language mix can corroborate an explicit audience finding, but it
    # cannot establish a local audience by itself.
    local_audience = (
        50.0
        if str(inputs.local_audience).casefold() == "unknown"
        else clamp(0.70 * explicit_local + 0.15 * source_share + 0.15 * review_share)
    )

    explicit_tourist = str(inputs.tourist_orientation or "unknown").casefold()
    if explicit_tourist != "unknown":
        # New research must retain support for a non-neutral orientation enum.
        if inputs.tourist_signals:
            effective_tourist = explicit_tourist
            tourist_basis = "supported_structured_orientation"
        else:
            effective_tourist = "unknown"
            tourist_basis = "unsupported_orientation_treated_as_unknown"
    else:
        # Historical rows predate tourist_orientation. Their reviewed legacy
        # coverage remains a backwards-compatible input.
        effective_tourist = str(inputs.tourist_coverage or "unknown").casefold()
        tourist_basis = (
            "legacy_tourist_coverage"
            if effective_tourist != "unknown"
            else "neutral_unknown"
        )
    tourist_obscurity = _level(
        effective_tourist, low=95.0, medium=50.0, high=5.0, unknown=60.0
    )
    explicit_international = _level(
        inputs.international_visibility,
        low=95.0,
        medium=50.0,
        high=5.0,
        unknown=60.0,
    )
    english_scarcity = clamp(100.0 - 22.0 * inputs.english_tourist_source_count)
    international_obscurity = clamp(
        INTERNATIONAL_OBSCURITY_WEIGHTS["tourist_orientation"] * tourist_obscurity
        + INTERNATIONAL_OBSCURITY_WEIGHTS["international_visibility"]
        * explicit_international
        + INTERNATIONAL_OBSCURITY_WEIGHTS["english_source_scarcity"]
        * english_scarcity
    )

    website_scarcity = 25.0 if inputs.official_website_found else 90.0
    reservation_scarcity = clamp(100.0 - 25.0 * inputs.reservation_platform_count)
    social_scarcity = clamp(100.0 - 20.0 * inputs.social_profile_count)
    explicit_corporate_scarcity = _level(
        inputs.corporate_visibility,
        low=95.0,
        medium=50.0,
        high=5.0,
        unknown=60.0,
    )
    web_scarcity = clamp(
        0.50 * inputs.digital_footprint_score
        + 0.20 * website_scarcity
        + 0.15 * reservation_scarcity
        + 0.10 * social_scarcity
        + 0.05 * explicit_corporate_scarcity
    )

    independence = {
        "independent_single": 100.0,
        "small_group_distinct_concept": 82.0,
        "small_same_brand_chain": 20.0,
        "large_chain_or_franchise": 0.0,
        "unknown": 70.0,
    }.get(inputs.chain_classification, 70.0)
    distinctiveness = 85.0 if inputs.specialist_restaurant else 50.0
    components = {
        "underexposure": round(clamp(inputs.underexposure_score), 2),
        "web_scarcity": round(web_scarcity, 2),
        "international_obscurity": round(international_obscurity, 2),
        "local_audience_orientation": round(local_audience, 2),
        "independence": round(independence, 2),
        "distinctiveness": round(distinctiveness, 2),
    }
    score = clamp(
        sum(
            LOCAL_DISCOVERY_WEIGHTS[name] * value
            for name, value in components.items()
        )
    )
    if score >= 80 and web_scarcity >= 70:
        classification: LocalDiscoveryClassification = (
            "high_local_discovery_low_footprint"
        )
    elif score >= 70:
        classification = "local_discovery"
    elif score >= 50:
        classification = "moderately_local"
    else:
        classification = "mainstream_visible"
    visibility = (
        "low_international_visibility"
        if international_obscurity >= 70
        else "mixed_visibility"
        if international_obscurity >= 40
        else "tourist_or_internationally_visible"
    )
    return LocalDiscoveryResult(
        round(score, 2),
        classification,
        components,
        visibility,
        explicit_tourist if tourist_basis == "supported_structured_orientation" else "unknown",
        tourist_basis,
    )


def _structured_text(structured: Mapping[str, object] | None) -> str:
    if not structured:
        return ""
    values: list[str] = []
    for field in (
        "primary_category",
        "venue_format",
        "product_eligibility_evidence",
        "why_fiyu",
        "description_en",
        "warnings",
        "conflict_explanation",
        "prior_material_conflict_context",
    ):
        value = structured.get(field)
        values.extend(str(item) for item in value) if isinstance(value, list) else values.append(
            str(value or "")
        )
    return " ".join(values)


def _affirmative_product_evidence_text(
    structured: Mapping[str, object] | None,
) -> str:
    value = (structured or {}).get("product_eligibility_evidence")
    items = value if isinstance(value, list) else [value]
    negated = re.compile(
        r"\b(?:no (?:evidence|indication|sign|suggestion)|not presented as|rather than|"
        r"not\b[^.]{0,160}\b(?:catering|mobile|delivery[- ]only|service[- ]only|"
        r"entertainment[- ]first|karaoke[- ]first))\b",
        re.IGNORECASE,
    )
    return " ".join(
        str(item) for item in items if item and not negated.search(str(item))
    )


def assess_fixed_visit_ready_venue(
    *,
    primary_category: str | None,
    venue_format: str,
    food_drink_primary: bool | None,
    structured_research: Mapping[str, object] | None,
) -> FixedVisitReadyVenue:
    """Derive positive fixed-venue support from compact structured facts only."""

    evidence: list[str] = []
    if str(venue_format or "unknown").casefold() == "fixed_venue":
        evidence.append("structured_fixed_venue")
    if re.search(
        r"\b(?:restaurant|cafe|bar|izakaya|bistro|sushi|dining|osteria)\b",
        str(primary_category or ""),
        re.IGNORECASE,
    ):
        evidence.append("food_drink_venue_category")
    if food_drink_primary is True:
        evidence.append("food_drink_primary")
    if (structured_research or {}).get("official_website_found") is True:
        evidence.append("official_website")
    if int((structured_research or {}).get("reservation_platform_count") or 0) > 0:
        evidence.append("reservation_platform")
    address_evidence = (structured_research or {}).get("address_evidence")
    if isinstance(address_evidence, Mapping) and isinstance(
        address_evidence.get("source_evidence"), list
    ) and address_evidence["source_evidence"]:
        evidence.append("independent_fixed_address")
    fixed = (structured_research or {}).get("fixed_venue_evidence")
    if isinstance(fixed, Mapping):
        for field in (
            "counter_seating",
            "table_seating",
            "private_rooms",
            "small_capacity",
            "lunch_service",
            "dinner_service",
        ):
            if fixed.get(field) is True:
                evidence.append(field)
        if str(fixed.get("reservation_status") or "unknown") != "unknown":
            evidence.append("reservations")
        if int(fixed.get("regular_open_days") or 0) > 0:
            evidence.append("regular_opening_hours")
        if int(fixed.get("restaurant_source_count") or 0) > 0:
            evidence.append("restaurant_sources")
    explicit_text = _affirmative_product_evidence_text(structured_research)
    if re.search(
        r"\b(?:fixed (?:restaurant|venue)|dine[- ]in|counter seating|table seating|"
        r"private rooms?|seat capacity|street address|dining room)\b",
        explicit_text,
        re.IGNORECASE,
    ):
        evidence.append("explicit_fixed_venue_evidence")
    return FixedVisitReadyVenue(bool(evidence), tuple(dict.fromkeys(evidence)))


def assess_product_eligibility(
    *,
    primary_category: str | None,
    venue_format: str,
    food_drink_primary: bool | None,
    structured_research: Mapping[str, object] | None,
) -> ProductEligibility:
    """Trust candidate existence while gating only clear Fiyu product mismatches."""

    text = " ".join([str(primary_category or ""), venue_format, _structured_text(structured_research)])
    protected_text = _NEGATED_PRODUCT_EXCLUSION.sub("", text)
    if _EVIDENCE_INTEGRITY.search(protected_text):
        return ProductEligibility(False, "ineligible_evidence_integrity", ("material_evidence_integrity_failure",))
    normalized_format = str(venue_format or "unknown").casefold()
    fixed = assess_fixed_visit_ready_venue(
        primary_category=primary_category,
        venue_format=venue_format,
        food_drink_primary=food_drink_primary,
        structured_research=structured_research,
    )
    explicit_text = _affirmative_product_evidence_text(structured_research)
    affirmative_mobile = bool(_AFFIRMATIVE_MOBILE_CATERING.search(explicit_text))
    if affirmative_mobile or (
        normalized_format in {"catering_mobile", "service_only"}
        and food_drink_primary is False
        and not fixed.established
    ):
        return ProductEligibility(False, "ineligible_mobile_or_catering", ("not_a_fixed_visit_ready_venue",))
    affirmative_entertainment = bool(
        _AFFIRMATIVE_ENTERTAINMENT_FIRST.search(explicit_text)
    )
    if (
        (normalized_format == "entertainment_first" or affirmative_entertainment)
        and food_drink_primary is False
    ):
        return ProductEligibility(False, "ineligible_entertainment_first", ("food_or_drink_is_secondary",))
    if (
        normalized_format == "non_dining_service"
        or _NON_DINING_SERVICE.search(explicit_text)
    ) and food_drink_primary is False:
        return ProductEligibility(False, "ineligible_non_dining_service", ("candidate_is_a_service_not_a_venue",))
    return ProductEligibility(True, "eligible_visit_ready_venue", ("candidate_dataset_entity_with_no_hard_product_exclusion",))


def evidence_fingerprint(payload: Mapping[str, object]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def assess_low_footprint_eligibility(
    *,
    local_discovery_score: float,
    fiyu_score: float,
    research_confidence: float,
    evidence_source_count: int,
    product_eligibility: ProductEligibility,
    chain_excluded: bool,
    fingerprint_payload: Mapping[str, object],
) -> LowFootprintEligibility:
    fingerprint = evidence_fingerprint(fingerprint_payload)
    if not product_eligibility.eligible:
        return LowFootprintEligibility(True, False, "hard_product_exclusion", fingerprint)
    if chain_excluded:
        return LowFootprintEligibility(True, False, "chain_exclusion", fingerprint)
    if local_discovery_score < 70.0:
        return LowFootprintEligibility(True, False, "local_discovery_below_70", fingerprint)
    if fiyu_score < 60.0:
        return LowFootprintEligibility(True, False, "recommendation_value_below_60", fingerprint)
    sparse = evidence_source_count < 3 or research_confidence < 55.0
    if not sparse:
        return LowFootprintEligibility(True, False, "enrichment_not_sparse", fingerprint)
    return LowFootprintEligibility(
        True,
        True,
        "local_discovery_at_least_70_and_sparse_enrichment",
        fingerprint,
    )
