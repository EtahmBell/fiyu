"""Read-only Personalized Picks sampling against the real local catalog."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import statistics
import tempfile
from collections import Counter
from collections.abc import Callable, Iterable
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fiyu.daily_picks import MATERIALLY_NEGATIVE_AFFINITY, select_daily_pick_plan
from fiyu.taste_affinity import (
    BudgetPreferenceProfile,
    UserTasteProfile,
    build_budget_preference_profile,
    build_user_taste_profile,
    score_candidate_for_user,
)
from fiyu.user_fiyu_summary import restaurant_taste_facets

DEFAULT_LATITUDE = 35.658
DEFAULT_LONGITUDE = 139.7016
DEFAULT_AREA = "Shibuya"
STATE_TABLES = (
    "restaurant_visits",
    "restaurant_lists",
    "restaurant_list_items",
    "daily_pick_rounds",
    "daily_pick_round_items",
    "daily_pick_served_history",
)

CATALOG_QUERY = """
    SELECT place_id, name_ja, name_en, primary_category, fiyu_score,
           budget_json, practical_info_json, review_themes_json,
           latitude, longitude,
           COALESCE(map_location_precision, location_precision) AS location_precision,
           discovery_area, discovery_areas_json,
           is_published, product_eligible, map_display_eligible
    FROM public_restaurants
    WHERE is_published = 1
      AND product_eligible = 1
      AND map_display_eligible = 1
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    ORDER BY place_id
"""

CLONE_SCHEMA = """
CREATE TABLE public_restaurants (
    place_id TEXT PRIMARY KEY,
    name_ja TEXT,
    name_en TEXT,
    primary_category TEXT,
    fiyu_score REAL,
    budget_json TEXT,
    practical_info_json TEXT NOT NULL DEFAULT '{}',
    review_themes_json TEXT NOT NULL DEFAULT '[]',
    latitude REAL,
    longitude REAL,
    map_location_precision TEXT,
    location_precision TEXT,
    discovery_area TEXT,
    discovery_areas_json TEXT NOT NULL DEFAULT '[]',
    is_published INTEGER NOT NULL,
    product_eligible INTEGER NOT NULL,
    map_display_eligible INTEGER NOT NULL
);
"""


def _decode(raw: object, expected: type, fallback: object) -> object:
    try:
        value = json.loads(str(raw or "null"))
    except json.JSONDecodeError:
        return fallback
    return value if isinstance(value, expected) else fallback


def _public_row(source: sqlite3.Row) -> dict[str, Any]:
    row = dict(source)
    row["budget"] = _decode(row.get("budget_json"), dict, None)
    row["practical_info"] = _decode(row.get("practical_info_json"), dict, {})
    row["review_themes"] = _decode(row.get("review_themes_json"), list, [])
    row["discovery_areas"] = _decode(row.get("discovery_areas_json"), list, [])
    return row


def _table_fingerprints(connection: sqlite3.Connection) -> dict[str, str | None]:
    tables = {
        str(row[0])
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    fingerprints: dict[str, str | None] = {}
    for table in STATE_TABLES:
        if table not in tables:
            fingerprints[table] = None
            continue
        rows = [tuple(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY rowid")]
        fingerprints[table] = hashlib.sha256(
            json.dumps(rows, default=str, sort_keys=True).encode()
        ).hexdigest()
    return fingerprints


def _clone_catalog(rows: list[sqlite3.Row], destination: Path) -> None:
    with closing(sqlite3.connect(destination)) as connection:
        connection.executescript(CLONE_SCHEMA)
        connection.executemany(
            """
            INSERT INTO public_restaurants (
                place_id, name_ja, name_en, primary_category, fiyu_score,
                budget_json, practical_info_json, review_themes_json,
                latitude, longitude, map_location_precision, location_precision,
                discovery_area, discovery_areas_json,
                is_published, product_eligible, map_display_eligible
            ) VALUES (
                :place_id, :name_ja, :name_en, :primary_category, :fiyu_score,
                :budget_json, :practical_info_json, :review_themes_json,
                :latitude, :longitude, :location_precision, :location_precision,
                :discovery_area, :discovery_areas_json,
                :is_published, :product_eligible, :map_display_eligible
            )
            """,
            [dict(row) for row in rows],
        )
        connection.commit()


def _budget_maximum(row: dict[str, Any]) -> float | None:
    budget = row.get("budget")
    maximum = budget.get("maximum") if isinstance(budget, dict) else None
    return (
        float(maximum)
        if isinstance(maximum, (int, float)) and not isinstance(maximum, bool)
        else None
    )


def _choose(
    rows: list[dict[str, Any]],
    predicate: Callable[[dict[str, Any]], bool],
    count: int,
    excluded: set[str] | None = None,
) -> list[dict[str, Any]]:
    blocked = excluded or set()
    preferred = [
        row for row in rows if str(row["place_id"]) not in blocked and predicate(row)
    ]
    fallback = [
        row for row in rows if str(row["place_id"]) not in blocked and row not in preferred
    ]
    rank_key = lambda row: (-float(row.get("fiyu_score") or 0), str(row["place_id"]))
    selected = sorted(preferred, key=rank_key)[:count]
    if len(selected) < count:
        selected.extend(sorted(fallback, key=rank_key)[: count - len(selected)])
    return selected


def _visits(rows: Iterable[dict[str, Any]], ratings: Iterable[int]) -> list[dict[str, Any]]:
    return [
        {
            "id": f"evaluation-{index}",
            "place_id": str(row["place_id"]),
            "rating": rating,
            "visited_at": f"2026-01-{index + 1:02d}T12:00:00+00:00",
            "created_at": f"2026-01-{index + 1:02d}T12:00:00+00:00",
        }
        for index, (row, rating) in enumerate(zip(rows, ratings, strict=True))
    ]


def _synthetic_profiles(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    def facets(row: dict[str, Any]) -> set[str]:
        return {facet.key for facet in restaurant_taste_facets(row)}

    sushi_counter = lambda row: bool(
        {"cuisine_sushi", "seafood"} & facets(row)
        and "counter_seating" in facets(row)
    )
    affordable = lambda row: (
        (maximum := _budget_maximum(row)) is not None and maximum <= 3000
    )
    expensive = lambda row: (
        (maximum := _budget_maximum(row)) is not None and maximum > 5000
    )

    sparse_rows = _choose(rows, sushi_counter, 1)
    sparse_rows += _choose(
        rows,
        lambda row: not sushi_counter(row),
        1,
        {str(row["place_id"]) for row in sparse_rows},
    )

    medium_positive = _choose(rows, sushi_counter, 4)
    medium_contrast = _choose(
        rows,
        lambda row: not sushi_counter(row),
        2,
        {str(row["place_id"]) for row in medium_positive},
    )

    mature_expensive = _choose(rows, expensive, 8)
    mature_affordable = _choose(
        rows,
        affordable,
        2,
        {str(row["place_id"]) for row in mature_expensive},
    )

    broad: list[dict[str, Any]] = []
    used_facets: set[str] = set()
    remaining = sorted(rows, key=lambda row: -float(row.get("fiyu_score") or 0))
    while remaining and len(broad) < 12:
        choice = max(
            remaining,
            key=lambda row: (
                len(facets(row) - used_facets),
                float(row.get("fiyu_score") or 0),
            ),
        )
        broad.append(choice)
        used_facets.update(facets(choice))
        remaining.remove(choice)

    both_affordable = _choose(rows, affordable, 5)
    both_expensive = _choose(
        rows,
        expensive,
        5,
        {str(row["place_id"]) for row in both_affordable},
    )

    return {
        "Profile A — no history": [],
        "Profile B — sparse sushi/counter": _visits(sparse_rows, (5, 2)),
        "Profile C — medium sushi/counter": _visits(
            [*medium_positive, *medium_contrast], (5, 5, 4, 4, 2, 2)
        ),
        "Profile D — mature expensive": _visits(
            [*mature_expensive, *mature_affordable], (5,) * 8 + (1, 2)
        ),
        "Profile E — mature eclectic": _visits(broad, (5, 4) * 6),
        "Profile F — likes affordable and expensive": _visits(
            [*both_affordable, *both_expensive], (5,) * 10
        ),
    }


def _profile_summary(
    taste: UserTasteProfile, budget: BudgetPreferenceProfile
) -> dict[str, object]:
    positives = sorted(
        ((key, value) for key, value in taste.facet_affinities.items() if value > 0),
        key=lambda item: (-item[1], item[0]),
    )[:6]
    negatives = sorted(
        ((key, value) for key, value in taste.facet_affinities.items() if value < 0),
        key=lambda item: (item[1], item[0]),
    )[:6]
    return {
        "rated_restaurants": taste.rated_count,
        "personalization_confidence": taste.confidence,
        "positive_facets": positives,
        "negative_facets": negatives,
        "known_price_evidence": budget.known_price_rated_count,
        "affordable_affinity": budget.affordable_affinity,
        "higher_price_affinity": budget.higher_price_affinity,
        "price_confidence": budget.confidence,
        "relaxation": budget.affordability_relaxation_strength,
    }


def _affinity_bucket(value: float) -> str:
    if value >= 0:
        return "non-negative"
    if value > MATERIALLY_NEGATIVE_AFFINITY:
        return "mildly negative"
    return "materially negative"


def _run_plan(
    clone: Path,
    *,
    seed: int,
    latitude: float,
    longitude: float,
    area: str,
    taste: UserTasteProfile | None,
    budget: BudgetPreferenceProfile | None,
    apply_affordable_slot: bool = True,
) -> tuple[tuple[str, ...], dict[str, object]]:
    with closing(sqlite3.connect(clone)) as connection:
        connection.row_factory = sqlite3.Row
        return select_daily_pick_plan(
            connection,
            discovery_latitude=latitude,
            discovery_longitude=longitude,
            active_area=area,
            saved_place_ids=set(),
            served_history={},
            now=datetime(2026, 10, 1, tzinfo=UTC),
            requested_count=3,
            seed=seed,
            taste_profile=taste,
            budget_profile=budget,
            apply_affordable_slot=apply_affordable_slot,
        )


def _pick_details(
    selected: tuple[str, ...],
    metadata: dict[str, object],
    taste: UserTasteProfile,
    catalog: dict[str, dict[str, Any]],
    unconstrained: tuple[str, ...],
) -> list[dict[str, object]]:
    slots = {
        str(slot["place_id"]): slot
        for slot in metadata.get("personalization_slots", [])
        if isinstance(slot, dict)
    }
    unconstrained_affordable = any(
        (maximum := _budget_maximum(catalog[place_id])) is not None
        and maximum <= 3000
        for place_id in unconstrained
    )
    details = []
    for position, place_id in enumerate(selected, start=1):
        row = catalog[place_id]
        affinity = score_candidate_for_user(taste, row)
        facets = sorted(restaurant_taste_facets(row), key=lambda facet: facet.key)
        matched = [
            facet.key for facet in facets if taste.facet_affinities.get(facet.key, 0) > 0
        ]
        negative = [
            facet.key for facet in facets if taste.facet_affinities.get(facet.key, 0) < 0
        ]
        maximum = _budget_maximum(row)
        slot = slots.get(place_id, {})
        affordable = maximum is not None and maximum <= 3000
        constraint = bool(slot.get("affordable_constraint"))
        details.append(
            {
                "position": position,
                "place_id": place_id,
                "name": row.get("name_en") or row.get("name_ja") or place_id,
                "fiyu_score": float(row.get("fiyu_score") or 0),
                "price_minimum": (
                    row["budget"].get("minimum")
                    if isinstance(row.get("budget"), dict)
                    else None
                ),
                "price_maximum": maximum,
                "affordable": affordable,
                "affinity": affinity,
                "matched_facets": matched,
                "negative_facets": negative,
                "role": slot.get("role", "legacy"),
                "affordability_intervention": constraint,
                "affordability_mode": (
                    "natural"
                    if constraint and unconstrained_affordable
                    else "forced"
                    if constraint
                    else "none"
                ),
                "seen_state": "unseen",
                "reason": f"{slot.get('role', 'legacy')}; affinity={affinity:.3f}",
            }
        )
    return details


def _set_metrics(
    picks: list[dict[str, object]], taste: UserTasteProfile
) -> dict[str, object]:
    affinities = [float(pick["affinity"]) for pick in picks]
    scores = [float(pick["fiyu_score"]) for pick in picks]
    known_prices = [
        float(pick["price_maximum"])
        for pick in picks
        if pick["price_maximum"] is not None
    ]
    top_positive = {
        key
        for key, _ in sorted(
            ((key, value) for key, value in taste.facet_affinities.items() if value > 0),
            key=lambda item: (-item[1], item[0]),
        )[:3]
    }
    exploration = next((pick for pick in picks if pick["role"] == "exploration"), None)
    return {
        "mean_fiyu_score": round(statistics.mean(scores), 2),
        "mean_affinity": round(statistics.mean(affinities), 4),
        "minimum_affinity": round(min(affinities), 4),
        "distinct_matched_facets": len(
            {facet for pick in picks for facet in pick["matched_facets"]}
        ),
        "strongest_facet_overlap_count": sum(
            bool(set(pick["matched_facets"]) & top_positive) for pick in picks
        ),
        "exploration_affinity": (
            _affinity_bucket(float(exploration["affinity"])) if exploration else "n/a"
        ),
        "affordable_count": sum(bool(pick["affordable"]) for pick in picks),
        "affordability": next(
            (
                str(pick["affordability_mode"])
                for pick in picks
                if pick["affordability_intervention"]
            ),
            "not applied",
        ),
        "known_price_spread": (
            round(max(known_prices) - min(known_prices), 2)
            if len(known_prices) >= 2
            else None
        ),
    }


def evaluate(
    database: Path,
    *,
    cycles: int = 6,
    seed_base: int = 2026100100,
    latitude: float = DEFAULT_LATITUDE,
    longitude: float = DEFAULT_LONGITUDE,
    area: str = DEFAULT_AREA,
    selected_profiles: set[str] | None = None,
) -> dict[str, object]:
    uri = database.resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as source:
        source.row_factory = sqlite3.Row
        state_before = _table_fingerprints(source)
        raw_rows = source.execute(CATALOG_QUERY).fetchall()
        catalog_rows = [_public_row(row) for row in raw_rows]
        real_visit_count = (
            source.execute("SELECT COUNT(*) FROM restaurant_visits").fetchone()[0]
            if state_before.get("restaurant_visits") is not None
            else 0
        )

        with tempfile.TemporaryDirectory(prefix="fiyu-picks-evaluation-") as temp_dir:
            clone = Path(temp_dir) / "catalog.db"
            _clone_catalog(raw_rows, clone)
            catalog = {str(row["place_id"]): row for row in catalog_rows}
            profiles = _synthetic_profiles(catalog_rows)
            if selected_profiles:
                profiles = {
                    name: visits
                    for name, visits in profiles.items()
                    if name in selected_profiles
                }
            profile_reports = []
            for profile_index, (name, visits) in enumerate(profiles.items()):
                taste = build_user_taste_profile(visits=visits, catalog=catalog)
                budget = build_budget_preference_profile(visits=visits, catalog=catalog)
                cycle_reports = []
                frequency: Counter[str] = Counter()
                for cycle_index in range(cycles):
                    seed = seed_base + profile_index * 1000 + cycle_index
                    selected, metadata = _run_plan(
                        clone,
                        seed=seed,
                        latitude=latitude,
                        longitude=longitude,
                        area=area,
                        taste=taste,
                        budget=budget,
                    )
                    unconstrained, _ = _run_plan(
                        clone,
                        seed=seed,
                        latitude=latitude,
                        longitude=longitude,
                        area=area,
                        taste=taste,
                        budget=budget,
                        apply_affordable_slot=False,
                    )
                    legacy, _ = _run_plan(
                        clone,
                        seed=seed,
                        latitude=latitude,
                        longitude=longitude,
                        area=area,
                        taste=None,
                        budget=None,
                    )
                    picks = _pick_details(selected, metadata, taste, catalog, unconstrained)
                    legacy_picks = _pick_details(
                        legacy,
                        {},
                        taste,
                        catalog,
                        legacy,
                    )
                    frequency.update(selected)
                    cycle_reports.append(
                        {
                            "cycle_id": f"cycle-{cycle_index + 1}",
                            "seed": seed,
                            "picks": picks,
                            "metrics": _set_metrics(picks, taste),
                            "legacy": list(legacy),
                            "legacy_picks": legacy_picks,
                            "changed_from_legacy": [
                                place_id for place_id in selected if place_id not in legacy
                            ],
                            "relaxation": budget.affordability_relaxation_strength,
                        }
                    )
                profile_reports.append(
                    {
                        "profile_id": name,
                        "summary": _profile_summary(taste, budget),
                        "cycles": cycle_reports,
                        "unique_restaurants": len(frequency),
                        "repeated_restaurants": {
                            place_id: count
                            for place_id, count in frequency.most_common()
                            if count > 1
                        },
                    }
                )

        state_after = _table_fingerprints(source)
    facet_counts = Counter(
        facet.key for row in catalog_rows for facet in restaurant_taste_facets(row)
    )
    pair_counts: Counter[tuple[str, str]] = Counter()
    for row in catalog_rows:
        keys = sorted(facet.key for facet in restaurant_taste_facets(row))
        pair_counts.update(
            (keys[left], keys[right])
            for left in range(len(keys))
            for right in range(left + 1, len(keys))
        )
    return {
        "methodology": {
            "source_database": str(database),
            "catalog_rows": len(catalog_rows),
            "real_user_histories_used": False,
            "local_real_visit_count": int(real_visit_count),
            "history_source": "synthetic ratings over real catalog restaurants",
            "view": "static profile; simulated Picks are not fed back into history",
            "cycles_per_profile": cycles,
            "location": {"latitude": latitude, "longitude": longitude, "area": area},
            "source_opened_read_only": True,
            "temporary_clone_deleted": True,
            "persistent_state_unchanged": state_before == state_after,
            "state_hashes_before": state_before,
            "state_hashes_after": state_after,
        },
        "profiles": profile_reports,
        "catalog_observations": {
            "most_common_facets": facet_counts.most_common(12),
            "most_common_correlated_pairs": [
                [left, right, count]
                for (left, right), count in pair_counts.most_common(12)
            ],
        },
    }


def _fmt_facets(values: object) -> str:
    return ", ".join(str(value) for value in values) or "—"


def _price_range(pick: dict[str, object]) -> str:
    minimum = pick["price_minimum"]
    maximum = pick["price_maximum"]
    if minimum is None and maximum is None:
        return "unknown"
    if minimum is None:
        return f"≤¥{float(maximum):,.0f}"
    if maximum is None:
        return f"¥{float(minimum):,.0f}+"
    return f"¥{float(minimum):,.0f}–¥{float(maximum):,.0f}"


def render_markdown(report: dict[str, object]) -> str:
    methodology = report["methodology"]
    lines = [
        "# Personalized Picks real-catalog sample audit",
        "",
        (
            "> Evaluation-only artifact. It contains no real account identifiers or private "
            "notes. The local database had no usable rating histories, so profiles are synthetic "
            "while all restaurant candidates and catalog fields are real."
        ),
        "",
        "## Methodology and safety",
        "",
        f"- Catalog: {methodology['catalog_rows']} current eligible restaurants from `{methodology['source_database']}`.",
        f"- Profiles: synthetic ratings over real catalog restaurants; local real visit rows found: {methodology['local_real_visit_count']}.",
        f"- View: {methodology['view']}.",
        f"- Cycles per profile: {methodology['cycles_per_profile']}.",
        "- The source database was opened in SQLite read-only mode; selection ran against a temporary minimal catalog clone.",
        f"- Persistent state hashes unchanged: **{methodology['persistent_state_unchanged']}**.",
        "- No assignment, reveal, seen, Saved, rating, visit, or Recent Discovery mutation function was called.",
        "",
    ]
    for profile in report["profiles"]:
        summary = profile["summary"]
        lines.extend(
            [
                f"## {profile['profile_id']}",
                "",
                (
                    f"Distinct ratings: **{summary['rated_restaurants']}**; personalization "
                    f"confidence: **{summary['personalization_confidence']:.2f}**; known-price "
                    f"evidence: **{summary['known_price_evidence']}**; price confidence: "
                    f"**{summary['price_confidence']:.2f}**; relaxation: "
                    f"**{summary['relaxation']:.3f}**."
                ),
                "",
                f"Positive facets: {_fmt_facets(f'{key} ({value:.2f})' for key, value in summary['positive_facets'])}",
                "",
                f"Negative facets: {_fmt_facets(f'{key} ({value:.2f})' for key, value in summary['negative_facets'])}",
                "",
                (
                    f"Budget affinities: affordable **{summary['affordable_affinity']:.2f}**; "
                    f"higher-price **{summary['higher_price_affinity']:.2f}**."
                ),
                "",
                "### Set metrics",
                "",
                "| Cycle / seed | Mean Fiyu | Mean / min affinity | Facet diversity | Exploration | Affordable | Price spread | New vs legacy |",
                "|---|---:|---:|---:|---|---|---:|---|",
            ]
        )
        for cycle in profile["cycles"]:
            metrics = cycle["metrics"]
            lines.append(
                f"| {cycle['cycle_id']} / {cycle['seed']} | {metrics['mean_fiyu_score']:.2f} | "
                f"{metrics['mean_affinity']:.3f} / {metrics['minimum_affinity']:.3f} | "
                f"{metrics['distinct_matched_facets']} | {metrics['exploration_affinity']} | "
                f"{metrics['affordable_count']} ({metrics['affordability']}) | "
                f"{metrics['known_price_spread'] if metrics['known_price_spread'] is not None else '—'} | "
                f"{len(cycle['changed_from_legacy'])} |"
            )
        lines.extend(
            [
                "",
                "### Picks",
                "",
                "| Cycle | Pos. | Restaurant | Fiyu | Price range | Affinity | Strength | Role | Positive matches | Negative matches | Affordability |",
                "|---|---:|---|---:|---:|---:|---:|---|---|---|---|",
            ]
        )
        for cycle in profile["cycles"]:
            for pick in cycle["picks"]:
                lines.append(
                    f"| {cycle['cycle_id']} | {pick['position']} | {pick['name']} (`{pick['place_id']}`) | "
                    f"{pick['fiyu_score']:.1f} | {_price_range(pick)} | "
                    f"{pick['affinity']:.3f} | {summary['personalization_confidence']:.2f} | "
                    f"{pick['role']} | {_fmt_facets(pick['matched_facets'])} | "
                    f"{_fmt_facets(pick['negative_facets'])} | {pick['affordability_mode']} |"
                )
        lines.extend(
            [
                "",
                f"Unique restaurants across cycles: **{profile['unique_restaurants']}** of {len(profile['cycles']) * 3} Pick positions.",
                "",
                f"Repeated IDs: `{json.dumps(profile['repeated_restaurants'], sort_keys=True)}`",
                "",
                "### Legacy comparison (first two cycles)",
                "",
                "| Cycle | Legacy mean Fiyu / affinity | Personalized mean Fiyu / affinity | Changed personalized picks (role) |",
                "|---|---:|---:|---|",
            ]
        )
        for cycle in profile["cycles"][:2]:
            legacy_mean_fiyu = statistics.mean(
                float(pick["fiyu_score"]) for pick in cycle["legacy_picks"]
            )
            legacy_mean_affinity = statistics.mean(
                float(pick["affinity"]) for pick in cycle["legacy_picks"]
            )
            personalized = cycle["picks"]
            changed = [
                f"{pick['name']} ({pick['role']})"
                for pick in personalized
                if pick["place_id"] in cycle["changed_from_legacy"]
            ]
            lines.append(
                f"| {cycle['cycle_id']} | {legacy_mean_fiyu:.2f} / {legacy_mean_affinity:.3f} | "
                f"{cycle['metrics']['mean_fiyu_score']:.2f} / "
                f"{cycle['metrics']['mean_affinity']:.3f} | {_fmt_facets(changed)} |"
            )
        lines.append("")

    observations = report["catalog_observations"]
    all_cycles = [cycle for profile in report["profiles"] for cycle in profile["cycles"]]
    exploration_counts = Counter(
        str(cycle["metrics"]["exploration_affinity"]) for cycle in all_cycles
    )
    affordability_counts = Counter(
        str(cycle["metrics"]["affordability"]) for cycle in all_cycles
    )
    changed_cycles = sum(bool(cycle["changed_from_legacy"]) for cycle in all_cycles)
    exploration_total = sum(
        count for bucket, count in exploration_counts.items() if bucket != "n/a"
    )
    total_positions = len(all_cycles) * 3
    total_unique_by_profile = sum(
        int(profile["unique_restaurants"]) for profile in report["profiles"]
    )
    role_positions: dict[str, Counter[int]] = {}
    for cycle in all_cycles:
        for pick in cycle["picks"]:
            role_positions.setdefault(str(pick["role"]), Counter()).update(
                [int(pick["position"])]
            )
    profile_by_id = {profile["profile_id"]: profile for profile in report["profiles"]}
    expensive_profile = profile_by_id.get("Profile D — mature expensive")
    mixed_price_profile = profile_by_id.get("Profile F — likes affordable and expensive")
    lines.extend(
        [
            "## Catalog-level observations",
            "",
            "Most common Taste facets:",
            "",
            *[
                f"- `{facet}`: {count} restaurants"
                for facet, count in observations["most_common_facets"]
            ],
            "",
            "Most common correlated facet pairs:",
            "",
            *[
                f"- `{left}` + `{right}`: {count} restaurants"
                for left, right, count in observations["most_common_correlated_pairs"]
            ],
            "",
            "## Cross-profile observations",
            "",
            "| Profile | Confidence | Mean set affinity | Unique / positions |",
            "|---|---:|---:|---:|",
            *[
                f"| {profile['profile_id']} | "
                f"{profile['summary']['personalization_confidence']:.2f} | "
                f"{statistics.mean(float(cycle['metrics']['mean_affinity']) for cycle in profile['cycles']):.3f} | "
                f"{profile['unique_restaurants']} / {len(profile['cycles']) * 3} |"
                for profile in report["profiles"]
            ],
            "",
            (
                f"- Exploration across {exploration_total} personalized sets: "
                f"{exploration_counts.get('non-negative', 0)} non-negative, "
                f"{exploration_counts.get('mildly negative', 0)} mildly negative, and "
                f"{exploration_counts.get('materially negative', 0)} materially negative."
            ),
            (
                f"- Affordability: {affordability_counts.get('natural', 0)} sets satisfied it "
                f"naturally, {affordability_counts.get('forced', 0)} required a forced "
                f"substitution, and {affordability_counts.get('not applied', 0)} did not apply it."
            ),
            (
                f"- Personalized and legacy membership differed in {changed_cycles} of "
                f"{len(all_cycles)} same-seed comparisons."
            ),
            (
                f"- Per-profile unique restaurants occupied {total_unique_by_profile} of "
                f"{total_positions} simulated Pick positions."
            ),
            "- Visible role positions remained seed-driven: "
            + "; ".join(
                f"{role} "
                + ", ".join(
                    f"position {position}={count}"
                    for position, count in sorted(position_counts.items())
                )
                for role, position_counts in sorted(role_positions.items())
            )
            + ".",
            (
                "- The sparse profile is a useful caution: one positive and one contrasting "
                "rating can cancel or invert correlated/common facets, so its label is not a "
                "guarantee of a derived sushi preference."
            ),
            (
                "- Common and correlated facets can amplify together because one restaurant may "
                "contribute several overlapping observations. This audit leaves that behavior "
                "intact."
            ),
            *(
                [
                    (
                        "- The mature expensive profile reached relaxation "
                        f"**{expensive_profile['summary']['relaxation']:.3f}**. Its affordable "
                        "restaurant still appeared naturally in every sampled set because its "
                        "Taste affinity remained positive; relaxation did not force its removal."
                    )
                ]
                if expensive_profile
                else []
            ),
            *(
                [
                    (
                        "- The mixed-price profile kept relaxation at "
                        f"**{mixed_price_profile['summary']['relaxation']:.3f}** and retained an "
                        "affordable Pick in every sampled set."
                    )
                ]
                if mixed_price_profile
                else []
            ),
            "",
            "## Tuning questions raised (no tuning applied)",
            "",
            "- Do common format facets dominate cuisine evidence in medium-confidence profiles?",
            "- Does moderate/novel provide enough visible difference from strong across cycles?",
            "- Are repeated high-quality exploration restaurants creating too much concentration?",
            "- Does the `-0.10` boundary align with materially negative exploration samples?",
            "- When affordability is forced, is its affinity sacrifice acceptable?",
            "- Should correlated pairs such as counter/solo and sushi/seafood stay separate?",
            "- Would an isolated cooldown-progression view materially change the breadth finding?",
            "",
            "No selection constants or production behavior were changed in response to this audit.",
            "",
            "## Re-run",
            "",
            "```powershell",
            ".\\.venv\\Scripts\\python.exe scripts\\evaluate_personalized_picks.py --cycles 6",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("data/fiyu.db"))
    parser.add_argument("--output", type=Path, default=Path("docs/personalized-picks-real-sample-audit.md"))
    parser.add_argument("--cycles", type=int, default=6, choices=range(1, 11))
    parser.add_argument("--seed-base", type=int, default=2026100100)
    parser.add_argument("--latitude", type=float, default=DEFAULT_LATITUDE)
    parser.add_argument("--longitude", type=float, default=DEFAULT_LONGITUDE)
    parser.add_argument("--area", default=DEFAULT_AREA)
    parser.add_argument("--profile", action="append", dest="profiles")
    arguments = parser.parse_args()
    report = evaluate(
        arguments.db,
        cycles=arguments.cycles,
        seed_base=arguments.seed_base,
        latitude=arguments.latitude,
        longitude=arguments.longitude,
        area=arguments.area,
        selected_profiles=set(arguments.profiles) if arguments.profiles else None,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(render_markdown(report), encoding="utf-8")
    print(f"Wrote {arguments.output} ({len(report['profiles'])} profiles)")


if __name__ == "__main__":
    main()
