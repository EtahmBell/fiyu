"""Source-scoped, additive candidate ingestion.

Source observations are durable. ``restaurants`` remains the deterministic
downstream projection and is upserted by Place ID without renumbering existing
rows or touching public/research state.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import statistics
from datetime import UTC, datetime
from pathlib import Path

from .columns import raw_record_from_row
from .config import ScoringConfig
from .database import (
    INSERT_COLUMNS,
    SCHEMA,
    _row_values,
    connect,
    connect_readonly,
    decode_restaurant_row,
)
from .normalize import CleaningStats, add_chain_features, clean_and_dedupe, merge_records
from .readers import iter_input_files, iter_rows
from .scoring import score_records

SOURCE_INGESTION_SCHEMA = """
CREATE TABLE IF NOT EXISTS candidate_source_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    input_fingerprint TEXT,
    input_files_json TEXT NOT NULL DEFAULT '[]',
    scoring_config_json TEXT NOT NULL DEFAULT '{}',
    total_rows_seen INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    invalid_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    new_candidates INTEGER NOT NULL DEFAULT 0,
    updated_candidates INTEGER NOT NULL DEFAULT 0,
    unchanged_candidates INTEGER NOT NULL DEFAULT 0,
    source_local_missing INTEGER NOT NULL DEFAULT 0,
    impact_json TEXT NOT NULL DEFAULT '{}',
    error_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_candidate_source_runs_source
    ON candidate_source_runs(source_key, started_at DESC);

CREATE TABLE IF NOT EXISTS candidate_source_observations (
    source_key TEXT NOT NULL,
    place_id TEXT NOT NULL,
    source_record_key TEXT NOT NULL,
    normalized_candidate_json TEXT NOT NULL,
    record_fingerprint TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    first_seen_run_id INTEGER NOT NULL,
    last_seen_run_id INTEGER NOT NULL,
    seen_in_latest_run INTEGER NOT NULL DEFAULT 1 CHECK (seen_in_latest_run IN (0, 1)),
    PRIMARY KEY (source_key, place_id),
    FOREIGN KEY (first_seen_run_id) REFERENCES candidate_source_runs(id),
    FOREIGN KEY (last_seen_run_id) REFERENCES candidate_source_runs(id)
);
CREATE INDEX IF NOT EXISTS idx_candidate_source_observations_place
    ON candidate_source_observations(place_id, source_key);
CREATE INDEX IF NOT EXISTS idx_candidate_source_observations_latest
    ON candidate_source_observations(source_key, seen_in_latest_run, place_id);
"""

_SOURCE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")

_OBSERVATION_FIELDS = (
    "place_id",
    "cid",
    "fid",
    "title",
    "address",
    "street",
    "city",
    "state",
    "postal_code",
    "neighborhood",
    "latitude",
    "longitude",
    "search_area",
    "category",
    "categories",
    "rating",
    "review_count",
    "website",
    "phone",
    "price",
    "maps_url",
    "image_url",
    "scraped_at",
    "source_areas",
    "source_files",
    "source_file",
    "language",
    "country_code",
    "broad_category",
)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _json_value(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_json_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    return value


def _observation_payload(record: dict[str, object]) -> dict[str, object]:
    return {
        field: _json_value(record.get(field))
        for field in _OBSERVATION_FIELDS
        if field in record
    }


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _fingerprint(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _input_fingerprint(
    files: list[Path], *, source_key: str, config: ScoringConfig, include_all_categories: bool
) -> str:
    digest = hashlib.sha256()
    digest.update(source_key.encode("utf-8"))
    digest.update(_canonical_json(config.to_dict()).encode("utf-8"))
    digest.update(str(int(include_all_categories)).encode("ascii"))
    for path in files:
        digest.update(path.name.encode("utf-8"))
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


def ensure_source_ingestion_schema(db_path: str | Path) -> None:
    """Create additive source-ingestion tables without changing candidate data."""

    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.executescript(SOURCE_INGESTION_SCHEMA)
        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(candidate_source_runs)")
        }
        if "impact_json" not in columns:
            connection.execute(
                "ALTER TABLE candidate_source_runs "
                "ADD COLUMN impact_json TEXT NOT NULL DEFAULT '{}'"
            )
        connection.commit()


def _candidate_selection_snapshot(connection: sqlite3.Connection) -> dict[str, tuple[float, bool]]:
    """Capture cheap score/default seed eligibility for impact-only comparison."""

    return {
        str(row["place_id"]): (
            float(row["internal_fiyu_score"] or 0),
            bool(row["candidate_eligible"])
            and float(row["internal_fiyu_score"] or 0) >= 60.0,
        )
        for row in connection.execute(
            "SELECT place_id, internal_fiyu_score, candidate_eligible FROM restaurants "
            "WHERE place_id IS NOT NULL AND TRIM(place_id)!=''"
        )
    }


def _source_impact(
    before: dict[str, tuple[float, bool]],
    after: dict[str, tuple[float, bool]],
    *,
    source_updated_candidates: int,
) -> dict[str, object]:
    shared = sorted(before.keys() & after.keys())
    deltas = {
        place_id: after[place_id][0] - before[place_id][0]
        for place_id in shared
        if abs(after[place_id][0] - before[place_id][0]) > 1e-9
    }
    absolute_deltas = [abs(value) for value in deltas.values()]
    became_eligible = [
        place_id for place_id in shared if not before[place_id][1] and after[place_id][1]
    ]
    became_ineligible = [
        place_id for place_id in shared if before[place_id][1] and not after[place_id][1]
    ]
    remained_eligible = [
        place_id for place_id in shared if before[place_id][1] and after[place_id][1]
    ]
    remained_ineligible = [
        place_id for place_id in shared if not before[place_id][1] and not after[place_id][1]
    ]
    new_ids = sorted(after.keys() - before.keys())
    return {
        "canonical_candidates_before": len(before),
        "canonical_candidates_after": len(after),
        "new_candidates": len(new_ids),
        "source_updated_candidates": source_updated_candidates,
        "unchanged_candidates": max(
            0, len(after) - len(new_ids) - source_updated_candidates
        ),
        "cheap_score": {
            "scores_changed": len(deltas),
            "median_absolute_delta": round(statistics.median(absolute_deltas), 6)
            if absolute_deltas
            else 0.0,
            "max_absolute_delta": round(max(absolute_deltas), 6)
            if absolute_deltas
            else 0.0,
            "became_seed_eligible": len(became_eligible),
            "became_seed_ineligible": len(became_ineligible),
            "remained_seed_eligible": len(remained_eligible),
            "remained_seed_ineligible": len(remained_ineligible),
            "new_seed_eligible": sum(after[place_id][1] for place_id in new_ids),
            "became_seed_eligible_place_ids": became_eligible,
            "became_seed_ineligible_place_ids": became_ineligible,
            "score_changed_place_ids": sorted(deltas),
        },
        "seed_criteria": {
            "candidate_eligible": True,
            "minimum_internal_score": 60.0,
        },
    }


def _start_run(
    db_path: str | Path,
    *,
    source_key: str,
    input_paths: list[str | Path],
    config: ScoringConfig,
) -> int:
    ensure_source_ingestion_schema(db_path)
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO candidate_source_runs (
                source_key, status, started_at, input_files_json, scoring_config_json
            ) VALUES (?, 'running', ?, ?, ?)
            """,
            (
                source_key,
                _utc_now(),
                json.dumps([str(path) for path in input_paths], ensure_ascii=False),
                json.dumps(config.to_dict(), ensure_ascii=False, sort_keys=True),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)


def _fail_run(db_path: str | Path, run_id: int, exc: BaseException) -> None:
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE candidate_source_runs
            SET status='failed', completed_at=?, error_summary=?
            WHERE id=?
            """,
            (_utc_now(), f"{type(exc).__name__}: {exc}", run_id),
        )
        connection.commit()


def _legacy_candidate(row: sqlite3.Row) -> dict[str, object]:
    candidate = decode_restaurant_row(row)
    source_files = list(candidate.get("source_files") or [])
    candidate.update(
        {
            "categories": [candidate["category"]] if candidate.get("category") else [],
            "source_file": source_files[0] if source_files else "legacy-candidate",
            "permanently_closed": False,
            "temporarily_closed": False,
            "is_advertisement": False,
        }
    )
    return candidate


def _materialized_candidates(connection: sqlite3.Connection) -> list[dict[str, object]]:
    observation_rows = connection.execute(
        """
        SELECT source_key, place_id, normalized_candidate_json
        FROM candidate_source_observations
        ORDER BY source_key, place_id
        """
    ).fetchall()
    observed_place_ids: set[str] = set()
    merged: dict[str, dict[str, object]] = {}
    for row in observation_rows:
        record = json.loads(str(row["normalized_candidate_json"]))
        place_id = str(row["place_id"])
        observed_place_ids.add(place_id)
        if place_id in merged:
            merged[place_id] = merge_records(merged[place_id], record)
        else:
            merged[place_id] = record

    for row in connection.execute("SELECT * FROM restaurants ORDER BY id"):
        place_id = str(row["place_id"] or "").strip()
        if not place_id or place_id in observed_place_ids:
            continue
        merged[place_id] = _legacy_candidate(row)

    records = [merged[place_id] for place_id in sorted(merged)]
    return records


def _upsert_observations(
    connection: sqlite3.Connection,
    *,
    source_key: str,
    run_id: int,
    records: list[dict[str, object]],
    now: str,
) -> dict[str, int]:
    existing = {
        str(row["place_id"]): str(row["record_fingerprint"])
        for row in connection.execute(
            """
            SELECT place_id, record_fingerprint
            FROM candidate_source_observations
            WHERE source_key=?
            """,
            (source_key,),
        )
    }
    connection.execute(
        """
        UPDATE candidate_source_observations
        SET seen_in_latest_run=0
        WHERE source_key=?
        """,
        (source_key,),
    )

    created = updated = unchanged = 0
    current_ids: set[str] = set()
    for record in records:
        place_id = str(record["place_id"])
        current_ids.add(place_id)
        payload = _observation_payload(record)
        payload_json = _canonical_json(payload)
        fingerprint = _fingerprint(payload)
        previous = existing.get(place_id)
        if previous is None:
            created += 1
        elif previous == fingerprint:
            unchanged += 1
        else:
            updated += 1
        connection.execute(
            """
            INSERT INTO candidate_source_observations (
                source_key, place_id, source_record_key,
                normalized_candidate_json, record_fingerprint,
                first_seen_at, last_seen_at, first_seen_run_id,
                last_seen_run_id, seen_in_latest_run
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(source_key, place_id) DO UPDATE SET
                source_record_key=excluded.source_record_key,
                normalized_candidate_json=excluded.normalized_candidate_json,
                record_fingerprint=excluded.record_fingerprint,
                last_seen_at=excluded.last_seen_at,
                last_seen_run_id=excluded.last_seen_run_id,
                seen_in_latest_run=1
            """,
            (
                source_key,
                place_id,
                place_id,
                payload_json,
                fingerprint,
                now,
                now,
                run_id,
                run_id,
            ),
        )
    return {
        "new_observations": created,
        "updated_observations": updated,
        "unchanged_observations": unchanged,
        "source_local_missing": len(set(existing) - current_ids),
    }


def _upsert_canonical_candidates(
    connection: sqlite3.Connection,
    records: list[dict[str, object]],
) -> tuple[int, int]:
    duplicates = connection.execute(
        """
        SELECT place_id, COUNT(*) AS count
        FROM restaurants
        WHERE place_id IS NOT NULL AND TRIM(place_id)!=''
        GROUP BY place_id HAVING COUNT(*)>1
        LIMIT 1
        """
    ).fetchone()
    if duplicates is not None:
        raise ValueError(f"canonical candidate Place ID is duplicated: {duplicates['place_id']}")

    existing_ids = {
        str(row["place_id"]): int(row["id"])
        for row in connection.execute(
            "SELECT id, place_id FROM restaurants WHERE place_id IS NOT NULL"
        )
    }
    assignments = ", ".join(f"{column}=?" for column in INSERT_COLUMNS)
    placeholders = ", ".join("?" for _ in INSERT_COLUMNS)
    columns = ", ".join(INSERT_COLUMNS)
    inserted = updated = 0
    for record in records:
        values = _row_values(record)
        place_id = str(record["place_id"])
        if place_id in existing_ids:
            connection.execute(
                f"UPDATE restaurants SET {assignments} WHERE id=?",
                (*values, existing_ids[place_id]),
            )
            updated += 1
        else:
            connection.execute(
                f"INSERT INTO restaurants ({columns}) VALUES ({placeholders})",
                values,
            )
            inserted += 1
    return inserted, updated


def _prepare_records(
    files: list[Path], *, include_all_categories: bool
) -> tuple[list[dict[str, object]], CleaningStats, int]:
    normalized = (
        raw_record_from_row(row, str(path)) for path in files for row in iter_rows(path)
    )
    records, stats = clean_and_dedupe(
        normalized, include_all_categories=include_all_categories
    )
    without_place_id = sum(not str(record.get("place_id") or "").strip() for record in records)
    records = [record for record in records if str(record.get("place_id") or "").strip()]
    stats.invalid_rows += without_place_id
    stats.output_rows = len(records)
    if not records:
        raise ValueError("source snapshot contains no valid candidates with a Place ID")
    return records, stats, without_place_id


def run_source_ingestion(
    input_paths: list[str | Path],
    *,
    source_key: str,
    db_path: str | Path,
    csv_output: str | Path | None,
    config: ScoringConfig,
    include_all_categories: bool = False,
) -> dict[str, object]:
    """Import one complete source snapshot without deleting unrelated candidates."""

    source_key = source_key.strip()
    if not _SOURCE_KEY.fullmatch(source_key):
        raise ValueError(
            "source_key must be 1-128 characters using letters, numbers, '.', '_', ':', '/', or '-'"
        )
    run_id = _start_run(
        db_path,
        source_key=source_key,
        input_paths=input_paths,
        config=config,
    )
    try:
        files = iter_input_files(input_paths)
        input_fingerprint = _input_fingerprint(
            files,
            source_key=source_key,
            config=config,
            include_all_categories=include_all_categories,
        )
        source_records, cleaning_stats, _ = _prepare_records(
            files, include_all_categories=include_all_categories
        )
        now = _utc_now()
        with connect(db_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            selection_before = _candidate_selection_snapshot(connection)
            observation_counts = _upsert_observations(
                connection,
                source_key=source_key,
                run_id=run_id,
                records=source_records,
                now=now,
            )
            materialized = _materialized_candidates(connection)
            add_chain_features(
                materialized,
                config.chain_title_threshold,
                config.chain_domain_threshold,
            )
            score_records(materialized, config)
            inserted, _ = _upsert_canonical_candidates(connection, materialized)
            unchanged_candidates = observation_counts["unchanged_observations"]
            updated_candidates = max(
                0, len(source_records) - inserted - unchanged_candidates
            )
            selection_after = _candidate_selection_snapshot(connection)
            impact = _source_impact(
                selection_before,
                selection_after,
                source_updated_candidates=updated_candidates,
            )
            if csv_output:
                from .ingest import export_csv

                export_csv(materialized, csv_output)
            metadata = {
                "generated_at": now,
                "restaurant_count": str(
                    connection.execute("SELECT COUNT(*) FROM restaurants").fetchone()[0]
                ),
                "scoring_config": json.dumps(config.to_dict(), ensure_ascii=False),
                "score_status": "internal_provisional",
                "last_candidate_source_run_id": str(run_id),
            }
            connection.executemany(
                "INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)",
                metadata.items(),
            )
            connection.execute(
                """
                UPDATE candidate_source_runs
                SET status='complete', completed_at=?, input_fingerprint=?,
                    input_files_json=?, total_rows_seen=?, valid_rows=?, invalid_rows=?,
                    duplicate_rows=?, new_candidates=?, updated_candidates=?,
                    unchanged_candidates=?, source_local_missing=?, error_summary=NULL,
                    impact_json=?
                WHERE id=?
                """,
                (
                    now,
                    input_fingerprint,
                    json.dumps([str(path) for path in files], ensure_ascii=False),
                    cleaning_stats.input_rows,
                    cleaning_stats.output_rows,
                    cleaning_stats.invalid_rows,
                    cleaning_stats.duplicate_rows,
                    inserted,
                    updated_candidates,
                    unchanged_candidates,
                    observation_counts["source_local_missing"],
                    json.dumps(impact, ensure_ascii=False, sort_keys=True),
                    run_id,
                ),
            )
            connection.commit()
    except BaseException as exc:
        _fail_run(db_path, run_id, exc)
        raise

    return {
        "run_id": run_id,
        "source_key": source_key,
        "status": "complete",
        "input_fingerprint": input_fingerprint,
        "files": [str(path) for path in files],
        "cleaning": {
            "input_rows": cleaning_stats.input_rows,
            "invalid_rows": cleaning_stats.invalid_rows,
            "closed_rows": cleaning_stats.closed_rows,
            "advertisement_rows": cleaning_stats.advertisement_rows,
            "nonfood_rows": cleaning_stats.nonfood_rows,
            "duplicate_rows": cleaning_stats.duplicate_rows,
            "output_rows": cleaning_stats.output_rows,
        },
        **observation_counts,
        "new_candidates": inserted,
        "updated_candidates": updated_candidates,
        "unchanged_candidates": unchanged_candidates,
        "canonical_candidate_count": len(materialized),
        "impact": impact,
        "database": str(db_path),
        "csv_output": str(csv_output) if csv_output else None,
        "scoring_config": config.to_dict(),
    }


def get_source_run_status(db_path: str | Path, run_id: int) -> dict[str, object]:
    """Return one durable source-provenance run without changing the database."""

    with connect_readonly(db_path) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='candidate_source_runs'"
        ).fetchone()
        if table is None:
            raise ValueError("Source ingestion run ledger has not been initialized")
        row = connection.execute(
            "SELECT * FROM candidate_source_runs WHERE id=?", (run_id,)
        ).fetchone()
    if row is None:
        raise ValueError(f"Unknown source run: {run_id}")
    item = dict(row)
    impact_raw = item.pop("impact_json", "{}") or "{}"
    item["impact"] = json.loads(str(impact_raw))
    item["input_files"] = json.loads(str(item.pop("input_files_json", "[]") or "[]"))
    item["scoring_config"] = json.loads(
        str(item.pop("scoring_config_json", "{}") or "{}")
    )
    return item


def list_source_runs(
    db_path: str | Path, *, source_key: str | None = None, limit: int = 20
) -> list[dict[str, object]]:
    """List recent source runs without initializing or mutating their ledger."""

    if limit < 1 or limit > 200:
        raise ValueError("limit must be between 1 and 200")
    with connect_readonly(db_path) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='candidate_source_runs'"
        ).fetchone()
        if table is None:
            return []
        where = "WHERE source_key=?" if source_key else ""
        parameters: tuple[object, ...] = (source_key, limit) if source_key else (limit,)
        rows = connection.execute(
            f"""
            SELECT id, source_key, status, input_fingerprint, total_rows_seen,
                   valid_rows, invalid_rows, new_candidates, updated_candidates,
                   unchanged_candidates, source_local_missing, started_at, completed_at
            FROM candidate_source_runs {where}
            ORDER BY id DESC LIMIT ?
            """,
            parameters,
        ).fetchall()
    return [dict(row) for row in rows]
