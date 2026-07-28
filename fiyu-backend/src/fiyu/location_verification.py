from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from .database import connect
from .location_anchors import anchor_review_status
from .public_catalog import ensure_public_schema

REVIEW_COLUMNS = [
    "public_restaurant_id",
    "name_ja",
    "name_en",
    "neighborhood",
    "stored_address",
    "existing_latitude",
    "existing_longitude",
    "existing_location_source",
    "existing_coordinate_status",
    "current_map_display_eligible",
    "verified_latitude",
    "verified_longitude",
    "verification_source",
    "verification_source_reference",
    "verified_at",
    "location_precision",
    "reviewer_notes",
]
TOKYO_BOUNDS = (34.8, 36.0, 138.8, 140.2)


@dataclass(frozen=True)
class VerifiedLocation:
    place_id: str
    latitude: float
    longitude: float
    source: str
    source_reference: str
    verified_at: str
    precision: str
    reviewer_notes: str | None


def _untrusted_source(value: str | None) -> bool:
    key = (value or "").casefold().replace("_", " ").replace("-", " ")
    return not key.strip() or "google" in key or "unknown" in key or "scrap" in key


def export_location_review(
    db_path: str | Path, output_path: str | Path, *, limit: int = 20
) -> int:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_ja, p.name_en, r.neighborhood,
                   COALESCE(p.normalized_address, r.address) AS stored_address,
                   r.latitude AS scraped_latitude, r.longitude AS scraped_longitude,
                   p.latitude, p.longitude, p.location_source,
                   p.location_source_reference, p.location_verified_at,
                   p.location_precision, p.location_reviewer_notes,
                   p.map_display_eligible
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.is_published = 1
            ORDER BY p.map_display_eligible, p.fiyu_score DESC, p.place_id
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=REVIEW_COLUMNS)
        writer.writeheader()
        for row in rows:
            eligible = bool(row["map_display_eligible"])
            existing_latitude = row["latitude"] if eligible else row["scraped_latitude"]
            existing_longitude = row["longitude"] if eligible else row["scraped_longitude"]
            existing_source = row["location_source"] or "unknown_scraped_reference"
            writer.writerow(
                {
                    "public_restaurant_id": row["place_id"],
                    "name_ja": row["name_ja"] or "",
                    "name_en": row["name_en"] or "",
                    "neighborhood": row["neighborhood"] or "",
                    "stored_address": row["stored_address"] or "",
                    "existing_latitude": existing_latitude if existing_latitude is not None else "",
                    "existing_longitude": existing_longitude if existing_longitude is not None else "",
                    "existing_location_source": existing_source or "unknown",
                    "existing_coordinate_status": (
                        "independently_verified" if eligible else "UNTRUSTED_REFERENCE_ONLY"
                    ),
                    "current_map_display_eligible": str(eligible).lower(),
                    "verified_latitude": row["latitude"] if eligible else "",
                    "verified_longitude": row["longitude"] if eligible else "",
                    "verification_source": row["location_source"] if eligible else "",
                    "verification_source_reference": (
                        row["location_source_reference"] if eligible else ""
                    ),
                    "verified_at": row["location_verified_at"] if eligible else "",
                    "location_precision": row["location_precision"] if eligible else "",
                    "reviewer_notes": row["location_reviewer_notes"] if eligible else "",
                }
            )
    return len(rows)


def _float(raw: str | None, name: str) -> float:
    try:
        return float(raw or "")
    except ValueError as exc:
        raise ValueError(f"invalid {name}") from exc


def _validate_row(
    raw: dict[str, str], *, known: set[str], untrusted: dict[str, tuple[float | None, float | None]]
) -> VerifiedLocation:
    place_id = (raw.get("public_restaurant_id") or raw.get("place_id") or "").strip()
    if not place_id or place_id not in known:
        raise ValueError("unknown public restaurant ID")
    latitude = _float(raw.get("verified_latitude"), "verified_latitude")
    longitude = _float(raw.get("verified_longitude"), "verified_longitude")
    min_lat, max_lat, min_lng, max_lng = TOKYO_BOUNDS
    if min_lng <= latitude <= max_lng and min_lat <= longitude <= max_lat:
        raise ValueError("verified coordinates appear swapped")
    if not (min_lat <= latitude <= max_lat and min_lng <= longitude <= max_lng):
        raise ValueError("verified coordinates are outside the Tokyo region")
    source = (raw.get("verification_source") or "").strip()
    reference = (raw.get("verification_source_reference") or "").strip()
    if _untrusted_source(source):
        raise ValueError("an independent verification source is required")
    if _untrusted_source(reference):
        raise ValueError("an independent verification source reference is required")
    verified_at = (raw.get("verified_at") or "").strip()
    try:
        date.fromisoformat(verified_at)
    except ValueError as exc:
        raise ValueError("verified_at must be YYYY-MM-DD") from exc
    precision = (raw.get("location_precision") or "").strip()
    if precision not in {"exact", "approximate"}:
        raise ValueError("location_precision must be exact or approximate")
    existing = untrusted.get(place_id)
    if existing == (latitude, longitude) and (
        "manual" not in source.casefold() or not (raw.get("reviewer_notes") or "").strip()
    ):
        raise ValueError(
            "untrusted coordinates cannot be approved by relabeling; document independent checking"
        )
    return VerifiedLocation(
        place_id=place_id,
        latitude=latitude,
        longitude=longitude,
        source=source,
        source_reference=reference,
        verified_at=verified_at,
        precision=precision,
        reviewer_notes=(raw.get("reviewer_notes") or "").strip() or None,
    )


def import_verified_locations(
    db_path: str | Path, input_path: str | Path, *, dry_run: bool = False
) -> dict[str, object]:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        known = {
            str(row["place_id"])
            for row in connection.execute("SELECT place_id FROM public_restaurants")
        }
        untrusted = {
            str(row["place_id"]): (row["latitude"], row["longitude"])
            for row in connection.execute(
                """
                SELECT r.place_id, COALESCE(p.latitude, r.latitude) AS latitude,
                       COALESCE(p.longitude, r.longitude) AS longitude
                FROM restaurants r JOIN public_restaurants p ON p.place_id = r.place_id
                WHERE p.map_display_eligible = 0
                """
            )
        }
    with Path(input_path).open(newline="", encoding="utf-8-sig") as handle:
        raw_rows = list(csv.DictReader(handle))
    reports: list[dict[str, object]] = []
    valid: list[VerifiedLocation] = []
    seen: set[str] = set()
    for line, raw in enumerate(raw_rows, start=2):
        place_id = (raw.get("public_restaurant_id") or raw.get("place_id") or "").strip()
        try:
            if place_id in seen:
                raise ValueError("duplicate public restaurant ID")
            seen.add(place_id)
            result = _validate_row(raw, known=known, untrusted=untrusted)
            valid.append(result)
            reports.append({"line": line, "place_id": place_id, "valid": True, "errors": []})
        except ValueError as exc:
            reports.append(
                {"line": line, "place_id": place_id or None, "valid": False, "errors": [str(exc)]}
            )
    failures = sum(not bool(report["valid"]) for report in reports)
    if not failures and not dry_run:
        now = datetime.now(UTC).isoformat()
        with connect(db_path) as connection:
            connection.executemany(
                """
                UPDATE public_restaurants
                SET latitude = ?, longitude = ?, location_source = ?,
                    location_source_reference = ?, location_verified_at = ?,
                    location_precision = ?, location_reviewer_notes = ?,
                    map_display_eligible = 1, updated_at = ?
                WHERE place_id = ?
                """,
                (
                    (
                        row.latitude, row.longitude, row.source, row.source_reference,
                        row.verified_at, row.precision, row.reviewer_notes, now, row.place_id,
                    )
                    for row in valid
                ),
            )
            connection.commit()
    return {
        "rows": len(reports),
        "valid": len(valid),
        "validation_failures": failures,
        "updated": len(valid) if not failures and not dry_run else 0,
        "dry_run": dry_run,
        "reports": reports,
    }


def location_status(db_path: str | Path) -> dict[str, object]:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) AS published,
                   SUM(CASE WHEN is_published = 1 AND map_display_eligible = 1 THEN 1 ELSE 0 END)
                       AS eligible,
                   SUM(CASE WHEN is_published = 1 AND map_display_eligible = 0
                                 AND (location_source IS NULL OR location_source = ''
                                      OR lower(location_source) LIKE '%unknown%'
                                      OR lower(location_source) LIKE '%google%')
                            THEN 1 ELSE 0 END) AS unknown,
                   SUM(CASE WHEN is_published = 1 AND map_display_eligible = 0 THEN 1 ELSE 0 END)
                       AS awaiting,
                   SUM(CASE WHEN map_display_eligible = 1 AND
                                 (latitude IS NULL OR longitude IS NULL OR location_source IS NULL
                                  OR location_verified_at IS NULL
                                  OR location_precision NOT IN ('exact', 'approximate'))
                            THEN 1 ELSE 0 END) AS failures
            FROM public_restaurants
            """
        ).fetchone()
    anchors = anchor_review_status()
    with connect(db_path) as connection:
        status_rows = connection.execute(
            """
            SELECT location_verification_status, COUNT(*) AS count
            FROM public_restaurants WHERE is_published = 1
            GROUP BY location_verification_status
            """
        ).fetchall()
        precision_rows = connection.execute(
            """
            SELECT location_precision, COUNT(*) AS count FROM public_restaurants
            WHERE map_display_eligible = 1 GROUP BY location_precision
            """
        ).fetchall()
        source_rows = connection.execute(
            """
            SELECT location_source, COUNT(*) AS count FROM public_restaurants
            WHERE map_display_eligible = 1 GROUP BY location_source
            """
        ).fetchall()
    statuses = {str(item["location_verification_status"]): int(item["count"]) for item in status_rows}
    return {
        "published_restaurants": int(row["published"] or 0),
        "map_eligible_restaurants": int(row["eligible"] or 0),
        "unknown_provenance_restaurants": int(row["unknown"] or 0),
        "restaurants_awaiting_verification": int(row["awaiting"] or 0),
        "reviewed_anchors": anchors["reviewed"],
        "unreviewed_anchors": anchors["unreviewed"],
        "validation_failures": int(row["failures"] or 0) + anchors["failures"],
        "osm_auto_verified_restaurants": statuses.get("osm_auto_verified", 0),
        "manually_verified_restaurants": statuses.get("manually_verified", 0),
        "needs_review_restaurants": statuses.get("needs_manual_review", 0),
        "unresolved_restaurants": statuses.get("unresolved", 0),
        "precision_distribution": {
            str(item["location_precision"] or "unknown"): int(item["count"])
            for item in precision_rows
        },
        "source_distribution": {
            str(item["location_source"] or "unknown"): int(item["count"])
            for item in source_rows
        },
    }
