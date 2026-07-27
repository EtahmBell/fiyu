from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from .database import connect
from .public_catalog import ensure_public_schema

PRECISIONS = {"exact", "approximate", "area_anchor"}


class LocationImportError(ValueError):
    pass


@dataclass(frozen=True)
class LocationImportRow:
    place_id: str
    latitude: float
    longitude: float
    normalized_address: str | None
    source: str
    verified_at: str
    precision: str


def _parse_float(value: str | None, *, field: str, line: int) -> float:
    try:
        return float(value or "")
    except ValueError as exc:
        raise LocationImportError(f"line {line}: invalid {field}") from exc


def _resolve_place_id(
    connection, raw: dict[str, str], *, line: int
) -> str:
    place_id = (raw.get("place_id") or "").strip()
    internal_id = (raw.get("restaurant_id") or raw.get("internal_restaurant_id") or "").strip()
    if bool(place_id) == bool(internal_id):
        raise LocationImportError(
            f"line {line}: provide exactly one of place_id or restaurant_id"
        )
    if internal_id:
        if not internal_id.isdigit():
            raise LocationImportError(f"line {line}: invalid restaurant_id")
        row = connection.execute(
            "SELECT place_id FROM restaurants WHERE id = ?", (int(internal_id),)
        ).fetchone()
        if row is None or not row["place_id"]:
            raise LocationImportError(f"line {line}: restaurant_id has no place_id")
        place_id = str(row["place_id"])
    exists = connection.execute(
        "SELECT 1 FROM public_restaurants WHERE place_id = ?", (place_id,)
    ).fetchone()
    if exists is None:
        raise LocationImportError(f"line {line}: unknown public restaurant {place_id}")
    return place_id


def read_location_import(
    db_path: str | Path,
    csv_path: str | Path,
    *,
    min_latitude: float = 34.8,
    max_latitude: float = 36.0,
    min_longitude: float = 138.8,
    max_longitude: float = 140.2,
) -> list[LocationImportRow]:
    ensure_public_schema(db_path)
    rows: list[LocationImportRow] = []
    seen: set[str] = set()
    with connect(db_path) as connection, Path(csv_path).open(
        newline="", encoding="utf-8-sig"
    ) as handle:
        for line, raw in enumerate(csv.DictReader(handle), start=2):
            place_id = _resolve_place_id(connection, raw, line=line)
            if place_id in seen:
                raise LocationImportError(f"line {line}: duplicate restaurant {place_id}")
            seen.add(place_id)
            latitude = _parse_float(raw.get("latitude"), field="latitude", line=line)
            longitude = _parse_float(raw.get("longitude"), field="longitude", line=line)
            if min_longitude <= latitude <= max_longitude and min_latitude <= longitude <= max_latitude:
                raise LocationImportError(f"line {line}: coordinates appear swapped")
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise LocationImportError(f"line {line}: coordinates are outside global bounds")
            if not (
                min_latitude <= latitude <= max_latitude
                and min_longitude <= longitude <= max_longitude
            ):
                raise LocationImportError(f"line {line}: coordinates are outside the Tokyo region")
            source = (raw.get("source") or raw.get("location_source") or "").strip()
            source_key = source.casefold().replace("_", " ").replace("-", " ")
            if not source or "google" in source_key or "unknown" in source_key:
                raise LocationImportError(f"line {line}: independent source is required")
            verified_at = (raw.get("verified_at") or raw.get("location_verified_at") or "").strip()
            try:
                date.fromisoformat(verified_at)
            except ValueError as exc:
                raise LocationImportError(
                    f"line {line}: verification date must be YYYY-MM-DD"
                ) from exc
            precision = (raw.get("precision") or raw.get("location_precision") or "").strip()
            if precision not in PRECISIONS:
                raise LocationImportError(f"line {line}: invalid precision")
            address = (raw.get("normalized_address") or raw.get("address") or "").strip() or None
            rows.append(
                LocationImportRow(
                    place_id=place_id,
                    latitude=latitude,
                    longitude=longitude,
                    normalized_address=address,
                    source=source,
                    verified_at=verified_at,
                    precision=precision,
                )
            )
    return rows


def import_locations(
    db_path: str | Path,
    csv_path: str | Path,
    *,
    dry_run: bool = False,
    **region: float,
) -> dict[str, object]:
    rows = read_location_import(db_path, csv_path, **region)
    if not dry_run:
        updated_at = datetime.now(UTC).isoformat()
        with connect(db_path) as connection:
            connection.executemany(
                """
                UPDATE public_restaurants
                SET latitude = ?, longitude = ?, normalized_address = ?,
                    location_source = ?, location_verified_at = ?,
                    location_precision = ?, map_display_eligible = 1,
                    updated_at = ?
                WHERE place_id = ?
                """,
                (
                    (
                        row.latitude,
                        row.longitude,
                        row.normalized_address,
                        row.source,
                        row.verified_at,
                        row.precision,
                        updated_at,
                        row.place_id,
                    )
                    for row in rows
                ),
            )
            connection.commit()
    return {
        "validated": len(rows),
        "updated": 0 if dry_run else len(rows),
        "dry_run": dry_run,
        "place_ids": [row.place_id for row in rows],
    }
