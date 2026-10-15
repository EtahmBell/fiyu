"""Durable, provider-neutral orchestration state for user-requested My Picks.

Account ownership lives in Supabase. This module owns only shared canonical work
and the internal editorial-review queue in the catalog SQLite database. It does
not calculate scores: workers must run the existing canonical pipeline and then
finalize a job from the resulting ``public_restaurants`` row.
"""

from __future__ import annotations

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

MY_PICK_SCHEMA_VERSION = "my-pick-orchestration-v1"
MY_PICK_WORK_SCHEMA = """
CREATE TABLE IF NOT EXISTS my_pick_canonical_work (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    external_place_id TEXT NOT NULL,
    display_name_hint TEXT,
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


def ensure_my_pick_schema(db_path: str | Path) -> None:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        connection.executescript(MY_PICK_WORK_SCHEMA)
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
    work_id: str | None = None,
    now: datetime | None = None,
) -> tuple[dict[str, Any], bool]:
    """Atomically reuse shared work for the same external restaurant identity."""

    provider, external_place_id = normalize_external_identity(provider, external_place_id)
    hint = (display_name_hint or "").strip()[:200] or None
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
                WHERE id=?
                """,
                (timestamp, timestamp, hint, existing["id"]),
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
                id, provider, external_place_id, display_name_hint, canonical_place_id,
                status, first_submitted_at, last_submitted_at, resolved_at,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                work_id,
                provider,
                external_place_id,
                hint,
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
    map_ready = is_map_ready(row) and _trusted_coverage(row) is True
    score_current = _current_score(row)
    return {
        "place_id": str(row["place_id"]),
        "name_ja": row.get("name_ja"),
        "name_en": row.get("name_en") or row.get("candidate_title"),
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
        "new_canonical_identities_created": 0,
        "research_completed": 0,
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
                "new_canonical_identities_created",
                "research_completed",
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
            code = str(getattr(exc, "code", type(exc).__name__))
            status = str(getattr(exc, "status", ""))
            error_counts = getattr(exc, "counts", {})
            for key in (
                "existing_identity_reused",
                "new_canonical_identities_created",
                "research_completed",
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

