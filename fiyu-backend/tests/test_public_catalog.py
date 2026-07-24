import json

import pytest

from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import (
    ensure_public_schema,
    recalculate_from_stored_evidence,
    set_publication_status,
)


def _catalog_db(tmp_path):
    path = tmp_path / "catalog.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants
                (place_id, title, rating, review_count, quality_score,
                 underexposure_score, digital_footprint_score)
            VALUES ('place-1', 'Place', 4.5, 20, 80, 80, 80)
            """
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants
                (place_id, evidence_json, research_status, is_published, created_at, updated_at)
            VALUES (?, ?, 'complete', 0, 'now', 'now')
            """,
            ("place-1", json.dumps({"matched_restaurant": True, "identity_confidence": 0.9}),),
        )
        connection.commit()
    return path


def test_publish_and_unpublish(tmp_path):
    path = _catalog_db(tmp_path)
    set_publication_status(path, "place-1", published=True)
    with connect(path) as connection:
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == 1
    set_publication_status(path, "place-1", published=False)
    with connect(path) as connection:
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == 0
    with pytest.raises(ValueError, match="Unknown place_id"):
        set_publication_status(path, "missing", published=True)


def test_recalculation_unpublishes(tmp_path):
    path = _catalog_db(tmp_path)
    set_publication_status(path, "place-1", published=True)
    assert recalculate_from_stored_evidence(path) == 1
    with connect(path) as connection:
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == 0
