from __future__ import annotations

import csv
import json
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

from .database import connect
from .public_score import FiyuEvidence, FiyuScoreResult, InternalSignals, calculate_fiyu_score

PUBLIC_SCHEMA = """
CREATE TABLE IF NOT EXISTS public_restaurants (
    place_id TEXT PRIMARY KEY,
    source_restaurant_id INTEGER,

    name_ja TEXT,
    name_en TEXT,
    primary_category TEXT,
    food_tags_json TEXT NOT NULL DEFAULT '[]',
    signature_dishes_json TEXT NOT NULL DEFAULT '[]',
    why_fiyu TEXT,

    local_signal REAL,
    hiddenness_signal REAL,
    quality_signal REAL,
    independence_signal REAL,
    fiyu_score REAL,
    fiyu_confidence REAL,
    confidence_band TEXT,
    score_band TEXT,
    score_version TEXT,

    identity_confidence REAL,
    evidence_json TEXT NOT NULL DEFAULT '{}',
    evidence_urls_json TEXT NOT NULL DEFAULT '[]',

    research_status TEXT NOT NULL DEFAULT 'pending',
    verification_status TEXT NOT NULL DEFAULT 'unresearched',
    research_error TEXT,
    model_name TEXT,
    prompt_version TEXT,
    researched_at TEXT,
    is_published INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_score
    ON public_restaurants(is_published, fiyu_score DESC);
CREATE INDEX IF NOT EXISTS idx_public_research_queue
    ON public_restaurants(research_status, updated_at);
"""


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def ensure_public_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(PUBLIC_SCHEMA)
        connection.commit()


def seed_public_queue(
    db_path: str | Path,
    *,
    limit: int = 50,
    min_internal_score: float = 60.0,
    simple_rule_only: bool = False,
) -> int:
    """Seed research records without erasing completed research.

    place_id is used as the durable key because the internal restaurants table is
    replaced during each ingestion and its integer IDs can change.
    """

    ensure_public_schema(db_path)
    conditions = [
        "candidate_eligible = 1",
        "place_id IS NOT NULL",
        "TRIM(place_id) <> ''",
        "internal_fiyu_score >= ?",
    ]
    parameters: list[object] = [min_internal_score]
    if simple_rule_only:
        conditions.append("matches_simple_rule = 1")
    parameters.append(limit)

    now = _utc_now()
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT id, place_id
            FROM restaurants
            WHERE {' AND '.join(conditions)}
            ORDER BY internal_fiyu_score DESC, confidence_score DESC
            LIMIT ?
            """,
            parameters,
        ).fetchall()
        connection.executemany(
            """
            INSERT INTO public_restaurants (
                place_id, source_restaurant_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(place_id) DO UPDATE SET
                source_restaurant_id = excluded.source_restaurant_id,
                updated_at = excluded.updated_at
            """,
            ((row["place_id"], row["id"], now, now) for row in rows),
        )
        connection.commit()
    return len(rows)


def get_research_queue(
    db_path: str | Path,
    *,
    limit: int = 10,
    retry_failed: bool = False,
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    statuses = ("pending", "failed") if retry_failed else ("pending",)
    placeholders = ",".join("?" for _ in statuses)
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT
                p.place_id,
                p.research_status,
                r.id AS source_restaurant_id,
                r.title,
                r.address,
                r.city,
                r.neighborhood,
                r.latitude,
                r.longitude,
                r.category,
                r.broad_category,
                r.internal_fiyu_score,
                r.quality_score,
                r.underexposure_score,
                r.digital_footprint_score,
                r.rating,
                r.review_count,
                r.maps_url
            FROM public_restaurants p
            JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.research_status IN ({placeholders})
            ORDER BY r.internal_fiyu_score DESC, r.confidence_score DESC
            LIMIT ?
            """,
            (*statuses, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def mark_research_started(db_path: str | Path, place_id: str) -> None:
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET research_status = 'running', research_error = NULL, updated_at = ?
            WHERE place_id = ?
            """,
            (_utc_now(), place_id),
        )
        connection.commit()


def mark_research_failed(db_path: str | Path, place_id: str, error: str) -> None:
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET research_status = 'failed', research_error = ?, updated_at = ?
            WHERE place_id = ?
            """,
            (error[:2000], _utc_now(), place_id),
        )
        connection.commit()


def save_research_result(
    db_path: str | Path,
    *,
    place_id: str,
    evidence: FiyuEvidence,
    score: FiyuScoreResult,
    name_ja: str | None,
    name_en: str | None,
    primary_category: str | None,
    food_tags: Iterable[str],
    signature_dishes: Iterable[str],
    why_fiyu: str,
    evidence_urls: Iterable[str],
    model_name: str,
    prompt_version: str,
) -> None:
    now = _utc_now()
    verification_status = "automatically_researched"
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET
                name_ja = ?,
                name_en = ?,
                primary_category = ?,
                food_tags_json = ?,
                signature_dishes_json = ?,
                why_fiyu = ?,
                local_signal = ?,
                hiddenness_signal = ?,
                quality_signal = ?,
                independence_signal = ?,
                fiyu_score = ?,
                fiyu_confidence = ?,
                confidence_band = ?,
                score_band = ?,
                score_version = ?,
                identity_confidence = ?,
                evidence_json = ?,
                evidence_urls_json = ?,
                research_status = 'complete',
                verification_status = ?,
                research_error = NULL,
                model_name = ?,
                prompt_version = ?,
                researched_at = ?,
                is_published = ?,
                updated_at = ?
            WHERE place_id = ?
            """,
            (
                name_ja,
                name_en,
                primary_category,
                json.dumps(list(food_tags), ensure_ascii=False),
                json.dumps(list(signature_dishes), ensure_ascii=False),
                why_fiyu,
                score.local_signal,
                score.hiddenness_signal,
                score.quality_signal,
                score.independence_signal,
                score.fiyu_score,
                score.fiyu_confidence,
                score.confidence_band,
                score.score_band,
                score.score_version,
                evidence.identity_confidence,
                json.dumps(evidence.to_dict(), ensure_ascii=False),
                json.dumps(sorted(set(evidence_urls)), ensure_ascii=False),
                verification_status,
                model_name,
                prompt_version,
                now,
                1,
                now,
                place_id,
            ),
        )
        connection.commit()


def recalculate_from_stored_evidence(db_path: str | Path) -> int:
    """Recalculate all completed rows for free after changing score weights."""

    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                p.place_id,
                p.evidence_json,
                r.quality_score,
                r.underexposure_score,
                r.digital_footprint_score
            FROM public_restaurants p
            JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.research_status = 'complete'
            """
        ).fetchall()

        count = 0
        for row in rows:
            raw = json.loads(row["evidence_json"] or "{}")
            evidence = FiyuEvidence(**raw)
            internal = InternalSignals(
                quality_score=float(row["quality_score"] or 0),
                underexposure_score=float(row["underexposure_score"] or 0),
                digital_footprint_score=float(row["digital_footprint_score"] or 0),
            )
            score = calculate_fiyu_score(evidence, internal)
            connection.execute(
                """
                UPDATE public_restaurants
                SET local_signal = ?, hiddenness_signal = ?, quality_signal = ?,
                    independence_signal = ?, fiyu_score = ?, fiyu_confidence = ?,
                    confidence_band = ?, score_band = ?, score_version = ?,
                    updated_at = ?
                WHERE place_id = ?
                """,
                (
                    score.local_signal,
                    score.hiddenness_signal,
                    score.quality_signal,
                    score.independence_signal,
                    score.fiyu_score,
                    score.fiyu_confidence,
                    score.confidence_band,
                    score.score_band,
                    score.score_version,
                    _utc_now(),
                    row["place_id"],
                ),
            )
            count += 1
        connection.commit()
    return count


def list_public_restaurants(
    db_path: str | Path,
    *,
    published_only: bool = False,
    limit: int = 100,
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    condition = "WHERE p.is_published = 1" if published_only else ""
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT
                p.*,
                r.title AS candidate_title,
                r.latitude,
                r.longitude,
                r.neighborhood,
                r.broad_category AS candidate_category,
                r.internal_fiyu_score
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            {condition}
            ORDER BY p.fiyu_score DESC NULLS LAST, r.internal_fiyu_score DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    decoded: list[dict[str, object]] = []
    for row in rows:
        item = dict(row)
        # Public/internal-audit label: this is a web-language signal,
        # not proof of customer nationality or local residency.
        item["local_language_web_signal"] = item.pop("local_signal", None)
        for field in ("food_tags_json", "signature_dishes_json", "evidence_urls_json"):
            output = field.removesuffix("_json")
            try:
                item[output] = json.loads(item.pop(field) or "[]")
            except json.JSONDecodeError:
                item[output] = []
        try:
            item["evidence"] = json.loads(item.pop("evidence_json") or "{}")
        except json.JSONDecodeError:
            item["evidence"] = {}
        item["is_published"] = bool(item.get("is_published"))
        decoded.append(item)
    return decoded


def get_public_restaurant(db_path: str | Path, place_id: str) -> dict[str, object] | None:
    rows = _safe_public_rows(db_path, where="p.is_published = 1 AND p.place_id = ?", parameters=(place_id,), limit=1)
    return rows[0] if rows else None


def list_published_restaurants(
    db_path: str | Path, *, limit: int = 100
) -> list[dict[str, object]]:
    return _safe_public_rows(db_path, where="p.is_published = 1", parameters=(), limit=limit)


def _safe_public_rows(
    db_path: str | Path,
    *,
    where: str,
    parameters: tuple[object, ...],
    limit: int,
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
                   r.latitude, r.longitude, r.neighborhood,
                   p.fiyu_score, p.fiyu_confidence, p.confidence_band,
                   p.score_band, p.why_fiyu, p.food_tags_json,
                   p.signature_dishes_json, p.local_signal
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE {where}
            ORDER BY p.fiyu_score DESC
            LIMIT ?
            """,
            (*parameters, limit),
        ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["local_language_web_signal"] = item.pop("local_signal")
        for source, target in (
            ("food_tags_json", "food_tags"),
            ("signature_dishes_json", "signature_dishes"),
        ):
            try:
                value = json.loads(item.pop(source) or "[]")
                item[target] = value if isinstance(value, list) else []
            except json.JSONDecodeError:
                item[target] = []
        results.append(item)
    return results


def set_publication_status(db_path: str | Path, place_id: str, *, published: bool) -> None:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        cursor = connection.execute(
            "UPDATE public_restaurants SET is_published = ?, updated_at = ? WHERE place_id = ?",
            (int(published), _utc_now(), place_id),
        )
        if cursor.rowcount == 0:
            raise ValueError(f"Unknown place_id: {place_id}")
        connection.commit()


def list_review_candidates(db_path: str | Path, *, limit: int = 20) -> list[dict[str, object]]:
    rows = list_public_restaurants(db_path, published_only=False, limit=limit)
    fields = (
        "place_id", "name_ja", "name_en", "candidate_title", "primary_category",
        "neighborhood", "fiyu_score", "fiyu_confidence", "confidence_band",
        "score_band", "why_fiyu", "research_status", "verification_status", "is_published",
    )
    return [{field: row.get(field) for field in fields} for row in rows]


def export_public_csv(
    db_path: str | Path,
    output_path: str | Path,
    *,
    published_only: bool = False,
) -> int:
    rows = list_public_restaurants(db_path, published_only=published_only, limit=100_000)
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = [
        "place_id",
        "name_ja",
        "name_en",
        "candidate_title",
        "neighborhood",
        "primary_category",
        "food_tags",
        "signature_dishes",
        "local_language_web_signal",
        "fiyu_score",
        "fiyu_confidence",
        "confidence_band",
        "score_band",
        "why_fiyu",
        "verification_status",
        "research_status",
        "is_published",
        "researched_at",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            clean = dict(row)
            clean["food_tags"] = ", ".join(clean.get("food_tags") or [])
            clean["signature_dishes"] = ", ".join(clean.get("signature_dishes") or [])
            writer.writerow(clean)
    return len(rows)
