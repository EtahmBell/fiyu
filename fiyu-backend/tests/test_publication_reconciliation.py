from __future__ import annotations

import json
from pathlib import Path

import pytest

from fiyu.catalog_pipeline import (
    PUBLICATION_THRESHOLD_METADATA_KEY,
    publication_score_threshold,
)
from fiyu.database import connect
from fiyu.publication_reconciliation import (
    SANKEI_PLACE_ID,
    _manifest_ids,
    _reconciliation_decision,
    _row_change,
    run_publication_reconciliation,
)
from fiyu.quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION
from tests.test_catalog_pipeline import _db, _make_auto_publishable


def _row(**updates):
    row = {
        "place_id": "place-1",
        "is_published": 0,
        "research_status": "complete",
        "fiyu_score": 72.0,
        "score_version": "public-v4-quality-research-specialist-tristate",
        "product_eligible": 1,
        "review_status": "auto_rejected",
        "review_notes": "score_or_product_policy_rejected",
    }
    row.update(updates)
    return row


def _decision(*, published=True, matched=True, confidence=0.9, reason=None):
    return {
        "published": published,
        "outcome": "auto_published" if published else "auto_rejected",
        "reason": reason,
        "readiness": {"missing": []},
        "policy": {
            "diagnostics": {
                "matched_restaurant": matched,
                "identity_confidence": confidence,
            }
        },
    }


def test_publication_threshold_defaults_to_75_and_database_override_wins(tmp_path):
    path = _db(tmp_path)
    assert publication_score_threshold(path) == 75.0
    with connect(path) as connection:
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES(?, ?)",
            (PUBLICATION_THRESHOLD_METADATA_KEY, "70"),
        )
        connection.commit()
    assert publication_score_threshold(path) == 70.0


@pytest.mark.parametrize(
    ("matched", "confidence", "reason"),
    ((False, 0.9, "identity_not_matched"), (True, 0.59, "unresolved_identity")),
)
def test_new_admission_keeps_identity_readiness_gates(matched, confidence, reason):
    result = _reconciliation_decision(
        _row(), _decision(matched=matched, confidence=confidence), 70.0
    )
    assert result["published"] is False
    assert result["reconciliation_block"] == reason


def test_manual_or_non_score_rejection_is_not_admitted():
    result = _reconciliation_decision(
        _row(review_status="rejected", review_notes="manual block"),
        _decision(),
        70.0,
    )
    assert result["published"] is False
    assert result["reconciliation_block"] == "not_score_only_rejected"


def test_gate_clean_score_only_rejection_is_admitted():
    result = _reconciliation_decision(_row(), _decision(), 70.0)
    assert result["published"] is True
    assert result.get("reconciliation_block") is None


def test_legacy_published_row_without_newer_score_run_is_retained():
    result = _reconciliation_decision(
        _row(is_published=1, review_status="candidate", review_notes=None),
        {
            **_decision(published=False, reason="score_or_product_policy_rejected"),
            "policy": {"reason": "completed_score_run_missing"},
        },
        70.0,
    )
    assert result["published"] is True
    assert result["legacy_published_retention"] is True
    assert result["outcome"] == "candidate"


def test_change_record_contains_no_score_or_research_mutation():
    change = _row_change(_row(), _decision(), "score_floor")
    assert change["current_score"] == 72.0
    assert change["score_version"].startswith("public-v4")
    assert "target_score" not in change
    assert "quality" not in change


@pytest.mark.parametrize(("map_ready", "expected_additions"), ((True, 1), (False, 0)))
def test_expansion_reconciliation_dry_run_and_real_share_map_ready_gate(
    tmp_path, map_ready, expected_additions
):
    path = _db(tmp_path)
    _make_auto_publishable(path, map_eligible=map_ready)
    with connect(path) as connection:
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES(?, '70') "
            "ON CONFLICT(key) DO UPDATE SET value='70'",
            (PUBLICATION_THRESHOLD_METADATA_KEY,),
        )
        connection.execute(
            """
            UPDATE public_restaurants
            SET score_version=?, is_published=0, review_status='needs_review',
                review_notes='location_unresolved_or_map_unavailable'
            WHERE place_id='place-1'
            """,
            (QUALITY_PRODUCTION_SCORE_VERSION,),
        )
        connection.execute(
            """
            INSERT INTO public_restaurants (place_id, created_at, updated_at)
            VALUES (?, 'now', 'now')
            """,
            (SANKEI_PLACE_ID,),
        )
        connection.commit()
    manifest = tmp_path / "cohort.json"
    manifest.write_text(
        json.dumps(
            {
                "manifest_version": "deterministic-unseeded-cohort-1",
                "ordered_place_ids": ["place-1"],
                "selected_count": 1,
            }
        ),
        encoding="utf-8",
    )
    paths = {
        name: tmp_path / f"{name}.txt"
        for name in ("summary", "report", "changes")
    }
    dry = run_publication_reconciliation(
        path,
        threshold=70,
        cohort_manifest=manifest,
        dry_run=True,
        backup_path=None,
        summary_path=paths["summary"],
        report_path=paths["report"],
        changes_path=paths["changes"],
    )
    real = run_publication_reconciliation(
        path,
        threshold=70,
        cohort_manifest=manifest,
        dry_run=False,
        backup_path=tmp_path / "backup.db",
        summary_path=paths["summary"],
        report_path=paths["report"],
        changes_path=paths["changes"],
    )
    assert dry["result"]["additions"] == expected_additions
    assert real["result"]["additions"] == expected_additions
    assert dry["cohort_assertion"]["canonical_publishable_cohort_rows"] == (
        ["place-1"] if map_ready else []
    )
    with connect(path) as connection:
        row = connection.execute(
            "SELECT is_published, review_status, product_eligible "
            "FROM public_restaurants WHERE place_id='place-1'"
        ).fetchone()
    assert tuple(row) == (
        expected_additions,
        "auto_published" if map_ready else "needs_review",
        1,
    )


def test_manifest_rejects_duplicate_ids(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            {
                "manifest_version": "quality-v4-promotion-cohort-1",
                "cohort_name": "floor70-prepublication-v4",
                "target_floor": 70,
                "cohort_count": 2,
                "restaurants": [{"place_id": "same"}, {"place_id": "same"}],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="duplicate"):
        _manifest_ids(path)


def test_canonical_dry_run_artifact_proves_expected_reconciliation():
    root = Path(__file__).resolve().parents[1]
    summary = json.loads(
        (root / "data/audits/floor70-publication-reconciliation-dry-run-summary.json").read_text(
            encoding="utf-8"
        )
    )
    manifest = json.loads(
        (root / "data/audits/floor70-prepublication-v4-promotion-cohort.json").read_text(
            encoding="utf-8"
        )
    )
    changes = [
        json.loads(line)
        for line in (
            root / "data/audits/floor70-publication-reconciliation-dry-run-changes.jsonl"
        ).read_text(encoding="utf-8").splitlines()
    ]
    manifest_ids = {row["place_id"] for row in manifest["restaurants"]}
    assert summary["current"]["total"] == 1203
    assert summary["current"]["published"] == 538
    assert summary["current"]["threshold"] == 75
    assert summary["result"] == {
        "stays_published": 538,
        "additions": 313,
        "removals": 0,
        "stays_unpublished": 352,
        "resulting_published": 851,
        "resulting_unpublished": 352,
    }
    assert {row["place_id"] for row in changes} == manifest_ids
    assert all(row["target_is_published"] for row in changes)
    assert summary["cohort_assertion"]["unexpected_additions"] == []
    assert summary["cohort_assertion"]["manifest_rows_missing"] == []
    assert summary["non_score_blocked_at_or_above_threshold"]["published"] == 0
    assert summary["sankei_sushi"]["place_id"] == SANKEI_PLACE_ID
    assert summary["sankei_sushi"]["target_published"] is True
    assert summary["rescue_cohort"]["admitted"] == 0
    assert summary["floor68_v3_population"]["admitted"] == 0
    assert summary["database_sha256_before"] == summary["database_sha256_after"]
    assert summary["invariants"]["score_changes"] == 0
    assert summary["invariants"]["score_version_changes"] == 0
    assert summary["invariants"]["quality_v4_changes"] == 0
