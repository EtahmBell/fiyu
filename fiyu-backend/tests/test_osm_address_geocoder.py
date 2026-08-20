from __future__ import annotations

import json
import sqlite3

import pytest

from fiyu.address_geocoder import (
    AddressGeocoderLookupError,
    LocalOSMAddressGeocoder,
)
from fiyu.address_geocoding import geocode_address_file
from fiyu.osm_address_normalization import parse_japanese_address
from fiyu.osm_index import (
    OSMAddressArea,
    OSMFeature,
    OSMWardBoundary,
    _point_in_polygon,
    build_osm_index,
    stable_point_within_polygon,
)


def _feature(
    osm_id: int,
    *,
    ward: str = "千代田区",
    neighborhood: str = "神田佐久間町一丁目",
    housenumber: str | None = "13",
    block_number: str | None = None,
    entrance: str | None = None,
    building: bool = False,
    latitude: float = 35.698,
    longitude: float = 139.775,
) -> OSMFeature:
    tags = {
        "addr:prefecture": "東京都",
        "addr:city": ward,
        "addr:neighbourhood": neighborhood,
    }
    if housenumber:
        tags["addr:housenumber"] = housenumber
    if block_number:
        tags["addr:block_number"] = block_number
    if entrance:
        tags["entrance"] = entrance
    if building:
        tags["building"] = "yes"
        geometry = (
            (latitude, longitude),
            (latitude, longitude + 0.0002),
            (latitude + 0.0002, longitude + 0.0002),
            (latitude + 0.0002, longitude),
            (latitude, longitude),
        )
        osm_type = "way"
    else:
        geometry = ((latitude, longitude),)
        osm_type = "node"
    return OSMFeature(
        osm_type,
        osm_id,
        tags,
        geometry,
        osm_version=7,
        osm_timestamp="2026-07-01T00:00:00Z",
        is_polygon=building,
    )


def _index(tmp_path, features: list[OSMFeature], *, areas=(), wards=()):
    path = tmp_path / "osm-addresses.sqlite"
    result = build_osm_index(
        tmp_path / "synthetic.osm.pbf",
        path,
        features=features,
        address_areas=areas,
        ward_boundaries=wards,
    )
    assert result["address_indexed"] == len(features)
    return path


def _area(
    osm_id: int,
    *,
    level: str,
    ward: str = "Suginami",
    neighborhood: str = "浜田山",
    chome: str | None = "3",
    block: str | None = None,
    polygon=None,
    extra_tags=None,
) -> OSMAddressArea:
    outer = polygon or (
        (35.6800, 139.6260),
        (35.6800, 139.6280),
        (35.6820, 139.6280),
        (35.6820, 139.6260),
        (35.6800, 139.6260),
    )
    name = neighborhood
    if chome:
        name += f"{chome}丁目"
    if block:
        name += f"{block}番"
    tags = {"name": name, "boundary": "administrative", "admin_level": "11"}
    tags.update(extra_tags or {})
    return OSMAddressArea(
        "relation", osm_id, level, neighborhood, ((outer, ()),),
        tags,
        ward=ward, chome=chome, block=block,
        osm_version=4, osm_timestamp="2026-07-01T00:00:00Z",
    )


def _ward(osm_id: int, *, name="Suginami", polygon=None):
    outer = polygon or (
        (35.67, 139.60), (35.67, 139.66), (35.72, 139.66),
        (35.72, 139.60), (35.67, 139.60),
    )
    return OSMWardBoundary(
        name, osm_id, ((outer, ()),),
        {"name": "杉並区", "name:ja": "杉並区", "boundary": "administrative"},
        osm_version=8, osm_timestamp="2026-07-01T00:00:00Z",
    )


@pytest.mark.parametrize(
    "value",
    [
        "神田佐久間町1-13",
        "神田佐久間町１丁目１３",
        "神田佐久間町1丁目13番",
    ],
)
def test_japanese_address_notation_normalizes_equivalently(value):
    parsed = parse_japanese_address(value)
    assert parsed.neighborhood == "神田佐久間町"
    assert parsed.number_key == "1-13"
    assert parsed.normalized == "神田佐久間町1-13"


@pytest.mark.parametrize(
    "value",
    ["浜田山3-30-5", "浜田山3丁目30番5号", "浜田山３丁目３０番５号", "浜田山3丁目30-5"],
)
def test_hierarchical_japanese_number_notation_preserves_components(value):
    parsed = parse_japanese_address(value)
    assert parsed.normalized == "浜田山3-30-5"
    assert parsed.number_parts == ("3", "30", "5")
    assert parsed.chome == "3"
    assert parsed.block == "30"
    assert parsed.sub_number == "5"


def test_optional_tokyo_prefix_does_not_change_normalized_address():
    with_prefix = parse_japanese_address("東京都千代田区神田佐久間町1-13")
    without_prefix = parse_japanese_address("千代田区神田佐久間町1-13")
    assert with_prefix.normalized == without_prefix.normalized


def test_exact_address_node_match_preserves_osm_provenance(tmp_path):
    geocoder = LocalOSMAddressGeocoder(_index(tmp_path, [_feature(1)]))
    result = geocoder.geocode(
        "東京都千代田区神田佐久間町1-13",
        place_id="restaurant-1",
        input_fingerprint="fingerprint-1",
    )
    assert result is not None
    assert result.match_status == "matched_exact"
    assert result.address_level_match == "address"
    assert result.map_location_approximate is False
    assert result.osm_type == "node" and result.osm_id == 1
    assert result.osm_version == 7
    assert result.osm_timestamp == "2026-07-01T00:00:00Z"
    assert result.representative_point_method == "node_location"
    assert result.matched_components["address_number"] == "1-13"


def test_addressed_entrance_is_an_exact_match(tmp_path):
    geocoder = LocalOSMAddressGeocoder(
        _index(tmp_path, [_feature(2, entrance="main")])
    )
    result = geocoder.geocode("東京都千代田区神田佐久間町1-13")
    assert result is not None
    assert result.match_status == "matched_exact"
    with sqlite3.connect(geocoder.index_path) as connection:
        assert connection.execute(
            "SELECT object_kind FROM osm_addresses WHERE osm_id=2"
        ).fetchone()[0] == "addressed_entrance"


def test_addressed_building_polygon_uses_centroid(tmp_path):
    feature = _feature(3, building=True)
    geocoder = LocalOSMAddressGeocoder(_index(tmp_path, [feature]))
    result = geocoder.geocode("東京都千代田区神田佐久間町1-13")
    assert result is not None
    assert result.match_status == "matched_building"
    assert result.address_level_match == "building"
    assert result.representative_point_method == "polygon_centroid"
    assert (result.latitude, result.longitude) != feature.geometry[0]


def test_block_level_match_is_approximate_medium_tier(tmp_path):
    block = _feature(4, housenumber=None, block_number="13")
    result = LocalOSMAddressGeocoder(_index(tmp_path, [block])).geocode(
        "東京都千代田区神田佐久間町1-13"
    )
    assert result is not None
    assert result.match_status == "matched_block_approximate"
    assert result.address_level_match == "block"
    assert result.map_location_approximate is True
    assert result.suggested_verification_tier == "provisional_medium"


def test_missing_final_sub_number_is_block_approximate_with_diagnostics(tmp_path):
    block = _feature(
        41,
        ward="杉並区",
        neighborhood="浜田山三丁目",
        housenumber=None,
        block_number="30",
        latitude=35.681,
        longitude=139.627,
    )
    result = LocalOSMAddressGeocoder(
        _index(tmp_path, [block]), include_candidates=True
    ).geocode("東京都杉並区浜田山3-30-5")
    assert result is not None
    assert result.match_status == "matched_block_approximate"
    assert result.map_location_approximate is True
    assert result.suggested_verification_tier == "provisional_medium"
    diagnostic = result.diagnostic_candidates[0]
    assert diagnostic["parsed_chome"] == "3"
    assert diagnostic["parsed_block"] == "30"
    assert diagnostic["parsed_sub_number"] is None
    assert diagnostic["match_level"] == "block"
    assert diagnostic["missing_components"] == ["sub_number"]
    assert diagnostic["distance_meters"] is None
    assert diagnostic["representative_point_method"] == "node_location"


def test_japanese_marker_input_matches_flat_osm_number_exactly(tmp_path):
    exact = _feature(
        42,
        ward="渋谷区",
        neighborhood="神宮前二丁目",
        block_number="23",
        housenumber="4",
    )
    result = LocalOSMAddressGeocoder(_index(tmp_path, [exact])).geocode(
        "東京都渋谷区神宮前2丁目23番4号"
    )
    assert result is not None
    assert result.match_status == "matched_exact"
    assert result.map_location_approximate is False
    assert result.matched_components["chome"] == "2"
    assert result.matched_components["block"] == "23"
    assert result.matched_components["sub_number"] == "4"


def test_narrow_address_interpolation_is_approximate(tmp_path):
    feature = OSMFeature(
        "way",
        40,
        {
            "addr:prefecture": "東京都",
            "addr:city": "千代田区",
            "addr:neighbourhood": "神田佐久間町一丁目",
            "addr:housenumber": "13",
            "addr:interpolation": "all",
        },
        ((35.698, 139.775), (35.6984, 139.7754)),
        osm_version=2,
        osm_timestamp="2026-07-01T00:00:00Z",
    )
    result = LocalOSMAddressGeocoder(_index(tmp_path, [feature])).geocode(
        "東京都千代田区神田佐久間町1-13"
    )
    assert result is not None
    assert result.match_status == "matched_block_approximate"
    assert result.representative_point_method == "line_midpoint"
    assert "osm_narrow_interpolation_match_is_approximate" in result.warnings


@pytest.mark.parametrize(
    ("feature", "status"),
    [
        (_feature(5, ward="渋谷区"), "rejected_ward_mismatch"),
        (_feature(6, housenumber="14"), "rejected_address_number_mismatch"),
    ],
)
def test_wrong_ward_and_different_house_number_are_rejected(tmp_path, feature, status):
    geocoder = LocalOSMAddressGeocoder(_index(tmp_path, [feature]))
    with pytest.raises(AddressGeocoderLookupError) as error:
        geocoder.geocode("東京都千代田区神田佐久間町1-13")
    assert error.value.status == status


def test_wrong_block_and_numeric_closeness_are_rejected_with_component_diagnostics(tmp_path):
    nearby_number = _feature(
        43,
        ward="杉並区",
        neighborhood="浜田山三丁目",
        block_number="29",
        housenumber="5",
    )
    geocoder = LocalOSMAddressGeocoder(
        _index(tmp_path, [nearby_number]), include_candidates=True
    )
    with pytest.raises(AddressGeocoderLookupError) as error:
        geocoder.geocode("東京都杉並区浜田山3-30-5")
    assert error.value.status == "rejected_address_number_mismatch"
    diagnostic = error.value.diagnostics["candidates"][0]
    assert diagnostic["parsed_block"] == "29"
    assert diagnostic["differing_components"]["block"] == {
        "expected": "30", "candidate": "29"
    }
    assert diagnostic["candidate_decision"] == "rejected"
    assert "numeric closeness is not accepted" in diagnostic["reason"]
    assert diagnostic["address_tags"]["addr:block_number"] == "29"


def test_chome_only_candidate_is_reported_but_not_accepted(tmp_path):
    chome_only = _feature(
        44,
        ward="杉並区",
        neighborhood="浜田山",
        block_number=None,
        housenumber="3",
    )
    geocoder = LocalOSMAddressGeocoder(
        _index(tmp_path, [chome_only]), include_candidates=True
    )
    with pytest.raises(AddressGeocoderLookupError) as error:
        geocoder.geocode("東京都杉並区浜田山3-30-5")
    assert error.value.status == "matched_chome_only"
    diagnostic = error.value.diagnostics["candidates"][0]
    assert diagnostic["match_level"] == "chome"
    assert diagnostic["parsed_chome"] == "3"
    assert diagnostic["parsed_block"] is None
    assert diagnostic["candidate_decision"] == "rejected"


def test_ambiguous_exact_candidates_are_rejected(tmp_path):
    geocoder = LocalOSMAddressGeocoder(
        _index(
            tmp_path,
            [_feature(7), _feature(8, latitude=35.699, longitude=139.776)],
        )
    )
    with pytest.raises(AddressGeocoderLookupError) as error:
        geocoder.geocode("東京都千代田区神田佐久間町1-13")
    assert error.value.status == "ambiguous"


def test_multiple_equally_plausible_block_candidates_are_rejected(tmp_path):
    candidates = [
        _feature(
            osm_id,
            ward="杉並区",
            neighborhood="浜田山三丁目",
            block_number="30",
            housenumber=sub_number,
            latitude=latitude,
        )
        for osm_id, sub_number, latitude in (
            (45, "4", 35.6810),
            (46, "6", 35.6812),
        )
    ]
    geocoder = LocalOSMAddressGeocoder(
        _index(tmp_path, candidates), include_candidates=True
    )
    with pytest.raises(AddressGeocoderLookupError) as error:
        geocoder.geocode("東京都杉並区浜田山3-30-5")
    assert error.value.status == "ambiguous"
    assert len(error.value.diagnostics["candidates"]) == 2


def test_neighborhood_only_centroid_is_not_indexed_or_used(tmp_path):
    broad = OSMFeature(
        "node",
        9,
        {
            "addr:prefecture": "東京都",
            "addr:city": "千代田区",
            "addr:neighbourhood": "神田佐久間町",
        },
        ((35.698, 139.775),),
    )
    path = tmp_path / "broad.sqlite"
    result = build_osm_index(
        tmp_path / "synthetic.osm.pbf", path, features=[broad]
    )
    assert result["address_indexed"] == 0
    with pytest.raises(AddressGeocoderLookupError) as error:
        LocalOSMAddressGeocoder(path).geocode(
            "東京都千代田区神田佐久間町1-13"
        )
    assert error.value.status == "not_found"


def test_batch_not_found_isolated_and_dry_run_writes_no_result_file(tmp_path):
    geocoder = LocalOSMAddressGeocoder(_index(tmp_path, [_feature(10)]))
    input_path = tmp_path / "inputs.json"
    output_path = tmp_path / "results.json"
    input_path.write_text(
        json.dumps(
            [
                {
                    "place_id": "matched",
                    "accepted_core_address": "東京都千代田区神田佐久間町1-13",
                    "input_fingerprint": "fingerprint-1",
                },
                {
                    "place_id": "missing",
                    "accepted_core_address": "東京都渋谷区神宮前2-23-4",
                    "input_fingerprint": "fingerprint-2",
                },
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    report = geocode_address_file(
        input_path,
        output_path,
        geocoder=geocoder,
        dry_run=True,
    )
    assert report["geocoded"] == 1
    assert report["failed"] == 1
    assert report["status_counts"] == {"matched_exact": 1, "not_found": 1}
    assert not output_path.exists()


def test_batch_rejection_includes_limited_component_diagnostics(tmp_path):
    geocoder = LocalOSMAddressGeocoder(
        _index(
            tmp_path,
            [
                _feature(
                    47,
                    ward="杉並区",
                    neighborhood="浜田山三丁目",
                    block_number="29",
                    housenumber="5",
                )
            ],
        ),
        include_candidates=True,
        diagnostic_limit=1,
    )
    input_path = tmp_path / "diagnostic-input.json"
    output_path = tmp_path / "unused-output.json"
    input_path.write_text(
        json.dumps(
            [{
                "place_id": "hamadayama",
                "accepted_core_address": "東京都杉並区浜田山3-30-5",
                "input_fingerprint": "fingerprint",
            }],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    report = geocode_address_file(
        input_path, output_path, geocoder=geocoder, dry_run=True
    )
    failure = report["failures"][0]
    assert failure["status"] == "rejected_address_number_mismatch"
    assert failure["diagnostics"]["diagnostic_limit"] == 1
    assert len(failure["diagnostics"]["candidates"]) == 1
    assert not output_path.exists()


def test_cli_accepts_local_osm_candidate_diagnostic_controls():
    from fiyu.public_cli import _parser

    args = _parser().parse_args(
        [
            "geocode-address-file",
            "--input", "inputs.json",
            "--output", "results.json",
            "--provider", "local-osm-addresses",
            "--osm-index", "index.sqlite",
            "--include-candidates",
            "--diagnostic-limit", "7",
        ]
    )
    assert args.include_candidates is True
    assert args.diagnostic_limit == 7


def test_exact_address_point_remains_preferred_over_area_fallback(tmp_path):
    index = _index(
        tmp_path,
        [_feature(100)],
        areas=[_area(200, level="neighborhood", ward="Chiyoda",
                     neighborhood="神田佐久間町", chome=None)],
    )
    result = LocalOSMAddressGeocoder(index, allow_area_fallback=True).geocode(
        "東京都千代田区神田佐久間町1-13"
    )
    assert result is not None
    assert result.match_status == "matched_exact"
    assert result.map_anchor_type is None


def test_missing_address_point_falls_back_to_exact_block_polygon(tmp_path):
    area = _area(201, level="block", block="30")
    index = _index(tmp_path, [], areas=[area])
    result = LocalOSMAddressGeocoder(index, allow_area_fallback=True).geocode(
        "東京都杉並区浜田山3-30-5"
    )
    assert result is not None
    assert result.match_status == "matched_block_area_approximate"
    assert result.map_anchor_type == "block"
    assert result.matched_components["block"] == "30"
    assert result.unmatched_components == {"sub_number": "5"}
    assert result.map_location_approximate is True


def test_missing_block_falls_back_to_matching_chome_polygon(tmp_path):
    index = _index(tmp_path, [], areas=[_area(202, level="chome")])
    result = LocalOSMAddressGeocoder(index, allow_area_fallback=True).geocode(
        "東京都杉並区浜田山3-30-5"
    )
    assert result is not None
    assert result.map_anchor_type == "chome"
    assert result.address_level_match == "chome"
    assert result.unmatched_components == {"block": "30", "sub_number": "5"}


def test_neighborhood_is_last_resort_and_can_be_disabled_by_minimum_precision(tmp_path):
    index = _index(
        tmp_path, [],
        areas=[_area(203, level="neighborhood", chome=None)],
    )
    result = LocalOSMAddressGeocoder(index, allow_area_fallback=True).geocode(
        "東京都杉並区浜田山3-30-5"
    )
    assert result is not None and result.map_anchor_type == "neighborhood"
    strict_area = LocalOSMAddressGeocoder(
        index, allow_area_fallback=True, minimum_area_precision="chome"
    )
    with pytest.raises(AddressGeocoderLookupError):
        strict_area.geocode("東京都杉並区浜田山3-30-5")


@pytest.mark.parametrize(
    "area",
    [
        _area(204, level="chome", chome="2"),
        _area(205, level="chome", ward="Shibuya", neighborhood="浜田山"),
    ],
)
def test_wrong_chome_or_ward_area_is_rejected(tmp_path, area):
    index = _index(tmp_path, [], areas=[area])
    with pytest.raises(AddressGeocoderLookupError):
        LocalOSMAddressGeocoder(index, allow_area_fallback=True).geocode(
            "東京都杉並区浜田山3-30-5"
        )


def test_ambiguous_matching_area_polygons_are_rejected(tmp_path):
    index = _index(
        tmp_path, [],
        areas=[_area(206, level="chome"), _area(207, level="chome")],
    )
    with pytest.raises(AddressGeocoderLookupError) as error:
        LocalOSMAddressGeocoder(index, allow_area_fallback=True).geocode(
            "東京都杉並区浜田山3-30-5"
        )
    assert error.value.status == "not_found"


def test_area_representative_point_lies_inside_concave_polygon(tmp_path):
    concave = (
        (35.6800, 139.6260), (35.6800, 139.6300),
        (35.6810, 139.6300), (35.6810, 139.6270),
        (35.6830, 139.6270), (35.6830, 139.6260),
        (35.6800, 139.6260),
    )
    area = _area(208, level="chome", polygon=concave)
    index = _index(tmp_path, [], areas=[area])
    result = LocalOSMAddressGeocoder(index, allow_area_fallback=True).geocode(
        "東京都杉並区浜田山3-30-5"
    )
    assert result is not None
    assert _point_in_polygon(result.latitude, result.longitude, concave, ())
    assert result.representative_point_method == "stable_polygon_interior_point"


def test_missing_neighborhood_polygon_falls_back_to_ward(tmp_path):
    index = _index(tmp_path, [], wards=[_ward(301)])
    result = LocalOSMAddressGeocoder(
        index, allow_area_fallback=True, minimum_area_precision="ward"
    ).geocode("東京都杉並区浜田山3-30-5", place_id="restaurant-ward")
    assert result is not None
    assert result.map_anchor_type == "area"
    assert result.address_level_match == "ward"
    assert result.map_location_approximate is True


def test_exact_english_locality_name_resolves_legacy_candidate_to_chome(tmp_path):
    index = _index(
        tmp_path,
        [],
        areas=[
            _area(
                302,
                level="chome",
                ward="Bunkyo",
                neighborhood="千駄木",
                chome="3",
                extra_tags={"name:en": "Sendagi 3"},
            )
        ],
        wards=[_ward(303, name="Bunkyo")],
    )
    result = LocalOSMAddressGeocoder(
        index, allow_area_fallback=True, minimum_area_precision="ward"
    ).geocode_polygon(
        ward="Bunkyo",
        neighborhood="3 Chome Sendagi",
        place_id="legacy-sendagi",
    )
    assert result is not None
    assert result.map_anchor_type == "chome"
    assert result.matched_components["neighborhood"] == "千駄木"
    assert result.matched_components["chome"] == "3"


def test_ambiguous_english_locality_name_does_not_select_polygon(tmp_path):
    index = _index(
        tmp_path,
        [],
        areas=[
            _area(304, level="neighborhood", neighborhood="第一", chome=None,
                  extra_tags={"name:en": "Shared"}),
            _area(305, level="neighborhood", neighborhood="第二", chome=None,
                  extra_tags={"name:en": "Shared"}),
        ],
        wards=[_ward(306)],
    )
    result = LocalOSMAddressGeocoder(
        index, allow_area_fallback=True, minimum_area_precision="ward"
    ).geocode_polygon(
        ward="Suginami", neighborhood="Shared", place_id="legacy-shared"
    )
    assert result is not None
    assert result.address_level_match == "ward"


def test_stable_polygon_points_are_inside_repeatable_and_distributed():
    outer = (
        (35.67, 139.60), (35.67, 139.66), (35.72, 139.66),
        (35.72, 139.60), (35.67, 139.60),
    )
    polygons = ((outer, ()),)
    first = stable_point_within_polygon(polygons, "restaurant-a")
    repeated = stable_point_within_polygon(polygons, "restaurant-a")
    second = stable_point_within_polygon(polygons, "restaurant-b")
    assert first == repeated
    assert first[:2] != second[:2]
    assert _point_in_polygon(*first[:2], outer, ())
    assert _point_in_polygon(*second[:2], outer, ())


def test_area_fallback_is_strictly_opt_in(tmp_path):
    index = _index(tmp_path, [], areas=[_area(209, level="chome")])
    with pytest.raises(AddressGeocoderLookupError) as error:
        LocalOSMAddressGeocoder(index).geocode("東京都杉並区浜田山3-30-5")
    assert error.value.status == "not_found"


def test_cli_accepts_area_fallback_controls():
    from fiyu.public_cli import _parser

    args = _parser().parse_args([
        "geocode-address-file", "--input", "inputs.json", "--output", "results.json",
        "--provider", "local-osm-addresses", "--osm-index", "index.sqlite",
        "--allow-area-fallback", "--minimum-area-precision", "chome",
    ])
    assert args.allow_area_fallback is True
    assert args.minimum_area_precision == "chome"
