from __future__ import annotations

import json
import os
import re
from copy import deepcopy
from typing import Any, Literal

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from .user_fiyu_summary import (
    _FACETS,
    TasteFacet,
    _confidence_for_type,
    _fallback_copy,
    _identity_tag,
)

COPY_VERSION = "taste-copy-v1"
DEFAULT_MODEL = "gpt-5.6-luna"
MAX_OUTPUT_TOKENS = 700


class TastePhrase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    facet_key: str = Field(min_length=1, max_length=80)
    headline: str = Field(min_length=3, max_length=90)
    description: str = Field(min_length=8, max_length=240)


class TastePhraseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    insights: list[TastePhrase] = Field(min_length=1, max_length=4)


def _enabled() -> bool:
    return os.getenv("FIYU_TASTE_PHRASING_ENABLED", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def snapshot_needs_copy(snapshot: dict[str, Any]) -> bool:
    insights = snapshot.get("insights")
    if not isinstance(insights, list) or not insights:
        return snapshot.get("copy_version") != COPY_VERSION
    return snapshot.get("copy_version") != COPY_VERSION or any(
        not isinstance(insight, dict)
        or not str(insight.get("headline") or "").strip()
        or not str(insight.get("description") or "").strip()
        for insight in insights
    )


def _facet_for(insight: dict[str, Any]) -> TasteFacet:
    key = str(insight.get("facet_key") or "")
    known = _FACETS.get(key)
    if known is not None:
        return known
    label = str(insight.get("facet_label") or key.replace("_", " ").title())
    family = "cuisine" if key.startswith("cuisine_") else "derived"
    return TasteFacet(key, label, family)


def with_deterministic_copy(snapshot: dict[str, Any]) -> dict[str, Any]:
    repaired = deepcopy(snapshot)
    repaired_insights: list[dict[str, Any]] = []
    for raw in repaired.get("insights", []):
        if not isinstance(raw, dict):
            continue
        insight = deepcopy(raw)
        insight_type = str(insight.get("type") or "early_signal")
        direction: Literal["positive", "negative", "neutral"]
        if insight.get("direction") in {"positive", "negative", "neutral"}:
            direction = insight["direction"]
        elif insight_type == "contrast":
            direction = "negative"
        elif str(insight.get("facet_key") or "").startswith("rating_"):
            direction = "neutral"
        else:
            direction = "positive"
        facet = _facet_for(insight)
        headline, description = _fallback_copy(
            facet=facet,
            insight_type=insight_type,
            direction=direction,
            support=int(insight.get("support_count") or 0),
            save_rate=float(insight.get("save_affinity") or 0),
            visit_rate=float(insight.get("visit_affinity") or 0),
        )
        change_status = insight.get("change_status")
        if change_status == "still_true" and direction != "neutral":
            headline = f"The pattern around {facet.label.lower()} is still holding"
            description = "This quality continues to turn up among the places that land well for you."
        elif change_status == "stronger" and direction != "neutral":
            headline = f"The pull toward {facet.label.lower()} is becoming more pronounced"
            description = "This pattern is strengthening as more rated visits support it."
        old_supporting = str(insight.get("supporting_text") or "").strip()
        insight.update(
            {
                "facet_label": facet.label,
                "confidence": str(
                    insight.get("confidence") or _confidence_for_type(insight_type)
                ),
                "direction": direction,
                "headline": headline,
                "description": description,
                "supporting_text": description,
                "save_affinity": float(insight.get("save_affinity") or 0),
                "visit_affinity": float(insight.get("visit_affinity") or 0),
                "evidence_summary": str(
                    insight.get("evidence_summary") or old_supporting
                ).strip(),
            }
        )
        repaired_insights.append(insight)
    repaired["insights"] = repaired_insights
    repaired_tags: list[dict[str, str]] = []
    seen_tag_keys: set[str] = set()
    for insight in repaired_insights:
        tag = _identity_tag(_facet_for(insight), insight)
        if tag is not None and tag["key"] not in seen_tag_keys:
            repaired_tags.append(tag)
            seen_tag_keys.add(tag["key"])
    repaired["tags"] = repaired_tags[:8]
    repaired["copy_version"] = COPY_VERSION
    repaired["copy_source"] = "deterministic_fallback"
    repaired.setdefault("taste_type", None)
    return repaired


def compact_findings_payload(snapshot: dict[str, Any]) -> dict[str, Any]:
    findings = []
    for insight in snapshot.get("insights", []):
        findings.append(
            {
                "facet": insight["facet_key"],
                "label": insight["facet_label"],
                "direction": insight["direction"],
                "confidence": insight["confidence"],
                "support_count": insight["support_count"],
                "rating_delta": insight["delta_from_user_average"],
                "save_affinity": insight["save_affinity"],
                "visit_affinity": insight["visit_affinity"],
                "change_status": insight.get("change_status"),
            }
        )
    return {
        "user_overall_rating": snapshot.get("overall_average"),
        "milestone": snapshot.get("milestone"),
        "findings": findings,
    }


def _confidence_safe(insight: dict[str, Any], phrase: TastePhrase) -> bool:
    copy = f"{phrase.headline} {phrase.description}".lower()
    disallowed_style = (
        "behavioral data",
        "statistically significant",
        "culinary personality",
        "personality type",
        "diagnosis",
    )
    if any(term in copy for term in disallowed_style) or re.search(r"\d+(?:\.\d+)?%", copy):
        return False
    if insight["confidence"] != "early":
        return True
    strong_claims = (
        "you love",
        "always",
        "consistently",
        "repeatedly",
        "clearest pattern",
        "defining preference",
    )
    return not any(claim in copy for claim in strong_claims)


def _apply_phrases(
    fallback: dict[str, Any], parsed: TastePhraseResponse | object
) -> dict[str, Any] | None:
    validated = TastePhraseResponse.model_validate(parsed)
    by_key = {item.facet_key: item for item in validated.insights}
    expected = {str(item["facet_key"]) for item in fallback["insights"]}
    if len(by_key) != len(validated.insights) or set(by_key) != expected:
        return None
    if any(not _confidence_safe(item, by_key[item["facet_key"]]) for item in fallback["insights"]):
        return None
    phrased = deepcopy(fallback)
    for insight in phrased["insights"]:
        phrase = by_key[insight["facet_key"]]
        insight["headline"] = phrase.headline.strip()
        insight["description"] = phrase.description.strip()
        insight["supporting_text"] = phrase.description.strip()
    phrased["copy_source"] = "llm"
    return phrased


def phrase_taste_snapshot(
    snapshot: dict[str, Any],
    *,
    client: Any | None = None,
    enabled: bool | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Phrase one persisted milestone; failure always returns deterministic copy."""

    fallback = with_deterministic_copy(snapshot)
    if not fallback["insights"]:
        return fallback
    should_call = _enabled() if enabled is None else enabled
    if client is None and (not should_call or not os.getenv("OPENAI_API_KEY")):
        return fallback
    api_client = client or OpenAI(max_retries=0, timeout=8.0)
    payload = compact_findings_payload(fallback)
    instructions = (
        "Rewrite only the supplied deterministic Taste findings. Return exactly one item per "
        "facet_key and never add, remove, merge, or reinterpret a finding. Keep each headline "
        "concise and each description to one or two short sentences. Confidence controls claim "
        "strength: early must sound tentative; emerging may say becoming/showing up; strong or "
        "reliable may say keeps/consistently. For still_true use still/remains/continues; for "
        "stronger use increasingly/strengthening/becoming more pronounced. Mention no restaurant "
        "names or percentages, and do not repeat support counts, ratings, deltas, or affinity "
        "values. Use no analytics "
        "jargon, personality diagnosis, or unsupported behavior."
    )
    try:
        response = api_client.responses.parse(
            model=model or os.getenv("FIYU_TASTE_PHRASING_MODEL", DEFAULT_MODEL),
            instructions=instructions,
            input=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            text_format=TastePhraseResponse,
            reasoning={"effort": "low"},
            max_output_tokens=MAX_OUTPUT_TOKENS,
        )
        parsed = getattr(response, "output_parsed", None)
        if parsed is None:
            return fallback
        return _apply_phrases(fallback, parsed) or fallback
    except Exception:  # noqa: BLE001 - optional phrasing must never break Profile
        return fallback
