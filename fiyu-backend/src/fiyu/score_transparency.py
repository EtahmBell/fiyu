"""Read-only, allow-listed explanations of persisted scoring evidence.

Never call the scorer here: published rows may belong to historical models.
"""
from __future__ import annotations

import json
import math
from collections.abc import Mapping

from pydantic import BaseModel, Field

CURRENT_VERSION = "public-v3-local-discovery"
LEGACY_VERSIONS = {"public-v1", "public-v2-chain-classification"}


class ScoreSignal(BaseModel):
    key: str
    label: str
    value: float = Field(ge=0, le=10)
    description: str


class ScoreTransparency(BaseModel):
    reasons: list[str] = Field(default_factory=list)
    signals: list[ScoreSignal] = Field(default_factory=list)
    model_label: str
    evidence_confidence: str | None = None


def _object(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (ValueError, TypeError):
            pass
    return {}


def _number(value: object, maximum: float = 100) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) and 0 <= number <= maximum else None


def explain_score(row: Mapping[str, object]) -> ScoreTransparency:
    """Use stored factors, and only explicitly supported facts for prose.

    Display normalization is x/10, rounded to one decimal, NOT a new score.
    Missing fields are not neutral/default evidence. Confidence is a stored
    research diagnostic, not a confidence interval or verified quality rating.
    """
    version = row.get("score_version")
    current = version == CURRENT_VERSION
    known = current or version in LEGACY_VERSIONS
    signals = []
    if known and _number(row.get("fiyu_score")) is not None:
        definitions = [
            ("quality_signal", "Quality signal", "Rating evidence adjusted for review volume."
             if current else "Historical rating and positive-source evidence."),
            ("hiddenness_signal", "Underexposure", "Relative review volume and recorded web visibility."),
            ("independence_signal", "Independence & distinctiveness",
             "Historical chain-likelihood, location count and specialization inputs; not proof of independence."
             if version == "public-v1" else
             "Recorded chain classification, location count and specialization; unknown inputs can be neutral."),
            ("local_discovery_score", "Local discovery", "A combined discovery signal, including visibility, audience evidence and distinctiveness.")
            if current else
            ("local_signal", "Japanese-language web signal", "Source-language mix, not proof of customer nationality or residency."),
        ]
        for key, label, description in definitions:
            value = _number(row.get(key))
            if value is not None:
                signals.append(ScoreSignal(key=key, label=label, value=round(value / 10, 1), description=description))

    evidence = _object(row.get("evidence_json"))
    structured = _object(row.get("structured_research_json"))
    reasons = []
    # A strong stored quality component supports this modest signal claim, not
    # an assertion of independently verified food quality or local approval.
    quality = _number(row.get("quality_signal"))
    if signals and quality is not None and quality >= 70:
        reasons.append("The stored quality signal is strong, based on rating evidence" +
                       ("." if current else " and positive-source research."))

    matched = evidence.get("matched_restaurant") is True
    identity = _number(evidence.get("identity_confidence"), 1)
    sources = _number(evidence.get("total_evidence_sources"), 1_000_000)
    supported = (matched and identity is not None and identity >= 0.8
                 and sources is not None and sources >= 2
                 and evidence.get("conflicting_evidence") is not True
                 and structured.get("conflicting_evidence") is not True)
    if supported:
        classification = structured.get("chain_classification") or evidence.get("chain_classification")
        if (classification == "independent_single"
                and evidence.get("chain_classification") in {None, "unknown", "independent_single"}
                and structured.get("chain_classification") in {None, "unknown", "independent_single"}
                and evidence.get("known_location_count") == 1
                and structured.get("known_location_count", 1) == 1
                and not evidence.get("likely_chain") and not structured.get("likely_chain")
                and not evidence.get("restaurant_group_affiliated")
                and not structured.get("restaurant_group_affiliated")):
            reasons.append("Stored research identifies a single independent restaurant.")

        japanese = _number(evidence.get("japanese_source_count"), 1_000_000)
        english = _number(evidence.get("english_tourist_source_count"), 1_000_000)
        visibility = structured.get("international_visibility") or evidence.get("international_visibility")
        if japanese is not None and japanese > 0:
            if english is not None and english > 0:
                reasons.append("Research includes Japanese-language sources and English-language coverage; this is not a claim of obscurity.")
            elif (english == 0 and visibility == "low"
                  and evidence.get("international_visibility") in {None, "unknown", "low"}
                  and structured.get("international_visibility") in {None, "unknown", "low"}
                  and evidence.get("tourist_coverage") == "low"
                  and structured.get("tourist_orientation", "unknown") not in {"high", "mixed"}
                  and evidence.get("tourist_orientation", "unknown") not in {"high", "mixed"}):
                reasons.append("Research includes Japanese-language sources and records limited international visibility.")
            else:
                reasons.append("Japanese-language sources contributed to the stored research; source language does not establish who eats here.")

    # Avoid verbatim repetition of a pre-existing editorial sentence.
    description = str(row.get("card_description") or row.get("description_en") or "").casefold()
    reasons = [reason for reason in reasons if reason.casefold() not in description][:3]
    confidence = row.get("confidence_band")
    confidence_label = {
        "high": "High", "moderate": "Moderate", "low": "Low", "very_low": "Very low",
    }.get(confidence) if isinstance(confidence, str) and known else None
    return ScoreTransparency(
        reasons=reasons,
        signals=signals,
        model_label="Current scoring model" if current else "Historical scoring model" if known else "Scoring details unavailable",
        evidence_confidence=confidence_label,
    )
