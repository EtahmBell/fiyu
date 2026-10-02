"""Read-only structural audit of Fiyu's current Taste feature space."""
from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import statistics
from collections import Counter
from contextlib import closing
from itertools import combinations, pairwise
from pathlib import Path
from typing import Any

from fiyu.taste_affinity import UserTasteProfile, build_user_taste_profile
from fiyu.user_fiyu_summary import restaurant_taste_facets

try:
    from scripts.evaluate_personalized_picks import _table_fingerprints
except ModuleNotFoundError:  # Direct `python scripts/...` execution.
    from evaluate_personalized_picks import _table_fingerprints  # type: ignore[no-redef]

CATALOG_QUERY = """
SELECT place_id, name_ja, name_en, primary_category, food_tags_json,
       signature_dishes_json, review_themes_json, practical_info_json,
       opening_hours_json, hours_display, hours_confidence, budget_json,
       reservation_status, booking_methods_json, discovery_area,
       local_discovery_score, local_discovery_classification,
       tourist_visibility_classification, fiyu_score
FROM public_restaurants
WHERE is_published = 1 AND product_eligible = 1 AND map_display_eligible = 1
ORDER BY place_id
"""

FORMAT_FACETS = {"counter_seating", "small_capacity", "private_rooms", "table_dining"}
VISIT_FACETS = {"solo_friendly", "group_friendly", "date_friendly", "special_occasion"}
ATMOSPHERE_FACETS = {"intimate", "lively", "quiet", "casual", "refined"}
PRICE_FACETS = {"budget", "moderate", "upscale", "splurge"}
CORRELATED_FORMAT = {"counter_seating", "small_capacity", "solo_friendly"}
CUISINE_FACETS = {
    "cuisine_sushi",
    "cuisine_french",
    "cuisine_italian",
    "cuisine_chinese",
    "cuisine_indian",
    "cuisine_okinawan",
    "cuisine_thai",
    "cuisine_korean",
    "izakaya",
}

PROVENANCE = {
    **{key: "practical_info.seating" for key in FORMAT_FACETS},
    "solo_friendly": "practical_info.visit_style",
    "group_friendly": "practical_info.visit_style",
    "date_friendly": "practical_info.visit_style",
    "reservation_heavy": "practical_info.reservation",
    **{key: "canonical budget.band" for key in PRICE_FACETS},
    **{key: "primary category text" for key in CUISINE_FACETS},
    "noodles": "primary category and/or validated review theme",
    "grilled": "primary category and/or validated review theme",
    "seafood": "primary category and/or validated review theme",
}

DIMENSIONS = (
    {
        "name": "Price posture",
        "left": ("budget", "moderate"),
        "right": ("upscale", "splurge"),
        "poles": "value-oriented ↔ splurge-comfortable",
    },
    {
        "name": "Dining format",
        "left": ("counter_seating", "small_capacity", "solo_friendly"),
        "right": ("table_dining", "group_friendly", "private_rooms"),
        "poles": "compact/counter ↔ table/social",
    },
    {
        "name": "Formality",
        "left": ("casual", "neighbourhood"),
        "right": ("refined", "reservation_heavy", "tasting_course", "special_occasion"),
        "poles": "casual/everyday ↔ refined/occasion-led",
    },
    {
        "name": "Room energy",
        "left": ("intimate", "quiet"),
        "right": ("lively",),
        "poles": "intimate/quiet ↔ lively",
    },
    {
        "name": "Culinary posture",
        "left": ("traditional", "regional"),
        "right": ("creative", "chef_led"),
        "poles": "traditional/regional ↔ creative/chef-led",
    },
    {
        "name": "Visit mode",
        "left": ("solo_friendly",),
        "right": ("group_friendly", "date_friendly", "special_occasion"),
        "poles": "solo-oriented ↔ social/occasion-oriented",
    },
)

PROFILE_INTERPRETATIONS = {
    "A — narrow sushi/counter lover": (
        "Cuisine focus is coherent, but sushi's catalog coupling to seafood, counter, and small "
        "capacity makes food identity and format hard to disentangle."
    ),
    "B — broad high-rating user": (
        "Breadth is coherent across cuisine, format, price, and atmosphere; uniformly positive "
        "ratings make directional axes weak, which is appropriate rather than a failure."
    ),
    "C — refined/splurge user": (
        "Price posture is coherent, but `refined` itself is too sparsely populated to carry the "
        "profile; splurge/date/reservation signals do most of the work."
    ),
    "D — casual/value user": (
        "Value is coherent. Casual/everyday meaning is entangled with budget, neighbourhood, and "
        "common visit-format facets."
    ),
    "E — intimate/quiet user": (
        "The intended atmosphere appears, but limited quiet/intimate coverage also pulls in date, "
        "small-room, and price signals."
    ),
    "F — lively/group user": (
        "Group orientation is measurable; lively is not. With only one lively restaurant, this "
        "profile is effectively a group-friendly diagnostic and should not validate an energy axis."
    ),
    "G — cheap ramen plus expensive omakase": (
        "The two-pole price preference is coherent and demonstrates why one bipolar price scalar "
        "would misdescribe users who positively value both ends."
    ),
    "H — broad Taste with counter preference": (
        "Counter preference is coherent, but correlated small-capacity and solo terms amplify it; "
        "breadth must remain separate from format concentration."
    ),
}


def _decode(raw: object, expected: type, fallback: object) -> object:
    try:
        value = json.loads(str(raw or "null"))
    except (TypeError, json.JSONDecodeError):
        return fallback
    return value if isinstance(value, expected) else fallback


def _current_row(source: sqlite3.Row) -> dict[str, Any]:
    row = dict(source)
    row["food_tags"] = _decode(row.pop("food_tags_json"), list, [])
    row["signature_dishes"] = _decode(row.pop("signature_dishes_json"), list, [])
    row["review_themes"] = _decode(row.pop("review_themes_json"), list, [])
    row["practical_info"] = _decode(row.pop("practical_info_json"), dict, {})
    row["opening_hours"] = _decode(row.pop("opening_hours_json"), dict, {})
    row["budget"] = _decode(row.pop("budget_json"), dict, None)
    row["booking_methods"] = _decode(row.pop("booking_methods_json"), list, [])
    return row


def _accepted_cuisine_research(connection: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    tables = {
        str(row[0])
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    if "description_research_runs" not in tables:
        return {}
    rows = connection.execute(
        """
        SELECT public_restaurant_id, restaurant_type_en, cuisine_terms_en_json
        FROM (
            SELECT public_restaurant_id, restaurant_type_en, cuisine_terms_en_json,
                   ROW_NUMBER() OVER (
                       PARTITION BY public_restaurant_id ORDER BY created_at DESC, id DESC
                   ) AS rank
            FROM description_research_runs WHERE status = 'accepted'
        ) WHERE rank = 1
        """
    ).fetchall()
    return {
        str(row["public_restaurant_id"]): {
            "restaurant_type_en": row["restaurant_type_en"],
            "cuisine_terms_en": _decode(row["cuisine_terms_en_json"], list, []),
        }
        for row in rows
    }


def _facet_sets(rows: list[dict[str, Any]]) -> dict[str, set[str]]:
    return {
        str(row["place_id"]): {facet.key for facet in restaurant_taste_facets(row)}
        for row in rows
    }


def _family_by_facet(rows: list[dict[str, Any]]) -> dict[str, str]:
    families: dict[str, str] = {}
    for row in rows:
        for facet in restaurant_taste_facets(row):
            families[facet.key] = facet.family
    return families


def _specificity(share: float) -> str:
    if share > 0.50:
        return "very common"
    if share >= 0.25:
        return "common"
    if share >= 0.10:
        return "moderate"
    if share >= 0.02:
        return "distinctive"
    return "rare"


def _reliability(facet: str, provenance: str, count: int) -> str:
    if count < 5:
        return "very sparse; unstable prevalence"
    if provenance == "validated review theme":
        return "depends on theme extraction and review coverage"
    if "category" in provenance:
        return "regex/category coverage; taxonomy is intentionally narrow"
    if "practical_info" in provenance:
        return "structured enrichment; missing values mean unknown, not false"
    return "canonical structured field; missing values still reduce coverage"


def _facet_inventory(
    rows: list[dict[str, Any]], facets_by_place: dict[str, set[str]]
) -> list[dict[str, object]]:
    counts = Counter(facet for facets in facets_by_place.values() for facet in facets)
    families = _family_by_facet(rows)
    inventory = []
    for facet, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        provenance = PROVENANCE.get(facet, "validated review theme")
        share = count / len(rows)
        inventory.append(
            {
                "facet": facet,
                "family": families.get(facet, "unknown"),
                "count": count,
                "share": share,
                "specificity": _specificity(share),
                "provenance": provenance,
                "reliability": _reliability(facet, provenance, count),
            }
        )
    return inventory


def _phi(a_count: int, b_count: int, both: int, total: int) -> float:
    neither = total - a_count - b_count + both
    a_only = a_count - both
    b_only = b_count - both
    denominator = math.sqrt(a_count * (total - a_count) * b_count * (total - b_count))
    return (both * neither - a_only * b_only) / denominator if denominator else 0.0


def _correlations(
    facets_by_place: dict[str, set[str]], inventory: list[dict[str, object]]
) -> tuple[list[dict[str, object]], dict[tuple[str, str], dict[str, object]]]:
    counts = {str(item["facet"]): int(item["count"]) for item in inventory}
    total = len(facets_by_place)
    cooccurrence: Counter[tuple[str, str]] = Counter()
    for facets in facets_by_place.values():
        cooccurrence.update(combinations(sorted(facets), 2))
    pairs = []
    lookup = {}
    for left, right in combinations(sorted(counts), 2):
        both = cooccurrence[(left, right)]
        union = counts[left] + counts[right] - both
        result = {
            "left": left,
            "right": right,
            "count": both,
            "p_left_given_right": both / counts[right],
            "p_right_given_left": both / counts[left],
            "jaccard": both / union if union else 0.0,
            "phi": _phi(counts[left], counts[right], both, total),
        }
        lookup[(left, right)] = result
        if both >= 3:
            pairs.append(result)
    pairs.sort(
        key=lambda item: (-float(item["jaccard"]), -float(item["phi"]), item["left"])
    )
    return pairs, lookup


def _higher_order_groups(
    facets_by_place: dict[str, set[str]], inventory: list[dict[str, object]]
) -> list[dict[str, object]]:
    counts = {str(item["facet"]): int(item["count"]) for item in inventory}
    triples: Counter[tuple[str, str, str]] = Counter()
    for facets in facets_by_place.values():
        triples.update(combinations(sorted(facets), 3))
    results = []
    for facets, intersection in triples.items():
        if intersection < 5:
            continue
        union = sum(
            any(facet in place_facets for facet in facets)
            for place_facets in facets_by_place.values()
        )
        conditional = intersection / min(counts[facet] for facet in facets)
        results.append(
            {
                "facets": facets,
                "count": intersection,
                "jaccard": intersection / union,
                "min_conditional": conditional,
            }
        )
    results.sort(
        key=lambda item: (-float(item["jaccard"]), -int(item["count"]), item["facets"])
    )
    return results[:20]


def _connected_groups(pairs: list[dict[str, object]]) -> list[list[str]]:
    adjacency: dict[str, set[str]] = {}
    for pair in pairs:
        if pair["jaccard"] < 0.50 or pair["phi"] < 0.30 or pair["count"] < 5:
            continue
        left, right = str(pair["left"]), str(pair["right"])
        adjacency.setdefault(left, set()).add(right)
        adjacency.setdefault(right, set()).add(left)
    groups = []
    remaining = set(adjacency)
    while remaining:
        stack = [remaining.pop()]
        component = set(stack)
        while stack:
            for neighbor in adjacency.get(stack.pop(), set()):
                if neighbor not in component:
                    component.add(neighbor)
                    remaining.discard(neighbor)
                    stack.append(neighbor)
        if len(component) >= 2:
            groups.append(sorted(component))
    return sorted(groups, key=lambda group: (-len(group), group))


def _quantile(values: list[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _price_audit(rows: list[dict[str, Any]]) -> dict[str, object]:
    minimums = []
    maximums = []
    bands: Counter[str] = Counter()
    within_band: dict[str, list[float]] = {}
    for row in rows:
        budget = row.get("budget")
        if not isinstance(budget, dict):
            continue
        band = str(budget.get("band") or "unknown")
        bands[band] += 1
        minimum = budget.get("minimum")
        maximum = budget.get("maximum")
        if isinstance(minimum, (int, float)) and not isinstance(minimum, bool):
            minimums.append(float(minimum))
        if isinstance(maximum, (int, float)) and not isinstance(maximum, bool):
            maximums.append(float(maximum))
            within_band.setdefault(band, []).append(float(maximum))
    unique_maxima = sorted(set(maximums))
    gaps = sorted(
        (
            {"lower": left, "upper": right, "gap": right - left}
            for left, right in pairwise(unique_maxima)
        ),
        key=lambda item: -item["gap"],
    )[:8]
    return {
        "known_budget_count": sum(bands.values()),
        "minimum_count": len(minimums),
        "maximum_count": len(maximums),
        "minimum_quantiles": {str(q): _quantile(minimums, q) for q in (0, 0.25, 0.5, 0.75, 1)},
        "maximum_quantiles": {str(q): _quantile(maximums, q) for q in (0, 0.25, 0.5, 0.75, 1)},
        "bands": dict(bands),
        "within_band_maximum": {
            band: {
                "count": len(values),
                "min": min(values),
                "median": statistics.median(values),
                "max": max(values),
            }
            for band, values in sorted(within_band.items())
        },
        "largest_gaps": gaps,
    }


def _normalize_tag(value: str) -> str:
    normalized = re.sub(r"[^\w\s-]", " ", value.casefold())
    return re.sub(r"[\s_-]+", " ", normalized).strip()


def _unused_field_audit(
    rows: list[dict[str, Any]], research: dict[str, dict[str, Any]]
) -> dict[str, object]:
    raw_tags: Counter[str] = Counter()
    normalized_tags: Counter[str] = Counter()
    variants: dict[str, set[str]] = {}
    for row in rows:
        for raw in row.get("food_tags", []):
            if not isinstance(raw, str) or not raw.strip():
                continue
            raw_tags[raw.strip()] += 1
            normalized = _normalize_tag(raw)
            normalized_tags[normalized] += 1
            variants.setdefault(normalized, set()).add(raw.strip())
    coverage_fields = {
        "food_tags": sum(bool(row.get("food_tags")) for row in rows),
        "signature_dishes": sum(bool(row.get("signature_dishes")) for row in rows),
        "opening_hours": sum(bool(row.get("opening_hours")) for row in rows),
        "service_periods": sum(
            bool((row.get("practical_info") or {}).get("service_periods")) for row in rows
        ),
        "hours_display": sum(bool(row.get("hours_display")) for row in rows),
        "numeric_budget_minimum": sum(
            isinstance((row.get("budget") or {}).get("minimum"), (int, float))
            for row in rows
        ),
        "numeric_budget_maximum": sum(
            isinstance((row.get("budget") or {}).get("maximum"), (int, float))
            for row in rows
        ),
        "reservation_status": sum(bool(row.get("reservation_status")) for row in rows),
        "discovery_area": sum(bool(row.get("discovery_area")) for row in rows),
        "local_discovery_score": sum(row.get("local_discovery_score") is not None for row in rows),
        "accepted_richer_cuisine": len(research),
    }
    current = _facet_sets(rows)
    richer_added = Counter()
    richer_rows_with_additions = 0
    for row in rows:
        place_id = str(row["place_id"])
        enriched = {**row, **research.get(place_id, {})}
        rich_facets = {facet.key for facet in restaurant_taste_facets(enriched)}
        additions = rich_facets - current[place_id]
        if additions:
            richer_rows_with_additions += 1
            richer_added.update(additions)
    useful_concepts = sum(count >= 2 for count in normalized_tags.values())
    return {
        "coverage": coverage_fields,
        "food_tags": {
            "raw_vocabulary": len(raw_tags),
            "normalized_vocabulary": len(normalized_tags),
            "singleton_normalized": sum(count == 1 for count in normalized_tags.values()),
            "useful_repeated_concepts_estimate": useful_concepts,
            "top": normalized_tags.most_common(25),
            "variant_groups": [
                {"normalized": key, "variants": sorted(values)}
                for key, values in variants.items()
                if len(values) > 1
            ][:20],
        },
        "richer_cuisine": {
            "rows_with_new_current-style_facets": richer_rows_with_additions,
            "additional_facets": richer_added.most_common(),
        },
    }


def _pick_rows(
    rows: list[dict[str, Any]],
    predicate: Any,
    count: int,
    excluded: set[str] | None = None,
) -> list[dict[str, Any]]:
    blocked = excluded or set()
    matching = [
        row
        for row in rows
        if str(row["place_id"]) not in blocked and predicate(_facet_key_set(row), row)
    ]
    fallback = [
        row for row in rows if str(row["place_id"]) not in blocked and row not in matching
    ]
    key = lambda row: (-float(row.get("fiyu_score") or 0), str(row["place_id"]))
    selected = sorted(matching, key=key)[:count]
    selected.extend(sorted(fallback, key=key)[: count - len(selected)])
    return selected


def _facet_key_set(row: dict[str, Any]) -> set[str]:
    return {facet.key for facet in restaurant_taste_facets(row)}


def _visits(
    rows: list[dict[str, Any]], ratings: list[int], prefix: str
) -> list[dict[str, Any]]:
    return [
        {
            "id": f"{prefix}-{index}",
            "place_id": str(row["place_id"]),
            "rating": rating,
            "visited_at": f"2026-01-{index + 1:02d}T12:00:00+00:00",
            "created_at": f"2026-01-{index + 1:02d}T12:00:00+00:00",
        }
        for index, (row, rating) in enumerate(zip(rows, ratings, strict=True))
    ]


def _synthetic_histories(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    def chosen(predicate: Any, count: int, excluded: set[str] | None = None) -> list[dict[str, Any]]:
        return _pick_rows(rows, predicate, count, excluded)

    profiles: dict[str, list[dict[str, Any]]] = {}
    sushi = chosen(lambda f, _: "cuisine_sushi" in f and "counter_seating" in f, 6)
    contrast = chosen(
        lambda f, _: "cuisine_sushi" not in f and "table_dining" in f,
        3,
        {str(row["place_id"]) for row in sushi},
    )
    profiles["A — narrow sushi/counter lover"] = _visits(
        [*sushi, *contrast], [5] * 6 + [2] * 3, "a"
    )

    broad: list[dict[str, Any]] = []
    covered: set[str] = set()
    remaining = list(rows)
    while remaining and len(broad) < 14:
        row = max(
            remaining,
            key=lambda item: (len(_facet_key_set(item) - covered), float(item.get("fiyu_score") or 0)),
        )
        broad.append(row)
        covered.update(_facet_key_set(row))
        remaining.remove(row)
    profiles["B — broad high-rating user"] = _visits(broad, [5, 4] * 7, "b")

    refined = chosen(lambda f, _: bool(f & {"refined", "splurge", "tasting_course"}), 10)
    profiles["C — refined/splurge user"] = _visits(refined, [5, 4] * 5, "c")

    casual = chosen(lambda f, _: bool(f & {"casual", "budget", "neighbourhood"}), 10)
    profiles["D — casual/value user"] = _visits(casual, [5, 4] * 5, "d")

    intimate = chosen(lambda f, _: bool(f & {"intimate", "quiet"}), 10)
    profiles["E — intimate/quiet user"] = _visits(intimate, [5, 4] * 5, "e")

    lively = chosen(lambda f, _: "lively" in f or "group_friendly" in f, 10)
    profiles["F — lively/group user"] = _visits(lively, [5, 4] * 5, "f")

    cheap_noodles = chosen(lambda f, _: "noodles" in f and "budget" in f, 5)
    expensive_sushi = chosen(
        lambda f, _: "cuisine_sushi" in f and "splurge" in f,
        5,
        {str(row["place_id"]) for row in cheap_noodles},
    )
    profiles["G — cheap ramen plus expensive omakase"] = _visits(
        [*cheap_noodles, *expensive_sushi], [5] * 10, "g"
    )

    counter_broad = chosen(lambda f, _: "counter_seating" in f, 12)
    profiles["H — broad Taste with counter preference"] = _visits(
        counter_broad, [5, 4] * 6, "h"
    )
    return profiles


def _side_score(profile: UserTasteProfile, keys: tuple[str, ...]) -> float:
    values = [profile.facet_affinities[key] for key in keys if key in profile.facet_affinities]
    return statistics.mean(values) if values else 0.0


def _positive_breadth(
    visits: list[dict[str, Any]], catalog: dict[str, dict[str, Any]]
) -> dict[str, object]:
    positive = [visit for visit in visits if int(visit["rating"]) >= 4]
    cuisine_counts: Counter[str] = Counter()
    formats: set[str] = set()
    prices: set[str] = set()
    atmospheres: set[str] = set()
    all_facets: Counter[str] = Counter()
    for visit in positive:
        facets = _facet_key_set(catalog[str(visit["place_id"])])
        cuisines = facets & CUISINE_FACETS
        cuisine_counts.update(cuisines)
        formats.update(facets & FORMAT_FACETS)
        prices.update(facets & PRICE_FACETS)
        atmospheres.update(facets & ATMOSPHERE_FACETS)
        all_facets.update(facets)
    total_cuisine = sum(cuisine_counts.values())
    entropy = 0.0
    if total_cuisine and len(cuisine_counts) > 1:
        entropy = -sum(
            (count / total_cuisine) * math.log(count / total_cuisine)
            for count in cuisine_counts.values()
        ) / math.log(len(cuisine_counts))
    top_share = max(all_facets.values(), default=0) / len(positive) if positive else 0.0
    return {
        "positive_ratings": len(positive),
        "cuisine_count": len(cuisine_counts),
        "cuisine_entropy": entropy,
        "format_count": len(formats),
        "price_band_count": len(prices),
        "atmosphere_count": len(atmospheres),
        "top_facet_positive_share": top_share,
        "evidence_confidence": min(len(positive) / 10, 1.0),
    }


def _candidate_scores(
    profile: UserTasteProfile,
    row: dict[str, Any],
    frequency: dict[str, float],
) -> dict[str, float]:
    keys = sorted(_facet_key_set(row) & profile.facet_affinities.keys())
    if not keys:
        return {"flat": 0.0, "grouped": 0.0, "common_downweighted": 0.0, "information": 0.0}
    values = {key: profile.facet_affinities[key] for key in keys}
    flat = statistics.mean(values.values()) * profile.confidence
    grouped_values = [value for key, value in values.items() if key not in CORRELATED_FORMAT]
    correlated_values = [values[key] for key in keys if key in CORRELATED_FORMAT]
    if correlated_values:
        grouped_values.append(statistics.mean(correlated_values))
    grouped = statistics.mean(grouped_values) * profile.confidence

    common_weights = {key: max(0.05, 1.0 - frequency[key]) for key in keys}
    common_downweighted = (
        sum(values[key] * common_weights[key] for key in keys)
        / sum(common_weights.values())
        * profile.confidence
    )
    information_weights = {
        key: min(4.0, max(0.1, -math.log(max(frequency[key], 1e-6)))) for key in keys
    }
    information = (
        sum(values[key] * information_weights[key] for key in keys)
        / sum(information_weights.values())
        * profile.confidence
    )
    return {
        "flat": flat,
        "grouped": grouped,
        "common_downweighted": common_downweighted,
        "information": information,
    }


def _profile_diagnostics(
    rows: list[dict[str, Any]], inventory: list[dict[str, object]]
) -> list[dict[str, object]]:
    catalog = {str(row["place_id"]): row for row in rows}
    histories = _synthetic_histories(rows)
    frequency = {str(item["facet"]): float(item["share"]) for item in inventory}
    reports = []
    for name, visits in histories.items():
        profile = build_user_taste_profile(visits=visits, catalog=catalog)
        scores = [
            {
                "place_id": str(row["place_id"]),
                "name": row.get("name_en") or row.get("name_ja") or row["place_id"],
                **_candidate_scores(profile, row, frequency),
            }
            for row in rows
        ]
        flat_top = {
            item["place_id"]
            for item in sorted(scores, key=lambda item: (-item["flat"], item["place_id"]))[:10]
        }
        alternatives = {}
        for method in ("grouped", "common_downweighted", "information"):
            top = {
                item["place_id"]
                for item in sorted(scores, key=lambda item: (-item[method], item["place_id"]))[:10]
            }
            largest = max(scores, key=lambda item: abs(item[method] - item["flat"]))
            alternatives[method] = {
                "top10_overlap": len(flat_top & top),
                "mean_absolute_change": statistics.mean(
                    abs(item[method] - item["flat"]) for item in scores
                ),
                "largest_change_candidate": largest["name"],
                "largest_change": largest[method] - largest["flat"],
            }
        dimensions = [
            {
                "name": dimension["name"],
                "poles": dimension["poles"],
                "left": _side_score(profile, dimension["left"]),
                "right": _side_score(profile, dimension["right"]),
            }
            for dimension in DIMENSIONS
        ]
        reports.append(
            {
                "profile": name,
                "rated_count": profile.rated_count,
                "confidence": profile.confidence,
                "positive_facets": sorted(
                    (
                        (key, value)
                        for key, value in profile.facet_affinities.items()
                        if value > 0
                    ),
                    key=lambda item: (-item[1], item[0]),
                )[:8],
                "negative_facets": sorted(
                    (
                        (key, value)
                        for key, value in profile.facet_affinities.items()
                        if value < 0
                    ),
                    key=lambda item: (item[1], item[0]),
                )[:8],
                "dimensions": dimensions,
                "breadth": _positive_breadth(visits, catalog),
                "alternatives": alternatives,
            }
        )
    return reports


def _axis_evidence(
    facets_by_place: dict[str, set[str]], pairs: dict[tuple[str, str], dict[str, object]]
) -> list[dict[str, object]]:
    total = len(facets_by_place)
    results = []
    for dimension in DIMENSIONS:
        left_set = {
            place_id
            for place_id, facets in facets_by_place.items()
            if facets & set(dimension["left"])
        }
        right_set = {
            place_id
            for place_id, facets in facets_by_place.items()
            if facets & set(dimension["right"])
        }
        overlap = len(left_set & right_set)
        union = len(left_set | right_set)
        phi = _phi(len(left_set), len(right_set), overlap, total)
        results.append(
            {
                "name": dimension["name"],
                "poles": dimension["poles"],
                "left_coverage": len(left_set),
                "right_coverage": len(right_set),
                "overlap": overlap,
                "jaccard": overlap / union if union else 0.0,
                "phi": phi,
                "interpretation": (
                    "bipolar encoding has empirical support"
                    if phi <= -0.25 and overlap / max(min(len(left_set), len(right_set)), 1) < 0.15
                    else "better represented as two partly independent scores"
                ),
            }
        )
    return results


def _jaccard_distance(left: set[str], right: set[str]) -> float:
    union = left | right
    return 1.0 - len(left & right) / len(union) if union else 0.0


def _k_medoids(facets: list[set[str]], k: int) -> tuple[list[int], list[int]]:
    medoids = [max(range(len(facets)), key=lambda index: len(facets[index]))]
    while len(medoids) < k:
        medoids.append(
            max(
                (index for index in range(len(facets)) if index not in medoids),
                key=lambda index: min(
                    _jaccard_distance(facets[index], facets[medoid]) for medoid in medoids
                ),
            )
        )
    assignments = [0] * len(facets)
    for _ in range(10):
        assignments = [
            min(
                range(k),
                key=lambda cluster: (
                    _jaccard_distance(item, facets[medoids[cluster]]),
                    cluster,
                ),
            )
            for item in facets
        ]
        updated = []
        for cluster in range(k):
            members = [index for index, assigned in enumerate(assignments) if assigned == cluster]
            updated.append(
                min(
                    members,
                    key=lambda candidate: sum(
                        _jaccard_distance(facets[candidate], facets[other])
                        for other in members
                    ),
                )
                if members
                else medoids[cluster]
            )
        if updated == medoids:
            break
        medoids = updated
    return assignments, medoids


def _silhouette(facets: list[set[str]], assignments: list[int]) -> float:
    clusters = sorted(set(assignments))
    values = []
    for index, own in enumerate(assignments):
        own_members = [i for i, cluster in enumerate(assignments) if cluster == own and i != index]
        a = (
            statistics.mean(_jaccard_distance(facets[index], facets[i]) for i in own_members)
            if own_members
            else 0.0
        )
        other_means = [
            statistics.mean(
                _jaccard_distance(facets[index], facets[i])
                for i, assigned in enumerate(assignments)
                if assigned == cluster
            )
            for cluster in clusters
            if cluster != own and any(assigned == cluster for assigned in assignments)
        ]
        b = min(other_means) if other_means else 0.0
        values.append((b - a) / max(a, b) if max(a, b) else 0.0)
    return statistics.mean(values)


def _restaurant_clusters(
    rows: list[dict[str, Any]], facets_by_place: dict[str, set[str]]
) -> dict[str, object]:
    ordered = [facets_by_place[str(row["place_id"])] for row in rows]
    diagnostics = []
    candidates = {}
    for k in (4, 6, 8, 10, 12):
        assignments, medoids = _k_medoids(ordered, k)
        score = _silhouette(ordered, assignments)
        diagnostics.append({"k": k, "silhouette": score})
        candidates[k] = (assignments, medoids)
    best = max(diagnostics, key=lambda item: item["silhouette"])
    assignments, medoids = candidates[int(best["k"])]
    global_counts = Counter(facet for facets in ordered for facet in facets)
    summaries = []
    for cluster in range(int(best["k"])):
        members = [index for index, assigned in enumerate(assignments) if assigned == cluster]
        if not members:
            continue
        cluster_counts = Counter(facet for index in members for facet in ordered[index])
        defining = sorted(
            (
                {
                    "facet": facet,
                    "prevalence": count / len(members),
                    "lift": (count / len(members)) / (global_counts[facet] / len(rows)),
                }
                for facet, count in cluster_counts.items()
                if count >= 2
                and count / len(members) >= 0.10
                and (count / len(members)) / (global_counts[facet] / len(rows)) >= 1.20
            ),
            key=lambda item: (-item["prevalence"] * item["lift"], item["facet"]),
        )[:6]
        summaries.append(
            {
                "cluster": cluster + 1,
                "size": len(members),
                "medoid": rows[medoids[cluster]].get("name_en")
                or rows[medoids[cluster]].get("name_ja"),
                "defining": defining,
            }
        )
    return {"diagnostics": diagnostics, "best_k": best["k"], "clusters": summaries}


def analyze(database: Path) -> dict[str, object]:
    uri = database.resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        state_before = _table_fingerprints(connection)
        rows = [_current_row(row) for row in connection.execute(CATALOG_QUERY).fetchall()]
        research = _accepted_cuisine_research(connection)
        facets_by_place = _facet_sets(rows)
        inventory = _facet_inventory(rows, facets_by_place)
        pairs, pair_lookup = _correlations(facets_by_place, inventory)
        report = {
            "methodology": {
                "database": str(database),
                "restaurant_count": len(rows),
                "current_facet_count": len(inventory),
                "source_opened_read_only": True,
            },
            "facets": inventory,
            "pairs": pairs[:40],
            "investigated_pairs": [
                pair_lookup.get(
                    tuple(sorted(pair)),
                    {
                        "left": min(pair),
                        "right": max(pair),
                        "count": 0,
                        "p_left_given_right": 0.0,
                        "p_right_given_left": 0.0,
                        "jaccard": 0.0,
                        "phi": 0.0,
                    },
                )
                for pair in (
                    ("counter_seating", "small_capacity"),
                    ("counter_seating", "solo_friendly"),
                    ("small_capacity", "solo_friendly"),
                    ("cuisine_sushi", "seafood"),
                    ("splurge", "refined"),
                )
            ],
            "triples": _higher_order_groups(facets_by_place, inventory),
            "connected_groups": _connected_groups(pairs),
            "unused_fields": _unused_field_audit(rows, research),
            "price": _price_audit(rows),
            "axes": _axis_evidence(facets_by_place, pair_lookup),
            "profiles": _profile_diagnostics(rows, inventory),
            "clusters": _restaurant_clusters(rows, facets_by_place),
        }
        state_after = _table_fingerprints(connection)
    report["methodology"]["persistent_state_unchanged"] = state_before == state_after
    report["methodology"]["state_hashes_before"] = state_before
    report["methodology"]["state_hashes_after"] = state_after
    return report


def _facet_list(values: list[tuple[str, float]]) -> str:
    return ", ".join(f"{key} {value:+.2f}" for key, value in values) or "—"


def render_markdown(report: dict[str, object]) -> str:
    methodology = report["methodology"]
    lines = [
        "# Taste V2 structure audit",
        "",
        ("> Read-only restaurant-feature analysis. This report does not implement Taste V2, "
        "change production recommendations, or define final Fiyu Types."),
        "",
        "## Methodology and scope",
        "",
        f"- Eligible real catalog restaurants: **{methodology['restaurant_count']}**.",
        f"- Current production-derived Taste facets observed: **{methodology['current_facet_count']}**.",
        "- Current matrix uses only fields already consumed by `restaurant_taste_facets`.",
        ("- Richer cuisine research, food tags, numeric price, hours, discovery, and other fields "
        "are inventoried separately and never mixed into current-facet results."),
        "- Pairwise statistics are descriptive Jaccard, conditional probability, and binary phi.",
        "- Higher-order structure uses frequent triples and a transparent correlation graph.",
        "- Restaurant clustering is deterministic Jaccard k-medoids and is discovery-only.",
        (f"- Source database opened read-only; persistent state unchanged: "
        f"**{methodology['persistent_state_unchanged']}**."),
        "",
        "## Current facet coverage and specificity",
        "",
        ("Bands: very common >50%; common 25–50%; moderate 10–<25%; distinctive 2–<10%; "
        "rare <2%. Rarity is not treated as quality."),
        "",
        "| Facet | Family | Count | Share | Specificity | Provenance | Coverage concern |",
        "|---|---|---:|---:|---|---|---|",
    ]
    for item in report["facets"]:
        lines.append(
            f"| `{item['facet']}` | {item['family']} | {item['count']} | "
            f"{item['share']:.1%} | {item['specificity']} | {item['provenance']} | "
            f"{item['reliability']} |"
        )
    lines.extend(
        [
            "",
            "## Strongest pairwise relationships",
            "",
            r"| Pair | Together | P(A\|B) | P(B\|A) | Jaccard | Phi |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for item in report["pairs"][:25]:
        lines.append(
            f"| `{item['left']}` + `{item['right']}` | {item['count']} | "
            f"{item['p_left_given_right']:.1%} | {item['p_right_given_left']:.1%} | "
            f"{item['jaccard']:.3f} | {item['phi']:+.3f} |"
        )
    lines.extend(["", "Explicitly requested pairs:", ""])
    for item in report["investigated_pairs"]:
        lines.append(
            f"- `{item['left']}` ↔ `{item['right']}`: n={item['count']}, "
            f"Jaccard={item['jaccard']:.3f}, phi={item['phi']:+.3f}, "
            f"P(left|right)={item['p_left_given_right']:.1%}, "
            f"P(right|left)={item['p_right_given_left']:.1%}."
        )
    lines.extend(
        [
            "",
            "## Higher-order groups",
            "",
            "Frequent triples:",
            "",
            "| Facets | Restaurants | Generalized Jaccard | Smallest-member coverage |",
            "|---|---:|---:|---:|",
        ]
    )
    for item in report["triples"][:15]:
        lines.append(
            f"| `{' + '.join(item['facets'])}` | {item['count']} | "
            f"{item['jaccard']:.3f} | {item['min_conditional']:.1%} |"
        )
    lines.extend(["", "Correlation-graph components:", ""])
    lines.extend(f"- `{' + '.join(group)}`" for group in report["connected_groups"])
    lines.extend(
        [
            "",
            "Interpretation:",
            "",
            ("- Counter + small-capacity + solo is best treated as one latent compact, "
            "counter-oriented format with still-useful component nuance (category C)."),
            ("- Sushi + seafood is a near hierarchy/subset and a likely double-counting risk "
            "rather than two independent preferences (categories A/C)."),
            ("- Group + table and date + small-capacity are related but not synonymous concepts "
            "(category B)."),
            ("- Small theme groups with very low counts may be extraction artifacts rather than "
            "stable latent structure (category D)."),
            "",
            "## Cuisine hierarchy audit",
            "",
            ("- Every observed `cuisine_sushi` restaurant also has `seafood`; sushi is therefore "
            "currently a strict subset of the broader seafood signal."),
            ("- Sushi frequently co-travels with counter/small-capacity/solo, mixing food identity "
            "with service format in flat candidate averages."),
            ("- Noodles, grilled, seafood, and izakaya are broad style/category signals; only eight "
            "named cuisine families are currently recognized."),
            ("- Current category regexes miss many potentially meaningful Japanese subtypes and "
            "cross-cuisine distinctions; accepted richer cuisine terms are audited below."),
            ("- Taste V2 should preserve a hierarchy (specific cuisine → broader food family) while "
            "avoiding counting parent and child as independent evidence by default."),
            "",
            "## Backend-known fields not currently used by Taste",
            "",
            "| Field | Restaurants with data |",
            "|---|---:|",
        ]
    )
    for field, count in report["unused_fields"]["coverage"].items():
        lines.append(f"| `{field}` | {count} |")
    tags = report["unused_fields"]["food_tags"]
    richer = report["unused_fields"]["richer_cuisine"]
    if richer["additional_facets"]:
        richer_finding = (
            f"Accepted richer cuisine research would add a recognized current-style facet to "
            f"**{richer['rows_with_new_current-style_facets']}** restaurants: "
            + ", ".join(
                f"`{facet}` ({count})" for facet, count in richer["additional_facets"]
            )
            + "."
        )
    else:
        richer_finding = (
            "No accepted richer-cuisine research rows are available in this local catalog, so "
            "incremental production-facet coverage from that source cannot be evaluated here."
        )
    lines.extend(
        [
            "",
            "### Food tags and richer cuisine data",
            "",
            (f"- Food-tag raw vocabulary: **{tags['raw_vocabulary']}**; basic-normalized "
            f"vocabulary: **{tags['normalized_vocabulary']}**; normalized singletons: "
            f"**{tags['singleton_normalized']}**."),
            (f"- Repeated normalized concepts (count ≥2): **{tags['useful_repeated_concepts_estimate']}**. "
            "This is an upper-bound normalization candidate count, not a recommended taxonomy size."),
            "- Top normalized tags: "
            + ", ".join(f"`{tag}` ({count})" for tag, count in tags["top"][:15])
            + ".",
            f"- Basic normalization found **{len(tags['variant_groups'])}** displayed variant "
            "groups; examples: "
            + "; ".join(
                f"`{item['normalized']}` ← {', '.join(item['variants'])}"
                for item in tags["variant_groups"][:5]
            )
            + ".",
            f"- {richer_finding}",
            ("- Highly generic tags such as Japanese cuisine/和食 coexist with specific dish and "
            "style tags; casing cleanup alone is insufficient—synonym and hierarchy mapping are needed."),
            ("- Food tags look useful only after normalization, synonym control, provenance review, "
            "and minimum-support rules; direct injection would greatly increase sparse/noisy terms."),
            "",
            "## Price structure",
            "",
        ]
    )
    price = report["price"]
    lines.extend(
        [
            (f"- Canonical budget objects: **{price['known_budget_count']}**; numeric minimums: "
            f"**{price['minimum_count']}**; numeric maximums: **{price['maximum_count']}**."),
            "- Minimum quantiles (0/25/50/75/100%): "
            + ", ".join(f"¥{value:,.0f}" for value in price["minimum_quantiles"].values())
            + ".",
            "- Maximum quantiles (0/25/50/75/100%): "
            + ", ".join(f"¥{value:,.0f}" for value in price["maximum_quantiles"].values())
            + ".",
            "- Current band counts: "
            + ", ".join(f"`{band}` {count}" for band, count in price["bands"].items())
            + ".",
            "- Largest gaps between observed numeric maxima: "
            + ", ".join(
                f"¥{item['lower']:,.0f}→¥{item['upper']:,.0f} (gap ¥{item['gap']:,.0f})"
                for item in price["largest_gaps"][:5]
            )
            + ".",
            "",
            "| Band | Known maxima | Min | Median | Max |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for band, values in price["within_band_maximum"].items():
        lines.append(
            f"| {band} | {values['count']} | ¥{values['min']:,.0f} | "
            f"¥{values['median']:,.0f} | ¥{values['max']:,.0f} |"
        )
    lines.extend(
        [
            "",
            ("Price is both categorical and continuous: bands are interpretable anchors, while "
            "numeric center/range retain meaningful within-band variation and support breadth or "
            "tolerance. Open-ended maxima require censored-value handling. The observed `moderate` "
            "maxima extend to ¥9,999 and overlap `upscale`, so labels are not clean numeric bins."),
            "",
            "## Format, atmosphere, occasion, and candidate dimensions",
            "",
            "| Dimension | Restaurant-space poles | Left coverage | Right coverage | Overlap | Jaccard | Phi | Assessment |",
            "|---|---|---:|---:|---:|---:|---:|---|",
        ]
    )
    for axis in report["axes"]:
        lines.append(
            f"| {axis['name']} | {axis['poles']} | {axis['left_coverage']} | "
            f"{axis['right_coverage']} | {axis['overlap']} | {axis['jaccard']:.3f} | "
            f"{axis['phi']:+.3f} | {axis['interpretation']} |"
        )
    lines.extend(
        [
            "",
            "Evidence summary:",
            "",
            ("- Price posture has the cleanest categorical separation, but users can like both "
            "cheap and expensive restaurants; preserve independent affinities plus a continuous range."),
            ("- Compact/counter versus table/social has strong structure but substantial overlap, so "
            "it is not a true bipolar axis."),
            ("- Casual/refined and intimate/lively are weakly measured because refined and especially "
            "lively theme coverage is sparse."),
            "- Traditional/creative coverage is sparse and does not establish mutual exclusion.",
            "- Solo and social signals frequently coexist; two independent scores are more honest.",
            ("- Focused ↔ explorative is not a restaurant axis. It must be inferred from confidence-"
            "qualified positive-rating breadth over time."),
            "",
            "## Exploration and positive-preference breadth",
            "",
            ("A future breadth signal should combine positive-rating cuisine entropy, positively "
            "rated format/price/atmosphere coverage, and concentration of positive affinity. It "
            "must be confidence-shrunk, neutral about breadth itself, and updated only from explicit "
            "feedback—not mere exposure or generated exploration Picks."),
            "",
            ("Safeguards: minimum distinct rated restaurants; current effective rating per restaurant; "
            "no credit for low/neutral category visits; shrinkage for sparse histories; robustness "
            "against one-off rare tags; and no circular recommendation-as-preference evidence."),
            "",
            "## Synthetic user-profile demonstrations",
            "",
        ]
    )
    for profile in report["profiles"]:
        lines.extend(
            [
                f"### {profile['profile']}",
                "",
                f"Ratings/confidence: **{profile['rated_count']} / {profile['confidence']:.2f}**.",
                f"Positive facets: {_facet_list(profile['positive_facets'])}.",
                f"Negative facets: {_facet_list(profile['negative_facets'])}.",
                f"Coherence check: {PROFILE_INTERPRETATIONS[profile['profile']]}",
                (
                    "Positive breadth: "
                    f"cuisines={profile['breadth']['cuisine_count']}, "
                    f"entropy={profile['breadth']['cuisine_entropy']:.2f}, "
                    f"formats={profile['breadth']['format_count']}, "
                    f"price bands={profile['breadth']['price_band_count']}, "
                    f"atmospheres={profile['breadth']['atmosphere_count']}, "
                    f"evidence confidence={profile['breadth']['evidence_confidence']:.2f}."
                ),
                "",
                "| Diagnostic dimension | Poles | Left score | Right score |",
                "|---|---|---:|---:|",
            ]
        )
        for dimension in profile["dimensions"]:
            lines.append(
                f"| {dimension['name']} | {dimension['poles']} | "
                f"{dimension['left']:+.3f} | {dimension['right']:+.3f} |"
            )
        lines.extend(
            [
                "",
                "Flat-candidate affinity versus offline alternatives:",
                "",
                "| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |",
                "|---|---:|---:|---|---:|",
            ]
        )
        for method, values in profile["alternatives"].items():
            lines.append(
                f"| {method} | {values['top10_overlap']}/10 | "
                f"{values['mean_absolute_change']:.3f} | "
                f"{values['largest_change_candidate']} | {values['largest_change']:+.3f} |"
            )
        lines.append("")
    lines.extend(
        [
            "## Diagnostic comparison conclusions",
            "",
            ("- Grouping the counter/small/solo cluster generally improves interpretability and "
            "reduces triple-counting, but it can erase real distinctions between room size, seating, "
            "and visit suitability."),
            ("- Common-facet down-weighting is gentler than grouping and often preserves rankings, "
            "but prevalence is not the same as low usefulness."),
            ("- Information weighting can rescue cuisine-specific signals, but it also gives rare, "
            "coverage-sensitive review themes disproportionate influence. It is the riskiest direct "
            "production candidate without reliability priors."),
            "- The tables above are diagnostics only; current flat behavior remains unchanged.",
            "",
            "## Exploratory restaurant clustering",
            "",
            "| k | Mean Jaccard silhouette |",
            "|---:|---:|",
        ]
    )
    for item in report["clusters"]["diagnostics"]:
        lines.append(f"| {item['k']} | {item['silhouette']:.3f} |")
    lines.extend(
        [
            "",
            f"Best tested k: **{report['clusters']['best_k']}**.",
            "",
            "| Cluster | Restaurants | Medoid example | Defining facets (prevalence; lift) |",
            "|---:|---:|---|---|",
        ]
    )
    for cluster in report["clusters"]["clusters"]:
        defining = ", ".join(
            f"`{item['facet']}` {item['prevalence']:.0%}; {item['lift']:.1f}×"
            for item in cluster["defining"]
        )
        lines.append(
            f"| {cluster['cluster']} | {cluster['size']} | {cluster['medoid']} | {defining} |"
        )
    lines.extend(
        [
            "",
            ("Silhouette is low and some clusters are tiny/singletons, so restaurant clusters are "
            "not robust. They mostly expose obvious sushi, price, format, and private-room patterns "
            "plus catalog sparsity. This is weak discovery evidence and no evidence of human Types."),
            "",
            "## Limitations: what cannot be learned yet",
            "",
            "- Restaurant-feature covariance and catalog coverage can be learned now.",
            "- Synthetic profile behavior and diagnostic scoring alternatives can be tested now.",
            ("- Actual human preference covariance, stable user archetypes, Type prevalence, and "
            "whether users understand proposed dimensions cannot be established without substantial "
            "real rating histories and product research."),
            ("- Review-derived theme absence means unknown, not false; rare facets may reflect missing "
            "research rather than genuine rarity."),
            ("- The catalog is curated and geographically/product filtered, so frequencies are not "
            "Tokyo-wide restaurant prevalence."),
            "",
            "## Implications for Taste V2 and eventual Fiyu Types",
            "",
            ("Strongest backend dimensions: price posture/range, compact-counter format, table/social "
            "format, cuisine hierarchy, and confidence-qualified positive breadth. Atmosphere and "
            "traditional/creative dimensions need better coverage before carrying much weight."),
            "",
            ("Keep technical components—specificity weighting, reliability priors, correlated-feature "
            "groups, entropy, and shrinkage—backend-only. Product language should describe coherent "
            "preferences, not statistical machinery."),
            "",
            ("A stable Type should probably require at least 20 current effective ratings plus support "
            "across multiple independent dimensions; the existing 10/15 milestones are useful for "
            "early evolving Taste, while 20 and subsequent 10-rating intervals are more defensible "
            "Type refresh points. This remains a design hypothesis requiring real-user validation."),
            "",
            ("Potentially meaningful future combinations include price posture × format orientation × "
            "cuisine breadth × occasion intensity. Do not generate final Types until real preference "
            "covariance and user-language research exist."),
            "",
            "## Recommended next research",
            "",
            "1. Normalize and quality-review food tags and accepted cuisine terms offline.",
            "2. Collect enough pseudonymized current effective ratings to measure user-level covariance.",
            "3. Validate dimension stability with bootstrap/resampling and held-out ratings.",
            "4. Test grouped/common-weighted diagnostics against prediction, not aesthetics alone.",
            "5. Interview users on understandable language before designing 10–12 Fiyu Types.",
            "",
            "Data discovers the axes; product design creates the Types.",
            "",
            "No production behavior was changed.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("data/fiyu.db"))
    parser.add_argument(
        "--output", type=Path, default=Path("docs/taste-v2-structure-audit.md")
    )
    parser.add_argument("--json-output", type=Path)
    arguments = parser.parse_args()
    report = analyze(arguments.db)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(render_markdown(report), encoding="utf-8")
    if arguments.json_output:
        arguments.json_output.parent.mkdir(parents=True, exist_ok=True)
        arguments.json_output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, default=list), encoding="utf-8"
        )
    print(
        f"Wrote {arguments.output} "
        f"({report['methodology']['restaurant_count']} restaurants)"
    )


if __name__ == "__main__":
    main()
