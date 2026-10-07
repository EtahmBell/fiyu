from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .database import connect

PIPELINE_RUN_SCHEMA_VERSION = "pipeline-run-ledger-v1"

PIPELINE_RUN_SCHEMA = """
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'pending', 'running', 'completed', 'completed_with_failures', 'failed', 'cancelled'
    )),
    selector_json TEXT NOT NULL,
    config_json TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    input_fingerprint TEXT NOT NULL,
    requested_item_count INTEGER NOT NULL,
    selected_item_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    retryable_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    provider_request_count INTEGER NOT NULL DEFAULT 0,
    web_search_action_count INTEGER NOT NULL DEFAULT 0,
    input_token_count INTEGER NOT NULL DEFAULT 0,
    output_token_count INTEGER NOT NULL DEFAULT 0,
    total_token_count INTEGER NOT NULL DEFAULT 0,
    parent_run_id INTEGER,
    operator_notes TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (parent_run_id) REFERENCES pipeline_runs(id)
);

CREATE TABLE IF NOT EXISTS pipeline_run_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    item_key TEXT NOT NULL,
    place_id TEXT,
    work_key TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN (
        'pending', 'claimed', 'running', 'succeeded',
        'failed_retryable', 'failed_terminal', 'skipped'
    )),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    claim_owner TEXT,
    claim_token TEXT,
    claimed_at TEXT,
    lease_expires_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    failure_class TEXT,
    failure_message TEXT,
    retryable INTEGER NOT NULL DEFAULT 0,
    result_reference_json TEXT NOT NULL DEFAULT '{}',
    provider_request_count INTEGER NOT NULL DEFAULT 0,
    web_search_action_count INTEGER NOT NULL DEFAULT 0,
    input_token_count INTEGER NOT NULL DEFAULT 0,
    output_token_count INTEGER NOT NULL DEFAULT 0,
    total_token_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id),
    UNIQUE (run_id, item_key),
    UNIQUE (run_id, ordinal)
);

CREATE TABLE IF NOT EXISTS pipeline_run_item_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_item_id INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL,
    claim_owner TEXT NOT NULL,
    claim_token TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN (
        'claimed', 'running', 'succeeded', 'failed_retryable',
        'failed_terminal', 'abandoned'
    )),
    claimed_at TEXT NOT NULL,
    lease_expires_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    failure_class TEXT,
    failure_message TEXT,
    result_reference_json TEXT NOT NULL DEFAULT '{}',
    provider_request_count INTEGER NOT NULL DEFAULT 0,
    web_search_action_count INTEGER NOT NULL DEFAULT 0,
    input_token_count INTEGER NOT NULL DEFAULT 0,
    output_token_count INTEGER NOT NULL DEFAULT 0,
    total_token_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (run_item_id) REFERENCES pipeline_run_items(id),
    UNIQUE (run_item_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_run_items_claim
    ON pipeline_run_items(run_id, state, ordinal);
CREATE INDEX IF NOT EXISTS idx_pipeline_run_items_work
    ON pipeline_run_items(work_key, item_key, state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_run_items_active_work
    ON pipeline_run_items(work_key, item_key)
    WHERE state IN ('claimed', 'running');
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_run_items_succeeded_work
    ON pipeline_run_items(work_key, item_key)
    WHERE state = 'succeeded';
"""


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _timestamp(value: datetime | None = None) -> str:
    return (value or _utc_now()).isoformat()


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def ensure_pipeline_run_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(PIPELINE_RUN_SCHEMA)
        connection.commit()


def create_pipeline_run(
    db_path: str | Path,
    *,
    run_type: str,
    item_keys: Iterable[str],
    work_key: str,
    selector: dict[str, object],
    config: dict[str, object],
    requested_item_count: int,
    parent_run_id: int | None = None,
    operator_notes: str | None = None,
) -> int:
    items = [str(item) for item in item_keys]
    if len(items) != len(set(items)):
        raise ValueError("pipeline run selection contains duplicate item keys")
    if requested_item_count < len(items):
        raise ValueError("requested item count cannot be smaller than the frozen selection")
    ensure_pipeline_run_schema(db_path)
    selector_json = _canonical_json(selector)
    config_json = _canonical_json(config)
    fingerprint = hashlib.sha256(
        _canonical_json(
            {
                "run_type": run_type,
                "items": items,
                "work_key": work_key,
                "selector": selector,
                "config": config,
                "schema_version": PIPELINE_RUN_SCHEMA_VERSION,
            }
        ).encode("utf-8")
    ).hexdigest()
    now = _timestamp()
    status = "pending" if items else "completed"
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        cursor = connection.execute(
            """
            INSERT INTO pipeline_runs (
                run_type, status, selector_json, config_json, schema_version,
                input_fingerprint, requested_item_count, selected_item_count,
                parent_run_id, operator_notes, created_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_type,
                status,
                selector_json,
                config_json,
                PIPELINE_RUN_SCHEMA_VERSION,
                fingerprint,
                requested_item_count,
                len(items),
                parent_run_id,
                operator_notes,
                now,
                now if not items else None,
            ),
        )
        run_id = int(cursor.lastrowid)
        connection.executemany(
            """
            INSERT INTO pipeline_run_items (
                run_id, item_key, place_id, work_key, ordinal, state
            ) VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            ((run_id, item, item, work_key, ordinal) for ordinal, item in enumerate(items, 1)),
        )
        connection.commit()
    return run_id


def _refresh_run(connection: Any, run_id: int, *, now: str | None = None) -> None:
    counts = connection.execute(
        """
        SELECT
            COUNT(*) AS selected,
            SUM(state = 'succeeded') AS succeeded,
            SUM(state = 'failed_retryable') AS retryable,
            SUM(state = 'failed_terminal') AS terminal,
            SUM(state = 'skipped') AS skipped,
            SUM(state = 'pending') AS pending,
            SUM(state IN ('claimed', 'running')) AS active,
            SUM(attempt_count) AS attempts,
            SUM(provider_request_count) AS requests,
            SUM(web_search_action_count) AS web_actions,
            SUM(input_token_count) AS input_tokens,
            SUM(output_token_count) AS output_tokens,
            SUM(total_token_count) AS total_tokens
        FROM pipeline_run_items WHERE run_id = ?
        """,
        (run_id,),
    ).fetchone()
    if counts is None:
        raise ValueError(f"Unknown pipeline run: {run_id}")
    pending = int(counts["pending"] or 0)
    active = int(counts["active"] or 0)
    failures = int(counts["retryable"] or 0) + int(counts["terminal"] or 0)
    if pending or active:
        status = "running" if int(counts["attempts"] or 0) else "pending"
        completed_at = None
    else:
        status = "completed_with_failures" if failures else "completed"
        completed_at = now or _timestamp()
    connection.execute(
        """
        UPDATE pipeline_runs
        SET status=?, completed_count=?, failed_count=?, retryable_count=?, skipped_count=?,
            provider_request_count=?, web_search_action_count=?, input_token_count=?,
            output_token_count=?, total_token_count=?, completed_at=?
        WHERE id=? AND status NOT IN ('failed', 'cancelled')
        """,
        (
            status,
            int(counts["succeeded"] or 0),
            failures,
            int(counts["retryable"] or 0),
            int(counts["skipped"] or 0),
            int(counts["requests"] or 0),
            int(counts["web_actions"] or 0),
            int(counts["input_tokens"] or 0),
            int(counts["output_tokens"] or 0),
            int(counts["total_tokens"] or 0),
            completed_at,
            run_id,
        ),
    )


def _equivalent_standard_research_complete(
    connection: Any, *, place_id: str, config: dict[str, object]
) -> int | None:
    row = connection.execute(
        """
        SELECT id FROM restaurant_research_runs
        WHERE public_restaurant_id=? AND status='complete'
          AND prompt_version=? AND pipeline_version=? AND model=?
        ORDER BY id DESC LIMIT 1
        """,
        (
            place_id,
            config.get("prompt_version"),
            config.get("pipeline_version"),
            config.get("model"),
        ),
    ).fetchone()
    return int(row["id"]) if row else None


def claim_next_pipeline_item(
    db_path: str | Path,
    run_id: int,
    *,
    worker_id: str,
    lease_seconds: int = 900,
    retry_failed: bool = False,
    reclaim_stale: bool = True,
    exclude_item_ids: Iterable[int] = (),
    now: datetime | None = None,
) -> dict[str, object] | None:
    if lease_seconds < 1:
        raise ValueError("lease_seconds must be positive")
    ensure_pipeline_run_schema(db_path)
    current = now or _utc_now()
    now_text = _timestamp(current)
    lease_text = _timestamp(current + timedelta(seconds=lease_seconds))
    eligible_states = ["pending"]
    if retry_failed:
        eligible_states.append("failed_retryable")
    if reclaim_stale:
        eligible_states.extend(("claimed", "running"))
    placeholders = ",".join("?" for _ in eligible_states)
    excluded = list(exclude_item_ids)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        run = connection.execute("SELECT * FROM pipeline_runs WHERE id=?", (run_id,)).fetchone()
        if run is None:
            raise ValueError(f"Unknown pipeline run: {run_id}")
        if run["status"] in {"failed", "cancelled", "completed"}:
            connection.commit()
            return None
        config = json.loads(run["config_json"])
        while True:
            exclusion_sql = ""
            parameters: list[object] = [run_id, *eligible_states, now_text]
            if excluded:
                exclusion_sql = f" AND id NOT IN ({','.join('?' for _ in excluded)})"
                parameters.extend(excluded)
            item = connection.execute(
                f"""
                SELECT * FROM pipeline_run_items
                WHERE run_id=? AND state IN ({placeholders})
                  AND (state NOT IN ('claimed', 'running') OR lease_expires_at <= ?)
                  {exclusion_sql}
                ORDER BY ordinal LIMIT 1
                """,
                parameters,
            ).fetchone()
            if item is None:
                _refresh_run(connection, run_id, now=now_text)
                connection.commit()
                return None

            item_id = int(item["id"])
            place_id = str(item["place_id"] or item["item_key"])
            existing_success = connection.execute(
                """
                SELECT id FROM pipeline_run_items
                WHERE work_key=? AND item_key=? AND state='succeeded' AND id<>?
                LIMIT 1
                """,
                (item["work_key"], item["item_key"], item_id),
            ).fetchone()
            research_run_id = None
            if run["run_type"] == "standard_restaurant_research":
                research_run_id = _equivalent_standard_research_complete(
                    connection, place_id=place_id, config=config
                )
            if existing_success or research_run_id is not None:
                reference = {
                    "reason": "equivalent_research_already_complete",
                    "pipeline_run_item_id": int(existing_success["id"])
                    if existing_success
                    else None,
                    "restaurant_research_run_id": research_run_id,
                }
                connection.execute(
                    """
                    UPDATE pipeline_run_items
                    SET state='skipped', completed_at=?, retryable=0,
                        result_reference_json=?
                    WHERE id=?
                    """,
                    (now_text, _canonical_json(reference), item_id),
                )
                continue

            active_duplicate = connection.execute(
                """
                SELECT id FROM pipeline_run_items
                WHERE work_key=? AND item_key=? AND state IN ('claimed', 'running') AND id<>?
                LIMIT 1
                """,
                (item["work_key"], item["item_key"], item_id),
            ).fetchone()
            if active_duplicate is not None:
                excluded.append(item_id)
                continue

            if item["state"] in {"claimed", "running"}:
                connection.execute(
                    """
                    UPDATE pipeline_run_item_attempts
                    SET state='abandoned', completed_at=?, failure_class='stale_claim_reclaimed',
                        failure_message='Claim lease expired before local completion was recorded.'
                    WHERE run_item_id=? AND claim_token=? AND state IN ('claimed', 'running')
                    """,
                    (now_text, item_id, item["claim_token"]),
                )

            token = uuid.uuid4().hex
            attempt = int(item["attempt_count"]) + 1
            connection.execute(
                """
                UPDATE pipeline_run_items
                SET state='claimed', attempt_count=?, claim_owner=?, claim_token=?,
                    claimed_at=?, lease_expires_at=?, started_at=NULL, completed_at=NULL,
                    failure_class=NULL, failure_message=NULL, retryable=0
                WHERE id=?
                """,
                (attempt, worker_id, token, now_text, lease_text, item_id),
            )
            connection.execute(
                """
                INSERT INTO pipeline_run_item_attempts (
                    run_item_id, attempt_number, claim_owner, claim_token, state,
                    claimed_at, lease_expires_at
                ) VALUES (?, ?, ?, ?, 'claimed', ?, ?)
                """,
                (item_id, attempt, worker_id, token, now_text, lease_text),
            )
            connection.execute(
                """
                UPDATE pipeline_runs
                SET status='running', started_at=COALESCE(started_at, ?), completed_at=NULL
                WHERE id=?
                """,
                (now_text, run_id),
            )
            connection.commit()
            return {
                "id": item_id,
                "run_id": run_id,
                "item_key": str(item["item_key"]),
                "place_id": place_id,
                "ordinal": int(item["ordinal"]),
                "attempt_count": attempt,
                "claim_owner": worker_id,
                "claim_token": token,
                "lease_expires_at": lease_text,
            }


def mark_pipeline_item_running(
    db_path: str | Path,
    item_id: int,
    claim_token: str,
    *,
    provider_request_started: bool = False,
    now: datetime | None = None,
) -> None:
    now_text = _timestamp(now)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        cursor = connection.execute(
            """
            UPDATE pipeline_run_items
            SET state='running', started_at=?,
                provider_request_count=provider_request_count+?
            WHERE id=? AND claim_token=? AND state='claimed'
            """,
            (now_text, int(provider_request_started), item_id, claim_token),
        )
        if cursor.rowcount != 1:
            raise ValueError("pipeline item is not owned by this claim or cannot enter running")
        connection.execute(
            """
            UPDATE pipeline_run_item_attempts
            SET state='running', started_at=?, provider_request_count=?
            WHERE run_item_id=? AND claim_token=? AND state='claimed'
            """,
            (now_text, int(provider_request_started), item_id, claim_token),
        )
        if provider_request_started:
            connection.execute(
                """
                UPDATE pipeline_runs
                SET provider_request_count=provider_request_count+1
                WHERE id=(SELECT run_id FROM pipeline_run_items WHERE id=?)
                """,
                (item_id,),
            )
        connection.commit()


def finish_pipeline_item(
    db_path: str | Path,
    item_id: int,
    claim_token: str,
    *,
    state: str,
    failure_class: str | None = None,
    failure_message: str | None = None,
    result_reference: dict[str, object] | None = None,
    provider_requests: int = 0,
    web_search_actions: int = 0,
    token_usage: dict[str, int] | None = None,
    now: datetime | None = None,
) -> None:
    if state not in {"succeeded", "failed_retryable", "failed_terminal"}:
        raise ValueError("invalid terminal pipeline item state")
    if state.startswith("failed") and not failure_class:
        raise ValueError("failed pipeline items require a failure class")
    now_text = _timestamp(now)
    usage = token_usage or {}
    reference_json = _canonical_json(result_reference or {})
    retryable = int(state == "failed_retryable")
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        item = connection.execute(
            """
            SELECT run_id FROM pipeline_run_items
            WHERE id=? AND claim_token=? AND state IN ('claimed', 'running')
            """,
            (item_id, claim_token),
        ).fetchone()
        if item is None:
            raise ValueError("pipeline item is not running under this claim")
        values = (
            state,
            now_text,
            failure_class,
            (failure_message or "")[:2000] or None,
            retryable,
            reference_json,
            provider_requests,
            web_search_actions,
            int(usage.get("input_tokens", 0) or 0),
            int(usage.get("output_tokens", 0) or 0),
            int(usage.get("total_tokens", 0) or 0),
            item_id,
            claim_token,
        )
        connection.execute(
            """
            UPDATE pipeline_run_items
            SET state=?, completed_at=?, failure_class=?, failure_message=?, retryable=?,
                result_reference_json=?, provider_request_count=provider_request_count+?,
                web_search_action_count=web_search_action_count+?,
                input_token_count=input_token_count+?, output_token_count=output_token_count+?,
                total_token_count=total_token_count+?
            WHERE id=? AND claim_token=?
            """,
            values,
        )
        connection.execute(
            """
            UPDATE pipeline_run_item_attempts
            SET state=?, completed_at=?, failure_class=?, failure_message=?,
                result_reference_json=?,
                provider_request_count=provider_request_count+?,
                web_search_action_count=web_search_action_count+?,
                input_token_count=input_token_count+?, output_token_count=output_token_count+?,
                total_token_count=total_token_count+?
            WHERE run_item_id=? AND claim_token=? AND state IN ('claimed', 'running')
            """,
            (
                state,
                now_text,
                failure_class,
                (failure_message or "")[:2000] or None,
                reference_json,
                provider_requests,
                web_search_actions,
                int(usage.get("input_tokens", 0) or 0),
                int(usage.get("output_tokens", 0) or 0),
                int(usage.get("total_tokens", 0) or 0),
                item_id,
                claim_token,
            ),
        )
        _refresh_run(connection, int(item["run_id"]), now=now_text)
        connection.commit()


def finalize_pipeline_run(db_path: str | Path, run_id: int) -> dict[str, object]:
    ensure_pipeline_run_schema(db_path)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        if (
            connection.execute("SELECT 1 FROM pipeline_runs WHERE id=?", (run_id,)).fetchone()
            is None
        ):
            raise ValueError(f"Unknown pipeline run: {run_id}")
        _refresh_run(connection, run_id)
        connection.commit()
    return get_pipeline_run_status(db_path, run_id)


def get_pipeline_run_status(db_path: str | Path, run_id: int) -> dict[str, object]:
    ensure_pipeline_run_schema(db_path)
    with connect(db_path) as connection:
        run = connection.execute("SELECT * FROM pipeline_runs WHERE id=?", (run_id,)).fetchone()
        if run is None:
            raise ValueError(f"Unknown pipeline run: {run_id}")
        states = {
            str(row["state"]): int(row["count"])
            for row in connection.execute(
                "SELECT state, COUNT(*) AS count FROM pipeline_run_items WHERE run_id=? GROUP BY state",
                (run_id,),
            )
        }
        attempts = connection.execute(
            "SELECT COALESCE(SUM(attempt_count), 0) FROM pipeline_run_items WHERE run_id=?",
            (run_id,),
        ).fetchone()[0]
    return {
        "run_id": int(run["id"]),
        "run_type": str(run["run_type"]),
        "status": str(run["status"]),
        "selected": int(run["selected_item_count"]),
        "pending": states.get("pending", 0),
        "claimed": states.get("claimed", 0),
        "running": states.get("running", 0),
        "succeeded": states.get("succeeded", 0),
        "failed_retryable": states.get("failed_retryable", 0),
        "failed_terminal": states.get("failed_terminal", 0),
        "skipped": states.get("skipped", 0),
        "attempts": int(attempts),
        "provider_requests": int(run["provider_request_count"]),
        "web_search_actions": int(run["web_search_action_count"]),
        "input_tokens": int(run["input_token_count"]),
        "output_tokens": int(run["output_token_count"]),
        "total_tokens": int(run["total_token_count"]),
        "created_at": run["created_at"],
        "started_at": run["started_at"],
        "completed_at": run["completed_at"],
        "input_fingerprint": str(run["input_fingerprint"]),
        "selector": json.loads(run["selector_json"]),
        "config": json.loads(run["config_json"]),
    }


def get_pipeline_run_item(db_path: str | Path, item_id: int) -> dict[str, Any]:
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM pipeline_run_items WHERE id=?", (item_id,)
        ).fetchone()
    if row is None:
        raise ValueError(f"Unknown pipeline run item: {item_id}")
    return dict(row)
