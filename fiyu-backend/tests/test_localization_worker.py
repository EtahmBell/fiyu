from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace

from fiyu.database import connect
from fiyu.localization_worker import (
    LOCALIZATION_PROMPT,
    RestaurantLocalization,
    run_localization_batch,
)
from fiyu.public_catalog import ensure_public_schema
from fiyu.research_worker import SYSTEM_PROMPT


class FakeResponses:
    def __init__(self, outputs):
        self.outputs = iter(outputs)
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        output = next(self.outputs)
        if isinstance(output, Exception):
            raise output
        return SimpleNamespace(output_parsed=output)


class FakeClient:
    def __init__(self, outputs):
        self.responses = FakeResponses(outputs)


def _db(tmp_path, *, published=1):
    path = tmp_path / "localization.db"
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, name_ja, name_en, why_fiyu, food_tags_json,
                signature_dishes_json, evidence_json, evidence_urls_json,
                local_signal, hiddenness_signal, quality_signal, independence_signal,
                fiyu_score, fiyu_confidence, confidence_band, score_band, score_version,
                identity_confidence, research_status, verification_status, research_error,
                model_name, prompt_version, researched_at, is_published, created_at, updated_at
            ) VALUES (
                'place-1', '蕎麦 一', NULL, '地元で長く愛される蕎麦店です。',
                '["soba", "居酒屋"]', '["ざる蕎麦"]', '{"source": "kept"}',
                '["https://example.test"]', 71, 72, 73, 74, 75, 76, 'high',
                'excellent', 'v1', .9, 'complete', 'verified', NULL, 'research-model',
                'research-v1', 'then', ?, 'created', 'before'
            )
            """,
            (published,),
        )
        connection.commit()
    return path


def _row(path):
    with connect(path) as connection:
        return dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id = 'place-1'"
            ).fetchone()
        )


def test_future_research_prompt_requires_english_content_contract():
    assert "why_fiyu must always be clear, natural English" in SYSTEM_PROMPT
    assert "approximately 1-3 concise sentences" in SYSTEM_PROMPT
    assert "name_ja must preserve" in SYSTEM_PROMPT
    assert "name_en must be a natural English name" in SYSTEM_PROMPT
    assert "do not translate them" in SYSTEM_PROMPT


def test_localization_prompt_forbids_added_facts_and_search_tools(tmp_path):
    assert "not literal word-for-word" in LOCALIZATION_PROMPT
    assert "Do not add facts" in LOCALIZATION_PROMPT
    client = FakeClient(
        [RestaurantLocalization(name_en="Soba Ichi", why_fiyu="A focused neighborhood soba shop.")]
    )
    run_localization_batch(_db(tmp_path), client=client, force=True)
    call = client.responses.calls[0]
    assert "tools" not in call
    assert set(call) == {"model", "input", "text_format"}


def test_localization_updates_only_allowed_fields_and_preserves_publication(tmp_path):
    path = _db(tmp_path, published=1)
    before = _row(path)
    client = FakeClient(
        [RestaurantLocalization(
            name_en="Soba Ichi",
            why_fiyu="This neighborhood specialist keeps its focus on handmade soba.",
        )]
    )

    result = run_localization_batch(path, client=client)
    after = _row(path)

    assert result["updated"] == 1
    assert after["name_en"] == "Soba Ichi"
    assert after["why_fiyu"].startswith("This neighborhood")
    assert after["updated_at"] != before["updated_at"]
    allowed = {"name_en", "why_fiyu", "updated_at"}
    assert {key: value for key, value in after.items() if key not in allowed} == {
        key: value for key, value in before.items() if key not in allowed
    }
    assert after["food_tags_json"] == before["food_tags_json"]
    assert after["signature_dishes_json"] == before["signature_dishes_json"]
    assert after["evidence_json"] == before["evidence_json"]
    assert after["fiyu_score"] == before["fiyu_score"]
    assert after["fiyu_confidence"] == before["fiyu_confidence"]
    assert after["is_published"] == 1


def test_localization_preserves_unpublished_status(tmp_path):
    path = _db(tmp_path, published=0)
    client = FakeClient(
        [RestaurantLocalization(name_en="Soba Ichi", why_fiyu="A concise English reason.")]
    )
    run_localization_batch(path, client=client, force=True)
    assert _row(path)["is_published"] == 0


def test_dry_run_returns_proposal_without_writing(tmp_path):
    path = _db(tmp_path)
    before = deepcopy(_row(path))
    client = FakeClient(
        [RestaurantLocalization(name_en="Soba Ichi", why_fiyu="A concise English reason.")]
    )
    result = run_localization_batch(path, client=client, dry_run=True)
    assert result["updated"] == 0
    assert result["proposals"][0]["name_en"] == "Soba Ichi"
    assert _row(path) == before


def test_malformed_model_output_is_safe(tmp_path):
    path = _db(tmp_path)
    before = _row(path)
    client = FakeClient([SimpleNamespace(name_en="Missing why_fiyu")])
    result = run_localization_batch(path, client=client, force=True)
    assert result["updated"] == 0
    assert result["failed"] == 1
    assert _row(path) == before


def test_only_complete_rows_are_processed(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET research_status = 'pending' WHERE place_id = 'place-1'"
        )
        connection.commit()
    client = FakeClient([])
    result = run_localization_batch(path, client=client, force=True)
    assert result["selected"] == 0
    assert not client.responses.calls
