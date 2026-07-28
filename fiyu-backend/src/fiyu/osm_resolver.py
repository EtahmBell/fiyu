from __future__ import annotations

import csv
import difflib
import json
import sqlite3
from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime
from pathlib import Path

from .database import connect
from .discovery_areas import (
    ADJACENT_WARDS,
    discovery_occurrences,
    infer_tokyo_ward,
)
from .location_anchors import load_location_anchors
from .location_names import comparable_names, normalize_location_name
from .public_catalog import ensure_public_schema
from .utils import haversine_km

TOKYO_BOUNDS = (34.8, 36.0, 138.8, 140.2)
STRONG_NORMALIZED_RATIO = 0.85
GENERIC_NAMES = {"bar", "cafe", "café", "restaurant", "食堂", "酒場", "居酒屋"}
BRANCH_MARKERS = ("支店", "本店", "駅前店", "店")
GEOGRAPHY_COMPONENTS = {
    "discovery_ward_agreement",
    "discovery_area_agreement",
    "discovery_anchor_distance",
    "adjacent_area_agreement",
    "discovery_area_conflict_penalty",
    "outside_discovery_area_penalty",
    "outside_tokyo_penalty",
}


@dataclass(frozen=True)
class MatchCandidate:
    osm_type: str
    osm_id: int
    osm_version: int | None
    osm_timestamp: str | None
    name: str | None
    alternate_names: list[str]
    latitude: float
    longitude: float
    amenity: str | None
    cuisine: str | None
    address: dict[str, str]
    identity_strength: str
    identity_similarity: float
    geographic_strength: str
    address_tag_ward: str | None
    spatially_inferred_ward: str | None
    ward_boundary_osm_id: int | None
    ward_boundary_version: int | None
    ward_inference_method: str | None
    ward_conflict: bool
    inferred_ward: str | None
    supporting_discovery_area: str | None
    in_expected_area: bool | None
    discovery_anchor_distance_km: float | None
    total_score: float
    components: dict[str, float]
    warnings: list[str]


def _address(tags: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in tags.items() if key.startswith("addr:")}


def _point_on_segment(
    latitude: float,
    longitude: float,
    first: tuple[float, float],
    second: tuple[float, float],
) -> bool:
    cross = (longitude - first[1]) * (second[0] - first[0]) - (
        latitude - first[0]
    ) * (second[1] - first[1])
    if abs(cross) > 1e-10:
        return False
    return (
        min(first[0], second[0]) - 1e-10 <= latitude <= max(first[0], second[0]) + 1e-10
        and min(first[1], second[1]) - 1e-10
        <= longitude
        <= max(first[1], second[1]) + 1e-10
    )


def _point_in_ring(latitude: float, longitude: float, ring: list[list[float]]) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    previous = (float(ring[-1][0]), float(ring[-1][1]))
    for raw in ring:
        current = (float(raw[0]), float(raw[1]))
        if _point_on_segment(latitude, longitude, previous, current):
            return True
        if (current[0] > latitude) != (previous[0] > latitude):
            crossing = (
                (previous[1] - current[1])
                * (latitude - current[0])
                / (previous[0] - current[0])
                + current[1]
            )
            if longitude < crossing:
                inside = not inside
        previous = current
    return inside


def _point_in_boundary(latitude: float, longitude: float, geometry_json: str) -> bool:
    geometry = json.loads(geometry_json)
    for polygon in geometry if isinstance(geometry, list) else []:
        if not isinstance(polygon, dict):
            continue
        outer = polygon.get("outer")
        inners = polygon.get("inners") or []
        if isinstance(outer, list) and _point_in_ring(latitude, longitude, outer) and not any(
            isinstance(inner, list) and _point_in_ring(latitude, longitude, inner)
            for inner in inners
        ):
            return True
    return False


def _boundary_inference_available(index: sqlite3.Connection) -> bool:
    try:
        return index.execute("SELECT COUNT(*) FROM osm_ward_boundaries").fetchone()[0] == 23
    except sqlite3.OperationalError:
        return False


def _spatial_ward(
    index: sqlite3.Connection, latitude: float, longitude: float
) -> tuple[str | None, int | None, int | None, bool]:
    try:
        rows = index.execute(
            """
            SELECT ward_name, osm_id, osm_version, geometry_json
            FROM osm_ward_boundaries
            WHERE min_latitude <= ? AND max_latitude >= ?
              AND min_longitude <= ? AND max_longitude >= ?
            ORDER BY ward_name
            """,
            (latitude, latitude, longitude, longitude),
        ).fetchall()
    except sqlite3.OperationalError:
        return None, None, None, False
    matches = [row for row in rows if _point_in_boundary(latitude, longitude, row["geometry_json"])]
    if not matches:
        return None, None, None, False
    selected = matches[0]
    return (
        str(selected["ward_name"]), int(selected["osm_id"]), selected["osm_version"],
        len(matches) > 1,
    )


def _score_candidate(
    restaurant: dict[str, object],
    index: sqlite3.Connection,
    row: sqlite3.Row,
    *,
    reviewed_anchors: list[dict[str, object]] | None = None,
    anchor_radius_km: float = 3.0,
) -> MatchCandidate:
    tags = json.loads(row["tags_json"])
    japanese = comparable_names(str(restaurant.get("name_ja") or ""))
    english = comparable_names(str(restaurant.get("name_en") or ""))
    primary = comparable_names(row["name"], row["name_ja"], row["official_name"])
    alternate = comparable_names(row["alt_name"], row["short_name"])
    candidate_english = comparable_names(row["name_en"])
    components: dict[str, float] = {
        "exact_japanese_name": 55.0 if japanese & primary else 0.0,
        "exact_alternate_name": 42.0 if japanese & alternate else 0.0,
        "exact_english_name": 25.0 if english & (primary | candidate_english | alternate) else 0.0,
        "neighborhood_agreement": 0.0,
        "cuisine_agreement": 0.0,
        "address_agreement": 0.0,
        "fuzzy_name": 0.0,
        "branch_ambiguity_penalty": 0.0,
        "generic_name_penalty": 0.0,
        "multiple_candidate_ambiguity_penalty": 0.0,
        "discovery_ward_agreement": 0.0,
        "discovery_area_agreement": 0.0,
        "discovery_anchor_distance": 0.0,
        "adjacent_area_agreement": 0.0,
        "discovery_area_conflict_penalty": 0.0,
        "outside_discovery_area_penalty": 0.0,
        "outside_tokyo_penalty": 0.0,
    }
    warnings: list[str] = []
    neighborhood = normalize_location_name(str(restaurant.get("neighborhood") or ""))
    address_values = " ".join(normalize_location_name(value) for value in _address(tags).values())
    if neighborhood and neighborhood in address_values:
        components["neighborhood_agreement"] = 15.0
    elif neighborhood:
        warnings.append("neighborhood_not_confirmed")
    food_tags = {
        normalize_location_name(str(value)) for value in restaurant.get("food_tags", []) if value
    }
    osm_cuisine = {
        normalize_location_name(value) for value in str(row["cuisine"] or "").replace(";", ",").split(",")
        if value.strip()
    }
    category = normalize_location_name(str(restaurant.get("category") or ""))
    if food_tags & osm_cuisine or category == normalize_location_name(row["amenity"]):
        components["cuisine_agreement"] = 10.0
    normalized_address = normalize_location_name(str(restaurant.get("normalized_address") or ""))
    if normalized_address and any(value in normalized_address for value in _address(tags).values()):
        components["address_agreement"] = 10.0
    ratio = 0.0
    if not any(components[key] for key in (
        "exact_japanese_name", "exact_alternate_name", "exact_english_name"
    )):
        left = max(japanese | english, key=len, default="")
        right = max(primary | alternate | candidate_english, key=len, default="")
        ratio = difflib.SequenceMatcher(None, left, right).ratio() if left and right else 0.0
        components["fuzzy_name"] = round(ratio * 30.0, 3)
        warnings.append("fuzzy_name_only")
    all_restaurant_names = japanese | english
    candidate_names = primary | alternate | candidate_english
    restaurant_has_branch = any(marker in name for name in all_restaurant_names for marker in BRANCH_MARKERS)
    candidate_has_branch = any(marker in name for name in candidate_names for marker in BRANCH_MARKERS)
    if candidate_has_branch and not restaurant_has_branch:
        components["branch_ambiguity_penalty"] = -25.0
        warnings.append("branch_ambiguity")
    if any(name in GENERIC_NAMES or len(name) <= 2 for name in all_restaurant_names):
        components["generic_name_penalty"] = -30.0
        warnings.append("generic_name")
    latitude, longitude = float(row["latitude"]), float(row["longitude"])
    min_lat, max_lat, min_lng, max_lng = TOKYO_BOUNDS
    inside_tokyo = min_lat <= latitude <= max_lat and min_lng <= longitude <= max_lng
    if not inside_tokyo:
        warnings.append("outside_tokyo")
        components["outside_tokyo_penalty"] = -100.0
    occurrences = discovery_occurrences(restaurant)
    expected_wards = {
        str(item.get("area")) for item in occurrences if item.get("area_type") == "ward"
    }
    nonward_areas = [
        str(item.get("area")) for item in occurrences
        if item.get("area_type") in {"neighborhood", "station_area"}
    ]
    address_tag_ward = infer_tokyo_ward(tags)
    spatial_ward, boundary_osm_id, boundary_version, boundary_overlap = _spatial_ward(
        index, latitude, longitude
    )
    ward_conflict = bool(
        boundary_overlap
        or (address_tag_ward and spatial_ward and address_tag_ward != spatial_ward)
    )
    inferred_ward = spatial_ward or address_tag_ward
    ward_method = (
        "address_tag_and_point_in_polygon"
        if spatial_ward and address_tag_ward and spatial_ward == address_tag_ward
        else "point_in_polygon" if spatial_ward
        else "address_tag" if address_tag_ward
        else None
    )
    if ward_conflict:
        warnings.append("ward_inference_conflict")
    supporting_area: str | None = None
    in_expected_area: bool | None = None
    anchor_distance: float | None = None
    true_area_conflict = bool(
        restaurant.get("discovery_area_conflict")
        and str(restaurant.get("discovery_area_conflict_reason") or "").strip()
    )
    if true_area_conflict:
        components["discovery_area_conflict_penalty"] = -10.0
        warnings.append("discovery_area_conflict")
    if expected_wards:
        if inferred_ward in expected_wards and not ward_conflict:
            components["discovery_ward_agreement"] = 25.0
            supporting_area = inferred_ward
            in_expected_area = True
        elif inferred_ward:
            in_expected_area = False
            if any(inferred_ward in ADJACENT_WARDS.get(ward, set()) for ward in expected_wards):
                components["adjacent_area_agreement"] = 5.0
                components["outside_discovery_area_penalty"] = -15.0
                warnings.append("candidate_in_adjacent_ward")
            else:
                components["outside_discovery_area_penalty"] = -30.0
                warnings.append("candidate_outside_discovery_area")
        else:
            warnings.append(
                "boundary_inference_unavailable"
                if not _boundary_inference_available(index)
                else "ward_not_inferred"
            )
    address_text = " ".join(normalize_location_name(value) for value in _address(tags).values())
    for area in nonward_areas:
        anchor = next(
            (
                item for item in (reviewed_anchors or [])
                if normalize_location_name(str(item.get("area_name") or ""))
                == normalize_location_name(area)
            ),
            None,
        )
        if anchor:
            distance = haversine_km(
                latitude, longitude, float(anchor["latitude"]), float(anchor["longitude"])
            )
            anchor_distance = round(distance, 3)
            if distance <= anchor_radius_km:
                components["discovery_anchor_distance"] = 15.0
                supporting_area = area
                in_expected_area = True
            elif in_expected_area is None:
                in_expected_area = False
                warnings.append("outside_discovery_anchor_radius")
        elif normalize_location_name(area) in address_text:
            components["discovery_area_agreement"] = 5.0
            supporting_area = area
            in_expected_area = True
            warnings.append("discovery_area_unanchored")
    alternate_names = [
        value for value in (row["name_ja"], row["name_en"], row["alt_name"], row["official_name"])
        if value and value != row["name"]
    ]
    if components["exact_japanese_name"]:
        identity_strength = "exact_japanese"
        identity_similarity = 1.0
    elif components["exact_alternate_name"]:
        identity_strength = "exact_alternate"
        identity_similarity = 1.0
    elif components["exact_english_name"]:
        identity_strength = "exact_english"
        identity_similarity = 1.0
    elif ratio >= STRONG_NORMALIZED_RATIO:
        identity_strength = "strong_normalized"
        identity_similarity = round(ratio, 4)
    else:
        identity_strength = "weak_fuzzy"
        identity_similarity = round(ratio, 4)
    geographic_strength = (
        "expected_area" if in_expected_area is True
        else "adjacent_area" if components["adjacent_area_agreement"] > 0
        else "outside_expected_area" if in_expected_area is False
        else "unavailable"
    )
    return MatchCandidate(
        osm_type=row["osm_type"], osm_id=int(row["osm_id"]), osm_version=row["osm_version"],
        osm_timestamp=row["osm_timestamp"], name=row["name"], alternate_names=alternate_names,
        latitude=latitude, longitude=longitude, amenity=row["amenity"], cuisine=row["cuisine"],
        address=_address(tags), identity_strength=identity_strength,
        identity_similarity=identity_similarity, geographic_strength=geographic_strength,
        address_tag_ward=address_tag_ward, spatially_inferred_ward=spatial_ward,
        ward_boundary_osm_id=boundary_osm_id, ward_boundary_version=boundary_version,
        ward_inference_method=ward_method, ward_conflict=ward_conflict,
        inferred_ward=inferred_ward,
        supporting_discovery_area=supporting_area, in_expected_area=in_expected_area,
        discovery_anchor_distance_km=anchor_distance,
        total_score=round(sum(components.values()), 3),
        components=components, warnings=warnings,
    )


def _candidate_rows(index: sqlite3.Connection, restaurant: dict[str, object]) -> list[sqlite3.Row]:
    names = sorted(comparable_names(
        str(restaurant.get("name_ja") or ""), str(restaurant.get("name_en") or "")
    ))
    if not names:
        return []
    clauses = []
    parameters: list[object] = []
    for name in names:
        clauses.append(
            "(name_norm = ? OR name_ja_norm = ? OR name_en_norm = ? OR alt_name_norm = ? "
            "OR official_name_norm = ? OR name_norm LIKE ? OR name_ja_norm LIKE ?)"
        )
        parameters.extend([name, name, name, name, name, f"{name[:2]}%", f"{name[:2]}%"])
    return index.execute(
        f"SELECT * FROM osm_locations WHERE object_kind = 'food' AND ({' OR '.join(clauses)}) "
        "ORDER BY osm_type, osm_id LIMIT 250",
        parameters,
    ).fetchall()


def _is_exact(candidate: MatchCandidate) -> bool:
    return candidate.identity_strength.startswith("exact_")


def _is_strong(candidate: MatchCandidate) -> bool:
    return _is_exact(candidate) or candidate.identity_strength == "strong_normalized"


def _identity_rank(candidate: MatchCandidate) -> int:
    return {
        "exact_japanese": 0,
        "exact_alternate": 1,
        "exact_english": 1,
        "strong_normalized": 2,
        "weak_fuzzy": 3,
    }[candidate.identity_strength]


def _candidate_priority(candidate: MatchCandidate) -> tuple[object, ...]:
    if candidate.in_expected_area and candidate.identity_strength == "exact_japanese":
        stage = 0
    elif candidate.in_expected_area and candidate.identity_strength in {
        "exact_alternate", "exact_english"
    }:
        stage = 1
    elif candidate.in_expected_area and candidate.identity_strength == "strong_normalized":
        stage = 2
    elif candidate.geographic_strength == "adjacent_area" and _is_exact(candidate):
        stage = 3
    else:
        stage = 4
    return (
        stage, _identity_rank(candidate), -candidate.identity_similarity,
        -candidate.total_score, candidate.osm_type, candidate.osm_id,
    )


def resolve_restaurant(
    restaurant: dict[str, object], index: sqlite3.Connection,
    *, threshold: float = 80.0, runner_up_margin: float = 20.0,
    reviewed_anchors: list[dict[str, object]] | None = None,
    anchor_radius_km: float = 3.0,
) -> tuple[str, list[MatchCandidate]]:
    candidates = [
        _score_candidate(
            restaurant,
            index,
            row,
            reviewed_anchors=reviewed_anchors,
            anchor_radius_km=anchor_radius_km,
        )
        for row in _candidate_rows(index, restaurant)
    ]
    best_global = min(
        candidates,
        key=lambda item: (
            _identity_rank(item), -item.identity_similarity,
            -sum(
                value for key, value in item.components.items()
                if key not in GEOGRAPHY_COMPONENTS
            ),
            item.osm_type, item.osm_id,
        ),
        default=None,
    )
    candidates.sort(key=_candidate_priority)
    exact_in_area = [
        candidate for candidate in candidates if candidate.in_expected_area and _is_exact(candidate)
    ]
    has_expected_wards = any(
        item.get("area_type") == "ward" for item in discovery_occurrences(restaurant)
    )
    if len(exact_in_area) > 1:
        ambiguous_ids = {(candidate.osm_type, candidate.osm_id) for candidate in exact_in_area}
        candidates = [
            replace(
                candidate,
                total_score=round(candidate.total_score - 10.0, 3),
                components={
                    **candidate.components, "multiple_candidate_ambiguity_penalty": -10.0
                },
                warnings=[*candidate.warnings, "ambiguous_exact_name_candidates"],
            )
            if (candidate.osm_type, candidate.osm_id) in ambiguous_ids else candidate
            for candidate in candidates
        ]
        candidates.sort(key=_candidate_priority)

    def report_candidates() -> list[MatchCandidate]:
        selected = candidates[:20]
        global_for_report = next(
            (
                candidate for candidate in candidates
                if best_global is not None
                and candidate.osm_type == best_global.osm_type
                and candidate.osm_id == best_global.osm_id
            ),
            None,
        )
        if global_for_report is not None and global_for_report not in selected:
            selected = [*selected[:19], global_for_report]
        return selected

    if not candidates:
        return "unresolved", report_candidates()
    winner = candidates[0]
    runner_score = candidates[1].total_score if len(candidates) > 1 else float("-inf")
    neighborhood_required = bool(str(restaurant.get("neighborhood") or "").strip())
    neighborhood_ok = winner.components["neighborhood_agreement"] > 0 or not neighborhood_required
    blocking_warnings = {
        "fuzzy_name_only", "branch_ambiguity", "generic_name", "outside_tokyo",
        "neighborhood_not_confirmed", "ambiguous_exact_name_candidates",
        "discovery_area_conflict", "candidate_outside_discovery_area",
        "boundary_inference_unavailable", "ward_not_inferred", "ward_inference_conflict",
    }
    eligible_exact = (
        exact_in_area if has_expected_wards else [
            candidate for candidate in candidates
            if _is_exact(candidate) and "outside_tokyo" not in candidate.warnings
        ]
    )
    auto = (
        len(eligible_exact) == 1
        and (winner.in_expected_area if has_expected_wards else True)
        and _is_exact(winner)
        and neighborhood_ok
        and not (blocking_warnings & set(winner.warnings))
        and winner.total_score >= threshold and winner.total_score - runner_score >= runner_up_margin
    )
    if len(eligible_exact) > 1:
        return (
            "unresolved" if has_expected_wards else "needs_manual_review"
        ), report_candidates()
    if auto:
        return "osm_auto_verified", report_candidates()
    if winner.in_expected_area and _is_strong(winner):
        return "needs_manual_review", report_candidates()
    if winner.geographic_strength == "adjacent_area" and _is_exact(winner):
        return "needs_manual_review", report_candidates()
    if winner.components["outside_discovery_area_penalty"] <= -30.0 or not _is_strong(winner):
        return "unresolved", report_candidates()
    return "unresolved", report_candidates()


def _resolution_reason(
    restaurant: dict[str, object],
    status: str,
    candidates: list[MatchCandidate],
    *,
    boundary_inference_available: bool,
) -> str:
    occurrences = discovery_occurrences(restaurant)
    exact_inside = [candidate for candidate in candidates if candidate.in_expected_area and _is_exact(candidate)]
    strong_inside = [
        candidate for candidate in candidates
        if candidate.in_expected_area and candidate.identity_strength == "strong_normalized"
    ]
    exact_outside = [
        candidate for candidate in candidates
        if candidate.in_expected_area is False and _is_exact(candidate)
    ]
    exact_adjacent = [
        candidate for candidate in candidates
        if candidate.geographic_strength == "adjacent_area" and _is_exact(candidate)
    ]
    exact_anywhere = [candidate for candidate in candidates if _is_exact(candidate)]
    strong_anywhere = [candidate for candidate in candidates if _is_strong(candidate)]
    if status == "osm_auto_verified":
        return "auto_verified_exact_name_with_geographic_corroboration"
    if not occurrences:
        return "unresolved_missing_area_mapping"
    if restaurant.get("discovery_area_conflict") and restaurant.get(
        "discovery_area_conflict_reason"
    ):
        return "unresolved_area_conflict"
    if status == "needs_manual_review":
        return "needs_manual_review"
    if len(exact_inside) > 1 or (len(exact_anywhere) > 1 and not exact_inside):
        return "unresolved_ambiguous_exact_name_candidates"
    if exact_inside:
        return "unresolved_exact_name_missing_geographic_corroboration"
    if strong_inside:
        return "unresolved_strong_name_missing_geographic_corroboration"
    if exact_outside:
        return "unresolved_exact_name_outside_expected_area"
    if exact_anywhere:
        return "unresolved_exact_name_missing_geographic_corroboration"
    if strong_anywhere:
        return "unresolved_strong_name_missing_geographic_corroboration"
    expected_wards = {
        str(item.get("area")) for item in occurrences if item.get("area_type") == "ward"
    }
    only_weak = bool(candidates) and not strong_anywhere
    if boundary_inference_available and expected_wards and only_weak and not exact_adjacent:
        return "likely_not_represented_in_osm"
    if only_weak:
        return "unresolved_only_weak_name_candidates"
    return "unresolved_no_strong_name_candidate"


def _recommended_action(reason: str) -> str:
    if reason == "needs_manual_review":
        return "review_single_geographically_supported_candidate"
    if reason == "unresolved_ambiguous_exact_name_candidates":
        return "improve_or_review_ward_boundary_and_identity_evidence"
    if reason == "likely_not_represented_in_osm":
        return "route_to_web_address_or_manual_verification"
    if reason == "unresolved_area_conflict":
        return "review_discovery_provenance"
    if "missing_geographic_corroboration" in reason:
        return "obtain_independent_geographic_corroboration"
    if "outside_expected_area" in reason:
        return "verify_identity_before_considering_out_of_area_candidate"
    return "retain_unresolved_and_improve_identity_evidence"


def _candidate_report_summary(candidates: list[MatchCandidate]) -> dict[str, object]:
    exact_inside = [candidate for candidate in candidates if candidate.in_expected_area and _is_exact(candidate)]
    strong_inside = [
        candidate for candidate in candidates
        if candidate.in_expected_area and candidate.identity_strength == "strong_normalized"
    ]
    weak_inside = [
        candidate for candidate in candidates
        if candidate.in_expected_area and candidate.identity_strength == "weak_fuzzy"
    ]
    exact_outside = [
        candidate for candidate in candidates
        if candidate.in_expected_area is False and _is_exact(candidate)
    ]
    in_area = [candidate for candidate in candidates if candidate.in_expected_area]
    return {
        "exact_name_candidates_in_expected_wards": len(exact_inside),
        "strong_name_candidates_in_expected_wards": len(strong_inside),
        "weak_candidates_in_expected_wards": len(weak_inside),
        "exact_name_candidates_outside_expected_wards": len(exact_outside),
        "best_in_area_candidate": asdict(in_area[0]) if in_area else None,
    }


def _restaurant_rows(
    db_path: str | Path, *, limit: int, place_id: str | None, published_only: bool, force: bool
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    conditions = ["p.is_published = 1"] if published_only else ["1 = 1"]
    params: list[object] = []
    if place_id:
        conditions.append("p.place_id = ?")
        params.append(place_id)
    if not force:
        conditions.append("p.map_display_eligible = 0")
    params.append(limit)
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category AS category,
                   p.food_tags_json, p.normalized_address, p.location_source,
                   p.discovery_area, p.discovery_area_type, p.discovery_area_source,
                   p.discovery_source_file, p.discovery_source_row,
                   p.discovery_areas_json, p.multiple_discovery_areas,
                   p.discovery_area_conflict, p.discovery_area_conflict_reason,
                   p.map_display_eligible,
                   r.neighborhood
            FROM public_restaurants p LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE {' AND '.join(conditions)} ORDER BY p.fiyu_score DESC, p.place_id LIMIT ?
            """, params,
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        try:
            item["food_tags"] = json.loads(item.pop("food_tags_json") or "[]")
        except json.JSONDecodeError:
            item["food_tags"] = []
        source_key = str(item.get("location_source") or "").casefold()
        if not source_key or any(term in source_key for term in ("unknown", "google", "scrap")):
            item["normalized_address"] = None
        result.append(item)
    return result


def resolve_osm_locations(
    db_path: str | Path, osm_index_path: str | Path, *, limit: int = 50,
    place_id: str | None = None, published_only: bool = True, force: bool = False,
    dry_run: bool = False, output_report: str | Path | None = None,
    threshold: float = 80.0, runner_up_margin: float = 20.0,
    anchor_radius_km: float = 3.0,
) -> dict[str, object]:
    restaurants = _restaurant_rows(
        db_path, limit=limit, place_id=place_id, published_only=published_only, force=force
    )
    index = sqlite3.connect(f"file:{Path(osm_index_path).resolve().as_posix()}?mode=ro", uri=True)
    index.row_factory = sqlite3.Row
    reports = []
    resolved: list[tuple[dict[str, object], str, list[MatchCandidate]]] = []
    reviewed_anchors = load_location_anchors()
    boundary_available = _boundary_inference_available(index)
    try:
        for restaurant in restaurants:
            status, candidates = resolve_restaurant(
                restaurant, index, threshold=threshold, runner_up_margin=runner_up_margin,
                reviewed_anchors=reviewed_anchors, anchor_radius_km=anchor_radius_km,
            )
            resolved.append((restaurant, status, candidates))
            occurrences = discovery_occurrences(restaurant)
            best_global_candidate = max(
                candidates,
                key=lambda item: sum(
                    value for key, value in item.components.items()
                    if key not in GEOGRAPHY_COMPONENTS
                ),
                default=None,
            )
            reason = _resolution_reason(
                restaurant,
                status,
                candidates,
                boundary_inference_available=boundary_available,
            )
            candidate_summary = _candidate_report_summary(candidates)
            reports.append({
                "place_id": restaurant["place_id"],
                "name_ja": restaurant.get("name_ja"), "name_en": restaurant.get("name_en"),
                "status": status, "resolution_reason": reason,
                "recommended_next_action": _recommended_action(reason),
                "discovery_areas": occurrences,
                "allowed_discovery_areas": sorted({
                    str(item.get("area")) for item in occurrences if item.get("area")
                }),
                "multiple_discovery_areas": len(occurrences) > 1,
                "discovery_source_files": sorted({
                    str(item.get("source_file")) for item in occurrences if item.get("source_file")
                }),
                "discovery_area_conflict": bool(restaurant.get("discovery_area_conflict")),
                "best_global_candidate": (
                    asdict(best_global_candidate) if best_global_candidate else None
                ),
                "identity_strength": candidates[0].identity_strength if candidates else None,
                "geographic_strength": candidates[0].geographic_strength if candidates else None,
                **candidate_summary,
                "candidates": [asdict(candidate) for candidate in candidates],
            })
    finally:
        index.close()
    if not dry_run:
        checked_at = datetime.now(UTC).isoformat()
        with connect(db_path) as connection:
            for restaurant, status, candidates in resolved:
                place = str(restaurant["place_id"])
                if restaurant.get("map_display_eligible"):
                    continue
                connection.execute("DELETE FROM location_match_candidates WHERE place_id = ?", (place,))
                for rank, candidate in enumerate(candidates, start=1):
                    connection.execute(
                        """
                        INSERT INTO location_match_candidates VALUES
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            place, rank, candidate.osm_type, candidate.osm_id, candidate.osm_version,
                            candidate.osm_timestamp, candidate.name,
                            json.dumps(candidate.alternate_names, ensure_ascii=False),
                            candidate.latitude, candidate.longitude, candidate.amenity, candidate.cuisine,
                            json.dumps(candidate.address, ensure_ascii=False, sort_keys=True),
                            candidate.total_score,
                            json.dumps(candidate.components, sort_keys=True),
                            json.dumps(candidate.warnings, sort_keys=True),
                            "approve" if status == "osm_auto_verified" else "unresolved", checked_at,
                        ),
                    )
                if status == "osm_auto_verified":
                    winner = candidates[0]
                    connection.execute(
                        """
                        UPDATE public_restaurants SET latitude=?, longitude=?, location_source='openstreetmap',
                            location_source_reference=?, location_verified_at=?, location_precision='exact',
                            location_verification_status=?, location_match_confidence=?,
                            location_match_method='deterministic_osm_v2_ward_boundary',
                            location_verification_method='automatic_osm_exact_match',
                            location_osm_type=?, location_osm_id=?, location_osm_version=?,
                            location_source_checked_at=?, map_display_eligible=1, updated_at=?
                        WHERE place_id=?
                        """,
                        (
                            winner.latitude, winner.longitude,
                            f"https://www.openstreetmap.org/{winner.osm_type}/{winner.osm_id}", checked_at,
                            status, winner.total_score, winner.osm_type, winner.osm_id,
                            winner.osm_version, checked_at, checked_at, place,
                        ),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE public_restaurants SET location_verification_status=?,
                            location_match_confidence=?,
                            location_match_method='deterministic_osm_v2_ward_boundary',
                            location_source_checked_at=?, map_display_eligible=0, updated_at=?
                        WHERE place_id=?
                        """,
                        (
                            status, candidates[0].total_score if candidates else None,
                            checked_at, checked_at, place,
                        ),
                    )
            connection.commit()
    reason_counts: dict[str, int] = {}
    for report in reports:
        reason = str(report["resolution_reason"])
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
    result = {
        "selected": len(restaurants), "dry_run": dry_run,
        "osm_auto_verified": sum(report["status"] == "osm_auto_verified" for report in reports),
        "needs_manual_review": sum(report["status"] == "needs_manual_review" for report in reports),
        "unresolved": sum(report["status"] == "unresolved" for report in reports),
        "resolution_reason_counts": reason_counts,
        "aggregate_candidate_counts": {
            "exact_name_candidate_in_expected_area": sum(
                int(report["exact_name_candidates_in_expected_wards"]) > 0
                for report in reports
            ),
            "strong_name_candidate_in_expected_area": sum(
                int(report["strong_name_candidates_in_expected_wards"]) > 0
                for report in reports
            ),
            "only_weak_candidates": sum(
                report["resolution_reason"] in {
                    "unresolved_only_weak_name_candidates", "likely_not_represented_in_osm"
                }
                for report in reports
            ),
            "no_candidate_in_expected_area": sum(
                not report["best_in_area_candidate"] for report in reports
            ),
            "ambiguous_same_name_candidates": reason_counts.get(
                "unresolved_ambiguous_exact_name_candidates", 0
            ),
            "likely_missing_from_osm": reason_counts.get("likely_not_represented_in_osm", 0),
            "boundary_inference_unavailable": 0 if boundary_available else len(reports),
        },
        "reports": reports,
    }
    if output_report:
        write_resolution_report(output_report, reports)
        report_path = Path(output_report)
        summary_path = report_path.with_name(f"{report_path.stem}.summary.json")
        summary_path.write_text(
            json.dumps(
                {key: value for key, value in result.items() if key != "reports"},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        result["summary_report"] = str(summary_path)
    return result


def write_resolution_report(
    output_path: str | Path, reports: list[dict[str, object]]
) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.casefold()
    if suffix == ".json":
        path.write_text(
            json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return
    if suffix == ".csv":
        fields = [
            "place_id", "name_ja", "name_en", "status", "resolution_reason",
            "recommended_next_action", "allowed_discovery_areas",
            "multiple_discovery_areas", "discovery_areas", "discovery_source_files",
            "discovery_area_conflict", "identity_strength", "geographic_strength",
            "exact_name_candidates_in_expected_wards",
            "strong_name_candidates_in_expected_wards", "weak_candidates_in_expected_wards",
            "exact_name_candidates_outside_expected_wards",
            "best_global_osm_type", "best_global_osm_id", "best_global_candidate_name",
            "candidate_rank", "candidate_name", "alternate_names",
            "latitude", "longitude", "osm_type", "osm_id", "amenity", "cuisine",
            "address_tag_ward", "spatially_inferred_ward", "ward_boundary_osm_id",
            "ward_boundary_version", "ward_inference_method", "ward_conflict",
            "inferred_ward", "in_expected_area", "supporting_discovery_area",
            "discovery_anchor_distance_km", "total_score", "components", "warnings",
        ]
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for report in reports:
                candidates = report.get("candidates")
                candidate_rows = candidates if isinstance(candidates, list) and candidates else [{}]
                for rank, candidate in enumerate(candidate_rows, start=1):
                    best_global = report.get("best_global_candidate")
                    best_global = best_global if isinstance(best_global, dict) else {}
                    writer.writerow({
                        "place_id": report.get("place_id"), "name_ja": report.get("name_ja"),
                        "name_en": report.get("name_en"), "status": report.get("status"),
                        "resolution_reason": report.get("resolution_reason"),
                        "recommended_next_action": report.get("recommended_next_action"),
                        "allowed_discovery_areas": json.dumps(
                            report.get("allowed_discovery_areas", []), ensure_ascii=False
                        ),
                        "multiple_discovery_areas": report.get("multiple_discovery_areas"),
                        "discovery_areas": json.dumps(
                            report.get("discovery_areas", []), ensure_ascii=False
                        ),
                        "discovery_source_files": json.dumps(
                            report.get("discovery_source_files", []), ensure_ascii=False
                        ),
                        "discovery_area_conflict": report.get("discovery_area_conflict"),
                        "identity_strength": candidate.get("identity_strength"),
                        "geographic_strength": candidate.get("geographic_strength"),
                        "exact_name_candidates_in_expected_wards": report.get(
                            "exact_name_candidates_in_expected_wards"
                        ),
                        "strong_name_candidates_in_expected_wards": report.get(
                            "strong_name_candidates_in_expected_wards"
                        ),
                        "weak_candidates_in_expected_wards": report.get(
                            "weak_candidates_in_expected_wards"
                        ),
                        "exact_name_candidates_outside_expected_wards": report.get(
                            "exact_name_candidates_outside_expected_wards"
                        ),
                        "best_global_osm_type": best_global.get("osm_type"),
                        "best_global_osm_id": best_global.get("osm_id"),
                        "best_global_candidate_name": best_global.get("name"),
                        "candidate_rank": rank, "candidate_name": candidate.get("name"),
                        "alternate_names": json.dumps(
                            candidate.get("alternate_names", []), ensure_ascii=False
                        ),
                        "latitude": candidate.get("latitude"),
                        "longitude": candidate.get("longitude"), "osm_type": candidate.get("osm_type"),
                        "osm_id": candidate.get("osm_id"), "amenity": candidate.get("amenity"),
                        "cuisine": candidate.get("cuisine"),
                        "address_tag_ward": candidate.get("address_tag_ward"),
                        "spatially_inferred_ward": candidate.get("spatially_inferred_ward"),
                        "ward_boundary_osm_id": candidate.get("ward_boundary_osm_id"),
                        "ward_boundary_version": candidate.get("ward_boundary_version"),
                        "ward_inference_method": candidate.get("ward_inference_method"),
                        "ward_conflict": candidate.get("ward_conflict"),
                        "inferred_ward": candidate.get("inferred_ward"),
                        "in_expected_area": candidate.get("in_expected_area"),
                        "supporting_discovery_area": candidate.get(
                            "supporting_discovery_area"
                        ),
                        "discovery_anchor_distance_km": candidate.get(
                            "discovery_anchor_distance_km"
                        ),
                        "total_score": candidate.get("total_score"),
                        "components": json.dumps(candidate.get("components", {}), ensure_ascii=False),
                        "warnings": json.dumps(candidate.get("warnings", []), ensure_ascii=False),
                    })
        return
    raise ValueError("--output-report must end in .json or .csv")
