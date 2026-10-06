import json

from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.public_score import (
    FiyuEvidence,
    InternalSignals,
    calculate_fiyu_score,
)
from fiyu.research_worker import SYSTEM_PROMPT
from fiyu.score_transparency import explain_score
from fiyu.specialist_tristate_migration import run_migration


def test_specialist_states_have_distinct_bounded_treatment() -> None:
    internal = InternalSignals(80, 80, 80)

    def score(status: str):
        return calculate_fiyu_score(
            FiyuEvidence(
                matched_restaurant=True,
                identity_confidence=0.9,
                chain_classification="independent_single",
                specialist_status=status,
                total_evidence_sources=4,
            ),
            internal,
        )

    specialist = score("specialist")
    unknown = score("unknown")
    non_specialist = score("non_specialist")
    assert specialist.independence_signal > unknown.independence_signal
    assert unknown.independence_signal > non_specialist.independence_signal
    assert specialist.local_discovery_components["distinctiveness"] == 85
    assert unknown.local_discovery_components["distinctiveness"] == 70
    assert non_specialist.local_discovery_components["distinctiveness"] == 50
    assert specialist.fiyu_score > unknown.fiyu_score > non_specialist.fiyu_score


def test_legacy_boolean_is_only_a_compatibility_boundary() -> None:
    positive = FiyuEvidence(specialist_restaurant=True)
    ambiguous_false = FiyuEvidence(specialist_restaurant=False)
    assert positive.specialist_status == "specialist"
    assert positive.specialist_restaurant is True
    assert ambiguous_false.specialist_status == "unknown"
    assert ambiguous_false.specialist_restaurant is False


def test_research_prompt_requires_evidence_based_tristate() -> None:
    prompt = " ".join(SYSTEM_PROMPT.split())
    assert "Use non_specialist only with affirmative evidence" in prompt
    assert "Lack of specialist evidence is not non_specialist" in prompt
    assert "Do not output numeric score values" in prompt


def test_v3_tristate_version_preserves_score_transparency() -> None:
    explanation = explain_score(
        {
            "score_version": "public-v3-local-discovery-specialist-tristate",
            "fiyu_score": 80,
            "quality_signal": 80,
            "hiddenness_signal": 70,
            "independence_signal": 97,
            "local_discovery_score": 72,
            "confidence_band": "high",
            "evidence_json": "{}",
            "structured_research_json": "{}",
        }
    )
    assert explanation.model_label == "Current scoring model"
    assert len(explanation.signals) == 4


def _migration_db(tmp_path):
    path = tmp_path / "specialist.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants (
                place_id, title, rating, review_count, quality_score,
                underexposure_score, digital_footprint_score
            ) VALUES ('place-1', 'Place', 4.5, 20, 80, 80, 80)
            """
        )
        connection.commit()
    ensure_public_schema(path)
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.9,
        chain_classification="independent_single",
        specialist_status="non_specialist",
        total_evidence_sources=4,
    )
    score = calculate_fiyu_score(evidence, InternalSignals(80, 80, 80))
    legacy_evidence = evidence.to_dict()
    legacy_evidence.pop("specialist_status")
    legacy_evidence.pop("specialist_evidence_summary")
    legacy_evidence.pop("specialist_evidence")
    legacy_evidence.pop("specialist_source_references")
    legacy_evidence.pop("specialist_confidence")
    legacy_evidence.pop("specialist_schema_version")
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, name_en, evidence_json, research_status, review_status,
                product_eligible, product_eligibility_classification,
                product_eligibility_reasons_json, is_published,
                local_signal, hiddenness_signal, quality_signal, independence_signal,
                local_discovery_score, local_discovery_classification,
                local_discovery_components_json, local_discovery_contribution,
                tourist_visibility_classification, tourist_orientation,
                tourist_orientation_basis, fiyu_score, fiyu_confidence,
                confidence_band, score_band, score_version, created_at, updated_at
            ) VALUES (
                'place-1', 'Place', ?, 'complete', 'auto_rejected', 1,
                'eligible_visit_ready_venue', '[]', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, 'public-v3-local-discovery', 'now', 'now'
            )
            """,
            (
                json.dumps(legacy_evidence),
                score.local_signal,
                score.hiddenness_signal,
                score.quality_signal,
                score.independence_signal,
                score.local_discovery_score,
                score.local_discovery_classification,
                json.dumps(score.local_discovery_components),
                score.local_discovery_contribution,
                score.tourist_visibility_classification,
                score.tourist_orientation,
                score.tourist_orientation_basis,
                score.fiyu_score,
                score.fiyu_confidence,
                score.confidence_band,
                score.score_band,
            ),
        )
        connection.execute(
            """
            INSERT INTO restaurant_research_runs (
                public_restaurant_id, provider, model, prompt_version,
                pipeline_version, status, evidence_json, score_json,
                is_current, created_at, completed_at
            ) VALUES ('place-1', 'test', 'test', 'legacy', 'legacy', 'complete',
                      ?, ?, 1, 'now', 'now')
            """,
            (json.dumps(legacy_evidence), json.dumps(score.to_dict())),
        )
        connection.commit()
    return path, score.fiyu_score


def test_migration_is_local_bounded_and_idempotent(tmp_path) -> None:
    path, old_score = _migration_db(tmp_path)
    before = path.read_bytes()
    dry_run = run_migration(path, dry_run=True)
    assert path.read_bytes() == before
    assert dry_run["proposed_counts"] == {
        "specialist": 0,
        "non_specialist": 0,
        "unknown": 1,
    }
    assert dry_run["scoring"]["rows_changed"] == 1

    backup = tmp_path / "backup.db"
    migrated = run_migration(path, dry_run=False, backup_path=backup)
    assert migrated["post_migration"]["idempotency_rows_to_migrate"] == 0
    assert migrated["post_migration"]["duplicate_new_score_history_rows"] == 0
    with connect(path) as connection:
        row = connection.execute(
            """
            SELECT specialist_status, specialist_provenance_json, fiyu_score,
                   is_published, review_status
            FROM public_restaurants WHERE place_id='place-1'
            """
        ).fetchone()
        history = connection.execute(
            "SELECT COUNT(*) FROM score_calculation_runs"
        ).fetchone()[0]
    assert row["specialist_status"] == "unknown"
    assert json.loads(row["specialist_provenance_json"])["origin"] == (
        "prior_ambiguous_false"
    )
    assert row["fiyu_score"] == old_score + 0.95
    assert row["is_published"] == 0
    assert row["review_status"] == "auto_rejected"
    assert history == 1

    rerun = run_migration(path, dry_run=False, backup_path=tmp_path / "unused.db")
    assert rerun["migration"]["rows_to_migrate"] == 0
    with connect(path) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM score_calculation_runs"
        ).fetchone()[0] == 1
