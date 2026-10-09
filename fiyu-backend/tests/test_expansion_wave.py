from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

import pytest

from fiyu import expansion_wave
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema


def _db(tmp_path: Path, count: int = 3) -> Path:
    path = tmp_path / "catalog.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.executemany(
            """
            INSERT INTO restaurants (
                place_id, title, rating, review_count, internal_fiyu_score,
                quality_score, underexposure_score, digital_footprint_score,
                candidate_eligible, source_areas_json, source_files_json
            ) VALUES (?, ?, 4.4, 20, ?, 75, 75, 75, 1, '[]', '[]')
            """,
            [(f"place-{index:03d}", f"Place {index}", 60 + index / 10) for index in range(count)],
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES ('publication_score_threshold', '70') "
            "ON CONFLICT(key) DO UPDATE SET value='70'"
        )
        connection.commit()
    return path


def _indexes(tmp_path: Path) -> tuple[Path, Path]:
    poi = tmp_path / "poi.db"
    address = tmp_path / "address.db"
    with sqlite3.connect(poi) as connection:
        connection.execute("CREATE TABLE osm_locations (osm_id TEXT)")
    with sqlite3.connect(address) as connection:
        connection.execute("CREATE TABLE osm_addresses (osm_id TEXT)")
        connection.execute("CREATE TABLE osm_address_areas (osm_id TEXT)")
    return poi, address


def _dry_run(tmp_path: Path, *, count: int = 3, seed: str = "wave-1") -> tuple[Path, dict]:
    db = _db(tmp_path, count=count)
    poi, address = _indexes(tmp_path)
    result = expansion_wave.run_expansion_wave(
        db,
        count=count,
        min_score=60,
        seed=seed,
        osm_index=poi,
        osm_address_index=address,
        output_dir=tmp_path / seed,
        dry_run=True,
    )
    return db, result


def test_exact_frozen_cohort_is_used_for_exact_seed(tmp_path, monkeypatch):
    db = _db(tmp_path, 2)
    poi, address = _indexes(tmp_path)
    calls: list[tuple[bool, list[str] | None]] = []

    def seed(*_args, dry_run=False, place_ids=None, **_kwargs):
        calls.append((dry_run, place_ids))
        if dry_run:
            return {
                "dry_run": True,
                "eligible_unseeded_pool_before": 2,
                "requested_count": 2,
                "selected_count": 2,
                "seeded_count": 0,
                "already_existing_race_skips": 0,
                "eligible_unseeded_pool_remaining": 2,
                "seed": "wave",
                "min_score": 60,
                "fewer_than_requested": False,
                "selected_place_ids": ["place-002", "place-001"],
                "selected_candidates": [
                    {"place_id": "place-002", "internal_score": 70},
                    {"place_id": "place-001", "internal_score": 65},
                ],
                "selector_fingerprint": "fingerprint",
            }
        return {"seeded_count": 2, "already_existing_race_skips": 0}

    monkeypatch.setattr(expansion_wave, "seed_unseeded_public_queue", seed)
    monkeypatch.setattr(expansion_wave, "_cohort_seeded_count", lambda *_args: 0)
    monkeypatch.setattr(
        expansion_wave,
        "create_sqlite_backup",
        lambda *_args: {"integrity": "ok"},
    )
    monkeypatch.setattr(expansion_wave, "_write_json", expansion_wave._write_json)
    monkeypatch.setattr(
        expansion_wave,
        "run_research_batch",
        lambda *_args, **kwargs: (_ for _ in ()).throw(RuntimeError(str(kwargs["place_ids"]))),
    )
    with pytest.raises(RuntimeError, match="place-002.*place-001"):
        expansion_wave.run_expansion_wave(
            db,
            count=2,
            min_score=60,
            seed="wave",
            osm_index=poi,
            osm_address_index=address,
            output_dir=tmp_path / "wave",
        )
    assert calls == [(True, None), (False, ["place-002", "place-001"])]


def test_resume_uses_frozen_manifest_without_selector_drift(tmp_path, monkeypatch):
    db, _ = _dry_run(tmp_path, seed="wave-resume")
    poi, address = tmp_path / "poi.db", tmp_path / "address.db"
    monkeypatch.setattr(
        expansion_wave,
        "seed_unseeded_public_queue",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("selector reran")),
    )
    result = expansion_wave.run_expansion_wave(
        db,
        count=3,
        min_score=60,
        seed="wave-resume",
        osm_index=poi,
        osm_address_index=address,
        output_dir=tmp_path / "wave-resume",
        dry_run=True,
        resume=True,
    )
    assert result["frozen"] == 3


def test_unresolved_identity_is_a_nonfatal_promotion_exclusion():
    frozen = {
        "manifest_version": expansion_wave.MANIFEST_VERSION,
        "cohort_id": "wave",
        "ordered_place_ids": ["a", "b"],
        "selected_candidates": [
            {"place_id": "a", "internal_score": 70},
            {"place_id": "b", "internal_score": 71},
        ],
        "selected_count": 2,
        "dry_run": True,
        "min_score": 60,
    }
    result = expansion_wave._promotion_manifest(
        frozen, ["a"], {"exclusions_by_reason": {"unresolved_identity": 1}}
    )
    assert result["ordered_place_ids"] == ["a"]
    assert result["excluded_from_promotion"] == 1
    assert result["quality_v4_exclusions_by_reason"] == {"unresolved_identity": 1}


def test_promotion_subset_only_contains_completed_v4_in_original_order():
    frozen = {
        "manifest_version": expansion_wave.MANIFEST_VERSION,
        "cohort_id": "wave",
        "ordered_place_ids": ["c", "a", "b"],
        "selected_candidates": [
            {"place_id": value, "internal_score": 70} for value in ["c", "a", "b"]
        ],
        "selected_count": 3,
        "dry_run": True,
        "min_score": 60,
    }
    result = expansion_wave._promotion_manifest(
        frozen, ["c", "b"], {"exclusions_by_reason": {"unresolved_identity": 1}}
    )
    assert result["ordered_place_ids"] == ["c", "b"]
    assert [row["place_id"] for row in result["selected_candidates"]] == ["c", "b"]


def test_reconciliation_refuses_removals():
    with pytest.raises(RuntimeError, match="removals"):
        expansion_wave._assert_reconciliation_plan(
            {
                "result": {"removals": 1},
                "cohort_assertion": {"unexpected_additions": [], "manifest_rows_missing": []},
                "invariants": {"unrelated_additions": 0},
            }
        )


def test_reconciliation_refuses_unexpected_additions():
    with pytest.raises(RuntimeError, match="unexpected_additions"):
        expansion_wave._assert_reconciliation_plan(
            {
                "result": {"removals": 0},
                "cohort_assertion": {
                    "unexpected_additions": ["outside"],
                    "manifest_rows_missing": [],
                },
                "invariants": {"unrelated_additions": 1},
            }
        )


def test_reconciliation_refuses_missing_manifest_rows():
    with pytest.raises(RuntimeError, match="missing_additions"):
        expansion_wave._assert_reconciliation_plan(
            {
                "result": {"removals": 0},
                "cohort_assertion": {
                    "unexpected_additions": [],
                    "manifest_rows_missing": ["missing"],
                },
                "invariants": {"unrelated_additions": 0},
            }
        )


def test_historical_pending_backlog_is_untouched_by_dry_run(tmp_path):
    db = _db(tmp_path, 3)
    with connect(db) as connection:
        connection.execute(
            "INSERT INTO public_restaurants(place_id, research_status, created_at, updated_at) "
            "VALUES ('old-pending', 'pending', 'now', 'now')"
        )
        connection.commit()
    poi, address = _indexes(tmp_path)
    expansion_wave.run_expansion_wave(
        db,
        count=3,
        min_score=60,
        seed="backlog-wave",
        osm_index=poi,
        osm_address_index=address,
        output_dir=tmp_path / "backlog-wave",
        dry_run=True,
    )
    with connect(db) as connection:
        assert connection.execute(
            "SELECT research_status FROM public_restaurants WHERE place_id='old-pending'"
        ).fetchone()[0] == "pending"


def test_dry_run_makes_no_database_mutations(tmp_path):
    db = _db(tmp_path, 3)
    poi, address = _indexes(tmp_path)
    before = hashlib.sha256(db.read_bytes()).hexdigest()
    result = expansion_wave.run_expansion_wave(
        db,
        count=3,
        min_score=60,
        seed="dry-wave",
        osm_index=poi,
        osm_address_index=address,
        output_dir=tmp_path / "dry-wave",
        dry_run=True,
    )
    assert hashlib.sha256(db.read_bytes()).hexdigest() == before
    assert result["external_requests"] == result["database_mutations"] == 0


def test_dry_run_computes_baseline_against_live_wal_database(tmp_path):
    db = _db(tmp_path, 3)
    poi, address = _indexes(tmp_path)
    writer = sqlite3.connect(db)
    try:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute(
            "INSERT INTO metadata(key, value) VALUES ('wal-regression-test', 'committed')"
        )
        writer.commit()
        before = writer.execute("SELECT COUNT(*) FROM public_restaurants").fetchone()[0]

        result = expansion_wave.run_expansion_wave(
            db,
            count=3,
            min_score=60,
            seed="wal-dry-wave",
            osm_index=poi,
            osm_address_index=address,
            output_dir=tmp_path / "wal-dry-wave",
            dry_run=True,
        )

        after = writer.execute("SELECT COUNT(*) FROM public_restaurants").fetchone()[0]
        assert result["baseline"]["sqlite_integrity"] == "ok"
        assert result["external_requests"] == 0
        assert result["database_mutations"] == 0
        assert after == before
    finally:
        writer.close()


def test_count_100_dry_run_path(tmp_path):
    _, result = _dry_run(tmp_path, count=100, seed="wave-100")
    assert result["frozen"] == 100


def test_missing_osm_path_fails_before_artifact_or_database_mutation(tmp_path):
    db = _db(tmp_path, 1)
    before = hashlib.sha256(db.read_bytes()).hexdigest()
    with pytest.raises(FileNotFoundError, match="OSM POI index"):
        expansion_wave.run_expansion_wave(
            db,
            count=1,
            min_score=60,
            seed="missing-index",
            osm_index=tmp_path / "missing.db",
            osm_address_index=tmp_path / "also-missing.db",
            output_dir=tmp_path / "missing-wave",
            dry_run=True,
        )
    assert not (tmp_path / "missing-wave").exists()
    assert hashlib.sha256(db.read_bytes()).hexdigest() == before


def test_existing_artifact_directory_requires_resume(tmp_path):
    db = _db(tmp_path, 1)
    poi, address = _indexes(tmp_path)
    output = tmp_path / "existing-wave"
    output.mkdir()
    with pytest.raises(FileExistsError, match="--resume"):
        expansion_wave.run_expansion_wave(
            db,
            count=1,
            min_score=60,
            seed="existing-wave",
            osm_index=poi,
            osm_address_index=address,
            output_dir=output,
            dry_run=True,
        )


@pytest.mark.parametrize(
    ("count", "min_score", "message"),
    [(0, 60, "count"), (1, 59.9, "min-score"), (101, 60, "count")],
)
def test_invalid_wave_bounds_fail_closed(tmp_path, count, min_score, message):
    db = _db(tmp_path, 1)
    poi, address = _indexes(tmp_path)
    with pytest.raises(ValueError, match=message):
        expansion_wave.run_expansion_wave(
            db,
            count=count,
            min_score=min_score,
            seed="bounds-wave",
            osm_index=poi,
            osm_address_index=address,
            output_dir=tmp_path / "bounds-wave",
            dry_run=True,
        )


def test_promotion_dry_run_requires_exact_parity_and_identity_counts():
    good = {
        "cohort_ids": 2,
        "source_complete_v4_rows": 2,
        "source_incomplete_rows": 0,
        "matched_canonical_identities": 2,
        "missing_canonical_identities": 0,
        "shadow_production_mismatches": 0,
        "unrelated_rows_selected": 0,
    }
    expansion_wave._assert_promotion_plan(good, 2)
    with pytest.raises(RuntimeError, match="shadow_production_mismatches"):
        expansion_wave._assert_promotion_plan(
            {**good, "shadow_production_mismatches": 1}, 2
        )


def test_sqlite_integrity_is_recorded_as_ok(tmp_path):
    _, result = _dry_run(tmp_path, count=2, seed="integrity-wave")
    assert result["baseline"]["sqlite_integrity"] == "ok"


def test_final_count_invariants_and_resume_do_not_duplicate_paid_work(
    tmp_path, monkeypatch
):
    db = _db(tmp_path, 2)
    poi, address = _indexes(tmp_path)
    output = tmp_path / "complete-wave"
    calls = {"research": 0, "quality": 0}
    quality_done = False

    monkeypatch.setattr(
        expansion_wave,
        "create_sqlite_backup",
        lambda *_args: {"integrity": "ok"},
    )

    def run_research(*_args, **_kwargs):
        calls["research"] += 1
        return {"run_id": 7, "run_status": research_status()}

    def research_status(*_args, **_kwargs):
        return {
            "run_id": 7,
            "pending": 0,
            "claimed": 0,
            "running": 0,
            "failed_retryable": 0,
            "failed_terminal": 0,
            "succeeded": 2,
            "skipped": 0,
            "provider_requests": 2,
            "web_search_actions": 2,
            "input_tokens": 20,
            "output_tokens": 10,
            "total_tokens": 30,
        }

    monkeypatch.setattr(expansion_wave, "run_research_batch", run_research)
    monkeypatch.setattr(expansion_wave, "get_pipeline_run_status", research_status)
    monkeypatch.setattr(expansion_wave, "_recover_research_run", lambda *_args: None)

    def locations(db_path, **kwargs):
        ids = kwargs["place_ids"]
        with connect(db_path) as connection:
            connection.executemany(
                "UPDATE public_restaurants SET latitude=35.0, longitude=139.0, "
                "map_display_eligible=1 WHERE place_id=?",
                [(place_id,) for place_id in ids],
            )
            connection.commit()
        return {
            "cohort_size": 2,
            "map_ready_before": 0,
            "map_ready_after": 2,
            "map_ineligible_after": 0,
            "method_distribution": {"area_anchor": 2},
            "missing_after": 0,
            "conflicts": 0,
            "responses_api_calls": 0,
            "web_search_calls": 0,
            "external_geocoding_calls": 0,
        }

    monkeypatch.setattr(expansion_wave, "backfill_legacy_published_locations", locations)

    def inspect_quality(*_args, **_kwargs):
        return {
            "eligible_pending": 0 if quality_done else 1,
            "already_complete": 1 if quality_done else 0,
            "blocked_existing_statuses": {},
            "excluded": 1,
            "exclusions_by_reason": {"unresolved_identity": 1},
        }

    def run_quality(*_args, **_kwargs):
        nonlocal quality_done
        calls["quality"] += 1
        quality_done = True
        return {
            "completed": 1,
            "failed": 0,
            "needs_retry": 0,
            "responses_requests": 1,
            "web_search_actions": 1,
            "token_usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        }

    monkeypatch.setattr(expansion_wave, "inspect_quality_v4_backfill", inspect_quality)
    monkeypatch.setattr(expansion_wave, "run_quality_v4_backfill", run_quality)

    promoted_id: list[str] = []

    def latest(_db_path, place_ids):
        promoted_id[:] = place_ids[:1]
        return {place_ids[0]: "complete"}

    monkeypatch.setattr(expansion_wave, "_latest_quality_statuses", latest)

    def promotion(*_args, **kwargs):
        if kwargs["dry_run"]:
            return {
                "cohort_ids": 1,
                "source_complete_v4_rows": 1,
                "source_incomplete_rows": 0,
                "matched_canonical_identities": 1,
                "missing_canonical_identities": 0,
                "shadow_production_mismatches": 0,
                "unrelated_rows_selected": 0,
            }
        return {"promoted": 1}

    monkeypatch.setattr(expansion_wave, "run_quality_v4_promotion", promotion)

    def reconcile(db_path, **kwargs):
        summary = {
            "result": {"additions": 1, "removals": 0},
            "cohort_assertion": {
                "unexpected_additions": [],
                "manifest_rows_missing": [],
            },
            "invariants": {"unrelated_additions": 0},
        }
        if not kwargs["dry_run"]:
            with connect(db_path) as connection:
                connection.execute(
                    "UPDATE public_restaurants SET is_published=1 WHERE place_id=?",
                    (promoted_id[0],),
                )
                connection.commit()
        return summary

    monkeypatch.setattr(expansion_wave, "run_publication_reconciliation", reconcile)
    monkeypatch.setattr(
        expansion_wave,
        "_quality_usage_totals",
        lambda *_args: {
            "responses_requests": 1,
            "web_search_actions": 1,
            "input_tokens": 10,
            "output_tokens": 5,
            "total_tokens": 15,
        },
    )

    result = expansion_wave.run_expansion_wave(
        db,
        count=2,
        min_score=60,
        seed="complete-wave",
        osm_index=poi,
        osm_address_index=address,
        output_dir=output,
    )
    assert result["seeded"] == 2
    assert result["published_additions"] == 1
    assert result["quality_v4"] == {
        "completed": 1,
        "excluded": 1,
        "exclusions_by_reason": {"unresolved_identity": 1},
    }

    rerun = expansion_wave.run_expansion_wave(
        db,
        count=2,
        min_score=60,
        seed="complete-wave",
        osm_index=poi,
        osm_address_index=address,
        output_dir=output,
        resume=True,
    )
    assert rerun["published_additions"] == 1
    assert calls == {"research": 1, "quality": 1}

