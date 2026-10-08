"""Sequential, resumable Quality-v4 research and shadow scoring."""

from __future__ import annotations

import ast
import hashlib
import json
import os
import time
import uuid
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import APIConnectionError, APITimeoutError, OpenAI, RateLimitError

from .address_research import extract_response_metadata
from .card_enrichment import scoring_research_view
from .catalog_pipeline import (
    _effective_structured_research,
    _strong_published_duplicate_ids,
)
from .database import connect
from .experimental_quality_challenge_v4 import ChallengeResearchResult
from .experimental_score_v4 import evaluate_with_quality_adjustment
from .public_catalog import ensure_public_schema
from .public_score import (
    FiyuEvidence,
    InternalSignals,
    assess_critical_publication_contradiction,
    evaluate_fiyu_candidate,
)
from .quality_v4 import (
    DEFAULT_ADJUSTMENT_GUARDRAIL,
    QUALITY_CASE_STRENGTH_VERSION,
    QUALITY_PROMPT_VERSION,
    QUALITY_RESEARCH_VERSION,
    QUALITY_SCORE_VERSION,
    calculate_quality_v4_shadow,
)
from .sqlite_snapshot import readonly_sqlite_snapshot

MAX_WEB_SEARCH_ACTIONS = 5
DEFAULT_MODEL = "gpt-5.6-luna"
FLOOR70_PREPUBLICATION_TARGET = 70.0
V3_PRODUCTION_SCORE_PREFIX = "public-v3-local-discovery"
RETRYABLE_CREDIT_ERROR_MARKERS = (
    "insufficient_quota",
    "credit_balance_exhausted",
    "no credits remaining",
)

SYSTEM_PROMPT = """You are performing a bounded QUALITY-ONLY research pass for a specific Tokyo restaurant.

Question: What credible evidence is available about the quality of the food itself at this restaurant?

Deliberately consider all three possibilities without preferring an outcome:
A. credible evidence that the cheap Quality prior may underestimate the restaurant;
B. credible evidence that the cheap Quality prior may overestimate the restaurant;
C. credible mixed or consistency-related evidence.

Rules:
- Research food and culinary quality only. Do not score identity, address, popularity, hiddenness, localness, atmosphere, service, wait time, price, or tourist appeal.
- Failure to find useful evidence is neutral. Do not infer mediocrity from few sources, no website, obscurity, or no editorial coverage.
- Aggregate ratings are not researched Quality evidence. Qualitative food-specific content may be evidence.
- Do not aggressively hunt criticism. One isolated complaint is weak; repeated independent specific criticism may establish a recurring issue.
- Official sources may establish factual technique, sourcing, or specialization, but cannot independently prove excellence.
- Use Japanese and local sources where useful. Language itself is not evidence.
- Treat copied, mirrored, syndicated, platform-duplicated, and PR-derived material as one provenance source.
- Every observation must be food-specific, source-grounded, auditable, and use the exact page URL.
- Do not output a Quality score, Fiyu Score, adjustment, case strength, eligibility decision, benchmark label, or publication recommendation.
- Use only the evidence families and aspects defined by the response schema.
- Use no more than five web-search actions.
"""


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _json(value: object, default: Any) -> Any:
    try:
        return json.loads(str(value or ""))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _table_exists(connection, name: str) -> bool:
    return (
        connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
        is not None
    )


def _all_candidate_rows(connection) -> list[dict[str, Any]]:
    existing = _table_exists(connection, "quality_v4_research_runs")
    latest = (
        """
        LEFT JOIN quality_v4_research_runs q ON q.id = (
            SELECT q2.id FROM quality_v4_research_runs q2
            WHERE q2.public_restaurant_id=p.place_id
              AND q2.quality_research_version=?
            ORDER BY q2.id DESC LIMIT 1
        )
        """
        if existing
        else ""
    )
    params: tuple[object, ...] = (QUALITY_RESEARCH_VERSION,) if existing else ()
    q_columns = (
        "q.status AS quality_v4_status, q.id AS quality_v4_run_id, "
        "q.error_category AS quality_v4_error_category, q.error AS quality_v4_error"
        if existing
        else (
            "NULL AS quality_v4_status, NULL AS quality_v4_run_id, "
            "NULL AS quality_v4_error_category, NULL AS quality_v4_error"
        )
    )
    rows = connection.execute(
        f"""
        SELECT p.*, p.fiyu_score AS stored_production_v3_score,
               r.id AS source_restaurant_id, r.title,
               r.title AS candidate_title, r.category AS source_category,
               r.category AS candidate_category,
               r.broad_category AS candidate_broad_category, r.quality_score,
               r.underexposure_score, r.digital_footprint_score,
               r.internal_fiyu_score, r.rating, r.review_count, r.website,
               rr.id AS research_run_id, rr.structured_research_json,
               rr.completed_at AS research_completed_at, {q_columns}
        FROM public_restaurants p
        LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
        LEFT JOIN restaurant_research_runs rr ON rr.id=(
            SELECT current.id FROM restaurant_research_runs current
            WHERE current.public_restaurant_id=p.place_id AND current.is_current=1
            ORDER BY current.id DESC LIMIT 1
        )
        {latest}
        ORDER BY p.place_id
        """,
        params,
    ).fetchall()
    return [dict(row) for row in rows]


def _exclusion_reason(
    row: dict[str, Any], *, allow_rejected_retry: bool = False
) -> str | None:
    if row.get("source_restaurant_id") is None:
        return "missing_source_restaurant"
    if row.get("research_status") != "complete":
        return f"underlying_research_{row.get('research_status') or 'unknown'}"
    if row.get("quality_score") is None:
        return "missing_base_quality"
    if float(row.get("identity_confidence") or 0) < 0.6:
        return "unresolved_identity"
    evidence = _json(row.get("evidence_json"), {})
    if evidence.get("matched_restaurant") is False:
        return "identity_not_matched"
    if (
        not allow_rejected_retry
        and str(row.get("review_status") or "") in {"rejected", "auto_rejected"}
    ):
        return "rejected_or_obsolete"
    return None


def _research_readiness_reason(row: dict[str, Any]) -> str | None:
    """Return V4 input blockers without treating score rejection as obsolete."""

    if row.get("source_restaurant_id") is None:
        return "missing_source_restaurant"
    if row.get("research_status") != "complete":
        return f"underlying_research_{row.get('research_status') or 'unknown'}"
    if row.get("research_run_id") is None:
        return "missing_current_research_run"
    if row.get("quality_score") is None:
        return "missing_base_quality"
    if float(row.get("identity_confidence") or 0) < 0.6:
        return "unresolved_identity"
    evidence = _json(row.get("evidence_json"), {})
    if evidence.get("matched_restaurant") is False:
        return "identity_not_matched"
    return None


def _publication_readiness_reason(row: dict[str, Any]) -> str | None:
    if not str(row.get("place_id") or "").strip():
        return "missing_stable_place_id"
    if not str(
        row.get("name_ja") or row.get("name_en") or row.get("candidate_title") or ""
    ).strip():
        return "missing_display_name"
    if not str(
        row.get("primary_category")
        or row.get("candidate_category")
        or row.get("candidate_broad_category")
        or ""
    ).strip():
        return "missing_category"
    if row.get("research_status") != "complete":
        return "publication_research_incomplete"
    if row.get("stored_production_v3_score") is None or not str(
        row.get("score_version") or ""
    ).strip():
        return "missing_deterministic_score"
    if row.get("research_run_id") is None:
        return "missing_completed_score_run"
    return None


def _access_overlay(row: dict[str, Any], structured: dict[str, Any]) -> dict[str, Any]:
    result = dict(structured)
    stored_access = str(row.get("access_model") or "unknown").casefold()
    if stored_access != "unknown":
        result["access_model"] = stored_access
        result["access_confidence"] = row.get("access_confidence")
        for column, field in (
            ("access_evidence_json", "access_evidence"),
            ("access_evidence_urls_json", "access_evidence_urls"),
        ):
            value = _json(row.get(column), [])
            result[field] = value if isinstance(value, list) else []
    return result


def _canonical_context(connection: Any, row: dict[str, Any]) -> dict[str, Any]:
    evidence_payload = _json(row.get("evidence_json"), {})
    evidence_payload["specialist_status"] = str(
        row.get("specialist_status") or "unknown"
    )
    evidence_payload["specialist_restaurant"] = (
        evidence_payload["specialist_status"] == "specialist"
    )
    evidence = FiyuEvidence(**evidence_payload)
    evidence.validate()
    structured = _json(row.get("structured_research_json"), {})
    structured = _effective_structured_research(connection, row["place_id"], structured)
    structured = scoring_research_view(structured)
    structured = _access_overlay(row, structured)
    structured["specialist_status"] = evidence.specialist_status
    internal = InternalSignals(
        quality_score=float(row.get("quality_score") or 0),
        underexposure_score=float(row.get("underexposure_score") or 0),
        digital_footprint_score=float(row.get("digital_footprint_score") or 0),
    )
    score = evaluate_fiyu_candidate(
        evidence,
        internal,
        structured,
        primary_category=str(
            row.get("primary_category")
            or row.get("source_category")
            or row.get("candidate_broad_category")
            or ""
        ),
    )
    return {
        "evidence": evidence,
        "structured": structured,
        "internal": internal,
        "score": score,
    }


def _maximum_possible_v4_score(row: dict[str, Any], context: dict[str, Any]) -> float:
    evidence = context["evidence"]
    internal = context["internal"]
    structured = context["structured"]
    available = min(15.0, max(0.0, 100.0 - float(row.get("quality_score") or 0)))
    baseline = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured,
        primary_category=row.get("primary_category") or row.get("source_category"),
        quality_adjustment=0,
    )
    maximum = evaluate_with_quality_adjustment(
        evidence,
        internal,
        structured,
        primary_category=row.get("primary_category") or row.get("source_category"),
        quality_adjustment=available,
    )
    return round(
        float(row["stored_production_v3_score"])
        + maximum.fiyu_score
        - baseline.fiyu_score,
        2,
    )


def _selection_metadata(row: dict[str, Any], target_floor: float) -> dict[str, Any]:
    return {
        "place_id": row["place_id"],
        "restaurant": row.get("name_en") or row.get("name_ja") or row.get("title"),
        "current_score": row.get("stored_production_v3_score"),
        "score_version": row.get("score_version"),
        "current_quality": row.get("quality_signal"),
        "base_quality": row.get("quality_score"),
        "rejection_classification": "score_only_rejected",
        "selection_reason": "floor70_prepublication_requires_quality_v4",
        "research_status": row.get("research_status"),
        "target_floor": target_floor,
        "prior_quality_v4_status": row.get("quality_v4_status"),
    }


def _inspect_floor70_prepublication(
    connection: Any,
    rows: list[dict[str, Any]],
    *,
    place_id: str | None,
    start_after: str | None,
) -> dict[str, Any]:
    target_floor = FLOOR70_PREPUBLICATION_TARGET
    exclusions = Counter()
    prior_attempts = Counter()
    eligible: list[dict[str, Any]] = []
    score_only_below: list[tuple[dict[str, Any], dict[str, Any]]] = []
    evaluated_score_only = 0
    score_only_at_or_above = 0
    canonical_blocked_within_score_only = 0
    already_complete = 0
    current_v4_rows = 0
    published_rows = 0

    for row in rows:
        if row.get("is_published"):
            published_rows += 1
        if str(row.get("score_version") or "").startswith(
            "public-v4-quality-research"
        ):
            current_v4_rows += 1
        if (
            row.get("is_published")
            or row.get("stored_production_v3_score") is None
            or row.get("review_status") not in {"rejected", "auto_rejected"}
            or row.get("review_notes") != "score_or_product_policy_rejected"
        ):
            continue
        try:
            context = _canonical_context(connection, row)
        except (TypeError, ValueError):
            exclusions["invalid_scoring_evidence"] += 1
            continue
        current = context["score"]
        if not row.get("product_eligible") or current.chain_excluded:
            exclusions[
                "stored_product_ineligible"
                if not row.get("product_eligible")
                else "chain_disqualified"
            ] += 1
            continue

        evaluated_score_only += 1
        current_score = float(row["stored_production_v3_score"])
        if current_score < target_floor:
            exclusions["current_score_below_floor"] += 1
            score_only_below.append((row, context))
            continue
        score_only_at_or_above += 1

        critical = assess_critical_publication_contradiction(
            context["evidence"], context["structured"]
        )
        duplicate_ids = _strong_published_duplicate_ids(connection, row)
        if critical.contradicted:
            exclusions["critical_publication_contradiction"] += 1
            canonical_blocked_within_score_only += 1
            continue
        if duplicate_ids:
            exclusions["duplicate_of_published"] += 1
            canonical_blocked_within_score_only += 1
            continue
        if not current.product_eligible:
            exclusions["canonical_product_ineligible"] += 1
            canonical_blocked_within_score_only += 1
            continue

        publication_reason = _publication_readiness_reason(row)
        if publication_reason:
            exclusions[publication_reason] += 1
            continue

        readiness_reason = _research_readiness_reason(row)
        if readiness_reason:
            exclusions[readiness_reason] += 1
            continue
        if not str(row.get("score_version") or "").startswith(
            V3_PRODUCTION_SCORE_PREFIX
        ):
            exclusions["not_current_v3_lineage"] += 1
            continue

        status = row.get("quality_v4_status")
        if status == "complete":
            already_complete += 1
            exclusions["completed_v4_evidence"] += 1
            continue
        if status in {"failed", "needs_retry", "pending"}:
            prior_attempts[str(status)] += 1
            exclusions[f"prior_v4_{status}"] += 1
            continue
        if place_id and row["place_id"] != place_id:
            continue
        eligible.append(row)

    eligible.sort(
        key=lambda row: (
            -float(row["stored_production_v3_score"]),
            str(row["place_id"]),
        )
    )
    if start_after:
        try:
            position = next(
                index for index, row in enumerate(eligible) if row["place_id"] == start_after
            )
            eligible = eligible[position + 1 :]
        except StopIteration:
            eligible = []

    rescue_rows: list[dict[str, Any]] = []
    rescue_priority = Counter()
    for row, context in score_only_below:
        maximum = _maximum_possible_v4_score(row, context)
        if maximum < target_floor:
            continue
        rescue_rows.append(row)
        if maximum >= target_floor + 3:
            rescue_priority["high"] += 1
        elif maximum >= target_floor + 1:
            rescue_priority["medium"] += 1
        else:
            rescue_priority["marginal"] += 1

    selected_ids = {str(row["place_id"]) for row in eligible}
    rescue_ids = {str(row["place_id"]) for row in rescue_rows}
    sankei_place_id = "ChIJi79LD-yIGGAR_8wLG2_pyYE"
    unpublished_scored_at_or_above = sum(
        not row.get("is_published")
        and row.get("stored_production_v3_score") is not None
        and float(row["stored_production_v3_score"]) >= target_floor
        for row in rows
    )
    non_score_blocked_outside_cohort = (
        unpublished_scored_at_or_above - score_only_at_or_above
    )
    return {
        "total_existing_restaurants": len(rows),
        "target_floor": target_floor,
        "evaluated_score_only_rejected": evaluated_score_only,
        "eligible_pending": len(eligible),
        "already_complete": already_complete,
        "published_rows_excluded": published_rows,
        "current_v4_rows_excluded": current_v4_rows,
        "selected_v3_count": len(eligible),
        "selected_current_v4_count": 0,
        "selected_published_count": 0,
        "excluded_current_score_below_floor": exclusions["current_score_below_floor"],
        "excluded_non_score_blocked_at_or_above_floor": (
            non_score_blocked_outside_cohort + canonical_blocked_within_score_only
        ),
        "non_score_blocked_outside_score_only_cohort": non_score_blocked_outside_cohort,
        "canonical_blocked_within_score_only_cohort": canonical_blocked_within_score_only,
        "excluded_identity_unresolved": exclusions["unresolved_identity"],
        "excluded_identity_not_matched": exclusions["identity_not_matched"],
        "excluded_research_incomplete": sum(
            count
            for reason, count in exclusions.items()
            if reason.startswith(("underlying_research_", "missing_"))
            or reason == "publication_research_incomplete"
        ),
        "excluded_completed_v4_evidence": exclusions["completed_v4_evidence"],
        "prior_attempt_statuses": dict(sorted(prior_attempts.items())),
        "blocked_existing_statuses": {
            f"prior_v4_{status}": count for status, count in sorted(prior_attempts.items())
        },
        "excluded": sum(exclusions.values()),
        "exclusions_by_reason": dict(sorted(exclusions.items())),
        "estimated_batches_of_100": (len(eligible) + 99) // 100,
        "selection_mode": "floor70_prepublication",
        "retryable_failed": 0,
        "separate_below_floor_rescue_set": len(rescue_rows),
        "below_floor_rescue_priority": {
            name: rescue_priority[name] for name in ("high", "medium", "marginal")
        },
        "below_floor_rescue_overlap": len(selected_ids & rescue_ids),
        "sankei_sushi_selected": sankei_place_id in selected_ids,
        "eligible_rows": eligible,
    }


def _serialized_error_metadata(error: object) -> dict[str, Any] | None:
    """Parse structured provider metadata embedded in a persisted exception string."""

    text = str(error or "")
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    serialized = text[start : end + 1]
    for parser in (json.loads, ast.literal_eval):
        try:
            payload = parser(serialized)
        except (SyntaxError, ValueError, TypeError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict):
            return payload
    return None


def _is_retryable_failure(row: dict[str, Any]) -> bool:
    if row.get("quality_v4_status") not in {"failed", "needs_retry"}:
        return False
    if row.get("quality_v4_error_category") == "provider_credit_exhausted":
        return True
    error = str(row.get("quality_v4_error") or "").lower()
    if any(marker in error for marker in RETRYABLE_CREDIT_ERROR_MARKERS):
        return True
    metadata = _serialized_error_metadata(row.get("quality_v4_error"))
    return metadata is not None and metadata.get("retryable") is True


def _interleave_score_quartiles(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(
        rows,
        key=lambda row: (
            float(row.get("stored_production_v3_score") or -1),
            str(row["place_id"]),
        ),
    )
    groups = [ordered[index::4] for index in range(4)]
    output: list[dict[str, Any]] = []
    for index in range(max((len(group) for group in groups), default=0)):
        output.extend(group[index] for group in groups if index < len(group))
    return output


def inspect_quality_v4_backfill(
    db_path: str | Path,
    *,
    place_id: str | None = None,
    place_ids: list[str] | None = None,
    start_after: str | None = None,
    force: bool = False,
    retry_failed: bool = False,
    floor70_prepublication: bool = False,
) -> dict[str, Any]:
    if place_id is not None and place_ids is not None:
        raise ValueError("place_id and place_ids are mutually exclusive")
    allowlist = set(place_ids) if place_ids is not None else None
    if sum((force, retry_failed, floor70_prepublication)) > 1:
        raise ValueError(
            "--force, --retry-failed, and --floor70-prepublication are mutually exclusive"
        )
    with readonly_sqlite_snapshot(db_path) as connection:
        rows = _all_candidate_rows(connection)
        if floor70_prepublication:
            return _inspect_floor70_prepublication(
                connection,
                rows,
                place_id=place_id,
                start_after=start_after,
            )
    exclusions = Counter()
    eligible: list[dict[str, Any]] = []
    already_complete = 0
    blocked_existing = Counter()
    for row in rows:
        if allowlist is not None and str(row["place_id"]) not in allowlist:
            continue
        status = row.get("quality_v4_status")
        reason = _exclusion_reason(
            row,
            allow_rejected_retry=(retry_failed and _is_retryable_failure(row)),
        )
        if reason:
            exclusions[reason] += 1
            continue
        if retry_failed:
            if status == "complete":
                already_complete += 1
                continue
            if status not in {"failed", "needs_retry"}:
                blocked_existing[f"not_failed_{status or 'not_started'}"] += 1
                continue
            if not _is_retryable_failure(row):
                blocked_existing["failed_not_retryable"] += 1
                continue
            if place_id and row["place_id"] != place_id:
                continue
            eligible.append(row)
            continue
        if status == "complete" and not force:
            already_complete += 1
            continue
        if status in {"failed", "needs_retry", "pending"} and not force:
            blocked_existing[str(status)] += 1
            continue
        if place_id and row["place_id"] != place_id:
            continue
        eligible.append(row)
    eligible = _interleave_score_quartiles(eligible)
    if place_ids is not None:
        order = {value: index for index, value in enumerate(place_ids)}
        eligible.sort(key=lambda row: order[str(row["place_id"])])
    if start_after:
        try:
            position = next(
                index for index, row in enumerate(eligible) if row["place_id"] == start_after
            )
            eligible = eligible[position + 1 :]
        except StopIteration:
            eligible = []
    return {
        "total_existing_restaurants": len(rows),
        "eligible_pending": len(eligible),
        "already_complete": already_complete,
        "blocked_existing_statuses": dict(blocked_existing),
        "excluded": sum(exclusions.values()),
        "exclusions_by_reason": dict(sorted(exclusions.items())),
        "estimated_batches_of_100": (len(eligible) + 99) // 100,
        "selection_mode": "retry_failed" if retry_failed else "pending",
        "retryable_failed": len(eligible) if retry_failed else 0,
        "eligible_rows": eligible,
    }


def _prompt(row: dict[str, Any]) -> str:
    context = {
        "place_id": row["place_id"],
        "name_ja": row.get("name_ja"),
        "name_en": row.get("name_en"),
        "source_name": row.get("title"),
        "category": row.get("primary_category") or row.get("source_category"),
        "area": row.get("discovery_area"),
        "address": row.get("normalized_address"),
        "description": row.get("description_en"),
        "food_tags": _json(row.get("food_tags_json"), []),
        "signature_dishes": _json(row.get("signature_dishes_json"), []),
    }
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))


def _fingerprint(row: dict[str, Any], model: str) -> str:
    payload = json.dumps(
        {
            "place_id": row["place_id"],
            "quality_score": row["quality_score"],
            "evidence_json": row.get("evidence_json"),
            "structured_research_json": row.get("structured_research_json"),
            "research_version": QUALITY_RESEARCH_VERSION,
            "model": model,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _manifest_write(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _result_record(row: dict[str, Any], run_id: int, status: str) -> dict[str, Any]:
    return {
        "place_id": row["place_id"],
        "name": row.get("name_en") or row.get("name_ja") or row.get("title"),
        "quality_v4_run_id": run_id,
        "status": status,
    }


def run_quality_v4_backfill(
    db_path: str | Path,
    *,
    limit: int = 100,
    place_id: str | None = None,
    place_ids: list[str] | None = None,
    start_after: str | None = None,
    force: bool = False,
    retry_failed: bool = False,
    floor70_prepublication: bool = False,
    dry_run: bool = False,
    model: str | None = None,
    manifest_path: str | Path | None = None,
    results_path: str | Path | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    if limit <= 0:
        raise ValueError("limit must be positive")
    inspection = inspect_quality_v4_backfill(
        db_path,
        place_id=place_id,
        place_ids=place_ids,
        start_after=start_after,
        force=force,
        retry_failed=retry_failed,
        floor70_prepublication=floor70_prepublication,
    )
    selected = inspection.pop("eligible_rows")[:limit]
    run_key = uuid.uuid4().hex[:12]
    selected_model = model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    manifest_file = Path(manifest_path) if manifest_path else Path(
        f"data/audits/quality-v4-backfill-{run_key}.json"
    )
    results_file = Path(results_path) if results_path else manifest_file.with_suffix(".jsonl")
    manifest: dict[str, Any] = {
        "run_id": run_key,
        "created_at": _utc_now(),
        "dry_run": dry_run,
        "selection_mode": inspection["selection_mode"],
        "model": selected_model,
        "requested_count": limit,
        "selected_count": len(selected),
        "quality_research_version": QUALITY_RESEARCH_VERSION,
        "quality_case_strength_version": QUALITY_CASE_STRENGTH_VERSION,
        "score_version": QUALITY_SCORE_VERSION,
        "adjustment_guardrail": DEFAULT_ADJUSTMENT_GUARDRAIL,
        "inspection": inspection,
        "completed": 0,
        "failed": 0,
        "needs_retry": 0,
        "skipped_existing": inspection["already_complete"]
        + sum(inspection["blocked_existing_statuses"].values()),
        "responses_requests": 0,
        "web_search_actions": 0,
        "token_usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
        "ids_selected": [row["place_id"] for row in selected],
        "selection_rows": (
            [
                _selection_metadata(row, FLOOR70_PREPUBLICATION_TARGET)
                for row in selected
            ]
            if floor70_prepublication
            else []
        ),
        "rows": [],
        "manifest_path": str(manifest_file),
        "results_path": str(results_file),
    }
    _manifest_write(manifest_file, manifest)
    if dry_run:
        results_file.parent.mkdir(parents=True, exist_ok=True)
        if results_file.exists() and results_file.stat().st_size:
            raise FileExistsError(
                f"Dry-run results path is not empty: {results_file}"
            )
        results_file.touch(exist_ok=True)
        return manifest

    ensure_public_schema(db_path)
    load_dotenv()
    api_client = client
    if api_client is None:
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is missing")
        api_client = OpenAI(max_retries=0)
    results_file.parent.mkdir(parents=True, exist_ok=True)
    with results_file.open("a", encoding="utf-8") as output:
        for row in selected:
            started_at = _utc_now()
            started = time.perf_counter()
            with connect(db_path) as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO quality_v4_research_runs (
                        public_restaurant_id, provider, model, status,
                        quality_research_version, quality_case_strength_version,
                        score_version, prompt_version, adjustment_guardrail,
                        base_quality_prior, response_request_count, error_category,
                        error, created_at
                    ) VALUES (?, 'openai', ?, 'needs_retry', ?, ?, ?, ?, ?, ?, 1,
                              'request_outcome_pending',
                              'Request outcome is ambiguous until a complete response is saved.', ?)
                    """,
                    (
                        row["place_id"],
                        selected_model,
                        QUALITY_RESEARCH_VERSION,
                        QUALITY_CASE_STRENGTH_VERSION,
                        QUALITY_SCORE_VERSION,
                        QUALITY_PROMPT_VERSION,
                        DEFAULT_ADJUSTMENT_GUARDRAIL,
                        row["quality_score"],
                        started_at,
                    ),
                )
                connection.commit()
                run_id = int(cursor.lastrowid)
            manifest["responses_requests"] += 1
            record = _result_record(row, run_id, "needs_retry")
            if retry_failed:
                record["retry_of_run_id"] = row.get("quality_v4_run_id")
            try:
                response = api_client.responses.parse(
                    model=selected_model,
                    reasoning={"effort": "low"},
                    tools=[{"type": "web_search", "search_context_size": "low"}],
                    include=["web_search_call.results"],
                    max_tool_calls=MAX_WEB_SEARCH_ACTIONS,
                    input=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": _prompt(row)},
                    ],
                    text_format=ChallengeResearchResult,
                    store=False,
                )
                parsed = getattr(response, "output_parsed", None)
                if parsed is None:
                    raise RuntimeError("OpenAI returned no parsed Quality-v4 research result")
                research = ChallengeResearchResult.model_validate(parsed)
                evidence = FiyuEvidence(**_json(row.get("evidence_json"), {}))
                internal = InternalSignals(
                    quality_score=float(row["quality_score"]),
                    underexposure_score=float(row.get("underexposure_score") or 0),
                    digital_footprint_score=float(row.get("digital_footprint_score") or 0),
                )
                structured = _json(row.get("structured_research_json"), {})
                shadow = calculate_quality_v4_shadow(
                    research.observations,
                    evidence=evidence,
                    internal=internal,
                    structured_research=structured,
                    primary_category=row.get("primary_category") or row.get("source_category"),
                )
                metadata = extract_response_metadata(response, fallback_model=selected_model)
                usage = metadata.usage_metadata
                latency = round(time.perf_counter() - started, 3)
                normalized = [item.to_dict() for item in shadow.quality.normalized_observations]
                clusters = [item.to_dict() for item in shadow.quality.claim_clusters]
                with connect(db_path) as connection:
                    connection.execute(
                        """
                        UPDATE quality_v4_research_runs SET
                            status='complete', response_id=?, positive_case_strength=?,
                            negative_case_strength=?, evidence_balance=?, raw_quality_adjustment=?,
                            guarded_quality_adjustment=?, researched_quality=?,
                            quality_evidence_confidence=?, production_v3_score=?,
                            shadow_v4_score=?, shadow_score_delta=?, research_result_json=?,
                            normalized_observations_json=?, claim_clusters_json=?,
                            usage_metadata_json=?, web_search_action_count=?, input_tokens=?,
                            output_tokens=?, total_tokens=?, latency_seconds=?,
                            error_category=NULL, error=NULL, completed_at=? WHERE id=?
                        """,
                        (
                            metadata.response_id,
                            shadow.quality.positive_case_strength,
                            shadow.quality.negative_case_strength,
                            shadow.quality.evidence_balance,
                            shadow.quality.raw_quality_adjustment,
                            shadow.quality.guarded_quality_adjustment,
                            shadow.quality.researched_quality,
                            shadow.quality.quality_evidence_confidence,
                            shadow.production_v3.fiyu_score,
                            shadow.shadow_fiyu_score,
                            shadow.score_delta,
                            json.dumps(research.model_dump(mode="json"), ensure_ascii=False),
                            json.dumps(normalized, ensure_ascii=False),
                            json.dumps(clusters, ensure_ascii=False),
                            json.dumps(usage, ensure_ascii=False),
                            metadata.web_search_action_count,
                            metadata.input_tokens,
                            metadata.output_tokens,
                            metadata.total_tokens,
                            latency,
                            _utc_now(),
                            run_id,
                        ),
                    )
                    connection.commit()
                record.update(
                    {
                        "status": "complete",
                        "input_fingerprint": _fingerprint(row, selected_model),
                        "base_quality_prior": shadow.quality.base_quality_prior,
                        "positive_case_strength": shadow.quality.positive_case_strength,
                        "negative_case_strength": shadow.quality.negative_case_strength,
                        "evidence_balance": shadow.quality.evidence_balance,
                        "raw_quality_adjustment": shadow.quality.raw_quality_adjustment,
                        "guarded_quality_adjustment": shadow.quality.guarded_quality_adjustment,
                        "researched_quality": shadow.quality.researched_quality,
                        "production_v3_score": shadow.production_v3.fiyu_score,
                        "shadow_v4_score": shadow.shadow_fiyu_score,
                        "score_delta": shadow.score_delta,
                        "usage": {
                            "web_search_action_count": metadata.web_search_action_count,
                            "input_tokens": metadata.input_tokens,
                            "output_tokens": metadata.output_tokens,
                            "total_tokens": metadata.total_tokens,
                            "latency_seconds": latency,
                        },
                    }
                )
                manifest["completed"] += 1
                manifest["web_search_actions"] += metadata.web_search_action_count
                for key in manifest["token_usage"]:
                    manifest["token_usage"][key] += int(record["usage"][key])
            except (APITimeoutError, APIConnectionError) as exc:
                error = f"{type(exc).__name__}: {exc}"
                with connect(db_path) as connection:
                    connection.execute(
                        """
                        UPDATE quality_v4_research_runs
                        SET status='needs_retry', error_category='ambiguous_provider_failure',
                            error=?, latency_seconds=?, completed_at=? WHERE id=?
                        """,
                        (error[:2000], round(time.perf_counter() - started, 3), _utc_now(), run_id),
                    )
                    connection.commit()
                record.update(status="needs_retry", error=error)
                manifest["needs_retry"] += 1
            except RateLimitError as exc:
                error = f"{type(exc).__name__}: {exc}"
                retryable_credit = any(
                    marker in error.lower() for marker in RETRYABLE_CREDIT_ERROR_MARKERS
                )
                status = "needs_retry" if retryable_credit else "failed"
                category = (
                    "provider_credit_exhausted"
                    if retryable_credit
                    else "provider_rate_limit_failure"
                )
                with connect(db_path) as connection:
                    connection.execute(
                        """
                        UPDATE quality_v4_research_runs
                        SET status=?, error_category=?, error=?, latency_seconds=?,
                            completed_at=? WHERE id=?
                        """,
                        (
                            status,
                            category,
                            error[:2000],
                            round(time.perf_counter() - started, 3),
                            _utc_now(),
                            run_id,
                        ),
                    )
                    connection.commit()
                record.update(status=status, error=error)
                manifest[status] += 1
            except Exception as exc:  # noqa: BLE001 - every paid attempt is persisted
                error = f"{type(exc).__name__}: {exc}"
                with connect(db_path) as connection:
                    connection.execute(
                        """
                        UPDATE quality_v4_research_runs
                        SET status='failed', error_category='validation_or_processing_failure',
                            error=?, latency_seconds=?, completed_at=? WHERE id=?
                        """,
                        (error[:2000], round(time.perf_counter() - started, 3), _utc_now(), run_id),
                    )
                    connection.commit()
                record.update(status="failed", error=error)
                manifest["failed"] += 1
            output.write(json.dumps(record, ensure_ascii=False) + "\n")
            output.flush()
            manifest["rows"].append(record)
            manifest["updated_at"] = _utc_now()
            _manifest_write(manifest_file, manifest)
    return manifest


def compact_backfill_summary(result: dict[str, Any]) -> str:
    inspection = result["inspection"]
    eligible_label = {
        "retry_failed": "Retryable failed",
        "floor70_prepublication": "Floor-70 prepublication eligible",
    }.get(inspection["selection_mode"], "Eligible pending")
    lines = [
        f"Total restaurants: {inspection['total_existing_restaurants']}",
        f"{eligible_label}: {inspection['eligible_pending']}",
        f"Already complete: {inspection['already_complete']}",
        f"Excluded: {inspection['excluded']}",
        f"Requested: {result['requested_count']}",
        f"Selected: {result['selected_count']}",
    ]
    if not result["dry_run"]:
        lines.extend(
            (
                f"Completed: {result['completed']}",
                f"Failed: {result['failed']}",
                f"Needs retry: {result['needs_retry']}",
                f"Responses requests: {result['responses_requests']}",
                f"Web-search actions: {result['web_search_actions']}",
                f"Total tokens: {result['token_usage']['total_tokens']}",
            )
        )
    lines.extend((f"Manifest: {result['manifest_path']}", f"Results: {result['results_path']}"))
    return "\n".join(lines)


def usage_projection(result: dict[str, Any], remaining: int) -> dict[str, int]:
    completed = max(1, int(result.get("completed", 0)))
    return {
        "remaining_eligible": remaining,
        "projected_responses_requests": remaining,
        "projected_web_search_actions": round(
            int(result.get("web_search_actions", 0)) / completed * remaining
        ),
        "projected_input_tokens": round(
            int(result.get("token_usage", {}).get("input_tokens", 0)) / completed * remaining
        ),
        "projected_output_tokens": round(
            int(result.get("token_usage", {}).get("output_tokens", 0)) / completed * remaining
        ),
        "projected_total_tokens": round(
            int(result.get("token_usage", {}).get("total_tokens", 0)) / completed * remaining
        ),
    }
