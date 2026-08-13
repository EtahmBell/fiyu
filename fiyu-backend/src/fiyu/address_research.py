from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import socket
import sqlite3
import unicodedata
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from dotenv import load_dotenv
from openai import APIConnectionError, APITimeoutError, OpenAI
from openai.lib._pydantic import to_strict_json_schema
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .database import connect
from .discovery_areas import TOKYO_WARD_NAMES, canonical_tokyo_ward, discovery_occurrences
from .location_names import normalize_location_name
from .osm_address_normalization import (
    canonical_tokyo_prefecture,
    normalize_japanese_street_or_block,
    normalize_tokyo_neighborhood,
)
from .public_catalog import ensure_public_schema

ADDRESS_PROMPT_VERSION = "address-research-v2"
ADDRESS_SCHEMA_VERSION = "address-evidence-v3"
ADDRESS_DECISION_VERSION = "deterministic-address-decision-mvp-v3"
DEFAULT_MAX_SEARCH_ACTIONS = 4
DEFAULT_MAX_RETAINED_SOURCES = 4
DEFAULT_MAX_EVIDENCE_SUMMARY_CHARS = 160
DEFAULT_MAX_CONFLICTING_CANDIDATES = 3
DEFAULT_MAX_OUTPUT_TOKENS = 4000

IdentityStatus = Literal["confirmed", "probable", "ambiguous", "conflicting", "not_found", "error"]
AddressTemporality = Literal["current", "historical", "future", "unknown"]
SourceType = Literal[
    "official_restaurant_website",
    "official_restaurant_social_profile",
    "restaurant_controlled_reservation_page",
    "restaurant_submission",
    "official_company_press_release",
    "restaurant_authored_press_release",
    "attributed_press_release",
    "direct_restaurant_confirmation",
    "local_government_or_official_listing",
    "recognized_open_data_source",
    "permitted_booking_platform",
    "permitted_business_directory",
    "established_local_editorial_source",
    "independent_japanese_blog",
    "search_result_snippet",
    "reposted_social_content",
    "unattributed_aggregator",
    "weak_user_generated_content",
    "lead_only_restricted_platform",
    "unknown_source",
]

STRONG_SOURCE_TYPES = {
    "official_restaurant_website",
    "official_restaurant_social_profile",
    "restaurant_controlled_reservation_page",
    "restaurant_submission",
    "official_company_press_release",
    "restaurant_authored_press_release",
    "attributed_press_release",
    "direct_restaurant_confirmation",
    "local_government_or_official_listing",
    "recognized_open_data_source",
}
CONTROLLED_STRONG_SOURCE_TYPES = {
    "official_restaurant_website",
    "official_restaurant_social_profile",
    "restaurant_controlled_reservation_page",
    "restaurant_submission",
    "restaurant_authored_press_release",
    "direct_restaurant_confirmation",
}
SECONDARY_SOURCE_TYPES = {
    "permitted_booking_platform",
    "permitted_business_directory",
    "established_local_editorial_source",
    "independent_japanese_blog",
}
LEAD_ONLY_SOURCE_TYPES = {
    "search_result_snippet",
    "reposted_social_content",
    "unattributed_aggregator",
    "weak_user_generated_content",
    "unknown_source",
    "lead_only_restricted_platform",
}
SOURCE_POLICY_REGISTRY: dict[str, dict[str, str]] = {
    "tabelog.com": {"policy": "lead_only", "source_type": "lead_only_restricted_platform"},
    "google.com": {"policy": "lead_only", "source_type": "lead_only_restricted_platform"},
    "maps.google.com": {"policy": "lead_only", "source_type": "lead_only_restricted_platform"},
    "maps.app.goo.gl": {"policy": "lead_only", "source_type": "lead_only_restricted_platform"},
    "instagram.com": {"policy": "lead_only", "source_type": "lead_only_restricted_platform"},
    "prtimes.jp": {"policy": "third_party_press_release_host"},
}


class AddressSourceEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: SourceType
    source_url: str = Field(min_length=1, max_length=2000)
    source_title: str | None = Field(default=None, max_length=500)
    source_language: Literal["ja", "en", "mixed", "unknown"] = "unknown"
    accessed_at: str = Field(min_length=10, max_length=32)
    address_text_as_displayed: str | None = Field(default=None, max_length=1000)
    address_temporality: AddressTemporality = "unknown"
    postal_code: str | None = Field(default=None, max_length=32)
    prefecture: str | None = Field(default=None, max_length=100)
    municipality_or_ward: str | None = Field(default=None, max_length=200)
    neighborhood: str | None = Field(default=None, max_length=300)
    street_or_block: str | None = Field(default=None, max_length=300)
    building: str | None = Field(default=None, max_length=300)
    floor: str | None = Field(default=None, max_length=100)
    suite_or_unit: str | None = Field(default=None, max_length=100)
    entrance: str | None = Field(default=None, max_length=200)
    identity_evidence_summary: str = Field(default="", max_length=600)
    address_evidence_summary: str = Field(default="", max_length=600)
    restaurant_controlled: bool = False
    supports_candidate_address: bool = False
    warnings: list[str] = Field(default_factory=list, max_length=12)


class ConflictingAddressCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address_raw: str = Field(min_length=1, max_length=1000)
    address_temporality: AddressTemporality = "unknown"
    source_urls: list[str] = Field(default_factory=list, max_length=8)
    summary: str = Field(default="", max_length=600)
    postal_code: str | None = Field(default=None, max_length=32)
    prefecture: str | None = Field(default=None, max_length=100)
    municipality_or_ward: str | None = Field(default=None, max_length=200)
    neighborhood: str | None = Field(default=None, max_length=300)
    street_or_block: str | None = Field(default=None, max_length=300)
    building: str | None = Field(default=None, max_length=300)
    floor: str | None = Field(default=None, max_length=100)
    suite_or_unit: str | None = Field(default=None, max_length=100)
    entrance: str | None = Field(default=None, max_length=200)


class AddressResearchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity_status: IdentityStatus
    identity_confidence: float = Field(ge=0, le=1)
    matched_name: str | None = Field(default=None, max_length=500)
    branch_name: str | None = Field(default=None, max_length=500)
    address_raw: str | None = Field(default=None, max_length=1000)
    postal_code: str | None = Field(default=None, max_length=32)
    prefecture: str | None = Field(default=None, max_length=100)
    municipality_or_ward: str | None = Field(default=None, max_length=200)
    neighborhood: str | None = Field(default=None, max_length=300)
    street_or_block: str | None = Field(default=None, max_length=300)
    building: str | None = Field(default=None, max_length=300)
    floor: str | None = Field(default=None, max_length=100)
    suite_or_unit: str | None = Field(default=None, max_length=100)
    entrance: str | None = Field(default=None, max_length=200)
    source_evidence: list[AddressSourceEvidence] = Field(default_factory=list, max_length=12)
    conflicting_address_candidates: list[ConflictingAddressCandidate] = Field(
        default_factory=list, max_length=8
    )
    search_queries_attempted: list[str] = Field(default_factory=list, max_length=12)
    warnings: list[str] = Field(default_factory=list, max_length=16)
    recommended_action: str = Field(default="", max_length=500)
    research_summary: str = Field(default="", max_length=1000)


AgreementState = Literal["agrees", "conflicts", "single_source", "missing"]


class AddressComponentAgreement(BaseModel):
    """Deterministic component comparison; never a model assertion."""

    model_config = ConfigDict(extra="forbid")
    prefecture_agreement: AgreementState
    municipality_or_ward_agreement: AgreementState
    neighborhood_agreement: AgreementState
    street_or_block_agreement: AgreementState
    building_agreement: AgreementState
    floor_agreement: AgreementState
    postal_code_agreement: AgreementState
    agreed_core_address: str | None = None
    conflicting_components: list[str] = Field(default_factory=list)
    non_material_conflicting_components: list[str] = Field(default_factory=list)
    material_conflicting_components: list[str] = Field(default_factory=list)
    component_values: dict[str, list[str]] = Field(default_factory=dict)
    excluded_temporal_evidence: list[dict[str, object]] = Field(default_factory=list)
    excluded_non_address_evidence: list[dict[str, object]] = Field(default_factory=list)
    core_address_verified: bool = False
    full_address_verified: bool = False
    unresolved_address_detail: str | None = None
    proposed_location_precision: Literal[
        "exact_entrance", "building", "parcel_or_street_number", "block",
        "neighborhood", "ward", "unknown"
    ] = "unknown"
    map_location_approximate: bool = False


ADDRESS_RESEARCH_INSTRUCTIONS = """Research public address evidence for this exact Tokyo restaurant.

Prefer the quoted exact Japanese name plus the reviewed ward and Japanese terms such as 住所,
所在地, アクセス, 店舗情報, 営業案内, 電話, and 予約. Never search by Google Place ID. Keep exact
restaurant/branch identity separate from address evidence and never merge branches.
Do not use the Google Place ID as a web search term.

Preserve each source's Japanese address verbatim, then parse it into postal code, prefecture,
municipality/ward, neighborhood, street/block, building, floor, suite/unit, and entrance when the
source explicitly supplies them. Never invent or combine components. Return all disagreements,
including building/floor-only differences, without deciding whether they are material.

Classify every source address and conflicting candidate as current, historical, future, or unknown.
Use historical only for explicit language such as 旧住所, 移転前, 以前の住所, or an address followed
by ～から移転; use current for explicit 現住所 or 移転先 language. Do not infer temporality merely
because addresses differ. Keep historical addresses as provenance, not as current candidates. Never
place navigation labels, page-interface text, or move-explanation sentences in building or floor.

Classify sources accurately. A third-party-hosted company-attributed press release is
attributed_press_release, not restaurant_submission. Tabelog, Google/Maps, Instagram, snippets, and
other restricted platforms are lead_only_restricted_platform or another lead-only type; retain URLs
but do not treat them as verification. Set restaurant_controlled=true only with evidence of control.
Use concise one-sentence evidence summaries and retain only useful sources.

Do not return coordinates, verified/map state, ratings, prices, awards, or unrelated facts. Record
only queries the model actually requested; backend-generated queries and actual web actions are
audited separately.
"""


@dataclass(frozen=True)
class AddressAcceptance:
    status: Literal[
        "accepted", "provisional", "needs_review", "conflicting", "not_found", "failed"
    ]
    resolution_status: str
    reasons: tuple[str, ...] = ()
    confidence_tier: Literal[
        "verified", "provisional_high", "provisional_medium", "manual", "rejected"
    ] | None = None


@dataclass(frozen=True)
class AddressCallMetadata:
    response_id: str | None
    model: str
    search_calls: tuple[dict[str, object], ...] = ()
    citations: tuple[dict[str, str], ...] = ()
    response_request_count: int = 1
    web_search_action_count: int = 0
    requested_web_action_limit: int = 0
    limit_reached: bool = False
    limit_exceeded: bool = False
    response_ids: tuple[str, ...] = ()
    response_status: str | None = None
    incomplete_reason: str | None = None
    raw_output_character_count: int = 0
    output_was_truncated: bool = False
    parse_attempted: bool = False
    parse_error_summary: str | None = None
    structured_output_mode: str = "strict_json_schema"
    retry_count: int = 0
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    total_tokens: int = 0
    usage_metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class AddressResearchCall:
    result: AddressResearchResult
    acceptance: AddressAcceptance
    generated_queries: tuple[str, ...]
    metadata: AddressCallMetadata
    component_agreement: AddressComponentAgreement | None = None
    cached_queries: tuple[str, ...] = ()
    skipped_queries: tuple[str, ...] = ()


class AddressResearchFailure(RuntimeError):
    """Controlled failure that retains provider audit and never carries raw output."""

    def __init__(
        self,
        code: str,
        summary: str,
        *,
        metadata: AddressCallMetadata,
        generated_queries: tuple[str, ...],
    ) -> None:
        super().__init__(f"{code}: {summary}")
        self.code = code
        self.summary = summary
        self.metadata = metadata
        self.generated_queries = generated_queries


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _value(obj: object, name: str, default: object = None) -> object:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _jsonable(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _clean_query(value: str) -> str:
    return " ".join(value.split()).strip()


def _query_fingerprint(query: str) -> str:
    normalized = normalize_location_name(_clean_query(query))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _areas(candidate: dict[str, object]) -> list[str]:
    values = [
        str(item.get("area"))
        for item in discovery_occurrences(candidate)
        if item.get("area")
    ]
    if not values and candidate.get("discovery_area"):
        values.append(str(candidate["discovery_area"]))
    return list(dict.fromkeys(values))


def generate_address_queries(
    candidate: dict[str, object], *, max_search_actions: int = DEFAULT_MAX_SEARCH_ACTIONS
) -> list[str]:
    if max_search_actions < 1:
        raise ValueError("max_search_actions must be at least 1")
    name_ja = str(candidate.get("name_ja") or candidate.get("title") or "").strip()
    name_en = str(candidate.get("name_en") or "").strip()
    areas = _areas(candidate)
    area_text = " ".join(areas)
    category = str(candidate.get("category") or candidate.get("primary_category") or "").strip()
    primary_name = name_ja or name_en
    queries = [
        f'"{primary_name}" {area_text} 住所',
        f'"{primary_name}" {area_text} 所在地 店舗情報',
        f'"{primary_name}" {area_text} アクセス 電話',
    ]
    if name_en and normalize_location_name(name_en) != normalize_location_name(primary_name):
        queries.append(f'"{name_en}" {area_text} address')
    if category:
        queries.append(f'"{primary_name}" {area_text} {category} 営業案内 予約')
    unique = []
    for query in queries:
        cleaned = _clean_query(query)
        if primary_name and cleaned not in unique:
            unique.append(cleaned)
    return unique[:max_search_actions]


def _address_prompt(candidate: dict[str, object], queries: list[str]) -> str:
    areas = _areas(candidate)
    return "\n".join(
        [
            "Find address evidence for this exact restaurant:",
            f"Internal restaurant ID: {candidate.get('place_id') or ''}",
            f"Official Japanese name: {candidate.get('name_ja') or candidate.get('title') or ''}",
            f"English or romanized name: {candidate.get('name_en') or ''}",
            f"Allowed discovery wards/areas: {', '.join(areas)}",
            f"Category or cuisine: {candidate.get('category') or candidate.get('primary_category') or ''}",
            f"Existing research source URLs (leads only): {candidate.get('evidence_urls_json') or '[]'}",
            f"Existing address evidence (do not assume accepted): {candidate.get('existing_address_evidence_json') or '[]'}",
            "Focused queries prepared by the backend:",
            *(f"- {query}" for query in queries),
            "Use no more than the allowed search actions. Return only the structured address result.",
        ]
    )


def _response_output_text(response: object) -> str:
    aggregated = _value(response, "output_text", None)
    if isinstance(aggregated, str):
        return aggregated
    parts: list[str] = []
    for item in _value(response, "output", []) or []:
        if str(_value(item, "type", "")) != "message":
            continue
        for content in _value(item, "content", []) or []:
            if str(_value(content, "type", "")) == "output_text":
                value = _value(content, "text", None)
                if value:
                    parts.append(str(value))
    return "".join(parts)


def _response_refusal(response: object) -> str | None:
    for item in _value(response, "output", []) or []:
        if str(_value(item, "type", "")) != "message":
            continue
        for content in _value(item, "content", []) or []:
            if str(_value(content, "type", "")) == "refusal":
                refusal = _value(content, "refusal", None)
                return str(refusal or "Provider refused the structured-output request.")[:500]
    return None


def _incomplete_reason(response: object) -> str | None:
    details = _value(response, "incomplete_details", None)
    reason = _value(details, "reason", None)
    return str(reason) if reason else None


def extract_response_metadata(response: object, *, fallback_model: str) -> AddressCallMetadata:
    search_calls: list[dict[str, object]] = []
    citations: list[dict[str, str]] = []
    for item in _value(response, "output", []) or []:
        item_type = str(_value(item, "type", ""))
        if item_type == "web_search_call":
            action = _value(item, "action", {}) or {}
            queries = list(_value(action, "queries", None) or [])
            single_query = _value(action, "query", None)
            if single_query:
                queries.append(str(single_query))
            sources = []
            for source in _value(action, "sources", []) or []:
                url = _value(source, "url", None)
                if url:
                    sources.append(str(url))
            search_calls.append(
                {
                    "id": str(_value(item, "id", "")),
                    "status": str(_value(item, "status", "")),
                    "action_type": str(_value(action, "type", "")),
                    "queries": list(dict.fromkeys(str(query) for query in queries if query)),
                    "sources": list(dict.fromkeys(sources)),
                }
            )
        if item_type == "message":
            for content in _value(item, "content", []) or []:
                for annotation in _value(content, "annotations", []) or []:
                    if str(_value(annotation, "type", "")) != "url_citation":
                        continue
                    url = _value(annotation, "url", None)
                    if url:
                        citations.append(
                            {
                                "url": str(url),
                                "title": str(_value(annotation, "title", "") or ""),
                            }
                        )
    usage = _value(response, "usage", None)
    input_details = _value(usage, "input_tokens_details", None)
    output_details = _value(usage, "output_tokens_details", None)
    unique_citations = {
        (item["url"], item["title"]): item for item in citations
    }
    usage_metadata = _jsonable(usage) if usage is not None else {}
    response_id = str(_value(response, "id", "") or "") or None
    response_status = str(_value(response, "status", "") or "completed")
    incomplete_reason = _incomplete_reason(response)
    raw_output = _response_output_text(response)
    output_was_truncated = response_status == "incomplete" and incomplete_reason in {
        "max_output_tokens", "max_tokens"
    }
    return AddressCallMetadata(
        response_id=response_id,
        model=str(_value(response, "model", fallback_model) or fallback_model),
        search_calls=tuple(search_calls),
        citations=tuple(unique_citations.values()),
        web_search_action_count=len(search_calls),
        response_ids=(response_id,) if response_id else (),
        response_status=response_status,
        incomplete_reason=incomplete_reason,
        raw_output_character_count=len(raw_output),
        output_was_truncated=output_was_truncated,
        input_tokens=int(_value(usage, "input_tokens", 0) or 0),
        cached_input_tokens=int(_value(input_details, "cached_tokens", 0) or 0),
        output_tokens=int(_value(usage, "output_tokens", 0) or 0),
        reasoning_tokens=int(_value(output_details, "reasoning_tokens", 0) or 0),
        total_tokens=int(_value(usage, "total_tokens", 0) or 0),
        usage_metadata=usage_metadata if isinstance(usage_metadata, dict) else {},
    )


def _validation_error_summary(error: ValidationError) -> str:
    details = error.errors(include_input=False, include_url=False)
    if not details:
        return "Structured output did not match AddressResearchResult."
    first = details[0]
    location = ".".join(str(value) for value in first.get("loc", ())) or "root"
    return (
        f"{len(details)} validation error(s); {first.get('type', 'validation_error')} "
        f"at {location}: {first.get('msg', 'invalid structured output')}"
    )[:500]


def _combine_attempt_metadata(
    attempts: list[AddressCallMetadata], *, requested_limit: int
) -> AddressCallMetadata:
    if not attempts:
        return AddressCallMetadata(
            response_id=None,
            model="unknown",
            requested_web_action_limit=requested_limit,
        )
    last = attempts[-1]
    search_calls: list[dict[str, object]] = []
    citations: list[dict[str, str]] = []
    for attempt_index, attempt in enumerate(attempts, start=1):
        search_calls.extend(
            {**call, "attempt_index": attempt_index} for call in attempt.search_calls
        )
        citations.extend(attempt.citations)
    unique_citations = {
        (item.get("url", ""), item.get("title", "")): item for item in citations
    }
    action_count = len(search_calls)
    return AddressCallMetadata(
        response_id=last.response_id,
        model=last.model,
        search_calls=tuple(search_calls),
        citations=tuple(unique_citations.values()),
        response_request_count=sum(item.response_request_count for item in attempts),
        web_search_action_count=action_count,
        requested_web_action_limit=requested_limit,
        limit_reached=action_count >= requested_limit,
        limit_exceeded=action_count > requested_limit,
        response_ids=tuple(
            response_id
            for attempt in attempts
            for response_id in attempt.response_ids
        ),
        response_status=last.response_status,
        incomplete_reason=last.incomplete_reason,
        raw_output_character_count=last.raw_output_character_count,
        output_was_truncated=last.output_was_truncated,
        parse_attempted=last.parse_attempted,
        parse_error_summary=last.parse_error_summary,
        structured_output_mode=last.structured_output_mode,
        retry_count=max(0, len(attempts) - 1),
        input_tokens=sum(item.input_tokens for item in attempts),
        cached_input_tokens=sum(item.cached_input_tokens for item in attempts),
        output_tokens=sum(item.output_tokens for item in attempts),
        reasoning_tokens=sum(item.reasoning_tokens for item in attempts),
        total_tokens=sum(item.total_tokens for item in attempts),
        usage_metadata={
            "attempts": [
                {
                    "response_id": item.response_id,
                    "response_status": item.response_status,
                    "incomplete_reason": item.incomplete_reason,
                    "raw_output_character_count": item.raw_output_character_count,
                    "output_was_truncated": item.output_was_truncated,
                    "parse_attempted": item.parse_attempted,
                    "parse_error_summary": item.parse_error_summary,
                    "structured_output_mode": item.structured_output_mode,
                    "response_request_count": item.response_request_count,
                    "web_search_action_count": item.web_search_action_count,
                    "input_tokens": item.input_tokens,
                    "cached_input_tokens": item.cached_input_tokens,
                    "output_tokens": item.output_tokens,
                    "reasoning_tokens": item.reasoning_tokens,
                    "total_tokens": item.total_tokens,
                    "provider_usage": item.usage_metadata,
                }
                for item in attempts
            ],
        },
    )


def _strict_output_config() -> dict[str, object]:
    return {
        "format": {
            "type": "json_schema",
            "name": "AddressResearchResult",
            "description": "Structured public address evidence for one exact restaurant.",
            "schema": to_strict_json_schema(AddressResearchResult),
            "strict": True,
        },
        "verbosity": "low",
    }


def _strict_schema_unsupported(error: BaseException) -> bool:
    text = str(error).casefold()
    status_code = getattr(error, "status_code", None)
    return status_code == 400 and (
        ("json_schema" in text or "structured output" in text)
        and ("not support" in text or "unsupported" in text)
    )


def _hostname(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").casefold().removeprefix("www.")
    except ValueError:
        return ""


def _restricted_source(url: str) -> bool:
    hostname = _hostname(url)
    return any(
        (hostname == domain or hostname.endswith(f".{domain}"))
        and policy.get("policy") == "lead_only"
        for domain, policy in SOURCE_POLICY_REGISTRY.items()
    )


def _source_policy(url: str) -> dict[str, str]:
    hostname = _hostname(url)
    for domain, policy in SOURCE_POLICY_REGISTRY.items():
        if hostname == domain or hostname.endswith(f".{domain}"):
            return policy
    return {}


def _apply_source_policy(source: AddressSourceEvidence) -> AddressSourceEvidence:
    """Apply host policy after model parsing so source labels cannot bypass it."""

    hostname = _hostname(source.source_url)
    policy = _source_policy(source.source_url)
    warnings = list(source.warnings)
    updates: dict[str, object] = {}
    if policy.get("policy") == "lead_only":
        updates.update(
            source_type="lead_only_restricted_platform",
            restaurant_controlled=False,
            supports_candidate_address=False,
        )
        warnings.append(f"restricted_platform_lead_only:{hostname or 'unknown'}")
    elif policy.get("policy") == "third_party_press_release_host":
        if source.source_type == "restaurant_submission" and not source.restaurant_controlled:
            updates["source_type"] = "attributed_press_release"
            warnings.append("third_party_hosted_press_release_reclassified")
    if warnings != source.warnings:
        updates["warnings"] = list(dict.fromkeys(warnings))[:12]
    return source.model_copy(update=updates) if updates else source


def _identity_key(value: str | None) -> str:
    normalized = normalize_location_name(value)
    return "".join(character for character in normalized if character.isalnum())


def _name_matches(candidate: dict[str, object], matched_name: str | None) -> bool:
    actual = _identity_key(matched_name)
    if not actual:
        return False
    expected = {
        _identity_key(str(value))
        for value in (
            candidate.get("name_ja"),
            candidate.get("name_en"),
            candidate.get("title"),
        )
        if value
    }
    if actual in expected:
        return True
    return any(
        SequenceMatcher(None, actual, name).ratio() >= 0.90
        for name in expected
        if min(len(actual), len(name)) >= 4
    )


def _name_matches_exactly(candidate: dict[str, object], matched_name: str | None) -> bool:
    actual = _identity_key(matched_name)
    if not actual:
        return False
    return actual in {
        _identity_key(str(value))
        for value in (
            candidate.get("name_ja"),
            candidate.get("name_en"),
            candidate.get("title"),
        )
        if value
    }


def _ward_in_text(*values: str | None) -> str | None:
    direct = canonical_tokyo_ward(*values)
    if direct:
        return direct
    text = normalize_location_name(" ".join(value or "" for value in values))
    for ward, aliases in TOKYO_WARD_NAMES.items():
        if any(normalize_location_name(alias) in text for alias in aliases):
            return ward
    return None


def _street_level(result: AddressResearchResult) -> bool:
    raw = str(result.address_raw or "").strip()
    street = normalize_japanese_street_or_block(result.street_or_block)
    if not raw or not street:
        return False
    has_number = any(character.isdigit() for character in street)
    has_block_marker = "-" in street
    return len(raw) >= 8 and has_number and has_block_marker


_HYPHEN_VARIANTS = "‐‑‒–—―ー－−﹣ｰ"
_HYPHEN_TRANSLATION = str.maketrans({character: "-" for character in _HYPHEN_VARIANTS})


def _comparison_text(value: str | None) -> str:
    """Canonical Unicode text used only for comparison; raw evidence is never rewritten."""

    return unicodedata.normalize("NFKC", str(value or "")).translate(_HYPHEN_TRANSLATION)


def _canonical_street(value: str | None) -> str:
    text = normalize_japanese_street_or_block(value)
    return "".join(character for character in text if character.isalnum() or character == "-")


def _canonical_floor(value: str | None) -> str:
    text = re.sub(r"\s+", "", _comparison_text(value)).casefold()
    basement = re.fullmatch(r"(?:地下|b)(\d+)(?:階|f)?", text)
    if basement:
        return f"b{basement.group(1)}f"
    above = re.fullmatch(r"(\d+)(?:階|f)", text)
    if above:
        return f"{above.group(1)}f"
    return "".join(character for character in text if character.isalnum())


def _normalized_address(value: str | None, *, component: str | None = None) -> str:
    if component == "prefecture":
        return canonical_tokyo_prefecture(value)
    if component == "neighborhood":
        return normalize_tokyo_neighborhood(value)[0]
    if component == "street_or_block":
        return _canonical_street(value)
    if component == "floor":
        return _canonical_floor(value)
    return "".join(
        character
        for character in _comparison_text(normalize_location_name(value)).casefold()
        if character.isalnum()
    )


_NON_ADDRESS_REFERENCE = re.compile(
    r"\b(?:navigation|access|landmark) reference\b|"
    r"\bneighbor(?:ing|ing-building)? building\b|\bbuilding next door\b|"
    r"\bnot (?:as |the )?(?:the )?restaurant(?:'s)? (?:own )?address\b|"
    r"隣のビル|ナビ(?:ゲーション)?(?:用|設定|住所)|目印",
    re.IGNORECASE,
)


def _is_non_address_reference(item: object) -> bool:
    text = " ".join(
        str(_value(item, field, "") or "")
        for field in ("summary", "address_evidence_summary", "warnings")
    )
    return bool(_NON_ADDRESS_REFERENCE.search(_comparison_text(text)))


def _canonicalize_address_observation(
    observation: dict[str, str | None],
) -> dict[str, str | None]:
    """Reconcile a chome split across neighborhood and street components."""

    canonical = dict(observation)
    neighborhood, chome = normalize_tokyo_neighborhood(canonical.get("neighborhood"))
    if neighborhood:
        canonical["neighborhood"] = neighborhood
    street = normalize_japanese_street_or_block(canonical.get("street_or_block"))
    if chome and street:
        parts = street.split("-")
        if len(parts) < 3:
            street = "-".join((chome, *parts))
    if street:
        canonical["street_or_block"] = street
    return canonical


_FLOOR_PATTERN = re.compile(
    r"(?:地下\s*\d+\s*階|\d+\s*階|B\s*\d+\s*F|\d+\s*F)", re.IGNORECASE
)
_STREET_PATTERN = re.compile(
    r"[0-9０-９]+(?:丁目)?(?:[-‐‑‒–—―ー－−番地号]\s*[0-9０-９]+)+(?:[-‐‑‒–—―ー－−]\s*[0-9０-９]+)*"
)
_PAGE_TEXT_MARKERS = (
    "大きな地図を見る",
    "周辺のお店を探す",
    "このお店は",
    "から移転しています",
    "から移転しました",
)


def _sanitize_building(value: str | None) -> str | None:
    text = str(value or "").strip(" ,　")
    if not text:
        return None
    first_marker = min(
        (position for marker in _PAGE_TEXT_MARKERS if (position := text.find(marker)) >= 0),
        default=-1,
    )
    if first_marker >= 0:
        text = text[:first_marker].strip(" ,　。:：;；「」\"'")
    if not text or any(marker in text for marker in _PAGE_TEXT_MARKERS):
        return None
    if re.search(r"(?:旧住所|移転前|以前の住所|現住所|移転先)", text):
        return None
    return text


def _sanitize_floor(value: str | None) -> str | None:
    text = str(value or "").strip()
    if not text or any(marker in text for marker in _PAGE_TEXT_MARKERS):
        return None
    match = _FLOOR_PATTERN.fullmatch(text)
    return text if match else None


def _temporality_from_evidence(
    evidence: object,
    *,
    raw: str | None,
    street_or_block: str | None,
) -> AddressTemporality:
    declared = str(_value(evidence, "address_temporality", "unknown") or "unknown")
    if declared in {"current", "historical", "future"}:
        return declared  # type: ignore[return-value]

    summaries = _comparison_text(" ".join(
        str(_value(evidence, field, "") or "")
        for field in ("address_evidence_summary", "summary")
    ))
    warnings = _comparison_text(
        " ".join(str(item) for item in (_value(evidence, "warnings", []) or []))
    )
    if re.search(r"(?:現住所|移転先)", summaries):
        return "current"
    if re.search(r"(?:旧住所|移転前(?:の)?住所|以前の住所)", summaries):
        return "historical"
    if re.search(r"(?:移転予定|将来の住所)", summaries):
        return "future"
    if re.search(r"(?:現住所|移転先)", warnings):
        return "current"
    if re.search(r"(?:旧住所|移転前(?:の)?住所|以前の住所)", warnings) and not re.search(
        r"(?:可能性|かもしれ)", warnings
    ):
        return "historical"
    if re.search(r"(?:移転予定|将来の住所)", warnings):
        return "future"

    displayed = _comparison_text(raw)
    target = _canonical_street(street_or_block)
    if target:
        for match in re.finditer(r"([^\s。]{1,100})[」\"']?から移転", displayed):
            if target in _canonical_street(match.group(1)):
                return "historical"
    if re.search(r"(?:現住所|移転先)", displayed):
        return "current"
    if re.search(r"(?:移転予定|将来の住所)", displayed):
        return "future"
    return "unknown"


def _prepare_result_evidence(result: AddressResearchResult) -> AddressResearchResult:
    """Reapply deterministic policy, temporality, and field hygiene to any result."""

    sources: list[AddressSourceEvidence] = []
    for original in result.source_evidence:
        source = _apply_source_policy(original)
        temporality = _temporality_from_evidence(
            source,
            raw=source.address_text_as_displayed,
            street_or_block=source.street_or_block,
        )
        sources.append(
            source.model_copy(
                update={
                    "address_temporality": temporality,
                    "building": _sanitize_building(source.building),
                    "floor": _sanitize_floor(source.floor),
                }
            )
        )
    conflicts = [
        item.model_copy(
            update={
                "address_temporality": _temporality_from_evidence(
                    item, raw=item.address_raw, street_or_block=item.street_or_block
                ),
                "building": _sanitize_building(item.building),
                "floor": _sanitize_floor(item.floor),
            }
        )
        for item in result.conflicting_address_candidates
    ]
    prepared = result.model_copy(
        update={
            "building": _sanitize_building(result.building),
            "floor": _sanitize_floor(result.floor),
            "source_evidence": sources,
            "conflicting_address_candidates": conflicts,
        }
    )
    temporal_signatures: dict[tuple[str, ...], AddressTemporality] = {}
    for item, raw in [
        *((source, source.address_text_as_displayed) for source in sources),
        *((conflict, conflict.address_raw) for conflict in conflicts),
    ]:
        temporality = str(_value(item, "address_temporality", "unknown"))
        if temporality not in {"historical", "future"}:
            continue
        components = _derived_components(raw, reference=prepared, explicit=item)
        street = _normalized_address(
            components.get("street_or_block"), component="street_or_block"
        )
        if not street:
            continue
        signature = (
            _normalized_address(components.get("prefecture")),
            canonical_tokyo_ward(components.get("municipality_or_ward"))
            or _normalized_address(components.get("municipality_or_ward")),
            _normalized_address(components.get("neighborhood")),
            street,
        )
        temporal_signatures[signature] = temporality  # type: ignore[assignment]

    def propagated(item: object, raw: str | None) -> AddressTemporality:
        existing = str(_value(item, "address_temporality", "unknown"))
        if existing != "unknown":
            return existing  # type: ignore[return-value]
        components = _derived_components(raw, reference=prepared, explicit=item)
        street = _normalized_address(
            components.get("street_or_block"), component="street_or_block"
        )
        if not street:
            return "unknown"
        signature = (
            _normalized_address(components.get("prefecture")),
            canonical_tokyo_ward(components.get("municipality_or_ward"))
            or _normalized_address(components.get("municipality_or_ward")),
            _normalized_address(components.get("neighborhood")),
            street,
        )
        return temporal_signatures.get(signature, "unknown")

    return prepared.model_copy(
        update={
            "source_evidence": [
                source.model_copy(
                    update={
                        "address_temporality": propagated(
                            source, source.address_text_as_displayed
                        )
                    }
                )
                for source in sources
            ],
            "conflicting_address_candidates": [
                conflict.model_copy(
                    update={
                        "address_temporality": propagated(conflict, conflict.address_raw)
                    }
                )
                for conflict in conflicts
            ],
        }
    )


def _trim_postal_prefix(value: str) -> str:
    return re.sub(r"^\s*〒?\s*\d{3}[-ー－]?\d{4}\s*", "", value).strip()


def _derived_components(
    raw: str | None,
    *,
    reference: AddressResearchResult,
    explicit: object,
) -> dict[str, str | None]:
    text = str(raw or "").strip()
    values: dict[str, str | None] = {}
    for component in (
        "postal_code", "prefecture", "municipality_or_ward", "neighborhood",
        "street_or_block", "building", "floor", "suite_or_unit", "entrance",
    ):
        supplied = _value(explicit, component, None)
        values[component] = str(supplied).strip() if supplied else None
    values["building"] = _sanitize_building(values["building"])
    values["floor"] = _sanitize_floor(values["floor"])
    if not text:
        return values
    postal = re.search(r"(?:〒\s*)?(\d{3}[-ー－]?\d{4})", text)
    values["postal_code"] = values["postal_code"] or (postal.group(1) if postal else None)
    if not values["prefecture"] and "東京都" in text:
        values["prefecture"] = "東京都"
    values["municipality_or_ward"] = values["municipality_or_ward"] or _ward_in_text(text)
    for component in ("neighborhood", "street_or_block"):
        reference_value = str(getattr(reference, component) or "").strip()
        if not values[component] and reference_value and reference_value in text:
            values[component] = reference_value
    if not values["street_or_block"]:
        match = _STREET_PATTERN.search(text)
        if match:
            values["street_or_block"] = match.group(0).replace(" ", "")
    floor_match = _FLOOR_PATTERN.search(text)
    values["floor"] = values["floor"] or (floor_match.group(0).replace(" ", "") if floor_match else None)
    if values["building"]:
        cleaned_building = _FLOOR_PATTERN.sub("", str(values["building"])).strip(" ,　")
        values["building"] = _sanitize_building(cleaned_building)
    if not values["building"] and values["street_or_block"]:
        position = text.find(str(values["street_or_block"]))
        if position >= 0:
            tail = text[position + len(str(values["street_or_block"])) :].strip(" ,　")
            if tail:
                tail = _FLOOR_PATTERN.sub("", tail).strip(" ,　")
                values["building"] = _sanitize_building(tail)
    return values


def _agreement_state(values: list[str], component: str) -> AgreementState:
    def semantic(value: str) -> str:
        if component == "municipality_or_ward":
            return canonical_tokyo_ward(value) or _normalized_address(value, component=component)
        return _normalized_address(value, component=component)

    distinct = {semantic(value) for value in values if value}
    distinct.discard("")
    if not distinct:
        return "missing"
    if len(distinct) > 1:
        return "conflicts"
    return "agrees" if len(values) > 1 else "single_source"


def compare_address_components(result: AddressResearchResult) -> AddressComponentAgreement:
    """Compare original source strings without rewriting or merging disputed details."""

    component_names = (
        "postal_code", "prefecture", "municipality_or_ward", "neighborhood",
        "street_or_block", "building", "floor", "suite_or_unit", "entrance",
    )
    result = _prepare_result_evidence(result)
    observations: list[dict[str, str | None]] = [
        _derived_components(result.address_raw, reference=result, explicit=result)
    ]
    excluded_temporal_evidence: list[dict[str, object]] = []
    excluded_non_address_evidence: list[dict[str, object]] = []
    for source in result.source_evidence:
        if not source.supports_candidate_address and _is_non_address_reference(source):
            excluded_non_address_evidence.append(
                {
                    "kind": "source_evidence",
                    "reason": "navigation_or_landmark_reference",
                    "address_text": source.address_text_as_displayed,
                    "source_url": source.source_url,
                }
            )
        elif source.address_temporality in {"historical", "future"}:
            excluded_temporal_evidence.append(
                {
                    "kind": "source_evidence",
                    "temporality": source.address_temporality,
                    "address_text": source.address_text_as_displayed,
                    "source_url": source.source_url,
                }
            )
        elif source.address_text_as_displayed:
            observations.append(
                _derived_components(
                    source.address_text_as_displayed, reference=result, explicit=source
                )
            )
    for conflict in result.conflicting_address_candidates:
        if _is_non_address_reference(conflict):
            excluded_non_address_evidence.append(
                {
                    "kind": "conflicting_address_candidate",
                    "reason": "navigation_or_landmark_reference",
                    "address_text": conflict.address_raw,
                    "source_urls": list(conflict.source_urls),
                }
            )
        elif conflict.address_temporality in {"historical", "future"}:
            excluded_temporal_evidence.append(
                {
                    "kind": "conflicting_address_candidate",
                    "temporality": conflict.address_temporality,
                    "address_text": conflict.address_raw,
                    "source_urls": list(conflict.source_urls),
                }
            )
        else:
            observations.append(
                _derived_components(conflict.address_raw, reference=result, explicit=conflict)
            )

    # Some sources put chome in the neighborhood while others include it in the
    # numeric street component. Reconcile that split before component voting.
    observations = [_canonicalize_address_observation(item) for item in observations]
    component_values: dict[str, list[str]] = {}
    states: dict[str, AgreementState] = {}
    for component in component_names:
        exact_values = [str(item[component]) for item in observations if item.get(component)]
        unique_exact = list(dict.fromkeys(exact_values))
        component_values[component] = unique_exact
        states[component] = _agreement_state(exact_values, component)

    conflicting = [name for name, state in states.items() if state == "conflicts"]
    material_names = {"prefecture", "municipality_or_ward", "neighborhood", "street_or_block"}
    material = [name for name in conflicting if name in material_names]
    non_material = [name for name in conflicting if name not in material_names]
    required = ("prefecture", "municipality_or_ward", "street_or_block")
    core_verified = not material and all(states[name] in {"agrees", "single_source"} for name in required)
    full_verified = core_verified and not non_material

    core: str | None = None
    if core_verified and result.address_raw and result.street_or_block:
        raw = _trim_postal_prefix(result.address_raw)
        end = raw.find(result.street_or_block)
        if end >= 0:
            core = raw[: end + len(result.street_or_block)].strip(" ,　")
    if core_verified and not core:
        core = "".join(
            str(getattr(result, name) or "")
            for name in ("prefecture", "municipality_or_ward", "neighborhood", "street_or_block")
        ) or None

    unresolved = None
    if conflicting:
        parts = [
            f"{name}: {' vs '.join(component_values[name])}"
            for name in conflicting
        ]
        unresolved = "Conflicting address components — " + "; ".join(parts)
    street = str(result.street_or_block or "")
    precision = "unknown"
    if core_verified:
        precision = "parcel_or_street_number" if any(c.isdigit() for c in street) else "block"
    elif result.neighborhood and not material:
        precision = "neighborhood"
    elif result.municipality_or_ward and not material:
        precision = "ward"
    return AddressComponentAgreement(
        prefecture_agreement=states["prefecture"],
        municipality_or_ward_agreement=states["municipality_or_ward"],
        neighborhood_agreement=states["neighborhood"],
        street_or_block_agreement=states["street_or_block"],
        building_agreement=states["building"],
        floor_agreement=states["floor"],
        postal_code_agreement=states["postal_code"],
        agreed_core_address=core,
        conflicting_components=conflicting,
        non_material_conflicting_components=non_material,
        material_conflicting_components=material,
        component_values=component_values,
        excluded_temporal_evidence=excluded_temporal_evidence,
        excluded_non_address_evidence=excluded_non_address_evidence,
        core_address_verified=core_verified,
        full_address_verified=full_verified,
        unresolved_address_detail=unresolved,
        proposed_location_precision=precision,
        map_location_approximate=core_verified and not full_verified,
    )


def evaluate_address_result(
    candidate: dict[str, object], result: AddressResearchResult
) -> AddressAcceptance:
    result = _prepare_result_evidence(result)
    if result.identity_status in {"not_found", "error"} or not result.address_raw:
        return AddressAcceptance(
            "not_found",
            "address_not_found" if result.identity_status != "error" else "address_research_failed",
            ("no_explicit_candidate_address",),
        )
    if result.identity_status in {"conflicting", "ambiguous"}:
        return AddressAcceptance(
            "conflicting",
            "address_conflicting",
            ("restaurant_identity_conflicting_or_ambiguous",),
            "rejected",
        )

    agreement = compare_address_components(result)
    if agreement.material_conflicting_components:
        return AddressAcceptance(
            "conflicting",
            "address_conflicting",
            tuple(
                f"material_component_conflict:{component}"
                for component in agreement.material_conflicting_components
            ),
            "rejected",
        )
    hard_blockers: list[str] = []
    if not _name_matches(candidate, result.matched_name):
        hard_blockers.append("matched_name_not_exact_or_near_exact")
    if result.identity_confidence < 0.6:
        hard_blockers.append("identity_confidence_too_low")
    if result.branch_name:
        branch = _identity_key(result.branch_name)
        known_names = " ".join(
            _identity_key(str(candidate.get(field) or ""))
            for field in ("name_ja", "name_en", "title")
        )
        if branch and branch not in known_names:
            hard_blockers.append("unresolved_branch_ambiguity")

    allowed_wards = {
        ward
        for area in _areas(candidate)
        if (ward := canonical_tokyo_ward(area))
    }
    discovered_ward = _ward_in_text(
        result.municipality_or_ward,
        result.address_raw,
    )
    if allowed_wards and discovered_ward not in allowed_wards:
        hard_blockers.append("address_ward_outside_reviewed_discovery_areas")
    if not _street_level(result):
        hard_blockers.append("address_is_not_explicit_street_level")
    if not agreement.core_address_verified:
        hard_blockers.append("core_address_not_verified")

    closure_text = " ".join(
        [result.research_summary, result.recommended_action, *result.warnings]
        + [warning for source in result.source_evidence for warning in source.warnings]
    ).casefold()
    if re.search(r"(?:閉店|閉業|廃業|営業終了|permanently closed|replaced by)", closure_text):
        hard_blockers.append("restaurant_may_be_closed_or_replaced")
    if hard_blockers:
        return AddressAcceptance(
            "needs_review",
            "address_needs_review",
            tuple(dict.fromkeys(hard_blockers)),
            "rejected",
        )

    qualifying_strong = 0
    secondary_domains: set[str] = set()
    weak_domains: set[str] = set()
    associated_sources = 0
    restricted_associated_sources = 0
    for source in result.source_evidence:
        if source.address_temporality in {"historical", "future"}:
            continue
        try:
            date.fromisoformat(source.accessed_at[:10])
        except ValueError:
            continue
        if not source.source_url.startswith(("http://", "https://")):
            continue
        source_components = _canonicalize_address_observation(
            _derived_components(
                source.address_text_as_displayed, reference=result, explicit=source
            )
        )
        expected_components = _canonicalize_address_observation(
            _derived_components(result.address_raw, reference=result, explicit=result)
        )
        material_matches = True
        for component in ("prefecture", "municipality_or_ward", "neighborhood", "street_or_block"):
            expected = expected_components.get(component)
            observed = source_components.get(component)
            if expected and observed:
                if component == "municipality_or_ward":
                    equal = (canonical_tokyo_ward(expected) or _normalized_address(expected)) == (
                        canonical_tokyo_ward(observed) or _normalized_address(observed)
                    )
                else:
                    equal = _normalized_address(
                        expected, component=component
                    ) == _normalized_address(observed, component=component)
                if not equal:
                    material_matches = False
        if not material_matches or not source_components.get("street_or_block"):
            continue
        if not source.identity_evidence_summary.strip() or not source.address_evidence_summary.strip():
            continue
        associated_sources += 1
        if (
            source.source_type == "lead_only_restricted_platform"
            or _restricted_source(source.source_url)
        ):
            restricted_associated_sources += 1
        hostname = _hostname(source.source_url)
        if source.source_type in STRONG_SOURCE_TYPES:
            if (
                source.source_type not in CONTROLLED_STRONG_SOURCE_TYPES
                or source.restaurant_controlled
            ):
                qualifying_strong += 1
        elif source.source_type in SECONDARY_SOURCE_TYPES:
            if hostname:
                secondary_domains.add(hostname)
        elif hostname:
            weak_domains.add(hostname)

    if associated_sources < 1:
        return AddressAcceptance(
            "needs_review",
            "address_needs_review",
            ("missing_public_source_address_association",),
            "rejected",
        )
    if (
        restricted_associated_sources == associated_sources
        and not _name_matches_exactly(candidate, result.matched_name)
    ):
        return AddressAcceptance(
            "needs_review",
            "address_needs_review",
            ("restricted_source_requires_exact_identity",),
            "rejected",
        )
    confirmed = result.identity_status == "confirmed" and result.identity_confidence >= 0.85
    if qualifying_strong >= 1 and confirmed:
        return AddressAcceptance("accepted", "address_verified", (), "verified")
    if qualifying_strong >= 1 or secondary_domains or len(weak_domains) >= 2:
        tier = "provisional_high" if confirmed else "provisional_medium"
    else:
        tier = "provisional_medium"
    reasons = [f"mvp_{tier}"]
    if not confirmed:
        reasons.append("identity_probable_but_consistent")
    if weak_domains and not secondary_domains and not qualifying_strong:
        reasons.append("lead_only_source_used_provisionally")
    return AddressAcceptance(
        "provisional",
        "address_provisionally_accepted",
        tuple(reasons),
        tier,
    )


def _merge_response_audit(
    result: AddressResearchResult,
    *,
    generated_queries: list[str],
    metadata: AddressCallMetadata,
    max_retained_sources: int = DEFAULT_MAX_RETAINED_SOURCES,
    max_evidence_summary_chars: int = DEFAULT_MAX_EVIDENCE_SUMMARY_CHARS,
    max_conflicting_candidates: int = DEFAULT_MAX_CONFLICTING_CANDIDATES,
) -> AddressResearchResult:
    accessed = datetime.now(UTC).date().isoformat()
    sources = []
    for original in result.source_evidence:
        source = _apply_source_policy(original)
        derived = _derived_components(
            source.address_text_as_displayed, reference=result, explicit=source
        )
        sources.append(
            source.model_copy(
                update={
                    "accessed_at": accessed,
                    "identity_evidence_summary": source.identity_evidence_summary[
                        :max_evidence_summary_chars
                    ],
                    "address_evidence_summary": source.address_evidence_summary[
                        :max_evidence_summary_chars
                    ],
                    **{
                        component: value
                        for component, value in derived.items()
                        if value and not getattr(source, component)
                    },
                }
            )
        )
    existing_urls = {source.source_url for source in sources}
    for citation in metadata.citations:
        if citation["url"] in existing_urls:
            continue
        sources.append(
            AddressSourceEvidence(
                source_type="search_result_snippet",
                source_url=citation["url"],
                source_title=citation.get("title") or None,
                source_language="unknown",
                accessed_at=accessed,
                identity_evidence_summary="Responses API URL citation retained as a lead.",
                address_evidence_summary="Not accepted independently as address evidence.",
                restaurant_controlled=False,
                supports_candidate_address=False,
                warnings=["citation_only_lead"],
            )
        )
    return _prepare_result_evidence(
        result.model_copy(
            update={
                "source_evidence": sources[:max_retained_sources],
                "conflicting_address_candidates": result.conflicting_address_candidates[
                    :max_conflicting_candidates
                ],
                "search_queries_attempted": list(
                    dict.fromkeys(result.search_queries_attempted)
                )[:12],
            }
        )
    )


def research_address(
    candidate: dict[str, object],
    *,
    client: OpenAI,
    model: str,
    max_search_actions: int = DEFAULT_MAX_SEARCH_ACTIONS,
    max_retained_sources: int = DEFAULT_MAX_RETAINED_SOURCES,
    max_evidence_summary_chars: int = DEFAULT_MAX_EVIDENCE_SUMMARY_CHARS,
    max_conflicting_candidates: int = DEFAULT_MAX_CONFLICTING_CANDIDATES,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    compact_research: bool = True,
    retry_truncated: bool = False,
) -> AddressResearchCall:
    queries = list(
        candidate.get("_prepared_address_queries")
        or generate_address_queries(candidate, max_search_actions=max_search_actions)
    )
    prompt_input = [
        {"role": "system", "content": ADDRESS_RESEARCH_INSTRUCTIONS},
        {
            "role": "user",
            "content": _address_prompt(candidate, queries)
            + (
                "\nCompact mode: retain only decisive sources, one-sentence summaries, "
                f"at most {max_retained_sources} sources and "
                f"{max_conflicting_candidates} conflicting candidates."
                if compact_research
                else ""
            ),
        },
    ]
    attempts: list[AddressCallMetadata] = []
    output_budget = max_output_tokens
    result: AddressResearchResult | None = None
    for attempt_index in range(2 if retry_truncated else 1):
        used_actions = sum(item.web_search_action_count for item in attempts)
        remaining_actions = max_search_actions - used_actions
        if remaining_actions < 1:
            metadata = _combine_attempt_metadata(
                attempts, requested_limit=max_search_actions
            )
            raise AddressResearchFailure(
                "retry_blocked_by_web_action_budget",
                "A truncated response used the full web-action budget; no retry was made.",
                metadata=metadata,
                generated_queries=tuple(queries),
            )
        request_count = 1
        structured_output_mode = "strict_json_schema"
        try:
            response = client.responses.create(
                model=model,
                reasoning={"effort": "low"},
                tools=[{"type": "web_search", "search_context_size": "low"}],
                include=["web_search_call.results"],
                max_tool_calls=remaining_actions,
                max_output_tokens=output_budget,
                input=prompt_input,
                text=_strict_output_config(),
            )
        except Exception as exc:
            if not _strict_schema_unsupported(exc):
                raise
            request_count += 1
            structured_output_mode = "json_object_fallback"
            response = client.responses.create(
                model=model,
                reasoning={"effort": "low"},
                tools=[{"type": "web_search", "search_context_size": "low"}],
                include=["web_search_call.results"],
                max_tool_calls=remaining_actions,
                max_output_tokens=output_budget,
                input=prompt_input,
                text={"format": {"type": "json_object"}, "verbosity": "low"},
            )

        current = extract_response_metadata(response, fallback_model=model)
        current = replace(
            current,
            response_request_count=request_count,
            requested_web_action_limit=max_search_actions,
            structured_output_mode=structured_output_mode,
        )
        status = current.response_status or "unknown"
        incomplete_reason = current.incomplete_reason
        raw_output = _response_output_text(response)
        failure_code: str | None = None
        failure_summary: str | None = None
        if status == "incomplete":
            if incomplete_reason in {"max_output_tokens", "max_tokens"}:
                failure_code = "output_truncated"
                failure_summary = (
                    f"Structured output reached the {output_budget}-token response limit."
                )
            else:
                failure_code = "incomplete_response"
                failure_summary = f"Provider returned incomplete status: {incomplete_reason or 'unknown'}."
        elif status in {"failed", "cancelled"}:
            provider_error = _value(response, "error", None)
            provider_code = str(_value(provider_error, "code", "") or status)
            failure_code = "provider_error"
            failure_summary = f"Provider response failed with code {provider_code}."
        else:
            refusal = _response_refusal(response)
            if refusal:
                failure_code = "provider_refusal"
                failure_summary = refusal
            elif not raw_output.strip():
                failure_code = "missing_structured_output"
                failure_summary = "Provider returned no structured output text."

        if failure_code:
            current = replace(
                current,
                parse_attempted=False,
                parse_error_summary=failure_summary,
            )
            attempts.append(current)
            can_retry = (
                failure_code == "output_truncated"
                and retry_truncated
                and attempt_index == 0
                and sum(item.web_search_action_count for item in attempts) < max_search_actions
            )
            if can_retry:
                output_budget = max(output_budget * 2, output_budget + 2000)
                continue
            metadata = _combine_attempt_metadata(
                attempts, requested_limit=max_search_actions
            )
            raise AddressResearchFailure(
                failure_code,
                failure_summary or "Address research response was incomplete.",
                metadata=metadata,
                generated_queries=tuple(queries),
            )

        try:
            result = AddressResearchResult.model_validate_json(raw_output)
            current = replace(current, parse_attempted=True, parse_error_summary=None)
        except ValidationError as exc:
            summary = _validation_error_summary(exc)
            current = replace(
                current,
                parse_attempted=True,
                parse_error_summary=summary,
            )
            attempts.append(current)
            metadata = _combine_attempt_metadata(
                attempts, requested_limit=max_search_actions
            )
            raise AddressResearchFailure(
                "malformed_structured_output",
                summary,
                metadata=metadata,
                generated_queries=tuple(queries),
            ) from None
        attempts.append(current)
        break

    if result is None:
        metadata = _combine_attempt_metadata(attempts, requested_limit=max_search_actions)
        raise AddressResearchFailure(
            "missing_structured_output",
            "Provider returned no valid AddressResearchResult.",
            metadata=metadata,
            generated_queries=tuple(queries),
        )
    metadata = _combine_attempt_metadata(attempts, requested_limit=max_search_actions)
    if any(call.get("status") == "failed" for call in metadata.search_calls):
        raise AddressResearchFailure(
            "web_search_action_failed",
            "A provider web-search action failed.",
            metadata=metadata,
            generated_queries=tuple(queries),
        )
    result = _merge_response_audit(
        result,
        generated_queries=queries,
        metadata=metadata,
        max_retained_sources=max_retained_sources,
        max_evidence_summary_chars=max_evidence_summary_chars,
        max_conflicting_candidates=max_conflicting_candidates,
    )
    acceptance = evaluate_address_result(candidate, result)
    if metadata.limit_exceeded:
        acceptance = AddressAcceptance(
            "failed", "address_research_failed", ("provider_web_action_budget_exceeded",)
        )
    agreement = compare_address_components(result)
    return AddressResearchCall(
        result, acceptance, tuple(queries), metadata, agreement,
        tuple(candidate.get("_cached_address_queries") or ()),
        tuple(candidate.get("_skipped_address_queries") or ()),
    )


def combined_address_call(
    candidate: dict[str, object],
    *,
    result: AddressResearchResult | None,
    response: object,
    model: str,
    max_search_actions: int = DEFAULT_MAX_SEARCH_ACTIONS,
) -> AddressResearchCall:
    """Apply the standalone audit and acceptance path to a combined research response."""

    queries = generate_address_queries(candidate, max_search_actions=max_search_actions)
    metadata = extract_response_metadata(response, fallback_model=model)
    if result is None:
        result = AddressResearchResult(
            identity_status="not_found",
            identity_confidence=0,
            search_queries_attempted=queries,
            warnings=["combined_research_returned_no_address_evidence"],
            recommended_action="run_standalone_address_fallback",
            research_summary="The combined research response did not provide address evidence.",
        )
    result = _merge_response_audit(result, generated_queries=queries, metadata=metadata)
    return AddressResearchCall(
        result=result,
        acceptance=evaluate_address_result(candidate, result),
        generated_queries=tuple(queries),
        metadata=metadata,
        component_agreement=compare_address_components(result),
    )


def _evidence_fingerprint(result: AddressResearchResult) -> str:
    payload = result.model_dump(mode="json", exclude={"search_queries_attempted"})
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def start_address_run(
    db_path: str | Path,
    *,
    place_id: str,
    model: str,
    forced: bool,
    combined_research: bool,
    requested_max_web_actions: int = 0,
) -> int:
    ensure_public_schema(db_path)
    now = _now()
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO address_research_runs (
                public_restaurant_id, provider, model, status, started_at,
                prompt_version, schema_version, forced, combined_research
                , requested_max_web_actions
            ) VALUES (?, 'openai', ?, 'running', ?, ?, ?, ?, ?, ?)
            """,
            (
                place_id,
                model,
                now,
                ADDRESS_PROMPT_VERSION,
                ADDRESS_SCHEMA_VERSION,
                int(forced),
                int(combined_research),
                requested_max_web_actions,
            ),
        )
        connection.execute(
            """
            UPDATE public_restaurants
            SET address_resolution_status='address_research_running', updated_at=?
            WHERE place_id=?
            """,
            (now, place_id),
        )
        connection.commit()
        return int(cursor.lastrowid)


def fail_address_run(
    db_path: str | Path,
    run_id: int,
    error: BaseException,
    *,
    metadata: AddressCallMetadata | None = None,
) -> None:
    now = _now()
    ambiguous = isinstance(
        error,
        (
            TimeoutError,
            asyncio.TimeoutError,
            ConnectionError,
            socket.timeout,
            APITimeoutError,
            APIConnectionError,
        ),
    )
    run_status = "needs_retry" if ambiguous else "failed"
    resolution_status = (
        "address_research_needs_retry" if ambiguous else "address_research_failed"
    )
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT public_restaurant_id FROM address_research_runs WHERE id=?", (run_id,)
        ).fetchone()
        if row is None:
            return
        if metadata is None:
            connection.execute(
                """
                UPDATE address_research_runs SET status=?, completed_at=?, error=?,
                    response_request_count=1 WHERE id=?
                """,
                (run_status, now, f"{type(error).__name__}: {error}"[:2000], run_id),
            )
        else:
            connection.execute(
                """
                UPDATE address_research_runs SET status=?, completed_at=?, error=?,
                    response_id=?, model=?, response_request_count=?, web_search_action_count=?,
                    requested_max_web_actions=?, web_action_limit_reached=?,
                    web_action_limit_exceeded=?, input_tokens=?, cached_input_tokens=?,
                    output_tokens=?, reasoning_tokens=?, total_tokens=?, retry_count=?,
                    usage_metadata_json=? WHERE id=?
                """,
                (
                    run_status,
                    now,
                    f"{type(error).__name__}: {error}"[:2000],
                    metadata.response_id,
                    metadata.model,
                    metadata.response_request_count,
                    metadata.web_search_action_count,
                    metadata.requested_web_action_limit,
                    int(metadata.limit_reached),
                    int(metadata.limit_exceeded),
                    metadata.input_tokens,
                    metadata.cached_input_tokens,
                    metadata.output_tokens,
                    metadata.reasoning_tokens,
                    metadata.total_tokens,
                    metadata.retry_count,
                    json.dumps(
                        {
                            "usage": metadata.usage_metadata,
                            "response_ids": metadata.response_ids,
                            "response_status": metadata.response_status,
                            "incomplete_reason": metadata.incomplete_reason,
                            "raw_output_character_count": metadata.raw_output_character_count,
                            "output_was_truncated": metadata.output_was_truncated,
                            "parse_attempted": metadata.parse_attempted,
                            "parse_error_summary": metadata.parse_error_summary,
                            "structured_output_mode": metadata.structured_output_mode,
                            "search_calls": metadata.search_calls,
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                    ),
                    run_id,
                ),
            )
            for action_index, search_call in enumerate(metadata.search_calls, start=1):
                for query in search_call.get("queries", []):
                    cleaned = _clean_query(str(query))
                    connection.execute(
                        """
                        INSERT INTO address_search_attempts (
                            research_run_id, public_restaurant_id, query, query_fingerprint,
                            search_action_index, search_action_reference, attempted_at,
                            result_status, query_origin
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actual_web_action')
                        """,
                        (
                            run_id,
                            row["public_restaurant_id"],
                            cleaned,
                            _query_fingerprint(cleaned),
                            action_index,
                            str(search_call.get("id") or "") or None,
                            now,
                            str(search_call.get("status") or "unknown"),
                        ),
                    )
        connection.execute(
            """
            UPDATE public_restaurants SET address_resolution_status=?,
                updated_at=? WHERE place_id=?
            """,
            (resolution_status, now, row["public_restaurant_id"]),
        )
        connection.commit()


def recover_address_research_for_retry(
    db_path: str | Path, place_id: str, *, dry_run: bool = False
) -> dict[str, object]:
    """Explicitly authorize one later address fallback without making a request."""

    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        candidate = connection.execute(
            "SELECT place_id, address_resolution_status FROM public_restaurants WHERE place_id=?",
            (place_id,),
        ).fetchone()
        if candidate is None:
            raise ValueError(f"Unknown place_id: {place_id}")
        if connection.execute(
            "SELECT 1 FROM verified_restaurant_addresses WHERE public_restaurant_id=?",
            (place_id,),
        ).fetchone():
            raise ValueError("Completed accepted address research cannot be reset")
        run = connection.execute(
            """
            SELECT id, status FROM address_research_runs
            WHERE public_restaurant_id=? AND combined_research=0
            ORDER BY id DESC LIMIT 1
            """,
            (place_id,),
        ).fetchone()
        if run is None or run["status"] not in {"running", "needs_retry", "failed"}:
            raise ValueError("No interrupted or failed standalone address run is recoverable")
        result = {
            "place_id": place_id,
            "dry_run": dry_run,
            "address_run_id": int(run["id"]),
            "previous_status": run["status"],
            "new_status": "retry_authorized",
            "openai_requests_made": 0,
        }
        if dry_run:
            return result
        now = _now()
        connection.execute(
            """
            UPDATE address_research_runs
            SET status='retry_authorized', completed_at=COALESCE(completed_at, ?),
                error=COALESCE(error, 'Operator recovered interrupted address request')
            WHERE id=?
            """,
            (now, run["id"]),
        )
        connection.execute(
            """
            UPDATE public_restaurants
            SET address_resolution_status='address_not_researched', updated_at=?
            WHERE place_id=?
            """,
            (now, place_id),
        )
        connection.commit()
        return result


def record_generated_queries(
    db_path: str | Path,
    *,
    run_id: int,
    place_id: str,
    queries: list[str],
) -> None:
    now = _now()
    with connect(db_path) as connection:
        for query in queries:
            connection.execute(
                """
                INSERT INTO address_search_attempts (
                    research_run_id, public_restaurant_id, query, query_fingerprint,
                    attempted_at, result_status, query_origin
                ) VALUES (?, ?, ?, ?, ?, 'generated', 'fiyu_generated')
                """,
                (run_id, place_id, query, _query_fingerprint(query), now),
            )
        connection.commit()


def persist_address_call(
    db_path: str | Path,
    *,
    place_id: str,
    run_id: int,
    call: AddressResearchCall,
    verified_by: str = "deterministic_address_evidence_v1",
) -> int:
    now = _now()
    result = call.result
    metadata = call.metadata
    fingerprint = _evidence_fingerprint(result)
    agreement = call.component_agreement or compare_address_components(result)
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE address_research_runs SET response_id=?, model=?, status='completed',
                completed_at=?, error=NULL, response_request_count=?, web_search_action_count=?,
                requested_max_web_actions=?, web_action_limit_reached=?,
                web_action_limit_exceeded=?,
                input_tokens=?, cached_input_tokens=?, output_tokens=?, reasoning_tokens=?,
                total_tokens=?, retry_count=?, usage_metadata_json=? WHERE id=?
            """,
            (
                metadata.response_id,
                metadata.model,
                now,
                metadata.response_request_count,
                metadata.web_search_action_count,
                metadata.requested_web_action_limit,
                int(metadata.limit_reached),
                int(metadata.limit_exceeded),
                metadata.input_tokens,
                metadata.cached_input_tokens,
                metadata.output_tokens,
                metadata.reasoning_tokens,
                metadata.total_tokens,
                metadata.retry_count,
                json.dumps(
                    {
                        "usage": metadata.usage_metadata,
                        "response_ids": metadata.response_ids,
                        "response_status": metadata.response_status,
                        "incomplete_reason": metadata.incomplete_reason,
                        "raw_output_character_count": metadata.raw_output_character_count,
                        "output_was_truncated": metadata.output_was_truncated,
                        "parse_attempted": metadata.parse_attempted,
                        "parse_error_summary": metadata.parse_error_summary,
                        "structured_output_mode": metadata.structured_output_mode,
                        "citations": list(metadata.citations),
                        "search_calls": list(metadata.search_calls),
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                ),
                run_id,
            ),
        )
        for index, search_call in enumerate(metadata.search_calls, start=1):
            reference = str(search_call.get("id") or "") or None
            status = str(search_call.get("status") or "unknown")
            for query in search_call.get("queries", []):
                cleaned = _clean_query(str(query))
                connection.execute(
                    """
                    INSERT INTO address_search_attempts (
                        research_run_id, public_restaurant_id, query, query_fingerprint,
                        search_action_index, search_action_reference, attempted_at,
                        result_status, query_origin
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actual_web_action')
                    """,
                    (run_id, place_id, cleaned, _query_fingerprint(cleaned), index,
                     reference, now, status),
                )
        for query in result.search_queries_attempted:
            connection.execute(
                """
                INSERT INTO address_search_attempts (
                    research_run_id, public_restaurant_id, query, query_fingerprint,
                    attempted_at, result_status, query_origin
                ) VALUES (?, ?, ?, ?, ?, 'model_reported', 'model_requested')
                """,
                (run_id, place_id, query, _query_fingerprint(query), now),
            )
        cursor = connection.execute(
            """
            INSERT INTO address_evidence (
                public_restaurant_id, research_run_id, identity_status, identity_confidence,
                matched_name, branch_name, address_raw, postal_code, prefecture,
                municipality_or_ward, neighborhood, street_or_block, building,
                floor, suite_or_unit, entrance, component_agreement_json,
                agreed_core_address, core_address_verified, full_address_verified,
                unresolved_address_detail, proposed_location_precision,
                map_location_approximate,
                source_evidence_json, conflicting_addresses_json, search_queries_json,
                warnings_json, recommended_action, research_summary, acceptance_status,
                acceptance_reasons_json, evidence_fingerprint, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                place_id,
                run_id,
                result.identity_status,
                result.identity_confidence,
                result.matched_name,
                result.branch_name,
                result.address_raw,
                result.postal_code,
                result.prefecture,
                result.municipality_or_ward,
                result.neighborhood,
                result.street_or_block,
                result.building,
                result.floor,
                result.suite_or_unit,
                result.entrance,
                agreement.model_dump_json(),
                agreement.agreed_core_address,
                int(agreement.core_address_verified),
                int(agreement.full_address_verified),
                agreement.unresolved_address_detail,
                agreement.proposed_location_precision,
                int(agreement.map_location_approximate),
                json.dumps(
                    [item.model_dump(mode="json") for item in result.source_evidence],
                    ensure_ascii=False,
                    sort_keys=True,
                ),
                json.dumps(
                    [item.model_dump(mode="json") for item in result.conflicting_address_candidates],
                    ensure_ascii=False,
                    sort_keys=True,
                ),
                json.dumps(result.search_queries_attempted, ensure_ascii=False),
                json.dumps(result.warnings, ensure_ascii=False),
                result.recommended_action,
                result.research_summary,
                call.acceptance.status,
                json.dumps(call.acceptance.reasons, ensure_ascii=False),
                fingerprint,
                now,
                now,
            ),
        )
        evidence_id = int(cursor.lastrowid)
        if call.acceptance.status in {"accepted", "provisional"} and agreement.agreed_core_address:
            source_references = [
                source.source_url
                for source in result.source_evidence
                if source.supports_candidate_address
            ]
            connection.execute(
                """
                INSERT INTO verified_restaurant_addresses (
                    public_restaurant_id, address_evidence_id, address_raw, postal_code,
                    prefecture, municipality_or_ward, neighborhood, street_or_block, building,
                    floor, suite_or_unit, entrance, verified_core_address, geocoding_address,
                    core_address_verified, full_address_verified, unresolved_address_detail,
                    approved_location_precision, map_location_approximate,
                    verification_method, evidence_references_json, verified_by, verified_at,
                    status, address_confidence_tier, decision_fingerprint, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                          ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(public_restaurant_id) DO NOTHING
                """,
                (
                    place_id,
                    evidence_id,
                    agreement.agreed_core_address if not agreement.full_address_verified else result.address_raw,
                    result.postal_code,
                    result.prefecture,
                    result.municipality_or_ward,
                    result.neighborhood,
                    result.street_or_block,
                    result.building if agreement.full_address_verified else None,
                    result.floor if agreement.full_address_verified else None,
                    result.suite_or_unit if agreement.full_address_verified else None,
                    result.entrance if agreement.full_address_verified else None,
                    agreement.agreed_core_address,
                    agreement.agreed_core_address,
                    int(agreement.core_address_verified),
                    int(agreement.full_address_verified),
                    agreement.unresolved_address_detail,
                    agreement.proposed_location_precision,
                    int(agreement.map_location_approximate),
                    (
                        "deterministic_web_address_evidence"
                        if call.acceptance.status == "accepted"
                        else "deterministic_provisional_web_address_evidence"
                    ),
                    json.dumps(source_references, ensure_ascii=False),
                    verified_by,
                    now,
                    call.acceptance.resolution_status,
                    call.acceptance.confidence_tier,
                    fingerprint,
                    now,
                    now,
                ),
            )
        connection.execute(
            """
            UPDATE public_restaurants SET address_resolution_status=?, updated_at=?
            WHERE place_id=?
            """,
            (call.acceptance.resolution_status, now, place_id),
        )
        if call.acceptance.status in {"accepted", "provisional"}:
            connection.execute(
                """
                UPDATE public_restaurants SET verified_core_address=?,
                    core_address_verified=?, full_address_verified=?,
                    unresolved_address_detail=?, map_location_approximate=?, updated_at=?
                WHERE place_id=?
                """,
                (agreement.agreed_core_address, int(agreement.core_address_verified),
                 int(agreement.full_address_verified), agreement.unresolved_address_detail,
                 int(agreement.map_location_approximate), now, place_id),
            )
        connection.commit()
    return evidence_id


def _result_from_evidence_row(row: sqlite3.Row) -> AddressResearchResult:
    return AddressResearchResult(
        identity_status=row["identity_status"],
        identity_confidence=row["identity_confidence"],
        matched_name=row["matched_name"],
        branch_name=row["branch_name"],
        address_raw=row["address_raw"],
        postal_code=row["postal_code"],
        prefecture=row["prefecture"],
        municipality_or_ward=row["municipality_or_ward"],
        neighborhood=row["neighborhood"],
        street_or_block=row["street_or_block"],
        building=row["building"],
        floor=row["floor"],
        suite_or_unit=row["suite_or_unit"],
        entrance=row["entrance"],
        source_evidence=json.loads(row["source_evidence_json"] or "[]"),
        conflicting_address_candidates=json.loads(
            row["conflicting_addresses_json"] or "[]"
        ),
        search_queries_attempted=json.loads(row["search_queries_json"] or "[]"),
        warnings=json.loads(row["warnings_json"] or "[]"),
        recommended_action=row["recommended_action"] or "",
        research_summary=row["research_summary"] or "",
    )


def _recalculation_rows(
    db_path: str | Path, *, place_id: str | None, all_records: bool
) -> list[sqlite3.Row]:
    if bool(place_id) == bool(all_records):
        raise ValueError("Choose exactly one of --place-id PLACE_ID or --all")
    path = Path(db_path).resolve().as_posix()
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        parameters: tuple[object, ...] = ()
        condition = ""
        if place_id:
            condition = "AND e.public_restaurant_id=?"
            parameters = (place_id,)
        rows = connection.execute(
            f"""
            SELECT e.*, p.name_ja, p.name_en, p.primary_category,
                   p.discovery_area, p.discovery_area_type, p.discovery_areas_json,
                   p.address_resolution_status AS current_resolution_status
            FROM address_evidence e
            JOIN public_restaurants p ON p.place_id=e.public_restaurant_id
            WHERE e.id=(
                SELECT MAX(newest.id) FROM address_evidence newest
                WHERE newest.public_restaurant_id=e.public_restaurant_id
            ) {condition}
            ORDER BY e.public_restaurant_id
            """,
            parameters,
        ).fetchall()
    if place_id and not rows:
        raise ValueError(f"No saved address evidence found for place_id {place_id}")
    return rows


def recalculate_address_decisions(
    db_path: str | Path,
    *,
    place_id: str | None = None,
    all_records: bool = False,
    dry_run: bool = False,
) -> dict[str, object]:
    """Replay stored evidence deterministically without any provider or geocoder call."""

    if not dry_run:
        ensure_public_schema(db_path)
    rows = _recalculation_rows(db_path, place_id=place_id, all_records=all_records)
    decisions: list[dict[str, object]] = []
    prepared: list[
        tuple[sqlite3.Row, AddressResearchResult, AddressComponentAgreement, AddressAcceptance]
    ] = []
    for row in rows:
        result = _prepare_result_evidence(_result_from_evidence_row(row))
        candidate = {
            "place_id": row["public_restaurant_id"],
            "name_ja": row["name_ja"],
            "name_en": row["name_en"],
            "title": row["name_ja"],
            "category": row["primary_category"],
            "discovery_area": row["discovery_area"],
            "discovery_area_type": row["discovery_area_type"],
            "discovery_areas_json": row["discovery_areas_json"],
        }
        agreement = compare_address_components(result)
        acceptance = evaluate_address_result(candidate, result)
        prepared.append((row, result, agreement, acceptance))
        decisions.append(
            {
                "place_id": row["public_restaurant_id"],
                "address_evidence_id": row["id"],
                "previous_acceptance_status": row["acceptance_status"],
                "previous_resolution_status": row["current_resolution_status"],
                "proposed_acceptance": asdict(acceptance),
                "component_agreement": agreement.model_dump(mode="json"),
                "source_temporality": [
                    {
                        "source_url": source.source_url,
                        "address_text_as_displayed": source.address_text_as_displayed,
                        "address_temporality": source.address_temporality,
                    }
                    for source in result.source_evidence
                ],
                "would_persist": not dry_run,
            }
        )

    audit_records = 0
    verified_addresses = 0
    if not dry_run:
        now = _now()
        with connect(db_path) as connection:
            for row, result, agreement, acceptance in prepared:
                connection.execute(
                    """
                    INSERT INTO address_decision_audits (
                        public_restaurant_id, address_evidence_id, decision_version,
                        acceptance_status, resolution_status, confidence_tier,
                        acceptance_reasons_json,
                        component_agreement_json, temporal_evidence_json,
                        original_evidence_fingerprint, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["public_restaurant_id"],
                        row["id"],
                        ADDRESS_DECISION_VERSION,
                        acceptance.status,
                        acceptance.resolution_status,
                        acceptance.confidence_tier,
                        json.dumps(acceptance.reasons, ensure_ascii=False),
                        agreement.model_dump_json(),
                        json.dumps(
                            agreement.excluded_temporal_evidence,
                            ensure_ascii=False,
                            sort_keys=True,
                        ),
                        row["evidence_fingerprint"],
                        now,
                    ),
                )
                audit_records += 1
                connection.execute(
                    """
                    UPDATE public_restaurants SET address_resolution_status=?, updated_at=?
                    WHERE place_id=?
                    """,
                    (acceptance.resolution_status, now, row["public_restaurant_id"]),
                )
                if acceptance.status not in {"accepted", "provisional"} or not agreement.agreed_core_address:
                    continue
                source_references = [
                    source.source_url
                    for source in result.source_evidence
                    if source.supports_candidate_address
                    and source.address_temporality not in {"historical", "future"}
                ]
                cursor = connection.execute(
                    """
                    INSERT INTO verified_restaurant_addresses (
                        public_restaurant_id, address_evidence_id, address_raw, postal_code,
                        prefecture, municipality_or_ward, neighborhood, street_or_block,
                        building, floor, suite_or_unit, entrance, verified_core_address,
                        geocoding_address, core_address_verified, full_address_verified,
                        unresolved_address_detail, approved_location_precision,
                        map_location_approximate, verification_method,
                        evidence_references_json, verified_by, verified_at, status,
                        address_confidence_tier, decision_fingerprint, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                              ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(public_restaurant_id) DO NOTHING
                    """,
                    (
                        row["public_restaurant_id"], row["id"],
                        agreement.agreed_core_address if not agreement.full_address_verified
                        else result.address_raw,
                        result.postal_code, result.prefecture, result.municipality_or_ward,
                        result.neighborhood, result.street_or_block,
                        result.building if agreement.full_address_verified else None,
                        result.floor if agreement.full_address_verified else None,
                        result.suite_or_unit if agreement.full_address_verified else None,
                        result.entrance if agreement.full_address_verified else None,
                        agreement.agreed_core_address, agreement.agreed_core_address,
                        int(agreement.core_address_verified),
                        int(agreement.full_address_verified), agreement.unresolved_address_detail,
                        agreement.proposed_location_precision,
                        int(agreement.map_location_approximate),
                        "deterministic_saved_evidence_recalculation",
                        json.dumps(source_references, ensure_ascii=False),
                        ADDRESS_DECISION_VERSION, now, acceptance.resolution_status,
                        acceptance.confidence_tier, row["evidence_fingerprint"], now, now,
                    ),
                )
                verified_addresses += int(cursor.rowcount > 0)
                connection.execute(
                    """
                    UPDATE public_restaurants SET verified_core_address=?,
                        core_address_verified=?, full_address_verified=?,
                        unresolved_address_detail=?, map_location_approximate=?, updated_at=?
                    WHERE place_id=?
                    """,
                    (
                        agreement.agreed_core_address, int(agreement.core_address_verified),
                        int(agreement.full_address_verified), agreement.unresolved_address_detail,
                        int(agreement.map_location_approximate), now,
                        row["public_restaurant_id"],
                    ),
                )
            connection.commit()
    return {
        "mode": "dry_run" if dry_run else "persist",
        "evaluated": len(decisions),
        "pipeline_accepted": sum(
            item[3].status in {"accepted", "provisional"} for item in prepared
        ),
        "pipeline_verified": sum(item[3].status == "accepted" for item in prepared),
        "pipeline_provisional": sum(item[3].status == "provisional" for item in prepared),
        "pipeline_rejected": sum(
            item[3].status not in {"accepted", "provisional"} for item in prepared
        ),
        "decision_audit_records_persisted": audit_records,
        "verified_addresses_persisted": verified_addresses,
        "responses_api_calls": 0,
        "web_search_calls": 0,
        "geocoder_calls": 0,
        "decisions": decisions,
    }


def _address_tables_available(db_path: str | Path) -> bool:
    path = Path(db_path).resolve().as_posix()
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        tables = {
            str(row["name"])
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(public_restaurants)")
        }
    return {
        "address_research_runs",
        "address_search_attempts",
        "address_evidence",
        "verified_restaurant_addresses",
    }.issubset(tables) and "location_resolution_reason" in columns


def _selection_plan(
    db_path: str | Path,
    *,
    limit: int,
    place_id: str | None,
    force: bool,
    max_search_actions: int,
    resolution_reasons: dict[str, str] | None,
    published_only: bool = True,
) -> tuple[list[dict[str, object]], dict[str, int]]:
    if not _address_tables_available(db_path):
        raise RuntimeError(
            "Address schema is not initialized. Run `python -m fiyu.public_cli --db PATH init` once."
        )
    path = Path(db_path).resolve().as_posix()
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category AS category,
                   p.discovery_area, p.discovery_area_type, p.discovery_areas_json,
                   p.location_resolution_reason, p.location_verification_status,
                   p.map_display_eligible, p.is_published, p.address_resolution_status,
                   p.evidence_urls_json,
                   (SELECT e.source_evidence_json FROM address_evidence e
                    WHERE e.public_restaurant_id=p.place_id
                    ORDER BY e.created_at DESC LIMIT 1) AS existing_address_evidence_json,
                   EXISTS(SELECT 1 FROM verified_restaurant_addresses v
                          WHERE v.public_restaurant_id=p.place_id
                            AND v.status='address_verified') AS has_verified_address,
                   EXISTS(SELECT 1 FROM address_evidence e
                          WHERE e.public_restaurant_id=p.place_id
                            AND e.acceptance_status IN ('accepted', 'provisional', 'review_approved'))
                       AS has_accepted_evidence
                   ,(SELECT ar.status FROM address_research_runs ar
                     WHERE ar.public_restaurant_id=p.place_id AND ar.combined_research=0
                     ORDER BY ar.id DESC LIMIT 1) AS latest_standalone_run_status
            FROM public_restaurants p
            ORDER BY p.fiyu_score DESC, p.place_id
            """
        ).fetchall()
        attempted_by_restaurant: dict[str, set[str]] = {}
        for attempted_row in connection.execute(
            """
            SELECT a.public_restaurant_id, a.query_fingerprint
            FROM address_search_attempts a
            JOIN address_research_runs r ON r.id=a.research_run_id
            WHERE r.combined_research=0
            """
        ):
            attempted_by_restaurant.setdefault(
                str(attempted_row["public_restaurant_id"]), set()
            ).add(str(attempted_row["query_fingerprint"]))
    skipped = {
        "unpublished": 0,
        "map_eligible_or_verified_location": 0,
        "not_likely_missing_from_osm": 0,
        "already_has_accepted_address": 0,
        "place_id_mismatch": 0,
        "duplicate_query_cache": 0,
    }
    eligible: list[dict[str, object]] = []
    for row in rows:
        item = dict(row)
        if resolution_reasons and str(item["place_id"]) in resolution_reasons:
            item["location_resolution_reason"] = resolution_reasons[str(item["place_id"])]
        if place_id and item["place_id"] != place_id:
            skipped["place_id_mismatch"] += 1
            continue
        if published_only and not item["is_published"]:
            skipped["unpublished"] += 1
            continue
        if item["map_display_eligible"] or item["location_verification_status"] in {
            "osm_auto_verified",
            "manually_verified",
            "location_verified",
        }:
            skipped["map_eligible_or_verified_location"] += 1
            continue
        if item["location_resolution_reason"] != "likely_not_represented_in_osm":
            skipped["not_likely_missing_from_osm"] += 1
            continue
        if not force and (item["has_verified_address"] or item["has_accepted_evidence"]):
            skipped["already_has_accepted_address"] += 1
            continue
        if not force and item["latest_standalone_run_status"] in {"running", "needs_retry"}:
            skipped.setdefault("unsafe_retry_requires_operator_recovery", 0)
            skipped["unsafe_retry_requires_operator_recovery"] += 1
            continue
        if not force:
            queries = generate_address_queries(
                item, max_search_actions=max_search_actions
            )
            attempted = attempted_by_restaurant.get(str(item["place_id"]), set())
            cached_queries = [
                query for query in queries if _query_fingerprint(query) in attempted
            ]
            retry_authorized = item["latest_standalone_run_status"] == "retry_authorized"
            if (
                queries
                and not retry_authorized
                and all(_query_fingerprint(query) in attempted for query in queries)
            ):
                skipped["duplicate_query_cache"] += 1
                continue
            item["_cached_address_queries"] = cached_queries
            item["_skipped_address_queries"] = cached_queries
            item["_prepared_address_queries"] = (
                queries
                if retry_authorized
                else [query for query in queries if query not in cached_queries]
            )
        eligible.append(item)
    return eligible, skipped


def _load_resolution_reasons(path: str | Path | None) -> dict[str, str]:
    if path is None:
        return {}
    source = Path(path)
    payload = json.loads(source.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        payload = payload.get("reports")
    if not isinstance(payload, list):
        raise TypeError("OSM resolution report must contain a JSON list or a reports list")
    reasons: dict[str, str] = {}
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise TypeError(f"OSM resolution report item {index} must be an object")
        place_id = str(item.get("place_id") or "").strip()
        reason = str(item.get("resolution_reason") or "").strip()
        if not place_id or not reason:
            raise ValueError(f"OSM resolution report item {index} requires place_id and resolution_reason")
        if place_id in reasons:
            raise ValueError(f"OSM resolution report contains duplicate place_id: {place_id}")
        reasons[place_id] = reason
    return reasons


def _call_report(call: AddressResearchCall) -> dict[str, object]:
    actual_queries = [
        str(query)
        for action in call.metadata.search_calls
        for query in action.get("queries", [])
        if query
    ]
    return {
        "result": call.result.model_dump(mode="json"),
        "acceptance": asdict(call.acceptance),
        "generated_queries": list(call.generated_queries),
        "component_agreement": (
            (call.component_agreement or compare_address_components(call.result)).model_dump(mode="json")
        ),
        "query_audit": {
            "fiyu_generated_queries": list(call.generated_queries),
            "model_requested_queries": list(call.result.search_queries_attempted),
            "actual_web_search_actions": list(call.metadata.search_calls),
            "actual_action_queries": list(dict.fromkeys(actual_queries)),
            "cached_queries": list(call.cached_queries),
            "skipped_queries": list(call.skipped_queries),
            "configured_action_limit": call.metadata.requested_web_action_limit,
            "actual_action_count": call.metadata.web_search_action_count,
            "limit_reached": call.metadata.limit_reached,
            "limit_exceeded": call.metadata.limit_exceeded,
            "counts_reconcile": call.metadata.web_search_action_count
            == len(call.metadata.search_calls),
        },
        "usage": {
            "response_id": call.metadata.response_id,
            "response_ids": list(call.metadata.response_ids),
            "model": call.metadata.model,
            "response_status": call.metadata.response_status,
            "incomplete_reason": call.metadata.incomplete_reason,
            "response_request_count": call.metadata.response_request_count,
            "web_search_action_count": call.metadata.web_search_action_count,
            "requested_web_action_limit": call.metadata.requested_web_action_limit,
            "limit_reached": call.metadata.limit_reached,
            "limit_exceeded": call.metadata.limit_exceeded,
            "raw_output_character_count": call.metadata.raw_output_character_count,
            "output_was_truncated": call.metadata.output_was_truncated,
            "parse_attempted": call.metadata.parse_attempted,
            "parse_error_summary": call.metadata.parse_error_summary,
            "structured_output_mode": call.metadata.structured_output_mode,
            "retry_count": call.metadata.retry_count,
            "attempts": call.metadata.usage_metadata.get("attempts", []),
            "input_tokens": call.metadata.input_tokens,
            "cached_input_tokens": call.metadata.cached_input_tokens,
            "output_tokens": call.metadata.output_tokens,
            "reasoning_tokens": call.metadata.reasoning_tokens,
            "total_tokens": call.metadata.total_tokens,
        },
    }


def _failure_report(
    candidate: dict[str, object], failure: AddressResearchFailure
) -> dict[str, object]:
    metadata = failure.metadata
    return {
        "place_id": str(candidate.get("place_id") or ""),
        "name_ja": candidate.get("name_ja"),
        "response_id": metadata.response_id,
        "response_ids": list(metadata.response_ids),
        "response_status": metadata.response_status,
        "incomplete_reason": metadata.incomplete_reason,
        "failure_code": failure.code,
        "failure_summary": failure.summary,
        "output_was_truncated": metadata.output_was_truncated,
        "raw_output_character_count": metadata.raw_output_character_count,
        "parse_attempted": metadata.parse_attempted,
        "parse_error_summary": metadata.parse_error_summary,
        "persisted": False,
        "usage": {
            "model": metadata.model,
            "response_request_count": metadata.response_request_count,
            "web_search_action_count": metadata.web_search_action_count,
            "input_tokens": metadata.input_tokens,
            "cached_input_tokens": metadata.cached_input_tokens,
            "output_tokens": metadata.output_tokens,
            "reasoning_tokens": metadata.reasoning_tokens,
            "total_tokens": metadata.total_tokens,
            "retry_count": metadata.retry_count,
            "attempts": metadata.usage_metadata.get("attempts", []),
        },
        "web_search_action_audit": {
            "fiyu_generated_queries": list(failure.generated_queries),
            "model_requested_queries": [],
            "actual_web_search_actions": list(metadata.search_calls),
            "requested_maximum_web_actions": metadata.requested_web_action_limit,
            "actual_action_count": metadata.web_search_action_count,
            "limit_reached": metadata.limit_reached,
            "limit_exceeded": metadata.limit_exceeded,
            "counts_reconcile": metadata.web_search_action_count
            == len(metadata.search_calls),
        },
    }


def _write_report(path: str | Path, report: dict[str, object]) -> None:
    target = Path(path)
    if target.suffix.casefold() != ".json":
        raise ValueError("address discovery reports must use a .json extension")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def run_address_discovery(
    db_path: str | Path,
    *,
    limit: int = 10,
    place_id: str | None = None,
    plan_only: bool = False,
    dry_run: bool = False,
    force: bool = False,
    output_report: str | Path | None = None,
    resolution_report: str | Path | None = None,
    max_search_actions: int = DEFAULT_MAX_SEARCH_ACTIONS,
    max_retained_sources: int = DEFAULT_MAX_RETAINED_SOURCES,
    max_evidence_summary_chars: int = DEFAULT_MAX_EVIDENCE_SUMMARY_CHARS,
    max_conflicting_candidates: int = DEFAULT_MAX_CONFLICTING_CANDIDATES,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    compact_research: bool = True,
    retry_truncated: bool = False,
    model: str | None = None,
    client: OpenAI | None = None,
    published_only: bool = True,
) -> dict[str, object]:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    if max_search_actions < 1:
        raise ValueError("max_search_actions must be at least 1")
    if min(max_retained_sources, max_evidence_summary_chars, max_conflicting_candidates, max_output_tokens) < 1:
        raise ValueError("compact usage limits must all be at least 1")
    if plan_only and dry_run:
        raise ValueError("--plan-only and --dry-run are mutually exclusive")
    if not plan_only and not dry_run:
        ensure_public_schema(db_path)
    resolution_reasons = _load_resolution_reasons(resolution_report)
    eligible, skipped = _selection_plan(
        db_path,
        limit=limit,
        place_id=place_id,
        force=force,
        max_search_actions=max_search_actions,
        resolution_reasons=resolution_reasons,
        published_only=published_only,
    )
    selected = eligible[:limit]
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    report: dict[str, object] = {
        "mode": "plan_only" if plan_only else "dry_run" if dry_run else "persist",
        "eligible_restaurant_count": len(eligible),
        "requested_limit": limit,
        "maximum_responses_requests": len(selected),
        "requested_maximum_web_actions": len(selected) * max_search_actions,
        "maximum_web_search_actions": len(selected) * max_search_actions,
        "max_search_actions_per_restaurant": max_search_actions,
        "web_action_limit_semantics": (
            "Requested provider max_tool_calls. The backend stops the batch and rejects automatic "
            "acceptance if the provider returns more web_search_call actions; already-executed "
            "provider actions cannot be retroactively prevented."
        ),
        "compact_usage_controls": {
            "compact_research": compact_research,
            "max_retained_sources": max_retained_sources,
            "max_evidence_summary_chars": max_evidence_summary_chars,
            "max_conflicting_candidates": max_conflicting_candidates,
            "max_output_tokens": max_output_tokens,
            "retry_truncated": retry_truncated,
        },
        "resolution_report": str(resolution_report) if resolution_report else None,
        "skipped_records": skipped,
        "restaurants": [
            {
                "place_id": row["place_id"],
                "name_ja": row.get("name_ja"),
                "name_en": row.get("name_en"),
                "discovery_areas": _areas(row),
                "fiyu_generated_queries": list(
                    row.get("_prepared_address_queries")
                    or generate_address_queries(row, max_search_actions=max_search_actions)
                ),
                "generated_queries": list(
                    row.get("_prepared_address_queries")
                    or generate_address_queries(row, max_search_actions=max_search_actions)
                ),
                "cached_queries": list(row.get("_cached_address_queries") or ()),
                "skipped_queries": list(row.get("_skipped_address_queries") or ()),
            }
            for row in selected
        ],
        "usage_totals": {
            "response_request_count": 0,
            "web_search_action_count": 0,
            "input_tokens": 0,
            "cached_input_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
            "total_tokens": 0,
        },
        "failures": [],
    }
    if plan_only:
        if output_report:
            _write_report(output_report, report)
        return report
    if client is None:
        load_dotenv()
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env")
        selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
        client = OpenAI(max_retries=0)

    output_rows: list[dict[str, object]] = []
    persisted_count = 0
    verified_persisted_count = 0
    unresolved_persisted_count = 0
    totals = report["usage_totals"]
    assert isinstance(totals, dict)
    failures = report["failures"]
    assert isinstance(failures, list)
    for candidate in selected:
        current_id = str(candidate["place_id"])
        run_id: int | None = None
        request_accounted = False
        if not dry_run:
            run_id = start_address_run(
                db_path,
                place_id=current_id,
                model=selected_model,
                forced=force,
                combined_research=False,
                requested_max_web_actions=max_search_actions,
            )
            record_generated_queries(
                db_path,
                run_id=run_id,
                place_id=current_id,
                queries=list(
                    candidate.get("_prepared_address_queries")
                    or generate_address_queries(candidate, max_search_actions=max_search_actions)
                ),
            )
        try:
            call = research_address(
                candidate,
                client=client,
                model=selected_model,
                max_search_actions=max_search_actions,
                max_retained_sources=max_retained_sources,
                max_evidence_summary_chars=max_evidence_summary_chars,
                max_conflicting_candidates=max_conflicting_candidates,
                max_output_tokens=max_output_tokens,
                compact_research=compact_research,
                retry_truncated=retry_truncated,
            )
            row_report = {"place_id": current_id, **_call_report(call)}
            output_rows.append(row_report)
            for field in totals:
                totals[field] = int(totals[field]) + int(
                    getattr(call.metadata, field, 0) or 0
                )
            request_accounted = True
            if run_id is not None:
                evidence_id = persist_address_call(
                    db_path, place_id=current_id, run_id=run_id, call=call
                )
                row_report["address_evidence_id"] = evidence_id
                persisted_count += 1
                if call.acceptance.status in {"accepted", "provisional"}:
                    with connect(db_path) as connection:
                        verified = connection.execute(
                            """
                            SELECT 1 FROM verified_restaurant_addresses
                            WHERE public_restaurant_id=? AND address_evidence_id=?
                            """,
                            (current_id, evidence_id),
                        ).fetchone()
                    verified_persisted_count += int(verified is not None)
                else:
                    unresolved_persisted_count += 1
            if call.metadata.limit_exceeded:
                failures.append(
                    {
                        "place_id": current_id,
                        "error": "provider_web_action_budget_exceeded",
                        "configured_limit": max_search_actions,
                        "actual_actions": call.metadata.web_search_action_count,
                        "batch_stopped": True,
                    }
                )
                break
        except AddressResearchFailure as exc:
            if run_id is not None:
                fail_address_run(db_path, run_id, exc, metadata=exc.metadata)
            for field in totals:
                totals[field] = int(totals[field]) + int(
                    getattr(exc.metadata, field, 0) or 0
                )
            request_accounted = True
            failures.append(_failure_report(candidate, exc))
            if exc.metadata.limit_exceeded:
                break
        except Exception as exc:  # noqa: BLE001 - isolate paid batch rows and preserve audit.
            if run_id is not None:
                fail_address_run(db_path, run_id, exc)
            if not request_accounted:
                totals["response_request_count"] = int(totals["response_request_count"]) + 1
            failures.append(
                {"place_id": current_id, "error": f"{type(exc).__name__}: {exc}"}
            )
    report["restaurants"] = output_rows
    report["completed"] = len(output_rows)
    report["failed"] = len(failures)
    report["persisted"] = 0 if dry_run else persisted_count
    output_place_ids = {str(row["place_id"]) for row in output_rows}
    provider_failures = sum(
        str(failure.get("place_id") or "") not in output_place_ids
        for failure in failures
        if isinstance(failure, dict)
    )
    report["provider_completed"] = len(output_rows)
    report["pipeline_accepted"] = sum(
        row["acceptance"]["status"] in {"accepted", "provisional"}
        for row in output_rows
        if isinstance(row.get("acceptance"), dict)
    )
    report["pipeline_verified"] = sum(
        row["acceptance"]["status"] == "accepted"
        for row in output_rows
        if isinstance(row.get("acceptance"), dict)
    )
    report["pipeline_provisional"] = sum(
        row["acceptance"]["status"] == "provisional"
        for row in output_rows
        if isinstance(row.get("acceptance"), dict)
    )
    report["pipeline_rejected"] = (
        sum(
            row["acceptance"]["status"] not in {"accepted", "provisional"}
            for row in output_rows
            if isinstance(row.get("acceptance"), dict)
        )
        + provider_failures
    )
    report["research_records_persisted"] = 0 if dry_run else persisted_count
    report["verified_addresses_persisted"] = 0 if dry_run else verified_persisted_count
    report["unresolved_evidence_persisted"] = (
        0 if dry_run else unresolved_persisted_count
    )
    if output_report:
        _write_report(output_report, report)
    return report


def address_resolution_status(db_path: str | Path) -> dict[str, object]:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        base = connection.execute(
            """
            SELECT COUNT(*) AS total,
                   SUM(is_published=1) AS published,
                   SUM(is_published=1 AND map_display_eligible=1) AS map_eligible,
                   SUM(is_published=1 AND core_address_verified=1) AS core_verified,
                   SUM(is_published=1 AND full_address_verified=1) AS full_verified,
                   SUM(is_published=1 AND map_display_eligible=1
                       AND map_location_approximate=1) AS approximate_map,
                   SUM(is_published=1 AND location_resolution_reason='likely_not_represented_in_osm')
                       AS likely_missing,
                   SUM(is_published=1 AND address_resolution_status='address_not_researched'
                       AND location_resolution_reason='likely_not_represented_in_osm') AS awaiting,
                   SUM(is_published=1 AND map_display_eligible=0 AND EXISTS(
                       SELECT 1 FROM verified_restaurant_addresses v
                       WHERE v.public_restaurant_id=public_restaurants.place_id
                         AND v.core_address_verified=1
                         AND v.status IN ('address_verified',
                                          'address_provisionally_accepted',
                                          'geocoding_pending')
                   ) AND address_resolution_status IN (
                       'address_verified', 'address_provisionally_accepted'
                   )) AS geocoding_pending_count
            FROM public_restaurants
            """
        ).fetchone()
        address_statuses = {
            str(row["address_resolution_status"]): int(row["count"])
            for row in connection.execute(
                """
                SELECT address_resolution_status, COUNT(*) AS count
                FROM public_restaurants WHERE is_published=1
                GROUP BY address_resolution_status
                """
            )
        }
        location_statuses = {
            str(row["location_verification_status"]): int(row["count"])
            for row in connection.execute(
                """
                SELECT location_verification_status, COUNT(*) AS count
                FROM public_restaurants WHERE is_published=1
                GROUP BY location_verification_status
                """
            )
        }
        usage = connection.execute(
            """
            SELECT COALESCE(SUM(response_request_count),0),
                   COALESCE(SUM(web_search_action_count),0), COALESCE(SUM(input_tokens),0),
                   COALESCE(SUM(cached_input_tokens),0), COALESCE(SUM(output_tokens),0),
                   COALESCE(SUM(reasoning_tokens),0), COALESCE(SUM(total_tokens),0)
            FROM address_research_runs
            """
        ).fetchone()
        automatic_verified = connection.execute(
            """
            SELECT COUNT(DISTINCT public_restaurant_id || ':' || address_evidence_id)
            FROM (
                SELECT public_restaurant_id, id AS address_evidence_id
                FROM address_evidence WHERE acceptance_status='accepted'
                UNION
                SELECT public_restaurant_id, address_evidence_id
                FROM address_decision_audits WHERE acceptance_status='accepted'
            )
            """
        ).fetchone()[0]
        provisional_acceptances = connection.execute(
            """
            SELECT COUNT(DISTINCT public_restaurant_id || ':' || address_evidence_id)
            FROM (
                SELECT public_restaurant_id, id AS address_evidence_id
                FROM address_evidence WHERE acceptance_status='provisional'
                UNION
                SELECT public_restaurant_id, address_evidence_id
                FROM address_decision_audits WHERE acceptance_status='provisional'
            )
            """
        ).fetchone()[0]
        manual_approvals = connection.execute(
            """
            SELECT COUNT(*) FROM address_review_decisions
            WHERE reviewer_decision IN ('approve', 'approve_core_location', 'approve_full_address')
            """
        ).fetchone()[0]
        history_counts = {
            str(row["location_status"]): int(row["count"])
            for row in connection.execute(
                "SELECT location_status, COUNT(*) AS count FROM location_history GROUP BY location_status"
            )
        }
        source_distribution: dict[str, int] = {}
        failure_reasons: dict[str, int] = {}
        for row in connection.execute("SELECT source_evidence_json FROM address_evidence"):
            try:
                sources = json.loads(row["source_evidence_json"] or "[]")
            except json.JSONDecodeError:
                continue
            for source in sources if isinstance(sources, list) else []:
                if isinstance(source, dict):
                    key = str(source.get("source_type") or "unknown_source")
                    source_distribution[key] = source_distribution.get(key, 0) + 1
        for row in connection.execute(
            "SELECT error FROM address_research_runs WHERE status='failed' AND error IS NOT NULL"
        ):
            key = str(row["error"]).split(":", 1)[0]
            failure_reasons[key] = failure_reasons.get(key, 0) + 1
        for table, column in (
            ("address_evidence", "acceptance_reasons_json"),
            ("address_geocode_results", "validation_reasons_json"),
        ):
            for row in connection.execute(f"SELECT {column} AS reasons FROM {table}"):
                try:
                    reasons = json.loads(row["reasons"] or "[]")
                except json.JSONDecodeError:
                    continue
                for reason in reasons if isinstance(reasons, list) else []:
                    key = str(reason)
                    failure_reasons[key] = failure_reasons.get(key, 0) + 1
    return {
        "published_restaurants": int(base["published"] or 0),
        "map_eligible_restaurants": int(base["map_eligible"] or 0),
        "core_address_verified": int(base["core_verified"] or 0),
        "full_address_verified": int(base["full_verified"] or 0),
        "approximate_map_locations": int(base["approximate_map"] or 0),
        "verified_osm_locations": location_statuses.get("osm_auto_verified", 0),
        "manually_verified_osm_locations": location_statuses.get("manually_verified", 0),
        "likely_not_represented_in_osm": int(base["likely_missing"] or 0),
        "awaiting_address_research": int(base["awaiting"] or 0),
        "address_statuses": address_statuses,
        "address_research_running": address_statuses.get("address_research_running", 0),
        "address_candidate_found": address_statuses.get("address_candidate_found", 0),
        "address_awaiting_review": address_statuses.get("address_needs_review", 0),
        "address_verified": address_statuses.get("address_verified", 0),
        "address_provisionally_accepted": address_statuses.get(
            "address_provisionally_accepted", 0
        ),
        "address_needs_review": address_statuses.get("address_needs_review", 0),
        "address_rejected": address_statuses.get("address_rejected", 0),
        "address_not_found": address_statuses.get("address_not_found", 0),
        "conflicting_addresses": address_statuses.get("address_conflicting", 0),
        "geocoding_pending": int(base["geocoding_pending_count"] or 0),
        "geocoded": address_statuses.get("geocoded", 0),
        "geocode_awaiting_review": address_statuses.get("geocode_needs_review", 0),
        "location_verified": location_statuses.get("location_verified", 0),
        "verified_map_locations": sum(
            location_statuses.get(status, 0)
            for status in ("location_verified", "manually_verified", "osm_auto_verified")
        ),
        "provisional_map_locations": location_statuses.get("location_provisional", 0),
        "corrected_or_superseded_locations": history_counts.get("location_superseded", 0),
        "remaining_unresearched": address_statuses.get("address_not_researched", 0),
        "geocoding_failed": address_statuses.get("geocoding_failed", 0),
        "automatic_acceptance_count": int(automatic_verified or 0),
        "manual_approval_count": int(manual_approvals or 0),
        "provisional_acceptance_count": int(provisional_acceptances or 0),
        "corrections_count": history_counts.get("location_superseded", 0),
        "locations_removed_from_map_display": history_counts.get("location_removed", 0),
        "manually_verified_location": location_statuses.get("manually_verified", 0),
        "source_type_distribution": source_distribution,
        "failure_reasons": failure_reasons,
        "usage_totals": {
            "response_request_count": int(usage[0]),
            "web_search_action_count": int(usage[1]),
            "input_tokens": int(usage[2]),
            "cached_input_tokens": int(usage[3]),
            "output_tokens": int(usage[4]),
            "reasoning_tokens": int(usage[5]),
            "total_tokens": int(usage[6]),
        },
    }
