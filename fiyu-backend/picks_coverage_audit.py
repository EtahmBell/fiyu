"""Read-only coverage audit for the current published Fiyu catalog.

This diagnostic deliberately opens SQLite with ``mode=ro`` and never calls any
network-backed pipeline component.  It is intended for repeatable catalog
coverage checks while the Picks algorithm is being designed.
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any

RADII_KM = (1.0, 2.0, 3.0, 5.0, 8.0)
ANCHORS = {
    "Shibuya": (35.6580, 139.7016),
    "Ebisu": (35.6467, 139.7101),
    "Shinjuku": (35.6896, 139.7006),
    "Ginza": (35.6717, 139.7650),
    "Tokyo Station / Marunouchi": (35.6812, 139.7671),
    "Asakusa": (35.7107, 139.7976),
    "Ueno": (35.7142, 139.7774),
    "Ikebukuro": (35.7295, 139.7109),
    "Shimokitazawa": (35.6616, 139.6666),
    "Nakameguro": (35.6443, 139.6991),
    "Koenji": (35.7053, 139.6497),
    "Kichijoji": (35.7033, 139.5798),
}
STRATEGIES = {
    "A": ((2.0, 4.0, 8.0), 10),
    "B": ((2.5, 5.0, 8.0), 12),
    "C": ((3.0, 5.0, 8.0), 15),
    "D_recommended": ((2.0, 3.0, 5.0, 8.0), 10),
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    value = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def precision_group(value: object) -> str:
    normalized = str(value or "missing").strip().lower().replace("ō", "o")
    if normalized in {"exact", "poi", "rooftop", "building"}:
        return "exact"
    if normalized in {"block", "street", "street_number"}:
        return "block"
    if normalized == "parcel_or_street_number":
        return "block"
    if normalized in {"chome", "chome_approximate"}:
        return "chome"
    if normalized in {"neighborhood", "neighbourhood", "suburb"}:
        return "neighborhood"
    if normalized in {
        "area",
        "area_anchor",
        "ward",
        "municipality",
        "municipality_or_ward",
        "city",
        "polygon",
    }:
        return "area"
    return normalized or "missing"


def strict_radius_eligible(row: dict[str, Any]) -> bool:
    """Only precision that reasonably supports an unadjusted radial cutoff."""
    return precision_group(row.get("precision")) in {"exact", "block"}


def scenario_sets(nearby: list[dict[str, Any]], scenario: str) -> tuple[set[str], set[str], dict[str, int]]:
    ids = [str(row["place_id"]) for row in nearby]
    if scenario == "new":
        return set(), set(), {}
    if scenario == "light":
        shown = ids[:5]
        return set(shown), set(shown[:1]), {place_id: 3 for place_id in shown[1:]}
    if scenario == "established":
        shown = ids[:15]
        unsaved = shown[5:]
        ages = {}
        for index, place_id in enumerate(unsaved):
            ages[place_id] = (3, 10, 18)[index % 3]
        return set(shown), set(shown[:5]), ages
    if scenario == "heavy":
        # Keep at most three nearby restaurants unseen, with a representative
        # mix of repeat ages among the already surfaced unsaved inventory.
        seen_count = max(0, len(ids) - min(3, len(ids)))
        shown = ids[:seen_count]
        saved_count = min(max(0, len(shown) // 4), len(shown))
        unsaved = shown[saved_count:]
        ages = {}
        for index, place_id in enumerate(unsaved):
            ages[place_id] = (3, 10, 18)[index % 3]
        return set(shown), set(shown[:saved_count]), ages
    raise ValueError(scenario)


def eligibility_counts(
    nearby: list[dict[str, Any]], scenario: str
) -> tuple[dict[str, int], set[str], set[str], dict[str, int]]:
    seen, saved, ages = scenario_sets(nearby, scenario)
    ids = {str(row["place_id"]) for row in nearby}
    unseen = ids - seen
    older7 = {place_id for place_id, age in ages.items() if age >= 7} - saved
    older14 = {place_id for place_id, age in ages.items() if age >= 14} - saved
    return (
        {
            "unseen": len(unseen),
            "unseen_plus_unsaved_7d": len(unseen | older7),
            "unseen_plus_unsaved_14d": len(unseen | older14),
        },
        seen,
        saved,
        ages,
    )


def choose_radius(
    rows: list[dict[str, Any]],
    anchor: tuple[float, float],
    scenario: str,
    radii: tuple[float, ...],
    minimum: int,
) -> dict[str, Any]:
    final: dict[str, Any] | None = None
    for radius in radii:
        nearby = [row for row in rows if row["distance_km"] <= radius]
        counts, seen, saved, ages = eligibility_counts(nearby, scenario)
        unseen_ids = {str(row["place_id"]) for row in nearby} - seen
        old_repeat_ids = {
            place_id for place_id, age in ages.items() if age >= 7
        } - saved
        final = {
            "starting_radius_km": radii[0],
            "candidates_at_radius": len(nearby),
            "final_radius_km": radius,
            "expanded": radius != radii[0],
            "unseen": counts["unseen"],
            "old_unsaved_repeats": len(old_repeat_ids - unseen_ids),
            "eligible_7d": counts["unseen_plus_unsaved_7d"],
            "enough_for_3": counts["unseen_plus_unsaved_7d"] >= 3,
            "met_strategy_minimum_with_unseen": counts["unseen"] >= minimum,
        }
        if counts["unseen"] >= minimum:
            break
    assert final is not None
    return final


def load_rows(connection: sqlite3.Connection) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    columns = {row[1] for row in connection.execute("PRAGMA table_info(public_restaurants)")}
    precision_column = (
        "map_location_precision"
        if "map_location_precision" in columns
        else "location_precision"
    )
    rows = [
        dict(row)
        for row in connection.execute(
            f"""
            SELECT place_id, name_en, name_ja, latitude, longitude, fiyu_score,
                   map_display_eligible, {precision_column} AS precision,
                   location_source, discovery_area
            FROM public_restaurants
            WHERE is_published = 1
            ORDER BY place_id
            """
        )
    ]
    metadata = {"precision_column": precision_column, "columns": sorted(columns)}
    return rows, metadata


def audit(db_path: Path) -> dict[str, Any]:
    uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        published, metadata = load_rows(connection)
    finally:
        connection.close()

    usable = [
        row
        for row in published
        if row["map_display_eligible"]
        and row["latitude"] is not None
        and row["longitude"] is not None
    ]
    precision = Counter(precision_group(row.get("precision")) for row in usable)
    raw_precision = Counter(str(row.get("precision")) for row in usable)
    without_location = [
        {
            "place_id": row["place_id"],
            "name": row["name_en"] or row["name_ja"],
            "map_display_eligible": bool(row["map_display_eligible"]),
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "precision": row["precision"],
        }
        for row in published
        if row not in usable
    ]
    bounds = None
    if usable:
        bounds = {
            "min_latitude": min(float(row["latitude"]) for row in usable),
            "max_latitude": max(float(row["latitude"]) for row in usable),
            "min_longitude": min(float(row["longitude"]) for row in usable),
            "max_longitude": max(float(row["longitude"]) for row in usable),
        }

    areas: dict[str, Any] = {}
    current_frontend_pool = sorted(
        usable,
        key=lambda row: (
            -float(row["fiyu_score"] if row["fiyu_score"] is not None else -1),
            str(row["place_id"]),
        ),
    )[:100]
    scenarios = ("new", "light", "established", "heavy")
    for name, anchor in ANCHORS.items():
        distance_rows = [
            {
                **row,
                "distance_km": haversine_km(
                    anchor[0], anchor[1], float(row["latitude"]), float(row["longitude"])
                ),
            }
            for row in usable
        ]
        distance_rows.sort(key=lambda row: (row["distance_km"], row["place_id"]))
        by_radius: dict[str, Any] = {}
        history: dict[str, Any] = {}
        for radius in RADII_KM:
            nearby = [row for row in distance_rows if row["distance_km"] <= radius]
            strict = [row for row in nearby if strict_radius_eligible(row)]
            by_radius[str(radius)] = {
                "all": len(nearby),
                "strict_exact_block": len(strict),
                "approximate": len(nearby) - len(strict),
            }
        simulation_pool = [row for row in distance_rows if row["distance_km"] <= 8]
        for scenario in scenarios:
            counts, _, _, _ = eligibility_counts(simulation_pool, scenario)
            history[scenario] = counts
        strategies = {
            strategy: {
                scenario: choose_radius(
                    distance_rows, anchor, scenario, radii, minimum
                )
                for scenario in scenarios
            }
            for strategy, (radii, minimum) in STRATEGIES.items()
        }
        areas[name] = {
            "anchor": {"latitude": anchor[0], "longitude": anchor[1]},
            "by_radius": by_radius,
            "current_top_100_by_radius": {
                str(radius): sum(
                    haversine_km(
                        anchor[0],
                        anchor[1],
                        float(row["latitude"]),
                        float(row["longitude"]),
                    )
                    <= radius
                    for row in current_frontend_pool
                )
                for radius in RADII_KM
            },
            "history_at_8km": history,
            "strategies": strategies,
            "nearest": [
                {
                    "place_id": row["place_id"],
                    "name": row["name_en"] or row["name_ja"],
                    "distance_km": round(row["distance_km"], 3),
                    "precision": precision_group(row["precision"]),
                }
                for row in distance_rows[:5]
            ],
        }

    return {
        "database": str(db_path),
        "metadata": metadata,
        "catalog": {
            "published": len(published),
            "map_eligible": len(usable),
            "not_map_eligible": len(without_location),
            "precision": dict(sorted(precision.items())),
            "raw_precision": dict(sorted(raw_precision.items())),
            "without_location": without_location,
            "bounds": bounds,
        },
        "areas": areas,
    }


def print_summary(result: dict[str, Any]) -> None:
    catalog = result["catalog"]
    print("CATALOG")
    print(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))
    print("COVERAGE")
    print("area\tall_1\tall_2\tall_3\tall_5\tall_8\tstrict_1\tstrict_2\tstrict_3\tstrict_5\tstrict_8\ttop100_1\ttop100_2\ttop100_3\ttop100_5\ttop100_8")
    for area, data in result["areas"].items():
        all_counts = [data["by_radius"][str(radius)]["all"] for radius in RADII_KM]
        strict_counts = [
            data["by_radius"][str(radius)]["strict_exact_block"] for radius in RADII_KM
        ]
        top_counts = [data["current_top_100_by_radius"][str(radius)] for radius in RADII_KM]
        print("\t".join(map(str, [area, *all_counts, *strict_counts, *top_counts])))
    print("HISTORY_AT_8KM")
    print("area\tscenario\tunseen\tplus_7d\tplus_14d")
    for area, data in result["areas"].items():
        for scenario, counts in data["history_at_8km"].items():
            print(
                "\t".join(
                    map(
                        str,
                        [
                            area,
                            scenario,
                            counts["unseen"],
                            counts["unseen_plus_unsaved_7d"],
                            counts["unseen_plus_unsaved_14d"],
                        ],
                    )
                )
            )
    print("STRATEGIES")
    print("area\tstrategy\tscenario\tstart\tfinal\tpool\tunseen\told7\teligible7\tenough3\tmet_min")
    for area, data in result["areas"].items():
        for strategy, scenarios in data["strategies"].items():
            for scenario, values in scenarios.items():
                print(
                    "\t".join(
                        map(
                            str,
                            [
                                area,
                                strategy,
                                scenario,
                                values["starting_radius_km"],
                                values["final_radius_km"],
                                values["candidates_at_radius"],
                                values["unseen"],
                                values["old_unsaved_repeats"],
                                values["eligible_7d"],
                                values["enough_for_3"],
                                values["met_strategy_minimum_with_unseen"],
                            ],
                        )
                    )
                )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=Path("data/fiyu.db"))
    parser.add_argument("--indent", type=int, default=2)
    parser.add_argument("--format", choices=("json", "summary"), default="json")
    args = parser.parse_args()
    result = audit(args.db)
    if args.format == "summary":
        print_summary(result)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=args.indent))


if __name__ == "__main__":
    main()
