import json

import pytest

from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import (
    ensure_public_schema,
    recalculate_from_stored_evidence,
    save_research_result,
    set_publication_status,
)
from fiyu.public_score import (
    FiyuEvidence,
    InternalSignals,
    calculate_fiyu_score,
    evaluate_fiyu_candidate,
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
            (
                "place-1",
                json.dumps({"matched_restaurant": True, "identity_confidence": 0.9}),
            ),
        )
        connection.commit()
    return path


def test_publish_and_unpublish(tmp_path):
    path = _catalog_db(tmp_path)
    set_publication_status(path, "place-1", published=True)
    with connect(path) as connection:
        assert (
            connection.execute(
                "SELECT is_published FROM public_restaurants WHERE place_id = 'place-1'"
            ).fetchone()[0]
            == 1
        )
    set_publication_status(path, "place-1", published=False)
    with connect(path) as connection:
        assert (
            connection.execute(
                "SELECT is_published FROM public_restaurants WHERE place_id = 'place-1'"
            ).fetchone()[0]
            == 0
        )
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
        columns = {
            item["name"] for item in connection.execute("PRAGMA table_info(public_restaurants)")
        }
    assert {
        "location_source",
        "map_display_eligible",
        "location_precision",
        "location_verification_status",
        "location_osm_type",
        "location_osm_id",
        "verified_core_address",
        "core_address_verified",
        "full_address_verified",
        "map_location_approximate",
        "map_location_precision",
        "unresolved_address_detail",
        "local_discovery_score",
        "local_discovery_classification",
        "local_discovery_components_json",
        "tourist_orientation",
        "tourist_orientation_basis",
        "tourist_signals_json",
        "local_audience_signals_json",
        "product_eligible",
        "low_footprint_route_evaluated",
        "low_footprint_route_eligible",
        "card_description",
        "review_themes_json",
        "practical_info_json",
        "opening_hours_json",
        "hours_checked_at",
        "enrichment_updated_at",
    } <= columns
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


def test_recalculation_appends_score_audit_without_rewriting_research_history(tmp_path):
    path = _catalog_db(tmp_path)
    evidence = FiyuEvidence(
        matched_restaurant=False,
        identity_confidence=0.05,
        total_evidence_sources=0,
    )
    old_score = calculate_fiyu_score(evidence, InternalSignals(80, 80, 80))
    save_research_result(
        path,
        place_id="place-1",
        evidence=evidence,
        score=old_score,
        name_ja=None,
        name_en="Place",
        primary_category="restaurant",
        food_tags=[],
        signature_dishes=[],
        why_fiyu="Sparse enrichment.",
        evidence_urls=[],
        model_name="mock",
        prompt_version="historical",
        structured_research={},
    )
    with connect(path) as connection:
        historical = connection.execute(
            "SELECT score_json FROM restaurant_research_runs WHERE is_current=1"
        ).fetchone()[0]

    recalculate_from_stored_evidence(path)
    with connect(path) as connection:
        evaluations_after_first = connection.execute(
            "SELECT count(*) FROM low_footprint_research_runs WHERE public_restaurant_id='place-1'"
        ).fetchone()[0]
    recalculate_from_stored_evidence(path)

    with connect(path) as connection:
        after = connection.execute(
            "SELECT score_json FROM restaurant_research_runs WHERE is_current=1"
        ).fetchone()[0]
        score_audits = connection.execute(
            "SELECT count(*) FROM score_calculation_runs WHERE public_restaurant_id='place-1'"
        ).fetchone()[0]
        route_evaluations = connection.execute(
            "SELECT count(*) FROM low_footprint_research_runs WHERE public_restaurant_id='place-1'"
        ).fetchone()[0]
    assert after == historical
    assert score_audits == 1
    assert route_evaluations == evaluations_after_first


def test_closure_metadata_remains_persisted_without_changing_product_eligibility(
    tmp_path,
):
    path = _catalog_db(tmp_path)
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.9,
        total_evidence_sources=2,
        venue_format="fixed_venue",
        food_drink_primary=True,
    )
    structured = {
        "venue_format": "fixed_venue",
        "food_drink_primary": True,
        "warnings": ["The restaurant is reported permanently closed."],
    }
    score = evaluate_fiyu_candidate(evidence, InternalSignals(90, 90, 90), structured)
    save_research_result(
        path,
        place_id="place-1",
        evidence=evidence,
        score=score,
        name_ja=None,
        name_en="Place",
        primary_category="restaurant",
        food_tags=[],
        signature_dishes=[],
        why_fiyu="Candidate evidence remains inspectable.",
        evidence_urls=[],
        model_name="mock",
        prompt_version="closure-diagnostic",
        structured_research=structured,
    )
    with connect(path) as connection:
        row = connection.execute(
            "SELECT structured_research_json FROM restaurant_research_runs "
            "WHERE public_restaurant_id='place-1' AND is_current=1"
        ).fetchone()
    assert json.loads(row[0])["warnings"] == structured["warnings"]
    assert score.product_eligible


@pytest.mark.parametrize("published", [False, True])
def test_saving_research_preserves_publication_status(tmp_path, published):
    path = _catalog_db(tmp_path)
    set_publication_status(path, "place-1", published=published)
    evidence = FiyuEvidence(matched_restaurant=True, identity_confidence=0.9)
    score = calculate_fiyu_score(
        evidence,
        InternalSignals(quality_score=80, underexposure_score=80, digital_footprint_score=80),
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
