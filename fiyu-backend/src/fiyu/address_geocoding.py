from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime
from pathlib import Path

from .address_geocoder import (
    AddressGeocoder,
    AddressGeocodeResult,
    AddressGeocoderLookupError,
)
from .database import connect
from .discovery_areas import canonical_tokyo_ward
from .location_names import normalize_location_name
from .location_verification import TOKYO_BOUNDS
from .osm_address_normalization import normalize_tokyo_neighborhood
from .sqlite_snapshot import readonly_sqlite_snapshot

MAP_ELIGIBLE_MATCH_LEVELS = {
    "address", "block", "building", "parcel", "rooftop", "interpolation"
}
ACCEPTED_PRECISIONS = {"exact", "approximate"}
MATCH_LEVEL_PRECISION = {
    "rooftop": "exact_entrance",
    "building": "building",
    "address": "parcel_or_street_number",
    "parcel": "parcel_or_street_number",
    "block": "block",
    "interpolation": "block",
    "chome": "chome",
    "neighborhood": "neighborhood",
    "town": "neighborhood",
    "ward": "ward",
}
PRECISION_RANK = {
    "unknown": 0, "ward": 1, "neighborhood": 2, "chome": 3, "block": 4,
    "parcel_or_street_number": 5, "building": 6, "exact_entrance": 7,
}


@dataclass(frozen=True)
class GeocodeValidation:
    status: str
    reasons: tuple[str, ...]
    location_precision: str = "unknown"
    map_location_approximate: bool = False


def validate_geocode(
    result: AddressGeocodeResult,
    *,
    verified_ward: str | None,
    verified_neighborhood: str | None = None,
) -> GeocodeValidation:
    reasons: list[str] = []
    latitude = result.latitude
    longitude = result.longitude
    min_lat, max_lat, min_lon, max_lon = TOKYO_BOUNDS
    if min_lon <= latitude <= max_lon and min_lat <= longitude <= max_lat:
        reasons.append("latitude_longitude_appear_swapped")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        reasons.append("invalid_coordinate_range")
    elif not (min_lat <= latitude <= max_lat and min_lon <= longitude <= max_lon):
        reasons.append("coordinates_outside_tokyo_bounds")
    derived_precision = MATCH_LEVEL_PRECISION.get(result.address_level_match, "unknown")
    area_fallback = result.map_anchor_type in {"block", "chome", "neighborhood"}
    if result.address_level_match not in MAP_ELIGIBLE_MATCH_LEVELS and not area_fallback:
        reasons.append("geocode_precision_below_map_threshold")
        reasons.append("geocode_match_level_not_street_detail")
    if area_fallback and result.address_level_match != result.map_anchor_type:
        reasons.append("area_anchor_precision_mismatch")
    if result.address_level_match == "interpolation" and (
        result.interpolation_span_meters is None or result.interpolation_span_meters > 150
    ):
        reasons.append("geocode_interpolation_not_sufficiently_narrow")
    if result.precision not in ACCEPTED_PRECISIONS:
        reasons.append("geocode_precision_not_accepted")
    if not result.provider or result.provider in {"unconfigured", "google", "google_places"}:
        reasons.append("independent_geocoder_provider_required")
    if not result.source_reference and not result.provenance:
        reasons.append("geocoder_source_reference_required")
    expected = canonical_tokyo_ward(verified_ward)
    returned = canonical_tokyo_ward(result.municipality_or_ward)
    prefecture = normalize_location_name(result.prefecture)
    if prefecture not in {"東京都", "tokyo", "tokyo prefecture", "tokyo-to"}:
        reasons.append("geocoded_prefecture_mismatch")
    if expected and returned != expected:
        reasons.append("geocoded_ward_mismatch")
    if verified_neighborhood and result.neighborhood:
        expected_neighborhood, expected_chome = normalize_tokyo_neighborhood(
            verified_neighborhood
        )
        returned_neighborhood, returned_chome = normalize_tokyo_neighborhood(
            result.neighborhood
        )
        matched_chome = str(result.matched_components.get("chome") or "") or None
        if expected_neighborhood != returned_neighborhood or (
            expected_chome
            and expected_chome not in {returned_chome, matched_chome}
        ):
            reasons.append("geocoded_neighborhood_mismatch")
    return GeocodeValidation(
        "location_verified" if not reasons else "geocode_needs_review",
        tuple(dict.fromkeys(reasons)),
        derived_precision,
        area_fallback or derived_precision == "block",
    )


def _geocoding_input(row) -> dict[str, object]:
    address = str(row["geocoding_address"] or row["verified_core_address"] or row["address_raw"])
    payload: dict[str, object] = {
        "place_id": row["place_id"],
        "name_ja": row["name_ja"],
        "accepted_core_address": address,
        "address_status": row["status"],
        "confidence_tier": row["address_confidence_tier"] or "verified",
        "expected_prefecture": row["prefecture"],
        "expected_ward": row["municipality_or_ward"],
        "proposed_precision": row["approved_location_precision"],
        "verified_address_id": row["verified_address_id"],
        "address_evidence_id": row["address_evidence_id"],
        "evidence_fingerprint": row["evidence_fingerprint"],
        "decision_fingerprint": row["decision_fingerprint"] or row["evidence_fingerprint"],
    }
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    payload["input_fingerprint"] = hashlib.sha256(encoded).hexdigest()
    return payload


def _query_geocoding_rows(
    connection, *, limit: int, place_id: str | None, published_only: bool = True
):
    conditions = [
        "p.map_display_eligible=0",
        (
            "p.location_verification_status NOT IN "
            "('osm_auto_verified', 'manually_verified', 'location_verified')"
        ),
        (
            "v.status IN ('address_verified', 'address_provisionally_accepted', "
            "'geocoding_pending', 'geocode_needs_review')"
        ),
        "v.core_address_verified=1",
    ]
    if published_only:
        conditions.append("p.is_published=1")
    parameters: list[object] = []
    if place_id:
        conditions.append("p.place_id=?")
        parameters.append(place_id)
    parameters.append(limit)
    return connection.execute(
        f"""
        SELECT p.place_id, p.name_ja, p.location_verification_status,
               p.latitude, p.longitude, v.rowid AS verified_address_id, v.*,
               e.evidence_fingerprint
        FROM verified_restaurant_addresses v
        JOIN public_restaurants p ON p.place_id=v.public_restaurant_id
        LEFT JOIN address_evidence e ON e.id=v.address_evidence_id
        WHERE {' AND '.join(conditions)}
        ORDER BY v.updated_at, p.place_id LIMIT ?
        """,
        parameters,
    ).fetchall()


def _select_geocoding_rows(
    db_path: str | Path, *, limit: int, place_id: str | None,
    published_only: bool = True,
):
    with readonly_sqlite_snapshot(db_path) as connection:
        return _query_geocoding_rows(
            connection, limit=limit, place_id=place_id, published_only=published_only
        )


def export_geocoding_inputs(
    db_path: str | Path,
    output_path: str | Path,
    *,
    limit: int = 100,
    place_id: str | None = None,
) -> int:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    rows = _select_geocoding_rows(db_path, limit=limit, place_id=place_id)
    payload = [_geocoding_input(row) for row in rows]
    output = Path(output_path)
    if output.suffix.casefold() != ".json":
        raise ValueError("geocoding input export must use a .json extension")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(payload)


def geocode_address_file(
    input_path: str | Path,
    output_path: str | Path,
    *,
    geocoder: AddressGeocoder,
    place_id: str | None = None,
    limit: int | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    if limit is not None and limit < 1:
        raise ValueError("limit must be at least 1")
    source = Path(input_path)
    payload = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise TypeError("geocoding input JSON must contain a list")
    results: list[dict[str, object]] = []
    failures: list[dict[str, object]] = []
    seen: set[str] = set()
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            failures.append({"index": index, "error": "input item must be an object"})
            continue
        current_id = str(item.get("place_id") or "").strip()
        if place_id and current_id != place_id:
            continue
        if limit is not None and len(seen) >= limit:
            break
        address = str(item.get("accepted_core_address") or "").strip()
        fingerprint = str(item.get("input_fingerprint") or "").strip()
        if not current_id or not address or not fingerprint:
            failures.append(
                {"index": index, "place_id": current_id or None,
                 "error": "place_id, accepted_core_address, and input_fingerprint are required"}
            )
            continue
        if current_id in seen:
            failures.append(
                {"index": index, "place_id": current_id, "error": "duplicate place_id"}
            )
            continue
        seen.add(current_id)
        try:
            result = geocoder.geocode(
                address,
                place_id=current_id,
                input_fingerprint=fingerprint,
            )
            if result is None:
                raise AddressGeocoderLookupError("not_found", "no geocoder match")
            result = replace(
                result,
                place_id=current_id,
                input_fingerprint=fingerprint,
                raw_address=address,
            )
            output = asdict(result)
            output["match_level"] = output.pop("address_level_match")
            output["status"] = output.get("match_status") or "matched_exact"
            results.append(output)
        except AddressGeocoderLookupError as exc:
            output = {
                "place_id": current_id,
                "input_fingerprint": fingerprint,
                "raw_address": address,
                "status": exc.status,
                "warnings": list(exc.warnings),
                "error": str(exc),
            }
            if exc.diagnostics:
                output["diagnostics"] = exc.diagnostics
            results.append(output)
            failures.append(output)
        except Exception as exc:  # noqa: BLE001 - isolate independent batch rows.
            output = {
                "index": index,
                "place_id": current_id,
                "input_fingerprint": fingerprint,
                "raw_address": address,
                "status": "failed",
                "warnings": [],
                "error": f"{type(exc).__name__}: {exc}",
            }
            results.append(output)
            failures.append(output)
    target = Path(output_path)
    if target.suffix.casefold() != ".json":
        raise ValueError("geocoder results output must use a .json extension")
    if not dry_run:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "selected": len(seen),
        "geocoded": len(results) - len(failures),
        "failed": len(failures),
        "output": None if dry_run else str(target),
        "dry_run": dry_run,
        "status_counts": {
            status: sum(row.get("status") == status for row in results)
            for status in sorted({str(row.get("status")) for row in results})
        },
        "results": results,
        "failures": failures,
    }


def geocode_verified_addresses(
    db_path: str | Path,
    *,
    geocoder: AddressGeocoder,
    limit: int = 10,
    place_id: str | None = None,
    dry_run: bool = False,
    published_only: bool = True,
) -> dict[str, object]:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    rows = _select_geocoding_rows(
        db_path, limit=limit, place_id=place_id, published_only=published_only
    )
    reports: list[dict[str, object]] = []
    for row in rows:
        raw_address = str(
            row["geocoding_address"] or row["verified_core_address"] or row["address_raw"]
        )
        expected_input = _geocoding_input(row)
        try:
            result = geocoder.geocode(
                raw_address,
                place_id=str(row["place_id"]),
                input_fingerprint=str(expected_input["input_fingerprint"]),
            )
        except AddressGeocoderLookupError as exc:
            reports.append(
                {
                    "place_id": row["place_id"],
                    "status": "geocoding_failed",
                    "reasons": [exc.status],
                    "warnings": list(exc.warnings),
                    "error": str(exc),
                }
            )
            continue
        except TypeError:
            result = geocoder.geocode(raw_address)
        if result is None:
            exclusion_reason = None
            explain_exclusion = getattr(geocoder, "exclusion_reason", None)
            if callable(explain_exclusion):
                exclusion_reason = explain_exclusion(
                    raw_address, place_id=str(row["place_id"])
                )
            reports.append(
                {
                    "place_id": row["place_id"],
                    "status": "geocoding_failed",
                    "reasons": [exclusion_reason or "no_geocoder_result"],
                }
            )
            continue
        fingerprint_reasons: list[str] = []
        if result.place_id != row["place_id"]:
            fingerprint_reasons.append("geocoder_place_id_mismatch")
        if result.input_fingerprint != expected_input["input_fingerprint"]:
            fingerprint_reasons.append("stale_or_missing_geocoding_input_fingerprint")
        if result.raw_address and result.raw_address != raw_address:
            fingerprint_reasons.append("geocoder_raw_address_mismatch")
        validation = validate_geocode(
            result,
            verified_ward=str(row["municipality_or_ward"] or "") or None,
            verified_neighborhood=str(row["neighborhood"] or "") or None,
        )
        effective_precision = validation.location_precision
        evidence_precision = str(row["approved_location_precision"] or "")
        if (
            not bool(row["full_address_verified"])
            and evidence_precision in PRECISION_RANK
            and PRECISION_RANK[evidence_precision] < PRECISION_RANK.get(effective_precision, 0)
        ):
            effective_precision = evidence_precision
        effective_reasons = [*validation.reasons, *fingerprint_reasons]
        is_area_fallback = result.map_anchor_type in {"block", "chome", "neighborhood"}
        if (
            PRECISION_RANK.get(effective_precision, 0) < PRECISION_RANK["block"]
            and not is_area_fallback
        ):
            effective_reasons.append("verified_address_precision_below_map_threshold")
        validation = GeocodeValidation(
            "location_verified" if not effective_reasons else "geocode_needs_review",
            tuple(dict.fromkeys(effective_reasons)),
            effective_precision,
            effective_precision == "block",
        )
        address_tier = str(row["address_confidence_tier"] or "verified")
        if address_tier not in {"verified", "manual"}:
            if result.suggested_verification_tier:
                address_tier = result.suggested_verification_tier
            elif result.address_level_match == "block":
                address_tier = "provisional_medium"
        accepted_status = (
            "location_provisional"
            if is_area_fallback
            else
            "location_verified"
            if address_tier in {"verified", "manual"}
            else "location_provisional"
        )
        map_location_approximate = (
            (
                result.map_location_approximate
                if result.map_location_approximate is not None
                else validation.map_location_approximate
                or not bool(row["full_address_verified"])
            )
            or address_tier == "provisional_medium"
        )
        final_status = accepted_status if validation.status == "location_verified" else validation.status
        report = {
            "place_id": row["place_id"],
            "status": final_status,
            "reasons": list(validation.reasons),
            "result": asdict(result),
            "location_precision": validation.location_precision,
            "map_location_approximate": map_location_approximate,
        }
        reports.append(report)
        if dry_run or fingerprint_reasons:
            continue
        now = datetime.now(UTC).isoformat()
        connection = connect(db_path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            current_rows = _query_geocoding_rows(
                connection,
                limit=1,
                place_id=str(row["place_id"]),
                published_only=published_only,
            )
            if not current_rows:
                connection.rollback()
                report["status"] = "geocode_needs_review"
                report["reasons"] = [
                    *report["reasons"], "source_state_changed_before_write"
                ]
                continue
            current_row = current_rows[0]
            if (
                _geocoding_input(current_row)["input_fingerprint"]
                != expected_input["input_fingerprint"]
            ):
                connection.rollback()
                report["status"] = "geocode_needs_review"
                report["reasons"] = [
                    *report["reasons"], "source_state_changed_before_write"
                ]
                continue
            row = current_row
            connection.execute(
                """
                INSERT INTO address_geocode_results (
                    public_restaurant_id, verified_address_id, raw_address, normalized_address,
                    latitude, longitude, prefecture, municipality_or_ward, neighborhood,
                    match_level, match_status, matched_components_json, precision,
                    unmatched_components_json,
                    provider, provider_version, source_reference, warnings_json,
                    derived_location_precision, map_location_approximate,
                    validation_status, validation_reasons_json, input_fingerprint,
                    osm_type, osm_id, osm_version, osm_timestamp,
                    representative_point_method, map_anchor_type, provenance, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["place_id"],
                    row["verified_address_id"],
                    raw_address,
                    result.normalized_address,
                    result.latitude,
                    result.longitude,
                    result.prefecture,
                    result.municipality_or_ward,
                    result.neighborhood,
                    result.address_level_match,
                    result.match_status,
                    json.dumps(result.matched_components, ensure_ascii=False, sort_keys=True),
                    result.precision,
                    json.dumps(result.unmatched_components, ensure_ascii=False, sort_keys=True),
                    result.provider,
                    result.provider_version,
                    result.source_reference or result.provenance,
                    json.dumps(result.warnings, ensure_ascii=False),
                    validation.location_precision,
                    int(map_location_approximate),
                    final_status,
                    json.dumps(validation.reasons, ensure_ascii=False),
                    result.input_fingerprint,
                    result.osm_type,
                    result.osm_id,
                    result.osm_version,
                    result.osm_timestamp,
                    result.representative_point_method,
                    result.map_anchor_type,
                    result.provenance,
                    now,
                ),
            )
            if validation.status == "location_verified":
                location_tier = address_tier
                location_status = accepted_status
                connection.execute(
                    """
                    UPDATE public_restaurants SET latitude=?, longitude=?, normalized_address=?,
                        location_source=?, location_source_reference=?, location_verified_at=?,
                        location_precision=?, map_location_precision=?,
                        map_location_approximate=?, map_anchor_type=?,
                        location_matched_components_json=?,
                        location_unmatched_components_json=?, location_provenance=?,
                        verified_core_address=?,
                        core_address_verified=1, full_address_verified=?,
                        unresolved_address_detail=?, location_verification_status=?,
                        location_verification_tier=?, location_status=?,
                        location_osm_type=?, location_osm_id=?, location_osm_version=?,
                        location_osm_timestamp=?, location_representative_point_method=?,
                        location_source_checked_at=?,
                        location_verification_method='independent_verified_address_geocode',
                        address_resolution_status=?, map_display_eligible=1,
                        updated_at=? WHERE place_id=? AND map_display_eligible=0
                    """,
                    (
                        result.latitude,
                        result.longitude,
                        result.normalized_address,
                        result.provider,
                        result.source_reference or result.provenance,
                        now,
                        "approximate" if map_location_approximate else "exact",
                        validation.location_precision,
                        int(map_location_approximate),
                        result.map_anchor_type,
                        json.dumps(result.matched_components, ensure_ascii=False, sort_keys=True),
                        json.dumps(result.unmatched_components, ensure_ascii=False, sort_keys=True),
                        result.provenance,
                        row["verified_core_address"] or raw_address,
                        int(bool(row["full_address_verified"])),
                        row["unresolved_address_detail"],
                        location_status,
                        location_tier,
                        location_status if is_area_fallback else "location_active",
                        result.osm_type,
                        result.osm_id,
                        result.osm_version,
                        result.osm_timestamp,
                        result.representative_point_method,
                        result.osm_timestamp or now,
                        location_status,
                        now,
                        row["place_id"],
                    ),
                )
                connection.execute(
                    """
                    UPDATE verified_restaurant_addresses
                    SET status=?, updated_at=? WHERE public_restaurant_id=?
                    """,
                    (location_status, now, row["place_id"]),
                )
                connection.execute(
                    """
                    INSERT INTO location_history (
                        public_restaurant_id, latitude, longitude, normalized_address,
                        location_source, location_source_reference,
                        location_verification_status, location_verification_tier,
                        location_precision, map_location_approximate,
                        map_anchor_type, matched_components_json,
                        unmatched_components_json, provenance,
                        map_display_eligible, location_status, osm_type, osm_id, osm_version,
                        osm_timestamp, change_reason, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?,
                              'independent address geocode accepted', ?)
                    """,
                    (
                        row["place_id"], result.latitude, result.longitude,
                        result.normalized_address, result.provider,
                        result.source_reference or result.provenance,
                        location_status, location_tier, validation.location_precision,
                        int(map_location_approximate),
                        result.map_anchor_type,
                        json.dumps(result.matched_components, ensure_ascii=False, sort_keys=True),
                        json.dumps(result.unmatched_components, ensure_ascii=False, sort_keys=True),
                        result.provenance,
                        location_status if is_area_fallback else "location_active",
                        result.osm_type, result.osm_id, result.osm_version,
                        result.osm_timestamp,
                        now,
                    ),
                )
            else:
                connection.execute(
                    """
                    UPDATE public_restaurants SET address_resolution_status='geocode_needs_review',
                        updated_at=? WHERE place_id=?
                    """,
                    (now, row["place_id"]),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
    return {
        "selected": len(rows),
        "dry_run": dry_run,
        "location_verified": sum(row["status"] == "location_verified" for row in reports),
        "location_provisional": sum(
            row["status"] == "location_provisional" for row in reports
        ),
        "needs_review": sum(row["status"] == "geocode_needs_review" for row in reports),
        "failed": sum(row["status"] == "geocoding_failed" for row in reports),
        "reports": reports,
    }
