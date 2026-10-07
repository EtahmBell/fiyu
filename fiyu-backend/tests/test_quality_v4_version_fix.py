import json

import pytest

from fiyu.database import connect
from fiyu.public_score import PUBLICATION_SCORE_THRESHOLD, SCORE_VERSION
from fiyu.quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION
from fiyu.quality_v4_promotion import (
    run_quality_v4_promotion,
    score_history_fingerprint,
)
from fiyu.quality_v4_version_fix import (
    CANONICAL_V4_SCORE_VERSION,
    STALE_V4_SCORE_VERSION,
    inspect_specialist_version_fix,
    run_specialist_version_fix,
)
from fiyu.specialist_tristate_migration import (
    MIGRATION_VERSION,
    SPECIALIST_SCHEMA_VERSION,
    V4_SCORE_VERSION,
)
from tests.test_quality_v4_promotion import _cohort_manifest, _databases


def _stale_promoted_database(tmp_path):
    canonical, source, _ = _databases(tmp_path)
    manifest = _cohort_manifest(tmp_path, source, ["place-0"])
    run_quality_v4_promotion(
        canonical,
        source_db=source,
        cohort_manifest=manifest,
        backup_path=tmp_path / "promotion-backup.db",
    )
    provenance = {
        "migration_version": MIGRATION_VERSION,
        "specialist_status": "unknown",
        "prior_boolean_value": False,
    }
    with connect(canonical) as connection:
        history = connection.execute(
            "SELECT id, score_json FROM score_calculation_runs "
            "WHERE public_restaurant_id='place-0' AND score_version=?",
            (CANONICAL_V4_SCORE_VERSION,),
        ).fetchone()
        payload = json.loads(history["score_json"])
        payload["score_version"] = STALE_V4_SCORE_VERSION
        connection.execute(
            "UPDATE score_calculation_runs SET score_version=?, score_json=?, "
            "evidence_fingerprint=? WHERE id=?",
            (
                STALE_V4_SCORE_VERSION,
                json.dumps(payload),
                score_history_fingerprint(payload),
                history["id"],
            ),
        )
        connection.execute(
            "UPDATE public_restaurants SET score_version=?, specialist_status='unknown', "
            "specialist_schema_version=?, specialist_provenance_json=? "
            "WHERE place_id='place-0'",
            (
                STALE_V4_SCORE_VERSION,
                SPECIALIST_SCHEMA_VERSION,
                json.dumps(provenance),
            ),
        )
        connection.commit()
    return canonical, source, manifest


def test_dry_run_strictly_selects_stale_manifest_row_without_mutation(tmp_path) -> None:
    canonical, source, manifest = _stale_promoted_database(tmp_path)
    before = canonical.read_bytes()

    result = run_specialist_version_fix(
        canonical,
        cohort_manifest=manifest,
        source_db=source,
        dry_run=True,
    )

    assert result["cohort"] == {
        "manifest_path": str(manifest),
        "manifest_sha256": result["cohort"]["manifest_sha256"],
        "manifest_ids": 1,
        "unique_ids": 1,
        "canonical_matched": 1,
    }
    assert result["selection"] == {"selected": 1, "already_correct": 0, "invalid": 0}
    assert result["current_pointer"]["score_version_labels_to_change"] == 1
    assert result["current_pointer"]["numeric_score_changes"] == 0
    assert result["history"]["v4_history_labels_to_change"] == 1
    assert result["history"]["embedded_score_json_labels_to_change"] == 1
    assert result["history"]["fingerprints_to_recompute"] == 1
    assert result["history"]["v3_history_rows_touched"] == 0
    assert result["invariants"]["publication_changes"] == 0
    assert result["invariants"]["threshold_changes"] == 0
    assert canonical.read_bytes() == before


def test_real_fix_is_metadata_only_scoped_and_idempotent(tmp_path) -> None:
    canonical, source, manifest = _stale_promoted_database(tmp_path)
    threshold_before = PUBLICATION_SCORE_THRESHOLD
    with connect(canonical) as connection:
        affected_before = dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id='place-0'"
            ).fetchone()
        )
        unrelated_before = dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id='place-1'"
            ).fetchone()
        )
        v3_before = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM score_calculation_runs "
                "WHERE public_restaurant_id='place-0' AND score_version=?",
                (SCORE_VERSION,),
            ).fetchall()
        ]
        quality_before = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM quality_v4_research_runs ORDER BY id"
            ).fetchall()
        ]

    result = run_specialist_version_fix(
        canonical,
        cohort_manifest=manifest,
        source_db=source,
        backup_path=tmp_path / "lineage-backup.db",
    )

    assert result["selection"]["selected"] == 1
    assert result["selection_after"] == {
        "selected": 0,
        "already_correct": 1,
        "invalid": 0,
    }
    with connect(canonical) as connection:
        affected_after = dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id='place-0'"
            ).fetchone()
        )
        unrelated_after = dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id='place-1'"
            ).fetchone()
        )
        v3_after = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM score_calculation_runs "
                "WHERE public_restaurant_id='place-0' AND score_version=?",
                (SCORE_VERSION,),
            ).fetchall()
        ]
        history = connection.execute(
            "SELECT * FROM score_calculation_runs "
            "WHERE public_restaurant_id='place-0' AND score_version=?",
            (CANONICAL_V4_SCORE_VERSION,),
        ).fetchone()
        quality_after = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM quality_v4_research_runs ORDER BY id"
            ).fetchall()
        ]
    changed_fields = {
        key for key in affected_before if affected_before[key] != affected_after[key]
    }
    payload = json.loads(history["score_json"])
    assert changed_fields == {"score_version"}
    assert affected_after["score_version"] == CANONICAL_V4_SCORE_VERSION
    assert unrelated_after == unrelated_before
    assert v3_after == v3_before
    assert quality_after == quality_before
    assert payload["score_version"] == CANONICAL_V4_SCORE_VERSION
    assert history["evidence_fingerprint"] == score_history_fingerprint(payload)
    assert PUBLICATION_SCORE_THRESHOLD == threshold_before

    post_bytes = canonical.read_bytes()
    rerun = run_specialist_version_fix(
        canonical,
        cohort_manifest=manifest,
        source_db=source,
        dry_run=True,
    )
    assert rerun["selection"] == {"selected": 0, "already_correct": 1, "invalid": 0}
    assert rerun["history"]["fingerprints_to_recompute"] == 0
    assert canonical.read_bytes() == post_bytes


@pytest.mark.parametrize("bad_version", [SCORE_VERSION, None])
def test_wrong_or_missing_current_version_hard_fails(tmp_path, bad_version) -> None:
    canonical, source, manifest = _stale_promoted_database(tmp_path)
    with connect(canonical) as connection:
        connection.execute(
            "UPDATE public_restaurants SET score_version=? WHERE place_id='place-0'",
            (bad_version,),
        )
        connection.commit()
    with pytest.raises(ValueError, match="unexpected current score_version"):
        inspect_specialist_version_fix(
            canonical,
            cohort_manifest=manifest,
            source_db=source,
        )


def test_numeric_score_mismatch_hard_fails(tmp_path) -> None:
    canonical, source, manifest = _stale_promoted_database(tmp_path)
    with connect(canonical) as connection:
        connection.execute(
            "UPDATE public_restaurants SET fiyu_score=fiyu_score+1 "
            "WHERE place_id='place-0'"
        )
        connection.commit()
    with pytest.raises(ValueError, match="current canonical score mismatch"):
        inspect_specialist_version_fix(
            canonical,
            cohort_manifest=manifest,
            source_db=source,
        )


def test_specialist_semantic_mismatch_hard_fails(tmp_path) -> None:
    canonical, source, manifest = _stale_promoted_database(tmp_path)
    with connect(canonical) as connection:
        connection.execute(
            "UPDATE public_restaurants SET specialist_status='specialist' "
            "WHERE place_id='place-0'"
        )
        connection.commit()
    with pytest.raises(ValueError, match="specialist evidence mismatch"):
        inspect_specialist_version_fix(
            canonical,
            cohort_manifest=manifest,
            source_db=source,
        )


def test_history_fingerprint_mismatch_hard_fails(tmp_path) -> None:
    canonical, source, manifest = _stale_promoted_database(tmp_path)
    with connect(canonical) as connection:
        connection.execute(
            "UPDATE score_calculation_runs SET evidence_fingerprint='invalid' "
            "WHERE public_restaurant_id='place-0' AND score_version=?",
            (STALE_V4_SCORE_VERSION,),
        )
        connection.commit()
    with pytest.raises(ValueError, match="invalid V4 history fingerprint"):
        inspect_specialist_version_fix(
            canonical,
            cohort_manifest=manifest,
            source_db=source,
        )


def test_future_promotion_uses_shared_canonical_specialist_label() -> None:
    assert QUALITY_PRODUCTION_SCORE_VERSION == CANONICAL_V4_SCORE_VERSION
    assert QUALITY_PRODUCTION_SCORE_VERSION == V4_SCORE_VERSION
    assert QUALITY_PRODUCTION_SCORE_VERSION.endswith("specialist-tristate")
