from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from typing import Iterable

from .config import ScoringConfig


SCHEMA = """
CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id TEXT,
    cid TEXT,
    title TEXT NOT NULL,
    address TEXT,
    city TEXT,
    neighborhood TEXT,
    latitude REAL,
    longitude REAL,
    search_area TEXT,
    source_areas_json TEXT NOT NULL DEFAULT '[]',
    category TEXT,
    broad_category TEXT,
    rating REAL NOT NULL,
    review_count INTEGER NOT NULL,
    website TEXT,
    website_domain TEXT,
    digital_footprint_type TEXT,
    chain_flag INTEGER NOT NULL DEFAULT 0,
    chain_reason TEXT,
    adjusted_rating REAL,
    quality_score REAL,
    underexposure_score REAL,
    digital_footprint_score REAL,
    confidence_score REAL,
    independent_score REAL,
    score_penalty REAL,
    internal_fiyu_score REAL,
    candidate_tier TEXT,
    confidence_band TEXT,
    matches_simple_rule INTEGER NOT NULL DEFAULT 0,
    candidate_eligible INTEGER NOT NULL DEFAULT 0,
    score_reasons_json TEXT NOT NULL DEFAULT '[]',
    peer_group_size INTEGER,
    peer_review_percentile REAL,
    maps_url TEXT,
    image_url TEXT,
    price TEXT,
    phone TEXT,
    scraped_at TEXT,
    source_files_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_restaurants_geo ON restaurants(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_restaurants_score ON restaurants(internal_fiyu_score DESC);
CREATE INDEX IF NOT EXISTS idx_restaurants_area ON restaurants(search_area);
CREATE INDEX IF NOT EXISTS idx_restaurants_category ON restaurants(broad_category);
CREATE INDEX IF NOT EXISTS idx_restaurants_candidate ON restaurants(candidate_eligible, internal_fiyu_score DESC);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


INSERT_COLUMNS = [
    "place_id",
    "cid",
    "title",
    "address",
    "city",
    "neighborhood",
    "latitude",
    "longitude",
    "search_area",
    "source_areas_json",
    "category",
    "broad_category",
    "rating",
    "review_count",
    "website",
    "website_domain",
    "digital_footprint_type",
    "chain_flag",
    "chain_reason",
    "adjusted_rating",
    "quality_score",
    "underexposure_score",
    "digital_footprint_score",
    "confidence_score",
    "independent_score",
    "score_penalty",
    "internal_fiyu_score",
    "candidate_tier",
    "confidence_band",
    "matches_simple_rule",
    "candidate_eligible",
    "score_reasons_json",
    "peer_group_size",
    "peer_review_percentile",
    "maps_url",
    "image_url",
    "price",
    "phone",
    "scraped_at",
    "source_files_json",
]


class ClosingConnection(sqlite3.Connection):
    """A SQLite connection whose context manager also closes the file handle."""

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        try:
            return bool(super().__exit__(exc_type, exc_value, traceback))
        finally:
            self.close()


def connect(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, factory=ClosingConnection)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def _row_values(record: dict[str, object]) -> tuple[object, ...]:
    scraped_at = record.get("scraped_at")
    if hasattr(scraped_at, "isoformat"):
        scraped_at = scraped_at.isoformat()
    mapped = {
        **record,
        "source_areas_json": json.dumps(record.get("source_areas") or [], ensure_ascii=False),
        "source_files_json": json.dumps(record.get("source_files") or [], ensure_ascii=False),
        "score_reasons_json": json.dumps(record.get("score_reasons") or [], ensure_ascii=False),
        "chain_flag": int(bool(record.get("chain_flag"))),
        "matches_simple_rule": int(bool(record.get("matches_simple_rule"))),
        "candidate_eligible": int(bool(record.get("candidate_eligible"))),
        "scraped_at": scraped_at,
    }
    return tuple(mapped.get(column) for column in INSERT_COLUMNS)


def replace_restaurants(
    db_path: str | Path, records: Iterable[dict[str, object]], config: ScoringConfig
) -> None:
    records = list(records)
    placeholders = ", ".join("?" for _ in INSERT_COLUMNS)
    columns = ", ".join(INSERT_COLUMNS)
    sql = f"INSERT INTO restaurants ({columns}) VALUES ({placeholders})"
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.execute("DELETE FROM restaurants")
        connection.executemany(sql, (_row_values(record) for record in records))
        metadata = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "restaurant_count": str(len(records)),
            "scoring_config": json.dumps(config.to_dict(), ensure_ascii=False),
            "score_status": "internal_provisional",
        }
        connection.executemany(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)", metadata.items()
        )
        connection.commit()


def decode_restaurant_row(row: sqlite3.Row | dict[str, object]) -> dict[str, object]:
    item = dict(row)
    for json_field, output_field in (
        ("source_areas_json", "source_areas"),
        ("source_files_json", "source_files"),
        ("score_reasons_json", "score_reasons"),
    ):
        raw = item.pop(json_field, "[]")
        try:
            item[output_field] = json.loads(str(raw or "[]"))
        except json.JSONDecodeError:
            item[output_field] = []
    for field in ("chain_flag", "matches_simple_rule", "candidate_eligible"):
        item[field] = bool(item.get(field))
    return item
