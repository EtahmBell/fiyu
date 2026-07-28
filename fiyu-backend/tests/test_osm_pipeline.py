from __future__ import annotations

import csv
import json
import sqlite3
from contextlib import contextmanager

from fiyu.address_geocoder import AddressGeocodeResult
from fiyu.database import SCHEMA, connect
from fiyu.discovery_areas import TOKYO_WARD_NAMES
from fiyu.location_names import normalize_location_name
from fiyu.osm_anchors import resolve_osm_anchors
from fiyu.osm_index import (
    OSMFeature,
    OSMWardBoundary,
    _tokyo_special_ward,
    build_osm_index,
    polygon_representative_point,
)
from fiyu.osm_resolver import resolve_osm_locations, resolve_restaurant
from fiyu.osm_review import export_osm_location_review, import_osm_location_review
from fiyu.public_catalog import ensure_public_schema


def _feature(
    osm_id, name, *, osm_type="node", lat=35.68, lon=139.76, extra=None, polygon=False
):
    tags = {"name": name, "amenity": "restaurant", "addr:suburb": "Ginza"}
    tags.update(extra or {})
    geometry = (
        ((lat, lon), (lat, lon + .002), (lat + .002, lon + .002), (lat + .002, lon), (lat, lon))
        if polygon else ((lat, lon),)
    )
    return OSMFeature(osm_type, osm_id, tags, geometry, 3, "2026-01-01T00:00:00Z", polygon)


def _boundary(ward, osm_id, min_lat, max_lat, min_lon, max_lon):
    outer = (
        (min_lat, min_lon), (min_lat, max_lon), (max_lat, max_lon),
        (max_lat, min_lon), (min_lat, min_lon),
    )
    return OSMWardBoundary(
        ward, osm_id, ((outer, ()),),
        {"name": f"{ward} City", "name:en": ward, "boundary": "administrative",
         "admin_level": "7"},
        4, "2026-01-01T00:00:00Z",
    )


def _index(tmp_path, features, boundaries=()):
    path = tmp_path / "osm.sqlite"
    build_osm_index(
        tmp_path / "synthetic.osm.pbf", path, features=features,
        ward_boundaries=boundaries,
    )
    return path


def _complete_boundaries():
    boundaries = []
    for index, ward in enumerate(TOKYO_WARD_NAMES, start=1):
        if ward == "Taito":
            bounds = (35.65, 35.75, 139.70, 139.80)
        else:
            offset = index / 1000
            bounds = (34.0 + offset, 34.0005 + offset, 138.0, 138.0005)
        boundaries.append(_boundary(ward, 10_000 + index, *bounds))
    return boundaries


def _restaurant(**changes):
    row = {
        "place_id": "p1", "name_ja": "銀座鮨", "name_en": "Ginza Sushi",
        "neighborhood": "Ginza", "category": "restaurant", "food_tags": ["sushi"],
        "normalized_address": None,
    }
    row.update(changes)
    return row


@contextmanager
def _open_index(path):
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def _db(tmp_path):
    path = tmp_path / "fiyu.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants
                (place_id, title, neighborhood, latitude, longitude, rating, review_count)
            VALUES ('p1', 'Legacy', 'Ginza', 35.1, 139.1, 4.5, 20)
            """
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants
                (place_id, name_ja, name_en, primary_category, food_tags_json, why_fiyu,
                 fiyu_score, score_band, evidence_json, is_published, created_at, updated_at)
            VALUES ('p1', '銀座鮨', 'Ginza Sushi', 'restaurant', '["sushi"]',
                    'Kept description', 91, 'excellent', '{"kept": true}', 1, 'created', 'before')
            """
        )
        connection.commit()
    return path


def test_japanese_name_normalization_preserves_branch_identifiers():
    assert normalize_location_name("  ＡＢＣ　寿司！！ ") == "abc 寿司!"
    assert normalize_location_name("ﾗｰﾒﾝ・・・店") == "ラーメン・店"
    assert normalize_location_name("Sushi　銀座") == "sushi 銀座"
    assert normalize_location_name("鮨 本店") != normalize_location_name("鮨 支店")


def test_provider_neutral_address_geocoder_result_supports_future_mock():
    class MockGeocoder:
        def geocode(self, address):
            return AddressGeocodeResult(
                normalized_address=address, latitude=35.68, longitude=139.76,
                address_level_match="town", town_id="mock-town", provenance="synthetic-fixture",
            )

    result = MockGeocoder().geocode("東京都の独立確認済み住所")
    assert result.town_id == "mock-town"
    assert result.provenance == "synthetic-fixture"


def test_index_streams_nodes_ways_relations_and_uses_polygon_centroid(tmp_path):
    features = [
        _feature(1, "Node"),
        _feature(2, "Way", osm_type="way", polygon=True),
        _feature(3, "Relation", osm_type="relation", polygon=True),
        OSMFeature("node", 4, {"railway": "station", "name": "Ginza Station"}, ((35.6, 139.7),)),
    ]
    path = tmp_path / "index.sqlite"
    result = build_osm_index(tmp_path / "fixture.osm.pbf", path, features=features)
    assert result["nodes"] == 2
    assert result["ways"] == 1
    assert result["relations"] == 1
    with _open_index(path) as connection:
        rows = connection.execute("SELECT * FROM osm_locations ORDER BY osm_id").fetchall()
    assert len(rows) == 4
    assert round(rows[1]["latitude"], 3) == 35.681
    assert round(rows[1]["longitude"], 3) == 139.761
    assert "google" not in rows[0]["tags_json"].casefold()


def test_polygon_representative_point_is_not_arbitrary_vertex():
    point = polygon_representative_point(
        [(35.0, 139.0), (35.0, 139.2), (35.2, 139.2), (35.2, 139.0)]
    )
    assert round(point[0], 3) == 35.1
    assert round(point[1], 3) == 139.1


def test_tokyo_ward_filter_rejects_homonymous_non_tokyo_boundaries():
    assert _tokyo_special_ward({
        "name": "千代田区", "name:ja": "千代田区", "name:en": "Chiyoda",
        "boundary": "administrative", "admin_level": "7", "ref": "131016",
    }) == "Chiyoda"
    assert _tokyo_special_ward({
        "name": "千代田町", "name:en": "Chiyoda", "boundary": "administrative",
        "admin_level": "7", "ref": "105236",
    }) is None
    assert _tokyo_special_ward({
        "name": "中央区", "name:en": "Chuo Ward", "boundary": "administrative",
        "admin_level": "8", "ref": "111058",
    }) is None


def test_exact_unique_neighborhood_and_cuisine_match_auto_verifies(tmp_path):
    index = _index(tmp_path, [_feature(1, "銀座鮨", extra={"cuisine": "sushi"})])
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(_restaurant(), connection)
    assert status == "osm_auto_verified"
    assert candidates[0].components["exact_japanese_name"] == 55
    assert candidates[0].components["neighborhood_agreement"] == 15
    assert candidates[0].components["cuisine_agreement"] == 10


def test_ambiguous_duplicate_and_multiple_branches_require_review(tmp_path):
    index = _index(
        tmp_path,
        [_feature(1, "銀座鮨"), _feature(2, "銀座鮨", lat=35.69), _feature(3, "銀座鮨 支店")],
    )
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(_restaurant(), connection)
    assert status == "needs_manual_review"
    assert len(candidates) >= 2


def test_generic_and_fuzzy_names_never_auto_verify(tmp_path):
    generic_index = _index(tmp_path, [_feature(1, "食堂")])
    with _open_index(generic_index) as connection:
        status, candidates = resolve_restaurant(
            _restaurant(name_ja="食堂", name_en=""), connection
        )
    assert status == "unresolved"
    assert "generic_name" in candidates[0].warnings

    fuzzy_index = _index(tmp_path, [_feature(2, "銀座寿司")])
    with _open_index(fuzzy_index) as connection:
        status, candidates = resolve_restaurant(_restaurant(), connection)
    assert status != "osm_auto_verified"
    assert not candidates or "fuzzy_name_only" in candidates[0].warnings


def _with_discovery(row, *areas):
    occurrences = [
        {
            "area": area,
            "area_type": "ward",
            "source_file": f"{area}_Initial.csv",
            "source_row": index + 2,
        }
        for index, area in enumerate(areas)
    ]
    return {
        **row,
        "neighborhood": "",
        "discovery_areas_json": json.dumps(occurrences, ensure_ascii=False),
        "discovery_area_conflict": len(occurrences) > 1,
    }


def test_exact_name_inside_expected_ward_can_verify(tmp_path):
    index = _index(tmp_path, [_feature(1, "銀座鮨", extra={"addr:city": "Taito City"})])
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Taito"), connection
        )
    assert status == "osm_auto_verified"
    assert candidates[0].inferred_ward == "Taito"
    assert candidates[0].components["discovery_ward_agreement"] == 25


def test_exact_name_outside_expected_ward_is_unresolved(tmp_path):
    index = _index(tmp_path, [_feature(1, "銀座鮨", extra={"addr:city": "Shinjuku City"})])
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Taito"), connection
        )
    assert status == "unresolved"
    assert candidates[0].components["outside_discovery_area_penalty"] == -30


def test_same_name_in_different_wards_prefers_expected_ward(tmp_path):
    index = _index(tmp_path, [
        _feature(1, "銀座鮨", extra={"addr:city": "Shinjuku City"}),
        _feature(2, "銀座鮨", lat=35.69, extra={"addr:city": "Taito City"}),
    ])
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Taito"), connection
        )
    assert status == "osm_auto_verified"
    assert candidates[0].osm_id == 2


def test_adjacent_ward_remains_reviewable_and_fuzzy_inside_stays_unresolved(tmp_path):
    adjacent = _index(tmp_path, [
        _feature(1, "銀座鮨", extra={"addr:city": "Chuo City"})
    ])
    with _open_index(adjacent) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Chiyoda"), connection
        )
    assert status == "needs_manual_review"
    assert candidates[0].components["adjacent_area_agreement"] == 5

    fuzzy = _index(tmp_path, [
        _feature(2, "銀座寿司", extra={"addr:city": "Taito City"})
    ])
    with _open_index(fuzzy) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Taito"), connection
        )
    assert status == "unresolved"
    assert "fuzzy_name_only" in candidates[0].warnings


def test_multiple_discovery_areas_are_permitted_without_duplicate_scoring(tmp_path):
    index = _index(tmp_path, [_feature(1, "銀座鮨", extra={"addr:city": "Taito City"})])
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Taito", "Shibuya"), connection
        )
    assert status == "osm_auto_verified"
    assert candidates[0].components["discovery_ward_agreement"] == 25
    assert candidates[0].components["discovery_area_conflict_penalty"] == 0


def test_coordinate_based_ward_inference_preserves_boundary_provenance(tmp_path):
    index = _index(
        tmp_path,
        [_feature(1, "銀座鮨", lat=35.70, lon=139.75, extra={"addr:suburb": ""})],
        [_boundary("Taito", 12345, 35.65, 35.75, 139.70, 139.80)],
    )
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Taito"), connection
        )
    assert status == "osm_auto_verified"
    candidate = candidates[0]
    assert candidate.address_tag_ward is None
    assert candidate.spatially_inferred_ward == "Taito"
    assert candidate.ward_boundary_osm_id == 12345
    assert candidate.ward_boundary_version == 4
    assert candidate.ward_inference_method == "point_in_polygon"
    assert candidate.in_expected_area is True
    assert candidate.supporting_discovery_area == "Taito"


def test_address_and_spatial_ward_disagreement_blocks_auto_verification(tmp_path):
    index = _index(
        tmp_path,
        [_feature(1, "銀座鮨", lat=35.70, lon=139.75, extra={"addr:city": "Shinjuku City"})],
        [_boundary("Taito", 12345, 35.65, 35.75, 139.70, 139.80)],
    )
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(
            _with_discovery(_restaurant(), "Taito"), connection
        )
    assert status != "osm_auto_verified"
    assert candidates[0].ward_conflict is True
    assert "ward_inference_conflict" in candidates[0].warnings


def test_weak_in_area_candidate_routes_to_likely_missing_pipeline(tmp_path):
    db = _db(tmp_path)
    occurrences = [{
        "area": "Taito", "area_type": "ward", "source_file": "Taito_Initial.csv",
        "source_row": 2,
    }]
    with connect(db) as connection:
        connection.execute(
            """
            UPDATE public_restaurants SET name_ja='ONDER', name_en='',
                discovery_areas_json=?, multiple_discovery_areas=0,
                discovery_area_conflict=0
            WHERE place_id='p1'
            """,
            (json.dumps(occurrences, ensure_ascii=False),),
        )
        connection.commit()
    index = _index(
        tmp_path,
        [_feature(1, "ONE SHOT BAR", lat=35.70, lon=139.75, extra={"addr:suburb": ""})],
        _complete_boundaries(),
    )
    output_report = tmp_path / "weak-report.json"
    result = resolve_osm_locations(db, index, dry_run=True, output_report=output_report)
    report = result["reports"][0]
    assert report["status"] == "unresolved"
    assert report["resolution_reason"] == "likely_not_represented_in_osm"
    assert report["identity_strength"] == "weak_fuzzy"
    assert report["weak_candidates_in_expected_wards"] == 1
    assert report["recommended_next_action"] == "route_to_web_address_or_manual_verification"
    summary = json.loads((tmp_path / "weak-report.summary.json").read_text(encoding="utf-8"))
    assert summary["aggregate_candidate_counts"]["likely_missing_from_osm"] == 1


def test_global_ambiguous_exact_names_are_not_sent_to_manual_review(tmp_path):
    db = _db(tmp_path)
    occurrences = [{
        "area": "Chiyoda", "area_type": "ward", "source_file": "Chiyoda_Initial.csv",
        "source_row": 2,
    }]
    with connect(db) as connection:
        connection.execute(
            """
            UPDATE public_restaurants SET name_ja='金寿司', name_en='Kin Sushi',
                discovery_areas_json=?, multiple_discovery_areas=0,
                discovery_area_conflict=0
            WHERE place_id='p1'
            """,
            (json.dumps(occurrences, ensure_ascii=False),),
        )
        connection.commit()
    index = _index(
        tmp_path,
        [_feature(number, "金寿司", lat=35.50 + number / 100, lon=139.60)
         for number in range(1, 6)],
        _complete_boundaries(),
    )
    result = resolve_osm_locations(db, index, dry_run=True)
    report = result["reports"][0]
    assert report["status"] == "unresolved"
    assert report["resolution_reason"] == "unresolved_ambiguous_exact_name_candidates"
    assert result["aggregate_candidate_counts"]["ambiguous_same_name_candidates"] == 1


def test_out_of_tokyo_candidate_is_heavily_penalized(tmp_path):
    index = _index(
        tmp_path,
        [_feature(1, "銀座鮨", extra={"cuisine": "sushi"}),
         _feature(2, "銀座鮨", lat=40.0, lon=139.0, extra={"cuisine": "sushi"})],
    )
    with _open_index(index) as connection:
        status, candidates = resolve_restaurant(_restaurant(), connection)
    assert status == "osm_auto_verified"
    assert any("outside_tokyo" in candidate.warnings for candidate in candidates)
    assert any(
        candidate.components["outside_tokyo_penalty"] == -100 for candidate in candidates
    )


def test_resolution_dry_run_and_write_preserve_catalog_fields(tmp_path):
    db = _db(tmp_path)
    index = _index(tmp_path, [_feature(1, "銀座鮨", extra={"cuisine": "sushi"})])
    with connect(db) as connection:
        before = dict(connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id='p1'"
        ).fetchone())
    result = resolve_osm_locations(db, index, dry_run=True)
    assert result["osm_auto_verified"] == 1
    with connect(db) as connection:
        assert connection.execute(
            "SELECT map_display_eligible FROM public_restaurants WHERE place_id='p1'"
        ).fetchone()[0] == 0
    resolve_osm_locations(db, index)
    with connect(db) as connection:
        after = dict(connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id='p1'"
        ).fetchone())
    assert after["map_display_eligible"] == 1
    assert after["location_source"] == "openstreetmap"
    assert after["location_osm_id"] == 1
    for field in ("is_published", "fiyu_score", "score_band", "evidence_json", "why_fiyu"):
        assert after[field] == before[field]


def test_force_resolution_does_not_modify_existing_approved_location(tmp_path):
    db = _db(tmp_path)
    with connect(db) as connection:
        connection.execute(
            """
            UPDATE public_restaurants SET
                latitude=35.724271, longitude=139.7959175,
                location_source='openstreetmap', location_osm_type='node',
                location_osm_id=9175842396, location_verification_status='manually_verified',
                map_display_eligible=1
            WHERE place_id='p1'
            """
        )
        connection.commit()
        before = dict(connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id='p1'"
        ).fetchone())
    index = _index(tmp_path, [_feature(99, "Different restaurant")])
    resolve_osm_locations(db, index, force=True)
    with connect(db) as connection:
        after = dict(connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id='p1'"
        ).fetchone())
    assert after == before


def test_ambiguous_review_export_approval_and_rejection(tmp_path):
    db = _db(tmp_path)
    index = _index(tmp_path, [_feature(1, "銀座鮨"), _feature(2, "銀座鮨", lat=35.69)])
    resolve_osm_locations(db, index)
    review = tmp_path / "review.csv"
    assert export_osm_location_review(db, review, limit=20) == 2
    with review.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
        fields = list(rows[0])
    rows[0].update({
        "reviewer_decision": "approve", "reviewed_by": "reviewer-1",
        "reviewed_at": "2026-07-27", "reviewer_notes": "Exact storefront checked",
    })
    with review.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    dry = import_osm_location_review(db, review, dry_run=True)
    assert dry["updated"] == 0 and dry["validation_failures"] == 0
    imported = import_osm_location_review(db, review)
    assert imported["updated"] == 1
    with connect(db) as connection:
        row = connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id='p1'"
        ).fetchone()
    assert row["location_verification_status"] == "manually_verified"
    assert row["map_display_eligible"] == 1

    rows = rows[:1]
    rows[0]["reviewer_decision"] = "reject"
    with review.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader(); writer.writerows(rows)
    import_osm_location_review(db, review)
    with connect(db) as connection:
        row = connection.execute(
            "SELECT location_verification_status, map_display_eligible FROM public_restaurants"
        ).fetchone()
    assert tuple(row) == ("reject", 0)


def test_station_anchor_resolution_proposes_but_does_not_review(tmp_path):
    index = _index(
        tmp_path,
        [OSMFeature(
            "node", 10, {"railway": "station", "name": "Ginza Station"}, ((35.67, 139.76),)
        )],
    )
    anchors = tmp_path / "anchors.json"
    anchors.write_text(json.dumps([{
        "id": "ginza-station", "display_name": "Ginza Station", "area_name": "Ginza",
        "latitude": None, "longitude": None, "precision": "area_anchor",
        "qualifier": "Approximate center of Ginza", "source": None,
        "source_reference": None, "osm_type": None, "osm_id": None,
        "verified_at": None, "reviewed": False,
    }]), encoding="utf-8")
    output = tmp_path / "anchor-review.json"
    result = resolve_osm_anchors(index, anchors, output)
    assert result["exact_match_proposals"] == 1
    proposal = json.loads(output.read_text(encoding="utf-8"))[0]
    assert proposal["osm_id"] == 10
    assert proposal["reviewed"] is False


def test_review_import_rejects_modified_restaurant_fields(tmp_path):
    db = _db(tmp_path)
    index = _index(tmp_path, [_feature(1, "銀座鮨"), _feature(2, "銀座鮨", lat=35.69)])
    resolve_osm_locations(db, index)
    review = tmp_path / "tampered.csv"
    export_osm_location_review(db, review)
    with review.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle)); fields = list(rows[0])
    rows = rows[:1]
    rows[0].update({
        "name_ja": "改変", "reviewer_decision": "approve", "reviewed_by": "reviewer",
        "reviewed_at": "2026-07-27",
    })
    with review.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields); writer.writeheader(); writer.writerows(rows)
    result = import_osm_location_review(db, review)
    assert result["validation_failures"] == 1
    assert result["updated"] == 0
