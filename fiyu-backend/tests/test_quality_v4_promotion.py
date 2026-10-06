import json
import shutil

from fiyu.database import SCHEMA, connect
from fiyu.experimental_quality_challenge_v4 import ChallengeResearchResult
from fiyu.public_catalog import ensure_public_schema
from fiyu.public_score import (
    PUBLICATION_SCORE_THRESHOLD,
    SCORE_VERSION,
    FiyuEvidence,
    InternalSignals,
)
from fiyu.quality_v4 import (
    DEFAULT_ADJUSTMENT_GUARDRAIL,
    QUALITY_CASE_STRENGTH_VERSION,
    QUALITY_PRODUCTION_SCORE_VERSION,
    QUALITY_PROMPT_VERSION,
    QUALITY_RESEARCH_VERSION,
    QUALITY_SCORE_VERSION,
    calculate_quality_v4_shadow,
)
from fiyu.quality_v4_promotion import run_quality_v4_promotion


def _databases(tmp_path):
    canonical = tmp_path / "canonical.db"
    source = tmp_path / "shadow.db"
    evidence = FiyuEvidence(matched_restaurant=True, identity_confidence=0.9)
    internal = InternalSignals(70, 75, 80)
    score = calculate_quality_v4_shadow([], evidence=evidence, internal=internal)
    with connect(canonical) as connection:
        connection.executescript(SCHEMA)
        for index in range(2):
            connection.execute(
                """
                INSERT INTO restaurants (
                    place_id, title, rating, review_count, quality_score,
                    underexposure_score, digital_footprint_score, internal_fiyu_score
                ) VALUES (?, ?, 4.4, 30, 70, 75, 80, 72)
                """,
                (f"place-{index}", f"Place {index}"),
            )
        connection.commit()
    ensure_public_schema(canonical)
    with connect(canonical) as connection:
        for index in range(2):
            place_id = f"place-{index}"
            connection.execute(
                """
                INSERT INTO public_restaurants (
                    place_id, source_restaurant_id, name_en, identity_confidence,
                    evidence_json, research_status, review_status, fiyu_score,
                    fiyu_confidence, confidence_band, score_band, score_version,
                    local_signal, hiddenness_signal, quality_signal,
                    independence_signal, local_discovery_score,
                    local_discovery_classification, local_discovery_components_json,
                    local_discovery_contribution, tourist_visibility_classification,
                    tourist_orientation, tourist_orientation_basis,
                    product_eligible, is_published, created_at, updated_at
                ) VALUES (?, ?, ?, 0.9, ?, 'complete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                          ?, ?, ?, ?, ?, ?, ?, 1, ?, 'now', 'now')
                """,
                (
                    place_id,
                    index + 1,
                    f"Place {index}",
                    json.dumps(evidence.to_dict()),
                    "auto_published" if index == 0 else "candidate",
                    score.production_v3.fiyu_score,
                    score.production_v3.fiyu_confidence,
                    score.production_v3.confidence_band,
                    score.production_v3.score_band,
                    SCORE_VERSION,
                    score.production_v3.local_signal,
                    score.production_v3.hiddenness_signal,
                    score.production_v3.quality_signal,
                    score.production_v3.independence_signal,
                    score.production_v3.local_discovery_score,
                    score.production_v3.local_discovery_classification,
                    json.dumps(score.production_v3.local_discovery_components),
                    score.production_v3.local_discovery_contribution,
                    score.production_v3.tourist_visibility_classification,
                    score.production_v3.tourist_orientation,
                    score.production_v3.tourist_orientation_basis,
                    1 if index == 0 else 0,
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
    shutil.copyfile(canonical, source)
    research = ChallengeResearchResult(
        evidence_level="none",
        quality_evidence_confidence="low",
        observations=[],
        research_summary="No useful food-specific evidence was found.",
    )
    with connect(source) as connection:
        connection.execute(
            """
            INSERT INTO quality_v4_research_runs (
                public_restaurant_id, provider, model, response_id, status,
                quality_research_version, quality_case_strength_version,
                score_version, prompt_version, adjustment_guardrail,
                base_quality_prior, positive_case_strength, negative_case_strength,
                evidence_balance, raw_quality_adjustment, guarded_quality_adjustment,
                researched_quality, quality_evidence_confidence,
                production_v3_score, shadow_v4_score, shadow_score_delta,
                research_result_json, normalized_observations_json,
                claim_clusters_json, created_at, completed_at
            ) VALUES (
                'place-0', 'openai', 'test', 'response-1', 'complete', ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', 'now', 'now'
            )
            """,
            (
                QUALITY_RESEARCH_VERSION,
                QUALITY_CASE_STRENGTH_VERSION,
                QUALITY_SCORE_VERSION,
                QUALITY_PROMPT_VERSION,
                DEFAULT_ADJUSTMENT_GUARDRAIL,
                score.quality.base_quality_prior,
                score.quality.positive_case_strength,
                score.quality.negative_case_strength,
                score.quality.evidence_balance,
                score.quality.raw_quality_adjustment,
                score.quality.guarded_quality_adjustment,
                score.quality.researched_quality,
                score.quality.quality_evidence_confidence,
                score.production_v3.fiyu_score,
                score.shadow_v4.fiyu_score,
                score.score_delta,
                json.dumps(research.model_dump(mode="json")),
            ),
        )
        connection.execute(
            """
            INSERT INTO quality_v4_research_runs (
                public_restaurant_id, provider, model, status,
                quality_research_version, quality_case_strength_version,
                score_version, prompt_version, adjustment_guardrail,
                error_category, error, created_at, completed_at
            ) VALUES (
                'place-1', 'openai', 'test', 'failed', ?, ?, ?, ?, 15,
                'validation_or_processing_failure', 'invalid JSON', 'now', 'now'
            )
            """,
            (
                QUALITY_RESEARCH_VERSION,
                QUALITY_CASE_STRENGTH_VERSION,
                QUALITY_SCORE_VERSION,
                QUALITY_PROMPT_VERSION,
            ),
        )
        connection.commit()
    return canonical, source, score.production_v3.fiyu_score


def test_promotion_is_atomic_safe_and_idempotent(tmp_path) -> None:
    canonical, source, v3_score = _databases(tmp_path)
    threshold_before = PUBLICATION_SCORE_THRESHOLD
    before = canonical.read_bytes()

    dry_run = run_quality_v4_promotion(canonical, source_db=source, dry_run=True)
    assert dry_run["source_complete_v4_rows"] == 1
    assert dry_run["source_failed_rows"] == 1
    assert dry_run["rows_to_import"] == 1
    assert dry_run["rows_to_score"] == 1
    assert dry_run["expected_publication_state_changes"] == 0
    assert canonical.read_bytes() == before

    backup = tmp_path / "backup.db"
    result = run_quality_v4_promotion(
        canonical,
        source_db=source,
        backup_path=backup,
    )
    assert backup.read_bytes() == before
    assert result["shadow_production_exact_matches"] == 1
    assert result["current_production_v4_rows"] == 1
    assert result["total_visibility_state_changes"] == 0
    assert result["idempotency_rows_to_import"] == 0
    assert result["idempotency_rows_to_score"] == 0
    assert PUBLICATION_SCORE_THRESHOLD == threshold_before

    with connect(canonical) as connection:
        complete = connection.execute(
            "SELECT COUNT(*) FROM quality_v4_research_runs WHERE status='complete'"
        ).fetchone()[0]
        promoted = connection.execute(
            "SELECT fiyu_score, score_version, is_published, product_eligible, review_status "
            "FROM public_restaurants WHERE place_id='place-0'"
        ).fetchone()
        failed = connection.execute(
            "SELECT fiyu_score, score_version, is_published, product_eligible, review_status "
            "FROM public_restaurants WHERE place_id='place-1'"
        ).fetchone()
        versions = dict(
            connection.execute(
                "SELECT score_version, COUNT(*) FROM score_calculation_runs GROUP BY score_version"
            ).fetchall()
        )
    assert complete == 1
    assert promoted["fiyu_score"] == v3_score
    assert promoted["score_version"] == QUALITY_PRODUCTION_SCORE_VERSION
    assert tuple(promoted)[2:] == (1, 1, "auto_published")
    assert failed["fiyu_score"] == v3_score
    assert failed["score_version"] == SCORE_VERSION
    assert tuple(failed)[2:] == (0, 1, "candidate")
    assert versions[SCORE_VERSION] == 1
    assert versions[QUALITY_PRODUCTION_SCORE_VERSION] == 1

    rerun = run_quality_v4_promotion(canonical, source_db=source)
    assert rerun["rows_to_import"] == 0
    assert rerun["rows_to_score"] == 0
    with connect(canonical) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM quality_v4_research_runs WHERE status='complete'"
        ).fetchone()[0] == 1
        assert connection.execute(
            "SELECT COUNT(*) FROM score_calculation_runs WHERE score_version=?",
            (QUALITY_PRODUCTION_SCORE_VERSION,),
        ).fetchone()[0] == 1
