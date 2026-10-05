"""Sequential, resumable Quality-v4 research and shadow scoring."""

from __future__ import annotations

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
from openai import APIConnectionError, APITimeoutError, OpenAI

from .address_research import extract_response_metadata
from .database import connect
from .experimental_quality_challenge_v4 import ChallengeResearchResult
from .public_catalog import ensure_public_schema
from .public_score import FiyuEvidence, InternalSignals
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
        "q.status AS quality_v4_status, q.id AS quality_v4_run_id"
        if existing
        else "NULL AS quality_v4_status, NULL AS quality_v4_run_id"
    )
    rows = connection.execute(
        f"""
        SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
               p.discovery_area, p.normalized_address, p.description_en,
               p.food_tags_json, p.signature_dishes_json, p.evidence_json,
               p.evidence_urls_json, p.identity_confidence, p.research_status,
               p.review_status, p.fiyu_score AS stored_production_v3_score,
               p.is_published, r.id AS source_restaurant_id, r.title,
               r.category AS source_category, r.quality_score,
               r.underexposure_score, r.digital_footprint_score,
               r.internal_fiyu_score, r.rating, r.review_count, r.website,
               rr.structured_research_json, {q_columns}
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


def _exclusion_reason(row: dict[str, Any]) -> str | None:
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
    if str(row.get("review_status") or "") in {"rejected", "auto_rejected"}:
        return "rejected_or_obsolete"
    return None


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
    start_after: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    with readonly_sqlite_snapshot(db_path) as connection:
        rows = _all_candidate_rows(connection)
    exclusions = Counter()
    eligible: list[dict[str, Any]] = []
    already_complete = 0
    blocked_existing = Counter()
    for row in rows:
        reason = _exclusion_reason(row)
        if reason:
            exclusions[reason] += 1
            continue
        status = row.get("quality_v4_status")
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
    start_after: str | None = None,
    force: bool = False,
    dry_run: bool = False,
    model: str | None = None,
    manifest_path: str | Path | None = None,
    results_path: str | Path | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    if limit <= 0:
        raise ValueError("limit must be positive")
    inspection = inspect_quality_v4_backfill(
        db_path, place_id=place_id, start_after=start_after, force=force
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
        "rows": [],
        "manifest_path": str(manifest_file),
        "results_path": str(results_file),
    }
    _manifest_write(manifest_file, manifest)
    if dry_run:
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
    lines = [
        f"Total restaurants: {inspection['total_existing_restaurants']}",
        f"Eligible pending: {inspection['eligible_pending']}",
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
