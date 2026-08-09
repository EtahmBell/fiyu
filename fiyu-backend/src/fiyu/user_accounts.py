from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .database import connect

ACCOUNT_SCHEMA = """
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    auth_email TEXT,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (LENGTH(username) BETWEEN 3 AND 30),
    CHECK (username NOT GLOB '*[^a-z0-9_]*'),
    CHECK (display_name IS NULL OR LENGTH(display_name) <= 50),
    CHECK (bio IS NULL OR LENGTH(bio) <= 160)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_nocase
    ON user_profiles(username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS contact_submissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    CHECK (LENGTH(name) BETWEEN 1 AND 100),
    CHECK (LENGTH(email) BETWEEN 3 AND 320),
    CHECK (LENGTH(message) BETWEEN 1 AND 4000),
    CHECK (status IN ('new'))
);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_created
    ON contact_submissions(status, created_at DESC);
"""


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def ensure_account_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(ACCOUNT_SCHEMA)
        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(user_profiles)").fetchall()
        }
        if "auth_email" not in columns:
            connection.execute("ALTER TABLE user_profiles ADD COLUMN auth_email TEXT")
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_auth_email_nocase
            ON user_profiles(auth_email COLLATE NOCASE)
            WHERE auth_email IS NOT NULL
            """
        )
        connection.execute("PRAGMA optimize")
        connection.commit()


def username_available(db_path: str | Path, *, username: str) -> bool:
    ensure_account_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT 1 FROM user_profiles WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
    return row is None


def create_profile(
    db_path: str | Path,
    *,
    user_id: str,
    username: str,
    auth_email: str | None = None,
) -> dict[str, object] | None:
    ensure_account_schema(db_path)
    now = _utc_now()
    try:
        with connect(db_path) as connection:
            existing = connection.execute(
                "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
            ).fetchone()
            if existing is not None:
                if auth_email and existing["auth_email"] != auth_email:
                    connection.execute(
                        "UPDATE user_profiles SET auth_email = ?, updated_at = ? WHERE user_id = ?",
                        (auth_email, now, user_id),
                    )
                    existing = connection.execute(
                        "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
                    ).fetchone()
                    connection.commit()
                return dict(existing)
            connection.execute(
                """
                INSERT INTO user_profiles
                    (user_id, username, auth_email, display_name, bio, avatar_url, created_at, updated_at)
                VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?)
                """,
                (user_id, username, auth_email, now, now),
            )
            row = connection.execute(
                "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
            ).fetchone()
            connection.commit()
    except sqlite3.IntegrityError:
        return None
    return dict(row) if row else None


def resolve_auth_email(db_path: str | Path, *, username: str) -> str | None:
    """Resolve a private auth email without exposing it through an API response."""
    ensure_account_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT auth_email FROM user_profiles WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
    if row is None or row["auth_email"] is None:
        return None
    return str(row["auth_email"])


def link_profile_auth_email(
    db_path: str | Path,
    *,
    user_id: str,
    auth_email: str,
) -> dict[str, object] | None:
    """Idempotently backfill the server-only username-to-auth mapping."""
    ensure_account_schema(db_path)
    try:
        with connect(db_path) as connection:
            connection.execute(
                "UPDATE user_profiles SET auth_email = ?, updated_at = ? WHERE user_id = ?",
                (auth_email, _utc_now(), user_id),
            )
            row = connection.execute(
                "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
            ).fetchone()
            connection.commit()
    except sqlite3.IntegrityError:
        return None
    return dict(row) if row else None


def get_profile(db_path: str | Path, *, user_id: str) -> dict[str, object] | None:
    ensure_account_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def update_profile(
    db_path: str | Path,
    *,
    user_id: str,
    username: str,
    display_name: str | None,
    bio: str | None,
) -> dict[str, object] | None:
    ensure_account_schema(db_path)
    try:
        with connect(db_path) as connection:
            cursor = connection.execute(
                """
                UPDATE user_profiles
                SET username = ?, display_name = ?, bio = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (username, display_name, bio, _utc_now(), user_id),
            )
            if cursor.rowcount == 0:
                return None
            row = connection.execute(
                "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
            ).fetchone()
            connection.commit()
    except sqlite3.IntegrityError:
        return None
    return dict(row) if row else None


def create_contact_submission(
    db_path: str | Path,
    *,
    name: str,
    email: str,
    message: str,
) -> dict[str, object]:
    ensure_account_schema(db_path)
    submission_id = str(uuid4())
    created_at = _utc_now()
    with connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO contact_submissions (id, name, email, message, status, created_at)
            VALUES (?, ?, ?, ?, 'new', ?)
            """,
            (submission_id, name, email, message, created_at),
        )
        connection.commit()
    return {"id": submission_id, "status": "new", "created_at": created_at}
