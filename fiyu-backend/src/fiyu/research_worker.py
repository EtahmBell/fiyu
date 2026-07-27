from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field

from .public_catalog import (
    get_research_queue,
    mark_research_failed,
    mark_research_started,
    save_research_result,
)
from .public_score import FiyuEvidence, InternalSignals, calculate_fiyu_score


PROMPT_VERSION = "restaurant-research-v1"


class RestaurantResearch(BaseModel):
    matched_restaurant: bool
    identity_confidence: float = Field(ge=0, le=1)

    name_ja: str | None = None
    name_en: str | None = None
    primary_category: str | None = None
    food_tags: list[str] = Field(default_factory=list, max_length=8)
    signature_dishes: list[str] = Field(default_factory=list, max_length=6)

    official_language: Literal["ja", "mixed", "en", "unknown"]
    japanese_source_count: int = Field(ge=0)
    english_tourist_source_count: int = Field(ge=0)
    japanese_review_share: float | None = Field(default=None, ge=0, le=1)
    tourist_coverage: Literal["low", "medium", "high", "unknown"]
    reservation_platform_count: int = Field(ge=0)
    official_website_found: bool
    social_profile_count: int = Field(ge=0)
    likely_chain: bool
    known_location_count: int = Field(ge=0)
    specialist_restaurant: bool
    independent_positive_source_count: int = Field(ge=0)
    total_evidence_sources: int = Field(ge=0)
    conflicting_evidence: bool

    why_fiyu: str = Field(min_length=1, max_length=600)
    evidence_urls: list[str] = Field(default_factory=list, max_length=8)

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
            known_location_count=max(1, self.known_location_count),
            specialist_restaurant=self.specialist_restaurant,
            independent_positive_source_count=self.independent_positive_source_count,
            total_evidence_sources=self.total_evidence_sources,
            conflicting_evidence=self.conflicting_evidence,
        )


SYSTEM_PROMPT = """You research Tokyo restaurants for Fiyu, a hidden-gem discovery product.

Your job is to collect verifiable evidence, not to invent or directly assign a Fiyu score.
Use the restaurant name, address, coordinates, and Google place ID to avoid mixing up businesses.
Search Japanese sources as well as English sources. Prefer official restaurant pages, Japanese local
articles, local blogs, reservation pages, and reputable publications. Treat the absence of evidence
as unknown, not proof. Never infer customer nationality from language.

For japanese_review_share, only provide a number when a source or supplied review sample supports it.
Otherwise return null. Count unique, relevant sources only. Include URLs supporting the evidence.
Set conflicting_evidence=true when identity, chain status, closure, or location information conflicts.
Content-language requirements:
- name_ja must preserve the restaurant's official Japanese name.
- name_en must be a natural English name or readable Hepburn-style romanization.
- why_fiyu must always be clear, natural English, approximately 1-3 concise sentences, and
  explain why this exact restaurant fits Fiyu based on the evidence.
- why_fiyu must not sound machine-translated and must avoid generic marketing language.
- Japanese restaurant names and proper culinary terms may remain Japanese when appropriate.
- Preserve food_tags and signature_dishes as generated from the research; do not translate them
  merely to localize the restaurant content.

Return between 2 and 8 evidence URLs. Every URL must directly support
the identity, address, cuisine, chain status, signature dishes, local
coverage, or tourist coverage of this exact restaurant. Do not include
generic search results, similarly named businesses, category pages,
academic papers, or unrelated restaurants.
"""


def _restaurant_prompt(candidate: dict[str, object]) -> str:
    return f"""Research this exact restaurant:

Google place ID: {candidate.get('place_id')}
Name: {candidate.get('title')}
Address: {candidate.get('address')}
Neighborhood: {candidate.get('neighborhood')}
City: {candidate.get('city')}
Coordinates: {candidate.get('latitude')}, {candidate.get('longitude')}
Known category: {candidate.get('category') or candidate.get('broad_category')}

Return only the requested structured evidence. Use Japanese search terms where useful.
"""


def research_candidate(
    candidate: dict[str, object],
    *,
    client: OpenAI,
    model: str,
) -> tuple[RestaurantResearch, set[str]]:
    response = client.responses.parse(
        model=model,
        reasoning={"effort": "low"},
        tools=[{"type": "web_search", "search_context_size": "low"}],
        include=["web_search_call.results"],
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _restaurant_prompt(candidate)},
        ],
        text_format=RestaurantResearch,
    )
    parsed = response.output_parsed
    if parsed is None:
        raise RuntimeError("OpenAI returned no parsed research result")
    urls = {
        url.strip()
        for url in parsed.evidence_urls
        if url.startswith(("http://", "https://"))
    }

    return parsed, set(list(urls)[:8])

def run_research_batch(
    db_path: str | Path,
    *,
    limit: int = 10,
    model: str | None = None,
    retry_failed: bool = False,
) -> dict[str, int]:
    load_dotenv()
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env")

    client = OpenAI()
    queue = get_research_queue(db_path, limit=limit, retry_failed=retry_failed)
    completed = 0
    failed = 0

    for candidate in queue:
        place_id = str(candidate["place_id"])
        mark_research_started(db_path, place_id)
        try:
            research, urls = research_candidate(candidate, client=client, model=selected_model)
            evidence = research.to_evidence()
            internal = InternalSignals(
                quality_score=float(candidate.get("quality_score") or 0),
                underexposure_score=float(candidate.get("underexposure_score") or 0),
                digital_footprint_score=float(candidate.get("digital_footprint_score") or 0),
            )
            score = calculate_fiyu_score(evidence, internal)
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
                evidence_urls=urls,
                model_name=selected_model,
                prompt_version=PROMPT_VERSION,
            )
            completed += 1
        except Exception as exc:  # Keep a long batch moving while preserving the error.
            mark_research_failed(db_path, place_id, f"{type(exc).__name__}: {exc}")
            failed += 1

    return {"queued": len(queue), "completed": completed, "failed": failed}
