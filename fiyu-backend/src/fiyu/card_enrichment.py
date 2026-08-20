from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

from .database import connect

CARD_ENRICHMENT_PROMPT_VERSION = "restaurant-card-enrichment-v1"
CARD_ENRICHMENT_MAX_SEARCH_ACTIONS = 5
DAY_NAMES = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)
_DAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_GENERIC_THEME = re.compile(
    r"^(good|great|nice|delicious|tasty|popular)(\s+(food|place|service|restaurant))?$",
    re.IGNORECASE,
)
_PROMOTIONAL = re.compile(
    r"\b(amazing|must[- ]visit|hidden gem|best|world[- ]class|unmissable)\b",
    re.IGNORECASE,
)
_THEME_DANGLING_END = re.compile(
    r"\b(?:a|an|and|including|of|or|the|to|with)$", re.IGNORECASE
)
_THEME_UNEXPECTED_SCRIPT = re.compile(
    r"[\u0600-\u06ff\u200b-\u200f\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af]"
)
_INCOMPLETE_FACT_END = re.compile(
    r"\b(?:although|because|despite|if|unless|until|while)\s+\w+$", re.IGNORECASE
)


def _clean_http_urls(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    for value in values:
        url = value.strip()
        if not url.startswith(("https://", "http://")):
            raise ValueError("source URLs must use HTTP(S)")
        if url not in cleaned:
            cleaned.append(url)
    return cleaned


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class EnrichmentSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=8, max_length=2000)
    source_type: Literal[
        "official_website",
        "official_social",
        "reservation_platform",
        "restaurant_directory",
        "local_publication",
        "food_blog",
        "other",
    ] = "other"
    checked_at: str | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith(("https://", "http://")):
            raise ValueError("source URL must use HTTP(S)")
        return value


class ReviewTheme(BaseModel):
    model_config = ConfigDict(extra="forbid")

    theme: str = Field(min_length=3, max_length=120)
    sentiment: Literal["positive", "practical", "mixed"]
    supporting_source_count: int = Field(ge=1, le=20)
    confidence: float = Field(ge=0, le=1)
    source_urls: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("theme")
    @classmethod
    def useful_theme(cls, value: str) -> str:
        value = " ".join(value.split()).strip(" .")
        if _GENERIC_THEME.fullmatch(value):
            raise ValueError("review theme is too generic")
        if len(value) > 84:
            raise ValueError("review theme is too long for a compact complete phrase")
        if _THEME_DANGLING_END.search(value) or _THEME_UNEXPECTED_SCRIPT.search(value):
            raise ValueError("review theme appears incomplete or malformed")
        final_word = re.search(r"([A-Za-z]+)$", value)
        if final_word and len(final_word.group(1)) == 1:
            raise ValueError("review theme appears mechanically truncated")
        return value

    @model_validator(mode="after")
    def require_consensus(self) -> ReviewTheme:
        unique_urls = list(dict.fromkeys(self.source_urls))
        self.source_urls = unique_urls
        if self.supporting_source_count < 2 or len(unique_urls) < 2:
            raise ValueError("review themes require at least two independent sources")
        return self

    @field_validator("source_urls")
    @classmethod
    def validate_source_urls(cls, values: list[str]) -> list[str]:
        return _clean_http_urls(values)


class ReservationInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["recommended", "required", "usually_not_needed", "unknown"] = "unknown"
    confidence: float | None = Field(default=None, ge=0, le=1)


class SeatingInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    counter: bool | None = None
    tables: bool | None = None
    private_rooms: bool | None = None
    small_capacity: bool | None = None


class VisitStyleInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    solo_friendly: bool | None = None
    group_friendly: bool | None = None
    date_friendly: bool | None = None


class ServicePeriodsInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lunch: bool | None = None
    dinner: bool | None = None
    late_night: bool | None = None


class PaymentInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cash_only: bool | None = None
    cards: bool | None = None
    electronic_payment: bool | None = None


class PracticalInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reservation: ReservationInfo = Field(default_factory=ReservationInfo)
    seating: SeatingInfo = Field(default_factory=SeatingInfo)
    visit_style: VisitStyleInfo = Field(default_factory=VisitStyleInfo)
    service_periods: ServicePeriodsInfo = Field(default_factory=ServicePeriodsInfo)
    payment: PaymentInfo = Field(default_factory=PaymentInfo)
    other: list[str] = Field(default_factory=list, max_length=8)
    confidence: float | None = Field(default=None, ge=0, le=1)
    source_urls: list[str] = Field(default_factory=list, max_length=8)
    checked_at: str | None = None

    @field_validator("other")
    @classmethod
    def clean_other(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            fact = " ".join(value.split()).strip()
            if not fact or _INCOMPLETE_FACT_END.search(fact):
                continue
            if len(fact) > 180:
                shortened = fact[:181].rsplit(" ", 1)[0].rstrip(" ,;:")
                fact = f"{shortened}."
            if fact not in cleaned:
                cleaned.append(fact)
        return cleaned

    @field_validator("source_urls")
    @classmethod
    def validate_source_urls(cls, values: list[str]) -> list[str]:
        return _clean_http_urls(values)


class HoursPeriod(BaseModel):
    model_config = ConfigDict(extra="forbid")

    open: str
    close: str
    label: Literal["lunch", "dinner", "late_night", "other"] | None = None
    last_order: str | None = None

    @field_validator("last_order", mode="before")
    @classmethod
    def discard_ambiguous_last_order(cls, value: object) -> object:
        # A combined value such as "food 21:00; drinks 21:30" cannot be mapped
        # safely to the schema's single last-order field. Preserve the periods
        # and conflicts while leaving this optional field unknown.
        if isinstance(value, str) and not re.fullmatch(
            r"(?:[01]\d|2[0-9]):[0-5]\d", value.strip()
        ):
            return None
        return value

    @field_validator("open", "close", "last_order")
    @classmethod
    def validate_time(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not re.fullmatch(r"(?:[01]\d|2[0-9]):[0-5]\d", value):
            raise ValueError("time must use HH:MM (hours through 29 support overnight service)")
        return value


class DayHours(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["open", "closed", "unknown", "irregular"] = "unknown"
    periods: list[HoursPeriod] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def validate_periods(self) -> DayHours:
        if self.status == "open" and not self.periods:
            raise ValueError("open day requires at least one period")
        if self.status in {"closed", "unknown"} and self.periods:
            raise ValueError("closed or unknown days may not contain periods")
        return self


class OpeningHours(BaseModel):
    model_config = ConfigDict(extra="forbid")

    monday: DayHours = Field(default_factory=DayHours)
    tuesday: DayHours = Field(default_factory=DayHours)
    wednesday: DayHours = Field(default_factory=DayHours)
    thursday: DayHours = Field(default_factory=DayHours)
    friday: DayHours = Field(default_factory=DayHours)
    saturday: DayHours = Field(default_factory=DayHours)
    sunday: DayHours = Field(default_factory=DayHours)
    reservation_only: bool | None = None
    schedule_note: str | None = Field(default=None, max_length=160)
    confidence: float | None = Field(default=None, ge=0, le=1)
    sources: list[EnrichmentSource] = Field(default_factory=list, max_length=8)
    checked_at: str | None = None
    unresolved_conflicts: list[str] = Field(default_factory=list, max_length=6)


class CardEnrichment(BaseModel):
    """Canonical model shared by normal, low-footprint, and targeted research."""

    model_config = ConfigDict(extra="forbid")

    card_description: str | None = Field(default=None, max_length=240)
    card_description_confidence: float | None = Field(default=None, ge=0, le=1)
    card_description_source_urls: list[str] = Field(default_factory=list, max_length=8)
    review_themes: list[ReviewTheme] = Field(default_factory=list, max_length=5)
    practical_info: PracticalInfo = Field(default_factory=PracticalInfo)
    opening_hours: OpeningHours = Field(default_factory=OpeningHours)
    researched_at: str | None = None
    unresolved_conflicts: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("card_description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        if not value or _PROMOTIONAL.search(value):
            raise ValueError("card description is empty or promotional")
        return value

    @field_validator("review_themes", mode="before")
    @classmethod
    def filter_invalid_themes(cls, values: object) -> list[object]:
        if not isinstance(values, list):
            return []
        filtered: list[object] = []
        for value in values[:5]:
            theme = value.get("theme") if isinstance(value, dict) else getattr(value, "theme", "")
            source_urls = (
                value.get("source_urls", [])
                if isinstance(value, dict)
                else getattr(value, "source_urls", [])
            )
            source_count = (
                value.get("supporting_source_count", 0)
                if isinstance(value, dict)
                else getattr(value, "supporting_source_count", 0)
            )
            cleaned_theme = " ".join(str(theme).split()).strip(" .")
            final_word = re.search(r"([A-Za-z]+)$", cleaned_theme)
            if (
                theme
                and not _GENERIC_THEME.fullmatch(cleaned_theme)
                and len(cleaned_theme) <= 84
                and not _THEME_DANGLING_END.search(cleaned_theme)
                and not _THEME_UNEXPECTED_SCRIPT.search(cleaned_theme)
                and not (final_word and len(final_word.group(1)) == 1)
                and int(source_count or 0) >= 2
                and len(set(source_urls or [])) >= 2
            ):
                filtered.append(value)
        return filtered

    @field_validator("card_description_source_urls")
    @classmethod
    def validate_description_source_urls(cls, values: list[str]) -> list[str]:
        return _clean_http_urls(values)


def scoring_research_view(structured: dict[str, object] | None) -> dict[str, object]:
    """Exclude presentation-only enrichment from deterministic product decisions."""

    result = dict(structured or {})
    result.pop("card_enrichment", None)
    return result


def compact_card_description(value: str | None, *, limit: int = 180) -> str | None:
    if not value:
        return None
    compact = " ".join(value.split())
    if _PROMOTIONAL.search(compact):
        return None
    first = re.split(r"(?<=[.!?])\s+", compact, maxsplit=1)[0]
    candidate = first if len(first) >= 70 else compact
    if len(candidate) <= limit:
        return candidate
    shortened = candidate[: limit + 1].rsplit(" ", 1)[0].rstrip(" ,;:")
    return f"{shortened}." if shortened else None


def _period_key(day: DayHours) -> tuple[object, ...]:
    return (
        day.status,
        tuple((item.open, item.close, item.label, item.last_order) for item in day.periods),
    )


def format_opening_hours(hours: OpeningHours | dict[str, object] | None) -> str | None:
    if hours is None:
        return None
    hours = OpeningHours.model_validate(hours)
    if hours.reservation_only and not any(
        getattr(hours, day).status == "open" for day in DAY_NAMES
    ):
        return "Reservation only"
    groups: list[tuple[int, int, DayHours]] = []
    start = 0
    while start < 7:
        current = getattr(hours, DAY_NAMES[start])
        end = start
        while end + 1 < 7 and _period_key(getattr(hours, DAY_NAMES[end + 1])) == _period_key(
            current
        ):
            end += 1
        if current.status == "open":
            groups.append((start, end, current))
        start = end + 1
    if not groups:
        if any(getattr(hours, day).status == "irregular" for day in DAY_NAMES):
            return "Hours vary"
        return hours.schedule_note or None
    rendered: list[str] = []
    for start, end, day in groups:
        label = _DAY_LABELS[start] if start == end else f"{_DAY_LABELS[start]}–{_DAY_LABELS[end]}"
        periods = " / ".join(f"{item.open}–{item.close}" for item in day.periods)
        rendered.append(f"{label} · {periods}")
    return " · ".join(rendered)


def _parse_timestamp(value: str | None) -> datetime:
    try:
        return datetime.fromisoformat(value or "").astimezone(UTC)
    except (TypeError, ValueError):
        return datetime.min.replace(tzinfo=UTC)


def _source_rank(hours: OpeningHours) -> int:
    ranks = {
        "official_website": 5,
        "official_social": 4,
        "reservation_platform": 3,
        "restaurant_directory": 2,
        "local_publication": 2,
        "food_blog": 1,
        "other": 0,
    }
    return max((ranks[source.source_type] for source in hours.sources), default=0)


def _hours_merge_key(hours: OpeningHours) -> tuple[object, ...]:
    checked_at = _parse_timestamp(hours.checked_at)
    age_days = (datetime.now(UTC) - checked_at).days
    current_enough = checked_at != datetime.min.replace(tzinfo=UTC) and age_days <= 365
    return (
        current_enough,
        _source_rank(hours),
        hours.confidence or 0,
        checked_at,
    )


def practical_info_is_useful(info: PracticalInfo) -> bool:
    payload = info.model_dump(mode="json")
    payload.pop("source_urls", None)
    payload.pop("checked_at", None)
    payload.pop("confidence", None)
    return any(
        value not in (None, "unknown", [], {})
        for section in payload.values()
        for value in (section.values() if isinstance(section, dict) else [section])
    )


def _conservative_practical_merge(
    existing: PracticalInfo, incoming: PracticalInfo
) -> PracticalInfo:
    left = existing.model_dump(mode="json")
    right = incoming.model_dump(mode="json")
    merged: dict[str, object] = {}
    for section in (
        "reservation",
        "seating",
        "visit_style",
        "service_periods",
        "payment",
    ):
        merged_section: dict[str, object] = {}
        left_section = left[section]
        right_section = right[section]
        for key in set(left_section) | set(right_section):
            before = left_section.get(key)
            after = right_section.get(key)
            if before in (None, "unknown"):
                value = after
            elif after in (None, "unknown") or before == after:
                value = before
            else:
                value = "unknown" if key == "status" else None
            merged_section[key] = value
        merged[section] = merged_section
    merged["other"] = list(dict.fromkeys([*left["other"], *right["other"]]))[:8]
    merged["confidence"] = min(existing.confidence or 0, incoming.confidence or 0)
    merged["source_urls"] = list(dict.fromkeys([*existing.source_urls, *incoming.source_urls]))[:8]
    merged["checked_at"] = max(existing.checked_at or "", incoming.checked_at or "") or None
    return PracticalInfo.model_validate(merged)


def hours_are_usable(hours: OpeningHours) -> bool:
    return bool(
        hours.reservation_only
        or any(getattr(hours, day).status in {"open", "closed", "irregular"} for day in DAY_NAMES)
    )


def merge_card_enrichment(
    existing: CardEnrichment | None, incoming: CardEnrichment
) -> CardEnrichment:
    if existing is None:
        return incoming
    result = existing.model_copy(deep=True)
    incoming_newer = _parse_timestamp(incoming.researched_at) >= _parse_timestamp(
        existing.researched_at
    )
    existing_description_score = existing.card_description_confidence or 0
    incoming_description_score = incoming.card_description_confidence or 0
    if incoming.card_description and (
        not result.card_description
        or incoming_description_score > existing_description_score
        or (incoming_description_score == existing_description_score and incoming_newer)
    ):
        result.card_description = incoming.card_description
        result.card_description_confidence = incoming.card_description_confidence
        result.card_description_source_urls = incoming.card_description_source_urls

    themes = {theme.theme.casefold(): theme for theme in result.review_themes}
    for theme in incoming.review_themes:
        current = themes.get(theme.theme.casefold())
        if current is None or (theme.confidence, theme.supporting_source_count) > (
            current.confidence,
            current.supporting_source_count,
        ):
            themes[theme.theme.casefold()] = theme
    result.review_themes = sorted(
        themes.values(),
        key=lambda item: (item.confidence, item.supporting_source_count),
        reverse=True,
    )[:5]

    if practical_info_is_useful(incoming.practical_info):
        current_score = result.practical_info.confidence or 0
        incoming_score = incoming.practical_info.confidence or 0
        if (
            not practical_info_is_useful(result.practical_info)
            or incoming_score > current_score
            or (incoming_score == current_score and incoming_newer)
        ):
            same_authority = (
                practical_info_is_useful(result.practical_info)
                and incoming_score == current_score
                and _parse_timestamp(incoming.practical_info.checked_at)
                == _parse_timestamp(result.practical_info.checked_at)
            )
            result.practical_info = (
                _conservative_practical_merge(result.practical_info, incoming.practical_info)
                if same_authority
                else incoming.practical_info
            )

    if hours_are_usable(incoming.opening_hours):
        current = result.opening_hours
        incoming_key = _hours_merge_key(incoming.opening_hours)
        current_key = _hours_merge_key(current)
        if not hours_are_usable(current) or incoming_key > current_key:
            result.opening_hours = incoming.opening_hours
        elif (
            incoming_key == current_key
            and incoming.opening_hours.model_dump() != current.model_dump()
        ):
            result.opening_hours = OpeningHours(
                checked_at=max(current.checked_at or "", incoming.opening_hours.checked_at or "")
                or None,
                confidence=min(current.confidence or 0, incoming.opening_hours.confidence or 0),
                sources=list(
                    {
                        source.url: source
                        for source in [
                            *current.sources,
                            *incoming.opening_hours.sources,
                        ]
                    }.values()
                ),
                unresolved_conflicts=["Comparable sources disagree about opening hours."],
            )
    result.researched_at = max(existing.researched_at or "", incoming.researched_at or "") or None
    result.unresolved_conflicts = list(
        dict.fromkeys([*existing.unresolved_conflicts, *incoming.unresolved_conflicts])
    )[:8]
    return result


def enrichment_completeness(enrichment: CardEnrichment) -> dict[str, object]:
    description = bool(enrichment.card_description)
    themes = bool(enrichment.review_themes)
    practical = practical_info_is_useful(enrichment.practical_info)
    hours = hours_are_usable(enrichment.opening_hours)
    return {
        "card_description": description,
        "review_themes": themes,
        "practical_info": practical,
        "opening_hours": hours,
        "complete_enough": description and (themes or practical) and hours,
    }


def missing_enrichment_categories(enrichment: CardEnrichment) -> list[str]:
    complete = enrichment_completeness(enrichment)
    return [
        field
        for field in (
            "card_description",
            "review_themes",
            "practical_info",
            "opening_hours",
        )
        if not complete[field]
    ]


def classify_enrichment(enrichment: CardEnrichment) -> tuple[str, str]:
    complete = enrichment_completeness(enrichment)
    if all(
        complete[field]
        for field in ("card_description", "review_themes", "practical_info", "opening_hours")
    ):
        return "strong", "Description, review themes, practical information, and hours are usable."
    if complete["complete_enough"]:
        return (
            "usable",
            "Description, hours, and at least one useful decision-support layer are present.",
        )
    missing = missing_enrichment_categories(enrichment)
    return "sparse", f"Missing: {', '.join(missing)}."


def enrichment_from_structured_research(
    structured: dict[str, object], *, fallback_description: str | None = None
) -> CardEnrichment:
    raw = structured.get("card_enrichment")
    if isinstance(raw, dict):
        return CardEnrichment.model_validate(raw)
    return CardEnrichment(
        card_description=compact_card_description(
            str(structured.get("description_en") or fallback_description or "") or None
        ),
        card_description_confidence=(
            0.6 if structured.get("description_en") or fallback_description else None
        ),
        card_description_source_urls=[
            str(url)
            for url in structured.get("evidence_urls", [])
            if str(url).startswith(("http://", "https://"))
        ][:8],
        researched_at=None,
    )


def load_current_enrichment(connection, place_id: str) -> CardEnrichment | None:
    row = connection.execute(
        "SELECT card_enrichment_json FROM public_restaurants WHERE place_id=?", (place_id,)
    ).fetchone()
    if not row or not row["card_enrichment_json"]:
        return None
    try:
        return CardEnrichment.model_validate_json(row["card_enrichment_json"])
    except ValidationError:
        return None


def persist_card_enrichment(
    connection,
    *,
    place_id: str,
    incoming: CardEnrichment,
    provider: str,
    model: str | None,
    prompt_version: str,
    source_research_run_id: int | None = None,
    response_id: str | None = None,
    usage_metadata: dict[str, object] | None = None,
    phase: str = "pipeline",
    input_fingerprint: str | None = None,
) -> CardEnrichment:
    now = utc_now()
    if incoming.researched_at is None:
        incoming = incoming.model_copy(update={"researched_at": now})
    merged = merge_card_enrichment(load_current_enrichment(connection, place_id), incoming)
    hours_display = format_opening_hours(merged.opening_hours)
    payload = merged.model_dump(mode="json")
    fingerprint = (
        input_fingerprint
        or hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO restaurant_card_enrichment_runs (
            public_restaurant_id, provider, model, prompt_version, phase, status,
            source_research_run_id, response_id, input_fingerprint,
            enrichment_json, usage_metadata_json, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            place_id,
            provider,
            model,
            prompt_version,
            phase,
            source_research_run_id,
            response_id,
            fingerprint,
            json.dumps(payload, ensure_ascii=False),
            json.dumps(usage_metadata or {}, ensure_ascii=False),
            now,
            now,
        ),
    )
    connection.execute(
        """
        UPDATE public_restaurants SET
            card_description=?, card_description_confidence=?,
            card_description_checked_at=?, review_themes_json=?,
            review_themes_checked_at=?, practical_info_json=?,
            practical_info_checked_at=?, opening_hours_json=?, hours_display=?,
            hours_confidence=?, hours_checked_at=?, card_enrichment_json=?,
            card_enrichment_conflicts_json=?, enrichment_updated_at=?, updated_at=?
        WHERE place_id=?
        """,
        (
            merged.card_description,
            merged.card_description_confidence,
            merged.researched_at if merged.card_description else None,
            json.dumps(
                [item.model_dump(mode="json") for item in merged.review_themes], ensure_ascii=False
            ),
            merged.researched_at if merged.review_themes else None,
            json.dumps(merged.practical_info.model_dump(mode="json"), ensure_ascii=False),
            merged.practical_info.checked_at,
            json.dumps(merged.opening_hours.model_dump(mode="json"), ensure_ascii=False),
            hours_display,
            merged.opening_hours.confidence,
            merged.opening_hours.checked_at,
            json.dumps(payload, ensure_ascii=False),
            json.dumps(merged.unresolved_conflicts, ensure_ascii=False),
            now,
            now,
            place_id,
        ),
    )
    return merged


TARGETED_ENRICHMENT_INSTRUCTIONS = """Research user-facing card enrichment for this exact restaurant.
Do not score, classify, locate, or assess publication. Synthesize review themes without copying review
text and require two independent supporting sources for each theme. Each theme must be a complete,
compact English phrase, preferably under 72 characters; never clip a word or sentence to fit. Prefer official current sources for
hours, then official social, current reservation platforms, and reputable Japanese directories. Never
use Google-derived hours or Google review content. Unknown facts must remain unknown. The compact
description must be concrete, restrained English, normally 80-160 characters, with no superlatives.
Every practical-info note must also be a complete concise sentence, never a clipped fragment.
Return the canonical CardEnrichment schema and preserve source URLs, confidence, checked_at, and any
unresolved disagreement. Search only what is missing from the supplied persisted evidence."""


def _backfill_rows(
    db_path: str | Path,
    *,
    place_id: str | None = None,
    min_fiyu_score: float | None = None,
) -> list[dict[str, object]]:
    conditions = ["p.is_published=1"]
    parameters: list[object] = []
    if place_id:
        conditions.append("p.place_id=?")
        parameters.append(place_id)
    if min_fiyu_score is not None:
        conditions.append("p.fiyu_score>=?")
        parameters.append(min_fiyu_score)
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category, p.description_en,
                   p.card_enrichment_json, p.fiyu_score, p.local_discovery_score,
                   p.is_published, p.latitude, p.longitude, p.location_precision,
                   p.food_tags_json, p.signature_dishes_json, p.evidence_urls_json,
                   r.title AS candidate_title, r.neighborhood,
                   rr.id AS research_run_id, rr.structured_research_json, rr.prompt_version,
                   rr.created_at AS research_created_at
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            LEFT JOIN restaurant_research_runs rr ON rr.id=(
                SELECT current.id FROM restaurant_research_runs current
                WHERE current.public_restaurant_id=p.place_id AND current.status='complete'
                ORDER BY current.is_current DESC, current.id DESC LIMIT 1
            )
            WHERE {" AND ".join(conditions)}
            ORDER BY
                (p.card_description IS NULL OR trim(p.card_description)='') DESC,
                p.fiyu_score DESC,
                p.local_discovery_score DESC,
                p.place_id
            """,
            parameters,
        ).fetchall()
    return [dict(row) for row in rows]


def _phase_a_candidate(row: dict[str, object]) -> tuple[CardEnrichment, str]:
    try:
        structured = json.loads(str(row.get("structured_research_json") or "{}"))
    except json.JSONDecodeError:
        structured = {}
    enrichment = enrichment_from_structured_research(
        structured, fallback_description=str(row.get("description_en") or "") or None
    )
    enrichment.researched_at = str(row.get("research_created_at") or "") or None
    source = json.dumps(
        {
            "research_run_id": row.get("research_run_id"),
            "structured": structured.get("card_enrichment"),
            "description_en": row.get("description_en"),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return enrichment, hashlib.sha256(source.encode("utf-8")).hexdigest()


def backfill_card_enrichment(
    db_path: str | Path,
    *,
    phase: Literal["local", "research"] = "local",
    dry_run: bool = False,
    limit: int = 1000,
    model: str | None = None,
    client: OpenAI | None = None,
    place_id: str | None = None,
    min_fiyu_score: float | None = None,
    retry_failed: bool = False,
) -> dict[str, object]:
    """Resumable published-only backfill. Paid work requires explicit phase='research'."""

    from .public_catalog import ensure_public_schema

    ensure_public_schema(db_path)
    rows = _backfill_rows(db_path, place_id=place_id, min_fiyu_score=min_fiyu_score)
    report: dict[str, object] = {
        "phase": phase,
        "dry_run": dry_run,
        "published_restaurants_inspected": len(rows),
        "enriched_from_existing_evidence": 0,
        "fully_enriched": 0,
        "partially_enriched": 0,
        "requiring_targeted_research": [],
        "responses_requests": 0,
        "web_search_actions": 0,
        "token_usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
        "selected_candidates": [],
        "results": [],
    }
    if phase == "local":
        for row in rows[:limit]:
            incoming, fingerprint = _phase_a_candidate(row)
            before = (
                CardEnrichment.model_validate_json(row["card_enrichment_json"])
                if row.get("card_enrichment_json")
                else None
            )
            proposed = merge_card_enrichment(before, incoming) if before else incoming
            complete = enrichment_completeness(proposed)
            has_meaningful_enrichment = any(
                bool(complete[field])
                for field in (
                    "card_description",
                    "review_themes",
                    "practical_info",
                    "opening_hours",
                )
            )
            changed = has_meaningful_enrichment and (
                before is None or proposed.model_dump() != before.model_dump()
            )
            if changed and not dry_run:
                with connect(db_path) as connection:
                    persist_card_enrichment(
                        connection,
                        place_id=str(row["place_id"]),
                        incoming=incoming,
                        provider="persisted_research",
                        model=None,
                        prompt_version="card-enrichment-phase-a-v1",
                        source_research_run_id=row.get("research_run_id"),
                        phase="phase_a_local",
                        input_fingerprint=fingerprint,
                    )
                    connection.commit()
            if changed:
                report["enriched_from_existing_evidence"] = (
                    int(report["enriched_from_existing_evidence"]) + 1
                )
            if complete["complete_enough"]:
                report["fully_enriched"] = int(report["fully_enriched"]) + 1
            else:
                report["partially_enriched"] = int(report["partially_enriched"]) + 1
                report["requiring_targeted_research"].append(str(row["place_id"]))
            report["results"].append({"place_id": row["place_id"], "changed": changed, **complete})
        return report

    load_dotenv()
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    queue: list[tuple[dict[str, object], CardEnrichment, str, str]] = []
    with connect(db_path) as connection:
        for row in rows:
            current = load_current_enrichment(connection, str(row["place_id"])) or CardEnrichment()
            current_complete = enrichment_completeness(current)
            if current_complete["complete_enough"]:
                report["fully_enriched"] = int(report["fully_enriched"]) + 1
                continue
            report["partially_enriched"] = int(report["partially_enriched"]) + 1
            fingerprint = hashlib.sha256(
                json.dumps(current.model_dump(mode="json"), sort_keys=True).encode("utf-8")
            ).hexdigest()
            latest_attempt = connection.execute(
                """SELECT status FROM restaurant_card_enrichment_runs
                   WHERE public_restaurant_id=? AND phase='phase_b_research'
                     AND prompt_version=?
                   ORDER BY id DESC LIMIT 1""",
                (row["place_id"], CARD_ENRICHMENT_PROMPT_VERSION),
            ).fetchone()
            latest_status = str(latest_attempt["status"]) if latest_attempt else None
            eligible_after_attempt = latest_status is None or latest_status == "retry_authorized"
            if retry_failed and latest_status == "failed":
                eligible_after_attempt = True
            if eligible_after_attempt:
                prior_count = int(
                    connection.execute(
                        """SELECT count(*) FROM restaurant_card_enrichment_runs
                           WHERE public_restaurant_id=? AND phase='phase_b_research'
                             AND input_fingerprint LIKE ?""",
                        (row["place_id"], f"{fingerprint}%"),
                    ).fetchone()[0]
                )
                attempt_fingerprint = (
                    fingerprint if prior_count == 0 else f"{fingerprint}:attempt:{prior_count + 1}"
                )
                queue.append((row, current, fingerprint, attempt_fingerprint))
    queue = queue[:limit]
    report["requiring_targeted_research"] = [str(row["place_id"]) for row, _, _, _ in queue]
    report["selected_candidates"] = [
        {
            "name": row.get("name_en")
            or row.get("name_ja")
            or row.get("candidate_title")
            or row["place_id"],
            "place_id": row["place_id"],
            "fiyu_score": row.get("fiyu_score"),
            "local_discovery_score": row.get("local_discovery_score"),
            "has_card_description": bool(current.card_description),
            "missing_categories": missing_enrichment_categories(current),
        }
        for row, current, _, _ in queue
    ]
    if dry_run:
        report["maximum_responses_requests"] = len(queue)
        report["maximum_web_search_actions"] = len(queue) * CARD_ENRICHMENT_MAX_SEARCH_ACTIONS
        return report
    if not os.getenv("OPENAI_API_KEY") and client is None:
        raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env")
    api_client = client or OpenAI(max_retries=0)
    for row, current, fingerprint, attempt_fingerprint in queue:
        place_id = str(row["place_id"])
        created = utc_now()
        with connect(db_path) as connection:
            cursor = connection.execute(
                """INSERT INTO restaurant_card_enrichment_runs (
                    public_restaurant_id, provider, model, prompt_version, phase, status,
                    input_fingerprint, enrichment_json, usage_metadata_json, created_at
                ) VALUES (?, 'openai_responses', ?, ?, 'phase_b_research', 'running', ?, '{}', '{}', ?)""",
                (
                    place_id,
                    selected_model,
                    CARD_ENRICHMENT_PROMPT_VERSION,
                    attempt_fingerprint,
                    created,
                ),
            )
            run_id = int(cursor.lastrowid)
            connection.commit()
        try:
            report["responses_requests"] = int(report["responses_requests"]) + 1
            prompt = json.dumps(
                {
                    "place_id": place_id,
                    "name_ja": row.get("name_ja"),
                    "name_en": row.get("name_en"),
                    "category": row.get("primary_category"),
                    "existing_enrichment": current.model_dump(mode="json"),
                    "missing": [
                        key
                        for key, value in enrichment_completeness(current).items()
                        if key != "complete_enough" and not value
                    ],
                    "persisted_source_urls": json.loads(str(row.get("evidence_urls_json") or "[]")),
                },
                ensure_ascii=False,
            )
            response = api_client.responses.parse(
                model=selected_model,
                reasoning={"effort": "low"},
                tools=[{"type": "web_search", "search_context_size": "low"}],
                include=["web_search_call.results"],
                max_tool_calls=CARD_ENRICHMENT_MAX_SEARCH_ACTIONS,
                input=[
                    {"role": "system", "content": TARGETED_ENRICHMENT_INSTRUCTIONS},
                    {"role": "user", "content": prompt},
                ],
                text_format=CardEnrichment,
            )
            from .address_research import extract_response_metadata

            parsed = getattr(response, "output_parsed", None)
            if parsed is None:
                raise RuntimeError("OpenAI returned no parsed card enrichment")
            incoming = CardEnrichment.model_validate(parsed)
            metadata = extract_response_metadata(response, fallback_model=selected_model)
            report["web_search_actions"] = (
                int(report["web_search_actions"]) + metadata.web_search_action_count
            )
            usage = metadata.usage_metadata
            for key in ("input_tokens", "output_tokens", "total_tokens"):
                report["token_usage"][key] = int(report["token_usage"][key]) + int(
                    usage.get(key, 0) or 0
                )
            with connect(db_path) as connection:
                merged = persist_card_enrichment(
                    connection,
                    place_id=place_id,
                    incoming=incoming,
                    provider="openai_responses",
                    model=selected_model,
                    prompt_version=CARD_ENRICHMENT_PROMPT_VERSION,
                    response_id=metadata.response_id,
                    usage_metadata={
                        "web_search_action_count": metadata.web_search_action_count,
                        "usage": metadata.usage_metadata,
                    },
                    phase="phase_b_research_result",
                    input_fingerprint=f"{fingerprint}:result",
                )
                connection.execute(
                    """UPDATE restaurant_card_enrichment_runs SET status='complete', response_id=?,
                       enrichment_json=?, usage_metadata_json=?, completed_at=? WHERE id=?""",
                    (
                        metadata.response_id,
                        json.dumps(incoming.model_dump(mode="json"), ensure_ascii=False),
                        json.dumps(
                            {
                                "web_search_action_count": metadata.web_search_action_count,
                                "usage": metadata.usage_metadata,
                            },
                            ensure_ascii=False,
                        ),
                        utc_now(),
                        run_id,
                    ),
                )
                connection.commit()
            classification, explanation = classify_enrichment(merged)
            report["results"].append(
                {
                    "place_id": place_id,
                    "name": row.get("name_en") or row.get("name_ja") or place_id,
                    "status": "complete",
                    "classification": classification,
                    "classification_explanation": explanation,
                    "missing_categories": missing_enrichment_categories(merged),
                    **enrichment_completeness(merged),
                }
            )
        except Exception as exc:  # noqa: BLE001 - preserve paid-attempt state.
            from .research_worker import _ambiguous_request_failure

            status = "needs_retry" if _ambiguous_request_failure(exc) else "failed"
            with connect(db_path) as connection:
                connection.execute(
                    "UPDATE restaurant_card_enrichment_runs SET status=?, error=?, completed_at=? WHERE id=?",
                    (status, f"{type(exc).__name__}: {exc}"[:2000], utc_now(), run_id),
                )
                connection.commit()
            report["results"].append(
                {
                    "place_id": place_id,
                    "name": row.get("name_en") or row.get("name_ja") or place_id,
                    "status": status,
                    "classification": "needs_retry" if status == "needs_retry" else "sparse",
                }
            )
    report["successful_runs"] = sum(item["status"] == "complete" for item in report["results"])
    report["partial_runs"] = sum(
        item["status"] == "complete" and not item.get("complete_enough", False)
        for item in report["results"]
    )
    report["failed_runs"] = sum(item["status"] == "failed" for item in report["results"])
    report["needs_retry_runs"] = sum(item["status"] == "needs_retry" for item in report["results"])
    return report


def authorize_card_enrichment_retry(
    db_path: str | Path, place_id: str, *, dry_run: bool = False
) -> dict[str, object]:
    """Explicitly release one ambiguous paid enrichment attempt for retry."""

    from .public_catalog import ensure_public_schema

    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """SELECT id, status, prompt_version, created_at
               FROM restaurant_card_enrichment_runs
               WHERE public_restaurant_id=? AND phase='phase_b_research'
                 AND prompt_version=?
               ORDER BY id DESC LIMIT 1""",
            (place_id, CARD_ENRICHMENT_PROMPT_VERSION),
        ).fetchone()
        if row is None:
            raise ValueError("No targeted card-enrichment attempt exists for this restaurant")
        if row["status"] != "needs_retry":
            raise ValueError(f"Latest targeted enrichment is not ambiguous: {row['status']}")
        result = {
            "place_id": place_id,
            "run_id": int(row["id"]),
            "previous_status": row["status"],
            "new_status": "retry_authorized",
            "dry_run": dry_run,
            "responses_requests": 0,
        }
        if not dry_run:
            connection.execute(
                "UPDATE restaurant_card_enrichment_runs SET status='retry_authorized' WHERE id=?",
                (row["id"],),
            )
            connection.commit()
        return result
