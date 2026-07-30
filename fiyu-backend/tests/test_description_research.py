from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from fiyu.database import SCHEMA, connect
from fiyu.description_research import (
    GroundedRestaurantDescription,
    run_description_research,
)
from fiyu.public_catalog import ensure_public_schema

VALID_DESCRIPTION = (
    "Edo Sakaba Umi is an izakaya and standing bar in Jingumae serving grilled chicken, "
    "seasonal sashimi, and sake. Its compact counter-led format and listed standing-bar "
    "service place it within the Jingumae dining area."
)
SOURCE_URL = "https://example.test/edo-sakaba-umi"


class FakeResponses:
    def __init__(self, outputs):
        self.outputs = iter(outputs)
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        output = next(self.outputs)
        if isinstance(output, Exception):
            raise output
        return SimpleNamespace(
            output_parsed=output,
            id="resp_description_1",
            model="test-model",
            output=[],
            usage=SimpleNamespace(input_tokens=120, output_tokens=80, total_tokens=200),
        )


class FakeClient:
    def __init__(self, outputs):
        self.responses = FakeResponses(outputs)


def _result(**overrides):
    values = {
        "place_id": "place-1",
        "description_en": VALID_DESCRIPTION,
        "restaurant_type_en": "izakaya and standing bar",
        "cuisine_terms_en": ["izakaya", "sake"],
        "signature_dishes_en": ["grilled chicken", "seasonal sashimi"],
        "supporting_source_urls": [SOURCE_URL],
        "confidence": 0.88,
        "unsupported_claims": [],
    }
    values.update(overrides)
    return GroundedRestaurantDescription.model_validate(values)


def _db(tmp_path):
    path = tmp_path / "descriptions.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants (
                place_id, title, neighborhood, rating, review_count
            ) VALUES ('place-1', 'Edo Sakaba Umi', 'Jingumae', 4.2, 15)
            """
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, name_ja, name_en, primary_category, food_tags_json,
                signature_dishes_json, why_fiyu, evidence_urls_json,
                discovery_area, research_status, fiyu_score, is_published,
                created_at, updated_at
            ) VALUES (
                'place-1', '江戸酒場 海', 'Edo Sakaba Umi', 'Izakaya / standing bar',
                '["sake", "counter-led"]', '["grilled chicken", "seasonal sashimi"]',
                'Internal evidence summary.', ?, 'Jingumae', 'complete', 87, 1,
                'created', 'before'
            )
            """,
            (json.dumps([SOURCE_URL]),),
        )
        connection.commit()
    return path


def test_description_schema_requires_exactly_two_grounded_english_sentences():
    result = _result()
    assert len(result.description_en) in range(180, 301)
    assert result.description_en.count(".") == 2

    with pytest.raises(ValidationError, match="exactly two sentences"):
        _result(description_en="A" * 179 + ".")


def test_unsupported_popularity_claim_is_rejected():
    unsupported = (
        "Edo Sakaba Umi is an izakaya popular with locals and serving grilled chicken, sake, "
        "and seasonal sashimi in Jingumae. Its standing-bar and counter format is listed for "
        "the restaurant in this Tokyo neighborhood."
    )
    with pytest.raises(ValidationError, match="unsupported popularity"):
        _result(description_en=unsupported)


def test_dry_run_uses_stored_evidence_first_and_writes_only_the_json_report(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET description_en='Existing description.'"
        )
        connection.commit()
    before = path.read_bytes()
    report_path = tmp_path / "description-report.json"
    client = FakeClient([_result()])

    report = run_description_research(
        path,
        place_id="place-1",
        dry_run=True,
        refresh_existing=True,
        output_report=report_path,
        client=client,
        model="test-model",
    )

    assert report["accepted"] == 1
    assert report["persisted"] == 0
    assert report["usage_totals"] == {
        "response_request_count": 1,
        "web_search_action_count": 0,
        "input_tokens": 120,
        "output_tokens": 80,
        "total_tokens": 200,
    }
    assert path.read_bytes() == before
    assert "tools" not in client.responses.calls[0]
    assert json.loads(report_path.read_text(encoding="utf-8"))["accepted"] == 1


def test_plan_only_makes_no_paid_request(tmp_path):
    path = _db(tmp_path)
    client = FakeClient([])
    report = run_description_research(
        path,
        place_id="place-1",
        plan_only=True,
        output_report=tmp_path / "plan.json",
        client=client,
    )
    assert report["selected"] == 1
    assert report["maximum_responses_requests"] == 0
    assert not client.responses.calls


def test_existing_description_is_not_selected_without_explicit_refresh(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET description_en='Existing description.'"
        )
        connection.commit()
    client = FakeClient([])

    report = run_description_research(
        path,
        place_id="place-1",
        plan_only=True,
        output_report=tmp_path / "no-refresh.json",
        client=client,
    )

    assert report["selected"] == 0
    assert report["refresh_existing"] is False
    assert not client.responses.calls


def test_insufficient_stored_evidence_enables_only_the_bounded_search_fallback(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET primary_category=NULL, food_tags_json='[]', signature_dishes_json='[]',
                evidence_urls_json='[]'
            """
        )
        connection.commit()
    client = FakeClient([_result(supporting_source_urls=[])])
    report = run_description_research(
        path,
        place_id="place-1",
        dry_run=True,
        output_report=tmp_path / "fallback.json",
        client=client,
    )
    call = client.responses.calls[0]
    assert call["max_tool_calls"] == 1
    assert call["tools"] == [{"type": "web_search", "search_context_size": "low"}]
    assert report["maximum_web_search_actions"] == 1
    assert report["persisted"] == 0


def test_valid_description_and_provenance_persist_without_changing_score_or_why_fiyu(tmp_path):
    path = _db(tmp_path)
    previous_description = "Existing description that should remain in history."
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET description_en=?", (previous_description,)
        )
        connection.commit()
    client = FakeClient([_result()])
    with connect(path) as connection:
        before = dict(
            connection.execute(
                "SELECT fiyu_score, why_fiyu, is_published FROM public_restaurants"
            ).fetchone()
        )

    report = run_description_research(
        path,
        place_id="place-1",
        output_report=tmp_path / "persist.json",
        client=client,
        model="test-model",
        refresh_existing=True,
    )

    with connect(path) as connection:
        row = dict(connection.execute("SELECT * FROM public_restaurants").fetchone())
        provenance = dict(connection.execute("SELECT * FROM description_research_runs").fetchone())
    assert report["persisted"] == 1
    assert row["description_en"] == VALID_DESCRIPTION
    assert row["fiyu_score"] == before["fiyu_score"]
    assert row["why_fiyu"] == before["why_fiyu"]
    assert row["is_published"] == before["is_published"]
    assert json.loads(provenance["supporting_source_urls_json"]) == [SOURCE_URL]
    assert provenance["response_id"] == "resp_description_1"
    assert provenance["previous_description_en"] == previous_description


def test_unsupported_claims_are_never_persisted(tmp_path):
    path = _db(tmp_path)
    client = FakeClient([_result(unsupported_claims=["The atmosphere was not sourced."])])
    report = run_description_research(
        path,
        place_id="place-1",
        output_report=tmp_path / "rejected.json",
        client=client,
    )
    with connect(path) as connection:
        row = connection.execute("SELECT description_en FROM public_restaurants").fetchone()
        runs = connection.execute("SELECT COUNT(*) FROM description_research_runs").fetchone()[0]
    assert report["persisted"] == 0
    assert report["failed"] == 1
    assert row["description_en"] is None
    assert runs == 0


def test_malformed_structured_output_is_safe_and_still_reports_usage(tmp_path):
    path = _db(tmp_path)
    client = FakeClient(
        [
            {
                "place_id": "place-1",
                "description_en": "Too short.",
                "restaurant_type_en": "izakaya",
                "cuisine_terms_en": [],
                "signature_dishes_en": [],
                "supporting_source_urls": [SOURCE_URL],
                "confidence": 0.9,
                "unsupported_claims": [],
            }
        ]
    )
    report = run_description_research(
        path,
        place_id="place-1",
        output_report=tmp_path / "malformed.json",
        client=client,
    )
    with connect(path) as connection:
        description = connection.execute(
            "SELECT description_en FROM public_restaurants"
        ).fetchone()[0]
    assert report["failed"] == 1
    assert report["usage_totals"]["input_tokens"] == 120
    assert report["usage_totals"]["output_tokens"] == 80
    assert description is None
