from __future__ import annotations

import csv
import json

import pytest

from fiyu.database import SCHEMA, connect
from fiyu.discovery_areas import (
    DiscoveryAreaError,
    audit_discovery_areas,
    generate_enriched_public_csv,
    import_discovery_areas,
)
from fiyu.public_catalog import ensure_public_schema


def _write_csv(path, rows, fields=("placeId", "title")):
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _manifest(path, entries):
    path.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    return path


def _mapping(source_file, area, area_type="ward", reviewed=True):
    return {
        "source_file": source_file,
        "discovery_area": area,
        "discovery_area_type": area_type,
        "reviewed": reviewed,
    }


def test_audit_and_enrichment_preserve_unique_multi_missing_and_japanese(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    _write_csv(source / "Shibuya_Initial.csv", [
        {"placeId": "one", "title": "鮨さいとう"},
        {"placeId": "multi", "title": "鮨とみなか"},
        {"placeId": "source-only", "title": "浜田家"},
    ])
    _write_csv(source / "Shinjuku_Initial.csv", [
        {"placeId": "multi", "title": "鮨とみなか"},
    ])
    manifest = _manifest(tmp_path / "manifest.json", [
        _mapping("Shibuya_Initial.csv", "Shibuya"),
        _mapping("Shinjuku_Initial.csv", "Shinjuku"),
    ])
    public = tmp_path / "public.csv"
    _write_csv(public, [
        {"place_id": "one", "name_ja": "鮨さいとう"},
        {"place_id": "multi", "name_ja": "鮨とみなか"},
        {"place_id": "missing", "name_ja": "中華そば しば田"},
    ], fields=("place_id", "name_ja"))

    audit = audit_discovery_areas(source, public, manifest_path=manifest)
    assert audit["public_not_in_sources"] == ["missing"]
    assert audit["source_place_ids_not_in_public"] == ["source-only"]
    assert set(audit["public_multi_area_place_ids"]) == {"multi"}

    output = tmp_path / "enriched.csv"
    report = generate_enriched_public_csv(source, public, output, manifest_path=manifest)
    assert report["uniquely_mapped"] == 1
    assert report["multiple_discovery_areas"] == ["multi"]
    assert report["true_area_conflicts"] == []
    assert report["unmatched_public_rows"] == ["missing"]
    with output.open(newline="", encoding="utf-8-sig") as handle:
        rows = {row["place_id"]: row for row in csv.DictReader(handle)}
    assert rows["one"]["name_ja"] == "鮨さいとう"
    assert rows["one"]["discovery_area"] == "Shibuya"
    assert rows["one"]["discovery_source_row"] == "2"
    assert rows["multi"]["discovery_area"] == ""
    assert rows["multi"]["multiple_discovery_areas"] == "true"
    assert rows["multi"]["discovery_area_conflict"] == "false"
    assert [item["area"] for item in json.loads(rows["multi"]["discovery_areas_json"])] == [
        "Shibuya", "Shinjuku"
    ]


def test_audit_reports_duplicate_place_id_within_source(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    _write_csv(source / "Taito_Initial.csv", [
        {"placeId": "duplicate", "title": "浜田家"},
        {"placeId": "duplicate", "title": "浜田家"},
    ])
    public = tmp_path / "public.csv"
    _write_csv(public, [{"place_id": "duplicate"}], fields=("place_id",))
    manifest = _manifest(
        tmp_path / "manifest.json", [_mapping("Taito_Initial.csv", "Taito")]
    )
    report = audit_discovery_areas(source, public, manifest_path=manifest)
    assert report["source_files"][0]["duplicate_place_ids"] == {"duplicate": 2}


def test_ogibashi_cannot_be_silently_inferred_or_used_unreviewed(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    _write_csv(source / "Ogibashi_Initial.csv", [{"placeId": "one", "title": "店"}])
    public = tmp_path / "public.csv"
    _write_csv(public, [{"place_id": "one"}], fields=("place_id",))
    missing = _manifest(tmp_path / "missing.json", [])
    with pytest.raises(DiscoveryAreaError, match="unmapped"):
        audit_discovery_areas(source, public, manifest_path=missing)
    unreviewed = _manifest(tmp_path / "unreviewed.json", [
        _mapping("Ogibashi_Initial.csv", "Ogibashi", "neighborhood", reviewed=False)
    ])
    with pytest.raises(DiscoveryAreaError, match="not reviewed"):
        audit_discovery_areas(source, public, manifest_path=unreviewed)


def _database(tmp_path):
    path = tmp_path / "fiyu.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, name_ja, why_fiyu, fiyu_score, evidence_json,
                is_published, research_status, latitude, longitude, location_source,
                location_osm_type, location_osm_id, map_display_eligible, created_at, updated_at
            ) VALUES (
                'ChIJ2WzWhfWPGGARyYQS7SD2tIM', '金寿司', 'Kept', 91, '{"kept":true}',
                1, 'complete', 35.724271, 139.7959175, 'openstreetmap',
                'node', 9175842396, 1, 'created', 'before'
            )
            """
        )
        connection.commit()
    return path


def _enriched_import(path):
    occurrence = [{
        "area": "Taito", "area_type": "ward", "source_file": "Taito_Initial.csv",
        "source_row": 42,
    }]
    _write_csv(path, [{
        "place_id": "ChIJ2WzWhfWPGGARyYQS7SD2tIM",
        "discovery_area": "Taito",
        "discovery_area_type": "ward",
        "discovery_area_source": "reviewed_source_manifest",
        "discovery_source_file": "Taito_Initial.csv",
        "discovery_source_row": "42",
        "discovery_areas_json": json.dumps(occurrence, ensure_ascii=False),
        "multiple_discovery_areas": "false",
        "discovery_area_conflict": "false",
        "discovery_area_conflict_reason": "",
    }], fields=(
        "place_id", "discovery_area", "discovery_area_type", "discovery_area_source",
        "discovery_source_file", "discovery_source_row", "discovery_areas_json",
        "multiple_discovery_areas", "discovery_area_conflict",
        "discovery_area_conflict_reason",
    ))


def test_import_updates_only_provenance_and_dry_run_writes_nothing(tmp_path):
    db = _database(tmp_path)
    incoming = tmp_path / "enriched.csv"
    _enriched_import(incoming)
    with connect(db) as connection:
        before = dict(connection.execute("SELECT * FROM public_restaurants").fetchone())
    dry = import_discovery_areas(db, incoming, dry_run=True)
    assert dry["updated"] == 0 and dry["would_update"] == 1
    with connect(db) as connection:
        assert dict(connection.execute("SELECT * FROM public_restaurants").fetchone()) == before

    result = import_discovery_areas(db, incoming)
    assert result["updated"] == 1
    with connect(db) as connection:
        after = dict(connection.execute("SELECT * FROM public_restaurants").fetchone())
    assert after["discovery_area"] == "Taito"
    assert after["discovery_source_file"] == "Taito_Initial.csv"
    for field in (
        "latitude", "longitude", "location_source", "location_osm_type", "location_osm_id",
        "map_display_eligible", "is_published", "fiyu_score", "evidence_json", "why_fiyu",
        "research_status",
    ):
        assert after[field] == before[field]


def test_dry_run_does_not_apply_schema_migration(tmp_path):
    db = tmp_path / "legacy.db"
    with connect(db) as connection:
        connection.execute("CREATE TABLE public_restaurants (place_id TEXT PRIMARY KEY)")
        connection.execute(
            "INSERT INTO public_restaurants (place_id) VALUES (?)",
            ("ChIJ2WzWhfWPGGARyYQS7SD2tIM",),
        )
        connection.commit()
    incoming = tmp_path / "enriched.csv"
    _enriched_import(incoming)
    result = import_discovery_areas(db, incoming, dry_run=True)
    assert result["would_update"] == 1
    with connect(db) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(public_restaurants)")}
    assert columns == {"place_id"}


def test_import_rejects_duplicate_without_explicit_identical_conflict(tmp_path):
    db = _database(tmp_path)
    incoming = tmp_path / "duplicates.csv"
    occurrence = json.dumps([{
        "area": "Taito", "area_type": "ward", "source_file": "Taito_Initial.csv",
        "source_row": 2,
    }])
    fields = ("place_id", "discovery_areas_json", "discovery_area_conflict")
    _write_csv(incoming, [
        {"place_id": "ChIJ2WzWhfWPGGARyYQS7SD2tIM", "discovery_areas_json": occurrence,
         "discovery_area_conflict": "false"},
        {"place_id": "ChIJ2WzWhfWPGGARyYQS7SD2tIM", "discovery_areas_json": occurrence,
         "discovery_area_conflict": "false"},
    ], fields=fields)
    result = import_discovery_areas(db, incoming)
    assert result["updated"] == 0
    assert result["validation_failures"]
