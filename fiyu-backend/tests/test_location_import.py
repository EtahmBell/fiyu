import csv

import pytest

from fiyu.database import SCHEMA, connect
from fiyu.location_import import LocationImportError, import_locations
from fiyu.public_catalog import ensure_public_schema


def _db(tmp_path):
    path = tmp_path / "locations.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants (id, place_id, title, rating, review_count)
            VALUES (7, 'place-1', 'Place', 4.5, 20)
            """
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants
                (place_id, fiyu_score, score_band, is_published, created_at, updated_at)
            VALUES ('place-1', 88, 'excellent', 1, 'created', 'before')
            """
        )
        connection.commit()
    return path


def _csv(tmp_path, rows):
    path = tmp_path / "locations.csv"
    fields = [
        "place_id", "restaurant_id", "latitude", "longitude", "normalized_address",
        "source", "verified_at", "precision",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return path


def _valid(**changes):
    row = {
        "place_id": "place-1", "restaurant_id": "", "latitude": "35.68",
        "longitude": "139.76", "normalized_address": "Chiyoda, Tokyo",
        "source": "manual-field-verification", "verified_at": "2026-07-01",
        "precision": "exact",
    }
    row.update(changes)
    return row


def test_import_independent_location_preserves_publication_and_scores(tmp_path):
    db = _db(tmp_path)
    result = import_locations(db, _csv(tmp_path, [_valid()]))
    assert result["updated"] == 1
    with connect(db) as connection:
        row = dict(connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone())
    assert row["latitude"] == 35.68
    assert row["map_display_eligible"] == 1
    assert row["location_source"] == "manual-field-verification"
    assert row["location_verified_at"] == "2026-07-01"
    assert row["updated_at"] != "before"
    assert row["is_published"] == 1
    assert row["fiyu_score"] == 88
    assert row["score_band"] == "excellent"


def test_location_dry_run_does_not_write(tmp_path):
    db = _db(tmp_path)
    result = import_locations(db, _csv(tmp_path, [_valid()]), dry_run=True)
    assert result["updated"] == 0
    with connect(db) as connection:
        assert connection.execute(
            "SELECT latitude FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] is None


@pytest.mark.parametrize(
    "changes",
    [
        {"latitude": "139.76", "longitude": "35.68"},
        {"latitude": "40", "longitude": "139"},
        {"source": ""},
        {"source": "unknown"},
        {"source": "google_places"},
        {"verified_at": "yesterday"},
        {"precision": "rooftop"},
    ],
)
def test_invalid_location_import_is_rejected_without_writes(tmp_path, changes):
    db = _db(tmp_path)
    with pytest.raises(LocationImportError):
        import_locations(db, _csv(tmp_path, [_valid(**changes)]))
    with connect(db) as connection:
        assert connection.execute(
            "SELECT map_display_eligible FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == 0


def test_duplicate_restaurant_is_rejected_atomically(tmp_path):
    db = _db(tmp_path)
    with pytest.raises(LocationImportError, match="duplicate restaurant"):
        import_locations(db, _csv(tmp_path, [_valid(), _valid()]))
    with connect(db) as connection:
        assert connection.execute(
            "SELECT latitude FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] is None


def test_internal_restaurant_id_is_supported(tmp_path):
    db = _db(tmp_path)
    row = _valid(place_id="", restaurant_id="7")
    assert import_locations(db, _csv(tmp_path, [row]))["place_ids"] == ["place-1"]
