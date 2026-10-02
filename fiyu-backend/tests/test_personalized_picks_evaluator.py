from __future__ import annotations

import json
import sqlite3

from fiyu.daily_picks import ensure_daily_picks_schema
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.restaurant_lists import ensure_restaurant_list_schema
from fiyu.restaurant_visits import ensure_restaurant_visit_schema
from scripts.evaluate_personalized_picks import STATE_TABLES, evaluate, render_markdown
from scripts.evaluate_personalized_picks_progression import evaluate_progression
from scripts.evaluate_personalized_picks_progression import (
    render_markdown as render_progression_markdown,
)


def _state_rows(path) -> dict[str, list[tuple[object, ...]]]:
    with sqlite3.connect(path) as connection:
        return {
            table: connection.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
            for table in STATE_TABLES
        }


def _evaluation_database(tmp_path):
    path = tmp_path / "evaluation.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(path)
    ensure_restaurant_visit_schema(path)
    ensure_restaurant_list_schema(path)
    ensure_daily_picks_schema(path)

    categories = ("sushi", "izakaya", "ramen", "French", "yakitori", "Italian")
    with connect(path) as connection:
        for index in range(30):
            budget_maximum = 2000 if index % 3 == 0 else 8000 if index % 3 == 1 else 4500
            budget_band = "budget" if budget_maximum <= 3000 else "splurge"
            practical = {
                "seating": {
                    "counter": index % 2 == 0,
                    "tables": index % 2 == 1,
                    "small_capacity": index % 4 == 0,
                },
                "visit_style": {
                    "solo_friendly": index % 2 == 0,
                    "group_friendly": index % 2 == 1,
                    "date_friendly": index % 5 == 0,
                },
            }
            connection.execute(
                """
                INSERT INTO public_restaurants (
                    place_id, name_en, primary_category, food_tags_json,
                    signature_dishes_json, discovery_area, discovery_areas_json,
                    fiyu_score, local_discovery_score, is_published,
                    product_eligible, map_display_eligible, latitude, longitude,
                    map_location_precision, budget_json, practical_info_json,
                    review_themes_json, created_at, updated_at
                ) VALUES (?, ?, ?, '[]', '[]', 'Shibuya', '[]', ?, ?, 1, 1, 1,
                          ?, ?, 'exact', ?, ?, '[]', 'now', 'now')
                """,
                (
                    f"place-{index:02d}",
                    f"Restaurant {index:02d}",
                    categories[index % len(categories)],
                    float(65 + index % 25),
                    float(35 - index % 25),
                    35.658,
                    139.7016 + (index % 10) * 0.001,
                    json.dumps(
                        {
                            "currency": "JPY",
                            "minimum": 1000,
                            "maximum": budget_maximum,
                            "band": budget_band,
                        }
                    ),
                    json.dumps(practical),
                ),
            )

        connection.execute(
            """
            INSERT INTO restaurant_visits
                (id, owner_id, place_id, visited_at, reaction, rating, private_note,
                 created_at, updated_at)
            VALUES ('visit-1', 'private-owner', 'place-00', '2026-01-01', 'love_it', 5,
                    'must remain private', '2026-01-01', '2026-01-01')
            """
        )
        cursor = connection.execute(
            """
            INSERT INTO restaurant_lists
                (owner_id, city_id, name, list_kind, created_at, updated_at)
            VALUES ('private-owner', 'tokyo', 'Saved', 'default', '2026-01-01', '2026-01-01')
            """
        )
        connection.execute(
            """
            INSERT INTO restaurant_list_items (list_id, place_id, added_at)
            VALUES (?, 'place-01', '2026-01-01')
            """,
            (cursor.lastrowid,),
        )
        connection.execute(
            """
            INSERT INTO daily_pick_rounds
                (id, owner_id, city_id, assigned_at, expires_at, revealed_at,
                 selection_metadata_json)
            VALUES ('round-1', 'private-owner', 'tokyo', '2026-01-01', '2099-01-01',
                    '2026-01-01', '{"revealed_place_ids":["place-02"]}')
            """
        )
        connection.execute(
            """
            INSERT INTO daily_pick_round_items (round_id, position, restaurant_place_id)
            VALUES ('round-1', 1, 'place-02')
            """
        )
        connection.execute(
            """
            INSERT INTO daily_pick_served_history
                (owner_id, restaurant_place_id, first_served_at, last_served_at,
                 served_count, selection_round_id)
            VALUES ('private-owner', 'place-02', '2026-01-01', '2026-01-01', 1, 'round-1')
            """
        )
        connection.commit()
    return path


def test_evaluator_is_deterministic_and_does_not_mutate_user_state(tmp_path):
    path = _evaluation_database(tmp_path)
    before = _state_rows(path)

    first = evaluate(path, cycles=2, seed_base=9000)
    second = evaluate(path, cycles=2, seed_base=9000)

    assert first == second
    assert first["methodology"]["persistent_state_unchanged"] is True
    assert first["methodology"]["source_opened_read_only"] is True
    assert len(first["profiles"]) == 6
    assert all(len(profile["cycles"]) == 2 for profile in first["profiles"])
    assert all(
        len(cycle["picks"]) == 3
        for profile in first["profiles"]
        for cycle in profile["cycles"]
    )
    profiles = {profile["profile_id"]: profile for profile in first["profiles"]}
    sparse_positive = dict(
        profiles["Profile B — sparse sushi/counter"]["summary"]["positive_facets"]
    )
    expensive = profiles["Profile D — mature expensive"]["summary"]
    both_prices = profiles["Profile F — likes affordable and expensive"]["summary"]
    assert sparse_positive["cuisine_sushi"] > 0
    assert expensive["higher_price_affinity"] > 0
    assert expensive["affordable_affinity"] < 0
    assert expensive["relaxation"] > 0
    assert both_prices["affordable_affinity"] > 0
    assert both_prices["higher_price_affinity"] > 0
    assert _state_rows(path) == before


def test_evaluator_report_is_pseudonymous_and_contains_required_views(tmp_path):
    report = evaluate(_evaluation_database(tmp_path), cycles=1, seed_base=9100)
    markdown = render_markdown(report)

    assert "Profile A — no history" in markdown
    assert "Legacy mean Fiyu / affinity" in markdown
    assert "Cross-profile observations" in markdown
    assert "Affordability" in markdown
    assert "Exploration" in markdown
    assert "private-owner" not in markdown
    assert "must remain private" not in markdown


def test_progression_uses_temporary_history_and_preserves_source_state(tmp_path):
    path = _evaluation_database(tmp_path)
    before = _state_rows(path)

    report = evaluate_progression(path, cycles=10, seed_base=9200)

    assert report["methodology"]["persistent_state_unchanged"] is True
    assert len(report["profiles"]) == 6
    assert all(len(profile["cycles"]) == 10 for profile in report["profiles"])
    assert all(
        profile["summary"]["unique_restaurants"] == 30
        for profile in report["profiles"]
    )
    assert all(
        profile["summary"]["first_repeat_cycle"] is None
        for profile in report["profiles"]
    )
    probe = report["cooldown_probes"]
    assert probe["unseen_preferred"] is True
    assert probe["recent_blocked"] is True
    assert probe["old_unused_while_three_unseen"] is True
    assert probe["old_used_for_fallback"] is True
    assert probe["saved_excluded"] is True
    assert probe["affordability_did_not_bypass_recent"] is True
    assert probe["personalization_did_not_bypass_recent"] is True
    assert _state_rows(path) == before


def test_progression_report_contains_rotation_and_facet_evidence(tmp_path):
    report = evaluate_progression(
        _evaluation_database(tmp_path), cycles=10, seed_base=9300
    )
    markdown = render_progression_markdown(report)

    assert "Cooldown verification" in markdown
    assert "Facet frequency and specificity" in markdown
    assert "Correlated-facet amplification evidence" in markdown
    assert "Distinctive-signal dilution evidence" in markdown
    assert "Same-seed legacy progression" in markdown
    assert "High-price affordability counterfactual" in markdown
    assert "private-owner" not in markdown
    assert "must remain private" not in markdown
