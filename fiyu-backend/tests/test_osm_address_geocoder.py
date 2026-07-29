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
from fiyu.osm_index import OSMFeature, build_osm_index


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


def _index(tmp_path, features: list[OSMFeature]):
    path = tmp_path / "osm-addresses.sqlite"
    result = build_osm_index(
        tmp_path / "synthetic.osm.pbf",
        path,
        features=features,
    )
    assert result["address_indexed"] == len(features)
    return path


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
