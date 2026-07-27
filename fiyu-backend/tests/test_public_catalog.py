import json

import pytest

from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import (
    ensure_public_schema,
    recalculate_from_stored_evidence,
    save_research_result,
    set_publication_status,
)
from fiyu.public_score import FiyuEvidence, InternalSignals, calculate_fiyu_score


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


def test_existing_public_schema_migrates_without_changing_data(tmp_path):
    path = tmp_path / "legacy.db"
    with connect(path) as connection:
        connection.execute(
            """
            CREATE TABLE public_restaurants (
                place_id TEXT PRIMARY KEY, fiyu_score REAL, research_status TEXT,
                is_published INTEGER, updated_at TEXT
            )
            """
        )
        connection.execute(
            "INSERT INTO public_restaurants VALUES ('legacy', 87, 'complete', 1, 'before')"
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        row = connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id = 'legacy'"
        ).fetchone()
        columns = {item["name"] for item in connection.execute(
            "PRAGMA table_info(public_restaurants)"
        )}
    assert {"location_source", "map_display_eligible", "location_precision"} <= columns
    assert row["fiyu_score"] == 87
    assert row["is_published"] == 1
    assert row["map_display_eligible"] == 0


def test_recalculation_preserves_publication_status(tmp_path):
    path = _catalog_db(tmp_path)

    # Published restaurants should remain published after recalculation.
    set_publication_status(path, "place-1", published=True)

    recalculate_from_stored_evidence(path)

    with connect(path) as connection:
        published = connection.execute(
            """
            SELECT is_published
            FROM public_restaurants
            WHERE place_id = ?
            """,
            ("place-1",),
        ).fetchone()[0]

    assert published == 1

    # Manually unpublished restaurants should remain unpublished.
    set_publication_status(path, "place-1", published=False)

    recalculate_from_stored_evidence(path)

    with connect(path) as connection:
        unpublished = connection.execute(
            """
            SELECT is_published
            FROM public_restaurants
            WHERE place_id = ?
            """,
            ("place-1",),
        ).fetchone()[0]

    assert unpublished == 0


@pytest.mark.parametrize("published", [False, True])
def test_saving_research_preserves_publication_status(tmp_path, published):
    path = _catalog_db(tmp_path)
    set_publication_status(path, "place-1", published=published)
    evidence = FiyuEvidence(matched_restaurant=True, identity_confidence=0.9)
    score = calculate_fiyu_score(
        evidence,
        InternalSignals(
            quality_score=80, underexposure_score=80, digital_footprint_score=80
        ),
    )
    save_research_result(
        path,
        place_id="place-1",
        evidence=evidence,
        score=score,
        name_ja="店",
        name_en="Restaurant",
        primary_category="restaurant",
        food_tags=["tag"],
        signature_dishes=["dish"],
        why_fiyu="A concise description.",
        evidence_urls=[],
        model_name="mock",
        prompt_version="test",
    )
    with connect(path) as connection:
        actual = connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0]
    assert actual == int(published)
