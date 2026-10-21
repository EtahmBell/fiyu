"""Production adapter from a durable My Pick job to the canonical catalog pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .catalog_pipeline import _strong_published_duplicate_ids, is_map_ready, verify_location
from .database import connect_readonly
from .discovery_location import TOKYO_SERVICE_AREA
from .my_pick_identity_bootstrap import run_my_pick_identity_bootstrap
from .public_catalog import ensure_public_schema
from .quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION
from .quality_v4_backfill import run_quality_v4_backfill
from .quality_v4_promotion import promote_quality_v4_allowlist
from .research_worker import run_research_batch
from .source_ingestion import ensure_my_pick_candidate, my_pick_candidate_place_id


class MyPickProcessingError(RuntimeError):
    def __init__(
        self,
        code: str,
        *,
        status: str,
        retryable: bool = False,
        counts: dict[str, int] | None = None,
    ) -> None:
        super().__init__(code)
        self.code = code
        self.status = status
        self.retryable = retryable
        self.counts = counts or {}
        self.provider_requests = int(self.counts.get("provider_requests", 0) or 0)
        self.web_search_actions = int(self.counts.get("web_search_actions", 0) or 0)


@dataclass(frozen=True)
class MyPickProcessingResult:
    place_id: str
    counts: dict[str, int] = field(default_factory=dict)


def _catalog_row(db_path: str | Path, place_id: str) -> dict[str, Any] | None:
    ensure_public_schema(db_path)
    with connect_readonly(db_path) as connection:
        row = connection.execute(
            """
            SELECT p.*, r.title AS candidate_title, r.city AS candidate_city,
                   r.source_files_json,
                   (SELECT rr.structured_research_json
                    FROM restaurant_research_runs rr
                    WHERE rr.public_restaurant_id=p.place_id AND rr.is_current=1
                    ORDER BY rr.id DESC LIMIT 1) AS structured_research_json,
                   (SELECT q.status FROM quality_v4_research_runs q
                    WHERE q.public_restaurant_id=p.place_id
                    ORDER BY q.id DESC LIMIT 1) AS quality_v4_status
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            WHERE p.place_id=?
            """,
            (place_id,),
        ).fetchone()
    return dict(row) if row is not None else None


def _existing_identity(db_path: str | Path, job: dict[str, Any]) -> str | None:
    attached = str(job.get("canonical_place_id") or "").strip()
    if attached and _catalog_row(db_path, attached):
        return attached
    candidate_id = my_pick_candidate_place_id(
        str(job["provider"]), str(job["external_place_id"])
    )
    return candidate_id if _catalog_row(db_path, candidate_id) else None


def _bootstrap_duplicate(
    db_path: str | Path, result: dict[str, Any]
) -> str | None:
    names = {
        str(result.get(key) or "").strip().casefold()
        for key in ("canonical_name_ja", "canonical_name_en")
        if str(result.get(key) or "").strip()
    }
    if not names:
        return None
    with connect_readonly(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_ja, p.name_en, r.title
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            """
        ).fetchall()
    matches = [
        str(row["place_id"])
        for row in rows
        if names
        & {
            str(row[key] or "").strip().casefold()
            for key in ("name_ja", "name_en", "title")
        }
    ]
    return matches[0] if len(matches) == 1 else None


def _bootstrap_has_independent_confirmation(result: dict[str, Any]) -> bool:
    names = [result.get("canonical_name_ja"), result.get("canonical_name_en")]
    urls = [
        str(url).strip()
        for url in result.get("supporting_urls") or []
        if str(url).startswith(("http://", "https://"))
        and "google." not in str(url).casefold()
        and "goo.gl/maps" not in str(url).casefold()
    ]
    return bool(
        any(str(name or "").strip() for name in names)
        and float(result.get("identity_confidence") or 0) >= 0.7
        and int(result.get("independent_source_count") or 0) >= 2
        and len(set(urls)) >= 2
    )


def _current_v4(row: dict[str, Any]) -> bool:
    return bool(
        row.get("research_status") == "complete"
        and row.get("fiyu_score") is not None
        and row.get("score_version") == QUALITY_PRODUCTION_SCORE_VERSION
    )


def _identity_decision(row: dict[str, Any]) -> None:
    try:
        evidence = json.loads(str(row.get("evidence_json") or "{}"))
    except json.JSONDecodeError:
        evidence = {}
    try:
        structured = json.loads(str(row.get("structured_research_json") or "{}"))
    except json.JSONDecodeError:
        structured = {}
    venue_format = str(structured.get("venue_format") or "unknown")
    food_primary = structured.get("food_drink_primary")
    classification = str(row.get("product_eligibility_classification") or "")
    rejection = str(row.get("rejection_reason") or "").casefold()
    if str(row.get("review_status") or "") == "auto_rejected" and any(
        marker in rejection
        for marker in ("permanently closed", "confirmed closed", "replaced by")
    ):
        raise MyPickProcessingError("confirmed_closed_or_replaced", status="failed_terminal")
    if food_primary is False and venue_format in {
        "catering_mobile",
        "entertainment_first",
        "service_only",
        "non_dining_service",
    }:
        raise MyPickProcessingError("confirmed_non_restaurant", status="failed_terminal")
    if classification in {"ineligible_non_dining", "ineligible_non_fixed_venue"}:
        raise MyPickProcessingError("confirmed_non_restaurant", status="failed_terminal")
    if evidence.get("matched_restaurant") is not True:
        raise MyPickProcessingError("identity_not_confirmed", status="needs_review")
    if float(evidence.get("identity_confidence") or row.get("identity_confidence") or 0) < 0.6:
        raise MyPickProcessingError("identity_confidence_too_low", status="needs_review")


class ProductionMyPickProcessor:
    """Execute one claimed job through existing canonical Fiyu stages.

    The Google/provider identity is never treated as restaurant content. A
    independent identity bootstrap establishes a canonical name before the
    existing research, location, and Quality-v4 systems run.
    """

    def __init__(
        self,
        db_path: str | Path,
        *,
        osm_index: str | Path,
        osm_address_index: str | Path | None = None,
        model: str | None = None,
        audit_dir: str | Path = "data/audits/my-picks",
    ) -> None:
        self.db_path = Path(db_path)
        self.osm_index = Path(osm_index)
        self.osm_address_index = (
            Path(osm_address_index) if osm_address_index is not None else None
        )
        self.model = model
        self.audit_dir = Path(audit_dir)

    def __call__(self, job: dict[str, Any]) -> MyPickProcessingResult:
        counts = {
            "existing_identity_reused": 0,
            "bootstrap_attempted": 0,
            "bootstrap_with_name_address": 0,
            "bootstrap_with_legacy_query": 0,
            "bootstrap_identity_confirmed": 0,
            "bootstrap_identity_ambiguous": 0,
            "canonical_candidates_created": 0,
            "duplicates_reused_after_bootstrap": 0,
            "research_completed": 0,
            "canonical_research_attempted": 0,
            "canonical_research_completed": 0,
            "location_attempted": 0,
            "location_completed": 0,
            "quality_v4_attempted": 0,
            "quality_v4_completed": 0,
            "provider_requests": 0,
            "web_search_actions": 0,
        }
        place_id = _existing_identity(self.db_path, job)
        if place_id is not None:
            counts["existing_identity_reused"] = 1
            row = _catalog_row(self.db_path, place_id)
            if row is not None and _current_v4(row):
                return MyPickProcessingResult(place_id, counts)
        else:
            from .my_picks import save_identity_bootstrap

            stored = str(job.get("identity_bootstrap_result_json") or "").strip()
            if stored and str(job.get("identity_bootstrap_status")) == "confirmed":
                identity = json.loads(stored)
            else:
                name_hint = str(job.get("identity_bootstrap_name_hint") or "").strip()
                address_hint = str(job.get("identity_bootstrap_address_hint") or "").strip()
                legacy_hint = str(job.get("identity_bootstrap_hint") or "").strip()
                if not ((name_hint and address_hint) or legacy_hint):
                    raise MyPickProcessingError(
                        "identity_not_confirmed", status="needs_review", counts=counts
                    )
                counts["bootstrap_attempted"] = 1
                try:
                    if name_hint and address_hint:
                        counts["bootstrap_with_name_address"] = 1
                        bootstrap = run_my_pick_identity_bootstrap(
                            user_name_hint=name_hint,
                            user_address_hint=address_hint,
                            model=self.model,
                        )
                    else:
                        counts["bootstrap_with_legacy_query"] = 1
                        bootstrap = run_my_pick_identity_bootstrap(legacy_hint, model=self.model)
                except RuntimeError as exc:
                    raise MyPickProcessingError(
                        "identity_bootstrap_unavailable",
                        status="failed_retryable",
                        retryable=True,
                        counts=counts,
                    ) from exc
                counts["provider_requests"] += bootstrap.provider_requests
                counts["web_search_actions"] += bootstrap.web_search_actions
                identity = bootstrap.result.model_dump(mode="json")
                if (
                    identity.get("identity_status") == "confirmed"
                    and not _bootstrap_has_independent_confirmation(identity)
                ):
                    identity["identity_status"] = "ambiguous"
                    identity["ambiguity_reason"] = (
                        identity.get("ambiguity_reason")
                        or "Independent identity evidence did not meet the confirmation threshold."
                    )
                save_identity_bootstrap(
                    self.db_path,
                    str(job["id"]),
                    str(job["claim_token"]),
                    result=identity,
                )
                if identity["identity_status"] == "ambiguous":
                    counts["bootstrap_identity_ambiguous"] = 1
                    raise MyPickProcessingError(
                        "identity_not_confirmed", status="needs_review", counts=counts
                    )
                if identity["identity_status"] == "non_restaurant":
                    raise MyPickProcessingError(
                        "confirmed_non_restaurant", status="failed_terminal", counts=counts
                    )
                counts["bootstrap_identity_confirmed"] = 1
                if identity.get("closure_or_replacement_contradiction"):
                    raise MyPickProcessingError(
                        "confirmed_closed_or_replaced",
                        status="failed_terminal",
                        counts=counts,
                    )

            duplicate = _bootstrap_duplicate(self.db_path, identity)
            if duplicate is not None:
                place_id = duplicate
                counts["duplicates_reused_after_bootstrap"] = 1
                counts["existing_identity_reused"] = 1
                duplicate_row = _catalog_row(self.db_path, duplicate)
                if duplicate_row is not None and _current_v4(duplicate_row):
                    return MyPickProcessingResult(duplicate, counts)
            else:
                canonical_name = str(
                    identity.get("canonical_name_ja")
                    or identity.get("canonical_name_en")
                    or ""
                )
                place_id, created = ensure_my_pick_candidate(
                    self.db_path,
                    provider=str(job["provider"]),
                    external_place_id=str(job["external_place_id"]),
                    canonical_name=canonical_name,
                    canonical_name_ja=identity.get("canonical_name_ja"),
                    canonical_name_en=identity.get("canonical_name_en"),
                    city=identity.get("city"),
                    neighborhood=identity.get("neighborhood"),
                    address=identity.get("address"),
                    primary_category=identity.get("primary_category"),
                )
                counts["canonical_candidates_created"] = int(created)

        from .my_picks import mark_canonical_work_researching

        mark_canonical_work_researching(
            self.db_path,
            str(job["id"]),
            str(job["claim_token"]),
            place_id=place_id,
        )

        row = _catalog_row(self.db_path, place_id)
        if row is None:
            raise MyPickProcessingError(
                "canonical_candidate_missing",
                status="failed_retryable",
                retryable=True,
                counts=counts,
            )
        if row.get("research_status") != "complete":
            counts["canonical_research_attempted"] = 1
            try:
                research = run_research_batch(
                    self.db_path,
                    limit=1,
                    place_id=place_id,
                    model=self.model,
                    retry_failed=str(row.get("research_status")) in {"failed", "needs_retry"},
                    max_items=1,
                )
            except RuntimeError as exc:
                code = (
                    "research_provider_unconfigured"
                    if "OPENAI_API_KEY" in str(exc)
                    else "research_stage_unavailable"
                )
                raise MyPickProcessingError(
                    code,
                    status="failed_retryable",
                    retryable=True,
                    counts=counts,
                ) from exc
            counts["provider_requests"] += int(research.get("responses_requests", 0) or 0)
            counts["web_search_actions"] += int(research.get("web_search_actions", 0) or 0)
            counts["research_completed"] += int(research.get("completed", 0) or 0)
            row = _catalog_row(self.db_path, place_id)
            if row is None or row.get("research_status") != "complete":
                retryable = bool(
                    row
                    and row.get("research_status") in {"needs_retry", "failed"}
                )
                raise MyPickProcessingError(
                    "canonical_research_incomplete",
                    status="failed_retryable" if retryable else "needs_review",
                    retryable=retryable,
                    counts=counts,
                )
            counts["canonical_research_completed"] = 1
        else:
            counts["canonical_research_completed"] = 1

        if row.get("low_footprint_route_eligible") and not row.get(
            "low_footprint_research_attempted"
        ):
            from .low_footprint_research import run_low_footprint_research

            try:
                enrichment = run_low_footprint_research(
                    self.db_path,
                    place_ids=[place_id],
                    limit=1,
                    model=self.model,
                )
            except RuntimeError as exc:
                code = (
                    "low_footprint_provider_unconfigured"
                    if "OPENAI_API_KEY" in str(exc)
                    else "low_footprint_stage_unavailable"
                )
                raise MyPickProcessingError(
                    code,
                    status="failed_retryable",
                    retryable=True,
                    counts=counts,
                ) from exc
            counts["provider_requests"] += int(
                enrichment.get("responses_requests", 0) or 0
            )
            counts["web_search_actions"] += int(
                enrichment.get("web_search_actions", 0) or 0
            )
            row = _catalog_row(self.db_path, place_id) or row

        try:
            _identity_decision(row)
        except MyPickProcessingError as exc:
            exc.counts = counts
            exc.provider_requests = counts["provider_requests"]
            exc.web_search_actions = counts["web_search_actions"]
            raise
        with connect_readonly(self.db_path) as connection:
            duplicates = _strong_published_duplicate_ids(connection, row)
        if len(duplicates) == 1:
            duplicate_id = duplicates[0]
            duplicate = _catalog_row(self.db_path, duplicate_id)
            if duplicate is not None and _current_v4(duplicate):
                counts["existing_identity_reused"] = 1
                return MyPickProcessingResult(duplicate_id, counts)
        elif len(duplicates) > 1:
            raise MyPickProcessingError(
                "ambiguous_duplicate", status="needs_review", counts=counts
            )

        if not is_map_ready(row):
            counts["location_attempted"] = 1
            try:
                location = verify_location(
                    self.db_path,
                    place_id,
                    osm_index=self.osm_index,
                    osm_address_index=self.osm_address_index,
                    address_model=self.model,
                )
            except RuntimeError as exc:
                code = (
                    "location_provider_unconfigured"
                    if "OPENAI_API_KEY" in str(exc)
                    else "location_stage_unavailable"
                )
                raise MyPickProcessingError(
                    code,
                    status="failed_retryable",
                    retryable=True,
                    counts=counts,
                ) from exc
            cost = location.get("cost") or {}
            counts["provider_requests"] += int(
                cost.get("address_fallback_responses_requests", 0) or 0
            )
            counts["web_search_actions"] += int(
                cost.get("address_fallback_web_search_actions", 0) or 0
            )
            row = _catalog_row(self.db_path, place_id) or row
        counts["location_completed"] = int(is_map_ready(row))

        if is_map_ready(row) and not TOKYO_SERVICE_AREA.contains(
            float(row["latitude"]), float(row["longitude"])
        ):
            raise MyPickProcessingError(
                "outside_service_area", status="outside_coverage", counts=counts
            )

        if not _current_v4(row):
            counts["quality_v4_attempted"] = 1
            attempt = int(job.get("attempt_count") or 1)
            base = self.audit_dir / f"{job['id']}-attempt-{attempt}"
            try:
                quality = run_quality_v4_backfill(
                    self.db_path,
                    limit=1,
                    place_id=place_id,
                    retry_failed=(
                        attempt > 1
                        or row.get("quality_v4_status") in {"failed", "needs_retry"}
                    ),
                    model=self.model,
                    manifest_path=base.with_suffix(".json"),
                    results_path=base.with_suffix(".jsonl"),
                )
            except RuntimeError as exc:
                code = (
                    "quality_provider_unconfigured"
                    if "OPENAI_API_KEY" in str(exc)
                    else "quality_stage_unavailable"
                )
                raise MyPickProcessingError(
                    code,
                    status="failed_retryable",
                    retryable=True,
                    counts=counts,
                ) from exc
            counts["provider_requests"] += int(quality.get("responses_requests", 0) or 0)
            counts["web_search_actions"] += int(quality.get("web_search_actions", 0) or 0)
            counts["quality_v4_completed"] += int(quality.get("completed", 0) or 0)
            if int(quality.get("needs_retry", 0) or 0):
                raise MyPickProcessingError(
                    "quality_v4_retryable",
                    status="failed_retryable",
                    retryable=True,
                    counts=counts,
                )
            if int(quality.get("failed", 0) or 0):
                raise MyPickProcessingError(
                    "quality_v4_failed", status="needs_review", counts=counts
                )
            try:
                promote_quality_v4_allowlist(self.db_path, place_ids=[place_id])
            except ValueError as exc:
                raise MyPickProcessingError(
                    "quality_v4_promotion_needs_review",
                    status="needs_review",
                    counts=counts,
                ) from exc
            row = _catalog_row(self.db_path, place_id) or row
        if not _current_v4(row):
            raise MyPickProcessingError(
                "production_v4_missing", status="needs_review", counts=counts
            )
        return MyPickProcessingResult(place_id, counts)
