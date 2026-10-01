from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fiyu.daily_picks import select_daily_pick_plan
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema
from fiyu.taste_affinity import (
    BudgetPreferenceProfile,
    UserTasteProfile,
    blend_affinity_and_quality,
    build_budget_preference_profile,
    build_user_taste_profile,
    normalized_fiyu_quality,
    score_candidate_for_user,
)
from fiyu.user_fiyu_summary import restaurant_taste_facets

NOW = datetime(2026, 10, 1, 12, tzinfo=UTC)
LATITUDE = 35.658
LONGITUDE = 139.7016
SEED = 47


def _restaurant(
    place_id: str,
    category: str,
    score: float,
    *,
    maximum: int | None,
    band: str | None,
    counter: bool = False,
    tables: bool = False,
    solo: bool = False,
    group: bool = False,
    date: bool = False,
    themes: tuple[str, ...] = (),
    distance_km: float = 0.8,
    published: bool = True,
    product_eligible: bool = True,
    map_eligible: bool = True,
) -> dict[str, Any]:
    budget = (
        {"currency": "JPY", "minimum": max(maximum - 1000, 0), "maximum": maximum, "band": band}
        if maximum is not None
        else None
    )
    return {
        "place_id": place_id,
        "name": place_id.replace("-", " ").title(),
        "primary_category": category,
        "fiyu_score": score,
        "budget": budget,
        "practical_info": {
            "seating": {"counter": counter, "tables": tables},
            "visit_style": {
                "solo_friendly": solo,
                "group_friendly": group,
                "date_friendly": date,
            },
        },
        "review_themes": [
            {"theme": theme, "confidence": 0.9, "supporting_source_count": 2}
            for theme in themes
        ],
        "latitude": LATITUDE,
        "longitude": LONGITUDE + distance_km / 90,
        "location_precision": "exact",
        "discovery_area": "Shibuya",
        "discovery_areas": [],
        "is_published": published,
        "product_eligible": product_eligible,
        "map_display_eligible": map_eligible,
    }


def _main_pool() -> list[dict[str, Any]]:
    return [
        _restaurant("sushi-omakase", "sushi", 94, maximum=15000, band="splurge", counter=True, date=True, themes=("refined", "tasting menu", "chef-led")),
        _restaurant("sushi-casual", "sushi", 88, maximum=4500, band="moderate", counter=True, solo=True, themes=("casual", "neighbourhood")),
        _restaurant("ramen-counter", "ramen", 89, maximum=1800, band="budget", counter=True, solo=True, themes=("casual", "neighbourhood")),
        _restaurant("izakaya-local", "izakaya", 86, maximum=2800, band="budget", counter=True, group=True, themes=("casual", "lively", "neighbourhood")),
        _restaurant("yakitori-lively", "yakitori", 91, maximum=5500, band="upscale", counter=True, group=True, themes=("lively", "chef-led")),
        _restaurant("french-refined", "french", 95, maximum=14000, band="splurge", tables=True, date=True, themes=("refined", "special occasion", "tasting menu")),
        _restaurant("italian-date", "italian", 92, maximum=7500, band="upscale", tables=True, date=True, themes=("seasonal", "refined")),
        _restaurant("thai-casual", "thai", 87, maximum=3800, band="moderate", tables=True, group=True, themes=("casual", "lively")),
        _restaurant("soba-quiet", "soba", 90, maximum=None, band=None, counter=True, solo=True, themes=("quiet", "traditional")),
        _restaurant("tempura-traditional", "tempura", 93, maximum=9000, band="upscale", counter=True, date=True, themes=("traditional", "chef-led")),
        _restaurant("curry-budget", "indian curry", 84, maximum=1200, band="budget", tables=True, solo=True, themes=("casual", "neighbourhood")),
        _restaurant("chinese-group", "chinese", 88, maximum=None, band=None, tables=True, group=True, themes=("lively", "regional")),
    ]


def _history_restaurant(place_id: str, template: dict[str, Any]) -> dict[str, Any]:
    return {**template, "place_id": place_id}


def _profile_histories(pool: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_id = {row["place_id"]: row for row in pool}

    def visits(*rated: tuple[str, int]) -> list[dict[str, Any]]:
        result = []
        for index, (place_id, rating) in enumerate(rated):
            history_id = f"history-{place_id}-{index}"
            by_id[history_id] = _history_restaurant(history_id, by_id[place_id])
            result.append({"place_id": history_id, "rating": rating, "private_note": "ignored"})
        return result

    histories = {
        "no_history": [],
        "sparse_conflicting": visits(("sushi-casual", 5), ("ramen-counter", 2)),
        "sushi_counter": visits(
            ("sushi-omakase", 5),
            ("sushi-casual", 5),
            ("sushi-omakase", 5),
            ("sushi-casual", 4),
            ("chinese-group", 2),
            ("italian-date", 1),
        ),
        "casual_affordable": visits(
            ("ramen-counter", 5),
            ("izakaya-local", 5),
            ("curry-budget", 5),
            ("ramen-counter", 4),
            ("french-refined", 2),
            ("sushi-omakase", 2),
        ),
        "expensive_dining": visits(
            ("french-refined", 5),
            ("sushi-omakase", 5),
            ("tempura-traditional", 5),
            ("italian-date", 4),
            ("curry-budget", 1),
            ("ramen-counter", 2),
        ),
        "broad_eclectic": visits(
            ("sushi-casual", 4),
            ("ramen-counter", 4),
            ("french-refined", 4),
            ("thai-casual", 5),
            ("tempura-traditional", 4),
            ("chinese-group", 5),
        ),
        "noodle_opposite": visits(
            ("ramen-counter", 5),
            ("soba-quiet", 5),
            ("ramen-counter", 5),
            ("soba-quiet", 4),
            ("sushi-omakase", 1),
            ("sushi-casual", 2),
        ),
    }
    histories["_catalog"] = list(by_id.values())
    return histories


def _create_pool(path: Path, rows: list[dict[str, Any]]) -> None:
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        for row in rows:
            connection.execute(
                """
                INSERT INTO public_restaurants (
                    place_id, name_en, primary_category, food_tags_json,
                    signature_dishes_json, discovery_area, discovery_areas_json,
                    fiyu_score, local_discovery_score, is_published,
                    product_eligible, map_display_eligible, latitude, longitude,
                    map_location_precision, budget_json, practical_info_json,
                    review_themes_json, created_at, updated_at
                ) VALUES (?, ?, ?, '[]', '[]', ?, '[]', ?, ?, ?, ?, ?, ?, ?, 'exact', ?, ?, ?, 'now', 'now')
                """,
                (
                    row["place_id"],
                    row["name"],
                    row["primary_category"],
                    row["discovery_area"],
                    row["fiyu_score"],
                    100 - row["fiyu_score"],
                    int(row["is_published"]),
                    int(row["product_eligible"]),
                    int(row["map_display_eligible"]),
                    row["latitude"],
                    row["longitude"],
                    json.dumps(row["budget"]) if row["budget"] else None,
                    json.dumps(row["practical_info"]),
                    json.dumps(row["review_themes"]),
                ),
            )
        connection.commit()


def _plan(
    path: Path,
    *,
    seed: int,
    profile: UserTasteProfile | None,
    budget_profile: BudgetPreferenceProfile | None = None,
    saved: set[str] | None = None,
    history: dict[str, datetime] | None = None,
) -> tuple[tuple[str, ...], dict[str, object]]:
    with connect(path) as connection:
        return select_daily_pick_plan(
            connection,
            discovery_latitude=LATITUDE,
            discovery_longitude=LONGITUDE,
            active_area="Shibuya",
            saved_place_ids=saved or set(),
            served_history=history or {},
            now=NOW,
            requested_count=3,
            seed=seed,
            taste_profile=profile,
            budget_profile=budget_profile,
        )


def _profile(visits: list[dict[str, Any]], catalog: list[dict[str, Any]]) -> UserTasteProfile:
    return build_user_taste_profile(
        visits=visits,
        catalog={str(row["place_id"]): row for row in catalog},
    )


def _pick_report(
    selected: tuple[str, ...],
    metadata: dict[str, object],
    profile: UserTasteProfile,
    pool: list[dict[str, Any]],
    history: dict[str, datetime] | None = None,
) -> list[dict[str, object]]:
    by_id = {str(row["place_id"]): row for row in pool}
    slots = {
        str(slot["place_id"]): slot
        for slot in metadata.get("personalization_slots", [])
        if isinstance(slot, dict)
    }
    result = []
    for position, place_id in enumerate(selected, start=1):
        row = by_id[place_id]
        affinity = score_candidate_for_user(profile, row)
        slot = slots.get(place_id, {})
        budget = row.get("budget")
        result.append(
            {
                "position": position,
                "place_id": place_id,
                "fiyu_score": row["fiyu_score"],
                "price_maximum": budget.get("maximum") if isinstance(budget, dict) else None,
                "price_known": isinstance(budget, dict),
                "facets": sorted(facet.key for facet in restaurant_taste_facets(row)),
                "affinity": affinity,
                "affinity_confidence": profile.confidence,
                "combined_score": round(
                    blend_affinity_and_quality(affinity, normalized_fiyu_quality(row)), 6
                ),
                "role": slot.get("role", "baseline_or_fallback"),
                "affordable_constraint": bool(slot.get("affordable_constraint")),
                "seen_state": "repeat" if history and place_id in history else "unseen",
                "reason": {
                    "role": slot.get("role", "baseline_or_fallback"),
                    "affordable_constraint": bool(slot.get("affordable_constraint")),
                },
            }
        )
    return result


def build_profile_evaluation_report(base_dir: Path) -> dict[str, object]:
    pool = _main_pool()
    path = base_dir / "personalized-evaluation.db"
    _create_pool(path, pool)
    histories = _profile_histories(pool)
    catalog = histories.pop("_catalog")
    report: dict[str, object] = {}
    for name, visits in histories.items():
        profile = _profile(visits, catalog)
        baseline, _ = _plan(path, seed=SEED, profile=None)
        personalized, metadata = _plan(path, seed=SEED, profile=profile)
        repeated, _ = _plan(path, seed=SEED, profile=profile)
        report[name] = {
            "profile": {
                "rated_count": profile.rated_count,
                "confidence": profile.confidence,
                "dominant_facets": sorted(
                    profile.facet_affinities,
                    key=lambda key: (-profile.facet_affinities[key], key),
                )[:6],
                "facet_affinities": dict(sorted(profile.facet_affinities.items())),
            },
            "baseline": list(baseline),
            "personalized": _pick_report(personalized, metadata, profile, pool),
            "deterministic": personalized == repeated,
        }
    return report


def _role_positions(path: Path, profile: UserTasteProfile) -> dict[str, set[int]]:
    positions = {
        "strong_affinity": set(),
        "exploration": set(),
        "affordable_constraint": set(),
    }
    for seed in range(120):
        selected, metadata = _plan(path, seed=seed, profile=profile)
        position_by_id = {place_id: index for index, place_id in enumerate(selected, start=1)}
        for slot in metadata["personalization_slots"]:
            role = str(slot["role"])
            if role in positions:
                positions[role].add(position_by_id[str(slot["place_id"])])
            if slot["affordable_constraint"]:
                positions["affordable_constraint"].add(
                    position_by_id[str(slot["place_id"])]
                )
    return positions


def build_second_pass_evaluation_report(base_dir: Path) -> dict[str, object]:
    """Exercise activation and budget confidence with real profile builders."""

    pool = _main_pool()
    path = base_dir / "second-pass-evaluation.db"
    _create_pool(path, pool)
    history_catalog: list[dict[str, Any]] = []
    expensive_visits: list[dict[str, Any]] = []
    for index in range(10):
        source = pool[0]
        place_id = f"rated-expensive-{index}"
        history_catalog.append(_history_restaurant(place_id, source))
        expensive_visits.append(
            {
                "id": f"visit-expensive-{index}",
                "place_id": place_id,
                "rating": 5,
                "visited_at": f"2026-01-{index + 1:02d}",
            }
        )

    activation = []
    for count in (0, 1, 2, 4, 6, 10):
        visits = expensive_visits[:count]
        profile = _profile(visits, history_catalog)
        budget_profile = build_budget_preference_profile(
            visits=visits,
            catalog={str(row["place_id"]): row for row in history_catalog},
        )
        selected, metadata = _plan(
            path,
            seed=SEED,
            profile=profile,
            budget_profile=budget_profile,
        )
        activation.append(
            {
                "rated_count": count,
                "confidence": profile.confidence,
                "budget_confidence": budget_profile.confidence,
                "relaxation": budget_profile.affordability_relaxation_strength,
                "selected": list(selected),
                "roles": metadata["personalization_slots"],
                "affordable_slot_applied": metadata["affordable_slot_applied"],
            }
        )

    cheap_catalog = []
    cheap_visits = []
    for index in range(10):
        place_id = f"rated-cheap-{index}"
        cheap_catalog.append(_history_restaurant(place_id, pool[2]))
        cheap_visits.append(
            {
                "id": f"visit-cheap-{index}",
                "place_id": place_id,
                "rating": 5,
                "visited_at": f"2026-02-{index + 1:02d}",
            }
        )
    both_catalog = [*history_catalog[:5], *cheap_catalog]
    both_visits = [*expensive_visits[:5], *cheap_visits]
    both_budget = build_budget_preference_profile(
        visits=both_visits,
        catalog={str(row["place_id"]): row for row in both_catalog},
    )
    mixed_six_catalog = [*history_catalog[:3], *cheap_catalog[:3]]
    mixed_six_visits = [*expensive_visits[:3], *cheap_visits[:3]]
    mixed_six_budget = build_budget_preference_profile(
        visits=mixed_six_visits,
        catalog={str(row["place_id"]): row for row in mixed_six_catalog},
    )
    affordable_budget = build_budget_preference_profile(
        visits=cheap_visits,
        catalog={str(row["place_id"]): row for row in cheap_catalog},
    )
    return {
        "activation": activation,
        "likes_both": {
            "confidence": both_budget.confidence,
            "relaxation": both_budget.affordability_relaxation_strength,
            "affordable_affinity": both_budget.affordable_affinity,
            "higher_price_affinity": both_budget.higher_price_affinity,
        },
        "mixed_six": {
            "confidence": mixed_six_budget.confidence,
            "relaxation": mixed_six_budget.affordability_relaxation_strength,
        },
        "strong_affordable": {
            "confidence": affordable_budget.confidence,
            "relaxation": affordable_budget.affordability_relaxation_strength,
        },
    }


def test_synthetic_profiles_use_real_affinity_and_selector(tmp_path):
    report = build_profile_evaluation_report(tmp_path)

    no_history = report["no_history"]
    assert [pick["place_id"] for pick in no_history["personalized"]] == no_history["baseline"]
    assert no_history["profile"]["confidence"] == 0
    assert all(scenario["deterministic"] for scenario in report.values())

    sushi = report["sushi_counter"]
    sushi_roles = {pick["role"]: pick for pick in sushi["personalized"]}
    assert "seafood" in sushi_roles["strong_affinity"]["facets"]
    assert "seafood" not in sushi_roles["exploration"]["facets"]

    casual = report["casual_affordable"]
    assert any(pick["affordable_constraint"] for pick in casual["personalized"])

    expensive = report["expensive_dining"]
    assert any(
        pick["price_known"] and pick["price_maximum"] <= 3000
        for pick in expensive["personalized"]
    )

    sushi_ids = {pick["place_id"] for pick in sushi["personalized"]}
    noodle_ids = {
        pick["place_id"] for pick in report["noodle_opposite"]["personalized"]
    }
    assert sushi_ids != noodle_ids


def test_visible_order_has_no_role_to_position_mapping(tmp_path):
    pool = _main_pool()
    path = tmp_path / "role-order.db"
    _create_pool(path, pool)
    histories = _profile_histories(pool)
    catalog = histories.pop("_catalog")
    profile = _profile(histories["sushi_counter"], catalog)

    positions = _role_positions(path, profile)

    assert positions["strong_affinity"] == {1, 2, 3}
    assert positions["exploration"] == {1, 2, 3}
    assert positions["affordable_constraint"] == {1, 2, 3}
    first, first_metadata = _plan(path, seed=19, profile=profile)
    repeated, repeated_metadata = _plan(path, seed=19, profile=profile)
    assert first == repeated
    assert first_metadata["personalization_slots"] == repeated_metadata["personalization_slots"]

    forward = {seed: _plan(path, seed=seed, profile=profile)[0] for seed in range(20)}
    reverse = {
        seed: _plan(path, seed=seed, profile=profile)[0]
        for seed in reversed(range(20))
    }
    assert forward == reverse


def test_affordability_stress_cases_preserve_hard_precedence(tmp_path):
    expensive_profile = UserTasteProfile(
        {"splurge": 0.8, "refined": 0.8, "budget": -0.6, "casual": -0.4},
        1.0,
        10,
    )

    case1_pool = [
        _restaurant(f"expensive-{index}", "french", 96 - index, maximum=12000 + index * 1000, band="splurge", tables=True, date=True, themes=("refined",))
        for index in range(9)
    ] + [
        _restaurant("weak-affordable", "ramen", 78, maximum=2500, band="budget", counter=True, themes=("casual",))
    ]
    case1_path = tmp_path / "affordability-case-1.db"
    _create_pool(case1_path, case1_pool)
    case1, case1_metadata = _plan(case1_path, seed=7, profile=expensive_profile)
    case1_slot = next(
        slot for slot in case1_metadata["personalization_slots"] if slot["place_id"] == "weak-affordable"
    )
    assert "weak-affordable" in case1
    assert case1_slot == {
        "place_id": "weak-affordable",
        "role": "moderate_or_novel",
        "affordable_constraint": True,
    }

    case2_pool = [*_main_pool(), _restaurant("ramen-budget-two", "ramen", 88, maximum=2200, band="budget", counter=True, solo=True, themes=("casual",))]
    case2_path = tmp_path / "affordability-case-2.db"
    _create_pool(case2_path, case2_pool)
    casual_profile = UserTasteProfile({"budget": 0.8, "casual": 0.8, "noodles": 0.6}, 1.0, 10)
    case2, _ = _plan(case2_path, seed=7, profile=casual_profile)
    case2_by_id = {row["place_id"]: row for row in case2_pool}
    selected_affordable = [
        case2_by_id[place_id]
        for place_id in case2
        if case2_by_id[place_id]["budget"]
        and case2_by_id[place_id]["budget"]["maximum"] <= 3000
    ]
    affordable_pool = [
        row
        for row in case2_pool
        if row["budget"] and row["budget"]["maximum"] <= 3000
    ]
    assert selected_affordable
    assert max(
        blend_affinity_and_quality(
            score_candidate_for_user(casual_profile, row),
            normalized_fiyu_quality(row),
        )
        for row in selected_affordable
    ) == max(
        blend_affinity_and_quality(
            score_candidate_for_user(casual_profile, row),
            normalized_fiyu_quality(row),
        )
        for row in affordable_pool
    )

    unknown_pool = [
        _restaurant(f"unknown-cheap-{index}", "ramen", 90 - index, maximum=None, band=None, counter=True, themes=("casual",))
        for index in range(10)
    ]
    unknown_path = tmp_path / "affordability-case-3.db"
    _create_pool(unknown_path, unknown_pool)
    case3, case3_metadata = _plan(unknown_path, seed=7, profile=casual_profile)
    assert len(case3) == 3
    assert case3_metadata["affordable_slot_applied"] is False

    expensive_only_path = tmp_path / "affordability-case-4.db"
    _create_pool(expensive_only_path, case1_pool[:-1])
    case4, case4_metadata = _plan(expensive_only_path, seed=7, profile=expensive_profile)
    assert len(case4) == 3
    assert case4_metadata["affordable_slot_applied"] is False

    blocked_pool = [
        *_main_pool(),
        _restaurant("saved-affordable", "ramen", 99, maximum=1000, band="budget"),
        _restaurant("recent-affordable", "ramen", 99, maximum=1000, band="budget"),
        _restaurant("unpublished-affordable", "ramen", 99, maximum=1000, band="budget", published=False),
        _restaurant("far-affordable", "ramen", 99, maximum=1000, band="budget", distance_km=20),
    ]
    # Remove otherwise eligible affordable rows so only hard-blocked ones remain.
    blocked_pool = [
        row
        for row in blocked_pool
        if row["place_id"] not in {"ramen-counter", "izakaya-local", "curry-budget"}
    ]
    blocked_path = tmp_path / "affordability-case-5.db"
    _create_pool(blocked_path, blocked_pool)
    case5, case5_metadata = _plan(
        blocked_path,
        seed=7,
        profile=casual_profile,
        saved={"saved-affordable"},
        history={"recent-affordable": NOW - timedelta(days=1)},
    )
    assert set(case5).isdisjoint(
        {"saved-affordable", "recent-affordable", "unpublished-affordable", "far-affordable"}
    )
    assert case5_metadata["affordable_slot_applied"] is False

    fallback_pool = [
        _restaurant("fresh-expensive-a", "french", 94, maximum=12000, band="splurge"),
        _restaurant("fresh-expensive-b", "italian", 92, maximum=9000, band="upscale"),
        _restaurant("old-affordable", "ramen", 85, maximum=2500, band="budget"),
        _restaurant("old-expensive", "sushi", 91, maximum=13000, band="splurge"),
    ]
    fallback_path = tmp_path / "affordability-case-6.db"
    _create_pool(fallback_path, fallback_pool)
    case6_history = {
        "old-affordable": NOW - timedelta(days=8),
        "old-expensive": NOW - timedelta(days=8),
    }
    case6, case6_metadata = _plan(
        fallback_path,
        seed=7,
        profile=expensive_profile,
        history=case6_history,
    )
    assert set(case6) == {"fresh-expensive-a", "fresh-expensive-b", "old-affordable"}
    assert case6_metadata["repeat_selected_count"] == 1
    assert case6_metadata["affordable_slot_applied"] is True
    assert case6_metadata["personalization_applied"] is False


def test_second_pass_evaluation_covers_gradual_activation_and_budget_profiles(tmp_path):
    report = build_second_pass_evaluation_report(tmp_path)
    activation = {item["rated_count"]: item for item in report["activation"]}

    assert activation[0]["confidence"] == 0
    assert activation[0]["roles"] == []
    assert activation[1]["confidence"] == 0.1
    assert activation[2]["confidence"] == 0.2
    assert activation[4]["confidence"] == 0.4
    assert activation[6]["confidence"] == 0.6
    assert activation[10]["confidence"] == 1
    assert activation[1]["relaxation"] == activation[2]["relaxation"] == 0
    assert activation[4]["relaxation"] == 0
    assert 0 < activation[6]["relaxation"] < activation[10]["relaxation"]
    assert activation[0]["affordable_slot_applied"] is True
    assert report["likes_both"]["confidence"] == 1
    assert report["likes_both"]["relaxation"] == 0
    assert report["mixed_six"] == {"confidence": 0.2, "relaxation": 0.0}
    assert report["strong_affordable"] == {"confidence": 1.0, "relaxation": 0.0}
