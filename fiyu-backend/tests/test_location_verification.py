import csv
import json

from fiyu.database import SCHEMA, connect
from fiyu.location_anchors import anchor_review_status, load_location_anchors
from fiyu.location_verification import (
    REVIEW_COLUMNS,
    export_location_review,
    import_verified_locations,
    location_status,
)
from fiyu.public_catalog import ensure_public_schema


def _db(tmp_path):
    path = tmp_path / "review.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.executemany(
            """
            INSERT INTO restaurants
                (place_id, title, address, neighborhood, latitude, longitude, rating, review_count)
            VALUES (?, ?, ?, ?, ?, ?, 4.5, 20)
            """,
            [
                ("p1", "One", "Stored address", "Ginza", 35.67, 139.76),
                ("p2", "Two", "Second address", "Ueno", 35.71, 139.77),
            ],
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.executemany(
            """
            INSERT INTO public_restaurants
                (place_id, name_ja, name_en, why_fiyu, fiyu_score, score_band,
                 evidence_json, is_published, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'excellent', ?, 1, 'created', 'before')
            """,
            [
                ("p1", "一", "One", "Description one", 91, '{"kept": 1}'),
                ("p2", "二", "Two", "Description two", 89, '{"kept": 2}'),
            ],
        )
        connection.commit()
    return path


def _read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def _write_csv(path, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=REVIEW_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def _review_row(place_id="p1", **changes):
    row = {field: "" for field in REVIEW_COLUMNS}
    row.update(
        {
            "public_restaurant_id": place_id,
            "verified_latitude": "35.6701",
            "verified_longitude": "139.7601",
            "verification_source": "manual field survey",
            "verification_source_reference": "https://independent.example/survey/1",
            "verified_at": "2026-07-27",
            "location_precision": "exact",
            "reviewer_notes": "Checked independently at the entrance.",
        }
    )
    row.update(changes)
    return row


def test_review_export_labels_unknown_coordinates_and_leaves_verified_blank(tmp_path):
    db = _db(tmp_path)
    output = tmp_path / "review.csv"
    assert export_location_review(db, output, limit=20) == 2
    rows = _read_csv(output)
    assert rows[0]["existing_coordinate_status"] == "UNTRUSTED_REFERENCE_ONLY"
    assert rows[0]["existing_latitude"]
    assert rows[0]["verified_latitude"] == ""
    assert rows[0]["verified_longitude"] == ""
    assert rows[0]["current_map_display_eligible"] == "false"


def test_valid_verified_location_becomes_eligible_and_preserves_unrelated_data(tmp_path):
    db = _db(tmp_path)
    review = tmp_path / "verified.csv"
    _write_csv(review, [_review_row()])
    with connect(db) as connection:
        before = dict(connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id = 'p1'"
        ).fetchone())
    result = import_verified_locations(db, review)
    assert result["updated"] == 1
    assert result["reports"][0]["valid"] is True
    with connect(db) as connection:
        after = dict(connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id = 'p1'"
        ).fetchone())
    assert after["map_display_eligible"] == 1
    assert after["latitude"] == 35.6701
    assert after["location_source_reference"].startswith("https://independent.example")
    for field in ("is_published", "fiyu_score", "score_band", "why_fiyu", "evidence_json"):
        assert after[field] == before[field]


def test_dry_run_reports_valid_row_without_writing(tmp_path):
    db = _db(tmp_path)
    review = tmp_path / "dry.csv"
    _write_csv(review, [_review_row()])
    result = import_verified_locations(db, review, dry_run=True)
    assert result["valid"] == 1
    assert result["updated"] == 0
    with connect(db) as connection:
        assert connection.execute(
            "SELECT map_display_eligible FROM public_restaurants WHERE place_id = 'p1'"
        ).fetchone()[0] == 0


def test_google_coordinates_cannot_be_approved_by_relabeling(tmp_path):
    db = _db(tmp_path)
    review = tmp_path / "relabel.csv"
    _write_csv(
        review,
        [_review_row(
            verified_latitude="35.67",
            verified_longitude="139.76",
            verification_source="independent",
            verification_source_reference="",
            reviewer_notes="",
        )],
    )
    result = import_verified_locations(db, review)
    assert result["validation_failures"] == 1
    assert result["updated"] == 0
    with connect(db) as connection:
        assert connection.execute(
            "SELECT map_display_eligible FROM public_restaurants WHERE place_id = 'p1'"
        ).fetchone()[0] == 0


def test_invalid_swapped_duplicate_batch_is_atomic(tmp_path):
    db = _db(tmp_path)
    review = tmp_path / "invalid.csv"
    _write_csv(
        review,
        [
            _review_row(),
            _review_row(verified_latitude="139.76", verified_longitude="35.67"),
        ],
    )
    result = import_verified_locations(db, review)
    assert result["validation_failures"] == 1
    assert result["updated"] == 0
    assert "duplicate" in result["reports"][1]["errors"][0]


def test_swapped_coordinates_are_rejected(tmp_path):
    db = _db(tmp_path)
    review = tmp_path / "swapped.csv"
    _write_csv(
        review,
        [_review_row(verified_latitude="139.76", verified_longitude="35.67")],
    )
    result = import_verified_locations(db, review)
    assert result["validation_failures"] == 1
    assert "swapped" in result["reports"][0]["errors"][0]


def test_outside_tokyo_is_rejected(tmp_path):
    db = _db(tmp_path)
    review = tmp_path / "outside.csv"
    _write_csv(review, [_review_row(verified_latitude="40", verified_longitude="139")])
    result = import_verified_locations(db, review)
    assert result["validation_failures"] == 1
    assert "Tokyo" in result["reports"][0]["errors"][0]


def test_only_complete_reviewed_anchors_are_loaded(tmp_path):
    path = tmp_path / "anchors.json"
    base = {
        "id": "reviewed", "display_name": "Reviewed Station", "area_name": "Reviewed",
        "latitude": 35.68, "longitude": 139.76, "precision": "area_anchor",
        "qualifier": "Approximate center of Reviewed", "source": "municipal dataset",
        "source_reference": "https://city.example/anchor", "verified_at": "2026-07-27",
        "osm_type": "node", "osm_id": 123,
        "reviewed": True,
    }
    path.write_text(
        json.dumps([base, {**base, "id": "unreviewed", "reviewed": False},
                    {**base, "id": "bad", "source": "Google Maps"}]),
        encoding="utf-8",
    )
    assert [row["id"] for row in load_location_anchors(path)] == ["reviewed"]
    assert anchor_review_status(path) == {"reviewed": 1, "unreviewed": 1, "failures": 1}


def test_location_status_reports_counts(tmp_path, monkeypatch):
    db = _db(tmp_path)
    monkeypatch.setattr(
        "fiyu.location_verification.anchor_review_status",
        lambda: {"reviewed": 1, "unreviewed": 11, "failures": 0},
    )
    status = location_status(db)
    assert status["published_restaurants"] == 2
    assert status["map_eligible_restaurants"] == 0
    assert status["unknown_provenance_restaurants"] == 2
    assert status["restaurants_awaiting_verification"] == 2
    assert status["reviewed_anchors"] == 1
