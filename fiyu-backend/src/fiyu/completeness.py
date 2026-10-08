from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .card_enrichment import BudgetInfo, _budget_band, normalize_candidate_budget
from .database import connect, connect_readonly
from .discovery_areas import canonical_tokyo_ward
from .osm_address_normalization import normalize_tokyo_neighborhood, parse_japanese_address
from .pipeline_runs import PIPELINE_RUN_SCHEMA
from .sqlite_snapshot import create_sqlite_backup

CUISINE_TAXONOMY_VERSION = "cuisine-taxonomy-v1"
DISCOVERY_DERIVATION_VERSION = "discovery-area-derivation-v1"
PRICE_NORMALIZATION_VERSION = "price-normalization-v1"
MISSING_BUDGET_SELECTOR_VERSION = "missing-budget-selector-v1"
MISSING_BUDGET_WORK_KEY = "missing-budget-research:price-research-v1"

DETERMINISTIC_BACKFILL_SCHEMA = """
CREATE TABLE IF NOT EXISTS restaurant_cuisine_normalizations (
    public_restaurant_id TEXT PRIMARY KEY,
    raw_cuisine TEXT NOT NULL,
    normalized_cuisine TEXT NOT NULL,
    cuisine_family TEXT NOT NULL,
    food_tags_json TEXT NOT NULL DEFAULT '[]',
    taxonomy_version TEXT NOT NULL,
    provenance_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_cuisine_normalization_taxonomy
    ON restaurant_cuisine_normalizations(taxonomy_version, normalized_cuisine);

CREATE TABLE IF NOT EXISTS deterministic_backfill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_run_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    normalization_version TEXT NOT NULL,
    public_restaurant_id TEXT NOT NULL,
    previous_value_json TEXT NOT NULL,
    new_value_json TEXT NOT NULL,
    provenance_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('applied', 'skipped')),
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id),
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    UNIQUE (operation_type, normalization_version, public_restaurant_id)
);
CREATE INDEX IF NOT EXISTS idx_deterministic_backfill_run
    ON deterministic_backfill_items(pipeline_run_id, operation_type, status);
"""


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(frozen=True)
class CuisineNormalization:
    raw: str | None
    normalized_cuisine: str | None
    cuisine_family: str | None
    food_tags: tuple[str, ...]
    status: str


_CUISINE_RULES: tuple[tuple[tuple[str, ...], str, str, tuple[str, ...]], ...] = (
    (("sushi", "寿司", "鮨"), "sushi", "japanese", ("seafood",)),
    (("izakaya", "居酒屋", "酒場"), "izakaya", "japanese", ("drinks", "small plates")),
    (("yakitori", "焼き鳥", "焼鳥"), "yakitori", "japanese", ("chicken", "skewers")),
    (("yakiniku", "焼肉"), "yakiniku", "japanese", ("grilled meat",)),
    (("ramen", "ラーメン"), "ramen", "japanese", ("noodles",)),
    (("soba", "そば", "蕎麦"), "soba", "japanese", ("noodles",)),
    (("udon", "うどん"), "udon", "japanese", ("noodles",)),
    (("tempura", "天ぷら", "天麩羅"), "tempura", "japanese", ("fried",)),
    (("tonkatsu", "とんかつ", "豚カツ"), "tonkatsu", "japanese", ("pork", "fried")),
    (("unagi", "うなぎ", "鰻"), "unagi", "japanese", ("eel",)),
    (("kaiseki", "懐石", "会席"), "kaiseki", "japanese", ("course dining",)),
    (("teppanyaki", "鉄板焼"), "teppanyaki", "japanese", ("griddle",)),
    (("okonomiyaki", "お好み焼"), "okonomiyaki", "japanese", ("savory pancake",)),
    (("monjayaki", "もんじゃ"), "monjayaki", "japanese", ("savory pancake",)),
    (("shabu", "しゃぶしゃぶ"), "shabu-shabu", "japanese", ("hot pot",)),
    (("sukiyaki", "すき焼"), "sukiyaki", "japanese", ("hot pot",)),
    (("kushiyaki", "串焼"), "kushiyaki", "japanese", ("skewers",)),
    (("fugu", "ふぐ", "河豚"), "fugu", "japanese", ("pufferfish",)),
    (("japanese curry", "カレー"), "japanese curry", "japanese", ("curry",)),
    (("teishoku", "syokudo", "食堂", "定食"), "teishoku", "japanese", ("set meals",)),
    (("japanese", "和食", "日本料理"), "japanese", "japanese", ()),
    (("italian", "イタリア"), "italian", "italian", ()),
    (("pizza", "pizzeria", "ピザ"), "pizza", "italian", ("pizza",)),
    (("french", "フレンチ", "フランス料理"), "french", "french", ()),
    (("bistro", "ビストロ"), "bistro", "french", ()),
    (("chinese", "中華", "中国料理"), "chinese", "chinese", ()),
    (("mandarin",), "chinese", "chinese", ("mandarin",)),
    (("korean", "韓国"), "korean", "korean", ()),
    (("indian", "インド料理"), "indian", "indian", ()),
    (("nepalese", "ネパール"), "nepalese", "nepalese", ()),
    (("thai", "タイ料理"), "thai", "thai", ()),
    (("vietnamese", "ベトナム"), "vietnamese", "vietnamese", ()),
    (("spanish", "スペイン"), "spanish", "spanish", ()),
    (("hamburger", "burger"), "hamburger", "american", ("burger",)),
    (("steak",), "steak", "western", ("beef",)),
    (("seafood", "魚介", "海鮮"), "seafood", "seafood", ("seafood",)),
    (("cafe", "café", "喫茶"), "cafe", "cafe", ("cafe",)),
    (("dessert", "sweets", "甘味"), "dessert", "dessert", ("sweets",)),
)


def normalize_cuisine(raw: str | None) -> CuisineNormalization:
    """Return a conservative, versioned view without altering the raw label."""

    if not raw or not raw.strip():
        return CuisineNormalization(raw, None, None, (), "missing")
    text = " ".join(raw.casefold().replace("＆", "&").split())
    matches = [rule for rule in _CUISINE_RULES if any(token in text for token in rule[0])]
    # A broad family word alongside one more-specific member of that same
    # family (for example "Japanese kaiseki") does not make the label
    # ambiguous. Two specific concepts (for example sushi + izakaya) do.
    specific = [rule for rule in matches if rule[1] != rule[2]]
    if specific:
        matches = [rule for rule in matches if rule[1] != rule[2]]
    distinct = {(rule[1], rule[2]) for rule in matches}
    if not matches:
        return CuisineNormalization(raw, None, None, (), "unmapped")
    if len(distinct) > 1:
        return CuisineNormalization(raw, None, None, (), "ambiguous")
    _, cuisine, family, tags = matches[0]
    extra_tags = set(tags)
    for token, tag in (("edomae", "edomae"), ("omakase", "omakase"), ("offal", "offal")):
        if token in text:
            extra_tags.add(tag)
    return CuisineNormalization(raw, cuisine, family, tuple(sorted(extra_tags)), "mapped")


def _sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def _write_json(path: str | Path | None, payload: object) -> None:
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


def _write_jsonl(path: str | Path | None, rows: list[dict[str, object]]) -> None:
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def _write_report(path: str | Path | None, title: str, payload: dict[str, Any]) -> None:
    if not path:
        return
    if payload.get("mode") == "dry_run":
        mutation_line = "Dry run only. Canonical rows mutated: **0**."
    else:
        applied = payload.get("applied")
        mutation_count = (
            sum(int(value) for value in applied.values())
            if isinstance(applied, dict)
            else 0
        )
        mutation_line = f"Canonical deterministic field updates applied: **{mutation_count}**."
    lines = [f"# {title}", "", mutation_line, ""]
    for key, value in payload.items():
        if isinstance(value, (str, int, float)) or value is None:
            lines.append(f"- {key.replace('_', ' ')}: {value}")
    for key, value in payload.items():
        if isinstance(value, (dict, list)):
            lines.extend(("", f"## {key.replace('_', ' ').title()}", "", "```json", json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2), "```"))
    lines.extend(("", "## Provenance and safety", "", "All proposals derive from stored local evidence. Raw values are preserved; no external requests were made.", ""))
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines), encoding="utf-8")


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _cuisine_rows(db_path: str | Path) -> list[dict[str, Any]]:
    with connect_readonly(db_path) as connection:
        normalized_columns = (
            "n.normalized_cuisine AS stored_normalized_cuisine, "
            "n.cuisine_family AS stored_cuisine_family, "
            "n.food_tags_json AS stored_food_tags_json, "
            "n.taxonomy_version AS stored_taxonomy_version"
            if _table_exists(connection, "restaurant_cuisine_normalizations")
            else "NULL AS stored_normalized_cuisine, NULL AS stored_cuisine_family, "
            "NULL AS stored_food_tags_json, NULL AS stored_taxonomy_version"
        )
        normalized_join = (
            "LEFT JOIN restaurant_cuisine_normalizations n "
            "ON n.public_restaurant_id=p.place_id"
            if _table_exists(connection, "restaurant_cuisine_normalizations")
            else ""
        )
        rows = connection.execute(
            f"""
            SELECT p.place_id, p.name_en, p.primary_category, p.food_tags_json,
                   r.category, r.broad_category, {normalized_columns}
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            {normalized_join}
            WHERE p.is_published=1 ORDER BY p.place_id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def _cuisine_change(row: dict[str, Any], result: CuisineNormalization) -> dict[str, object]:
    return {
        "place_id": row["place_id"],
        "restaurant": row["name_en"],
        "raw_cuisine": result.raw,
        "previous_primary_category": row["primary_category"],
        "proposed_normalized_cuisine": result.normalized_cuisine,
        "proposed_cuisine_family": result.cuisine_family,
        "proposed_food_tags": list(result.food_tags),
        "taxonomy_version": CUISINE_TAXONOMY_VERSION,
        "status": "planned",
    }


def _cuisine_is_current(row: dict[str, Any], result: CuisineNormalization) -> bool:
    if row.get("stored_taxonomy_version") != CUISINE_TAXONOMY_VERSION:
        return False
    try:
        stored_tags = json.loads(row.get("stored_food_tags_json") or "[]")
    except json.JSONDecodeError:
        return False
    return (
        row.get("stored_normalized_cuisine") == result.normalized_cuisine
        and row.get("stored_cuisine_family") == result.cuisine_family
        and stored_tags == list(result.food_tags)
    )


def run_cuisine_dry_run(
    db_path: str | Path,
    *,
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
    changes_path: str | Path | None = None,
) -> dict[str, object]:
    rows = _cuisine_rows(db_path)
    changes: list[dict[str, object]] = []
    raw_counts: Counter[str] = Counter()
    cuisine_counts: Counter[str] = Counter()
    family_counts: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()
    label_status: dict[str, str] = {}
    for row in rows:
        raw = row["primary_category"] or row["category"] or row["broad_category"]
        result = normalize_cuisine(raw)
        status_counts[result.status] += 1
        if raw:
            raw_counts[str(raw)] += 1
            label_status[str(raw)] = result.status
        if result.normalized_cuisine:
            cuisine_counts[result.normalized_cuisine] += 1
        if result.cuisine_family:
            family_counts[result.cuisine_family] += 1
        if result.status == "mapped" and not _cuisine_is_current(row, result):
            changes.append(_cuisine_change(row, result))
    payload: dict[str, object] = {
        "operation": "cuisine-normalize",
        "mode": "dry_run",
        "taxonomy_version": CUISINE_TAXONOMY_VERSION,
        "published_rows": len(rows),
        "raw_distinct_labels": len(raw_counts),
        "normalized_cuisines": len(cuisine_counts),
        "cuisine_families": len(family_counts),
        "mapped_rows": status_counts["mapped"],
        "ambiguous_rows": status_counts["ambiguous"],
        "unmapped_rows": status_counts["unmapped"],
        "missing_rows": status_counts["missing"],
        "mapped_distinct_labels": sum(value == "mapped" for value in label_status.values()),
        "ambiguous_labels": sorted(key for key, value in label_status.items() if value == "ambiguous"),
        "unmapped_labels": sorted(key for key, value in label_status.items() if value == "unmapped"),
        "top_raw_labels": raw_counts.most_common(30),
        "top_normalized_cuisines": cuisine_counts.most_common(30),
        "top_cuisine_families": family_counts.most_common(30),
        "proposed_change_count": len(changes),
        "canonical_mutations": 0,
        "external_requests": 0,
        "canonical_db_sha256": _sha256(db_path),
        "compatibility": "coexistence_only; current primary_category and food_tags remain unchanged",
        "field_source_audit": {
            "raw": "restaurants.category and restaurants.broad_category",
            "current_canonical": "public_restaurants.primary_category and food_tags_json",
            "research": "restaurant_research_runs.structured_research_json",
            "api_usage": "primary_category and food_tags are returned by catalog endpoints",
            "product_usage": "Taste/Picks continue reading current canonical fields in E1",
            "scoring_usage": "normalization output is not used by scoring",
        },
        "fragmentation_classes": ["case/punctuation/provider suffix variants", "English/Japanese synonyms", "specific dish categories", "combined labels", "provider noise", "genuinely distinct cuisines"],
    }
    _write_json(summary_path, payload)
    _write_jsonl(changes_path, changes)
    _write_report(report_path, "Cuisine normalization v1 dry run", payload)
    return payload


def _clean_area(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    area, _ = normalize_tokyo_neighborhood(value)
    area = area.strip(" ,-")
    return area or None


def derive_discovery_area(row: dict[str, Any]) -> dict[str, object]:
    existing = _clean_area(row.get("discovery_area"))
    if existing:
        return {"classification": "current_complete", "area": existing, "method": "existing_dedicated_area", "confidence": 1.0, "area_type": row.get("discovery_area_type") or "unknown"}
    if row.get("discovery_area_conflict"):
        return {"classification": "ambiguous", "area": None, "method": "stored_discovery_conflict", "confidence": 0.0, "area_type": "unknown"}

    address_values = [row.get("verified_address"), row.get("normalized_address"), row.get("address")]
    wards = {parsed.ward for value in address_values if value for parsed in [parse_japanese_address(value)] if parsed.ward}
    city_ward = canonical_tokyo_ward(row.get("verified_ward"), row.get("city"))
    if city_ward:
        wards.add(city_ward)
    if len(wards) > 1:
        return {"classification": "ambiguous", "area": None, "method": "conflicting_stored_wards", "confidence": 0.0, "area_type": "unknown"}

    neighborhood_candidates = [
        (row.get("verified_neighborhood"), "verified_address_neighborhood", 0.95),
        (row.get("neighborhood"), "candidate_neighborhood", 0.85),
    ]
    for value in address_values:
        parsed = parse_japanese_address(value)
        neighborhood_candidates.append((parsed.neighborhood, "stored_address_neighborhood", 0.82))
    ward = next(iter(wards), None)
    for value, method, confidence in neighborhood_candidates:
        area = _clean_area(value)
        if not area:
            continue
        if canonical_tokyo_ward(area) or (ward and area.casefold() == ward.casefold()):
            continue
        if re.fullmatch(r"(?:tokyo|東京都|japan|日本)", area, re.IGNORECASE):
            continue
        return {"classification": "deterministically_derivable", "area": area, "method": method, "confidence": confidence, "area_type": "neighborhood"}
    if ward:
        return {"classification": "lower_precision_derivable", "area": ward, "method": "stored_ward_fallback", "confidence": 0.75, "area_type": "ward"}
    search_area = re.sub(r"\s+Initial$", "", str(row.get("search_area") or ""), flags=re.IGNORECASE).strip()
    ward = canonical_tokyo_ward(search_area)
    if ward:
        return {"classification": "lower_precision_derivable", "area": ward, "method": "reviewed_source_bucket_ward", "confidence": 0.65, "area_type": "ward"}
    return {"classification": "insufficient_data", "area": None, "method": "no_defensible_local_area", "confidence": 0.0, "area_type": "unknown"}


def _published_location_rows(db_path: str | Path) -> list[dict[str, Any]]:
    with connect_readonly(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_en, p.discovery_area, p.discovery_area_type,
                   p.discovery_area_source, p.discovery_area_conflict,
                   p.normalized_address, p.latitude, p.longitude,
                   r.address, r.city, r.neighborhood, r.search_area,
                   v.address_raw AS verified_address,
                   v.municipality_or_ward AS verified_ward,
                   v.neighborhood AS verified_neighborhood
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            LEFT JOIN verified_restaurant_addresses v
              ON v.public_restaurant_id=p.place_id AND v.status='verified'
            WHERE p.is_published=1 ORDER BY p.place_id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def run_discovery_area_dry_run(
    db_path: str | Path,
    *,
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
    changes_path: str | Path | None = None,
) -> dict[str, object]:
    rows = _published_location_rows(db_path)
    counts: Counter[str] = Counter()
    changes: list[dict[str, object]] = []
    for row in rows:
        result = derive_discovery_area(row)
        classification = str(result["classification"])
        counts[classification] += 1
        if classification in {"deterministically_derivable", "lower_precision_derivable"}:
            changes.append({
                "place_id": row["place_id"],
                "restaurant": row["name_en"],
                "previous_discovery_area": row["discovery_area"],
                "proposed_discovery_area": result["area"],
                "proposed_area_type": result["area_type"],
                "classification": classification,
                "derivation_method": result["method"],
                "confidence": result["confidence"],
                "inputs": {key: row.get(key) for key in ("verified_neighborhood", "neighborhood", "verified_address", "normalized_address", "address", "city", "search_area", "latitude", "longitude")},
                "normalization_version": DISCOVERY_DERIVATION_VERSION,
                "status": "planned",
            })
    complete = counts["current_complete"]
    fillable = counts["deterministically_derivable"]
    lower = counts["lower_precision_derivable"]
    unresolved = counts["insufficient_data"]
    conflicts = counts["ambiguous"]
    payload: dict[str, object] = {
        "operation": "discovery-area-backfill",
        "mode": "dry_run",
        "normalization_version": DISCOVERY_DERIVATION_VERSION,
        "published_rows": len(rows),
        "current_complete": complete,
        "current_missing": len(rows) - complete,
        "deterministically_fillable": fillable,
        "lower_precision_fillable": lower,
        "unresolved": unresolved,
        "conflicts": conflicts,
        "projected_complete": complete + fillable + lower,
        "projected_unknown": unresolved + conflicts,
        "proposed_change_count": len(changes),
        "canonical_mutations": 0,
        "external_requests": 0,
        "canonical_db_sha256": _sha256(db_path),
        "discovery_area_definition": "a user-facing Tokyo neighborhood when stored evidence supports it; otherwise the correct ward; never inferred from restaurant attributes",
        "field_source_audit": {
            "raw": "restaurants.address/city/neighborhood/search_area/latitude/longitude",
            "verified": "verified_restaurant_addresses and public_restaurants normalized location columns",
            "canonical": "public_restaurants.discovery_area plus type/source/provenance columns",
            "product_usage": "existing area fallback, map, Picks, and API remain unchanged in E1",
            "evidence_order": ["existing dedicated area", "verified neighborhood", "candidate neighborhood", "stored address neighborhood", "stored ward", "reviewed source-bucket ward", "unknown"],
        },
    }
    _write_json(summary_path, payload)
    _write_jsonl(changes_path, changes)
    _write_report(report_path, "Discovery-area backfill v1 dry run", payload)
    return payload


def _budget_payload(budget: BudgetInfo) -> dict[str, object]:
    return budget.model_dump(mode="json")


def resolve_price_evidence(evidence: list[tuple[str, str | BudgetInfo | None]]) -> dict[str, object]:
    normalized: list[tuple[str, BudgetInfo]] = []
    for source, value in evidence:
        budget = value if isinstance(value, BudgetInfo) else normalize_candidate_budget(value)
        if budget is not None:
            normalized.append((source, budget))
    if not normalized:
        return {"classification": "insufficient_existing_evidence", "budget": None, "rule": "no_parseable_explicit_jpy_evidence", "evidence": []}
    signatures = {(item.minimum, item.maximum, item.band) for _, item in normalized}
    if len(signatures) > 1:
        return {"classification": "conflicting_existing_evidence", "budget": None, "rule": "normalized_explicit_values_disagree", "evidence": [{"source": source, "value": _budget_payload(item)} for source, item in normalized]}
    source, budget = normalized[0]
    return {"classification": "can_normalize_locally", "budget": budget, "rule": f"explicit_jpy_{source}", "evidence": [{"source": key, "value": _budget_payload(item)} for key, item in normalized]}


def _stored_card_budget(raw: str | None) -> BudgetInfo | None:
    try:
        value = json.loads(raw or "{}").get("budget")
        return BudgetInfo.model_validate(value) if value else None
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _published_price_rows(db_path: str | Path) -> list[dict[str, Any]]:
    with connect_readonly(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_en, p.budget_json, p.budget_source_value,
                   p.card_enrichment_json, p.research_status, p.verification_status,
                   r.price
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            WHERE p.is_published=1 ORDER BY p.place_id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def _price_resolution(row: dict[str, Any]) -> dict[str, object]:
    evidence: list[tuple[str, str | BudgetInfo | None]] = [
        ("candidate_price_import", row.get("price")),
        ("stored_card_enrichment", _stored_card_budget(row.get("card_enrichment_json"))),
    ]
    return resolve_price_evidence(evidence)


def run_price_dry_run(
    db_path: str | Path,
    *,
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
    changes_path: str | Path | None = None,
) -> dict[str, object]:
    rows = _published_price_rows(db_path)
    missing = [row for row in rows if not row["budget_json"]]
    counts: Counter[str] = Counter()
    changes: list[dict[str, object]] = []
    for row in missing:
        result = _price_resolution(row)
        classification = str(result["classification"])
        counts[classification] += 1
        budget = result.get("budget")
        if isinstance(budget, BudgetInfo):
            changes.append({
                "place_id": row["place_id"],
                "restaurant": row["name_en"],
                "previous_budget": None,
                "raw_evidence": {"candidate_price": row["price"]},
                "proposed_budget": _budget_payload(budget),
                "classification": classification,
                "derivation_rule": result["rule"],
                "provenance": result["evidence"],
                "normalization_version": PRICE_NORMALIZATION_VERSION,
                "status": "planned",
            })
    local = counts["can_normalize_locally"]
    conflicts = counts["conflicting_existing_evidence"]
    insufficient = counts["insufficient_existing_evidence"]
    current_complete = len(rows) - len(missing)
    payload: dict[str, object] = {
        "operation": "price-normalize",
        "mode": "dry_run",
        "normalization_version": PRICE_NORMALIZATION_VERSION,
        "published_rows": len(rows),
        "current_complete": current_complete,
        "current_missing": len(missing),
        "locally_resolvable": local,
        "conflicts": conflicts,
        "insufficient_existing_evidence": insufficient,
        "projected_complete": current_complete + local,
        "projected_unresolved": conflicts + insufficient,
        "proposed_change_count": len(changes),
        "band_thresholds": {"budget_max": 2000, "moderate_max": 5000, "upscale_max": 10000, "splurge_above": 10000},
        "canonical_mutations": 0,
        "external_requests": 0,
        "canonical_db_sha256": _sha256(db_path),
        "field_source_audit": {
            "raw": "restaurants.price",
            "researched": "public_restaurants.card_enrichment_json.budget and budget provenance",
            "canonical": "public_restaurants.budget_json and budget_source_value",
            "api_usage": "canonical budget only",
            "product_usage": "Daily Picks affordability continues using the existing canonical budget",
            "scoring_usage": "none",
            "provider_price_levels": "no established mapping exists, so non-JPY/provider-level hints remain unresolved",
        },
    }
    _write_json(summary_path, payload)
    _write_jsonl(changes_path, changes)
    _write_report(report_path, "Price normalization v1 dry run", payload)
    return payload


def run_missing_budget_selector(
    db_path: str | Path,
    *,
    summary_path: str | Path | None = None,
) -> dict[str, object]:
    rows = _published_price_rows(db_path)
    selected = []
    excluded_local = 0
    excluded_conflicts = 0
    for row in rows:
        if row["budget_json"]:
            continue
        result = _price_resolution(row)
        if result["classification"] == "can_normalize_locally":
            excluded_local += 1
            continue
        if result["classification"] == "conflicting_existing_evidence":
            excluded_conflicts += 1
            continue
        selected.append(str(row["place_id"]))
    selected.sort()
    selector = {
        "is_published": True,
        "canonical_budget": "missing",
        "deterministic_existing_evidence": "insufficient",
        "identity_state": "existing_current_public_row",
    }
    fingerprint_input = json.dumps(
        {"selector": selector, "items": selected, "work_key": MISSING_BUDGET_WORK_KEY},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    payload: dict[str, object] = {
        "operation": "missing-budget",
        "mode": "dry_run",
        "selector_version": MISSING_BUDGET_SELECTOR_VERSION,
        "future_run_type": "missing_budget_research",
        "future_work_key": MISSING_BUDGET_WORK_KEY,
        "pipeline_run_schema_version": "pipeline-run-ledger-v1",
        "selector": selector,
        "selected_count": len(selected),
        "selected_place_ids": selected,
        "excluded_locally_resolvable": excluded_local,
        "excluded_conflicting": excluded_conflicts,
        "input_fingerprint": hashlib.sha256(fingerprint_input).hexdigest(),
        "ledger_compatibility": "selected IDs can be passed unchanged to create_pipeline_run; no run was created",
        "duplicate_completed_equivalent_research": "future work_key uniqueness excludes succeeded equivalent items",
        "field_specific_research": "existing ledger/claim/provider accounting is reusable; a constrained budget-only prompt/worker is still required for Phase E2",
        "canonical_mutations": 0,
        "external_requests": 0,
        "canonical_db_sha256": _sha256(db_path),
    }
    _write_json(summary_path, payload)
    return payload


def _discovery_changes(db_path: str | Path) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    changes: list[dict[str, object]] = []
    unresolved: list[dict[str, object]] = []
    for row in _published_location_rows(db_path):
        result = derive_discovery_area(row)
        classification = str(result["classification"])
        if classification in {"deterministically_derivable", "lower_precision_derivable"}:
            changes.append({
                "place_id": row["place_id"],
                "restaurant": row["name_en"],
                "previous_discovery_area": row["discovery_area"],
                "proposed_discovery_area": result["area"],
                "proposed_area_type": result["area_type"],
                "classification": classification,
                "derivation_method": result["method"],
                "confidence": result["confidence"],
                "inputs": {key: row.get(key) for key in ("verified_neighborhood", "neighborhood", "verified_address", "normalized_address", "address", "city", "search_area", "latitude", "longitude")},
                "normalization_version": DISCOVERY_DERIVATION_VERSION,
                "status": "planned",
            })
        elif classification == "ambiguous":
            unresolved.append({
                "place_id": row["place_id"],
                "restaurant": row["name_en"],
                "classification": classification,
                "refusal_reason": result["method"],
                "conflicting_evidence": {key: row.get(key) for key in ("discovery_area_conflict", "verified_neighborhood", "neighborhood", "verified_address", "normalized_address", "address", "city", "search_area")},
                "evidence_needed_later": "reviewed identity-matched neighborhood or ward evidence that resolves the stored conflict",
            })
    return changes, unresolved


def _price_changes(db_path: str | Path) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    for row in _published_price_rows(db_path):
        if row["budget_json"]:
            continue
        result = _price_resolution(row)
        budget = result.get("budget")
        if result["classification"] == "can_normalize_locally" and isinstance(budget, BudgetInfo):
            changes.append({
                "place_id": row["place_id"],
                "restaurant": row["name_en"],
                "previous_budget": None,
                "raw_evidence": {"candidate_price": row["price"]},
                "proposed_budget": _budget_payload(budget),
                "classification": result["classification"],
                "derivation_rule": result["rule"],
                "provenance": result["evidence"],
                "normalization_version": PRICE_NORMALIZATION_VERSION,
                "status": "planned",
            })
    return changes


def _cuisine_changes(db_path: str | Path) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    for row in _cuisine_rows(db_path):
        raw = row["primary_category"] or row["category"] or row["broad_category"]
        result = normalize_cuisine(raw)
        if result.status == "mapped" and not _cuisine_is_current(row, result):
            changes.append(_cuisine_change(row, result))
    return changes


def _read_json(path: str | Path) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"expected JSON object: {path}")
    return value


def _read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        value = json.loads(line)
        if not isinstance(value, dict):
            raise TypeError(f"expected JSON object at {path}:{line_number}")
        result.append(value)
    return result


def _cohort_view(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> list[dict[str, Any]]:
    return [{key: row.get(key) for key in keys} for row in rows]


def _validate_audited_cohorts(
    db_path: str | Path,
    *,
    audit_dir: str | Path,
) -> dict[str, Any]:
    audits = Path(audit_dir)
    cuisine_summary = _read_json(audits / "cuisine-normalization-v1-dry-run-summary.json")
    discovery_summary = _read_json(audits / "discovery-area-backfill-v1-dry-run-summary.json")
    price_summary = _read_json(audits / "price-normalization-v1-dry-run-summary.json")
    selector = _read_json(audits / "missing-budget-selector-v1.json")
    expected_counts = {
        "cuisine": int(cuisine_summary.get("proposed_change_count", -1)),
        "discovery_area": int(discovery_summary.get("proposed_change_count", -1)),
        "price": int(price_summary.get("proposed_change_count", -1)),
        "missing_budget": int(selector.get("selected_count", -1)),
    }
    if expected_counts != {"cuisine": 678, "discovery_area": 803, "price": 155, "missing_budget": 73}:
        raise RuntimeError(f"Phase E1 summary hard-stop count mismatch: {expected_counts}")

    recomputed_cuisine = _cuisine_changes(db_path)
    recomputed_discovery, unresolved = _discovery_changes(db_path)
    recomputed_price = _price_changes(db_path)
    audited_cuisine = _read_jsonl(audits / "cuisine-normalization-v1-dry-run-changes.jsonl")
    audited_discovery = _read_jsonl(audits / "discovery-area-backfill-v1-dry-run-changes.jsonl")
    audited_price = _read_jsonl(audits / "price-normalization-v1-dry-run-changes.jsonl")
    comparisons = (
        (
            "cuisine",
            audited_cuisine,
            recomputed_cuisine,
            ("place_id", "raw_cuisine", "proposed_normalized_cuisine", "proposed_cuisine_family", "taxonomy_version"),
        ),
        (
            "discovery_area",
            audited_discovery,
            recomputed_discovery,
            ("place_id", "previous_discovery_area", "proposed_discovery_area", "derivation_method"),
        ),
        (
            "price",
            audited_price,
            recomputed_price,
            ("place_id", "raw_evidence", "proposed_budget", "derivation_rule", "provenance"),
        ),
    )
    parity: dict[str, bool] = {}
    for name, audited, recomputed, keys in comparisons:
        matches = _cohort_view(audited, keys) == _cohort_view(recomputed, keys)
        parity[name] = matches
        if not matches:
            raise RuntimeError(f"Phase E1 {name} cohort drifted from the audited artifact")
    if len(recomputed_cuisine) != 678 or len(recomputed_discovery) != 803 or len(recomputed_price) != 155:
        raise RuntimeError("recomputed Phase E1 cohort counts failed hard-stop expectations")
    if len(unresolved) != 1:
        raise RuntimeError(f"expected one discovery conflict, found {len(unresolved)}")
    return {
        "cuisine": recomputed_cuisine,
        "discovery_area": recomputed_discovery,
        "price": recomputed_price,
        "discovery_unresolved": unresolved,
        "prior_selector": selector,
        "parity": parity,
    }


_ALLOWED_PUBLIC_MUTATIONS = {
    "discovery_area",
    "discovery_area_type",
    "discovery_area_source",
    "discovery_source_file",
    "discovery_source_row",
    "discovery_areas_json",
    "multiple_discovery_areas",
    "budget_json",
    "budget_source_value",
}


def _public_invariant_snapshot(connection: sqlite3.Connection) -> dict[str, str]:
    rows = connection.execute("SELECT * FROM public_restaurants ORDER BY place_id").fetchall()
    result: dict[str, str] = {}
    for source in rows:
        row = dict(source)
        place_id = str(row.pop("place_id"))
        for column in _ALLOWED_PUBLIC_MUTATIONS:
            row.pop(column, None)
        result[place_id] = json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)
    return result


def _table_fingerprint(connection: sqlite3.Connection, table: str) -> str:
    digest = hashlib.sha256()
    for row in connection.execute(f'SELECT * FROM "{table}" ORDER BY rowid'):
        digest.update(json.dumps(list(row), ensure_ascii=False, default=str).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def _protected_table_fingerprints(connection: sqlite3.Connection) -> dict[str, str]:
    mutable = {
        "public_restaurants",
        "pipeline_runs",
        "pipeline_run_items",
        "pipeline_run_item_attempts",
        "restaurant_cuisine_normalizations",
        "deterministic_backfill_items",
        "sqlite_sequence",
    }
    tables = [
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        if str(row[0]) not in mutable
    ]
    return {table: _table_fingerprint(connection, table) for table in sorted(tables)}


def _catalog_state(connection: sqlite3.Connection) -> dict[str, int | str]:
    counts = connection.execute(
        """
        SELECT COUNT(*) AS total, SUM(is_published) AS published,
               SUM(CASE WHEN is_published=0 THEN 1 ELSE 0 END) AS unpublished,
               SUM(CASE WHEN is_published=1 AND budget_json IS NOT NULL THEN 1 ELSE 0 END) AS price_complete,
               SUM(CASE WHEN is_published=1 AND COALESCE(TRIM(discovery_area),'')<>'' THEN 1 ELSE 0 END) AS discovery_complete
        FROM public_restaurants
        """
    ).fetchone()
    threshold = connection.execute(
        "SELECT value FROM metadata WHERE key='publication_score_threshold'"
    ).fetchone()
    normalized = (
        int(connection.execute(
            "SELECT COUNT(*) FROM restaurant_cuisine_normalizations n JOIN public_restaurants p ON p.place_id=n.public_restaurant_id WHERE p.is_published=1 AND n.taxonomy_version=?",
            (CUISINE_TAXONOMY_VERSION,),
        ).fetchone()[0])
        if _table_exists(connection, "restaurant_cuisine_normalizations")
        else 0
    )
    return {
        "total": int(counts["total"]),
        "published": int(counts["published"]),
        "unpublished": int(counts["unpublished"]),
        "price_complete": int(counts["price_complete"]),
        "discovery_complete": int(counts["discovery_complete"]),
        "normalized_cuisine_rows": normalized,
        "threshold": str(threshold[0]) if threshold else "missing",
    }


def _insert_deterministic_run(
    connection: sqlite3.Connection,
    *,
    operation: str,
    version: str,
    changes: list[dict[str, Any]],
    now: str,
) -> int:
    items = [str(change["place_id"]) for change in changes]
    selector = {"source": "phase-e1-audited-cohort", "normalization_version": version}
    config = {"provider_requests": 0, "external_research": False, "mode": "deterministic_apply"}
    work_key = f"deterministic-backfill:{operation}:{version}"
    fingerprint = hashlib.sha256(
        json.dumps(
            {"run_type": operation, "items": items, "work_key": work_key, "selector": selector, "config": config},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    cursor = connection.execute(
        """
        INSERT INTO pipeline_runs (
            run_type, status, selector_json, config_json, schema_version,
            input_fingerprint, requested_item_count, selected_item_count,
            completed_count, provider_request_count, web_search_action_count,
            created_at, started_at, completed_at, operator_notes
        ) VALUES (?, 'completed', ?, ?, 'pipeline-run-ledger-v1', ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
        """,
        (
            operation,
            json.dumps(selector, sort_keys=True, separators=(",", ":")),
            json.dumps(config, sort_keys=True, separators=(",", ":")),
            fingerprint,
            len(items),
            len(items),
            len(items),
            now,
            now,
            now,
            "Phase E1b deterministic local backfill; zero provider requests.",
        ),
    )
    run_id = int(cursor.lastrowid)
    for ordinal, place_id in enumerate(items, 1):
        token = uuid.uuid4().hex
        item_cursor = connection.execute(
            """
            INSERT INTO pipeline_run_items (
                run_id, item_key, place_id, work_key, ordinal, state, attempt_count,
                claim_owner, claim_token, claimed_at, started_at, completed_at,
                retryable, result_reference_json, provider_request_count,
                web_search_action_count
            ) VALUES (?, ?, ?, ?, ?, 'succeeded', 1, 'deterministic-local', ?, ?, ?, ?, 0, ?, 0, 0)
            """,
            (
                run_id,
                place_id,
                place_id,
                work_key,
                ordinal,
                token,
                now,
                now,
                now,
                json.dumps({"operation": operation, "normalization_version": version}, sort_keys=True),
            ),
        )
        connection.execute(
            """
            INSERT INTO pipeline_run_item_attempts (
                run_item_id, attempt_number, claim_owner, claim_token, state,
                claimed_at, lease_expires_at, started_at, completed_at,
                result_reference_json, provider_request_count, web_search_action_count
            ) VALUES (?, 1, 'deterministic-local', ?, 'succeeded', ?, ?, ?, ?, ?, 0, 0)
            """,
            (
                int(item_cursor.lastrowid),
                token,
                now,
                now,
                now,
                now,
                json.dumps({"operation": operation, "normalization_version": version}, sort_keys=True),
            ),
        )
    return run_id


def _record_backfill_item(
    connection: sqlite3.Connection,
    *,
    run_id: int,
    operation: str,
    version: str,
    change: dict[str, Any],
    previous: object,
    new: object,
    provenance: object,
    now: str,
) -> None:
    connection.execute(
        """
        INSERT INTO deterministic_backfill_items (
            pipeline_run_id, operation_type, normalization_version,
            public_restaurant_id, previous_value_json, new_value_json,
            provenance_json, status, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?)
        """,
        (
            run_id,
            operation,
            version,
            change["place_id"],
            json.dumps(previous, ensure_ascii=False, sort_keys=True),
            json.dumps(new, ensure_ascii=False, sort_keys=True),
            json.dumps(provenance, ensure_ascii=False, sort_keys=True),
            now,
            now,
        ),
    )


def _applied_rows(changes: list[dict[str, Any]], run_id: int, now: str) -> list[dict[str, object]]:
    return [dict(change, status="applied", run_id=run_id, completed_at=now) for change in changes]


def run_completeness_apply(
    db_path: str | Path,
    *,
    backup_path: str | Path,
    audit_dir: str | Path = "data/audits",
    seed_path: str | Path = "seed70.txt",
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
) -> dict[str, object]:
    """Apply the three exact Phase E1 cohorts in one guarded transaction."""

    db = Path(db_path)
    audits = Path(audit_dir)
    seed = Path(seed_path)
    before_sha = _sha256(db)
    seed_before = _sha256(seed)
    with connect_readonly(db) as connection:
        initial_state = _catalog_state(connection)
    completed_state = {
        "total": 1203,
        "published": 851,
        "unpublished": 352,
        "price_complete": 778,
        "discovery_complete": 850,
        "normalized_cuisine_rows": 678,
        "threshold": "70",
    }
    if initial_state == completed_state:
        pending = {
            "cuisine": int(run_cuisine_dry_run(db)["proposed_change_count"]),
            "discovery_area": int(run_discovery_area_dry_run(db)["proposed_change_count"]),
            "price": int(run_price_dry_run(db)["proposed_change_count"]),
        }
        selector = run_missing_budget_selector(db)
        if pending != {"cuisine": 0, "discovery_area": 0, "price": 0}:
            raise RuntimeError(f"completed-state idempotency check failed: {pending}")
        if int(selector["selected_count"]) != 73:
            raise RuntimeError("completed-state selector count is not 73")
        result: dict[str, object] = {
            "operation": "completeness-e1b-apply",
            "status": "completed_no_op",
            "applied": {"cuisine": 0, "discovery_area": 0, "price": 0},
            "after": initial_state,
            "idempotency_pending": pending,
            "phase_e2_selector": {"count": 73},
            "database": {
                "canonical_sha256_before": before_sha,
                "canonical_sha256_after": before_sha,
                "seed70_sha256_before": seed_before,
                "seed70_sha256_after": _sha256(seed),
                "backup_path": None,
                "backup_required": False,
            },
            "external_requests": 0,
        }
        _write_json(summary_path, result)
        if report_path:
            _write_report(report_path, "Completeness E1b deterministic apply", result)
        return result
    cohorts = _validate_audited_cohorts(db, audit_dir=audits)

    with connect_readonly(db) as connection:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("canonical database integrity check failed before apply")
        before_state = _catalog_state(connection)
        before_public = _public_invariant_snapshot(connection)
        before_protected = _protected_table_fingerprints(connection)
    if before_state != {
        "total": 1203,
        "published": 851,
        "unpublished": 352,
        "price_complete": 623,
        "discovery_complete": 47,
        "normalized_cuisine_rows": 0,
        "threshold": "70",
    }:
        raise RuntimeError(f"canonical pre-apply state failed hard-stop expectations: {before_state}")

    backup = create_sqlite_backup(db, backup_path)
    now = _utc_now()
    applied: dict[str, list[dict[str, object]]] = {}
    run_ids: dict[str, int] = {}
    with connect(db) as connection:
        try:
            connection.execute("PRAGMA foreign_keys=ON")
            connection.executescript(PIPELINE_RUN_SCHEMA)
            connection.executescript(DETERMINISTIC_BACKFILL_SCHEMA)
            connection.execute("BEGIN IMMEDIATE")

            cuisine_changes = cohorts["cuisine"]
            cuisine_run = _insert_deterministic_run(
                connection,
                operation="cuisine_normalization",
                version=CUISINE_TAXONOMY_VERSION,
                changes=cuisine_changes,
                now=now,
            )
            run_ids["cuisine"] = cuisine_run
            for change in cuisine_changes:
                new_value = {
                    "normalized_cuisine": change["proposed_normalized_cuisine"],
                    "cuisine_family": change["proposed_cuisine_family"],
                    "food_tags": change["proposed_food_tags"],
                    "taxonomy_version": CUISINE_TAXONOMY_VERSION,
                }
                connection.execute(
                    """
                    INSERT INTO restaurant_cuisine_normalizations (
                        public_restaurant_id, raw_cuisine, normalized_cuisine,
                        cuisine_family, food_tags_json, taxonomy_version,
                        provenance_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        change["place_id"],
                        change["raw_cuisine"],
                        change["proposed_normalized_cuisine"],
                        change["proposed_cuisine_family"],
                        json.dumps(change["proposed_food_tags"], ensure_ascii=False),
                        CUISINE_TAXONOMY_VERSION,
                        json.dumps({"source": "stored_public_and_candidate_category", "raw_cuisine": change["raw_cuisine"]}, ensure_ascii=False, sort_keys=True),
                        now,
                        now,
                    ),
                )
                _record_backfill_item(
                    connection,
                    run_id=cuisine_run,
                    operation="cuisine_normalization",
                    version=CUISINE_TAXONOMY_VERSION,
                    change=change,
                    previous={"normalized_cuisine": None, "cuisine_family": None},
                    new=new_value,
                    provenance={"raw_cuisine": change["raw_cuisine"], "previous_primary_category": change["previous_primary_category"]},
                    now=now,
                )
            cuisine_count = connection.execute(
                "SELECT COUNT(*) FROM restaurant_cuisine_normalizations WHERE taxonomy_version=?",
                (CUISINE_TAXONOMY_VERSION,),
            ).fetchone()[0]
            if int(cuisine_count) != 678:
                raise RuntimeError(f"cuisine apply count mismatch: {cuisine_count}")
            applied["cuisine"] = _applied_rows(cuisine_changes, cuisine_run, now)

            discovery_changes = cohorts["discovery_area"]
            discovery_run = _insert_deterministic_run(
                connection,
                operation="discovery_area_backfill",
                version=DISCOVERY_DERIVATION_VERSION,
                changes=discovery_changes,
                now=now,
            )
            run_ids["discovery_area"] = discovery_run
            for change in discovery_changes:
                occurrence = [{
                    "area": change["proposed_discovery_area"],
                    "area_type": change["proposed_area_type"],
                    "source": "deterministic_backfill",
                    "normalization_version": DISCOVERY_DERIVATION_VERSION,
                    "method": change["derivation_method"],
                }]
                cursor = connection.execute(
                    """
                    UPDATE public_restaurants
                    SET discovery_area=?, discovery_area_type=?,
                        discovery_area_source='deterministic_backfill',
                        discovery_source_file=?, discovery_source_row=NULL,
                        discovery_areas_json=?, multiple_discovery_areas=0
                    WHERE place_id=? AND COALESCE(TRIM(discovery_area),'')=''
                    """,
                    (
                        change["proposed_discovery_area"],
                        change["proposed_area_type"],
                        f"{DISCOVERY_DERIVATION_VERSION}:{change['derivation_method']}",
                        json.dumps(occurrence, ensure_ascii=False, sort_keys=True),
                        change["place_id"],
                    ),
                )
                if cursor.rowcount != 1:
                    raise RuntimeError(f"discovery update lost compare-and-set: {change['place_id']}")
                new_value = {"discovery_area": change["proposed_discovery_area"], "area_type": change["proposed_area_type"]}
                _record_backfill_item(
                    connection,
                    run_id=discovery_run,
                    operation="discovery_area_backfill",
                    version=DISCOVERY_DERIVATION_VERSION,
                    change=change,
                    previous={"discovery_area": change["previous_discovery_area"]},
                    new=new_value,
                    provenance={"method": change["derivation_method"], "confidence": change["confidence"], "inputs": change["inputs"]},
                    now=now,
                )
            discovery_count = connection.execute(
                "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 AND COALESCE(TRIM(discovery_area),'')<>''"
            ).fetchone()[0]
            if int(discovery_count) != 850:
                raise RuntimeError(f"discovery apply count mismatch: {discovery_count}")
            applied["discovery_area"] = _applied_rows(discovery_changes, discovery_run, now)

            price_changes = cohorts["price"]
            price_run = _insert_deterministic_run(
                connection,
                operation="price_normalization",
                version=PRICE_NORMALIZATION_VERSION,
                changes=price_changes,
                now=now,
            )
            run_ids["price"] = price_run
            for change in price_changes:
                budget = change["proposed_budget"]
                cursor = connection.execute(
                    """
                    UPDATE public_restaurants
                    SET budget_json=?, budget_source_value=?
                    WHERE place_id=? AND budget_json IS NULL
                    """,
                    (
                        json.dumps(budget, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                        change["raw_evidence"]["candidate_price"],
                        change["place_id"],
                    ),
                )
                if cursor.rowcount != 1:
                    raise RuntimeError(f"price update lost compare-and-set: {change['place_id']}")
                _record_backfill_item(
                    connection,
                    run_id=price_run,
                    operation="price_normalization",
                    version=PRICE_NORMALIZATION_VERSION,
                    change=change,
                    previous={"budget": change["previous_budget"]},
                    new={"budget": budget},
                    provenance={"rule": change["derivation_rule"], "evidence": change["provenance"]},
                    now=now,
                )
            price_count = connection.execute(
                "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1 AND budget_json IS NOT NULL"
            ).fetchone()[0]
            if int(price_count) != 778:
                raise RuntimeError(f"price apply count mismatch: {price_count}")
            applied["price"] = _applied_rows(price_changes, price_run, now)

            after_public_in_tx = _public_invariant_snapshot(connection)
            if after_public_in_tx != before_public:
                raise RuntimeError("protected public score/publication/product fields changed")
            after_protected_in_tx = _protected_table_fingerprints(connection)
            if after_protected_in_tx != before_protected:
                raise RuntimeError("raw, research, or user-data table changed during apply")
            connection.commit()
        except BaseException:
            connection.rollback()
            raise

    after_sha = _sha256(db)
    seed_after = _sha256(seed)
    if before_sha == after_sha:
        raise RuntimeError("canonical DB SHA did not change after non-empty apply")
    if seed_before != seed_after:
        raise RuntimeError("seed70.txt changed during completeness apply")

    post_selector_path = audits / "missing-budget-selector-v1-post-backfill.json"
    post_selector = run_missing_budget_selector(db, summary_path=post_selector_path)
    prior_ids = list(cohorts["prior_selector"]["selected_place_ids"])
    selector_parity = prior_ids == list(post_selector["selected_place_ids"])
    if post_selector["selected_count"] != 73 or not selector_parity:
        raise RuntimeError("post-backfill missing-budget selector failed exact 73-row parity")

    _write_json(audits / "discovery-area-unresolved-v1.json", {
        "normalization_version": DISCOVERY_DERIVATION_VERSION,
        "unresolved_count": len(cohorts["discovery_unresolved"]),
        "rows": cohorts["discovery_unresolved"],
        "external_requests": 0,
    })
    _write_jsonl(audits / "cuisine-normalization-v1-applied.jsonl", applied["cuisine"])
    _write_jsonl(audits / "discovery-area-backfill-v1-applied.jsonl", applied["discovery_area"])
    _write_jsonl(audits / "price-normalization-v1-applied.jsonl", applied["price"])

    with connect_readonly(db) as connection:
        final_state = _catalog_state(connection)
        integrity = str(connection.execute("PRAGMA integrity_check").fetchone()[0])
        foreign_key_violations = len(connection.execute("PRAGMA foreign_key_check").fetchall())
        duplicate_public = int(connection.execute(
            "SELECT COUNT(*) FROM (SELECT place_id FROM public_restaurants GROUP BY place_id HAVING COUNT(*)>1)"
        ).fetchone()[0])
        pointer_violations = int(connection.execute(
            "SELECT COUNT(*) FROM public_restaurants WHERE source_restaurant_id IS NOT NULL AND source_restaurant_id NOT IN (SELECT id FROM restaurants)"
        ).fetchone()[0])
        final_public = _public_invariant_snapshot(connection)
        final_protected = _protected_table_fingerprints(connection)
    if final_state != {
        "total": 1203,
        "published": 851,
        "unpublished": 352,
        "price_complete": 778,
        "discovery_complete": 850,
        "normalized_cuisine_rows": 678,
        "threshold": "70",
    }:
        raise RuntimeError(f"canonical post-apply state failed expectations: {final_state}")
    if final_public != before_public or final_protected != before_protected:
        raise RuntimeError("post-commit invariant fingerprint mismatch")
    if integrity != "ok" or foreign_key_violations or duplicate_public or pointer_violations:
        raise RuntimeError("post-apply SQLite integrity checks failed")

    pending = {
        "cuisine": int(run_cuisine_dry_run(db)["proposed_change_count"]),
        "discovery_area": int(run_discovery_area_dry_run(db)["proposed_change_count"]),
        "price": int(run_price_dry_run(db)["proposed_change_count"]),
    }
    if pending != {"cuisine": 0, "discovery_area": 0, "price": 0}:
        raise RuntimeError(f"post-apply idempotency check failed: {pending}")

    summary: dict[str, object] = {
        "operation": "completeness-e1b-apply",
        "status": "completed",
        "applied_at": now,
        "run_ids": run_ids,
        "applied": {key: len(value) for key, value in applied.items()},
        "audit_cohort_parity": cohorts["parity"],
        "before": before_state,
        "after": final_state,
        "product_parity": {
            "protected_public_rows": len(final_public),
            "public_score_parity": len(final_public),
            "score_version_parity": len(final_public),
            "publication_parity": len(final_public),
            "score_changes": 0,
            "publication_changes": 0,
            "picks_algorithm_changed": False,
            "taste_inputs_changed": False,
            "api_schema_changed": False,
            "note": "canonical price completeness can make additional restaurants eligible for the existing affordable-slot rule; the algorithm and threshold are unchanged",
        },
        "phase_e2_selector": {"count": post_selector["selected_count"], "exact_prior_set_parity": selector_parity, "artifact": str(post_selector_path)},
        "idempotency_pending": pending,
        "database": {
            "canonical_sha256_before": before_sha,
            "canonical_sha256_after": after_sha,
            "backup_path": str(Path(backup_path)),
            "backup_sha256": str(backup["sha256"]).upper(),
            "backup_integrity": backup["integrity"],
            "seed70_sha256_before": seed_before,
            "seed70_sha256_after": seed_after,
            "integrity_check": integrity,
            "foreign_key_violations": foreign_key_violations,
            "duplicate_public_place_ids": duplicate_public,
            "invalid_source_restaurant_pointers": pointer_violations,
        },
        "external_requests": 0,
    }
    _write_json(summary_path, summary)
    if report_path:
        _write_report(report_path, "Completeness E1b deterministic apply", summary)
    return summary


def price_band_for_bounds(minimum: int | None, maximum: int | None) -> str:
    """Public wrapper used to assert parity with the existing canonical thresholds."""

    return _budget_band(minimum, maximum)
