from __future__ import annotations

import csv
from datetime import UTC, date, datetime
from pathlib import Path

from .database import connect
from .public_catalog import ensure_public_schema

OSM_REVIEW_COLUMNS = [
    "public_restaurant_id", "name_ja", "name_en", "neighborhood", "category",
    "candidate_rank", "candidate_osm_name", "candidate_osm_alternate_names",
    "candidate_latitude", "candidate_longitude", "osm_type", "osm_id", "osm_version",
    "cuisine", "candidate_address", "total_match_score", "score_components", "warnings",
    "proposed_decision", "reviewer_decision", "reviewer_notes", "reviewed_by", "reviewed_at",
]
DECISIONS = {"approve", "reject", "unresolved"}


def export_osm_location_review(
    db_path: str | Path, output_path: str | Path, *, status: str = "needs_manual_review",
    limit: int = 100,
) -> int:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_ja, p.name_en, r.neighborhood,
                   p.primary_category AS category, c.*
            FROM public_restaurants p
            JOIN location_match_candidates c ON c.place_id = p.place_id
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.is_published = 1 AND p.location_verification_status = ?
            ORDER BY p.fiyu_score DESC, p.place_id, c.candidate_rank LIMIT ?
            """, (status, limit),
        ).fetchall()
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=OSM_REVIEW_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "public_restaurant_id": row["place_id"], "name_ja": row["name_ja"] or "",
                "name_en": row["name_en"] or "", "neighborhood": row["neighborhood"] or "",
                "category": row["category"] or "", "candidate_rank": row["candidate_rank"],
                "candidate_osm_name": row["candidate_name"] or "",
                "candidate_osm_alternate_names": row["alternate_names_json"],
                "candidate_latitude": row["latitude"], "candidate_longitude": row["longitude"],
                "osm_type": row["osm_type"], "osm_id": row["osm_id"],
                "osm_version": row["osm_version"] or "", "cuisine": row["cuisine"] or "",
                "candidate_address": row["address_json"], "total_match_score": row["total_score"],
                "score_components": row["score_components_json"], "warnings": row["warnings_json"],
                "proposed_decision": row["proposed_decision"], "reviewer_decision": "",
                "reviewer_notes": "", "reviewed_by": "", "reviewed_at": "",
            })
    return len(rows)


def import_osm_location_review(
    db_path: str | Path, input_path: str | Path, *, dry_run: bool = False
) -> dict[str, object]:
    ensure_public_schema(db_path)
    with Path(input_path).open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    reports = []
    accepted = []
    seen: set[str] = set()
    with connect(db_path) as connection:
        for line, raw in enumerate(rows, start=2):
            place_id = (raw.get("public_restaurant_id") or "").strip()
            errors = []
            decision = (raw.get("reviewer_decision") or "").strip().casefold()
            if not decision:
                reports.append({
                    "line": line, "place_id": place_id or None, "valid": True,
                    "skipped": True, "errors": [],
                })
                continue
            if place_id in seen:
                errors.append("duplicate restaurant decision")
            seen.add(place_id)
            if decision not in DECISIONS:
                errors.append("reviewer_decision must be approve, reject, or unresolved")
            try:
                rank = int(raw.get("candidate_rank") or "")
            except ValueError:
                rank = -1
                errors.append("invalid candidate_rank")
            candidate = connection.execute(
                """
                SELECT c.*, p.is_published, p.name_ja AS restaurant_name_ja,
                       p.name_en AS restaurant_name_en, p.primary_category AS restaurant_category,
                       r.neighborhood AS restaurant_neighborhood
                FROM location_match_candidates c
                JOIN public_restaurants p ON p.place_id = c.place_id
                LEFT JOIN restaurants r ON r.place_id = p.place_id
                WHERE c.place_id = ? AND c.candidate_rank = ?
                """, (place_id, rank),
            ).fetchone()
            if candidate is None:
                errors.append("missing persisted OSM candidate provenance")
            else:
                immutable = {
                    "osm_type": str(candidate["osm_type"]),
                    "osm_id": str(candidate["osm_id"]),
                    "candidate_latitude": str(candidate["latitude"]),
                    "candidate_longitude": str(candidate["longitude"]),
                }
                for field, expected in immutable.items():
                    if (raw.get(field) or "").strip() != expected:
                        errors.append(f"{field} does not match persisted candidate")
                restaurant_fields = {
                    "name_ja": str(candidate["restaurant_name_ja"] or ""),
                    "name_en": str(candidate["restaurant_name_en"] or ""),
                    "category": str(candidate["restaurant_category"] or ""),
                    "neighborhood": str(candidate["restaurant_neighborhood"] or ""),
                }
                for field, expected in restaurant_fields.items():
                    if (raw.get(field) or "").strip() != expected:
                        errors.append(f"{field} does not match stored restaurant data")
                latitude, longitude = float(candidate["latitude"]), float(candidate["longitude"])
                if not (34.8 <= latitude <= 36.0 and 138.8 <= longitude <= 140.2):
                    errors.append("candidate coordinates are outside the Tokyo region")
            reviewed_by = (raw.get("reviewed_by") or "").strip()
            reviewed_at = (raw.get("reviewed_at") or "").strip()
            if decision in DECISIONS and (not reviewed_by or not reviewed_at):
                errors.append("review decisions require reviewed_by and reviewed_at")
            if reviewed_at:
                try:
                    date.fromisoformat(reviewed_at)
                except ValueError:
                    errors.append("reviewed_at must be YYYY-MM-DD")
            reports.append({
                "line": line, "place_id": place_id or None, "valid": not errors, "errors": errors,
            })
            if not errors:
                accepted.append((raw, candidate, decision))
        failures = sum(not report["valid"] for report in reports)
        if not failures and not dry_run:
            now = datetime.now(UTC).isoformat()
            for raw, candidate, decision in accepted:
                place_id = str(candidate["place_id"])
                if decision == "approve":
                    connection.execute(
                        """
                        UPDATE public_restaurants SET latitude=?, longitude=?,
                            location_source='openstreetmap', location_source_reference=?,
                            location_verified_at=?, location_precision='exact',
                            location_reviewer_notes=?, location_verification_status='manually_verified',
                            location_reviewed_by=?, location_reviewed_at=?,
                            location_match_confidence=?, location_match_method='deterministic_osm_v1',
                            location_verification_method='manual_osm_review', location_osm_type=?,
                            location_osm_id=?, location_osm_version=?, location_source_checked_at=?,
                            map_display_eligible=1, updated_at=? WHERE place_id=?
                        """,
                        (
                            candidate["latitude"], candidate["longitude"],
                            f"https://www.openstreetmap.org/{candidate['osm_type']}/{candidate['osm_id']}",
                            raw["reviewed_at"], raw.get("reviewer_notes") or None,
                            raw["reviewed_by"], raw["reviewed_at"],
                            candidate["total_score"], candidate["osm_type"], candidate["osm_id"],
                            candidate["osm_version"], now, now, place_id,
                        ),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE public_restaurants SET location_verification_status=?,
                            location_verification_method='manual_osm_review',
                            location_reviewer_notes=?, location_reviewed_by=?,
                            location_reviewed_at=?, map_display_eligible=0, updated_at=?
                        WHERE place_id=?
                        """,
                        (
                            decision, raw.get("reviewer_notes") or None,
                            raw.get("reviewed_by") or None, raw.get("reviewed_at") or None,
                            now, place_id,
                        ),
                    )
            connection.commit()
    return {
        "rows": len(reports), "valid": len(accepted), "validation_failures": failures,
        "updated": len(accepted) if not failures and not dry_run else 0,
        "dry_run": dry_run, "reports": reports,
    }
