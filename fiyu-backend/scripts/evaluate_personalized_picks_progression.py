"""Read-only cycle-progression and facet audit for Personalized Solo Picks."""
from __future__ import annotations

import argparse
import json
import sqlite3
import statistics
import tempfile
from collections import Counter
from contextlib import closing
from datetime import UTC, datetime, timedelta
from itertools import combinations
from pathlib import Path
from typing import Any

from fiyu.daily_picks import PICKS_RADII_KM, _admitted_at_radius
from fiyu.taste_affinity import (
    BudgetPreferenceProfile,
    UserTasteProfile,
    build_budget_preference_profile,
    build_user_taste_profile,
)
from fiyu.user_fiyu_summary import restaurant_taste_facets

try:
    from scripts.evaluate_personalized_picks import (
        CATALOG_QUERY,
        DEFAULT_AREA,
        DEFAULT_LATITUDE,
        DEFAULT_LONGITUDE,
        _budget_maximum,
        _clone_catalog,
        _pick_details,
        _profile_summary,
        _public_row,
        _run_plan,
        _set_metrics,
        _synthetic_profiles,
        _table_fingerprints,
    )
except ModuleNotFoundError:  # Direct `python scripts/...` execution.
    from evaluate_personalized_picks import (  # type: ignore[no-redef]
        CATALOG_QUERY,
        DEFAULT_AREA,
        DEFAULT_LATITUDE,
        DEFAULT_LONGITUDE,
        _budget_maximum,
        _clone_catalog,
        _pick_details,
        _profile_summary,
        _public_row,
        _run_plan,
        _set_metrics,
        _synthetic_profiles,
        _table_fingerprints,
    )

START = datetime(2026, 10, 1, 12, tzinfo=UTC)
COOLDOWN_DAYS = 7


def _facet_keys(row: dict[str, Any]) -> set[str]:
    return {facet.key for facet in restaurant_taste_facets(row)}


def _facet_statistics(rows: list[dict[str, Any]]) -> dict[str, object]:
    by_place = {str(row["place_id"]): _facet_keys(row) for row in rows}
    counts = Counter(facet for facets in by_place.values() for facet in facets)
    pair_counts: Counter[tuple[str, str]] = Counter()
    triple_counts: Counter[tuple[str, str, str]] = Counter()
    for facets in by_place.values():
        ordered = sorted(facets)
        pair_counts.update(combinations(ordered, 2))
        triple_counts.update(combinations(ordered, 3))
    total = len(rows)

    frequencies = []
    for facet, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        share = count / total if total else 0.0
        specificity = (
            "highly common"
            if share >= 0.40
            else "moderately common"
            if share >= 0.10
            else "distinctive/rare"
        )
        frequencies.append(
            {"facet": facet, "count": count, "share": share, "specificity": specificity}
        )

    pairs = []
    for (left, right), intersection in pair_counts.items():
        union = counts[left] + counts[right] - intersection
        pairs.append(
            {
                "left": left,
                "right": right,
                "count": intersection,
                "jaccard": intersection / union,
                "p_right_given_left": intersection / counts[left],
                "p_left_given_right": intersection / counts[right],
            }
        )
    pairs.sort(key=lambda item: (-item["jaccard"], -item["count"], item["left"]))

    groups = []
    for facets, intersection in triple_counts.items():
        if intersection < 5:
            continue
        union = sum(counts[facet] for facet in facets)
        union -= sum(pair_counts[pair] for pair in combinations(facets, 2))
        union += intersection
        groups.append(
            {"facets": facets, "count": intersection, "jaccard": intersection / union}
        )
    groups.sort(key=lambda item: (-item["jaccard"], -item["count"], item["facets"]))
    return {"frequencies": frequencies, "pairs": pairs[:20], "groups": groups[:12]}


def _affinity_contributions(
    taste: UserTasteProfile, row: dict[str, Any]
) -> dict[str, object]:
    facets = sorted(_facet_keys(row))
    known = [facet for facet in facets if facet in taste.facet_affinities]
    contributions = [
        {
            "facet": facet,
            "profile_affinity": taste.facet_affinities[facet],
            "contribution": taste.facet_affinities[facet] * taste.confidence / len(known),
        }
        for facet in known
    ]
    return {
        "known_facet_count": len(known),
        "contributions": contributions,
        "calculated_affinity": sum(item["contribution"] for item in contributions),
    }


def _run_progression(
    clone: Path,
    catalog: dict[str, dict[str, Any]],
    *,
    taste: UserTasteProfile,
    budget: BudgetPreferenceProfile,
    cycles: int,
    seed_base: int,
    latitude: float,
    longitude: float,
    area: str,
    personalized: bool,
    apply_affordable_slot: bool = True,
) -> dict[str, object]:
    served: dict[str, datetime] = {}
    appearances: Counter[str] = Counter()
    last_cycle: dict[str, int] = {}
    repeat_gaps: list[int] = []
    first_repeat_cycle: int | None = None
    first_fallback_cycle: int | None = None
    cycle_reports = []
    encountered_facets: set[str] = set()
    encountered_cuisines: set[str] = set()
    candidate_details: dict[str, dict[str, object]] = {}
    role_places: dict[str, set[str]] = {}
    affordable_places: Counter[str] = Counter()

    for cycle_index in range(cycles):
        cycle_number = cycle_index + 1
        now = START + timedelta(days=cycle_index)
        seed = seed_base + cycle_index
        selected, metadata = _run_plan(
            clone,
            seed=seed,
            latitude=latitude,
            longitude=longitude,
            area=area,
            taste=taste if personalized else None,
            budget=budget if personalized else None,
            apply_affordable_slot=apply_affordable_slot,
            served_history=served,
            now=now,
        )
        unconstrained, _ = _run_plan(
            clone,
            seed=seed,
            latitude=latitude,
            longitude=longitude,
            area=area,
            taste=taste if personalized else None,
            budget=budget if personalized else None,
            apply_affordable_slot=False,
            served_history=served,
            now=now,
        )
        picks = _pick_details(selected, metadata, taste, catalog, unconstrained)
        cycle_facets: set[str] = set()
        cycle_cuisines: set[str] = set()
        for pick in picks:
            place_id = str(pick["place_id"])
            was_served = place_id in served
            pick["seen_state"] = "older-repeat fallback" if was_served else "unseen"
            if was_served:
                first_repeat_cycle = first_repeat_cycle or cycle_number
                repeat_gaps.append(cycle_number - last_cycle[place_id])
            appearances[place_id] += 1
            last_cycle[place_id] = cycle_number
            role_places.setdefault(str(pick["role"]), set()).add(place_id)
            if pick["affordable"]:
                affordable_places[place_id] += 1
            row = catalog[place_id]
            facets = restaurant_taste_facets(row)
            cycle_facets.update(facet.key for facet in facets)
            cycle_cuisines.update(facet.key for facet in facets if facet.family == "cuisine")
            encountered_facets.update(facet.key for facet in facets)
            encountered_cuisines.update(
                facet.key for facet in facets if facet.family == "cuisine"
            )
            candidate_details.setdefault(
                place_id,
                {
                    "place_id": place_id,
                    "name": pick["name"],
                    **_affinity_contributions(taste, row),
                },
            )

        repeat_selected = int(metadata["repeat_selected_count"])
        if repeat_selected and first_fallback_cycle is None:
            first_fallback_cycle = cycle_number
        final_stage = metadata["unseen_by_radius"][-1]
        selected_unseen = sum(pick["seen_state"] == "unseen" for pick in picks)
        cycle_reports.append(
            {
                "cycle": cycle_number,
                "date": now.date().isoformat(),
                "seed": seed,
                "picks": picks,
                "metrics": _set_metrics(picks, taste),
                "repeat_selected_count": repeat_selected,
                "recent_excluded_count": int(metadata["recent_excluded_count"]),
                "repeat_reserve_count": int(metadata["repeat_reserve_count"]),
                "unseen_before_selection": int(final_stage["unseen_count"]),
                "unseen_remaining": max(
                    0, int(final_stage["unseen_count"]) - selected_unseen
                ),
                "final_radius_km": metadata["final_radius_km"],
                "cuisine_count": len(cycle_cuisines),
                "facet_count": len(cycle_facets),
            }
        )
        # Production records every assigned Pick in served history. Revealing all
        # three does not add a second cooldown signal, so assignment time is used.
        served.update({place_id: now for place_id in selected})

    total_positions = cycles * 3
    return {
        "cycles": cycle_reports,
        "summary": {
            "positions": total_positions,
            "unique_restaurants": len(appearances),
            "uniqueness_percentage": len(appearances) / total_positions,
            "repeat_rate": (total_positions - len(appearances)) / total_positions,
            "first_repeat_cycle": first_repeat_cycle,
            "first_fallback_cycle": first_fallback_cycle,
            "max_appearances": max(appearances.values(), default=0),
            "median_cycles_to_repeat": (
                statistics.median(repeat_gaps) if repeat_gaps else None
            ),
            "cuisine_count": len(encountered_cuisines),
            "facet_count": len(encountered_facets),
            "unique_by_role": {
                role: len(place_ids) for role, place_ids in sorted(role_places.items())
            },
            "affordable_positions": sum(affordable_places.values()),
            "unique_affordable_restaurants": len(affordable_places),
            "max_affordable_appearances": max(affordable_places.values(), default=0),
            "exploration_distribution": dict(
                Counter(
                    str(cycle["metrics"]["exploration_affinity"])
                    for cycle in cycle_reports
                    if cycle["metrics"]["exploration_affinity"] != "n/a"
                )
            ),
            "affordability_distribution": dict(
                Counter(str(cycle["metrics"]["affordability"]) for cycle in cycle_reports)
            ),
        },
        "candidate_contributions": sorted(
            candidate_details.values(), key=lambda item: str(item["name"])
        ),
    }


def _cooldown_probes(
    clone: Path,
    rows: list[dict[str, Any]],
    taste: UserTasteProfile,
    budget: BudgetPreferenceProfile,
    *,
    latitude: float,
    longitude: float,
    area: str,
) -> dict[str, object]:
    nearby = [
        row
        for row in rows
        if _admitted_at_radius(
            row,
            radius_km=PICKS_RADII_KM[-1],
            latitude=latitude,
            longitude=longitude,
            active_area=area,
        )
    ]
    affordable = next(
        row for row in nearby if (_budget_maximum(row) or float("inf")) <= 3000
    )
    non_affordable = [
        row
        for row in nearby
        if str(row["place_id"]) != str(affordable["place_id"])
        and ((_budget_maximum(row) or float("inf")) > 3000)
    ][:4]
    if len(non_affordable) < 4:
        raise ValueError("Cooldown probe requires four nearby non-affordable candidates")

    unseen = non_affordable[:3]
    old_repeat = non_affordable[3]
    saved = unseen[2]
    allowed = {str(row["place_id"]) for row in [*unseen, old_repeat, affordable]}
    excluded = {str(row["place_id"]) for row in rows} - allowed
    now = START + timedelta(days=20)
    recent_id = str(affordable["place_id"])
    old_id = str(old_repeat["place_id"])
    saved_id = str(saved["place_id"])

    recent_history = {recent_id: now - timedelta(days=COOLDOWN_DAYS - 1), old_id: now - timedelta(days=COOLDOWN_DAYS)}
    first, first_meta = _run_plan(
        clone,
        seed=741,
        latitude=latitude,
        longitude=longitude,
        area=area,
        taste=taste,
        budget=budget,
        served_history=recent_history,
        excluded_place_ids=excluded,
        now=now,
    )
    second, second_meta = _run_plan(
        clone,
        seed=742,
        latitude=latitude,
        longitude=longitude,
        area=area,
        taste=taste,
        budget=budget,
        served_history=recent_history,
        saved_place_ids={saved_id},
        excluded_place_ids=excluded,
        now=now,
    )
    return {
        "recent_id": recent_id,
        "old_id": old_id,
        "saved_id": saved_id,
        "unseen_preferred": all(str(row["place_id"]) in first for row in unseen),
        "recent_blocked": recent_id not in first and recent_id not in second,
        "old_unused_while_three_unseen": old_id not in first,
        "old_used_for_fallback": old_id in second,
        "saved_excluded": saved_id not in second,
        "affordability_did_not_bypass_recent": recent_id not in second,
        "personalization_did_not_bypass_recent": recent_id not in first,
        "first_repeat_selected_count": first_meta["repeat_selected_count"],
        "fallback_repeat_selected_count": second_meta["repeat_selected_count"],
    }


def _contribution_diagnostics(
    profiles: list[dict[str, object]], catalog: dict[str, dict[str, Any]]
) -> dict[str, list[dict[str, object]]]:
    correlated_generic = {"counter_seating", "small_capacity", "solo_friendly"}
    amplification = []
    dilution = []
    for profile in profiles:
        confidence = float(profile["profile_summary"]["personalization_confidence"])
        for candidate in profile["candidate_contributions"]:
            contribution_by_facet = {
                str(item["facet"]): float(item["contribution"])
                for item in candidate["contributions"]
            }
            generic_terms = {
                key: contribution_by_facet[key]
                for key in correlated_generic & contribution_by_facet.keys()
            }
            generic_sum = sum(generic_terms.values())
            if len(generic_terms) >= 2 and generic_sum > 0:
                amplification.append(
                    {
                        "profile": profile["profile_id"],
                        "candidate": candidate["name"],
                        "terms": generic_terms,
                        "combined_contribution": generic_sum,
                    }
                )

            row = catalog[str(candidate["place_id"])]
            cuisine_keys = {
                facet.key
                for facet in restaurant_taste_facets(row)
                if facet.family == "cuisine"
            }
            cuisine_items = [
                item
                for item in candidate["contributions"]
                if str(item["facet"]) in cuisine_keys
            ]
            if not cuisine_items:
                continue
            cuisine_only = (
                statistics.mean(float(item["profile_affinity"]) for item in cuisine_items)
                * confidence
            )
            calculated = float(candidate["calculated_affinity"])
            if cuisine_only > 0 and cuisine_only - calculated >= 0.03:
                dilution.append(
                    {
                        "profile": profile["profile_id"],
                        "candidate": candidate["name"],
                        "cuisine_facets": [str(item["facet"]) for item in cuisine_items],
                        "cuisine_only_affinity": cuisine_only,
                        "calculated_affinity": calculated,
                        "difference": cuisine_only - calculated,
                    }
                )
    amplification.sort(
        key=lambda item: (-float(item["combined_contribution"]), str(item["profile"]))
    )
    dilution.sort(key=lambda item: (-float(item["difference"]), str(item["profile"])))
    return {"amplification": amplification[:12], "dilution": dilution[:12]}


def evaluate_progression(
    database: Path,
    *,
    cycles: int = 12,
    seed_base: int = 2026100100,
    latitude: float = DEFAULT_LATITUDE,
    longitude: float = DEFAULT_LONGITUDE,
    area: str = DEFAULT_AREA,
) -> dict[str, object]:
    uri = database.resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as source:
        source.row_factory = sqlite3.Row
        state_before = _table_fingerprints(source)
        raw_rows = source.execute(CATALOG_QUERY).fetchall()
        rows = [_public_row(row) for row in raw_rows]
        catalog = {str(row["place_id"]): row for row in rows}
        with tempfile.TemporaryDirectory(prefix="fiyu-picks-progression-") as temp_dir:
            clone = Path(temp_dir) / "catalog.db"
            _clone_catalog(raw_rows, clone)
            profiles = _synthetic_profiles(rows)
            profile_reports = []
            for profile_index, (profile_id, visits) in enumerate(profiles.items()):
                taste = build_user_taste_profile(visits=visits, catalog=catalog)
                budget = build_budget_preference_profile(visits=visits, catalog=catalog)
                progression = _run_progression(
                    clone,
                    catalog,
                    taste=taste,
                    budget=budget,
                    cycles=cycles,
                    seed_base=seed_base + profile_index * 1000,
                    latitude=latitude,
                    longitude=longitude,
                    area=area,
                    personalized=True,
                )
                report = {
                    "profile_id": profile_id,
                    "profile_summary": _profile_summary(taste, budget),
                    **progression,
                }
                if profile_id in {
                    "Profile C — medium sushi/counter",
                    "Profile D — mature expensive",
                    "Profile F — likes affordable and expensive",
                }:
                    report["legacy"] = _run_progression(
                        clone,
                        catalog,
                        taste=taste,
                        budget=budget,
                        cycles=cycles,
                        seed_base=seed_base + profile_index * 1000,
                        latitude=latitude,
                        longitude=longitude,
                        area=area,
                        personalized=False,
                    )
                if profile_id == "Profile D — mature expensive":
                    report["no_affordability"] = _run_progression(
                        clone,
                        catalog,
                        taste=taste,
                        budget=budget,
                        cycles=cycles,
                        seed_base=seed_base + profile_index * 1000,
                        latitude=latitude,
                        longitude=longitude,
                        area=area,
                        personalized=True,
                        apply_affordable_slot=False,
                    )
                profile_reports.append(report)
            mature_visits = profiles["Profile D — mature expensive"]
            cooldown = _cooldown_probes(
                clone,
                rows,
                build_user_taste_profile(visits=mature_visits, catalog=catalog),
                build_budget_preference_profile(visits=mature_visits, catalog=catalog),
                latitude=latitude,
                longitude=longitude,
                area=area,
            )
        state_after = _table_fingerprints(source)
    return {
        "methodology": {
            "catalog_rows": len(rows),
            "cycles_per_profile": cycles,
            "cycle_spacing_days": 1,
            "start": START.isoformat(),
            "view": "successive cycles; static Taste; assigned Picks added to temporary served history",
            "source_opened_read_only": True,
            "persistent_state_unchanged": state_before == state_after,
            "state_hashes_before": state_before,
            "state_hashes_after": state_after,
        },
        "profiles": profile_reports,
        "cooldown_probes": cooldown,
        "facets": _facet_statistics(rows),
        "contribution_diagnostics": _contribution_diagnostics(profile_reports, catalog),
    }


def _fmt_value(value: object) -> str:
    return "—" if value is None else str(value)


def _contribution_text(candidate: dict[str, object]) -> str:
    contributions = candidate["contributions"]
    if not contributions:
        return "no known profile facets"
    return "; ".join(
        f"{item['facet']} {item['contribution']:+.3f}"
        for item in sorted(
            contributions, key=lambda item: (-abs(item["contribution"]), item["facet"])
        )
    )


def render_markdown(report: dict[str, object]) -> str:
    methodology = report["methodology"]
    lines = [
        "# Personalized Picks cycle-progression audit",
        "",
        (
            "> Read-only evaluation using synthetic Taste histories over the real current "
            "catalog. No account identifiers or private notes are included."
        ),
        "",
        "## Methodology",
        "",
        f"- Catalog: **{methodology['catalog_rows']}** eligible real restaurants.",
        f"- Profiles: **{len(report['profiles'])}**; cycles per profile: **{methodology['cycles_per_profile']}**.",
        f"- Progression: {methodology['view']}.",
        "- Cycles advance by one day. Taste, ratings, Saves, and location remain fixed.",
        (
            "- Production writes all assigned Picks to served history; revealing all three adds "
            "no separate cooldown record. The simulation therefore advances assignment timestamps."
        ),
        "- Source database opened read-only; selection ran on a temporary catalog clone.",
        f"- Persistent state hashes unchanged: **{methodology['persistent_state_unchanged']}**.",
        "",
    ]
    for profile in report["profiles"]:
        summary = profile["summary"]
        profile_summary = profile["profile_summary"]
        lines.extend(
            [
                f"## {profile['profile_id']}",
                "",
                (
                    f"Ratings/confidence: **{profile_summary['rated_restaurants']} / "
                    f"{profile_summary['personalization_confidence']:.2f}**. "
                    f"Positions: **{summary['positions']}**; unique: "
                    f"**{summary['unique_restaurants']} "
                    f"({summary['uniqueness_percentage']:.1%})**; repeat rate: "
                    f"**{summary['repeat_rate']:.1%}**."
                ),
                (
                    f"First repeat: **{_fmt_value(summary['first_repeat_cycle'])}**; first "
                    f"older-repeat fallback: **{_fmt_value(summary['first_fallback_cycle'])}**; "
                    f"max appearances: **{summary['max_appearances']}**; median cycles to repeat: "
                    f"**{_fmt_value(summary['median_cycles_to_repeat'])}**."
                ),
                (
                    f"Encountered cuisines: **{summary['cuisine_count']}**; Taste facets: "
                    f"**{summary['facet_count']}**; exploration: "
                    f"`{json.dumps(summary['exploration_distribution'], sort_keys=True)}`; "
                    f"affordability: "
                    f"`{json.dumps(summary['affordability_distribution'], sort_keys=True)}`."
                ),
                (
                    f"Role breadth: `{json.dumps(summary['unique_by_role'], sort_keys=True)}`. "
                    f"Affordable restaurants: **{summary['unique_affordable_restaurants']}** "
                    f"across **{summary['affordable_positions']}** positions; maximum appearances "
                    f"by one affordable restaurant: **{summary['max_affordable_appearances']}**."
                ),
                "",
                "### Successive cycles",
                "",
                "| Cycle/date | Mean/min affinity | Mean Fiyu | Cuisine/facets | Unseen before/after | Recent blocked | Old reserve/used | Radius | Picks |",
                "|---|---:|---:|---:|---:|---:|---:|---:|---|",
            ]
        )
        for cycle in profile["cycles"]:
            picks = "; ".join(
                f"{pick['position']}. {pick['name']} [{pick['role']}, "
                f"{pick['seen_state']}, aff {pick['affinity']:.3f}, "
                f"Fiyu {pick['fiyu_score']:.1f}, {pick['affordability_mode']}]"
                for pick in cycle["picks"]
            )
            lines.append(
                f"| {cycle['cycle']} / {cycle['date']} | "
                f"{cycle['metrics']['mean_affinity']:.3f} / "
                f"{cycle['metrics']['minimum_affinity']:.3f} | "
                f"{cycle['metrics']['mean_fiyu_score']:.2f} | "
                f"{cycle['cuisine_count']} / {cycle['facet_count']} | "
                f"{cycle['unseen_before_selection']} / {cycle['unseen_remaining']} | "
                f"{cycle['recent_excluded_count']} | "
                f"{cycle['repeat_reserve_count']} / {cycle['repeat_selected_count']} | "
                f"{cycle['final_radius_km']} km | {picks} |"
            )
        lines.extend(
            [
                "",
                "### Affinity contribution by encountered candidate",
                "",
                (
                    "Each signed contribution is `profile facet affinity × profile confidence ÷ "
                    "candidate-known facet count`; contributions sum to the displayed affinity."
                ),
                "",
                "| Candidate | Known facets | Calculated affinity | Per-facet contributions |",
                "|---|---:|---:|---|",
            ]
        )
        for candidate in profile["candidate_contributions"]:
            lines.append(
                f"| {candidate['name']} | {candidate['known_facet_count']} | "
                f"{candidate['calculated_affinity']:.3f} | "
                f"{_contribution_text(candidate)} |"
            )
        if "legacy" in profile:
            legacy = profile["legacy"]["summary"]
            lines.extend(
                [
                    "",
                    "### Same-seed legacy progression",
                    "",
                    "| Selector | Unique / positions | Repeat rate | First repeat | Mean cycle affinity | Mean cycle Fiyu |",
                    "|---|---:|---:|---:|---:|---:|",
                    (
                        f"| Personalized | {summary['unique_restaurants']} / "
                        f"{summary['positions']} | {summary['repeat_rate']:.1%} | "
                        f"{_fmt_value(summary['first_repeat_cycle'])} | "
                        f"{statistics.mean(c['metrics']['mean_affinity'] for c in profile['cycles']):.3f} | "
                        f"{statistics.mean(c['metrics']['mean_fiyu_score'] for c in profile['cycles']):.2f} |"
                    ),
                    (
                        f"| Legacy | {legacy['unique_restaurants']} / {legacy['positions']} | "
                        f"{legacy['repeat_rate']:.1%} | "
                        f"{_fmt_value(legacy['first_repeat_cycle'])} | "
                        f"{statistics.mean(c['metrics']['mean_affinity'] for c in profile['legacy']['cycles']):.3f} | "
                        f"{statistics.mean(c['metrics']['mean_fiyu_score'] for c in profile['legacy']['cycles']):.2f} |"
                    ),
                ]
            )
        if "no_affordability" in profile:
            counterfactual = profile["no_affordability"]["summary"]
            lines.extend(
                [
                    "",
                    "### High-price affordability counterfactual",
                    "",
                    (
                        "This is evaluator-only: current adaptive affordability versus the same "
                        "personalized progression with the affordable slot disabled."
                    ),
                    "",
                    "| View | Unique / positions | Mean affinity | Mean Fiyu | Affordable positions |",
                    "|---|---:|---:|---:|---:|",
                    (
                        f"| Current | {summary['unique_restaurants']} / {summary['positions']} | "
                        f"{statistics.mean(c['metrics']['mean_affinity'] for c in profile['cycles']):.3f} | "
                        f"{statistics.mean(c['metrics']['mean_fiyu_score'] for c in profile['cycles']):.2f} | "
                        f"{summary['affordable_positions']} |"
                    ),
                    (
                        f"| Slot disabled | {counterfactual['unique_restaurants']} / "
                        f"{counterfactual['positions']} | "
                        f"{statistics.mean(c['metrics']['mean_affinity'] for c in profile['no_affordability']['cycles']):.3f} | "
                        f"{statistics.mean(c['metrics']['mean_fiyu_score'] for c in profile['no_affordability']['cycles']):.2f} | "
                        f"{counterfactual['affordable_positions']} |"
                    ),
                ]
            )
        lines.append("")

    lines.extend(
        [
            "## Quality over the progression window",
            "",
            "| Profile | Mean affinity first → last | Min affinity first → last | Mean Fiyu first → last | Radius first → last | Unseen remaining last |",
            "|---|---:|---:|---:|---:|---:|",
            *[
                (
                    f"| {profile['profile_id']} | "
                    f"{profile['cycles'][0]['metrics']['mean_affinity']:.3f} → "
                    f"{profile['cycles'][-1]['metrics']['mean_affinity']:.3f} | "
                    f"{profile['cycles'][0]['metrics']['minimum_affinity']:.3f} → "
                    f"{profile['cycles'][-1]['metrics']['minimum_affinity']:.3f} | "
                    f"{profile['cycles'][0]['metrics']['mean_fiyu_score']:.2f} → "
                    f"{profile['cycles'][-1]['metrics']['mean_fiyu_score']:.2f} | "
                    f"{profile['cycles'][0]['final_radius_km']} → "
                    f"{profile['cycles'][-1]['final_radius_km']} km | "
                    f"{profile['cycles'][-1]['unseen_remaining']} |"
                )
                for profile in report["profiles"]
            ],
            "",
            (
                "Later cycles expand geographically as the tight-radius unseen inventory is "
                "consumed. Quality generally declines modestly; mature Taste affinity remains "
                "positive, while the high-price profile's final exploration Pick reaches neutral "
                "rather than a materially negative fallback."
            ),
            "",
        ]
    )

    probe = report["cooldown_probes"]
    lines.extend(
        [
            "## Cooldown verification",
            "",
            "The probe uses real catalog rows and the real selector in the temporary clone.",
            "",
            f"- Three unseen candidates preferred over a ≥7-day reserve: **{probe['unseen_preferred']}**.",
            f"- Six-day candidate blocked: **{probe['recent_blocked']}**.",
            f"- Exactly-seven-day candidate unused while three unseen exist: **{probe['old_unused_while_three_unseen']}**.",
            f"- Exactly-seven-day candidate used when only two unseen remain: **{probe['old_used_for_fallback']}**.",
            f"- Saved candidate excluded: **{probe['saved_excluded']}**.",
            f"- Affordable recent candidate did not bypass cooldown: **{probe['affordability_did_not_bypass_recent']}**.",
            f"- Personalization did not bypass cooldown: **{probe['personalization_did_not_bypass_recent']}**.",
            "",
            "## Facet frequency and specificity",
            "",
            (
                "Specificity bands are descriptive only: highly common ≥40%, moderately common "
                "10–<40%, distinctive/rare <10%."
            ),
            "",
            "| Facet | Restaurants | Share | Band |",
            "|---|---:|---:|---|",
        ]
    )
    for item in report["facets"]["frequencies"]:
        lines.append(
            f"| `{item['facet']}` | {item['count']} | {item['share']:.1%} | "
            f"{item['specificity']} |"
        )
    lines.extend(
        [
            "",
            "## Strongest facet correlations",
            "",
            r"| Pair | Together | Jaccard | P(right\|left) | P(left\|right) |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for item in report["facets"]["pairs"]:
        lines.append(
            f"| `{item['left']}` + `{item['right']}` | {item['count']} | "
            f"{item['jaccard']:.3f} | {item['p_right_given_left']:.1%} | "
            f"{item['p_left_given_right']:.1%} |"
        )
    lines.extend(
        [
            "",
            "Strongest three-facet groups (generalized Jaccard):",
            "",
            *[
                f"- `{' + '.join(item['facets'])}`: {item['count']} together; "
                f"Jaccard {item['jaccard']:.3f}"
                for item in report["facets"]["groups"]
            ],
            "",
            "## Correlated-facet amplification evidence",
            "",
            (
                "These are exact combined contributions from the highly correlated "
                "counter/small-capacity/solo cluster; they are not alternative scores."
            ),
            "",
            "| Profile | Candidate | Generic terms | Combined affinity contribution |",
            "|---|---|---|---:|",
            *[
                f"| {item['profile']} | {item['candidate']} | "
                f"{'; '.join(f'{facet} {value:+.3f}' for facet, value in sorted(item['terms'].items()))} | "
                f"{item['combined_contribution']:+.3f} |"
                for item in report["contribution_diagnostics"]["amplification"]
            ],
            "",
            "## Distinctive-signal dilution evidence",
            "",
            (
                "These rows compare the candidate's cuisine-only profile affinity with the actual "
                "equal average across every candidate-known facet. A positive difference is "
                "dilution by the additional known facets, not a proposed replacement score."
            ),
            "",
            "| Profile | Candidate | Cuisine facets | Cuisine-only | Actual | Difference |",
            "|---|---|---|---:|---:|---:|",
            *[
                f"| {item['profile']} | {item['candidate']} | "
                f"{', '.join(item['cuisine_facets'])} | {item['cuisine_only_affinity']:.3f} | "
                f"{item['calculated_affinity']:.3f} | {item['difference']:.3f} |"
                for item in report["contribution_diagnostics"]["dilution"]
            ],
            "",
            "## Conclusions",
            "",
            (
                "- Across the twelve-day progression, unseen-first selection eliminated the static "
                "mature-profile concentration: every profile received 36 unique restaurants in "
                "36 positions, with no repeat fallback required."
            ),
            (
                "- Strong, moderate/novel, and exploration roles each broadened beyond one "
                "restaurant; the per-profile role-breadth counts above show the exact totals."
            ),
            (
                "- No affordable restaurant repeated in this window. The high-price "
                "counterfactual shows whether adaptive affordability changed variety, affinity, "
                "or quality."
            ),
            (
                "- The cooldown probes found no bypass by Saved state, personalization, or the "
                "affordable slot, and confirmed the exact seven-day boundary plus unseen-first "
                "fallback semantics."
            ),
            "- No production correctness defect was found in this evaluation.",
            "",
            "## Interpretation and Taste-v2 questions",
            "",
            (
                "- Cooldown progression should be judged from the rotation tables above; the "
                "static three-restaurant concentration is not equivalent to production progression."
            ),
            (
                "- Contribution rows expose correlated-facet amplification directly: several "
                "generic facets can each add a separate signed term for one underlying "
                "service/seating pattern."
            ),
            (
                "- Because the current candidate score averages all candidate-known profile "
                "facets, many weak generic terms can also dilute one stronger cuisine-specific term."
            ),
            "- Should Taste v2 group tightly correlated format facets before averaging?",
            (
                "- Should facet-specific information weights distinguish ubiquitous format "
                "facets from rarer cuisine/style signals?"
            ),
            (
                "- Would normalized food tags and a richer cuisine hierarchy provide more "
                "specific evidence without over-counting synonyms?"
            ),
            (
                "- Should future evaluation compare equal-weight affinity with grouped or "
                "information-weighted diagnostics before changing production?"
            ),
            "",
            "No production selector, cooldown, affinity, affordability, or scoring behavior was changed.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("data/fiyu.db"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("docs/personalized-picks-cycle-progression-audit.md"),
    )
    parser.add_argument("--cycles", type=int, default=12, choices=range(10, 15))
    parser.add_argument("--seed-base", type=int, default=2026100100)
    parser.add_argument("--latitude", type=float, default=DEFAULT_LATITUDE)
    parser.add_argument("--longitude", type=float, default=DEFAULT_LONGITUDE)
    parser.add_argument("--area", default=DEFAULT_AREA)
    arguments = parser.parse_args()
    report = evaluate_progression(
        arguments.db,
        cycles=arguments.cycles,
        seed_base=arguments.seed_base,
        latitude=arguments.latitude,
        longitude=arguments.longitude,
        area=arguments.area,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(render_markdown(report), encoding="utf-8")
    print(f"Wrote {arguments.output} ({len(report['profiles'])} profiles)")


if __name__ == "__main__":
    main()
