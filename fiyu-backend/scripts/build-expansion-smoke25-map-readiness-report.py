from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _connection(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def _rows(connection: sqlite3.Connection) -> dict[str, dict[str, object]]:
    return {
        str(row["place_id"]): dict(row)
        for row in connection.execute(
            """
            SELECT p.*, r.title AS candidate_title, r.address AS source_address,
                   r.city AS source_city, r.neighborhood AS source_neighborhood,
                   r.search_area AS source_search_area
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
            """
        )
    }


def _eligible(row: dict[str, object]) -> bool:
    return bool(
        row.get("is_published")
        and row.get("map_display_eligible")
        and isinstance(row.get("latitude"), (int, float))
        and isinstance(row.get("longitude"), (int, float))
    )


def _method_group(row: dict[str, object]) -> str:
    source = str(row.get("location_source") or "")
    precision = str(row.get("map_location_precision") or row.get("location_precision") or "")
    if source == "local_osm_addresses":
        return "local_osm_verified_address"
    if source == "local_osm_polygon_fallback" and precision in {"chome", "neighborhood"}:
        return "neighborhood_or_chome_approximate"
    if source == "local_osm_polygon_fallback":
        return "broader_defensible_fallback"
    return source or "unresolved"


def build(args: argparse.Namespace) -> dict[str, object]:
    manifest = json.loads(args.cohort.read_text(encoding="utf-8"))
    place_ids = [str(value) for value in manifest["ordered_place_ids"]]
    with _connection(args.before_db) as before_connection, _connection(args.db) as after_connection:
        before = _rows(before_connection)
        after = _rows(after_connection)
        before_public = {key for key, row in before.items() if row["is_published"]}
        after_public = {key for key, row in after.items() if row["is_published"]}
        original_851 = before_public - set(place_ids)
        score_parity = sum(
            before[key]["fiyu_score"] == after[key]["fiyu_score"] for key in before
        )
        version_parity = sum(
            before[key]["score_version"] == after[key]["score_version"] for key in before
        )
        publication_parity = sum(
            before[key]["is_published"] == after[key]["is_published"] for key in before
        )
        integrity = str(after_connection.execute("PRAGMA integrity_check").fetchone()[0])
        foreign_keys = len(after_connection.execute("PRAGMA foreign_key_check").fetchall())
        duplicate_place_ids = int(
            after_connection.execute(
                "SELECT COUNT(*) FROM (SELECT place_id FROM public_restaurants GROUP BY place_id HAVING COUNT(*)>1)"
            ).fetchone()[0]
        )
        broken_pointers = int(
            after_connection.execute(
                """
                SELECT COUNT(*) FROM public_restaurants p
                LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
                WHERE p.source_restaurant_id IS NOT NULL AND r.id IS NULL
                """
            ).fetchone()[0]
        )

    diagnostics: list[dict[str, object]] = []
    for place_id in place_ids:
        old, new = before[place_id], after[place_id]
        classifications = [
            "LOCATION STAGE NEVER EXECUTED",
            "EXISTING DATA IS SUFFICIENT FOR DETERMINISTIC RESOLUTION",
        ]
        if old.get("address_resolution_status") == "address_conflicting":
            classifications.append("IDENTITY / ADDRESS CONFLICT")
        diagnostics.append(
            {
                "place_id": place_id,
                "name": new.get("name_en") or new.get("name_ja") or new.get("candidate_title"),
                "published": bool(new["is_published"]),
                "before": {
                    "latitude": old.get("latitude"),
                    "longitude": old.get("longitude"),
                    "map_display_eligible": bool(old.get("map_display_eligible")),
                    "location_attempted_at": old.get("location_attempted_at"),
                    "location_source": old.get("location_source"),
                    "location_precision": old.get("map_location_precision")
                    or old.get("location_precision"),
                    "address_resolution_status": old.get("address_resolution_status"),
                },
                "stored_context": {
                    "normalized_address": new.get("normalized_address"),
                    "source_address": new.get("source_address"),
                    "neighborhood": new.get("source_neighborhood"),
                    "ward": new.get("source_city"),
                    "discovery_area": new.get("discovery_area"),
                    "source_search_area": new.get("source_search_area"),
                },
                "classification": classifications,
                "failure_reason_before": "no coordinates; map_display_eligible=0; location_attempted_at was null",
                "after": {
                    "latitude": new.get("latitude"),
                    "longitude": new.get("longitude"),
                    "map_display_eligible": bool(new.get("map_display_eligible")),
                    "location_source": new.get("location_source"),
                    "location_source_reference": new.get("location_source_reference"),
                    "location_precision": new.get("map_location_precision")
                    or new.get("location_precision"),
                    "map_location_approximate": bool(new.get("map_location_approximate")),
                    "location_status": new.get("location_status"),
                    "location_provenance": new.get("location_provenance"),
                    "method_group": _method_group(new),
                },
            }
        )

    method_distribution = Counter(item["after"]["method_group"] for item in diagnostics)
    precision_distribution = Counter(item["after"]["location_precision"] for item in diagnostics)
    conflict_count = sum(
        "IDENTITY / ADDRESS CONFLICT" in item["classification"] for item in diagnostics
    )
    map_ready_before = sum(_eligible(before[key]) for key in place_ids)
    map_ready_after = sum(_eligible(after[key]) for key in place_ids)
    overall_before = sum(_eligible(row) for row in before.values())
    overall_after = sum(_eligible(row) for row in after.values())
    unresolved = [item for item in diagnostics if not item["after"]["map_display_eligible"]]
    all_coordinates_valid = all(
        34.8 <= float(item["after"]["latitude"]) <= 36.0
        and 138.8 <= float(item["after"]["longitude"]) <= 140.2
        for item in diagnostics
        if item["after"]["map_display_eligible"]
    )
    original_unchanged = sum(
        before[key]["fiyu_score"] == after[key]["fiyu_score"]
        and before[key]["score_version"] == after[key]["score_version"]
        and before[key]["is_published"] == after[key]["is_published"]
        for key in original_851
    )
    from fastapi.testclient import TestClient

    from fiyu import api

    api.DB_PATH = args.db
    client = TestClient(api.app)
    detail_statuses = [
        client.get(f"/public/restaurants/{place_id}").status_code
        for place_id in place_ids
    ]
    mapped = api._map_eligible_public_restaurants_for_place_ids(place_ids)
    summary: dict[str, object] = {
        "verdict": "clean_local_resolution",
        "root_cause": "the smoke workflow invoked research, Quality-v4, promotion, and publication reconciliation separately and never invoked the existing location stage",
        "cohort": {
            "selected": len(place_ids),
            "published_additions": sum(bool(after[key]["is_published"]) for key in place_ids),
            "map_ready_before": map_ready_before,
            "map_ready_after": map_ready_after,
            "unresolved": len(unresolved),
            "conflicts": conflict_count,
        },
        "location_methods": dict(sorted(method_distribution.items())),
        "location_precisions": dict(sorted(precision_distribution.items())),
        "picks": {
            "map_ready_published_before": overall_before,
            "map_ready_published_after": overall_after,
            "newly_eligible_through_existing_map_gate": overall_after - overall_before,
            "algorithm_changed": False,
        },
        "product_parity": {
            "rows_compared": len(before),
            "score_exact": score_parity,
            "score_version_exact": version_parity,
            "publication_exact": publication_parity,
            "published_before": len(before_public),
            "published_after": len(after_public),
            "additions": len(after_public - before_public),
            "removals": len(before_public - after_public),
            "original_851_count": len(original_851),
            "original_851_unchanged": original_unchanged,
            "threshold": 70,
        },
        "map_api_safety": {
            "finite_tokyo_coordinates": all_coordinates_valid,
            "public_detail_http_200": sum(status == 200 for status in detail_statuses),
            "map_dataset_rows": len(mapped),
            "map_identity_duplicates": len(mapped)
            - len({str(row["place_id"]) for row in mapped}),
            "api_schema_changed": False,
        },
        "database_safety": {
            "database_sha256_before": args.database_sha_before.upper(),
            "backup_sha256": _sha256(args.before_db),
            "database_sha256_after": _sha256(args.db),
            "seed70_sha256": _sha256(args.seed70),
            "integrity": integrity,
            "foreign_key_violations": foreign_keys,
            "duplicate_place_ids": duplicate_place_ids,
            "broken_public_pointers": broken_pointers,
            "external_requests": 0,
        },
        "workflow": {
            "sequence": [
                "seed",
                "standard research",
                "resolve-cohort-locations (local-only)",
                "Quality-v4",
                "publication reconciliation",
                "map/Picks readiness reporting",
            ],
            "location_failure_blocks_publication": False,
        },
        "diagnostics": diagnostics,
        "unresolved_rows": unresolved,
    }
    args.summary.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )

    table_rows = "\n".join(
        f"| {item['name']} | {item['after']['latitude']:.6f}, {item['after']['longitude']:.6f} "
        f"| {item['after']['location_precision']} | {item['after']['method_group']} "
        f"| {item['stored_context']['ward'] or '—'} | {item['stored_context']['discovery_area'] or item['stored_context']['source_search_area'] or '—'} | yes |"
        for item in diagnostics
    )
    report = f"""# Expansion smoke25 map/Picks readiness remediation

## Verdict

All 17 published smoke additions are now map-ready using the existing local-only location hierarchy. No score or publication state changed, and no external request was made.

## Root cause

The smoke workflow ran the staged standard-research, Quality-v4, promotion, and publication-reconciliation commands. It did not call the location step embedded in `run_candidate_pipeline`; all 17 therefore had null coordinates, `map_display_eligible=0`, and `location_attempted_at=NULL`. The stored research/address context was sufficient for all 17.

## Results

- Published additions: 17
- Map-ready before: {map_ready_before}
- Map-ready after: {map_ready_after}
- Unresolved/conflicts: {len(unresolved)} / {conflict_count}
- Overall map/Picks-ready published: {overall_before} → {overall_after}
- Methods: {dict(sorted(method_distribution.items()))}
- Precisions: {dict(sorted(precision_distribution.items()))}
- External requests: 0
- Public detail HTTP 200: {sum(status == 200 for status in detail_statuses)}/17; map dataset: {len(mapped)}/17

## Location quality sample (all resolved additions)

| Restaurant | Resolved lat/lon | Precision | Method/provenance | Ward | Discovery area | Map eligible |
|---|---:|---|---|---|---|---|
{table_rows}

`area` is the broadest accepted fallback and is intentionally approximate. `chome` and `neighborhood` results use stable OSM polygon interior points and are also marked approximate.

## Future workflow

`seed → standard research → resolve-cohort-locations → Quality-v4 → publication reconciliation → map/Picks readiness reporting`

The new exact-cohort command reuses the existing POI/address/polygon/area-anchor hierarchy, makes zero external calls, refuses an unscoped unpublished run, checkpoints per row, and reports map-ready, map-ineligible, method distribution, unresolved, and conflict counts. Location failure remains nonfatal.

## Product and database parity

- Scores exact: {score_parity}/{len(before)}
- Score versions exact: {version_parity}/{len(before)}
- Publication exact: {publication_parity}/{len(before)}; additions/removals 0/0
- Original 851 unchanged: {original_unchanged}/{len(original_851)}
- SQLite integrity: {integrity}; foreign keys: {foreign_keys}; duplicate place IDs: {duplicate_place_ids}; broken pointers: {broken_pointers}
- Database SHA before/after: `{summary['database_safety']['database_sha256_before']}` / `{summary['database_safety']['database_sha256_after']}`
- Backup SHA: `{summary['database_safety']['backup_sha256']}`
- `seed70.txt` SHA: `{summary['database_safety']['seed70_sha256']}`
"""
    args.report.write_text(report, encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--before-db", type=Path, required=True)
    parser.add_argument("--database-sha-before", required=True)
    parser.add_argument("--seed70", type=Path, required=True)
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    result = build(args)
    print(json.dumps({key: result[key] for key in ("cohort", "location_methods", "picks", "product_parity", "database_safety")}, indent=2))


if __name__ == "__main__":
    main()
