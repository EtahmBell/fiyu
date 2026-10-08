import json
from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError, RateLimitError

from fiyu.database import SCHEMA, connect
from fiyu.experimental_quality_challenge_v4 import ChallengeObservation, ChallengeResearchResult
from fiyu.pipeline_cli import _parser
from fiyu.public_catalog import ensure_public_schema
from fiyu.quality_v4 import (
    QUALITY_CASE_STRENGTH_VERSION,
    QUALITY_PROMPT_VERSION,
    QUALITY_RESEARCH_VERSION,
    QUALITY_SCORE_VERSION,
    calculate_quality_v4,
    calculate_quality_v4_shadow,
)
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


def _insert_quality_attempt(
    path,
    place_id: str,
    status: str,
    error: str | None = None,
    *,
    error_category: str = "validation_or_processing_failure",
) -> None:
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO quality_v4_research_runs (
                public_restaurant_id, provider, model, status,
                quality_research_version, quality_case_strength_version,
                score_version, prompt_version, adjustment_guardrail,
                error_category, error, created_at
            ) VALUES (?, 'openai', 'test-model', ?, ?, ?, ?, ?, 15, ?, ?, 'now')
            """,
            (
                place_id,
                status,
                QUALITY_RESEARCH_VERSION,
                QUALITY_CASE_STRENGTH_VERSION,
                QUALITY_SCORE_VERSION,
                QUALITY_PROMPT_VERSION,
                error_category,
                error,
            ),
        )
        connection.commit()


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


def test_backfill_exact_allowlist_never_selects_unlisted_rows(tmp_path) -> None:
    path = _db(tmp_path, count=3)
    research = ChallengeResearchResult(
        evidence_level="none",
        quality_evidence_confidence="low",
        observations=[],
        research_summary="No useful food-specific evidence was found.",
    )
    client = _client(research)

    result = run_quality_v4_backfill(
        path,
        limit=3,
        place_ids=["place-2", "place-0"],
        client=client,
        model="test-model",
        manifest_path=tmp_path / "exact-manifest.json",
        results_path=tmp_path / "exact-results.jsonl",
    )

    assert result["ids_selected"] == ["place-2", "place-0"]
    assert client.responses.calls == 2
    with connect(path) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM quality_v4_research_runs WHERE public_restaurant_id='place-1'"
        ).fetchone()[0] == 0


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


def test_retry_failed_selects_only_credit_failures_and_then_skips_success(tmp_path) -> None:
    path = _db(tmp_path, count=3)
    _insert_quality_attempt(path, "place-0", "complete")
    _insert_quality_attempt(
        path,
        "place-1",
        "failed",
        "RateLimitError: insufficient_quota credit_balance_exhausted",
    )
    _insert_quality_attempt(
        path,
        "place-2",
        "failed",
        "ValidationError: response schema did not validate",
    )
    research = ChallengeResearchResult(
        evidence_level="none",
        quality_evidence_confidence="low",
        observations=[],
        research_summary="No useful food-specific evidence was found.",
    )
    retry_client = _client(research)
    first = run_quality_v4_backfill(
        path,
        limit=10,
        retry_failed=True,
        client=retry_client,
        model="test-model",
        manifest_path=tmp_path / "retry-manifest.json",
        results_path=tmp_path / "retry-results.jsonl",
    )

    assert first["selection_mode"] == "retry_failed"
    assert first["selected_count"] == 1
    assert first["completed"] == 1
    assert first["failed"] == 0
    assert first["needs_retry"] == 0
    assert first["responses_requests"] == 1
    assert first["skipped_existing"] == 2
    assert first["inspection"]["already_complete"] == 1
    assert first["inspection"]["retryable_failed"] == 1
    assert first["inspection"]["blocked_existing_statuses"] == {
        "failed_not_retryable": 1
    }
    assert first["rows"][0]["place_id"] == "place-1"
    assert first["rows"][0]["retry_of_run_id"] is not None
    assert retry_client.responses.calls == 1

    with connect(path) as connection:
        latest = connection.execute(
            """
            SELECT status FROM quality_v4_research_runs
            WHERE public_restaurant_id='place-1' ORDER BY id DESC LIMIT 1
            """
        ).fetchone()
        assert latest["status"] == "complete"
        assert connection.execute(
            "SELECT COUNT(*) FROM quality_v4_research_runs WHERE public_restaurant_id='place-0'"
        ).fetchone()[0] == 1

    second_client = _client(research)
    second = run_quality_v4_backfill(
        path,
        limit=10,
        retry_failed=True,
        client=second_client,
        model="test-model",
        manifest_path=tmp_path / "retry-manifest-2.json",
        results_path=tmp_path / "retry-results-2.jsonl",
    )
    assert second["selected_count"] == 0
    assert second["inspection"]["already_complete"] == 2
    assert second_client.responses.calls == 0


def test_retry_failed_selects_explicit_transient_provider_metadata(tmp_path) -> None:
    path = _db(tmp_path, count=4)
    _insert_quality_attempt(
        path,
        "place-0",
        "failed",
        "RateLimitError: quota unavailable",
        error_category="provider_credit_exhausted",
    )
    _insert_quality_attempt(
        path,
        "place-1",
        "failed",
        (
            "InternalServerError: Error code: 520 - "
            "{'status': 520, 'error_category': 'origin', "
            "'cloudflare_error': True, 'retryable': True, 'retry_after': 60}"
        ),
    )
    _insert_quality_attempt(
        path,
        "place-2",
        "failed",
        "ValidationError: response schema did not validate",
    )
    _insert_quality_attempt(path, "place-3", "complete")
    client = _client()

    result = run_quality_v4_backfill(
        path,
        limit=10,
        retry_failed=True,
        dry_run=True,
        client=client,
        manifest_path=tmp_path / "retry-transient-manifest.json",
        results_path=tmp_path / "retry-transient-results.jsonl",
    )

    assert result["inspection"]["retryable_failed"] == 2
    assert set(result["ids_selected"]) == {"place-0", "place-1"}
    assert result["inspection"]["already_complete"] == 1
    assert result["inspection"]["blocked_existing_statuses"] == {
        "failed_not_retryable": 1
    }
    assert result["responses_requests"] == 0
    assert client.responses.calls == 0

    research = ChallengeResearchResult(
        evidence_level="none",
        quality_evidence_confidence="low",
        observations=[],
        research_summary="No useful food-specific evidence was found.",
    )
    retry_client = _client(research)
    retry = run_quality_v4_backfill(
        path,
        place_id="place-1",
        limit=1,
        retry_failed=True,
        client=retry_client,
        model="test-model",
        manifest_path=tmp_path / "retry-transient-paid-manifest.json",
        results_path=tmp_path / "retry-transient-paid-results.jsonl",
    )
    assert retry["completed"] == 1
    assert retry["rows"][0]["retry_of_run_id"] is not None
    assert retry_client.responses.calls == 1

    subsequent = run_quality_v4_backfill(
        path,
        place_id="place-1",
        limit=1,
        retry_failed=True,
        dry_run=True,
        manifest_path=tmp_path / "retry-transient-subsequent-manifest.json",
        results_path=tmp_path / "retry-transient-subsequent-results.jsonl",
    )
    assert subsequent["selected_count"] == 0


def test_exhausted_credit_error_is_checkpointed_as_needs_retry(tmp_path) -> None:
    path = _db(tmp_path, count=1)
    response = httpx.Response(
        429,
        request=httpx.Request("POST", "https://api.openai.com"),
    )
    error = RateLimitError(
        "insufficient_quota: no credits remaining; credit_balance_exhausted",
        response=response,
        body={"code": "credit_balance_exhausted"},
    )
    result = run_quality_v4_backfill(
        path,
        limit=1,
        client=_client(error=error),
        model="test-model",
        manifest_path=tmp_path / "manifest.json",
        results_path=tmp_path / "results.jsonl",
    )
    assert result["failed"] == 0
    assert result["needs_retry"] == 1
    with connect(path) as connection:
        row = connection.execute(
            "SELECT status, error_category FROM quality_v4_research_runs"
        ).fetchone()
    assert dict(row) == {
        "status": "needs_retry",
        "error_category": "provider_credit_exhausted",
    }
    retry = run_quality_v4_backfill(
        path,
        limit=1,
        retry_failed=True,
        dry_run=True,
        manifest_path=tmp_path / "retry-manifest.json",
        results_path=tmp_path / "retry-results.jsonl",
    )
    assert retry["ids_selected"] == ["place-0"]


def _make_floor70_candidate(
    path,
    place_id: str,
    *,
    score: float = 72,
    published: bool = False,
    score_version: str = "public-v3-local-discovery-specialist-tristate",
    identity_confidence: float = 0.9,
    matched_restaurant: bool = True,
    product_eligible: bool = True,
) -> None:
    evidence = {
        "matched_restaurant": matched_restaurant,
        "identity_confidence": identity_confidence,
        "specialist_status": "unknown",
    }
    with connect(path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants SET
                name_en=?, primary_category='Restaurant', identity_confidence=?,
                evidence_json=?, research_status='complete',
                review_status='auto_rejected',
                review_notes='score_or_product_policy_rejected',
                fiyu_score=?, score_version=?, product_eligible=?, is_published=?
            WHERE place_id=?
            """,
            (
                place_id,
                identity_confidence,
                json.dumps(evidence),
                score,
                score_version,
                int(product_eligible),
                int(published),
                place_id,
            ),
        )
        connection.commit()


def test_floor70_prepublication_selects_only_exact_gate_clean_v3_cohort(tmp_path) -> None:
    path = _db(tmp_path, count=8)
    _make_floor70_candidate(path, "place-0")
    _make_floor70_candidate(path, "place-1", score=69)
    _make_floor70_candidate(
        path,
        "place-2",
        score_version="public-v4-quality-research-specialist-tristate",
    )
    _make_floor70_candidate(path, "place-3", published=True)
    _make_floor70_candidate(path, "place-4", product_eligible=False)
    _make_floor70_candidate(
        path,
        "place-5",
        identity_confidence=0.2,
        matched_restaurant=False,
    )
    _make_floor70_candidate(path, "place-6")
    _make_floor70_candidate(path, "place-7", published=True)
    with connect(path) as connection:
        connection.execute(
            """
            UPDATE restaurant_research_runs SET structured_research_json=?
            WHERE public_restaurant_id='place-6'
            """,
            (
                json.dumps(
                    {
                        "address_evidence": {
                            "identity_status": "conflicting",
                            "research_summary": (
                                "Current evidence confirms this address belongs to a different "
                                "restaurant."
                            ),
                        }
                    }
                ),
            ),
        )
        connection.commit()

    result = run_quality_v4_backfill(
        path,
        limit=100,
        floor70_prepublication=True,
        dry_run=True,
        manifest_path=tmp_path / "manifest.json",
        results_path=tmp_path / "results.jsonl",
    )

    assert result["ids_selected"] == ["place-0"]
    assert result["inspection"]["selected_v3_count"] == 1
    assert result["inspection"]["selected_current_v4_count"] == 0
    assert result["inspection"]["selected_published_count"] == 0
    assert result["inspection"]["separate_below_floor_rescue_set"] == 1
    assert result["inspection"]["below_floor_rescue_overlap"] == 0
    assert result["inspection"]["exclusions_by_reason"]["unresolved_identity"] == 1
    assert (
        result["inspection"]["exclusions_by_reason"][
            "critical_publication_contradiction"
        ]
        == 1
    )


def test_floor70_prepublication_excludes_completed_v4_and_reports_prior_failure(
    tmp_path,
) -> None:
    path = _db(tmp_path, count=3)
    for index in range(3):
        _make_floor70_candidate(path, f"place-{index}")
    _insert_quality_attempt(path, "place-0", "complete")
    _insert_quality_attempt(path, "place-1", "failed", "schema failure")

    result = run_quality_v4_backfill(
        path,
        limit=100,
        floor70_prepublication=True,
        dry_run=True,
        manifest_path=tmp_path / "manifest.json",
        results_path=tmp_path / "results.jsonl",
    )

    assert result["ids_selected"] == ["place-2"]
    assert result["inspection"]["excluded_completed_v4_evidence"] == 1
    assert result["inspection"]["prior_attempt_statuses"] == {"failed": 1}


def test_floor70_prepublication_order_limit_dry_run_and_resume_are_safe(tmp_path) -> None:
    path = _db(tmp_path, count=3)
    _make_floor70_candidate(path, "place-0", score=72)
    _make_floor70_candidate(path, "place-1", score=74)
    _make_floor70_candidate(path, "place-2", score=74)
    before = path.read_bytes()

    dry_run = run_quality_v4_backfill(
        path,
        limit=2,
        floor70_prepublication=True,
        dry_run=True,
        manifest_path=tmp_path / "dry-manifest.json",
        results_path=tmp_path / "dry-results.jsonl",
    )
    assert dry_run["ids_selected"] == ["place-1", "place-2"]
    assert dry_run["responses_requests"] == 0
    assert (tmp_path / "dry-results.jsonl").read_text(encoding="utf-8") == ""
    assert path.read_bytes() == before

    research = ChallengeResearchResult(
        evidence_level="none",
        quality_evidence_confidence="low",
        observations=[],
        research_summary="No useful food-specific evidence was found.",
    )
    client = _client(research)
    first = run_quality_v4_backfill(
        path,
        limit=1,
        floor70_prepublication=True,
        client=client,
        model="test-model",
        manifest_path=tmp_path / "paid-manifest.json",
        results_path=tmp_path / "paid-results.jsonl",
    )
    assert first["ids_selected"] == ["place-1"]
    assert client.responses.calls == 1

    next_run = run_quality_v4_backfill(
        path,
        limit=10,
        floor70_prepublication=True,
        dry_run=True,
        manifest_path=tmp_path / "next-manifest.json",
        results_path=tmp_path / "next-results.jsonl",
    )
    assert next_run["ids_selected"] == ["place-2", "place-0"]
    assert "place-1" not in next_run["ids_selected"]


def test_floor70_prepublication_is_mutually_exclusive_with_force_and_retry(tmp_path) -> None:
    path = _db(tmp_path, count=1)
    _make_floor70_candidate(path, "place-0")
    for incompatible in ({"force": True}, {"retry_failed": True}):
        try:
            run_quality_v4_backfill(
                path,
                floor70_prepublication=True,
                dry_run=True,
                manifest_path=tmp_path / f"{next(iter(incompatible))}.json",
                **incompatible,
            )
        except ValueError as exc:
            assert "mutually exclusive" in str(exc)
        else:
            raise AssertionError("incompatible selector modes must fail")

    with pytest.raises(SystemExit):
        _parser().parse_args(
            [
                "quality-v4-backfill",
                "--floor70-prepublication",
                "--retry-failed",
            ]
        )
