from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from .database import connect
from .list_policy import DEFAULT_LIST_KIND

CUSTOM_LIST_KIND = "custom"

LIST_SCHEMA = """
CREATE TABLE IF NOT EXISTS restaurant_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL,
    city_id TEXT NOT NULL,
    name TEXT NOT NULL,
    list_kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (TRIM(owner_id) <> ''),
    CHECK (TRIM(city_id) <> ''),
    CHECK (TRIM(name) <> ''),
    CHECK (TRIM(list_kind) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_lists_owner_city_default
    ON restaurant_lists(owner_id, city_id)
    WHERE list_kind = 'default';
CREATE INDEX IF NOT EXISTS idx_restaurant_lists_owner_city
    ON restaurant_lists(owner_id, city_id);

CREATE TABLE IF NOT EXISTS restaurant_list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    place_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    FOREIGN KEY (list_id) REFERENCES restaurant_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (place_id) REFERENCES public_restaurants(place_id) ON DELETE RESTRICT,
    UNIQUE (list_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_list_items_list_id
    ON restaurant_list_items(list_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_list_items_place_id
    ON restaurant_list_items(place_id);
"""


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def ensure_restaurant_list_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(LIST_SCHEMA)
        connection.commit()


def _default_list_name_for_city(city_id: str) -> str:
    if city_id == "tokyo":
        return "Tokyo"
    return city_id.title()


def get_or_create_default_list(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
) -> dict[str, object]:
    ensure_restaurant_list_schema(db_path)
    now = _utc_now()
    with connect(db_path) as connection:
        connection.execute(
            """
            INSERT OR IGNORE INTO restaurant_lists
                (owner_id, city_id, name, list_kind, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (owner_id, city_id, _default_list_name_for_city(city_id), DEFAULT_LIST_KIND, now, now),
        )
        row = connection.execute(
            """
            SELECT id, owner_id, city_id, name, list_kind, created_at, updated_at
            FROM restaurant_lists
            WHERE owner_id = ? AND city_id = ? AND list_kind = ?
            """,
            (owner_id, city_id, DEFAULT_LIST_KIND),
        ).fetchone()
        connection.commit()
    if row is None:
        raise RuntimeError("Default list creation failed")
    return dict(row)


def get_default_list(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
) -> dict[str, object] | None:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT id, owner_id, city_id, name, list_kind, created_at, updated_at
            FROM restaurant_lists
            WHERE owner_id = ? AND city_id = ? AND list_kind = ?
            """,
            (owner_id, city_id, DEFAULT_LIST_KIND),
        ).fetchone()
    return dict(row) if row else None


def list_lists_for_owner(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str | None = None,
) -> list[dict[str, object]]:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        if city_id is None:
            rows = connection.execute(
                """
                SELECT id, owner_id, city_id, name, list_kind, created_at, updated_at
                FROM restaurant_lists
                WHERE owner_id = ?
                ORDER BY CASE list_kind WHEN 'default' THEN 0 ELSE 1 END, created_at ASC, id ASC
                """,
                (owner_id,),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, owner_id, city_id, name, list_kind, created_at, updated_at
                FROM restaurant_lists
                WHERE owner_id = ? AND city_id = ?
                ORDER BY CASE list_kind WHEN 'default' THEN 0 ELSE 1 END, created_at ASC, id ASC
                """,
                (owner_id, city_id),
            ).fetchall()
    return [dict(row) for row in rows]


def get_list_by_id(
    db_path: str | Path,
    *,
    owner_id: str,
    list_id: int,
) -> dict[str, object] | None:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT id, owner_id, city_id, name, list_kind, created_at, updated_at
            FROM restaurant_lists
            WHERE owner_id = ? AND id = ?
            LIMIT 1
            """,
            (owner_id, list_id),
        ).fetchone()
    return dict(row) if row else None


def create_custom_list(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
    name: str,
) -> dict[str, object]:
    ensure_restaurant_list_schema(db_path)
    now = _utc_now()
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO restaurant_lists
                (owner_id, city_id, name, list_kind, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (owner_id, city_id, name, CUSTOM_LIST_KIND, now, now),
        )
        row = connection.execute(
            """
            SELECT id, owner_id, city_id, name, list_kind, created_at, updated_at
            FROM restaurant_lists
            WHERE id = ?
            """,
            (int(cursor.lastrowid),),
        ).fetchone()
        connection.commit()
    if row is None:
        raise RuntimeError("Custom list creation failed")
    return dict(row)


def rename_list(
    db_path: str | Path,
    *,
    owner_id: str,
    list_id: int,
    name: str,
) -> dict[str, object] | None:
    ensure_restaurant_list_schema(db_path)
    now = _utc_now()
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE restaurant_lists
            SET name = ?, updated_at = ?
            WHERE owner_id = ? AND id = ?
            """,
            (name, now, owner_id, list_id),
        )
        row = connection.execute(
            """
            SELECT id, owner_id, city_id, name, list_kind, created_at, updated_at
            FROM restaurant_lists
            WHERE owner_id = ? AND id = ?
            LIMIT 1
            """,
            (owner_id, list_id),
        ).fetchone()
        connection.commit()
    return dict(row) if row else None


def delete_list(
    db_path: str | Path,
    *,
    owner_id: str,
    list_id: int,
) -> bool:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM restaurant_lists WHERE owner_id = ? AND id = ?",
            (owner_id, list_id),
        )
        connection.commit()
    return cursor.rowcount > 0


def list_items(
    db_path: str | Path,
    *,
    list_id: int,
) -> list[dict[str, object]]:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                i.place_id,
                i.added_at,
                p.name_ja,
                p.name_en,
                p.primary_category,
                r.neighborhood,
                p.fiyu_score,
                p.score_band
            FROM restaurant_list_items i
            JOIN public_restaurants p ON p.place_id = i.place_id
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE i.list_id = ?
            ORDER BY i.added_at ASC, i.id ASC
            """,
            (list_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_item(
    db_path: str | Path,
    *,
    list_id: int,
    place_id: str,
) -> bool:
    ensure_restaurant_list_schema(db_path)
    now = _utc_now()
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT OR IGNORE INTO restaurant_list_items (list_id, place_id, added_at)
            VALUES (?, ?, ?)
            """,
            (list_id, place_id, now),
        )
        connection.execute(
            "UPDATE restaurant_lists SET updated_at = ? WHERE id = ?",
            (now, list_id),
        )
        connection.commit()
    return cursor.rowcount > 0


def remove_item(
    db_path: str | Path,
    *,
    list_id: int,
    place_id: str,
) -> bool:
    ensure_restaurant_list_schema(db_path)
    now = _utc_now()
    with connect(db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM restaurant_list_items WHERE list_id = ? AND place_id = ?",
            (list_id, place_id),
        )
        connection.execute(
            "UPDATE restaurant_lists SET updated_at = ? WHERE id = ?",
            (now, list_id),
        )
        connection.commit()
    return cursor.rowcount > 0


def contains_place_id(
    db_path: str | Path,
    *,
    list_id: int,
    place_id: str,
) -> bool:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT 1 FROM restaurant_list_items
            WHERE list_id = ? AND place_id = ?
            LIMIT 1
            """,
            (list_id, place_id),
        ).fetchone()
    return row is not None


def count_items(
    db_path: str | Path,
    *,
    list_id: int,
) -> int:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM restaurant_list_items
            WHERE list_id = ?
            """,
            (list_id,),
        ).fetchone()
    return int(row["count"] if row else 0)


def count_default_lists_for_owner_city(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
) -> int:
    ensure_restaurant_list_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM restaurant_lists
            WHERE owner_id = ? AND city_id = ? AND list_kind = ?
            """,
            (owner_id, city_id, DEFAULT_LIST_KIND),
        ).fetchone()
    return int(row["count"] if row else 0)


def get_published_restaurant_city(
    db_path: str | Path,
    *,
    place_id: str,
) -> str | None:
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT r.city
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.place_id = ? AND p.is_published = 1 AND p.product_eligible = 1
            LIMIT 1
            """,
            (place_id,),
        ).fetchone()
    if row is None:
        return None
    value = row["city"]
    if value is None:
        return None
    return str(value)
