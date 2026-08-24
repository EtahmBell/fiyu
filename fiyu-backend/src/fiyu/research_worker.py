from __future__ import annotations

import asyncio
import os
import socket
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
from openai import APIConnectionError, APITimeoutError, OpenAI
from pydantic import BaseModel, Field, field_validator

from .address_research import (
    ADDRESS_RESEARCH_INSTRUCTIONS,
    DEFAULT_MAX_SEARCH_ACTIONS,
    AddressResearchResult,
    combined_address_call,
    extract_response_metadata,
    fail_address_run,
    generate_address_queries,
    persist_address_call,
    record_generated_queries,
    start_address_run,
)
from .card_enrichment import CardEnrichment, scoring_research_view
from .public_catalog import (
    finish_restaurant_research_run,
    get_research_queue,
    mark_research_failed,
    mark_research_needs_retry,
    mark_research_started,
    save_research_result,
    start_restaurant_research_run,
)
from .public_score import (
    FiyuEvidence,
    InternalSignals,
    assess_chain_classification,
    evaluate_fiyu_candidate,
)

PROMPT_VERSION = "restaurant-research-v5-canonical-contact-budget"
CompactLabel = Annotated[str, Field(max_length=120)]
CompactEvidence = Annotated[str, Field(max_length=500)]
EvidenceUrl = Annotated[str, Field(max_length=2000)]


def _ambiguous_request_failure(exc: BaseException) -> bool:
    return isinstance(
        exc,
        (
            TimeoutError,
            asyncio.TimeoutError,
            ConnectionError,
            socket.timeout,
            APITimeoutError,
            APIConnectionError,
        ),
    )


class RestaurantResearch(BaseModel):
    matched_restaurant: bool
    identity_confidence: float = Field(ge=0, le=1)

    name_ja: str | None = None
    name_en: str | None = None
    primary_category: str | None = None
    food_tags: list[CompactLabel] = Field(default_factory=list, max_length=8)
    signature_dishes: list[CompactLabel] = Field(default_factory=list, max_length=6)
    description_en: str | None = Field(default=None, min_length=1, max_length=700)

    official_language: Literal["ja", "mixed", "en", "unknown"]
    japanese_source_count: int = Field(ge=0)
    english_tourist_source_count: int = Field(ge=0)
    japanese_review_share: float | None = Field(default=None, ge=0, le=1)
    tourist_coverage: Literal["low", "medium", "high", "unknown"]
    reservation_platform_count: int = Field(ge=0)
    official_website_found: bool
    social_profile_count: int = Field(ge=0)
    likely_chain: bool = False
    restaurant_group_affiliated: bool = False
    chain_classification: Literal[
        "independent_single",
        "small_group_distinct_concept",
        "small_same_brand_chain",
        "large_chain_or_franchise",
        "unknown",
    ] = "unknown"
    chain_evidence: list[CompactEvidence] = Field(default_factory=list, max_length=6)
    known_location_count: int = Field(ge=0)
    specialist_restaurant: bool
    independent_positive_source_count: int = Field(ge=0)
    total_evidence_sources: int = Field(ge=0)
    conflicting_evidence: bool
    local_audience: Literal["low", "mixed", "high", "unknown"] = "unknown"
    local_audience_signals: list[CompactEvidence] = Field(default_factory=list, max_length=8)
    tourist_orientation: Literal["low", "mixed", "high", "unknown"] = "unknown"
    tourist_signals: list[CompactEvidence] = Field(default_factory=list, max_length=8)
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
    product_eligibility_evidence: list[CompactEvidence] = Field(default_factory=list, max_length=6)

    why_fiyu: str = Field(min_length=1, max_length=600)
    evidence_urls: list[EvidenceUrl] = Field(default_factory=list, max_length=8)
    address_evidence: AddressResearchResult | None = None
    card_enrichment: CardEnrichment = Field(default_factory=CardEnrichment)

    @staticmethod
    def _bounded_items(values: object, limit: int, count: int) -> object:
        if not isinstance(values, list):
            return values
        bounded: list[object] = []
        for value in values:
            if not isinstance(value, str):
                bounded.append(value)
                continue
            compact = " ".join(value.split()).strip()
            if len(compact) > limit:
                compact = compact[: limit + 1].rsplit(" ", 1)[0].rstrip(" ,;:")
            if compact and compact not in bounded:
                bounded.append(compact)
        return bounded[:count]

    @field_validator("food_tags", "signature_dishes", mode="before")
    @classmethod
    def bound_labels(cls, values: object) -> object:
        return cls._bounded_items(values, 120, 6)

    @field_validator(
        "chain_evidence",
        "local_audience_signals",
        "tourist_signals",
        "product_eligibility_evidence",
        mode="before",
    )
    @classmethod
    def bound_evidence(cls, values: object) -> object:
        return cls._bounded_items(values, 500, 6)

    @field_validator("evidence_urls", mode="before")
    @classmethod
    def bound_urls(cls, values: object) -> object:
        return cls._bounded_items(values, 2000, 8)

    @field_validator(
        "food_tags",
        "signature_dishes",
        "chain_evidence",
        "local_audience_signals",
        "tourist_signals",
        "product_eligibility_evidence",
        "evidence_urls",
    )
    @classmethod
    def deduplicate_compact_lists(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(" ".join(value.split()).strip() for value in values if value.strip()))

    def to_evidence(self) -> FiyuEvidence:
        return FiyuEvidence(
            matched_restaurant=self.matched_restaurant,
            identity_confidence=self.identity_confidence,
            official_language=self.official_language,
            japanese_source_count=self.japanese_source_count,
            english_tourist_source_count=self.english_tourist_source_count,
            japanese_review_share=self.japanese_review_share,
            tourist_coverage=self.tourist_coverage,
            reservation_platform_count=self.reservation_platform_count,
            official_website_found=self.official_website_found,
            social_profile_count=self.social_profile_count,
            likely_chain=self.likely_chain,
            restaurant_group_affiliated=self.restaurant_group_affiliated,
            chain_classification=self.chain_classification,
            known_location_count=max(1, self.known_location_count),
            specialist_restaurant=self.specialist_restaurant,
            independent_positive_source_count=self.independent_positive_source_count,
            total_evidence_sources=self.total_evidence_sources,
            conflicting_evidence=self.conflicting_evidence,
            local_audience=self.local_audience,
            local_audience_signals=self.local_audience_signals,
            tourist_orientation=self.tourist_orientation,
            tourist_signals=self.tourist_signals,
            international_visibility=self.international_visibility,
            corporate_visibility=self.corporate_visibility,
            venue_format=self.venue_format,
            food_drink_primary=self.food_drink_primary,
        )


SYSTEM_PROMPT = (
    """You research Tokyo restaurants for Fiyu, a hidden-gem discovery product.

Your job is to collect verifiable evidence, not to invent or directly assign a Fiyu score.
The ingested candidate and stable place ID are the base entity of record. Do not try to prove that
the candidate exists. Use its name/address hints to keep enrichment evidence scoped correctly.
The supplied Google-derived address and coordinates are untrusted identity hints only. They are not
independent address evidence and must never be copied into address_evidence without a qualifying
non-Google public source.
Search Japanese sources as well as English sources. Prefer official restaurant pages, Japanese local
articles, local blogs, reservation pages, and reputable publications. Treat the absence of evidence
as unknown, not proof. Never infer customer nationality from language.

For japanese_review_share, only provide a number when a source or supplied review sample supports it.
Otherwise return null. Count unique, relevant sources only. Include URLs supporting the evidence.
Classify unrelated same-name results as unrelated and exclude them from enrichment/scoring while
preserving them in address audit evidence. Their existence does not invalidate this candidate.
Set conflicting_evidence=true only for a relevant current disagreement, not merely sparse results.
Classify chain behavior separately from ownership. A parent company, restaurant group, chef group,
or sister restaurant alone does not make the restaurant a chain. Use small_group_distinct_concept
when a small operator runs distinct names/concepts/menus. Use small_same_brand_chain only with
evidence of repeated substantially similar same-brand locations. Use large_chain_or_franchise only
with explicit franchise, mass-market, national-chain, or standardized multi-location evidence.
Use unknown when the evidence is insufficient. Set likely_chain=true only for
small_same_brand_chain or large_chain_or_franchise, and include concise supporting chain_evidence.
Classify local_audience, tourist_orientation, international_visibility, and corporate_visibility
from evidence only. Retain concise tourist_signals and local_audience_signals supporting any
non-unknown audience/orientation result. Travel-guide or inbound positioning can support tourist
orientation; multilingual support, reservability, or tourist-district location alone cannot.
These measure discovery footprint, not restaurant quality or customer demographics.
Classify venue_format and whether
food/drink is primary so product eligibility can be evaluated deterministically. Bars, izakaya,
cafes, and neighborhood drinking venues can be valid fixed venues. Catering/mobile services and
entertainment-first venues must be identified when the evidence clearly establishes that format.
Content-language requirements:
- name_ja must preserve the restaurant's official Japanese name.
- name_en must be a natural English name or readable Hepburn-style romanization.
- why_fiyu must always be clear, natural English, approximately 1-3 concise sentences, and
  explain why this exact restaurant fits Fiyu based on the evidence.
- description_en must be a concise, evidence-grounded English restaurant description suitable
  for a Fiyu card. Do not include ratings, unverifiable praise, or operational details.
- why_fiyu must not sound machine-translated and must avoid generic marketing language.
- Japanese restaurant names and proper culinary terms may remain Japanese when appropriate.
- Preserve food_tags and signature_dishes as generated from the research; do not translate them
  merely to localize the restaurant content.

Return between 2 and 8 evidence URLs. Every URL must directly support
the identity, address, cuisine, chain status, signature dishes, local
coverage, or tourist coverage of this exact restaurant. Do not include
generic search results, similarly named businesses, category pages,
academic papers, or unrelated restaurants.

Address evidence is a separate data domain and must not affect any scoring-evidence field above.
Collect address evidence during this same request when reliable public sources are available.
Never return coordinates, verified-location state, or map eligibility. Follow these additional
address-evidence instructions:
"""
    + ADDRESS_RESEARCH_INSTRUCTIONS
    + """

Card enrichment is also a separate, presentation-only domain. Populate card_enrichment during this
same request when sources support it. Write a concrete restrained English card_description, normally
80-160 characters. Synthesize at most five specific review themes without copying review text; each
theme requires at least two independent source URLs. Record practical facts only when supported and
leave unknown values null/unknown. Normalize weekly hours, prioritizing current official sources,
then official social, reservation platforms, and reputable Japanese directories. Do not use Google
hours or Google review content. Preserve checked_at, confidence, source URLs, and disagreements.
Populate canonical contact/booking fields only when a current official restaurant source or current
permitted reservation platform supports the exact value. Never copy candidate contact hints into
the output. Attach the supporting source and leave unsupported phone, booking URL, method, and note
unknown. Normalize a source-supported per-person budget into currency, numeric bounds, and band,
retaining the raw source value. Do not infer budget from cuisine or restaurant style.
"""
)


def _restaurant_prompt(candidate: dict[str, object]) -> str:
    address_queries = generate_address_queries(
        candidate, max_search_actions=DEFAULT_MAX_SEARCH_ACTIONS
    )
    return f"""Research this exact restaurant:

Google place ID: {candidate.get("place_id")}
Name: {candidate.get("title")}
Address: {candidate.get("address")}
Neighborhood: {candidate.get("neighborhood")}
City: {candidate.get("city")}
Coordinates: {candidate.get("latitude")}, {candidate.get("longitude")}
Known category: {candidate.get("category") or candidate.get("broad_category")}
Reviewed discovery areas: {candidate.get("discovery_areas_json") or candidate.get("discovery_area")}

Backend-prepared address queries (preserve these in address_evidence.search_queries_attempted):
{chr(10).join(f"- {query}" for query in address_queries)}

Return only the requested structured evidence. Use Japanese search terms where useful.
"""


def _research_response(
    candidate: dict[str, object],
    *,
    client: OpenAI,
    model: str,
) -> object:
    return client.responses.parse(
        model=model,
        reasoning={"effort": "low"},
        tools=[{"type": "web_search", "search_context_size": "low"}],
        include=["web_search_call.results"],
        max_tool_calls=DEFAULT_MAX_SEARCH_ACTIONS,
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _restaurant_prompt(candidate)},
        ],
        text_format=RestaurantResearch,
    )


def research_candidate(
    candidate: dict[str, object],
    *,
    client: OpenAI,
    model: str,
) -> tuple[RestaurantResearch, set[str]]:
    response = _research_response(candidate, client=client, model=model)
    parsed = response.output_parsed
    if parsed is None:
        raise RuntimeError("OpenAI returned no parsed research result")
    parsed = RestaurantResearch.model_validate(parsed)
    urls = {url.strip() for url in parsed.evidence_urls if url.startswith(("http://", "https://"))}

    return parsed, set(list(urls)[:8])


def run_research_batch(
    db_path: str | Path,
    *,
    limit: int = 10,
    model: str | None = None,
    retry_failed: bool = False,
    place_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    load_dotenv()
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    queue = get_research_queue(db_path, limit=limit, retry_failed=retry_failed, place_id=place_id)
    if dry_run:
        return {
            "dry_run": True,
            "selected_model": selected_model,
            "maximum_responses_requests": len(queue),
            "maximum_web_search_actions": len(queue) * DEFAULT_MAX_SEARCH_ACTIONS,
            "candidates": [str(item["place_id"]) for item in queue],
        }
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env")

    client = OpenAI(max_retries=0)
    completed = 0
    failed = 0
    address_accepted = 0
    address_needs_fallback = 0
    web_search_actions = 0
    token_usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    for candidate in queue:
        place_id = str(candidate["place_id"])
        mark_research_started(db_path, place_id)
        research_run_id = start_restaurant_research_run(
            db_path,
            place_id,
            model=selected_model,
            prompt_version=PROMPT_VERSION,
        )
        address_run_id = start_address_run(
            db_path,
            place_id=place_id,
            model=selected_model,
            forced=False,
            combined_research=True,
        )
        record_generated_queries(
            db_path,
            run_id=address_run_id,
            place_id=place_id,
            queries=generate_address_queries(
                candidate, max_search_actions=DEFAULT_MAX_SEARCH_ACTIONS
            ),
        )
        try:
            response = _research_response(candidate, client=client, model=selected_model)
            response_metadata = extract_response_metadata(
                response, fallback_model=selected_model
            )
            web_search_actions += response_metadata.web_search_action_count
            for key in token_usage:
                token_usage[key] += int(response_metadata.usage_metadata.get(key, 0) or 0)
            parsed = getattr(response, "output_parsed", None)
            if parsed is None:
                raise RuntimeError("OpenAI returned no parsed research result")
            research = RestaurantResearch.model_validate(parsed)
            urls = {
                url.strip()
                for url in research.evidence_urls
                if url.startswith(("http://", "https://"))
            }
            evidence = research.to_evidence()
            internal = InternalSignals(
                quality_score=float(candidate.get("quality_score") or 0),
                underexposure_score=float(candidate.get("underexposure_score") or 0),
                digital_footprint_score=float(candidate.get("digital_footprint_score") or 0),
            )
            structured_research = research.model_dump(mode="json")
            scoring_structured = scoring_research_view(structured_research)
            chain = assess_chain_classification(evidence, scoring_structured)
            evidence.chain_classification = chain.classification
            evidence.restaurant_group_affiliated = chain.group_affiliated
            evidence.likely_chain = chain.excluded
            structured_research["chain_classification"] = chain.classification
            structured_research["restaurant_group_affiliated"] = chain.group_affiliated
            structured_research["likely_chain"] = chain.excluded
            structured_research["chain_classification_reasons"] = list(chain.reasons)
            score = evaluate_fiyu_candidate(
                evidence,
                internal,
                scoring_structured,
                primary_category=research.primary_category,
            )
            save_research_result(
                db_path,
                place_id=place_id,
                evidence=evidence,
                score=score,
                name_ja=research.name_ja,
                name_en=research.name_en,
                primary_category=research.primary_category,
                food_tags=research.food_tags,
                signature_dishes=research.signature_dishes,
                why_fiyu=research.why_fiyu,
                description_en=research.description_en,
                evidence_urls=urls,
                model_name=selected_model,
                prompt_version=PROMPT_VERSION,
                structured_research=structured_research,
                usage_metadata={
                    "response_id": getattr(response, "id", None),
                    "usage": (getattr(getattr(response, "usage", None), "model_dump", dict)()),
                },
                research_run_id=research_run_id,
            )
            try:
                address_call = combined_address_call(
                    candidate,
                    result=research.address_evidence,
                    response=response,
                    model=selected_model,
                )
                persist_address_call(
                    db_path,
                    place_id=place_id,
                    run_id=address_run_id,
                    call=address_call,
                    verified_by="combined_restaurant_research_v2",
                )
                if address_call.acceptance.status == "accepted":
                    address_accepted += 1
                else:
                    address_needs_fallback += 1
            except Exception as address_exc:  # noqa: BLE001 - scoring research is already valid.
                fail_address_run(db_path, address_run_id, address_exc)
                address_needs_fallback += 1
            completed += 1
        except Exception as exc:  # noqa: BLE001 - isolate rows and preserve the failure.
            fail_address_run(db_path, address_run_id, exc)
            error = f"{type(exc).__name__}: {exc}"
            if _ambiguous_request_failure(exc):
                finish_restaurant_research_run(
                    db_path, research_run_id, status="needs_retry", error=error
                )
                mark_research_needs_retry(db_path, place_id, error)
            else:
                finish_restaurant_research_run(
                    db_path, research_run_id, status="failed", error=error
                )
                mark_research_failed(db_path, place_id, error)
            failed += 1

    return {
        "queued": len(queue),
        "completed": completed,
        "failed": failed,
        "responses_requests": len(queue),
        "web_search_actions": web_search_actions,
        "token_usage": token_usage,
        "address_accepted": address_accepted,
        "address_needs_fallback": address_needs_fallback,
    }
