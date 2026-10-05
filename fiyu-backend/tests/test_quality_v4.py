import json
from types import SimpleNamespace

import httpx
from openai import APIConnectionError

from fiyu.database import SCHEMA, connect
from fiyu.experimental_quality_challenge_v4 import ChallengeObservation, ChallengeResearchResult
from fiyu.public_catalog import ensure_public_schema
from fiyu.quality_v4 import calculate_quality_v4, calculate_quality_v4_shadow
from fiyu.quality_v4_backfill import run_quality_v4_backfill


def observation(**overrides: object) -> ChallengeObservation:
    values: dict[str, object] = {
        "evidence_family": "craft_execution",
        "aspect": "broth_sauce",
        "polarity": "positive",
        "strength": "strong",
        "claim": (
            "The ramen broth has deep stock flavor, carefully balanced seasoning, precise "
            "temperature control, and a clean texture and finish."
        ),
        "food_specific": True,
        "directness": "direct",
        "source_url": "https://example.jp/review/1",
        "source_type": "local_food_blog",
        "source_language": "Japanese",
        "publication_or_observation_date": "2026-01",
        "normalized_author_or_document_identity": "writer-one",
        "provenance_group": "independent-blog",
        "underlying_claim_identity": "free-form-key",
        "independent_source_key": "example-writer-one",
    }
    values.update(overrides)
    return ChallengeObservation.model_validate(values)


def test_production_candidate_guardrail_and_quality_clamp() -> None:
    observations = []
    for family_index, (family, aspect) in enumerate(
        (
            ("craft_execution", "broth_sauce"),
            ("ingredient_product_quality", "ingredient_freshness"),
            ("food_reputation_specialization", "signature_dish_reputation"),
            ("consistency", "reliable_execution"),
        )
    ):
        for source_index in range(6):
            observations.append(
                observation(
                    evidence_family=family,
                    aspect=aspect,
                    source_url=f"https://source-{family_index}-{source_index}.example/review",
                    normalized_author_or_document_identity=f"writer-{family_index}-{source_index}",
                    provenance_group=f"publisher-{family_index}-{source_index}",
                    independent_source_key=f"source-{family_index}-{source_index}",
                )
            )
    result = calculate_quality_v4(observations, base_quality_prior=98)
    assert result.raw_quality_adjustment > 15
    assert result.guarded_quality_adjustment == 15
    assert result.researched_quality == 100


def test_no_evidence_is_exact_and_shadow_parity_is_canonical() -> None:
    from fiyu.public_score import FiyuEvidence, InternalSignals

    result = calculate_quality_v4_shadow(
        [],
        evidence=FiyuEvidence(matched_restaurant=True, identity_confidence=0.9),
        internal=InternalSignals(70, 70, 70),
    )
    assert result.quality.guarded_quality_adjustment == 0
    assert result.quality.researched_quality == 70
    assert result.shadow_fiyu_score == result.production_v3.fiyu_score


def _db(tmp_path, count: int = 2):
    path = tmp_path / "catalog.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        for index in range(count):
            place_id = f"place-{index}"
            connection.execute(
                """
                INSERT INTO restaurants (
                    place_id, title, rating, review_count, quality_score,
                    underexposure_score, digital_footprint_score, internal_fiyu_score
                ) VALUES (?, ?, 4.4, 30, 70, 75, 80, 72)
                """,
                (place_id, f"Place {index}"),
            )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        for index in range(count):
            place_id = f"place-{index}"
            connection.execute(
                """
                INSERT INTO public_restaurants (
                    place_id, source_restaurant_id, name_en, identity_confidence,
                    evidence_json, research_status, review_status, fiyu_score,
                    product_eligible, is_published, created_at, updated_at
                ) VALUES (?, ?, ?, 0.9, ?, 'complete', 'candidate', 72, 1, 0, 'now', 'now')
                """,
                (
                    place_id,
                    index + 1,
                    f"Place {index}",
                    json.dumps({"matched_restaurant": True, "identity_confidence": 0.9}),
                ),
            )
            connection.execute(
                """
                INSERT INTO restaurant_research_runs (
                    public_restaurant_id, provider, model, prompt_version,
                    pipeline_version, status, structured_research_json,
                    is_current, created_at
                ) VALUES (?, 'test', 'test', 'test', 'test', 'complete', '{}', 1, 'now')
                """,
                (place_id,),
            )
        connection.commit()
    return path


class _Responses:
    def __init__(self, parsed=None, error=None):
        self.parsed = parsed
        self.error = error
        self.calls = 0

    def parse(self, **_kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        return SimpleNamespace(
            id=f"response-{self.calls}",
            model="test-model",
            status="completed",
            output=[],
            output_parsed=self.parsed,
            usage=SimpleNamespace(
                input_tokens=100,
                output_tokens=20,
                total_tokens=120,
                input_tokens_details=SimpleNamespace(cached_tokens=0),
                output_tokens_details=SimpleNamespace(reasoning_tokens=0),
            ),
        )


def _client(parsed=None, error=None):
    return SimpleNamespace(responses=_Responses(parsed, error))


def test_backfill_is_resumable_and_never_replaces_production_score(tmp_path) -> None:
    path = _db(tmp_path)
    research = ChallengeResearchResult(
        evidence_level="moderate",
        quality_evidence_confidence="medium",
        observations=[observation()],
        research_summary="One food-specific source was found.",
    )
    manifest = tmp_path / "manifest.json"
    results = tmp_path / "results.jsonl"
    first = run_quality_v4_backfill(
        path,
        limit=1,
        client=_client(research),
        model="test-model",
        manifest_path=manifest,
        results_path=results,
    )
    assert first["completed"] == 1
    with connect(path) as connection:
        assert connection.execute("SELECT fiyu_score FROM public_restaurants WHERE place_id='place-0'").fetchone()[0] == 72
        assert connection.execute("SELECT COUNT(*) FROM quality_v4_research_runs WHERE status='complete'").fetchone()[0] == 1

    second_client = _client(research)
    second = run_quality_v4_backfill(
        path,
        limit=2,
        client=second_client,
        model="test-model",
        manifest_path=tmp_path / "manifest-2.json",
        results_path=tmp_path / "results-2.jsonl",
    )
    assert second["selected_count"] == 1
    assert second_client.responses.calls == 1
    assert second["skipped_existing"] == 1


def test_backfill_failure_states_are_checkpointed_and_not_retried(tmp_path) -> None:
    path = _db(tmp_path, count=1)
    error = APIConnectionError(request=httpx.Request("POST", "https://api.openai.com"))
    first = run_quality_v4_backfill(
        path,
        limit=1,
        client=_client(error=error),
        model="test-model",
        manifest_path=tmp_path / "manifest.json",
        results_path=tmp_path / "results.jsonl",
    )
    assert first["needs_retry"] == 1
    second_client = _client()
    second = run_quality_v4_backfill(
        path,
        limit=1,
        client=second_client,
        model="test-model",
        manifest_path=tmp_path / "manifest-2.json",
        results_path=tmp_path / "results-2.jsonl",
    )
    assert second["selected_count"] == 0
    assert second_client.responses.calls == 0
