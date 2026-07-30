from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .database import connect
from .public_catalog import ensure_public_schema
from .sqlite_snapshot import readonly_sqlite_snapshot

PROMPT_VERSION = "grounded-description-v1"
DEFAULT_MODEL = "gpt-5.6-luna"
DEFAULT_MAX_SEARCH_ACTIONS = 1
MAX_SEARCH_ACTIONS = 2
_JAPANESE_TEXT = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]")
_UNSUPPORTED_MARKETING = re.compile(
    r"\b(popular with locals?|local favou?rite|beloved|award[- ]winning|famous|"
    r"must[- ]visit|hidden gem|buzzy|trending)\b",
    re.IGNORECASE,
)
_SPECULATION = re.compile(r"\b(probably|likely|may|might|appears to)\s+(serve|offer)", re.IGNORECASE)


class GroundedRestaurantDescription(BaseModel):
    model_config = ConfigDict(extra="forbid")

    place_id: str = Field(min_length=1, max_length=300)
    description_en: str = Field(min_length=180, max_length=300)
    restaurant_type_en: str = Field(min_length=1, max_length=120)
    cuisine_terms_en: list[str] = Field(default_factory=list, max_length=8)
    signature_dishes_en: list[str] = Field(default_factory=list, max_length=6)
    supporting_source_urls: list[str] = Field(default_factory=list, max_length=8)
    confidence: float = Field(ge=0, le=1)
    unsupported_claims: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("description_en")
    @classmethod
    def validate_description(cls, value: str) -> str:
        compact = " ".join(value.split())
        if _JAPANESE_TEXT.search(compact):
            raise ValueError("description_en must not contain Japanese prose")
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", compact) if part.strip()]
        if len(sentences) != 2 or any(sentence[-1] not in ".!?" for sentence in sentences):
            raise ValueError("description_en must contain exactly two sentences")
        if _UNSUPPORTED_MARKETING.search(compact):
            raise ValueError("description_en contains an unsupported popularity or marketing claim")
        if _SPECULATION.search(compact):
            raise ValueError("description_en must not speculate about what the restaurant serves")
        if re.search(r"\ba izakaya\b", compact, re.IGNORECASE):
            raise ValueError("description_en must use natural English articles")
        return compact

    @field_validator("supporting_source_urls")
    @classmethod
    def validate_source_urls(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            url = value.strip()
            if not url.startswith(("https://", "http://")):
                raise ValueError("supporting_source_urls must contain HTTP(S) URLs")
            if url not in cleaned:
                cleaned.append(url)
        return cleaned

    @model_validator(mode="after")
    def require_english_structured_content(self) -> GroundedRestaurantDescription:
        structured = [
            self.restaurant_type_en,
            *self.cuisine_terms_en,
            *self.signature_dishes_en,
        ]
        if any(_JAPANESE_TEXT.search(value) for value in structured):
            raise ValueError("English structured description fields must not contain Japanese")
        return self


class DescriptionResearchFailure(RuntimeError):
    def __init__(self, message: str, *, metadata: dict[str, object]):
        super().__init__(message)
        self.metadata = metadata


DESCRIPTION_INSTRUCTIONS = """You write grounded English restaurant descriptions for Fiyu.

Use the supplied stored research and source URLs first. A bounded web search is available only as a
fallback when those materials are insufficient. Do not search merely to improve style.

Return exactly the requested structured object. description_en must be exactly two concise English
sentences and approximately 180-300 characters. Sentence 1 states the restaurant type and what it
verifiably serves. Sentence 2 gives only supported format, atmosphere, specialty, or neighborhood
context. Use natural grammar (for example, "an izakaya"). Do not include why_fiyu, score explanations,
Japanese prose, speculation, or generic marketing. Never claim popularity with locals. Never say what
the restaurant probably serves. Preserve restaurant and proper names in a readable English or
romanized form.

Every factual claim must be supported by supplied structured research or a supporting source URL.
List any claim that cannot be supported in unsupported_claims rather than quietly presenting it as
fact. Do not add ratings, prices, awards, history, atmosphere, dishes, or neighborhood context unless
the supplied evidence supports them. supporting_source_urls must contain only URLs that support the
final description.
"""


def _json_list(value: object) -> list[str]:
    try:
        parsed = json.loads(str(value or "[]"))
    except json.JSONDecodeError:
        return []
    return [str(item).strip() for item in parsed if str(item).strip()] if isinstance(parsed, list) else []


def _description_prompt(row: dict[str, object]) -> str:
    payload = {
        "place_id": row["place_id"],
        "name_ja": row.get("name_ja"),
        "name_en": row.get("name_en"),
        "restaurant_type": row.get("primary_category"),
        "food_tags": _json_list(row.get("food_tags_json")),
        "signature_dishes": _json_list(row.get("signature_dishes_json")),
        "discovery_area": row.get("discovery_area"),
        "neighborhood": row.get("neighborhood"),
        "verified_written_address": row.get("verified_core_address"),
        "stored_research_summary": row.get("why_fiyu"),
        "stored_research_source_urls": _json_list(row.get("evidence_urls_json")),
    }
    return (
        "Create a grounded description for this exact restaurant. Treat stored source URLs as the "
        "first evidence path and use web search only if they are insufficient.\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def _stored_evidence_is_sufficient(row: dict[str, object]) -> bool:
    has_serving_detail = bool(
        _json_list(row.get("signature_dishes_json"))
        or _json_list(row.get("food_tags_json"))
    )
    has_context = bool(
        str(row.get("discovery_area") or "").strip()
        or str(row.get("neighborhood") or "").strip()
    )
    return bool(
        _json_list(row.get("evidence_urls_json"))
        and str(row.get("primary_category") or "").strip()
        and has_serving_detail
        and has_context
    )


def _value(obj: object, name: str, default: object = None) -> object:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _response_metadata(response: object, *, fallback_model: str) -> dict[str, object]:
    search_urls: list[str] = []
    web_actions = 0
    for item in _value(response, "output", []) or []:
        item_type = str(_value(item, "type", ""))
        if item_type == "web_search_call":
            web_actions += 1
            action = _value(item, "action", {}) or {}
            for source in _value(action, "sources", []) or []:
                url = _value(source, "url", None)
                if url and str(url) not in search_urls:
                    search_urls.append(str(url))
        if item_type == "message":
            for content in _value(item, "content", []) or []:
                for annotation in _value(content, "annotations", []) or []:
                    if str(_value(annotation, "type", "")) == "url_citation":
                        url = _value(annotation, "url", None)
                        if url and str(url) not in search_urls:
                            search_urls.append(str(url))
    usage = _value(response, "usage", None)
    return {
        "response_id": str(_value(response, "id", "") or "") or None,
        "model": str(_value(response, "model", fallback_model) or fallback_model),
        "web_search_action_count": web_actions,
        "input_tokens": int(_value(usage, "input_tokens", 0) or 0),
        "output_tokens": int(_value(usage, "output_tokens", 0) or 0),
        "total_tokens": int(_value(usage, "total_tokens", 0) or 0),
        "observed_source_urls": search_urls,
    }


def research_description(
    row: dict[str, object],
    *,
    client: OpenAI,
    model: str,
    max_search_actions: int,
) -> tuple[GroundedRestaurantDescription, dict[str, object]]:
    request: dict[str, object] = {
        "model": model,
        "reasoning": {"effort": "low"},
        "input": [
            {"role": "system", "content": DESCRIPTION_INSTRUCTIONS},
            {"role": "user", "content": _description_prompt(row)},
        ],
        "text_format": GroundedRestaurantDescription,
        "max_output_tokens": 1200,
    }
    if max_search_actions and not _stored_evidence_is_sufficient(row):
        request.update(
            {
                "tools": [{"type": "web_search", "search_context_size": "low"}],
                "include": ["web_search_call.results"],
                "max_tool_calls": max_search_actions,
            }
        )
    response = client.responses.parse(**request)
    metadata = _response_metadata(response, fallback_model=model)
    parsed = _value(response, "output_parsed", None)
    if parsed is None:
        raise DescriptionResearchFailure(
            "OpenAI returned no parsed description result", metadata=metadata
        )
    try:
        result = GroundedRestaurantDescription.model_validate(parsed)
    except Exception as exc:
        raise DescriptionResearchFailure(
            f"structured description validation failed: {exc}", metadata=metadata
        ) from exc
    return result, metadata


def _description_rows(
    db_path: str | Path,
    *,
    limit: int,
    place_id: str | None,
    refresh_existing: bool,
) -> list[dict[str, object]]:
    with readonly_sqlite_snapshot(db_path) as connection:
        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(public_restaurants)").fetchall()
        }
        existing_description = (
            "p.description_en" if "description_en" in columns else "NULL AS description_en"
        )
        conditions = ["p.research_status = 'complete'"]
        parameters: list[object] = []
        if place_id:
            conditions.append("p.place_id = ?")
            parameters.append(place_id)
        if not refresh_existing and "description_en" in columns:
            conditions.append("(p.description_en IS NULL OR TRIM(p.description_en) = '')")
        rows = connection.execute(
            f"""
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
                   p.food_tags_json, p.signature_dishes_json, p.evidence_urls_json,
                   p.why_fiyu, p.discovery_area, p.verified_core_address,
                   r.neighborhood, {existing_description}
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE {' AND '.join(conditions)}
            ORDER BY p.updated_at, p.place_id
            LIMIT ?
            """,
            (*parameters, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def _write_report(path: str | Path, report: dict[str, object]) -> None:
    output = Path(path)
    if output.suffix.lower() != ".json":
        raise ValueError("description research output report must use a .json extension")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.{uuid4().hex}.tmp")
    try:
        temporary.write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def _persist_description(
    db_path: str | Path,
    *,
    result: GroundedRestaurantDescription,
    metadata: dict[str, object],
    model: str,
) -> int:
    now = datetime.now(UTC).isoformat()
    sources = json.dumps(result.supporting_source_urls, ensure_ascii=False)
    with connect(db_path) as connection:
        current = connection.execute(
            "SELECT description_en FROM public_restaurants WHERE place_id=?",
            (result.place_id,),
        ).fetchone()
        previous_description = current["description_en"] if current else None
        cursor = connection.execute(
            """
            INSERT INTO description_research_runs (
                public_restaurant_id, provider, model, response_id, status,
                previous_description_en, description_en, restaurant_type_en, cuisine_terms_en_json,
                signature_dishes_en_json, supporting_source_urls_json, confidence,
                unsupported_claims_json, web_search_action_count, input_tokens,
                output_tokens, total_tokens, error, created_at
            ) VALUES (?, 'openai_responses', ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, NULL, ?)
            """,
            (
                result.place_id,
                str(metadata.get("model") or model),
                metadata.get("response_id"),
                previous_description,
                result.description_en,
                result.restaurant_type_en,
                json.dumps(result.cuisine_terms_en, ensure_ascii=False),
                json.dumps(result.signature_dishes_en, ensure_ascii=False),
                sources,
                result.confidence,
                metadata["web_search_action_count"],
                metadata["input_tokens"],
                metadata["output_tokens"],
                metadata["total_tokens"],
                now,
            ),
        )
        updated = connection.execute(
            """
            UPDATE public_restaurants
            SET description_en=?, description_source_urls_json=?, description_confidence=?,
                description_model_name=?, description_prompt_version=?,
                description_researched_at=?, updated_at=?
            WHERE place_id=? AND research_status='complete'
            """,
            (
                result.description_en,
                sources,
                result.confidence,
                str(metadata.get("model") or model),
                PROMPT_VERSION,
                now,
                now,
                result.place_id,
            ),
        )
        if updated.rowcount != 1:
            raise RuntimeError("restaurant is no longer eligible for description persistence")
        connection.commit()
        return int(cursor.lastrowid)


def run_description_research(
    db_path: str | Path,
    *,
    place_id: str | None = None,
    limit: int = 10,
    plan_only: bool = False,
    dry_run: bool = False,
    refresh_existing: bool = False,
    output_report: str | Path,
    max_search_actions: int = DEFAULT_MAX_SEARCH_ACTIONS,
    model: str | None = None,
    client: OpenAI | None = None,
) -> dict[str, object]:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    if plan_only and dry_run:
        raise ValueError("--plan-only and --dry-run are mutually exclusive")
    if not 0 <= max_search_actions <= MAX_SEARCH_ACTIONS:
        raise ValueError(f"max_search_actions must be between 0 and {MAX_SEARCH_ACTIONS}")
    if not plan_only and not dry_run:
        ensure_public_schema(db_path)

    rows = _description_rows(
        db_path,
        limit=limit,
        place_id=place_id,
        refresh_existing=refresh_existing,
    )
    selected_model = model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    report: dict[str, Any] = {
        "mode": "plan_only" if plan_only else "dry_run" if dry_run else "persist",
        "prompt_version": PROMPT_VERSION,
        "refresh_existing": refresh_existing,
        "selected": len(rows),
        "maximum_responses_requests": 0 if plan_only else len(rows),
        "maximum_web_search_actions": (
            0
            if plan_only
            else sum(not _stored_evidence_is_sufficient(row) for row in rows)
            * max_search_actions
        ),
        "max_search_actions_per_restaurant": max_search_actions,
        "automatic_paid_retries": 0,
        "restaurants": [
            {
                "place_id": row["place_id"],
                "name_ja": row.get("name_ja"),
                "name_en": row.get("name_en"),
                "stored_source_count": len(_json_list(row.get("evidence_urls_json"))),
                "web_search_fallback_eligible": not _stored_evidence_is_sufficient(row),
            }
            for row in rows
        ],
        "usage_totals": {
            "response_request_count": 0,
            "web_search_action_count": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
        },
        "accepted": 0,
        "persisted": 0,
        "failures": [],
    }
    if plan_only:
        _write_report(output_report, report)
        return report

    if client is None:
        load_dotenv()
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is missing. Configure it before paid research")
        client = OpenAI(max_retries=0)

    outputs: list[dict[str, object]] = []
    totals = report["usage_totals"]
    for row in rows:
        current_id = str(row["place_id"])
        totals["response_request_count"] += 1
        try:
            result, metadata = research_description(
                row,
                client=client,
                model=selected_model,
                max_search_actions=max_search_actions,
            )
            for field in (
                "web_search_action_count",
                "input_tokens",
                "output_tokens",
                "total_tokens",
            ):
                totals[field] += int(metadata[field])
            if int(metadata["web_search_action_count"]) > max_search_actions:
                raise ValueError("provider exceeded the configured web-search action limit")
            if result.place_id != current_id:
                raise ValueError("structured place_id does not match the selected restaurant")
            if result.unsupported_claims:
                raise ValueError("structured output reports unsupported claims")
            if result.confidence < 0.65:
                raise ValueError("description confidence is below the persistence threshold")
            if not result.supporting_source_urls:
                raise ValueError("description has no supporting source provenance")
            observed = set(_json_list(row.get("evidence_urls_json")))
            observed.update(str(url) for url in metadata["observed_source_urls"])
            unrecognized = [url for url in result.supporting_source_urls if url not in observed]
            if unrecognized:
                raise ValueError("supporting_source_urls contains an unobserved source URL")
            proposal = {
                **result.model_dump(),
                "usage": {
                    key: metadata[key]
                    for key in (
                        "web_search_action_count",
                        "input_tokens",
                        "output_tokens",
                        "total_tokens",
                    )
                },
            }
            if not dry_run:
                proposal["description_research_run_id"] = _persist_description(
                    db_path,
                    result=result,
                    metadata=metadata,
                    model=selected_model,
                )
                report["persisted"] += 1
            outputs.append(proposal)
            report["accepted"] += 1
        except DescriptionResearchFailure as exc:
            for field in (
                "web_search_action_count",
                "input_tokens",
                "output_tokens",
                "total_tokens",
            ):
                totals[field] += int(exc.metadata[field])
            report["failures"].append(
                {"place_id": current_id, "error": f"{type(exc).__name__}: {exc}"}
            )
        except Exception as exc:  # noqa: BLE001 - isolate paid rows and never persist invalid copy.
            report["failures"].append(
                {"place_id": current_id, "error": f"{type(exc).__name__}: {exc}"}
            )
    report["restaurants"] = outputs
    report["failed"] = len(report["failures"])
    _write_report(output_report, report)
    return report
