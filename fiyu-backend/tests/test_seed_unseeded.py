from __future__ import annotations

import json
import sys

from fiyu.database import SCHEMA, connect
from fiyu.pipeline_cli import main as pipeline_main
from fiyu.public_catalog import ensure_public_schema, seed_unseeded_public_queue


def _db(tmp_path, *, eligible_count: int = 12):
    path = tmp_path / "seed-unseeded.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        for index in range(eligible_count):
            connection.execute(
                """
                INSERT INTO restaurants (
                    place_id, title, search_area, source_areas_json, category,
                    rating, review_count, candidate_eligible, internal_fiyu_score,
                    source_files_json, score_reasons_json
                ) VALUES (?, ?, ?, ?, ?, 4.3, 25, 1, ?, '[]', '[]')
                """,
                (
                    f"eligible-{index:02d}",
                    f"Restaurant {index:02d}",
                    "Shibuya" if index % 2 else "Taito",
                    json.dumps(["Shibuya" if index % 2 else "Taito"]),
                    "Sushi" if index % 2 else "Izakaya",
                    60.0 + index,
                ),
            )
        connection.executemany(
            """
            INSERT INTO restaurants (
                place_id, title, rating, review_count, candidate_eligible,
                internal_fiyu_score, source_areas_json, source_files_json,
                score_reasons_json
            ) VALUES (?, ?, 4.2, 20, ?, ?, '[]', '[]', '[]')
            """,
            (
                ("below-score", "Below score", 1, 59.99),
                ("ineligible", "Ineligible", 0, 95.0),
                ("", "Blank ID", 1, 95.0),
                (None, "Missing ID", 1, 95.0),
            ),
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        source_id = connection.execute(
            "SELECT id FROM restaurants WHERE place_id='eligible-00'"
        ).fetchone()[0]
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, source_restaurant_id, name_en, primary_category,
                research_status, review_status, is_published,
                fiyu_score, created_at, updated_at
            ) VALUES (
                'eligible-00', ?, 'Existing Restaurant', 'Izakaya',
                'complete', 'auto_published', 1, 88, 'old-created', 'old-updated'
            )
            """,
            (source_id,),
        )
        connection.commit()
    return path


def _existing_row(path):
    with connect(path) as connection:
        return dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id='eligible-00'"
            ).fetchone()
        )


def test_selection_excludes_seeded_ineligible_low_score_and_blank_ids(tmp_path):
    path = _db(tmp_path)
    result = seed_unseeded_public_queue(
        path, limit=100, min_internal_score=60, seed="fixed", dry_run=True
    )

    assert result["eligible_unseeded_pool_before"] == 11
    assert set(result["selected_place_ids"]) == {
        f"eligible-{index:02d}" for index in range(1, 12)
    }
    assert "eligible-00" not in result["selected_place_ids"]
    assert "below-score" not in result["selected_place_ids"]
    assert "ineligible" not in result["selected_place_ids"]
    assert "" not in result["selected_place_ids"]


def test_limit_and_deterministic_seed_order(tmp_path):
    path = _db(tmp_path, eligible_count=30)
    first = seed_unseeded_public_queue(
        path, limit=8, min_internal_score=60, seed="20261002", dry_run=True
    )
    second = seed_unseeded_public_queue(
        path, limit=8, min_internal_score=60, seed="20261002", dry_run=True
    )
    different = seed_unseeded_public_queue(
        path, limit=8, min_internal_score=60, seed="another-seed", dry_run=True
    )

    assert first["selected_count"] == 8
    assert first["selected_place_ids"] == second["selected_place_ids"]
    assert first["selected_place_ids"] != different["selected_place_ids"]


def test_dry_run_makes_zero_database_changes(tmp_path):
    path = _db(tmp_path)
    before_bytes = path.read_bytes()
    before_existing = _existing_row(path)

    result = seed_unseeded_public_queue(
        path, limit=5, min_internal_score=60, seed=20261002, dry_run=True
    )

    assert result["seeded_count"] == 0
    assert result["eligible_unseeded_pool_remaining"] == 11
    assert path.read_bytes() == before_bytes
    assert _existing_row(path) == before_existing
    with connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM public_restaurants").fetchone()[0] == 1


def test_real_run_creates_only_normal_pending_rows_and_preserves_existing(tmp_path):
    path = _db(tmp_path)
    before_existing = _existing_row(path)

    result = seed_unseeded_public_queue(
        path, limit=5, min_internal_score=60, seed="wave-1"
    )

    assert result["selected_count"] == result["seeded_count"] == 5
    assert result["already_existing_race_skips"] == 0
    assert result["eligible_unseeded_pool_remaining"] == 6
    assert _existing_row(path) == before_existing
    with connect(path) as connection:
        rows = connection.execute(
            """
            SELECT research_status, review_status, is_published
            FROM public_restaurants WHERE place_id!='eligible-00'
            """
        ).fetchall()
    assert len(rows) == 5
    assert {tuple(row) for row in rows} == {("pending", "candidate", 0)}


def test_rerun_selects_next_rows_without_duplicates(tmp_path):
    path = _db(tmp_path)
    first = seed_unseeded_public_queue(path, limit=5, seed="same-seed")
    second = seed_unseeded_public_queue(path, limit=5, seed="same-seed")

    assert not set(first["selected_place_ids"]).intersection(second["selected_place_ids"])
    assert second["seeded_count"] == 5
    with connect(path) as connection:
        rows = connection.execute(
            "SELECT place_id, COUNT(*) FROM public_restaurants GROUP BY place_id"
        ).fetchall()
    assert all(row[1] == 1 for row in rows)


def test_request_over_remaining_seeds_all_and_reports_shortfall(tmp_path):
    path = _db(tmp_path, eligible_count=4)
    result = seed_unseeded_public_queue(path, limit=500, seed="all")

    assert result["eligible_unseeded_pool_before"] == 3
    assert result["selected_count"] == result["seeded_count"] == 3
    assert result["eligible_unseeded_pool_remaining"] == 0
    assert result["fewer_than_requested"] is True


def test_cli_dry_run_writes_optional_manifest_but_not_database(
    tmp_path, monkeypatch, capsys
):
    path = _db(tmp_path)
    manifest = tmp_path / "manifests" / "wave.json"
    before_bytes = path.read_bytes()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "pipeline_cli",
            "--db",
            str(path),
            "seed-unseeded",
            "--limit",
            "4",
            "--min-score",
            "60",
            "--seed",
            "manifest-seed",
            "--dry-run",
            "--manifest-out",
            str(manifest),
        ],
    )

    pipeline_main()

    output = json.loads(capsys.readouterr().out)
    saved = json.loads(manifest.read_text(encoding="utf-8"))
    assert output["selected_count"] == 4
    assert saved["selected_place_ids"] == output["selected_place_ids"]
    assert path.read_bytes() == before_bytes
