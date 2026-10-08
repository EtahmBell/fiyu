from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

import pytest

from fiyu.card_enrichment import normalize_candidate_budget
from fiyu.completeness import (
    CUISINE_TAXONOMY_VERSION,
    derive_discovery_area,
    normalize_cuisine,
    price_band_for_bounds,
    resolve_price_evidence,
    run_cuisine_dry_run,
    run_discovery_area_dry_run,
    run_missing_budget_selector,
    run_price_dry_run,
)
from fiyu.pipeline_cli import main


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _db(tmp_path: Path) -> Path:
    path = tmp_path / "catalog.db"
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE restaurants (
                place_id TEXT PRIMARY KEY, category TEXT, broad_category TEXT,
                price TEXT, address TEXT, city TEXT, neighborhood TEXT,
                search_area TEXT, latitude REAL, longitude REAL
            );
            CREATE TABLE public_restaurants (
                place_id TEXT PRIMARY KEY, name_en TEXT, primary_category TEXT,
                food_tags_json TEXT, is_published INTEGER, budget_json TEXT,
                budget_source_value TEXT, card_enrichment_json TEXT,
                research_status TEXT, verification_status TEXT,
                discovery_area TEXT, discovery_area_type TEXT,
                discovery_area_source TEXT, discovery_area_conflict INTEGER,
                normalized_address TEXT, latitude REAL, longitude REAL
            );
            CREATE TABLE verified_restaurant_addresses (
                public_restaurant_id TEXT PRIMARY KEY, address_raw TEXT,
                municipality_or_ward TEXT, neighborhood TEXT, status TEXT
            );
            """
        )
        restaurants = [
            ("a", "Sushi restaurant", "Japanese", "¥1,000–2,000", "東京都渋谷区恵比寿1-1", "Shibuya", "Ebisu", "Shibuya Initial", 1.0, 2.0),
            ("b", "French-Italian restaurant", "Western", None, None, "Minato", None, "Minato Initial", 1.0, 2.0),
            ("c", "Mystery", "Other", None, None, None, None, None, None, None),
            ("d", "Ramen restaurant", "Japanese", "¥2,000–3,000", "東京都新宿区歌舞伎町1-1", "Shinjuku", "Kabukicho", "Shinjuku Initial", 1.0, 2.0),
        ]
        connection.executemany("INSERT INTO restaurants VALUES (?,?,?,?,?,?,?,?,?,?)", restaurants)
        public = [
            ("a", "A", "Sushi restaurant", "[]", 1, None, None, "{}", "complete", "verified", None, None, None, 0, "東京都渋谷区恵比寿1-1", 1.0, 2.0),
            ("b", "B", "French-Italian restaurant", "[]", 1, None, None, "{}", "complete", "verified", None, None, None, 0, None, 1.0, 2.0),
            ("c", "C", "Mystery", "[]", 1, None, None, "{}", "complete", "verified", None, None, None, 0, None, None, None),
            ("d", "D", "Ramen restaurant", "[]", 1, '{"currency":"JPY"}', None, "{}", "complete", "verified", "Kabukicho", "neighborhood", "reviewed", 0, "東京都新宿区歌舞伎町1-1", 1.0, 2.0),
        ]
        connection.executemany("INSERT INTO public_restaurants VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", public)
    return path


def test_cuisine_synonym_normalization():
    assert normalize_cuisine("Sushi Restaurant").normalized_cuisine == "sushi"


def test_cuisine_japanese_synonym_normalization():
    assert normalize_cuisine("寿司").normalized_cuisine == "sushi"


def test_cuisine_raw_value_is_preserved():
    assert normalize_cuisine("SUSHI").raw == "SUSHI"


def test_cuisine_version_is_independent():
    assert CUISINE_TAXONOMY_VERSION == "cuisine-taxonomy-v1"


def test_cuisine_ambiguous_label_is_not_guessed():
    result = normalize_cuisine("French-Italian restaurant")
    assert result.status == "ambiguous" and result.normalized_cuisine is None


def test_cuisine_specific_label_wins_over_family_word():
    assert normalize_cuisine("Japanese kaiseki restaurant").normalized_cuisine == "kaiseki"


def test_cuisine_unknown_remains_unmapped():
    assert normalize_cuisine("Mystery restaurant").status == "unmapped"


def test_cuisine_normalization_is_idempotent():
    first = normalize_cuisine("Sushi restaurant").normalized_cuisine
    assert normalize_cuisine(first).normalized_cuisine == first


def test_discovery_trusted_explicit_mapping():
    result = derive_discovery_area({"discovery_area": "Ebisu", "discovery_area_type": "neighborhood"})
    assert result["classification"] == "current_complete"


def test_discovery_verified_neighborhood_derivation():
    result = derive_discovery_area({"verified_neighborhood": "恵比寿"})
    assert result["area"] == "恵比寿"


def test_discovery_address_fallback():
    result = derive_discovery_area({"normalized_address": "東京都渋谷区恵比寿1-1"})
    assert result["area"] == "恵比寿"


def test_discovery_lower_precision_ward_fallback():
    result = derive_discovery_area({"city": "Shibuya"})
    assert result["classification"] == "lower_precision_derivable"


def test_discovery_conflict_handling():
    result = derive_discovery_area({"discovery_area_conflict": 1})
    assert result["classification"] == "ambiguous"


def test_discovery_unknown_remains_unknown():
    assert derive_discovery_area({})["classification"] == "insufficient_data"


def test_discovery_derivation_is_idempotent():
    first = derive_discovery_area({"neighborhood": "Ebisu"})
    second = derive_discovery_area({"discovery_area": first["area"], "discovery_area_type": first["area_type"]})
    assert second["area"] == first["area"]


@pytest.mark.parametrize(
    ("raw", "minimum", "maximum"),
    [("¥1,000–2,000", 1000, 2000), ("1,000円～2,000円", 1000, 2000), ("Under ¥2,000", 0, 2000), ("2,000円以上", 2000, None)],
)
def test_price_yen_formats(raw, minimum, maximum):
    result = normalize_candidate_budget(raw)
    assert result and (result.minimum, result.maximum) == (minimum, maximum)


def test_price_without_currency_is_not_invented():
    assert normalize_candidate_budget("1000-2000") is None


def test_price_conflict_handling():
    result = resolve_price_evidence([("lunch", "¥1,000–2,000"), ("dinner", "¥5,000–6,000")])
    assert result["classification"] == "conflicting_existing_evidence"


def test_price_matching_lunch_dinner_is_safe():
    result = resolve_price_evidence([("lunch", "¥1,000–2,000"), ("dinner", "1,000円–2,000円")])
    assert result["classification"] == "can_normalize_locally"


def test_price_unknown_remains_unknown():
    assert resolve_price_evidence([("raw", None)])["classification"] == "insufficient_existing_evidence"


@pytest.mark.parametrize("bounds,band", [((0, 2000), "budget"), ((1000, 5000), "moderate"), ((5000, 10000), "upscale"), ((10000, None), "splurge")])
def test_price_band_parity(bounds, band):
    assert price_band_for_bounds(*bounds) == band


def test_dry_runs_make_zero_database_mutation(tmp_path):
    db = _db(tmp_path)
    before = _hash(db)
    run_cuisine_dry_run(db)
    run_discovery_area_dry_run(db)
    run_price_dry_run(db)
    run_missing_budget_selector(db)
    assert _hash(db) == before


def test_selector_excludes_locally_resolvable_and_complete_rows(tmp_path):
    result = run_missing_budget_selector(_db(tmp_path))
    assert result["selected_place_ids"] == ["b", "c"]
    assert result["excluded_locally_resolvable"] == 1


def test_artifacts_are_deterministic(tmp_path):
    db = _db(tmp_path)
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    assert run_price_dry_run(db, summary_path=first) == run_price_dry_run(db, summary_path=second)
    assert first.read_bytes() == second.read_bytes()


def test_score_and_publication_columns_are_untouched(tmp_path):
    db = _db(tmp_path)
    before = sqlite3.connect(db).execute("SELECT place_id,is_published FROM public_restaurants ORDER BY place_id").fetchall()
    run_price_dry_run(db)
    after = sqlite3.connect(db).execute("SELECT place_id,is_published FROM public_restaurants ORDER BY place_id").fetchall()
    assert after == before


def test_canonical_cli_integration(tmp_path):
    db = _db(tmp_path)
    output = tmp_path / "selector.json"
    assert main(["--db", str(db), "missing-budget", "--dry-run", "--summary-out", str(output)], canonical=True) == 0
    assert json.loads(output.read_text(encoding="utf-8"))["selected_count"] == 2
