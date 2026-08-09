from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from .database import connect
from .utils import haversine_km

DAILY_PICKS_SCHEMA = """
CREATE TABLE IF NOT EXISTS daily_pick_rounds (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    city_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_pick_rounds_owner
    ON daily_pick_rounds(owner_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS daily_pick_served_history (
    owner_id TEXT NOT NULL,
    restaurant_place_id TEXT NOT NULL,
    first_served_at TEXT NOT NULL,
    selection_round_id TEXT,
    PRIMARY KEY (owner_id, restaurant_place_id),
    FOREIGN KEY (selection_round_id) REFERENCES daily_pick_rounds(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_pick_served_owner
    ON daily_pick_served_history(owner_id, first_served_at);
"""

NonJapanesePreference = Literal["yes", "occasionally", "japanese-only"]

PREFERENCE_TERMS: dict[str, tuple[str, ...]] = {
    "sushi": ("sushi", "寿司", "鮨", "江戸前"),
    "izakaya": ("izakaya", "居酒屋", "立ち飲み", "日本酒"),
    "noodles": ("ramen", "soba", "udon", "ラーメン", "そば", "蕎麦", "うどん", "沖縄そば"),
    "yakiniku": ("yakiniku", "焼肉", "和牛", "牛たん", "牛タン"),
    "yakitori": ("yakitori", "焼き鳥", "焼鳥", "鳥料理", "鳥割烹"),
    "tempura": ("tempura", "天ぷら", "天麩羅"),
}

JAPANESE_OTHER_TERMS = (
    "japanese",
    "日本料理",
    "和食",
    "おばんざい",
    "懐石",
    "割烹",
    "丼",
    "定食",
    "しゃぶしゃぶ",
    "すき焼き",
    "お好み焼き",
)


@dataclass(frozen=True)
class DailyPickAssignment:
    round_id: str
    place_ids: tuple[str, ...]
    assigned_at: str


@dataclass(frozen=True)
class InsufficientUnseenPoolError(ValueError):
    available_count: int
    required_count: int


def ensure_daily_picks_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(DAILY_PICKS_SCHEMA)
        connection.commit()


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _unique_ids(place_ids: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in place_ids if value.strip()))


def seed_served_history(
    db_path: str | Path,
    *,
    owner_id: str,
    place_ids: Iterable[str],
    first_served_at: str | None = None,
) -> int:
    """Persist reliable legacy assignments without creating duplicate rows."""
    ensure_daily_picks_schema(db_path)
    values = _unique_ids(place_ids)
    if not values:
        return 0
    served_at = first_served_at or _now_iso()
    with connect(db_path) as connection:
        before = connection.total_changes
        connection.executemany(
            """
            INSERT OR IGNORE INTO daily_pick_served_history (
                owner_id, restaurant_place_id, first_served_at, selection_round_id
            ) VALUES (?, ?, ?, NULL)
            """,
            ((owner_id, place_id, served_at) for place_id in values),
        )
        inserted = connection.total_changes - before
        connection.commit()
    return inserted


def served_place_ids(db_path: str | Path, *, owner_id: str) -> set[str]:
    ensure_daily_picks_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT restaurant_place_id
            FROM daily_pick_served_history
            WHERE owner_id = ?
            """,
            (owner_id,),
        ).fetchall()
    return {str(row["restaurant_place_id"]) for row in rows}


def _json_strings(value: object) -> list[str]:
    try:
        parsed = json.loads(str(value or "[]"))
    except json.JSONDecodeError:
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def _category(row: dict[str, object]) -> str:
    text = " ".join(
        [str(row.get("primary_category") or ""), *_json_strings(row.get("food_tags_json"))]
    ).lower()
    for category, terms in PREFERENCE_TERMS.items():
        if any(term.lower() in text for term in terms):
            return category
    if any(term.lower() in text for term in JAPANESE_OTHER_TERMS):
        return "japanese-other"
    return "non-japanese"


def _in_area(row: dict[str, object], active_area: str | None) -> bool:
    if not active_area:
        return False
    expected = active_area.strip().lower()
    if str(row.get("discovery_area") or "").strip().lower() == expected:
        return True
    try:
        areas = json.loads(str(row.get("discovery_areas_json") or "[]"))
    except json.JSONDecodeError:
        return False
    return any(
        isinstance(area, dict) and str(area.get("area") or "").strip().lower() == expected
        for area in areas
    )


def _stable_hash(value: str) -> int:
    result = 2166136261
    for character in value:
        result ^= ord(character)
        result = (result * 16777619) & 0xFFFFFFFF
    return result


def _select(
    rows: list[dict[str, object]],
    *,
    categories: Iterable[str],
    non_japanese: NonJapanesePreference,
    active_area: str | None,
    discovery_latitude: float | None,
    discovery_longitude: float | None,
    seed: int,
    count: int,
) -> tuple[list[str], int]:
    selected_categories = set(categories)
    candidates: list[dict[str, object]] = []
    for row in rows:
        category = _category(row)
        if non_japanese == "japanese-only" and category == "non-japanese":
            continue
        preference_rank = (
            0
            if not selected_categories or category in selected_categories
            else 2 if category == "non-japanese" else 1
        )
        score = row.get("fiyu_score")
        score_band = int(float(score) // 5) if score is not None else -1
        latitude = row.get("latitude")
        longitude = row.get("longitude")
        distance_km = (
            haversine_km(
                discovery_latitude,
                discovery_longitude,
                float(latitude),
                float(longitude),
            )
            if discovery_latitude is not None
            and discovery_longitude is not None
            and latitude is not None
            and longitude is not None
            else float("inf")
        )
        candidates.append(
            {
                "place_id": str(row["place_id"]),
                "category": category,
                "preference_rank": preference_rank,
                "area_rank": 0 if _in_area(row, active_area) else 1,
                "distance_km": distance_km,
                "score_band": score_band,
                "rotation": _stable_hash(f"{seed}:{row['place_id']}"),
            }
        )
    candidates.sort(
        key=lambda item: (
            item["preference_rank"],
            item["distance_km"],
            item["area_rank"],
            -int(item["score_band"]),
            item["rotation"],
            item["place_id"],
        )
    )

    result: list[dict[str, object]] = []
    used_categories: set[str] = set()
    non_japanese_limit = 1 if non_japanese == "occasionally" else count

    def may_add(candidate: dict[str, object]) -> bool:
        return candidate["category"] != "non-japanese" or sum(
            entry["category"] == "non-japanese" for entry in result
        ) < non_japanese_limit

    for candidate in candidates:
        if len(result) == count:
            break
        category = str(candidate["category"])
        if category in used_categories or not may_add(candidate):
            continue
        result.append(candidate)
        used_categories.add(category)
    for candidate in candidates:
        if len(result) == count:
            break
        if candidate in result or not may_add(candidate):
            continue
        result.append(candidate)
    return [str(item["place_id"]) for item in result], len(candidates)


def assign_daily_picks(
    db_path: str | Path,
    *,
    owner_id: str,
    city_id: str,
    candidate_place_ids: Iterable[str],
    categories: Iterable[str],
    non_japanese: NonJapanesePreference,
    active_area: str | None,
    seed: int,
    discovery_latitude: float | None = None,
    discovery_longitude: float | None = None,
    requested_count: int = 3,
) -> DailyPickAssignment:
    """Choose and persist an unseen set in one write transaction."""
    ensure_daily_picks_schema(db_path)
    candidate_ids = _unique_ids(candidate_place_ids)
    assigned_at = _now_iso()
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        served = {
            str(row["restaurant_place_id"])
            for row in connection.execute(
                "SELECT restaurant_place_id FROM daily_pick_served_history WHERE owner_id = ?",
                (owner_id,),
            ).fetchall()
        }
        unseen_ids = [place_id for place_id in candidate_ids if place_id not in served]
        if unseen_ids:
            placeholders = ",".join("?" for _ in unseen_ids)
            rows = connection.execute(
                f"""
                SELECT place_id, primary_category, food_tags_json, discovery_area,
                       latitude, longitude,
                       discovery_areas_json, fiyu_score
                FROM public_restaurants
                WHERE is_published = 1 AND place_id IN ({placeholders})
                """,
                unseen_ids,
            ).fetchall()
        else:
            rows = []
        selected, available_count = _select(
            [dict(row) for row in rows],
            categories=categories,
            non_japanese=non_japanese,
            active_area=active_area,
            discovery_latitude=discovery_latitude,
            discovery_longitude=discovery_longitude,
            seed=seed,
            count=requested_count,
        )
        if len(selected) != requested_count:
            connection.rollback()
            raise InsufficientUnseenPoolError(available_count, requested_count)

        round_id = str(uuid4())
        connection.execute(
            "INSERT INTO daily_pick_rounds (id, owner_id, city_id, assigned_at) VALUES (?, ?, ?, ?)",
            (round_id, owner_id, city_id, assigned_at),
        )
        connection.executemany(
            """
            INSERT INTO daily_pick_served_history (
                owner_id, restaurant_place_id, first_served_at, selection_round_id
            ) VALUES (?, ?, ?, ?)
            """,
            ((owner_id, place_id, assigned_at, round_id) for place_id in selected),
        )
        connection.commit()
    return DailyPickAssignment(round_id, tuple(selected), assigned_at)
