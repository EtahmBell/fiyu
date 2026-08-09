from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .database import connect

VISIT_SCHEMA = """
CREATE TABLE IF NOT EXISTS restaurant_visits (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    place_id TEXT NOT NULL,
    visited_at TEXT NOT NULL,
    reaction TEXT NOT NULL,
    private_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (place_id) REFERENCES public_restaurants(place_id) ON DELETE RESTRICT,
    CHECK (TRIM(owner_id) <> ''),
    CHECK (TRIM(place_id) <> ''),
    CHECK (reaction IN ('love_it', 'like_it', 'not_for_me')),
    CHECK (private_note IS NULL OR LENGTH(private_note) <= 2000)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_visits_owner_visited
    ON restaurant_visits(owner_id, visited_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_visits_owner_place
    ON restaurant_visits(owner_id, place_id);
"""


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def ensure_restaurant_visit_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(VISIT_SCHEMA)
        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(restaurant_visits)").fetchall()
        }
        if "reaction" not in columns:
            # Existing private visits predate reactions. Keep those rows intact;
            # API validation requires a reaction for every newly created visit.
            connection.execute(
                "ALTER TABLE restaurant_visits ADD COLUMN reaction TEXT "
                "CHECK (reaction IN ('love_it', 'like_it', 'not_for_me'))"
            )
        connection.commit()


def _visit_select() -> str:
    return """
        SELECT
            v.id,
            v.place_id,
            v.visited_at,
            v.reaction,
            v.private_note,
            v.created_at,
            v.updated_at,
            p.name_ja,
            p.name_en,
            p.primary_category,
            r.neighborhood,
            p.fiyu_score,
            p.score_band
        FROM restaurant_visits v
        JOIN public_restaurants p ON p.place_id = v.place_id
        LEFT JOIN restaurants r ON r.place_id = p.place_id
    """


def create_visit(
    db_path: str | Path,
    *,
    owner_id: str,
    place_id: str,
    visited_at: str,
    reaction: str,
    private_note: str | None,
) -> dict[str, object] | None:
    ensure_restaurant_visit_schema(db_path)
    visit_id = str(uuid4())
    now = _utc_now()
    with connect(db_path) as connection:
        published = connection.execute(
            "SELECT 1 FROM public_restaurants WHERE place_id = ? AND is_published = 1",
            (place_id,),
        ).fetchone()
        if published is None:
            return None
        connection.execute(
            """
            INSERT INTO restaurant_visits
                (id, owner_id, place_id, visited_at, reaction, private_note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (visit_id, owner_id, place_id, visited_at, reaction, private_note, now, now),
        )
        row = connection.execute(
            _visit_select() + " WHERE v.id = ? AND v.owner_id = ?",
            (visit_id, owner_id),
        ).fetchone()
        connection.commit()
    return dict(row) if row else None


def list_visits(db_path: str | Path, *, owner_id: str) -> list[dict[str, object]]:
    ensure_restaurant_visit_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            _visit_select()
            + " WHERE v.owner_id = ? ORDER BY v.visited_at DESC, v.created_at DESC, v.id DESC",
            (owner_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_visit(
    db_path: str | Path,
    *,
    owner_id: str,
    visit_id: str,
) -> dict[str, object] | None:
    ensure_restaurant_visit_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            _visit_select() + " WHERE v.id = ? AND v.owner_id = ?",
            (visit_id, owner_id),
        ).fetchone()
    return dict(row) if row else None


def update_visit(
    db_path: str | Path,
    *,
    owner_id: str,
    visit_id: str,
    visited_at: str | None,
    reaction: str | None,
    private_note: str | None,
    update_visited_at: bool,
    update_reaction: bool,
    update_private_note: bool,
) -> dict[str, object] | None:
    ensure_restaurant_visit_schema(db_path)
    assignments: list[str] = []
    values: list[object] = []
    if update_visited_at:
        assignments.append("visited_at = ?")
        values.append(visited_at)
    if update_reaction:
        assignments.append("reaction = ?")
        values.append(reaction)
    if update_private_note:
        assignments.append("private_note = ?")
        values.append(private_note)

    with connect(db_path) as connection:
        if assignments:
            assignments.append("updated_at = ?")
            values.append(_utc_now())
            values.extend((visit_id, owner_id))
            connection.execute(
                f"UPDATE restaurant_visits SET {', '.join(assignments)} "
                "WHERE id = ? AND owner_id = ?",
                values,
            )
        row = connection.execute(
            _visit_select() + " WHERE v.id = ? AND v.owner_id = ?",
            (visit_id, owner_id),
        ).fetchone()
        connection.commit()
    return dict(row) if row else None


def delete_visit(db_path: str | Path, *, owner_id: str, visit_id: str) -> bool:
    ensure_restaurant_visit_schema(db_path)
    with connect(db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM restaurant_visits WHERE id = ? AND owner_id = ?",
            (visit_id, owner_id),
        )
        connection.commit()
    return cursor.rowcount > 0


def visited_place_ids(db_path: str | Path, *, owner_id: str) -> set[str]:
    ensure_restaurant_visit_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            "SELECT DISTINCT place_id FROM restaurant_visits WHERE owner_id = ?",
            (owner_id,),
        ).fetchall()
    return {str(row["place_id"]) for row in rows}
