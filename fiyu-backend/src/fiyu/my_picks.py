"""Durable, provider-neutral orchestration state for user-requested My Picks.

Account ownership lives in Supabase. This module owns only shared canonical work
and the internal editorial-review queue in the catalog SQLite database. It does
not calculate scores: workers must run the existing canonical pipeline and then
finalize a job from the resulting ``public_restaurants`` row.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from .catalog_pipeline import is_map_ready
from .database import connect, connect_readonly
from .discovery_location import TOKYO_SERVICE_AREA
from .public_catalog import ensure_public_schema
from .quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION

MyPickStatus = Literal[
    "pending",
    "resolving_identity",
    "outside_coverage",
    "researching",
    "needs_location",
    "ready",
    "needs_review",
    "failed_retryable",
    "failed_terminal",
]

MY_PICK_SCHEMA_VERSION = "my-pick-orchestration-v2-identity-bootstrap"
MY_PICK_WORK_SCHEMA = """
CREATE TABLE IF NOT EXISTS my_pick_canonical_work (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    external_place_id TEXT NOT NULL,
    display_name_hint TEXT,
    identity_bootstrap_hint TEXT,
    identity_bootstrap_name_hint TEXT,
    identity_bootstrap_address_hint TEXT,
    identity_bootstrap_status TEXT NOT NULL DEFAULT 'pending',
    identity_bootstrap_result_json TEXT,
    canonical_place_id TEXT,
    status TEXT NOT NULL CHECK (status IN (
        'pending', 'resolving_identity', 'outside_coverage', 'researching',
        'needs_location', 'ready', 'needs_review', 'failed_retryable', 'failed_terminal'
    )),
    failure_code TEXT,
    retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    claim_owner TEXT,
    claim_token TEXT,
    claimed_at TEXT,
    lease_expires_at TEXT,
    provider_request_count INTEGER NOT NULL DEFAULT 0,
    submission_count INTEGER NOT NULL DEFAULT 1 CHECK (submission_count > 0),
    first_submitted_at TEXT NOT NULL,
    last_submitted_at TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider, external_place_id)
);
CREATE INDEX IF NOT EXISTS idx_my_pick_work_status
    ON my_pick_canonical_work(status, updated_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_my_pick_work_canonical_identity
    ON my_pick_canonical_work(canonical_place_id)
    WHERE canonical_place_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS my_pick_recommendation_reviews (
    id TEXT PRIMARY KEY,
    canonical_place_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
    score_at_queue REAL NOT NULL,
    score_version TEXT NOT NULL,
    first_submitted_at TEXT NOT NULL,
    latest_submitted_at TEXT NOT NULL,
    submission_count INTEGER NOT NULL DEFAULT 1 CHECK (submission_count > 0),
    qualification_reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (canonical_place_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_my_pick_reviews_status
    ON my_pick_recommendation_reviews(status, created_at, canonical_place_id);
"""

_PROVIDER = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")
_EXTERNAL_ID_MAX = 512
_WORK_NAMESPACE = uuid.UUID("e6a8de1f-2a5f-4be8-a95d-84eb3e1d4a02")
_FAILURE_CODE = re.compile(r"^[a-z][a-z0-9_.-]{0,119}$")
logger = logging.getLogger(__name__)

_HARD_RESET_STATUSES = {
    "pending",
    "resolving_identity",
    "researching",
    "failed_retryable",
    "needs_review",
}
_MY_PICK_TRANSIENT_TABLES = {
    "restaurant_research_runs",
    "score_calculation_runs",
    "quality_v4_research_runs",
    "low_footprint_research_runs",
    "description_research_runs",
    "restaurant_card_enrichment_runs",
    "location_match_candidates",
    "address_research_runs",
    "address_search_attempts",
    "address_evidence",
    "address_decision_audits",
    "address_review_decisions",
    "verified_restaurant_addresses",
    "address_geocode_results",
    "location_history",
    "my_pick_recommendation_reviews",
}


class MyPickHardResetError(RuntimeError):
    """A destructive developer reset could not be proven safe."""


def _now(value: datetime | None = None) -> str:
    return (value or datetime.now(UTC)).isoformat()


def normalize_external_identity(provider: str, external_place_id: str) -> tuple[str, str]:
    normalized_provider = provider.strip().casefold()
    normalized_id = external_place_id.strip()
    if not _PROVIDER.fullmatch(normalized_provider):
        raise ValueError("invalid external place provider")
    if not normalized_id or len(normalized_id) > _EXTERNAL_ID_MAX:
        raise ValueError("invalid external place identifier")
    return normalized_provider, normalized_id


def canonical_work_id(provider: str, external_place_id: str) -> str:
    """Return the stable shared-work ID used across SQLite and Supabase."""

    provider, external_place_id = normalize_external_identity(provider, external_place_id)
    return str(uuid.uuid5(_WORK_NAMESPACE, f"{provider}\0{external_place_id}"))


def _safe_failure_code(exc: Exception) -> str:
    raw = str(getattr(exc, "code", type(exc).__name__)).strip()
    normalized = re.sub(r"(?<!^)(?=[A-Z])", "_", raw).casefold()
    return normalized if _FAILURE_CODE.fullmatch(normalized) else "processing_error"


def ensure_my_pick_schema(db_path: str | Path) -> None:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        connection.executescript(MY_PICK_WORK_SCHEMA)
        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(my_pick_canonical_work)")
        }
        additions = {
            "identity_bootstrap_hint": "TEXT",
            "identity_bootstrap_name_hint": "TEXT",
            "identity_bootstrap_address_hint": "TEXT",
            "identity_bootstrap_status": "TEXT NOT NULL DEFAULT 'pending'",
            "identity_bootstrap_result_json": "TEXT",
        }
        for name, definition in additions.items():
            if name not in columns:
                connection.execute(
                    f"ALTER TABLE my_pick_canonical_work ADD COLUMN {name} {definition}"
                )
        connection.commit()


def _canonical_row(connection: Any, place_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT p.*, r.title AS candidate_title, r.city AS candidate_city
        FROM public_restaurants p
        LEFT JOIN restaurants r ON r.place_id=p.place_id
        WHERE p.place_id=?
        """,
        (place_id,),
    ).fetchone()
    return dict(row) if row is not None else None


def _trusted_coverage(row: dict[str, Any]) -> bool | None:
    if not is_map_ready(row):
        return None
    latitude = float(row["latitude"])
    longitude = float(row["longitude"])
    return TOKYO_SERVICE_AREA.contains(latitude, longitude)


def _current_score(row: dict[str, Any]) -> bool:
    return (
        row.get("fiyu_score") is not None
        and row.get("score_version") == QUALITY_PRODUCTION_SCORE_VERSION
        and row.get("research_status") == "complete"
    )


def _status_from_canonical(row: dict[str, Any]) -> MyPickStatus:
    coverage = _trusted_coverage(row)
    if coverage is False:
        return "outside_coverage"
    if str(row.get("review_status") or "") == "needs_review" and not _current_score(row):
        return "needs_review"
    if not _current_score(row):
        return "researching"
    if coverage is None:
        return "needs_location"
    return "ready"


def _recommendation_eligible(row: dict[str, Any], threshold: float) -> bool:
    rejection = str(row.get("rejection_reason") or "").strip()
    return bool(
        not row.get("is_published")
        and _current_score(row)
        and float(row["fiyu_score"]) >= threshold
        and row.get("product_eligible")
        and _trusted_coverage(row) is True
        and not rejection
        and str(row.get("review_status") or "") != "auto_rejected"
    )


def _ensure_review_item(
    connection: Any,
    *,
    row: dict[str, Any],
    first_submitted_at: str,
    latest_submitted_at: str,
    submission_count: int,
    now: str,
) -> str | None:
    threshold = publication_score_threshold_from_connection(connection)
    if not _recommendation_eligible(row, threshold):
        return None
    place_id = str(row["place_id"])
    existing = connection.execute(
        "SELECT id FROM my_pick_recommendation_reviews WHERE canonical_place_id=?",
        (place_id,),
    ).fetchone()
    review_id = str(existing["id"]) if existing else str(uuid.uuid4())
    connection.execute(
        """
        INSERT INTO my_pick_recommendation_reviews(
            id, canonical_place_id, status, score_at_queue, score_version,
            first_submitted_at, latest_submitted_at, submission_count,
            qualification_reason, created_at, updated_at
        ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(canonical_place_id) DO UPDATE SET
            score_at_queue=excluded.score_at_queue,
            score_version=excluded.score_version,
            latest_submitted_at=excluded.latest_submitted_at,
            submission_count=MAX(my_pick_recommendation_reviews.submission_count,
                                 excluded.submission_count),
            qualification_reason=excluded.qualification_reason,
            updated_at=excluded.updated_at
        """,
        (
            review_id,
            place_id,
            float(row["fiyu_score"]),
            str(row["score_version"]),
            first_submitted_at,
            latest_submitted_at,
            submission_count,
            f"canonical score >= {threshold:g}; eligible; map-ready; inside coverage",
            now,
            now,
        ),
    )
    return review_id


def publication_score_threshold_from_connection(connection: Any) -> float:
    row = connection.execute(
        "SELECT value FROM metadata WHERE key='publication_score_threshold'"
    ).fetchone()
    return float(row["value"]) if row is not None else 70.0


def create_or_get_canonical_work(
    db_path: str | Path,
    *,
    provider: str,
    external_place_id: str,
    display_name_hint: str | None = None,
    identity_bootstrap_hint: str | None = None,
    identity_bootstrap_name_hint: str | None = None,
    identity_bootstrap_address_hint: str | None = None,
    work_id: str | None = None,
    now: datetime | None = None,
) -> tuple[dict[str, Any], bool]:
    """Atomically reuse shared work for the same external restaurant identity."""

    provider, external_place_id = normalize_external_identity(provider, external_place_id)
    hint = (display_name_hint or "").strip()[:200] or None
    bootstrap_hint = (identity_bootstrap_hint or "").strip()[:200] or None
    bootstrap_name_hint = (identity_bootstrap_name_hint or "").strip()[:200] or None
    bootstrap_address_hint = (identity_bootstrap_address_hint or "").strip()[:500] or None
    ensure_my_pick_schema(db_path)
    timestamp = _now(now)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE provider=? AND external_place_id=?",
            (provider, external_place_id),
        ).fetchone()
        if existing is not None:
            connection.execute(
                """
                UPDATE my_pick_canonical_work
                SET submission_count=submission_count+1, last_submitted_at=?, updated_at=?,
                    display_name_hint=COALESCE(display_name_hint, ?)
                    , identity_bootstrap_hint=COALESCE(identity_bootstrap_hint, ?)
                    , identity_bootstrap_name_hint=COALESCE(identity_bootstrap_name_hint, ?)
                    , identity_bootstrap_address_hint=COALESCE(identity_bootstrap_address_hint, ?)
                WHERE id=?
                """,
                (timestamp, timestamp, hint, bootstrap_hint, bootstrap_name_hint, bootstrap_address_hint, existing["id"]),
            )
            row = connection.execute(
                "SELECT * FROM my_pick_canonical_work WHERE id=?", (existing["id"],)
            ).fetchone()
            if row["canonical_place_id"]:
                canonical = _canonical_row(connection, str(row["canonical_place_id"]))
                if canonical:
                    _ensure_review_item(
                        connection,
                        row=canonical,
                        first_submitted_at=str(row["first_submitted_at"]),
                        latest_submitted_at=str(row["last_submitted_at"]),
                        submission_count=int(row["submission_count"]),
                        now=timestamp,
                    )
            connection.commit()
            return dict(row), False

        # Existing Google IDs are already the catalog's durable external identity.
        canonical_hint = (
            external_place_id if provider in {"google", "google_places"} else None
        )
        canonical = _canonical_row(connection, canonical_hint) if canonical_hint else None
        status: MyPickStatus = _status_from_canonical(canonical) if canonical else "pending"
        canonical_id = str(canonical["place_id"]) if canonical else None
        resolved_at = timestamp if canonical else None
        work_id = work_id or canonical_work_id(provider, external_place_id)
        connection.execute(
            """
            INSERT INTO my_pick_canonical_work(
                id, provider, external_place_id, display_name_hint,
                identity_bootstrap_hint, identity_bootstrap_name_hint,
                identity_bootstrap_address_hint, canonical_place_id,
                status, first_submitted_at, last_submitted_at, resolved_at,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                work_id,
                provider,
                external_place_id,
                hint,
                bootstrap_hint,
                bootstrap_name_hint,
                bootstrap_address_hint,
                canonical_id,
                status,
                timestamp,
                timestamp,
                resolved_at,
                timestamp,
                timestamp,
            ),
        )
        if canonical:
            _ensure_review_item(
                connection,
                row=canonical,
                first_submitted_at=timestamp,
                latest_submitted_at=timestamp,
                submission_count=1,
                now=timestamp,
            )
        row = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
        ).fetchone()
        connection.commit()
    return dict(row), True


def get_canonical_work(db_path: str | Path, work_id: str) -> dict[str, Any] | None:
    ensure_my_pick_schema(db_path)
    with connect_readonly(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
        ).fetchone()
    return dict(row) if row is not None else None


def get_my_pick_stage_diagnostics(
    db_path: str | Path, work_id: str
) -> dict[str, Any]:
    """Return bounded, developer-safe stage state without raw provider payloads."""

    ensure_my_pick_schema(db_path)
    with connect_readonly(db_path) as connection:
        work_row = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
        ).fetchone()
        if work_row is None:
            raise ValueError("My Pick canonical work not found")
        work = dict(work_row)
        place_id = str(work.get("canonical_place_id") or "").strip() or None
        restaurant = None
        research_run = None
        quality_run = None
        location_attempted = False
        if place_id:
            row = connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id=?", (place_id,)
            ).fetchone()
            restaurant = dict(row) if row is not None else None
            row = connection.execute(
                """
                SELECT status, error, evidence_urls_json
                FROM restaurant_research_runs
                WHERE public_restaurant_id=? ORDER BY id DESC LIMIT 1
                """,
                (place_id,),
            ).fetchone()
            research_run = dict(row) if row is not None else None
            row = connection.execute(
                """
                SELECT status, error_category, score_version
                FROM quality_v4_research_runs
                WHERE public_restaurant_id=? ORDER BY id DESC LIMIT 1
                """,
                (place_id,),
            ).fetchone()
            quality_run = dict(row) if row is not None else None
            location_attempted = bool(
                connection.execute(
                    "SELECT 1 FROM address_research_runs WHERE public_restaurant_id=? LIMIT 1",
                    (place_id,),
                ).fetchone()
            )

    bootstrap_status = str(work.get("identity_bootstrap_status") or "pending")
    research_status = (
        str(restaurant.get("research_status") or "pending") if restaurant else None
    )
    research_error = str((research_run or {}).get("error") or "")
    failure_class = research_error.partition(":")[0].strip() or None
    if failure_class and not re.fullmatch(
        r"[A-Za-z][A-Za-z0-9_.-]{0,119}", failure_class
    ):
        failure_class = "research_failure"
    accepted_sources: int | None = None
    if research_run:
        try:
            sources = json.loads(str(research_run.get("evidence_urls_json") or "[]"))
            accepted_sources = len(sources) if isinstance(sources, list) else None
        except json.JSONDecodeError:
            accepted_sources = None
    missing: list[str] = []
    if place_id is None:
        missing.append("canonical_identity")
    elif research_status != "complete":
        missing.append(f"research_status:{research_status or 'missing'}")
        if failure_class:
            missing.append(f"failure_class:{failure_class}")
    map_ready = bool(restaurant and is_map_ready(restaurant))
    score_version = str(restaurant.get("score_version") or "") if restaurant else ""
    quality_status = str((quality_run or {}).get("status") or "") or None
    return {
        "identity_bootstrap_attempted": bootstrap_status != "pending",
        "identity_bootstrap_completed": bootstrap_status == "confirmed",
        "identity_bootstrap_status": bootstrap_status,
        "canonical_research_attempted": research_run is not None,
        "canonical_research_completed": research_status == "complete",
        "canonical_research_status": research_status,
        "canonical_research_failure_code": failure_class,
        "accepted_source_count": accepted_sources,
        "rejected_source_count": None,
        "canonical_research_missing_requirements": missing,
        "location_attempted": location_attempted,
        "location_completed": map_ready,
        "location_precision": (
            str(restaurant.get("map_location_precision") or "") or None
            if restaurant
            else None
        ),
        "quality_v4_attempted": quality_run is not None,
        "quality_v4_completed": (
            quality_status == "complete"
            and score_version == QUALITY_PRODUCTION_SCORE_VERSION
        ),
        "quality_v4_status": quality_status,
        "score_version": score_version or None,
        "ready": str(work.get("status")) == "ready",
    }


def save_identity_bootstrap(
    db_path: str | Path,
    work_id: str,
    claim_token: str,
    *,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Checkpoint independently researched identity before candidate creation."""

    ensure_my_pick_schema(db_path)
    status = str(result.get("identity_status") or "")
    if status not in {"confirmed", "ambiguous", "non_restaurant"}:
        raise ValueError("invalid identity bootstrap status")
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET identity_bootstrap_status=?, identity_bootstrap_result_json=?, updated_at=?
            WHERE id=? AND claim_token=?
            """,
            (
                status,
                json.dumps(result, ensure_ascii=False, sort_keys=True),
                _now(),
                work_id,
                claim_token,
            ),
        )
        if cursor.rowcount != 1:
            raise RuntimeError("My Pick identity bootstrap lost its worker lease")
        row = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
        ).fetchone()
        connection.commit()
    return dict(row)


def _quoted_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _public_restaurant_references(connection: Any) -> list[tuple[str, str]]:
    references: list[tuple[str, str]] = []
    tables = connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    for table_row in tables:
        table = str(table_row["name"])
        for foreign_key in connection.execute(
            f"PRAGMA foreign_key_list({_quoted_identifier(table)})"
        ).fetchall():
            if (
                str(foreign_key["table"]) == "public_restaurants"
                and str(foreign_key["to"]) == "place_id"
            ):
                references.append((table, str(foreign_key["from"])))
    return references


def _hard_reset_plan(connection: Any, work_id: str) -> dict[str, Any]:
    row = connection.execute(
        "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
    ).fetchone()
    if row is None:
        raise MyPickHardResetError("My Pick canonical work no longer exists")
    work = dict(row)
    if str(work["status"]) not in _HARD_RESET_STATUSES:
        raise MyPickHardResetError("This My Pick state cannot be hard-reset")
    lease = str(work.get("lease_expires_at") or "")
    if str(work["status"]) in {"resolving_identity", "researching"} and lease > _now():
        raise MyPickHardResetError("This My Pick is actively processing and cannot be reset")

    place_id = str(work.get("canonical_place_id") or "").strip() or None
    delete_placeholder = False
    references: list[tuple[str, str]] = []
    if place_id:
        canonical = connection.execute(
            """
            SELECT p.is_published, p.source_restaurant_id,
                   r.id AS restaurant_id, r.source_files_json
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
            WHERE p.place_id=?
            """,
            (place_id,),
        ).fetchone()
        if canonical is not None and not bool(canonical["is_published"]):
            try:
                provenance = json.loads(str(canonical["source_files_json"] or "[]"))
            except json.JSONDecodeError:
                provenance = []
            delete_placeholder = provenance == [f"my_pick:{work['provider']}"]
            if delete_placeholder:
                references = _public_restaurant_references(connection)
                for table, column in references:
                    if table in _MY_PICK_TRANSIENT_TABLES or table == "my_pick_canonical_work":
                        continue
                    count = connection.execute(
                        f"SELECT COUNT(*) FROM {_quoted_identifier(table)} "
                        f"WHERE {_quoted_identifier(column)}=?",
                        (place_id,),
                    ).fetchone()[0]
                    if count:
                        raise MyPickHardResetError(
                            "This My Pick candidate has non-transient dependencies and cannot be reset"
                        )
    return {
        "work": work,
        "place_id": place_id,
        "delete_placeholder": delete_placeholder,
        "references": references,
    }


def inspect_my_pick_hard_reset(db_path: str | Path, work_id: str) -> dict[str, Any]:
    """Validate a developer hard reset without mutating canonical state."""

    ensure_my_pick_schema(db_path)
    with connect_readonly(db_path) as connection:
        plan = _hard_reset_plan(connection, work_id)
    return {
        "canonical_place_id": plan["place_id"],
        "will_delete_transient_placeholder": bool(plan["delete_placeholder"]),
    }


def hard_reset_my_pick_canonical_work(
    db_path: str | Path, work_id: str
) -> dict[str, Any]:
    """Delete one unshared developer work item and only its exclusive placeholder."""

    ensure_my_pick_schema(db_path)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        plan = _hard_reset_plan(connection, work_id)
        place_id = plan["place_id"]
        connection.execute("DELETE FROM my_pick_canonical_work WHERE id=?", (work_id,))
        deleted_placeholder = False
        if place_id and plan["delete_placeholder"]:
            connection.execute("PRAGMA defer_foreign_keys=ON")
            for table, column in plan["references"]:
                if table == "my_pick_canonical_work":
                    continue
                connection.execute(
                    f"DELETE FROM {_quoted_identifier(table)} "
                    f"WHERE {_quoted_identifier(column)}=?",
                    (place_id,),
                )
            connection.execute(
                "DELETE FROM public_restaurants WHERE place_id=?", (place_id,)
            )
            connection.execute("DELETE FROM restaurants WHERE place_id=?", (place_id,))
            deleted_placeholder = True
        connection.commit()
    return {
        "deleted_canonical_work": 1,
        "deleted_transient_placeholder": deleted_placeholder,
        "preserved_canonical_restaurant": bool(place_id and not deleted_placeholder),
    }


def inspect_claimable_canonical_work(
    db_path: str | Path,
    *,
    limit: int,
    retry_failed: bool = False,
    work_id: str | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Read the bounded worker selection without claiming or executing it."""

    if limit < 1:
        raise ValueError("limit must be positive")
    current = _now(now)
    eligible = ["pending", *(["failed_retryable"] if retry_failed else [])]
    placeholders = ",".join("?" for _ in eligible)
    with connect_readonly(db_path) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='my_pick_canonical_work'"
        ).fetchone()
        if table is None:
            return []
        rows = connection.execute(
            f"""
            SELECT * FROM my_pick_canonical_work
            WHERE (status IN ({placeholders})
               OR (status IN ('resolving_identity', 'researching') AND lease_expires_at <= ?))
              AND (? IS NULL OR id = ?)
            ORDER BY first_submitted_at, id LIMIT ?
            """,
            (*eligible, current, work_id, work_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def canonical_result(db_path: str | Path, work: dict[str, Any]) -> dict[str, Any]:
    """Return only user-safe canonical result fields, including unpublished rows."""

    place_id = work.get("canonical_place_id")
    if not place_id:
        return {}
    with connect_readonly(db_path) as connection:
        row = _canonical_row(connection, str(place_id))
        review = connection.execute(
            "SELECT status FROM my_pick_recommendation_reviews WHERE canonical_place_id=?",
            (place_id,),
        ).fetchone()
    if row is None:
        return {}

    def safe_name(value: object) -> str | None:
        name = str(value or "").strip()
        if not name:
            return None
        identifiers = {
            str(work.get("id") or "").strip().casefold(),
            str(work.get("external_place_id") or "").strip().casefold(),
            str(work.get("canonical_place_id") or "").strip().casefold(),
            str(row.get("place_id") or "").strip().casefold(),
        }
        if name.casefold() in identifiers:
            return None
        for identifier in identifiers:
            if identifier and name.casefold() == f"my pick {identifier[-12:]}":
                return None
        try:
            uuid.UUID(name)
        except ValueError:
            return name
        return None

    map_ready = is_map_ready(row) and _trusted_coverage(row) is True
    score_current = _current_score(row)
    return {
        "place_id": str(row["place_id"]),
        "name_ja": safe_name(row.get("name_ja")),
        "name_en": safe_name(row.get("name_en"))
        or safe_name(row.get("candidate_title")),
        "primary_category": row.get("primary_category"),
        "display_area": row.get("discovery_area") or row.get("neighborhood"),
        "fiyu_score": row.get("fiyu_score") if score_current else None,
        "score_version": row.get("score_version") if score_current else None,
        "map_ready": bool(map_ready),
        "latitude": row.get("latitude") if map_ready else None,
        "longitude": row.get("longitude") if map_ready else None,
        "location_precision": row.get("map_location_precision")
        or row.get("location_precision"),
        "is_public": bool(row.get("is_published")),
        "recommendation_review_status": str(review["status"]) if review else "not_eligible",
    }


def sync_account_projection(db_path: str | Path, work: dict[str, Any]) -> int:
    """Project shared canonical state to every waiting account-owned record."""

    from . import supabase_user_data

    canonical = canonical_result(db_path, work)
    return supabase_user_data.sync_my_pick_result(
        canonical_work_id=str(work["id"]),
        canonical_place_id=(
            str(work["canonical_place_id"]) if work.get("canonical_place_id") else None
        ),
        status=str(work["status"]),
        failure_code=(str(work["failure_code"]) if work.get("failure_code") else None),
        score_version=(
            str(canonical["score_version"]) if canonical.get("score_version") else None
        ),
        is_public=bool(canonical.get("is_public")),
        recommendation_review_status=str(
            canonical.get("recommendation_review_status") or "not_eligible"
        ),
        resolved_at=(str(work["resolved_at"]) if work.get("resolved_at") else None),
    )


def claim_next_canonical_work(
    db_path: str | Path,
    *,
    worker_id: str,
    retry_failed: bool = False,
    work_id: str | None = None,
    lease_seconds: int = 900,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    ensure_my_pick_schema(db_path)
    current = now or datetime.now(UTC)
    timestamp = _now(current)
    lease = _now(current + timedelta(seconds=lease_seconds))
    eligible = ["pending"]
    if retry_failed:
        eligible.append("failed_retryable")
    placeholders = ",".join("?" for _ in eligible)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            f"""
            SELECT * FROM my_pick_canonical_work
            WHERE (status IN ({placeholders})
               OR (status IN ('resolving_identity', 'researching') AND lease_expires_at <= ?))
              AND (? IS NULL OR id = ?)
            ORDER BY first_submitted_at, id LIMIT 1
            """,
            (*eligible, timestamp, work_id, work_id),
        ).fetchone()
        if row is None:
            connection.commit()
            return None
        token = uuid.uuid4().hex
        connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET status='resolving_identity', attempt_count=attempt_count+1,
                claim_owner=?, claim_token=?, claimed_at=?, lease_expires_at=?,
                failure_code=NULL, retryable=0, updated_at=?
            WHERE id=?
            """,
            (worker_id, token, timestamp, lease, timestamp, row["id"]),
        )
        claimed = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (row["id"],)
        ).fetchone()
        connection.commit()
    return dict(claimed)


def mark_canonical_work_researching(
    db_path: str | Path, work_id: str, claim_token: str, *, place_id: str
) -> None:
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET status='researching', canonical_place_id=?, updated_at=?
            WHERE id=? AND claim_token=? AND status='resolving_identity'
            """,
            (place_id, _now(), work_id, claim_token),
        )
        if cursor.rowcount != 1:
            raise ValueError("My Pick work is not owned by this claim")
        connection.commit()


def complete_canonical_work_from_catalog(
    db_path: str | Path,
    work_id: str,
    claim_token: str,
    *,
    place_id: str,
    provider_requests: int = 0,
) -> dict[str, Any]:
    """Finalize from canonical output; callers cannot supply score or publication state."""

    ensure_my_pick_schema(db_path)
    timestamp = _now()
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        work = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=? AND claim_token=?",
            (work_id, claim_token),
        ).fetchone()
        if work is None:
            raise ValueError("My Pick work is not owned by this claim")
        row = _canonical_row(connection, place_id)
        if row is None:
            raise ValueError("canonical pipeline did not produce a restaurant")
        status = _status_from_canonical(row)
        if status == "researching":
            raise ValueError("canonical pipeline result is not current and complete")
        connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET canonical_place_id=?, status=?, failure_code=NULL, retryable=0,
                claim_owner=NULL, claim_token=NULL, claimed_at=NULL, lease_expires_at=NULL,
                provider_request_count=provider_request_count+?, resolved_at=?, updated_at=?
            WHERE id=?
            """,
            (place_id, status, provider_requests, timestamp, timestamp, work_id),
        )
        refreshed = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
        ).fetchone()
        _ensure_review_item(
            connection,
            row=row,
            first_submitted_at=str(refreshed["first_submitted_at"]),
            latest_submitted_at=str(refreshed["last_submitted_at"]),
            submission_count=int(refreshed["submission_count"]),
            now=timestamp,
        )
        connection.commit()
    return dict(refreshed)


def fail_canonical_work(
    db_path: str | Path,
    work_id: str,
    claim_token: str,
    *,
    failure_code: str,
    retryable: bool,
    provider_requests: int = 0,
) -> dict[str, Any]:
    status = "failed_retryable" if retryable else "failed_terminal"
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET status=?, failure_code=?, retryable=?, provider_request_count=provider_request_count+?,
                claim_owner=NULL, claim_token=NULL, claimed_at=NULL, lease_expires_at=NULL,
                updated_at=?
            WHERE id=? AND claim_token=?
            """,
            (status, failure_code[:120], int(retryable), provider_requests, _now(), work_id, claim_token),
        )
        if cursor.rowcount != 1:
            raise ValueError("My Pick work is not owned by this claim")
        row = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
        ).fetchone()
        connection.commit()
    return dict(row)


def finish_canonical_work_status(
    db_path: str | Path,
    work_id: str,
    claim_token: str,
    *,
    status: Literal["outside_coverage", "needs_review"],
    failure_code: str,
    provider_requests: int = 0,
) -> dict[str, Any]:
    """Finish a claimed non-failure outcome without fabricating a score or location."""

    timestamp = _now()
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET status=?, failure_code=?, retryable=0,
                provider_request_count=provider_request_count+?,
                claim_owner=NULL, claim_token=NULL, claimed_at=NULL, lease_expires_at=NULL,
                resolved_at=?, updated_at=?
            WHERE id=? AND claim_token=?
            """,
            (
                status,
                failure_code[:120],
                provider_requests,
                timestamp,
                timestamp,
                work_id,
                claim_token,
            ),
        )
        if cursor.rowcount != 1:
            raise ValueError("My Pick work is not owned by this claim")
        row = connection.execute(
            "SELECT * FROM my_pick_canonical_work WHERE id=?", (work_id,)
        ).fetchone()
        connection.commit()
    return dict(row)


def run_my_pick_worker(
    db_path: str | Path,
    *,
    processor: Callable[[dict[str, Any]], str],
    worker_id: str,
    limit: int = 1,
    retry_failed: bool = False,
    work_id: str | None = None,
    lease_seconds: int = 900,
    on_update: Callable[[dict[str, Any]], None] | None = None,
    detailed: bool = False,
) -> dict[str, int]:
    """Claim shared jobs and delegate identity/research to the canonical pipeline adapter.

    ``processor`` must return a canonical place ID after it has used the existing
    ingestion/research/location/Quality-v4 path. This worker never accepts a
    numeric score from the adapter and never publishes a restaurant.
    """

    summary = {
        "jobs_claimed": 0,
        "completed": 0,
        "failed": 0,
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
        "ready": 0,
        "needs_location": 0,
        "outside_coverage": 0,
        "needs_review": 0,
        "failed_retryable": 0,
        "failed_terminal": 0,
        "review_queue_additions": 0,
        "provider_requests": 0,
        "web_search_actions": 0,
        "projection_sync_failures": 0,
    }

    def notify(row: dict[str, Any]) -> None:
        if on_update is None:
            return
        try:
            on_update(row)
        except Exception:  # noqa: BLE001 - projection failure must not poison canonical work.
            summary["projection_sync_failures"] += 1

    for _ in range(limit):
        job = claim_next_canonical_work(
            db_path,
            worker_id=worker_id,
            retry_failed=retry_failed,
            work_id=work_id,
            lease_seconds=lease_seconds,
        )
        if job is None:
            break
        summary["jobs_claimed"] += 1
        notify(job)
        before_reviews = 0
        if job.get("canonical_place_id"):
            before_reviews = recommendation_review_count(
                db_path, str(job["canonical_place_id"])
            )
        try:
            processed = processor(job)
            place_id = (
                str(processed.place_id)
                if hasattr(processed, "place_id")
                else str(processed)
            )
            counts = getattr(processed, "counts", {})
            for key in (
                "existing_identity_reused",
                "bootstrap_attempted",
                "bootstrap_with_name_address",
                "bootstrap_with_legacy_query",
                "bootstrap_identity_confirmed",
                "bootstrap_identity_ambiguous",
                "canonical_candidates_created",
                "duplicates_reused_after_bootstrap",
                "research_completed",
                "canonical_research_attempted",
                "canonical_research_completed",
                "location_attempted",
                "location_completed",
                "quality_v4_attempted",
                "quality_v4_completed",
                "provider_requests",
                "web_search_actions",
            ):
                summary[key] += int(counts.get(key, 0) or 0)
            completed_row = complete_canonical_work_from_catalog(
                db_path,
                str(job["id"]),
                str(job["claim_token"]),
                place_id=place_id,
                provider_requests=int(counts.get("provider_requests", 0) or 0),
            )
            summary["completed"] += 1
            summary[str(completed_row["status"])] += 1
            after_reviews = recommendation_review_count(db_path, place_id)
            summary["review_queue_additions"] += max(0, after_reviews - before_reviews)
            notify(completed_row)
        except Exception as exc:  # noqa: BLE001 - preserve each durable job independently.
            code = _safe_failure_code(exc)
            status = str(getattr(exc, "status", ""))
            error_counts = getattr(exc, "counts", {})
            for key in (
                "existing_identity_reused",
                "bootstrap_attempted",
                "bootstrap_with_name_address",
                "bootstrap_with_legacy_query",
                "bootstrap_identity_confirmed",
                "bootstrap_identity_ambiguous",
                "canonical_candidates_created",
                "duplicates_reused_after_bootstrap",
                "research_completed",
                "canonical_research_attempted",
                "canonical_research_completed",
                "location_attempted",
                "location_completed",
                "quality_v4_attempted",
                "quality_v4_completed",
            ):
                summary[key] += int(error_counts.get(key, 0) or 0)
            retryable = bool(
                getattr(exc, "retryable", not isinstance(exc, (ValueError, TypeError)))
            )
            provider_requests = int(
                getattr(exc, "provider_requests", 0) or 0
            )
            summary["provider_requests"] += provider_requests
            summary["web_search_actions"] += int(
                getattr(exc, "web_search_actions", 0) or 0
            )
            if status in {"outside_coverage", "needs_review"}:
                failed_row = finish_canonical_work_status(
                    db_path,
                    str(job["id"]),
                    str(job["claim_token"]),
                    status=status,  # type: ignore[arg-type]
                    failure_code=code,
                    provider_requests=provider_requests,
                )
                summary[status] += 1
            else:
                failed_row = fail_canonical_work(
                    db_path,
                    str(job["id"]),
                    str(job["claim_token"]),
                    failure_code=code,
                    retryable=retryable,
                    provider_requests=provider_requests,
                )
                failure_status = str(failed_row["status"])
                summary["failed"] += 1
                summary[failure_status] += 1
            logger.warning(
                "My Pick canonical work attempt did not complete",
                extra={
                    "my_pick_work_id": str(job["id"]),
                    "my_pick_status": str(failed_row["status"]),
                    "my_pick_failure_code": code,
                    "my_pick_retryable": retryable,
                },
            )
            notify(failed_row)
        if work_id is not None:
            break
    if not detailed:
        return {"completed": summary["completed"], "failed": summary["failed"]}
    return summary


def recommendation_review_count(db_path: str | Path, place_id: str) -> int:
    with connect_readonly(db_path) as connection:
        row = connection.execute(
            "SELECT COUNT(*) AS count FROM my_pick_recommendation_reviews WHERE canonical_place_id=?",
            (place_id,),
        ).fetchone()
    return int(row["count"])

