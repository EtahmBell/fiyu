from fiyu.database import SCHEMA, connect
from fiyu.low_footprint_research import run_low_footprint_research
from fiyu.public_catalog import ensure_public_schema
from fiyu.research_worker import RestaurantResearch


def _db(tmp_path):
    path = tmp_path / "low-footprint.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants (
                place_id, title, category, address, neighborhood, city,
                rating, review_count, quality_score, underexposure_score,
                digital_footprint_score
            ) VALUES ('place-1', 'Tiny Place', 'restaurant', 'Tokyo', 'Asakusa',
                      'Taito', 4.5, 20, 85, 95, 100)
            """
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, name_en, primary_category, research_status,
                local_discovery_score, fiyu_score,
                low_footprint_route_evaluated, low_footprint_route_eligible,
                low_footprint_research_attempted, created_at, updated_at
            ) VALUES ('place-1', 'Tiny Place', 'restaurant', 'complete', 88, 82,
                      1, 1, 0, 'now', 'now')
            """
        )
        connection.execute(
            """
            INSERT INTO restaurant_research_runs (
                public_restaurant_id, provider, model, prompt_version,
                pipeline_version, status, is_current, created_at, completed_at
            ) VALUES ('place-1', 'openai', 'mock', 'normal', 'test',
                      'complete', 1, 'now', 'now')
            """
        )
        connection.execute(
            """
            INSERT INTO low_footprint_research_runs (
                public_restaurant_id, evidence_fingerprint, status,
                trigger_reason, created_at
            ) VALUES ('place-1', 'fingerprint', 'eligible', 'sparse', 'now')
            """
        )
        connection.commit()
    return path


def test_dry_run_selects_only_explicitly_eligible_candidate(tmp_path):
    result = run_low_footprint_research(_db(tmp_path), dry_run=True)
    assert result["candidates"] == ["place-1"]
    assert result["maximum_responses_requests"] == 1


def test_completed_paid_route_is_not_selected_again_and_history_is_preserved(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET low_footprint_research_attempted=1 "
            "WHERE place_id='place-1'"
        )
        connection.execute(
            "UPDATE low_footprint_research_runs SET status='complete' "
            "WHERE public_restaurant_id='place-1'"
        )
        before_runs = connection.execute(
            "SELECT count(*) FROM restaurant_research_runs"
        ).fetchone()[0]
        connection.commit()
    result = run_low_footprint_research(path, dry_run=True)
    with connect(path) as connection:
        after_runs = connection.execute("SELECT count(*) FROM restaurant_research_runs").fetchone()[
            0
        ]
    assert result["candidates"] == []
    assert before_runs == after_runs == 1


def test_low_footprint_paid_path_materializes_canonical_enrichment(tmp_path, monkeypatch):
    path = _db(tmp_path)
    parsed = RestaurantResearch.model_validate(
        {
            "matched_restaurant": True,
            "identity_confidence": 0.9,
            "name_en": "Tiny Place",
            "primary_category": "izakaya",
            "official_language": "ja",
            "japanese_source_count": 3,
            "english_tourist_source_count": 0,
            "tourist_coverage": "low",
            "reservation_platform_count": 1,
            "official_website_found": True,
            "social_profile_count": 1,
            "known_location_count": 1,
            "specialist_restaurant": True,
            "independent_positive_source_count": 2,
            "total_evidence_sources": 3,
            "conflicting_evidence": False,
            "why_fiyu": "Independent local evidence supports a focused neighborhood izakaya.",
            "evidence_urls": ["https://example.com/a", "https://example.org/b"],
            "card_enrichment": {
                "card_description": "Tiny neighborhood izakaya serving seasonal handmade plates.",
                "card_description_confidence": 0.8,
                "card_description_source_urls": ["https://example.com/a"],
                "review_themes": [
                    {
                        "theme": "seasonal handmade plates",
                        "sentiment": "positive",
                        "supporting_source_count": 2,
                        "confidence": 0.8,
                        "source_urls": ["https://example.com/a", "https://example.org/b"],
                    }
                ],
            },
        }
    )

    class Response:
        output_parsed = parsed
        id = "response-1"
        model = "test-model"
        output = ()
        usage = None

    class Responses:
        def parse(self, **_kwargs):
            return Response()

    class Client:
        responses = Responses()

    import fiyu.low_footprint_research as module

    monkeypatch.setenv("OPENAI_API_KEY", "not-real")
    monkeypatch.setattr(module, "load_dotenv", lambda: None)
    monkeypatch.setattr(module, "OpenAI", lambda **_kwargs: Client())
    result = run_low_footprint_research(path, model="test-model")
    assert result["responses_requests"] == 1
    with connect(path) as connection:
        row = connection.execute(
            "SELECT card_description, review_themes_json FROM public_restaurants "
            "WHERE place_id='place-1'"
        ).fetchone()
    assert row["card_description"].startswith("Tiny neighborhood")
    assert "seasonal handmade plates" in row["review_themes_json"]
