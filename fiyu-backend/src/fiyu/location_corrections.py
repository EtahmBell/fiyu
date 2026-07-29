from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path

from .database import connect
from .location_verification import TOKYO_BOUNDS
from .public_catalog import ensure_public_schema


def _validate_coordinates(latitude: float, longitude: float) -> list[str]:
    errors: list[str] = []
    min_lat, max_lat, min_lon, max_lon = TOKYO_BOUNDS
    if min_lon <= latitude <= max_lon and min_lat <= longitude <= max_lat:
        errors.append("latitude and longitude appear swapped")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        errors.append("coordinates are outside valid numeric ranges")
    elif not (min_lat <= latitude <= max_lat and min_lon <= longitude <= max_lon):
        errors.append("coordinates are outside Tokyo bounds")
    return errors


def replace_location(
    db_path: str | Path,
    *,
    place_id: str,
    latitude: float | None,
    longitude: float | None,
    source_reference: str,
    reason: str,
    reviewed_by: str,
    reviewed_at: str,
    remove: bool = False,
    allow_manual_override: bool = False,
    dry_run: bool = False,
) -> dict[str, object]:
    errors: list[str] = []
    if not reason.strip():
        errors.append("correction reason is required")
    if not source_reference.strip():
        errors.append("source reference is required")
    if "google" in source_reference.casefold():
        errors.append("Google-derived correction provenance is not permitted")
    if not reviewed_by.strip():
        errors.append("reviewed_by is required")
    try:
        if date.fromisoformat(reviewed_at).isoformat() != reviewed_at:
            raise ValueError
    except ValueError:
        errors.append("reviewed_at must be YYYY-MM-DD")
    if remove:
        if latitude is not None or longitude is not None:
            errors.append("--remove cannot be combined with coordinates")
    elif latitude is None or longitude is None:
        errors.append("replacement latitude and longitude are required")
    else:
        errors.extend(_validate_coordinates(latitude, longitude))

    path = Path(db_path).resolve().as_posix()
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        current = connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id=?", (place_id,)
        ).fetchone()
    if current is None:
        errors.append("unknown place_id")
    elif (
        (
            current["location_verification_status"] in {"manually_verified", "osm_auto_verified"}
            or (
                current["map_display_eligible"]
                and current["location_verification_status"]
                in {"unknown_provenance", "unresolved"}
            )
        )
        and not allow_manual_override
    ):
        errors.append(
            "existing manually/OSM-verified location requires --allow-manual-override"
        )
    report = {
        "place_id": place_id,
        "action": "remove" if remove else "replace",
        "valid": not errors,
        "errors": errors,
        "dry_run": dry_run,
        "updated": False,
    }
    if errors or dry_run:
        return report

    ensure_public_schema(db_path)
    now = datetime.now(UTC).isoformat()
    assert current is not None
    with connect(db_path) as connection:
        if current["latitude"] is not None and current["longitude"] is not None:
            connection.execute(
                """
                INSERT INTO location_history (
                    public_restaurant_id, latitude, longitude, normalized_address,
                    location_source, location_source_reference,
                    location_verification_status, location_verification_tier,
                    location_precision, map_location_approximate,
                    map_display_eligible, location_status, change_reason,
                    reviewed_by, reviewed_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    place_id, current["latitude"], current["longitude"],
                    current["normalized_address"], current["location_source"],
                    current["location_source_reference"],
                    current["location_verification_status"],
                    current["location_verification_tier"],
                    current["map_location_precision"] or current["location_precision"],
                    current["map_location_approximate"], current["map_display_eligible"],
                    "location_removed" if remove else "location_superseded",
                    reason.strip(), reviewed_by.strip(), reviewed_at, now,
                ),
            )
        if remove:
            connection.execute(
                """
                UPDATE public_restaurants SET latitude=NULL, longitude=NULL,
                    map_display_eligible=0, location_status='location_removed',
                    location_verification_status='location_removed',
                    location_reviewer_notes=?, location_reviewed_by=?, location_reviewed_at=?,
                    updated_at=? WHERE place_id=?
                """,
                (reason.strip(), reviewed_by.strip(), reviewed_at, now, place_id),
            )
        else:
            connection.execute(
                """
                UPDATE public_restaurants SET latitude=?, longitude=?,
                    location_source='manual_correction', location_source_reference=?,
                    location_verified_at=?, location_reviewed_by=?, location_reviewed_at=?,
                    location_reviewer_notes=?, location_verification_status='manually_verified',
                    location_verification_tier='manual', location_status='location_active',
                    location_precision='exact', map_location_precision='exact_entrance',
                    map_location_approximate=0, map_display_eligible=1, updated_at=?
                WHERE place_id=?
                """,
                (
                    latitude, longitude, source_reference.strip(), reviewed_at,
                    reviewed_by.strip(), reviewed_at, reason.strip(), now, place_id,
                ),
            )
            connection.execute(
                """
                INSERT INTO location_history (
                    public_restaurant_id, latitude, longitude, normalized_address,
                    location_source, location_source_reference,
                    location_verification_status, location_verification_tier,
                    location_precision, map_location_approximate, map_display_eligible,
                    location_status, change_reason, reviewed_by, reviewed_at, created_at
                ) VALUES (?, ?, ?, ?, 'manual_correction', ?, 'manually_verified', 'manual',
                          'exact_entrance', 0, 1, 'location_active', ?, ?, ?, ?)
                """,
                (
                    place_id, latitude, longitude, current["normalized_address"],
                    source_reference.strip(), reason.strip(), reviewed_by.strip(), reviewed_at, now,
                ),
            )
        connection.commit()
    report["updated"] = True
    return report
