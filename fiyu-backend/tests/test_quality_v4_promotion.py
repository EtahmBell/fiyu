import hashlib
import json
import shutil

import pytest

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
from fiyu.quality_v4_promotion import (
    COHORT_MANIFEST_VERSION,
    FLOOR70_COHORT_NAME,
    inspect_quality_v4_promotion,
    run_quality_v4_promotion,
)


def _sha256(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def _cohort_manifest(tmp_path, source, place_ids):
    audit = tmp_path / "final-audit.json"
    audit.write_text(
        json.dumps(
            {
                "completion": {"original_cohort": len(place_ids)},
                "score_parity": {
                    "shadow_production_exact_matches": len(place_ids),
                    "mismatches": 0,
                },
                "promotion_precheck": {"missing_promotion_critical_fields": 0},
                "cohort_rows": [{"place_id": place_id} for place_id in place_ids],
            }
        ),
        encoding="utf-8",
    )
    path = tmp_path / "cohort.json"
    path.write_text(
        json.dumps(
            {
                "manifest_version": COHORT_MANIFEST_VERSION,
                "cohort_name": FLOOR70_COHORT_NAME,
                "target_floor": 70,
                "source_shadow_sha256": _sha256(source),
                "created_from_audit": str(audit),
                "audit_summary_sha256": _sha256(audit),
                "cohort_count": len(place_ids),
                "restaurants": [{"place_id": place_id} for place_id in place_ids],
                "audit_assertions": {
                    "published_overlap": 0,
                    "production_v4_overlap": 0,
                    "below_floor_rescue_overlap": 0,
                    "address_conflict_overlap": 0,
                    "unresolved_or_incomplete_overlap": 0,
                },
            }
        ),
        encoding="utf-8",
    )
    return path


def _expansion_manifest(tmp_path, place_ids):
    path = tmp_path / "expansion-cohort.json"
    path.write_text(
        json.dumps(
            {
                "manifest_version": "deterministic-unseeded-cohort-1",
                "cohort_id": "expansion-smoke-test",
                "dry_run": True,
                "min_score": 60,
                "selected_count": len(place_ids),
                "ordered_place_ids": place_ids,
            }
        ),
        encoding="utf-8",
    )
    return path


def _databases(tmp_path, *, specialist_status="unknown"):
    canonical = tmp_path / "canonical.db"
    source = tmp_path / "shadow.db"
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.9,
        specialist_status=specialist_status,
    )
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
                UPDATE public_restaurants
                SET specialist_status=?, specialist_schema_version='specialist-tristate-1'
                WHERE place_id=?
                """,
                (specialist_status, place_id),
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
                claim_clusters_json, usage_metadata_json, response_request_count,
                created_at, completed_at
            ) VALUES (
                'place-0', 'openai', 'test', 'response-1', 'complete', ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '{}', 1, 'now', 'now'
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


@pytest.mark.parametrize(
    "specialist_status",
    ["specialist", "non_specialist", "unknown"],
)
def test_expansion_promotion_accepts_canonical_specialist_tristate(
    tmp_path, specialist_status
) -> None:
    canonical, source, _ = _databases(
        tmp_path, specialist_status=specialist_status
    )
    manifest = _expansion_manifest(tmp_path, ["place-0"])

    summary, plans = inspect_quality_v4_promotion(
        canonical,
        source_db=source,
        cohort_manifest=manifest,
    )

    assert summary["source_complete_v4_rows"] == 1
    assert summary["shadow_production_mismatches"] == 0
    assert [plan["place_id"] for plan in plans] == ["place-0"]


@pytest.mark.parametrize("invalid_status", ["not_specialist", "invalid"])
def test_expansion_promotion_rejects_noncanonical_specialist_state(
    tmp_path, invalid_status
) -> None:
    canonical, source, _ = _databases(tmp_path)
    manifest = _expansion_manifest(tmp_path, ["place-0"])
    with connect(canonical) as connection:
        row = connection.execute(
            "SELECT evidence_json FROM public_restaurants WHERE place_id='place-0'"
        ).fetchone()
        evidence = json.loads(row[0])
        evidence["specialist_status"] = invalid_status
        connection.execute(
            "UPDATE public_restaurants SET evidence_json=? WHERE place_id='place-0'",
            (json.dumps(evidence),),
        )
        connection.commit()

    with pytest.raises(ValueError, match="unexpected specialist tri-state"):
        inspect_quality_v4_promotion(
            canonical,
            source_db=source,
            cohort_manifest=manifest,
        )


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


def test_scoped_promotion_is_allowlisted_safe_and_idempotent(tmp_path) -> None:
    canonical, source, v3_score = _databases(tmp_path)
    manifest = _cohort_manifest(tmp_path, source, ["place-0"])
    canonical_before = canonical.read_bytes()
    with connect(canonical) as connection:
        unrelated_before = tuple(
            connection.execute(
                "SELECT fiyu_score, score_version, is_published, product_eligible, "
                "review_status FROM public_restaurants WHERE place_id='place-1'"
            ).fetchone()
        )

    dry_run = run_quality_v4_promotion(
        canonical,
        source_db=source,
        cohort_manifest=manifest,
        dry_run=True,
    )
    assert dry_run["selection_scope"] == "cohort_manifest"
    assert dry_run["cohort_ids"] == 1
    assert dry_run["unique_cohort_ids"] == 1
    assert dry_run["source_complete_v4_rows"] == 1
    assert dry_run["source_incomplete_rows"] == 0
    assert dry_run["selected_for_promotion"] == 1
    assert dry_run["already_promoted"] == 0
    assert dry_run["shadow_production_exact_matches"] == 1
    assert dry_run["expected_publication_state_changes"] == 0
    assert dry_run["expected_threshold_changes"] == 0
    assert dry_run["unrelated_rows_selected"] == 0
    assert dry_run["sankei_sushi_selected"] is False
    assert dry_run["below_floor_rescue_overlap"] == 0
    assert dry_run["external_requests"] == 0
    assert canonical.read_bytes() == canonical_before

    backup = tmp_path / "scoped-backup.db"
    result = run_quality_v4_promotion(
        canonical,
        source_db=source,
        cohort_manifest=manifest,
        backup_path=backup,
    )
    assert backup.read_bytes() == canonical_before
    assert result["publication_state_changes"] == 0
    assert result["threshold_changes"] == 0
    assert result["unrelated_rows_changed"] == 0
    assert result["idempotency_rows_to_import"] == 0
    assert result["idempotency_rows_to_score"] == 0
    with connect(canonical) as connection:
        promoted = connection.execute(
            "SELECT fiyu_score, score_version, is_published, product_eligible, "
            "review_status FROM public_restaurants WHERE place_id='place-0'"
        ).fetchone()
        unrelated_after = tuple(
            connection.execute(
                "SELECT fiyu_score, score_version, is_published, product_eligible, "
                "review_status FROM public_restaurants WHERE place_id='place-1'"
            ).fetchone()
        )
        history_versions = dict(
            connection.execute(
                "SELECT score_version, COUNT(*) FROM score_calculation_runs "
                "WHERE public_restaurant_id='place-0' GROUP BY score_version"
            ).fetchall()
        )
    assert promoted["fiyu_score"] == v3_score
    assert promoted["score_version"] == QUALITY_PRODUCTION_SCORE_VERSION
    assert tuple(promoted)[2:] == (1, 1, "auto_published")
    assert unrelated_after == unrelated_before
    assert history_versions[SCORE_VERSION] == 1
    assert history_versions[QUALITY_PRODUCTION_SCORE_VERSION] == 1

    rerun = run_quality_v4_promotion(
        canonical,
        source_db=source,
        cohort_manifest=manifest,
    )
    assert rerun["selected_for_promotion"] == 0
    assert rerun["already_promoted"] == 1
    assert rerun["rows_to_import"] == 0
    assert rerun["rows_to_score"] == 0


def test_scoped_promotion_accepts_frozen_expansion_manifest(tmp_path) -> None:
    canonical, source, _ = _databases(tmp_path)
    manifest = _expansion_manifest(tmp_path, ["place-0"])

    summary, plans = inspect_quality_v4_promotion(
        canonical,
        source_db=source,
        cohort_manifest=manifest,
    )

    assert summary["cohort_manifest_version"] == "deterministic-unseeded-cohort-1"
    assert [plan["place_id"] for plan in plans] == ["place-0"]


def test_scoped_promotion_rejects_duplicate_manifest_ids(tmp_path) -> None:
    canonical, source, _ = _databases(tmp_path)
    manifest = _cohort_manifest(tmp_path, source, ["place-0", "place-0"])
    with pytest.raises(ValueError, match="duplicate cohort place IDs"):
        inspect_quality_v4_promotion(
            canonical,
            source_db=source,
            cohort_manifest=manifest,
        )


def test_scoped_promotion_rejects_missing_canonical_identity(tmp_path) -> None:
    canonical, source, _ = _databases(tmp_path)
    manifest = _cohort_manifest(tmp_path, source, ["place-0"])
    with connect(canonical) as connection:
        connection.commit()
        connection.execute("PRAGMA foreign_keys=OFF")
        connection.execute("DELETE FROM public_restaurants WHERE place_id='place-0'")
        connection.commit()
    with pytest.raises(ValueError, match="missing from canonical database"):
        inspect_quality_v4_promotion(
            canonical,
            source_db=source,
            cohort_manifest=manifest,
        )


def test_scoped_promotion_rejects_incomplete_latest_attempt(tmp_path) -> None:
    canonical, source, _ = _databases(tmp_path)
    manifest = _cohort_manifest(tmp_path, source, ["place-1"])
    with pytest.raises(ValueError, match="incomplete latest V4 attempts"):
        inspect_quality_v4_promotion(
            canonical,
            source_db=source,
            cohort_manifest=manifest,
        )


def test_scoped_promotion_rejects_canonical_input_drift(tmp_path) -> None:
    canonical, source, _ = _databases(tmp_path)
    manifest = _cohort_manifest(tmp_path, source, ["place-0"])
    with connect(canonical) as connection:
        connection.execute(
            "UPDATE restaurants SET quality_score=71 WHERE place_id='place-0'"
        )
        connection.commit()
    with pytest.raises(ValueError, match="shadow/production recomputation mismatch"):
        inspect_quality_v4_promotion(
            canonical,
            source_db=source,
            cohort_manifest=manifest,
        )


def test_scoped_promotion_rejects_stored_score_parity_mismatch(tmp_path) -> None:
    canonical, source, _ = _databases(tmp_path)
    with connect(source) as connection:
        connection.execute(
            "UPDATE quality_v4_research_runs SET shadow_v4_score=shadow_v4_score+1 "
            "WHERE public_restaurant_id='place-0'"
        )
        connection.commit()
    manifest = _cohort_manifest(tmp_path, source, ["place-0"])
    with pytest.raises(ValueError, match="shadow/production recomputation mismatch"):
        inspect_quality_v4_promotion(
            canonical,
            source_db=source,
            cohort_manifest=manifest,
        )


def test_scoped_promotion_rejects_unexpected_prompt_version(tmp_path) -> None:
    canonical, source, _ = _databases(tmp_path)
    with connect(source) as connection:
        connection.execute(
            "UPDATE quality_v4_research_runs SET prompt_version='unexpected' "
            "WHERE public_restaurant_id='place-0'"
        )
        connection.commit()
    manifest = _cohort_manifest(tmp_path, source, ["place-0"])
    with pytest.raises(ValueError, match="unexpected prompt_version"):
        inspect_quality_v4_promotion(
            canonical,
            source_db=source,
            cohort_manifest=manifest,
        )
