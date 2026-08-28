from __future__ import annotations

import json
import random
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from .database import connect
from .utils import haversine_km

PICKS_RADII_KM = (1.5, 2.0, 3.0, 5.0, 8.0)
TARGET_UNSEEN_POOL = 10
REPEAT_COOLDOWN = timedelta(days=7)
ACTIVE_SNAPSHOT_DURATION = timedelta(hours=24)
RECENT_DISCOVERY_DURATION = timedelta(hours=72)
CHOME_ALLOWANCE_KM = 0.75
NEIGHBORHOOD_ALLOWANCE_KM = 1.5

DAILY_PICKS_SCHEMA = """
CREATE TABLE IF NOT EXISTS daily_pick_rounds (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    city_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    expires_at TEXT,
    revealed_at TEXT,
    selection_metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_daily_pick_rounds_owner
    ON daily_pick_rounds(owner_id, city_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS daily_pick_round_items (
    round_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    restaurant_place_id TEXT NOT NULL,
    PRIMARY KEY (round_id, position),
    UNIQUE (round_id, restaurant_place_id),
    FOREIGN KEY (round_id) REFERENCES daily_pick_rounds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_pick_served_history (
    owner_id TEXT NOT NULL,
    restaurant_place_id TEXT NOT NULL,
    first_served_at TEXT NOT NULL,
    last_served_at TEXT,
    served_count INTEGER NOT NULL DEFAULT 1,
    selection_round_id TEXT,
    PRIMARY KEY (owner_id, restaurant_place_id),
    FOREIGN KEY (selection_round_id) REFERENCES daily_pick_rounds(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_pick_served_owner
    ON daily_pick_served_history(owner_id, last_served_at DESC);
"""


@dataclass(frozen=True)
class DailyPickAssignment:
    round_id: str
    place_ids: tuple[str, ...]
    assigned_at: str
    expires_at: str
    selection_metadata: dict[str, object]
    revealed_at: str | None = None
    revealed_place_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class InsufficientUnseenPoolError(ValueError):
    available_count: int
    required_count: int


def _now() -> datetime:
    return datetime.now(UTC)


def _parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _unique_ids(place_ids: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in place_ids if value.strip()))


def revealed_place_ids(
    selection_metadata: Mapping[str, object],
    place_ids: Iterable[str],
    revealed_at: str | None,
) -> tuple[str, ...]:
    """Return valid per-Pick reveal progress, including old all-revealed rounds."""
    ordered = tuple(place_ids)
    raw = selection_metadata.get("revealed_place_ids")
    stored = set(_unique_ids(raw if isinstance(raw, list) else []))
    if revealed_at and not stored:
        return ordered
    return tuple(place_id for place_id in ordered if place_id in stored)


def _ensure_column(connection: Any, table: str, name: str, declaration: str) -> None:
    columns = {str(row["name"]) for row in connection.execute(f"PRAGMA table_info({table})")}
    if name not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {name} {declaration}")


def ensure_daily_picks_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(DAILY_PICKS_SCHEMA)
        _ensure_column(connection, "daily_pick_rounds", "expires_at", "TEXT")
        _ensure_column(connection, "daily_pick_rounds", "revealed_at", "TEXT")
        _ensure_column(
            connection,
            "daily_pick_rounds",
            "selection_metadata_json",
            "TEXT NOT NULL DEFAULT '{}'",
        )
        _ensure_column(connection, "daily_pick_served_history", "last_served_at", "TEXT")
        _ensure_column(
            connection, "daily_pick_served_history", "served_count", "INTEGER NOT NULL DEFAULT 1"
        )
        connection.execute(
            """
            UPDATE daily_pick_served_history
            SET last_served_at = first_served_at
            WHERE last_served_at IS NULL
            """
        )
        connection.commit()


def seed_served_history(
    db_path: str | Path,
    *,
    owner_id: str,
    place_ids: Iterable[str],
    first_served_at: str | None = None,
) -> int:
    """Persist reliable anonymous legacy assignments without altering newer history."""
    ensure_daily_picks_schema(db_path)
    values = _unique_ids(place_ids)
    if not values:
        return 0
    served_at = first_served_at or _now().isoformat()
    with connect(db_path) as connection:
        before = connection.total_changes
        connection.executemany(
            """
            INSERT OR IGNORE INTO daily_pick_served_history (
                owner_id, restaurant_place_id, first_served_at, last_served_at,
                served_count, selection_round_id
            ) VALUES (?, ?, ?, ?, 1, NULL)
            """,
            ((owner_id, place_id, served_at, served_at) for place_id in values),
        )
        inserted = connection.total_changes - before
        connection.commit()
    return inserted


def served_place_ids(db_path: str | Path, *, owner_id: str) -> set[str]:
    ensure_daily_picks_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            "SELECT restaurant_place_id FROM daily_pick_served_history WHERE owner_id = ?",
            (owner_id,),
        ).fetchall()
    return {str(row["restaurant_place_id"]) for row in rows}


def _history_from_connection(connection: Any, owner_id: str) -> dict[str, datetime]:
    rows = connection.execute(
        """
        SELECT restaurant_place_id, last_served_at
        FROM daily_pick_served_history
        WHERE owner_id = ?
        """,
        (owner_id,),
    ).fetchall()
    return {
        str(row["restaurant_place_id"]): parsed
        for row in rows
        if (parsed := _parse_datetime(row["last_served_at"])) is not None
    }


def _saved_from_connection(connection: Any, owner_id: str, city_id: str) -> set[str]:
    table = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='restaurant_lists'"
    ).fetchone()
    if table is None:
        return set()
    rows = connection.execute(
        """
        SELECT i.place_id
        FROM restaurant_list_items i
        JOIN restaurant_lists l ON l.id = i.list_id
        WHERE l.owner_id = ? AND l.city_id = ? AND l.list_kind = 'default'
        """,
        (owner_id, city_id),
    ).fetchall()
    return {str(row["place_id"]) for row in rows}


def _precision_group(value: object) -> str:
    normalized = str(value or "").strip().lower().replace("ō", "o")
    if normalized in {"exact", "poi", "rooftop", "building"}:
        return "exact"
    if normalized in {"block", "street", "street_number", "parcel_or_street_number"}:
        return "block"
    if normalized in {"chome", "chome_approximate"}:
        return "chome"
    if normalized in {"neighborhood", "neighbourhood", "suburb"}:
        return "neighborhood"
    return "area"


def _in_area(row: Mapping[str, object], active_area: str | None) -> bool:
    if not active_area:
        return False
    expected = active_area.strip().lower()
    if str(row.get("discovery_area") or "").strip().lower() == expected:
        return True
    try:
        values = json.loads(str(row.get("discovery_areas_json") or "[]"))
    except json.JSONDecodeError:
        return False
    return any(
        isinstance(item, dict) and str(item.get("area") or "").strip().lower() == expected
        for item in values
    )


def _admitted_at_radius(
    row: Mapping[str, object],
    *,
    radius_km: float,
    latitude: float,
    longitude: float,
    active_area: str | None,
) -> bool:
    distance = haversine_km(
        latitude,
        longitude,
        float(row["latitude"]),
        float(row["longitude"]),
    )
    precision = _precision_group(row.get("location_precision"))
    if precision in {"exact", "block"}:
        return distance <= radius_km
    if precision == "chome":
        return distance <= radius_km + CHOME_ALLOWANCE_KM
    if precision == "neighborhood":
        return radius_km >= 3.0 and distance <= radius_km + NEIGHBORHOOD_ALLOWANCE_KM
    return radius_km == PICKS_RADII_KM[-1] and (
        _in_area(row, active_area) or distance <= radius_km
    )


def _published_catalog(connection: Any) -> list[dict[str, object]]:
    return [
        dict(row)
        for row in connection.execute(
            """
            SELECT place_id, latitude, longitude,
                   COALESCE(map_location_precision, location_precision) AS location_precision,
                   discovery_area, discovery_areas_json
            FROM public_restaurants
            WHERE is_published = 1
              AND product_eligible = 1
              AND map_display_eligible = 1
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            ORDER BY place_id
            """
        ).fetchall()
    ]


def select_daily_pick_plan(
    connection: Any,
    *,
    discovery_latitude: float,
    discovery_longitude: float,
    active_area: str | None,
    saved_place_ids: set[str],
    served_history: Mapping[str, datetime],
    now: datetime,
    requested_count: int = 3,
    seed: int | None = None,
    excluded_place_ids: set[str] | None = None,
    allow_partial: bool = False,
) -> tuple[tuple[str, ...], dict[str, object]]:
    """Plan one V1 selection from the complete canonical catalog without writing."""
    catalog = _published_catalog(connection)
    additionally_excluded = excluded_place_ids or set()
    unsaved = [
        row
        for row in catalog
        if str(row["place_id"]) not in saved_place_ids
        and str(row["place_id"]) not in additionally_excluded
    ]
    recent_ids = {
        place_id
        for place_id, served_at in served_history.items()
        if now - served_at < REPEAT_COOLDOWN
    }
    old_repeat_ids = set(served_history) - recent_ids - saved_place_ids

    stages: list[dict[str, object]] = []
    final_radius = PICKS_RADII_KM[-1]
    final_unseen: list[dict[str, object]] = []
    final_pool: list[dict[str, object]] = []
    for radius in PICKS_RADII_KM:
        pool = [
            row
            for row in unsaved
            if _admitted_at_radius(
                row,
                radius_km=radius,
                latitude=discovery_latitude,
                longitude=discovery_longitude,
                active_area=active_area,
            )
        ]
        unseen_pool = [row for row in pool if str(row["place_id"]) not in served_history]
        stages.append({"radius_km": radius, "unseen_count": len(unseen_pool)})
        final_radius, final_pool, final_unseen = radius, pool, unseen_pool
        if len(unseen_pool) >= TARGET_UNSEEN_POOL:
            break

    rng = random.Random(seed) if seed is not None else random.SystemRandom()
    if len(final_unseen) >= requested_count:
        selected_rows = rng.sample(final_unseen, requested_count)
        repeat_count = 0
    else:
        repeat_reserve = [
            row for row in final_pool if str(row["place_id"]) in old_repeat_ids
        ]
        needed = requested_count - len(final_unseen)
        if len(repeat_reserve) < needed and not allow_partial:
            raise InsufficientUnseenPoolError(
                len(final_unseen) + len(repeat_reserve), requested_count
            )
        selected_rows = [
            *final_unseen,
            *rng.sample(repeat_reserve, min(needed, len(repeat_reserve))),
        ]
        rng.shuffle(selected_rows)
        repeat_count = min(needed, len(repeat_reserve))

    chosen_ids = tuple(str(row["place_id"]) for row in selected_rows)
    precision_distribution: dict[str, int] = {}
    for row in final_pool:
        precision = _precision_group(row.get("location_precision"))
        precision_distribution[precision] = precision_distribution.get(precision, 0) + 1
    metadata: dict[str, object] = {
        "algorithm": "location-v1",
        "initial_radius_km": PICKS_RADII_KM[0],
        "final_radius_km": final_radius,
        "target_unseen_pool": TARGET_UNSEEN_POOL,
        "unseen_by_radius": stages,
        "saved_excluded_count": sum(
            str(row["place_id"]) in saved_place_ids for row in catalog
        ),
        "recent_excluded_count": sum(
            str(row["place_id"]) in recent_ids for row in final_pool
        ),
        "repeat_reserve_count": sum(
            str(row["place_id"]) in old_repeat_ids for row in final_pool
        ),
        "repeat_selected_count": repeat_count,
        "chosen_place_ids": list(chosen_ids),
        "precision_distribution": precision_distribution,
    }
    return chosen_ids, metadata


def plan_repaired_daily_picks(
    connection: Any,
    assignment: DailyPickAssignment,
    *,
    discovery_latitude: float,
    discovery_longitude: float,
    active_area: str | None,
    saved_place_ids: set[str],
    served_history: Mapping[str, datetime],
    now: datetime,
    requested_count: int = 3,
    seed: int | None = None,
) -> tuple[DailyPickAssignment, tuple[str, ...]]:
    eligible_ids = {str(row["place_id"]) for row in _published_catalog(connection)}
    preserved = tuple(
        place_id for place_id in assignment.place_ids if place_id in eligible_ids
    )[:requested_count]
    missing_count = requested_count - len(preserved)
    if missing_count <= 0 and preserved == assignment.place_ids:
        return assignment, ()

    replacements: tuple[str, ...] = ()
    repair_metadata: dict[str, object] = {}
    if missing_count:
        replacements, repair_metadata = select_daily_pick_plan(
            connection,
            discovery_latitude=discovery_latitude,
            discovery_longitude=discovery_longitude,
            active_area=active_area,
            saved_place_ids=saved_place_ids,
            served_history=served_history,
            now=now,
            requested_count=missing_count,
            seed=seed,
            excluded_place_ids=set(preserved),
            allow_partial=True,
        )
    repaired_ids = (*preserved, *replacements)
    preserved_revealed = tuple(
        place_id for place_id in repaired_ids if place_id in assignment.revealed_place_ids
    )
    repaired_revealed_at = (
        assignment.revealed_at
        if repaired_ids and len(preserved_revealed) == len(repaired_ids)
        else None
    )
    metadata = {
        **assignment.selection_metadata,
        **repair_metadata,
        "revealed_place_ids": list(preserved_revealed),
        "discovery_label": active_area,
        "discovery_latitude": discovery_latitude,
        "discovery_longitude": discovery_longitude,
        "chosen_place_ids": list(repaired_ids),
        "snapshot_repaired_at": now.isoformat(),
        "snapshot_removed_place_ids": [
            place_id for place_id in assignment.place_ids if place_id not in preserved
        ],
    }
    return (
        DailyPickAssignment(
            assignment.round_id,
            repaired_ids,
            assignment.assigned_at,
            assignment.expires_at,
            metadata,
            repaired_revealed_at,
            preserved_revealed,
        ),
        replacements,
    )


def _active_assignment(connection: Any, owner_id: str, city_id: str, now: datetime) -> DailyPickAssignment | None:
    row = connection.execute(
        """
        SELECT id, assigned_at, expires_at, revealed_at, selection_metadata_json
        FROM daily_pick_rounds
        WHERE owner_id = ? AND city_id = ? AND expires_at > ?
        ORDER BY assigned_at DESC, id DESC
        LIMIT 1
        """,
        (owner_id, city_id, now.isoformat()),
    ).fetchone()
    if row is None:
        return None
    items = connection.execute(
        """
        SELECT restaurant_place_id
        FROM daily_pick_round_items
        WHERE round_id = ?
        ORDER BY position
        """,
        (row["id"],),
    ).fetchall()
    try:
        metadata = json.loads(row["selection_metadata_json"] or "{}")
    except json.JSONDecodeError:
        metadata = {}
    place_ids = tuple(str(item["restaurant_place_id"]) for item in items)
    revealed_at = str(row["revealed_at"]) if row["revealed_at"] is not None else None
    normalized_metadata = metadata if isinstance(metadata, dict) else {}
    return DailyPickAssignment(
        str(row["id"]),
        place_ids,
        str(row["assigned_at"]),
        str(row["expires_at"]),
        normalized_metadata,
        revealed_at,
        revealed_place_ids(normalized_metadata, place_ids, revealed_at),
    )


def get_active_daily_picks(
    db_path: str | Path, *, owner_id: str, city_id: str, now: datetime | None = None
) -> DailyPickAssignment | None:
    ensure_daily_picks_schema(db_path)
    with connect(db_path) as connection:
        return _active_assignment(connection, owner_id, city_id, now or _now())


def reveal_active_daily_picks(
    db_path: str | Path,
    *,
    owner_id: str,
    round_id: str,
    place_id: str,
    revealed_at: str | None = None,
    now: datetime | None = None,
) -> tuple[str, tuple[str, ...], str | None] | None:
    """Idempotently reveal one Pick and return its timestamp, progress, and round state."""
    ensure_daily_picks_schema(db_path)
    current = now or _now()
    timestamp = revealed_at or current.isoformat()
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            """
            SELECT revealed_at, selection_metadata_json
            FROM daily_pick_rounds
            WHERE id = ? AND owner_id = ? AND expires_at > ?
            """,
            (round_id, owner_id, current.isoformat()),
        ).fetchone()
        if row is None:
            return None
        item = connection.execute(
            """
            SELECT 1 FROM daily_pick_round_items
            WHERE round_id = ? AND restaurant_place_id = ?
            """,
            (round_id, place_id),
        ).fetchone()
        if item is None:
            return None
        try:
            metadata = json.loads(row["selection_metadata_json"] or "{}")
        except json.JSONDecodeError:
            metadata = {}
        if not isinstance(metadata, dict):
            metadata = {}
        stored_ids = metadata.get("revealed_place_ids")
        revealed_ids = _unique_ids(stored_ids if isinstance(stored_ids, list) else [])
        # Rolling compatibility: the old aggregate flag meant every card was revealed.
        if row["revealed_at"] is not None and not revealed_ids:
            revealed_ids = [
                str(item["restaurant_place_id"])
                for item in connection.execute(
                    """
                    SELECT restaurant_place_id FROM daily_pick_round_items
                    WHERE round_id = ? ORDER BY position
                    """,
                    (round_id,),
                ).fetchall()
            ]
        pick_revealed_at = timestamp
        if place_id not in revealed_ids:
            revealed_ids.append(place_id)
            metadata["revealed_place_ids"] = revealed_ids
            connection.execute(
                """
                UPDATE daily_pick_rounds SET selection_metadata_json = ?
                WHERE id = ? AND owner_id = ?
                """,
                (json.dumps(metadata, ensure_ascii=False, sort_keys=True), round_id, owner_id),
            )
        else:
            pick_revealed_at = str(row["revealed_at"] or timestamp)
        item_count = int(connection.execute(
            "SELECT COUNT(*) FROM daily_pick_round_items WHERE round_id = ?", (round_id,)
        ).fetchone()[0])
        aggregate = str(row["revealed_at"]) if row["revealed_at"] is not None else None
        if aggregate is None and item_count > 0 and len(revealed_ids) == item_count:
            aggregate = timestamp
            connection.execute(
                "UPDATE daily_pick_rounds SET revealed_at = ? WHERE id = ? AND owner_id = ?",
                (aggregate, round_id, owner_id),
            )
        connection.commit()
    return pick_revealed_at, tuple(revealed_ids), aggregate


def _persist_repaired_assignment(
    connection: Any,
    *,
    owner_id: str,
    assignment: DailyPickAssignment,
    added_ids: tuple[str, ...],
    repaired_at: datetime,
) -> None:
    connection.execute(
        "DELETE FROM daily_pick_round_items WHERE round_id = ?", (assignment.round_id,)
    )
    connection.executemany(
        """
        INSERT INTO daily_pick_round_items (round_id, position, restaurant_place_id)
        VALUES (?, ?, ?)
        """,
        (
            (assignment.round_id, position, place_id)
            for position, place_id in enumerate(assignment.place_ids)
        ),
    )
    connection.execute(
        """
        UPDATE daily_pick_rounds
        SET selection_metadata_json = ?, revealed_at = ?
        WHERE id = ?
        """,
        (
            json.dumps(assignment.selection_metadata, ensure_ascii=False, sort_keys=True),
            assignment.revealed_at,
            assignment.round_id,
        ),
    )
    connection.executemany(
        """
        INSERT INTO daily_pick_served_history (
            owner_id, restaurant_place_id, first_served_at, last_served_at,
            served_count, selection_round_id
        ) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(owner_id, restaurant_place_id) DO UPDATE SET
            last_served_at = excluded.last_served_at,
            served_count = daily_pick_served_history.served_count + 1,
            selection_round_id = excluded.selection_round_id
        """,
        (
            (
                owner_id,
                place_id,
                repaired_at.isoformat(),
                repaired_at.isoformat(),
                assignment.round_id,
            )
            for place_id in added_ids
        ),
    )


def repair_active_daily_picks(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
    discovery_latitude: float,
    discovery_longitude: float,
    active_area: str | None,
    requested_count: int = 3,
    seed: int | None = None,
    now: datetime | None = None,
) -> DailyPickAssignment | None:
    """Repair one active local snapshot without deleting its historical relationships."""
    ensure_daily_picks_schema(db_path)
    repaired_at = now or _now()
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        active = _active_assignment(connection, owner_id, city_id, repaired_at)
        if active is None:
            connection.commit()
            return None
        repaired, added_ids = plan_repaired_daily_picks(
            connection,
            active,
            discovery_latitude=discovery_latitude,
            discovery_longitude=discovery_longitude,
            active_area=active_area,
            saved_place_ids=_saved_from_connection(connection, owner_id, city_id),
            served_history=_history_from_connection(connection, owner_id),
            now=repaired_at,
            requested_count=requested_count,
            seed=seed,
        )
        if repaired.place_ids == active.place_ids:
            connection.commit()
            return active
        _persist_repaired_assignment(
            connection,
            owner_id=owner_id,
            assignment=repaired,
            added_ids=added_ids,
            repaired_at=repaired_at,
        )
        connection.commit()
    return repaired


def get_recent_daily_pick_rounds(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
    now: datetime | None = None,
) -> list[DailyPickAssignment]:
    """Return complete expired rounds still inside the discovery-retention window."""
    ensure_daily_picks_schema(db_path)
    current = now or _now()
    cutoff = current - RECENT_DISCOVERY_DURATION
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT id, assigned_at, expires_at, revealed_at, selection_metadata_json
            FROM daily_pick_rounds
            WHERE owner_id = ? AND city_id = ? AND assigned_at > ?
            ORDER BY assigned_at DESC, id DESC
            """,
            (owner_id, city_id, cutoff.isoformat()),
        ).fetchall()
        rounds: list[DailyPickAssignment] = []
        for row in rows:
            assigned_at = datetime.fromisoformat(str(row["assigned_at"]))
            if assigned_at.tzinfo is None:
                assigned_at = assigned_at.replace(tzinfo=UTC)
            expires_at_value = row["expires_at"]
            expires_at = (
                datetime.fromisoformat(str(expires_at_value))
                if expires_at_value
                else assigned_at + ACTIVE_SNAPSHOT_DURATION
            )
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at > current or assigned_at + RECENT_DISCOVERY_DURATION <= current:
                continue
            items = connection.execute(
                """
                SELECT restaurant_place_id
                FROM daily_pick_round_items
                WHERE round_id = ?
                ORDER BY position
                """,
                (row["id"],),
            ).fetchall()
            try:
                metadata = json.loads(row["selection_metadata_json"] or "{}")
            except json.JSONDecodeError:
                metadata = {}
            place_ids = tuple(str(item["restaurant_place_id"]) for item in items)
            revealed_at = str(row["revealed_at"]) if row["revealed_at"] is not None else None
            normalized_metadata = metadata if isinstance(metadata, dict) else {}
            rounds.append(
                DailyPickAssignment(
                    round_id=str(row["id"]),
                    place_ids=place_ids,
                    assigned_at=str(row["assigned_at"]),
                    expires_at=str(expires_at_value or expires_at.isoformat()),
                    selection_metadata=normalized_metadata,
                    revealed_at=revealed_at,
                    revealed_place_ids=revealed_place_ids(
                        normalized_metadata, place_ids, revealed_at
                    ),
                )
            )
    return rounds


def assign_daily_picks(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
    discovery_latitude: float,
    discovery_longitude: float,
    active_area: str | None,
    discovery_mode: str | None = None,
    requested_count: int = 3,
    seed: int | None = None,
    candidate_place_ids: Iterable[str] | None = None,
    categories: Iterable[str] = (),
    non_japanese: str = "occasionally",
    now: datetime | None = None,
) -> DailyPickAssignment:
    """Atomically return an active anonymous snapshot or create a new V1 round.

    Legacy candidate/preference arguments remain accepted for client compatibility
    but intentionally do not constrain or rank the canonical V1 catalog.
    """
    del candidate_place_ids, categories, non_japanese
    ensure_daily_picks_schema(db_path)
    assigned = now or _now()
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        active = _active_assignment(connection, owner_id, city_id, assigned)
        if active is not None:
            repaired, added_ids = plan_repaired_daily_picks(
                connection,
                active,
                discovery_latitude=float(
                    active.selection_metadata.get("discovery_latitude")
                    or discovery_latitude
                ),
                discovery_longitude=float(
                    active.selection_metadata.get("discovery_longitude")
                    or discovery_longitude
                ),
                active_area=str(
                    active.selection_metadata.get("discovery_label") or active_area or ""
                ) or None,
                saved_place_ids=_saved_from_connection(connection, owner_id, city_id),
                served_history=_history_from_connection(connection, owner_id),
                now=assigned,
                requested_count=requested_count,
                seed=seed,
            )
            if repaired.place_ids != active.place_ids:
                _persist_repaired_assignment(
                    connection,
                    owner_id=owner_id,
                    assignment=repaired,
                    added_ids=added_ids,
                    repaired_at=assigned,
                )
            connection.commit()
            return repaired
        selected, metadata = select_daily_pick_plan(
            connection,
            discovery_latitude=discovery_latitude,
            discovery_longitude=discovery_longitude,
            active_area=active_area,
            saved_place_ids=_saved_from_connection(connection, owner_id, city_id),
            served_history=_history_from_connection(connection, owner_id),
            now=assigned,
            requested_count=requested_count,
            seed=seed,
        )
        metadata.update(
            {
                "discovery_mode": discovery_mode,
                "discovery_label": active_area,
                "discovery_latitude": discovery_latitude,
                "discovery_longitude": discovery_longitude,
            }
        )
        round_id = str(uuid4())
        expires_at = assigned + ACTIVE_SNAPSHOT_DURATION
        connection.execute(
            """
            INSERT INTO daily_pick_rounds (
                id, owner_id, city_id, assigned_at, expires_at, selection_metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                round_id,
                owner_id,
                city_id,
                assigned.isoformat(),
                expires_at.isoformat(),
                json.dumps(metadata, ensure_ascii=False, sort_keys=True),
            ),
        )
        connection.executemany(
            """
            INSERT INTO daily_pick_round_items (round_id, position, restaurant_place_id)
            VALUES (?, ?, ?)
            """,
            ((round_id, position, place_id) for position, place_id in enumerate(selected)),
        )
        connection.executemany(
            """
            INSERT INTO daily_pick_served_history (
                owner_id, restaurant_place_id, first_served_at, last_served_at,
                served_count, selection_round_id
            ) VALUES (?, ?, ?, ?, 1, ?)
            ON CONFLICT(owner_id, restaurant_place_id) DO UPDATE SET
                last_served_at = excluded.last_served_at,
                served_count = daily_pick_served_history.served_count + 1,
                selection_round_id = excluded.selection_round_id
            """,
            (
                (owner_id, place_id, assigned.isoformat(), assigned.isoformat(), round_id)
                for place_id in selected
            ),
        )
        connection.commit()
    return DailyPickAssignment(
        round_id,
        selected,
        assigned.isoformat(),
        expires_at.isoformat(),
        metadata,
    )
