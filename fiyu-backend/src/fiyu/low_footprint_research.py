from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from .address_research import extract_response_metadata
from .card_enrichment import scoring_research_view
from .database import connect
from .public_catalog import (
    ensure_public_schema,
    finish_restaurant_research_run,
    save_research_result,
    start_restaurant_research_run,
)
from .public_score import InternalSignals, assess_chain_classification, evaluate_fiyu_candidate
from .research_worker import RestaurantResearch, _ambiguous_request_failure

LOW_FOOTPRINT_PROMPT_VERSION = "local-gem-research-v3-card-enrichment"
LOW_FOOTPRINT_MAX_SEARCH_ACTIONS = 8
LOW_FOOTPRINT_MAX_OUTPUT_TOKENS = 12000

SYSTEM_PROMPT = """You are performing a targeted Japanese/local enrichment pass for Fiyu.

The ingested candidate and place ID are the entity of record. Do not try to prove that it exists.
Your task is to learn what this digitally obscure candidate serves, whether it is a fixed visit-ready
food/drink venue, whether it appears independent, what makes it distinctive, whether its audience and
coverage are primarily local/Japanese, and whether it has tourist, international, or corporate reach.
Classify tourist_orientation separately from international visibility and retain concise
tourist_signals and local_audience_signals. Multilingual support, reservability, or tourist-district
location alone is not tourist orientation; require actual tourist-facing evidence.

Search exact Japanese names with neighborhood, ward, and available address fragments. Prefer Japanese
local directories, Tabelog, Retty, Hot Pepper, official Instagram/X/websites, neighborhood or shotengai
sources, Japanese blogs, and local articles. Unrelated same-name results must be excluded from scoring
and retained only as audit context. Sparse results are valid and are not evidence that the candidate is
fake or poor quality. Never invent dishes, quality, local popularity, or customer demographics.

Return a complete RestaurantResearch object that combines reliable existing evidence supplied in the
request with newly found evidence. Local visibility fields measure discovery footprint, not quality.
Do not assign a Fiyu Score or Local Discovery score; Python calculates both deterministically.
Return the same canonical card_enrichment object used by normal restaurant research. Use local
Japanese sources to support a compact description, specific multi-source review themes, practical
visit facts, and normalized current hours. Do not copy review text, use Google review content or
Google hours, or fill unknown facts. Preserve source URLs, checked_at, confidence, and conflicts.
Keep every evidence item to a concise factual summary. Never reproduce raw page content, search
results, or review text. Deduplicate sources and signals and stay within every schema array bound.
"""


def _prompt(row: dict[str, object]) -> str:
    existing = str(row.get("structured_research_json") or "{}")
    return f"""Targeted local-gem enrichment for this candidate:

Place ID: {row["place_id"]}
Candidate name: {row.get("candidate_title")}
Current Japanese name: {row.get("name_ja")}
Current English name: {row.get("name_en")}
Candidate category: {row.get("candidate_category") or row.get("primary_category")}
Candidate address hint: {row.get("candidate_address")}
Candidate neighborhood: {row.get("candidate_neighborhood")}
Candidate city: {row.get("candidate_city")}
Discovery area provenance: {row.get("discovery_area")}

Existing structured enrichment (retain reliable facts; correct only with stronger relevant evidence):
{existing[:16000]}

Use Japanese/local search strategies. Return only the requested structured evidence.
"""


def _failure_usage_metadata(exc: BaseException) -> dict[str, object]:
    """Retain provider usage when an SDK exception exposes it, without secrets."""

    usage = getattr(exc, "usage", None)
    if usage is None:
        response = getattr(exc, "response", None)
        usage = getattr(response, "usage", None)
    if hasattr(usage, "model_dump"):
        usage = usage.model_dump()
    return {
        "usage_available": isinstance(usage, dict),
        "usage": usage if isinstance(usage, dict) else {},
        "failure_type": type(exc).__name__,
    }


def _queue(db_path: str | Path, place_ids: list[str] | None, limit: int):
    ensure_public_schema(db_path)
    selected = set(place_ids or [])
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.*, r.title AS candidate_title, r.category AS candidate_category,
                   r.address AS candidate_address, r.neighborhood AS candidate_neighborhood,
                   r.city AS candidate_city, r.quality_score, r.underexposure_score,
                   r.digital_footprint_score, rr.structured_research_json,
                   lf.id AS low_footprint_run_id, lf.evidence_fingerprint,
                   lf.before_score_json
            FROM public_restaurants p
            JOIN restaurants r ON r.place_id=p.place_id
            JOIN restaurant_research_runs rr ON rr.id=(
                SELECT current.id FROM restaurant_research_runs current
                WHERE current.public_restaurant_id=p.place_id
                  AND current.status='complete'
                ORDER BY current.is_current DESC, current.id DESC LIMIT 1
            )
            JOIN low_footprint_research_runs lf ON lf.id=(
                SELECT current.id FROM low_footprint_research_runs current
                WHERE current.public_restaurant_id=p.place_id
                  AND current.status='eligible'
                ORDER BY current.id DESC LIMIT 1
            )
            WHERE p.low_footprint_route_eligible=1
              AND p.low_footprint_research_attempted=0
            ORDER BY p.local_discovery_score DESC, p.fiyu_score DESC
            """
        ).fetchall()
    result = [dict(row) for row in rows]
    if selected:
        result = [row for row in result if str(row["place_id"]) in selected]
    return result[:limit]


def run_low_footprint_research(
    db_path: str | Path,
    *,
    place_ids: list[str] | None = None,
    limit: int = 5,
    model: str | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    """Run one operator-authorized paid local-gem pass per candidate."""

    if limit < 1 or limit > 25:
        raise ValueError("limit must be between 1 and 25")
    load_dotenv()
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    queue = _queue(db_path, place_ids, limit)
    if dry_run:
        return {
            "dry_run": True,
            "selected_model": selected_model,
            "candidates": [row["place_id"] for row in queue],
            "maximum_responses_requests": len(queue),
            "maximum_web_search_actions": len(queue) * LOW_FOOTPRINT_MAX_SEARCH_ACTIONS,
        }
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env")

    client = OpenAI(max_retries=0)
    results: list[dict[str, object]] = []
    responses_requests = 0
    web_search_actions = 0
    for row in queue:
        place_id = str(row["place_id"])
        now_run_id = start_restaurant_research_run(
            db_path,
            place_id,
            model=selected_model,
            prompt_version=LOW_FOOTPRINT_PROMPT_VERSION,
        )
        with connect(db_path) as connection:
            connection.execute(
                "UPDATE low_footprint_research_runs SET status='running', "
                "restaurant_research_run_id=? WHERE id=? AND status='eligible'",
                (now_run_id, row["low_footprint_run_id"]),
            )
            connection.commit()
        try:
            responses_requests += 1
            response = client.responses.parse(
                model=selected_model,
                reasoning={"effort": "low"},
                tools=[{"type": "web_search", "search_context_size": "low"}],
                include=["web_search_call.results"],
                max_tool_calls=LOW_FOOTPRINT_MAX_SEARCH_ACTIONS,
                max_output_tokens=LOW_FOOTPRINT_MAX_OUTPUT_TOKENS,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _prompt(row)},
                ],
                text_format=RestaurantResearch,
            )
            parsed = getattr(response, "output_parsed", None)
            if parsed is None:
                raise RuntimeError("OpenAI returned no parsed low-footprint result")
            research = RestaurantResearch.model_validate(parsed)
            evidence = research.to_evidence()
            structured = research.model_dump(mode="json")
            scoring_structured = scoring_research_view(structured)
            chain = assess_chain_classification(evidence, scoring_structured)
            evidence.chain_classification = chain.classification
            evidence.restaurant_group_affiliated = chain.group_affiliated
            evidence.likely_chain = chain.excluded
            structured["chain_classification"] = chain.classification
            structured["restaurant_group_affiliated"] = chain.group_affiliated
            structured["likely_chain"] = chain.excluded
            structured["chain_classification_reasons"] = list(chain.reasons)
            score = evaluate_fiyu_candidate(
                evidence,
                InternalSignals(
                    float(row.get("quality_score") or 0),
                    float(row.get("underexposure_score") or 0),
                    float(row.get("digital_footprint_score") or 0),
                ),
                scoring_structured,
                primary_category=research.primary_category,
            )
            metadata = extract_response_metadata(response, fallback_model=selected_model)
            web_search_actions += metadata.web_search_action_count
            urls = {
                url.strip()
                for url in research.evidence_urls
                if url.startswith(("http://", "https://"))
            }
            save_research_result(
                db_path,
                place_id=place_id,
                evidence=evidence,
                score=score,
                name_ja=research.name_ja or row.get("name_ja"),
                name_en=research.name_en or row.get("name_en"),
                primary_category=research.primary_category or row.get("primary_category"),
                food_tags=research.food_tags,
                signature_dishes=research.signature_dishes,
                why_fiyu=research.why_fiyu,
                description_en=research.description_en,
                evidence_urls=urls,
                model_name=selected_model,
                prompt_version=LOW_FOOTPRINT_PROMPT_VERSION,
                structured_research=structured,
                usage_metadata={
                    "response_id": metadata.response_id,
                    "web_search_action_count": metadata.web_search_action_count,
                    "usage": metadata.usage_metadata,
                    "route": "low_footprint",
                },
                research_run_id=now_run_id,
            )
            from .catalog_pipeline import apply_automatic_publication

            publication = apply_automatic_publication(db_path, place_id)
            with connect(db_path) as connection:
                connection.execute(
                    """
                    UPDATE low_footprint_research_runs
                    SET status='complete', response_id=?, result_evidence_json=?,
                        after_score_json=?, usage_metadata_json=?, completed_at=?
                    WHERE id=?
                    """,
                    (
                        metadata.response_id,
                        json.dumps(evidence.to_dict(), ensure_ascii=False),
                        json.dumps(score.to_dict(), ensure_ascii=False),
                        json.dumps(
                            {
                                "web_search_action_count": metadata.web_search_action_count,
                                "usage": metadata.usage_metadata,
                            },
                            ensure_ascii=False,
                        ),
                        datetime.now(UTC).isoformat(),
                        row["low_footprint_run_id"],
                    ),
                )
                connection.execute(
                    """
                    UPDATE public_restaurants
                    SET low_footprint_research_attempted=1,
                        low_footprint_research_run_id=?,
                        low_footprint_route_eligible=0
                    WHERE place_id=?
                    """,
                    (row["low_footprint_run_id"], place_id),
                )
                connection.commit()
            results.append(
                {
                    "place_id": place_id,
                    "status": "complete",
                    "research_run_id": now_run_id,
                    "before_score": json.loads(row["before_score_json"] or "{}"),
                    "after_score": score.to_dict(),
                    "publication": publication,
                    "web_search_actions": metadata.web_search_action_count,
                }
            )
        except Exception as exc:  # noqa: BLE001 - preserve per-candidate paid state.
            status = "needs_retry" if _ambiguous_request_failure(exc) else "failed"
            error = f"{type(exc).__name__}: {exc}"[:2000]
            failure_usage = _failure_usage_metadata(exc)
            finish_restaurant_research_run(db_path, now_run_id, status=status, error=error)
            with connect(db_path) as connection:
                connection.execute(
                    "UPDATE low_footprint_research_runs SET status=?, error=?, "
                    "usage_metadata_json=?, "
                    "completed_at=datetime('now') WHERE id=?",
                    (
                        status,
                        error,
                        json.dumps(failure_usage, ensure_ascii=False),
                        row["low_footprint_run_id"],
                    ),
                )
                connection.execute(
                    "UPDATE restaurant_research_runs SET usage_metadata_json=? WHERE id=?",
                    (json.dumps(failure_usage, ensure_ascii=False), now_run_id),
                )
                connection.execute(
                    "UPDATE public_restaurants SET low_footprint_research_attempted=1, "
                    "low_footprint_route_eligible=0 WHERE place_id=?",
                    (place_id,),
                )
                connection.commit()
            results.append({"place_id": place_id, "status": status, "error": error})

    return {
        "selected": len(queue),
        "responses_requests": responses_requests,
        "web_search_actions": web_search_actions,
        "results": results,
    }
