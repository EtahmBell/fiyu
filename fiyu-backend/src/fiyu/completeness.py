from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .card_enrichment import BudgetInfo, _budget_band, normalize_candidate_budget
from .database import connect_readonly
from .discovery_areas import canonical_tokyo_ward
from .osm_address_normalization import normalize_tokyo_neighborhood, parse_japanese_address

CUISINE_TAXONOMY_VERSION = "cuisine-taxonomy-v1"
DISCOVERY_DERIVATION_VERSION = "discovery-area-derivation-v1"
PRICE_NORMALIZATION_VERSION = "price-normalization-v1"
MISSING_BUDGET_SELECTOR_VERSION = "missing-budget-selector-v1"
MISSING_BUDGET_WORK_KEY = "missing-budget-research:price-research-v1"


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
    lines = [f"# {title}", "", "Dry run only. Canonical rows mutated: **0**.", ""]
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


def run_cuisine_dry_run(
    db_path: str | Path,
    *,
    summary_path: str | Path | None = None,
    report_path: str | Path | None = None,
    changes_path: str | Path | None = None,
) -> dict[str, object]:
    with connect_readonly(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.place_id, p.name_en, p.primary_category, p.food_tags_json,
                   r.category, r.broad_category
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            WHERE p.is_published=1 ORDER BY p.place_id
            """
        ).fetchall()
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
        if result.status == "mapped":
            changes.append({
                "place_id": row["place_id"],
                "restaurant": row["name_en"],
                "raw_cuisine": raw,
                "previous_primary_category": row["primary_category"],
                "proposed_normalized_cuisine": result.normalized_cuisine,
                "proposed_cuisine_family": result.cuisine_family,
                "proposed_food_tags": list(result.food_tags),
                "taxonomy_version": CUISINE_TAXONOMY_VERSION,
                "status": "planned",
            })
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


def price_band_for_bounds(minimum: int | None, maximum: int | None) -> str:
    """Public wrapper used to assert parity with the existing canonical thresholds."""

    return _budget_band(minimum, maximum)
