from __future__ import annotations

import csv
import json
import sqlite3

import pytest

from fiyu.location_names import normalize_location_name
from fiyu.osm_index import (
    OSMEncodingValidationError,
    OSMFeature,
    build_osm_index,
    extract_osm_tags,
)
from fiyu.osm_resolver import resolve_restaurant, write_resolution_report

NAMES = ["浜田家", "浜田屋", "鮨さいとう", "中華そば しば田", "Café & Bar 東京"]
LEGITIMATE_NON_JAPANESE_NAMES = [
    "La Guisine Française SAKAMOTO",
    "Café Estação",
    "Miyahara français",
    "CAFE JOÃO",
    "Café Façon",
]
MOJIBAKE = "æµœç”°å®¶"


class ParserTags:
    def __init__(self, values):
        self.values = values

    def __iter__(self):
        return iter(self.values)


def _features(names=NAMES):
    return [
        OSMFeature(
            "node", index, {"name": name, "name:ja": name, "amenity": "restaurant",
                             "addr:suburb": "Ginza"}, ((35.68 + index / 10000, 139.76),)
        )
        for index, name in enumerate(names, start=1)
    ]


def _build(tmp_path, names=NAMES):
    output = tmp_path / "unicode-index.sqlite"
    result = build_osm_index(
        tmp_path / "synthetic.osm.pbf", output, features=_features(names)
    )
    return output, result


@pytest.mark.parametrize("name", NAMES)
def test_parser_fixture_extracts_unicode_str_without_codec_conversion(name):
    tags = extract_osm_tags(ParserTags([("name", name), ("name:ja", name)]))
    assert tags["name"] == name
    assert isinstance(tags["name"], str)


def test_parser_fixture_rejects_encoded_bytes():
    with pytest.raises(TypeError, match="Unicode Python str"):
        extract_osm_tags(ParserTags([(b"name", "浜田家".encode())]))


def test_sqlite_text_round_trip_and_encoding_diagnostics(tmp_path):
    index, diagnostics = _build(tmp_path)
    assert diagnostics["indexed"] == len(NAMES)
    assert diagnostics["japanese_name_objects"] == len(NAMES)
    assert diagnostics["unicode_replacement_objects"] == 0
    assert diagnostics["likely_mojibake_objects"] == 0
    connection = sqlite3.connect(index)
    try:
        rows = connection.execute(
            "SELECT name, name_ja, tags_json, typeof(name), typeof(tags_json) "
            "FROM osm_locations ORDER BY osm_id"
        ).fetchall()
    finally:
        connection.close()
    assert [row[0] for row in rows] == NAMES
    assert [row[1] for row in rows] == NAMES
    assert all(row[3:] == ("text", "text") for row in rows)
    assert [json.loads(row[2])["name"] for row in rows] == NAMES
    assert all("æµœ" not in row[0] for row in rows)


@pytest.mark.parametrize("name", NAMES)
def test_normalization_and_exact_japanese_matching_preserve_names(tmp_path, name):
    index, _ = _build(tmp_path, [name])
    assert name.casefold() in normalize_location_name(name)
    connection = sqlite3.connect(index)
    connection.row_factory = sqlite3.Row
    try:
        status, candidates = resolve_restaurant(
            {
                "name_ja": name, "name_en": "", "neighborhood": "Ginza",
                "category": "restaurant", "food_tags": [], "normalized_address": None,
            },
            connection,
        )
    finally:
        connection.close()
    assert status == "osm_auto_verified"
    assert candidates[0].name == name
    assert candidates[0].components["exact_japanese_name"] == 55


def test_json_and_csv_reports_round_trip_as_declared_formats(tmp_path):
    reports = [{
        "place_id": "p1", "status": "needs_manual_review",
        "candidates": [{
            "name": "浜田家", "alternate_names": ["浜田屋"], "latitude": 35.68,
            "longitude": 139.76, "osm_type": "node", "osm_id": 1,
            "amenity": "restaurant", "cuisine": "鮨", "total_score": 70,
            "components": {"exact_japanese_name": 55}, "warnings": [],
        }],
    }]
    json_path = tmp_path / "report.json"
    csv_path = tmp_path / "report.csv"
    write_resolution_report(json_path, reports)
    write_resolution_report(csv_path, reports)
    assert json.loads(json_path.read_text(encoding="utf-8"))[0]["candidates"][0]["name"] == "浜田家"
    assert "浜田家" in json_path.read_text(encoding="utf-8")
    with csv_path.open(newline="", encoding="utf-8") as handle:
        row = next(csv.DictReader(handle))
    assert row["candidate_name"] == "浜田家"
    assert json.loads(row["alternate_names"]) == ["浜田屋"]
    assert not csv_path.read_text(encoding="utf-8").lstrip().startswith("[")


def test_report_rejects_unknown_or_mismatched_extension(tmp_path):
    with pytest.raises(ValueError, match="must end in .json or .csv"):
        write_resolution_report(tmp_path / "report.txt", [])


@pytest.mark.parametrize("corrupt", ["æµœç”°å®¶", "bad�name"])
def test_index_build_rejects_encoding_corruption_and_preserves_old_index(tmp_path, corrupt):
    output, _ = _build(tmp_path, ["浜田家"])
    original = output.read_bytes()
    with pytest.raises(ValueError, match="encoding validation failed"):
        build_osm_index(
            tmp_path / "synthetic.osm.pbf", output, features=_features([corrupt])
        )
    assert output.read_bytes() == original


def test_legitimate_french_and_portuguese_names_are_not_false_positives(tmp_path):
    index, result = _build(tmp_path, LEGITIMATE_NON_JAPANESE_NAMES)
    assert index.is_file()
    assert result["likely_mojibake_objects"] == 0
    assert result["quarantined_objects"] == 0
    assert result["build_status"] == "succeeded"


def test_isolated_mojibake_is_diagnosed_quarantined_and_reported(tmp_path):
    names = [MOJIBAKE, *(f"Valid restaurant {number}" for number in range(1000))]
    with pytest.warns(RuntimeWarning, match="quarantined"):
        index, result = _build(tmp_path, names)

    assert result["build_status"] == "warned"
    assert result["likely_mojibake_objects"] == 1
    assert result["quarantined_objects"] == 1
    assert result["suspicious_percentage"] == pytest.approx(1 / 1001 * 100)
    detail = result["suspicious_details"][0]
    assert detail["osm_type"] == "node"
    assert detail["osm_id"] == 1
    assert detail["original_name"] == MOJIBAKE
    assert detail["tag_key"] in {"name", "name:ja"}
    assert detail["exact_value"] == MOJIBAKE
    assert detail["unicode_code_points"]
    assert "roundtrip" in detail["matched_heuristic"]
    assert detail["contains_japanese"] is False
    assert detail["roundtrip_produces_plausible_different_string"] is True

    connection = sqlite3.connect(index)
    try:
        assert connection.execute(
            "SELECT COUNT(*) FROM osm_locations WHERE osm_id = 1"
        ).fetchone()[0] == 0
    finally:
        connection.close()

    report_path = tmp_path / "unicode-index.encoding-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["build_status"] == "warned"
    assert report["total_indexed_objects"] == 1001
    assert report["final_indexed_objects"] == 1000
    assert report["suspicious_details"][0]["exact_value"] == MOJIBAKE


def test_systematic_mojibake_rate_fails_and_writes_diagnostics(tmp_path):
    output = tmp_path / "systematic.sqlite"
    with pytest.raises(
        OSMEncodingValidationError, match="encoding validation failed"
    ) as error:
        build_osm_index(
            tmp_path / "synthetic.osm.pbf",
            output,
            features=_features([MOJIBAKE, "Valid restaurant"]),
        )
    assert not output.exists()
    assert error.value.report["build_status"] == "failed"
    assert error.value.report["suspicious_details"][0]["exact_value"] == MOJIBAKE
    report = json.loads(
        (tmp_path / "systematic.encoding-report.json").read_text(encoding="utf-8")
    )
    assert report["build_status"] == "failed"
    assert report["likely_mojibake_objects"] == 1
    assert report["suspicious_percentage"] == 50.0
    assert report["suspicious_details"][0]["exact_value"] == MOJIBAKE
