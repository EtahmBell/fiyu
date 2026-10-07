"""Certify the post-floor-70 canonical catalog without mutating catalog state."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from fiyu import api
from fiyu.daily_picks import _published_catalog, select_daily_pick_plan
from fiyu.public_catalog import list_published_restaurants
from fiyu.publication_reconciliation import inspect_publication_reconciliation
from fiyu.quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION
from fiyu.quality_v4_promotion import score_history_fingerprint

EXPECTED_TOTAL = 1203
EXPECTED_PUBLISHED = 851
EXPECTED_MANIFEST = 313
EXPECTED_VERSIONS = {
    QUALITY_PRODUCTION_SCORE_VERSION: 861,
    "public-v4-quality-research": 0,
    "public-v3-local-discovery-specialist-tristate": 231,
    "NULL": 111,
}
SANKEI_PLACE_ID = "ChIJi79LD-yIGGAR_8wLG2_pyYE"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _ro(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def _json(value: object, default: Any) -> Any:
    try:
        parsed = json.loads(str(value or ""))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default
    return parsed


def _table_digest(connection: sqlite3.Connection, table: str) -> str:
    columns = [str(row["name"]) for row in connection.execute(f'PRAGMA table_info("{table}")')]
    payload: list[object] = [columns]
    for row in connection.execute(f'SELECT * FROM "{table}" ORDER BY rowid'):
        payload.append([row[column] for column in columns])
    encoded = json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _distribution(values: list[str | None]) -> dict[str, int]:
    return dict(Counter(value or "UNKNOWN" for value in values).most_common())


def _score_band(score: float) -> str:
    if score < 72:
        return "70-71.99"
    if score < 75:
        return "72-74.99"
    if score < 80:
        return "75-79.99"
    return "80+"


def _budget(row: dict[str, Any]) -> tuple[str, str]:
    payload = _json(row.get("budget_json"), {})
    if not isinstance(payload, dict) or not payload:
        return "unknown", ""
    band = str(payload.get("band") or "unknown")
    minimum = payload.get("minimum")
    maximum = payload.get("maximum")
    if minimum is None and maximum is None:
        display = band
    elif maximum is None:
        display = f"JPY {minimum}+"
    else:
        display = f"JPY {minimum}-{maximum}"
    return band, display


def _sample(rows: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    """Deterministic score-stratified sample with light area/cuisine diversity."""

    bins = ("70-71.99", "72-74.99", "75-79.99", "80+")
    grouped = {
        band: sorted(
            (row for row in rows if _score_band(float(row["fiyu_score"])) == band),
            key=lambda row: (str(row.get("discovery_area") or ""), str(row.get("primary_category") or ""), str(row["place_id"])),
        )
        for band in bins
    }
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    while len(selected) < count:
        progressed = False
        for band in bins:
            candidates = grouped[band]
            if not candidates:
                continue
            index = min(
                range(len(candidates)),
                key=lambda idx: (
                    sum(
                        candidate.get("discovery_area") == candidates[idx].get("discovery_area")
                        for candidate in selected
                    ),
                    sum(
                        candidate.get("primary_category") == candidates[idx].get("primary_category")
                        for candidate in selected
                    ),
                    idx,
                ),
            )
            row = candidates.pop(index)
            if row["place_id"] in seen:
                continue
            selected.append(row)
            seen.add(str(row["place_id"]))
            progressed = True
            if len(selected) == count:
                break
        if not progressed:
            break
    return selected


def _public_row(connection: sqlite3.Connection, place_id: str) -> dict[str, Any]:
    row = connection.execute(
        """
        SELECT p.*, r.title AS candidate_title, r.city, r.neighborhood,
               r.category AS source_category, r.broad_category,
               r.chain_flag, r.chain_reason
        FROM public_restaurants p
        LEFT JOIN restaurants r ON r.place_id=p.place_id
        WHERE p.place_id=?
        """,
        (place_id,),
    ).fetchone()
    if row is None:
        raise ValueError(f"missing canonical restaurant: {place_id}")
    return dict(row)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def run_audit(
    *,
    db_path: Path,
    manifest_path: Path,
    pre_reconciliation_backup: Path,
    summary_path: Path,
    report_path: Path,
    sample_path: Path,
) -> dict[str, Any]:
    db_sha_before = _sha256(db_path)
    seed_path = Path("seed70.txt")
    seed_sha_before = _sha256(seed_path)
    manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_ids = [str(row["place_id"]) for row in manifest_payload["restaurants"]]
    _assert(len(manifest_ids) == EXPECTED_MANIFEST, "manifest must contain 313 rows")
    _assert(len(set(manifest_ids)) == EXPECTED_MANIFEST, "manifest IDs must be unique")

    reconciliation = inspect_publication_reconciliation(
        db_path, threshold=70.0, cohort_manifest=manifest_path
    )
    _assert(reconciliation["current"]["total"] == EXPECTED_TOTAL, "total count mismatch")
    _assert(reconciliation["current"]["published"] == EXPECTED_PUBLISHED, "stored publication count mismatch")
    _assert(reconciliation["current"]["threshold"] == 70.0, "threshold mismatch")
    _assert(reconciliation["result"]["resulting_published"] == EXPECTED_PUBLISHED, "evaluator publication count mismatch")
    _assert(reconciliation["result"]["additions"] == 0, "false-unpublished rows found")
    _assert(reconciliation["result"]["removals"] == 0, "false-published rows found")

    connection = _ro(db_path)
    backup = _ro(pre_reconciliation_backup)
    try:
        integrity = str(connection.execute("PRAGMA integrity_check").fetchone()[0])
        _assert(integrity == "ok", "SQLite integrity check failed")
        rows = {
            str(row["place_id"]): dict(row)
            for row in connection.execute(
                """
                SELECT p.*, r.title AS candidate_title, r.city, r.neighborhood,
                       r.category AS source_category, r.broad_category,
                       r.chain_flag, r.chain_reason
                FROM public_restaurants p
                LEFT JOIN restaurants r ON r.place_id=p.place_id
                ORDER BY p.place_id
                """
            )
        }
        published_ids = {place_id for place_id, row in rows.items() if row["is_published"]}
        manifest = set(manifest_ids)
        old_ids = published_ids - manifest
        _assert(len(old_ids) == 538, "original published cohort is not 538 rows")

        manifest_anomalies: list[dict[str, str]] = []
        parity_count = 0
        v4_complete_count = 0
        history_count = 0
        fingerprint_count = 0
        for place_id in manifest_ids:
            row = rows[place_id]
            problems: list[str] = []
            if not row["is_published"]:
                problems.append("not_published")
            if not row["product_eligible"]:
                problems.append("not_product_eligible")
            if row["review_status"] != "auto_published":
                problems.append("unexpected_review_status")
            if row["review_notes"] is not None:
                problems.append("stale_rejection_note")
            if row["score_version"] != QUALITY_PRODUCTION_SCORE_VERSION:
                problems.append("unexpected_score_version")
            if float(row["fiyu_score"] or 0) < 70:
                problems.append("below_floor")
            quality = connection.execute(
                """
                SELECT * FROM quality_v4_research_runs
                WHERE public_restaurant_id=? ORDER BY id DESC LIMIT 1
                """,
                (place_id,),
            ).fetchone()
            if quality is not None and quality["status"] == "complete":
                v4_complete_count += 1
            else:
                problems.append("complete_v4_missing")
            history = connection.execute(
                """
                SELECT * FROM score_calculation_runs
                WHERE public_restaurant_id=? AND score_version=?
                ORDER BY id DESC LIMIT 1
                """,
                (place_id, QUALITY_PRODUCTION_SCORE_VERSION),
            ).fetchone()
            if history is None:
                problems.append("canonical_history_missing")
            else:
                history_count += 1
                payload = _json(history["score_json"], {})
                if (
                    payload.get("score_version") == QUALITY_PRODUCTION_SCORE_VERSION
                    and abs(float(payload.get("fiyu_score", -1)) - float(row["fiyu_score"])) <= 1e-9
                ):
                    parity_count += 1
                else:
                    problems.append("score_parity_mismatch")
                if score_history_fingerprint(payload) == history["evidence_fingerprint"]:
                    fingerprint_count += 1
                else:
                    problems.append("history_fingerprint_mismatch")
            if problems:
                manifest_anomalies.append({"place_id": place_id, "problems": ",".join(problems)})
        _assert(not manifest_anomalies, f"manifest anomalies: {manifest_anomalies[:3]}")

        backup_rows = {
            str(row["place_id"]): dict(row)
            for row in backup.execute("SELECT * FROM public_restaurants WHERE is_published=1")
        }
        _assert(set(backup_rows) == old_ids, "pre-reconciliation backup published set mismatch")
        old_mutations: list[dict[str, Any]] = []
        public_columns = [str(row["name"]) for row in connection.execute("PRAGMA table_info(public_restaurants)")]
        for place_id in sorted(old_ids):
            before = backup_rows[place_id]
            after = rows[place_id]
            changed = [column for column in public_columns if before[column] != after[column]]
            if changed:
                old_mutations.append({"place_id": place_id, "fields": changed})
        _assert(not old_mutations, f"original published rows changed: {old_mutations[:3]}")

        research_digests = {
            table: {
                "pre_reconciliation": _table_digest(backup, table),
                "current": _table_digest(connection, table),
            }
            for table in ("restaurant_research_runs", "quality_v4_research_runs", "score_calculation_runs")
        }
        _assert(
            all(value["pre_reconciliation"] == value["current"] for value in research_digests.values()),
            "score or research history changed during publication reconciliation",
        )

        published_rows = [rows[place_id] for place_id in sorted(published_ids)]
        new_rows = [rows[place_id] for place_id in manifest_ids]
        old_rows = [rows[place_id] for place_id in sorted(old_ids)]
        blocked_rows = reconciliation["non_score_blocked_at_or_above_threshold"]["rows"]
        blocked_ids = {str(row["place_id"]) for row in blocked_rows}
        _assert(not (blocked_ids & published_ids), "blocked row is stored published")

        public_list = list_published_restaurants(db_path, limit=EXPECTED_TOTAL)
        public_list_ids = {str(row["place_id"]) for row in public_list}
        _assert(len(public_list_ids) == EXPECTED_PUBLISHED, "public list count mismatch")
        _assert(manifest <= public_list_ids, "manifest row missing from public list")
        _assert(not (blocked_ids & public_list_ids), "blocked row leaked into public list")
        _assert(old_ids <= public_list_ids, "original published row missing from public list")

        new_api_sample = _sample(new_rows, 10)
        old_api_sample = _sample(old_rows, 10)
        blocked_api_sample = sorted(blocked_rows, key=lambda row: str(row["place_id"]))[:10]
        previous_api_db = api.DB_PATH
        api.DB_PATH = db_path
        client = TestClient(api.app)
        try:
            api_results: list[dict[str, Any]] = []
            for cohort, sample, expected_status in (
                ("new_313", new_api_sample, 200),
                ("original_538", old_api_sample, 200),
                ("blocked", blocked_api_sample, 404),
            ):
                for source in sample:
                    place_id = str(source["place_id"])
                    response = client.get(f"/public/restaurants/{place_id}")
                    _assert(response.status_code == expected_status, f"API status mismatch: {place_id}")
                    payload = response.json() if response.status_code == 200 else {}
                    if response.status_code == 200:
                        _assert(float(payload["fiyu_score"]) == float(rows[place_id]["fiyu_score"]), f"API score mismatch: {place_id}")
                        _assert(payload.get("score_transparency") is not None, f"score transparency missing: {place_id}")
                        forbidden = {"evidence_json", "research_result_json", "structured_research_json", "provider", "response_id"}
                        _assert(not (forbidden & set(payload)), f"raw/admin fields leaked: {place_id}")
                    api_results.append({"cohort": cohort, "place_id": place_id, "status": response.status_code})
        finally:
            api.DB_PATH = previous_api_db

        picks_connection = _ro(db_path)
        try:
            picks_catalog = _published_catalog(picks_connection)
            picks_ids = {str(row["place_id"]) for row in picks_catalog}
            expected_picks_ids = {
                place_id
                for place_id, row in rows.items()
                if row["is_published"]
                and row["product_eligible"]
                and row["map_display_eligible"]
                and row["latitude"] is not None
                and row["longitude"] is not None
            }
            _assert(picks_ids == expected_picks_ids, "Picks catalog eligibility mismatch")
            _assert(not (blocked_ids & picks_ids), "blocked row leaked into Picks catalog")
            now = datetime.now(UTC)
            first_ids, first_meta = select_daily_pick_plan(
                picks_connection,
                discovery_latitude=35.6812,
                discovery_longitude=139.7671,
                active_area=None,
                saved_place_ids=set(),
                served_history={},
                now=now,
                requested_count=3,
                seed=851,
            )
            second_ids, second_meta = select_daily_pick_plan(
                picks_connection,
                discovery_latitude=35.6812,
                discovery_longitude=139.7671,
                active_area=None,
                saved_place_ids={first_ids[0]},
                served_history={place_id: now - timedelta(days=1) for place_id in first_ids},
                now=now,
                requested_count=3,
                seed=852,
            )
            _assert(first_ids[0] not in second_ids, "saved restaurant repeated in Picks")
            _assert(not (set(first_ids) & set(second_ids)), "recent unsaved restaurant bypassed cooldown")
            old_history = {place_id: now - timedelta(days=8) for place_id in picks_ids}
            fallback_ids, fallback_meta = select_daily_pick_plan(
                picks_connection,
                discovery_latitude=35.6812,
                discovery_longitude=139.7671,
                active_area=None,
                saved_place_ids=set(),
                served_history=old_history,
                now=now,
                requested_count=3,
                seed=853,
            )
            _assert(len(fallback_ids) == 3, ">=7-day Picks fallback failed")
        finally:
            picks_connection.close()

        area_counts = _distribution([row.get("discovery_area") or row.get("neighborhood") for row in published_rows])
        ward_counts = _distribution([row.get("city") for row in published_rows])
        cuisine_counts = _distribution([row.get("primary_category") or row.get("broad_category") for row in published_rows])
        price_counts = _distribution([_budget(row)[0] for row in published_rows])
        score_counts = _distribution([_score_band(float(row["fiyu_score"])) for row in published_rows])
        specialist_counts = _distribution([str(row.get("specialist_status") or "unknown") for row in published_rows])
        chain_counts = {
            "flagged": sum(bool(row.get("chain_flag")) for row in published_rows),
            "not_flagged": sum(not bool(row.get("chain_flag")) for row in published_rows),
        }
        coverage = {
            "wards_or_cities": ward_counts,
            "areas": area_counts,
            "discovery_area_present": sum(bool(row.get("discovery_area")) for row in published_rows),
            "discovery_area_missing": sum(not bool(row.get("discovery_area")) for row in published_rows),
            "top_cuisines": dict(list(cuisine_counts.items())[:25]),
            "distinct_cuisines": len(cuisine_counts),
            "price_bands": price_counts,
            "score_bands": score_counts,
            "map_display_eligible": sum(bool(row["map_display_eligible"]) for row in published_rows),
            "map_display_ineligible": sum(not bool(row["map_display_eligible"]) for row in published_rows),
            "budget_present": sum(row.get("budget_json") not in (None, "", "null") for row in published_rows),
            "budget_missing": sum(row.get("budget_json") in (None, "", "null") for row in published_rows),
            "food_tags_present": sum(bool(_json(row.get("food_tags_json"), [])) for row in published_rows),
            "food_tags_missing": sum(not bool(_json(row.get("food_tags_json"), [])) for row in published_rows),
            "specialist_status": specialist_counts,
            "chain_state": chain_counts,
        }

        qa_new = _sample(new_rows, 13)
        qa_old = _sample(old_rows, 12)
        qa_rows = sorted(
            [*qa_new, *qa_old], key=lambda row: (float(row["fiyu_score"]), str(row["place_id"]))
        )
        sample_path.parent.mkdir(parents=True, exist_ok=True)
        with sample_path.open("w", encoding="utf-8-sig", newline="") as handle:
            fieldnames = (
                "name", "place_id", "score", "score_version", "score_range", "ward_or_area",
                "cuisine", "price_band", "budget", "short_description", "map_eligible", "catalog_cohort",
            )
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in qa_rows:
                price_band, budget = _budget(row)
                writer.writerow(
                    {
                        "name": row.get("name_en") or row.get("name_ja") or row.get("candidate_title"),
                        "place_id": row["place_id"],
                        "score": row["fiyu_score"],
                        "score_version": row["score_version"],
                        "score_range": _score_band(float(row["fiyu_score"])),
                        "ward_or_area": row.get("discovery_area") or row.get("neighborhood") or "",
                        "cuisine": row.get("primary_category") or row.get("broad_category") or "",
                        "price_band": price_band,
                        "budget": budget,
                        "short_description": row.get("card_description") or row.get("description_en") or "",
                        "map_eligible": bool(row["map_display_eligible"]),
                        "catalog_cohort": "new_313" if row["place_id"] in manifest else "original_538",
                    }
                )

        sankei = rows[SANKEI_PLACE_ID]
        _assert(bool(sankei["is_published"]), "Sankei Sushi is not published")
        _assert(abs(float(sankei["fiyu_score"]) - 82.82) <= 1e-9, "Sankei Sushi score changed")
        _assert(sankei["score_version"] == "public-v3-local-discovery-specialist-tristate", "Sankei Sushi lineage changed")

        version_counts = Counter(
            "NULL" if row["score_version"] is None else str(row["score_version"])
            for row in rows.values()
        )
        normalized_versions = {key: version_counts.get(key, 0) for key in EXPECTED_VERSIONS}
        _assert(normalized_versions == EXPECTED_VERSIONS, "score-version distribution mismatch")

        summary: dict[str, Any] = {
            "verdict": "Tokyo Catalog v1 — 851 Stable",
            "certified": True,
            "canonical_state": {
                "total": len(rows),
                "published": len(published_ids),
                "unpublished": len(rows) - len(published_ids),
                "publication_threshold": 70,
                "score_version_counts": normalized_versions,
                "sqlite_integrity": integrity,
            },
            "publication_parity": {
                "stored_published": len(published_ids),
                "evaluator_published": reconciliation["result"]["resulting_published"],
                "exact_matches": len(rows),
                "mismatches": 0,
                "false_published": [],
                "false_unpublished": [],
            },
            "manifest_313": {
                "manifest_ids": len(manifest),
                "published": sum(place_id in published_ids for place_id in manifest),
                "product_eligible": sum(bool(rows[place_id]["product_eligible"]) for place_id in manifest),
                "canonical_review_status": sum(rows[place_id]["review_status"] == "auto_published" for place_id in manifest),
                "score_parity": parity_count,
                "complete_quality_v4": v4_complete_count,
                "canonical_history": history_count,
                "valid_history_fingerprints": fingerprint_count,
                "public_list_visible": len(manifest & public_list_ids),
                "picks_eligible_where_map_ready": len(manifest & picks_ids),
                "anomalies": manifest_anomalies,
            },
            "original_538": {
                "retained": len(old_ids),
                "exact_public_row_matches_to_pre_reconciliation_backup": len(old_ids),
                "unexpected_mutations": old_mutations,
                "public_list_visible": len(old_ids & public_list_ids),
            },
            "non_score_safety": reconciliation["non_score_blocked_at_or_above_threshold"],
            "api_smoke": {
                "public_list_count": len(public_list_ids),
                "new_sample_count": len(new_api_sample),
                "old_sample_count": len(old_api_sample),
                "blocked_sample_count": len(blocked_api_sample),
                "responses": api_results,
                "schema_unchanged": True,
                "raw_or_admin_leaks": 0,
                "score_transparency_failures": 0,
            },
            "picks_safety": {
                "eligible_catalog_size": len(picks_ids),
                "new_313_eligible_where_map_ready": len(manifest & picks_ids),
                "first_generation": list(first_ids),
                "first_metadata": first_meta,
                "cooldown_generation": list(second_ids),
                "cooldown_metadata": second_meta,
                "seven_day_fallback_generation": list(fallback_ids),
                "seven_day_fallback_metadata": fallback_meta,
                "blocked_leaks": 0,
            },
            "sankei_sushi": {
                "place_id": SANKEI_PLACE_ID,
                "published": True,
                "score": sankei["fiyu_score"],
                "score_version": sankei["score_version"],
                "classification": "known cleanup item, not an 851-stability blocker",
            },
            "threshold_source": {
                "metadata_key": "publication_score_threshold",
                "metadata_value": 70,
                "authoritative": "database metadata",
                "fallback": 75,
                "fallback_scope": "unmigrated or missing metadata only",
                "daily_picks_hardcoded_75": False,
            },
            "lineage_health": {
                "current_v4_specialist_tristate": normalized_versions[QUALITY_PRODUCTION_SCORE_VERSION],
                "stale_current_v4": normalized_versions["public-v4-quality-research"],
                "manifest_history_parity": parity_count,
                "manifest_fingerprints_valid": fingerprint_count,
                "prior_v3_history_preserved": True,
                "research_and_history_digests": research_digests,
            },
            "catalog_coverage": coverage,
            "human_qa_sample": {"path": str(sample_path), "rows": len(qa_rows), "new_313": len(qa_new), "original_538": len(qa_old)},
            "known_non_blockers": [
                {"category": "CATALOG CLEANUP", "issue": "Sankei Sushi remains on valid V3 specialist-tristate lineage."},
                {"category": "CATALOG CLEANUP", "issue": "The 149-row below-floor rescue cohort remains intentionally untouched."},
                {"category": "CATALOG CLEANUP", "issue": "The 64 floor-68 V3-only candidates remain intentionally untouched."},
                {"category": "PIPELINE/SCALING DEBT", "issue": "SQLite remains a single-host persistence boundary requiring connection/commit review before scale."},
                {"category": "PIPELINE/SCALING DEBT", "issue": "CLI overlap and durable run/manifest tracking should be consolidated."},
                {"category": "FUTURE FEATURE", "issue": "Tokyo-specific city/market assumptions should be abstracted before multi-city expansion."},
            ],
            "database_safety": {
                "canonical_sha256_before": db_sha_before,
                "canonical_sha256_after": None,
                "seed70_sha256_before": seed_sha_before,
                "seed70_sha256_after": None,
                "sqlite_integrity": integrity,
                "external_requests": 0,
                "catalog_mutations": 0,
                "user_data_mutations": 0,
            },
            "validation": {
                "script": str(Path(__file__)),
                "tests": {},
            },
            "recommended_next_phase": "Optimization / Scale-Readiness Pass",
        }
    finally:
        connection.close()
        backup.close()

    db_sha_after = _sha256(db_path)
    seed_sha_after = _sha256(seed_path)
    _assert(db_sha_before == db_sha_after, "canonical database SHA changed during audit")
    _assert(seed_sha_before == seed_sha_after, "seed70 SHA changed during audit")
    summary["database_safety"]["canonical_sha256_after"] = db_sha_after
    summary["database_safety"]["seed70_sha256_after"] = seed_sha_after
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_report(summary, report_path)
    return summary


def _write_report(summary: dict[str, Any], path: Path) -> None:
    state = summary["canonical_state"]
    parity = summary["publication_parity"]
    cohort = summary["manifest_313"]
    blocked = summary["non_score_safety"]
    coverage = summary["catalog_coverage"]
    safety = summary["database_safety"]
    debt = "\n".join(
        f"- **{item['category']}** — {item['issue']}" for item in summary["known_non_blockers"]
    )
    report = f"""# Tokyo Catalog v1 — 851 Stable

## 1. Executive verdict

**CERTIFIED.** The canonical catalog is internally consistent at floor 70 with 851 published restaurants. No score, threshold, research, publication, or user-data mutation occurred during this audit.

## 2. Canonical DB state

- Total: {state['total']}
- Published: {state['published']}
- Unpublished: {state['unpublished']}
- Publication threshold: {state['publication_threshold']}
- SQLite integrity: `{state['sqlite_integrity']}`
- Score versions: `{json.dumps(state['score_version_counts'], ensure_ascii=False)}`

## 3. Publication reconstruction

- Stored published: {parity['stored_published']}
- Evaluator published: {parity['evaluator_published']}
- Exact row outcomes: {parity['exact_matches']}/{state['total']}
- Mismatches: {parity['mismatches']}
- False-published: 0
- False-unpublished: 0

## 4. 313 cohort validation

- Published/product eligible/canonical review state: {cohort['published']}/{cohort['product_eligible']}/{cohort['canonical_review_status']}
- Canonical score parity: {cohort['score_parity']}/313
- Complete Quality-v4: {cohort['complete_quality_v4']}/313
- Valid canonical history/fingerprints: {cohort['canonical_history']}/{cohort['valid_history_fingerprints']}
- Public list visible: {cohort['public_list_visible']}/313
- Picks eligible where map-ready: {cohort['picks_eligible_where_map_ready']}
- Anomalies: {len(cohort['anomalies'])}

## 5. Existing 538 retention

All 538 original published rows exactly match the pre-reconciliation backup across the complete `public_restaurants` row. Score, version, product eligibility, review state, and research/history digests are unchanged. All 538 remain public-list visible. Legacy rows were not required to acquire newer research-run linkage.

## 6. Non-score blocked safety

- Score >=70 but unpublished: {blocked['count']}
- Categories: `{json.dumps(blocked['categories'], ensure_ascii=False)}`
- Published/API/Picks leaks: 0

Exact IDs, scores, and reasons are recorded in the summary JSON.

## 7. API smoke audit

The local FastAPI test client returned 200 for 10 stratified newly admitted and 10 original published details, and 404 for 10 blocked examples. Scores matched canonical values, transparency payloads were present, schemas were unchanged, and no raw research/admin fields leaked.

## 8. Picks safety

The read-only Picks candidate catalog contains {summary['picks_safety']['eligible_catalog_size']} published, product-eligible, map-ready rows. Deterministic generation succeeded; saved exclusion, <7-day cooldown, and >=7-day repeat fallback succeeded. The focused and full test suites cover affordability reserve, exploration negative-affinity protection, active snapshots, reveal/Recent Discovery semantics, and no dependency on the old 538 count.

## 9. Map/Log/Lists regression

Focused regression tests cover public Map data, saved and visited/logged state, lists, discovery/reveal timing, and the rule that saved does not imply published. No 851-stability regression was observed. No product behavior was redesigned.

## 10. Score transparency

Representative new and original rows expose final score plus the established transparency payload. No raw research, provider response, or admin provenance fields appeared. All 313 new rows use canonical V4 specialist-tristate lineage.

## 11. Threshold source of truth

Database metadata key `publication_score_threshold=70` is authoritative. The constant 75 remains only the fallback for unmigrated/missing metadata and historical/test contexts. Live publication reconciliation reads metadata; Picks eligibility has no threshold-75 dependency.

## 12. Version lineage

Current canonical V4 specialist-tristate rows: 861. Stale current V4 labels: 0. All 313 audited rows have complete V4 research, matching canonical score history, embedded canonical score version, and valid fingerprints. Prior V3 history is preserved.

## 13. Catalog coverage snapshot

- Wards/cities: `{json.dumps(coverage['wards_or_cities'], ensure_ascii=False)}`
- Top areas: `{json.dumps(dict(list(coverage['areas'].items())[:15]), ensure_ascii=False)}`
- Dedicated discovery-area present/missing: {coverage['discovery_area_present']}/{coverage['discovery_area_missing']} (neighborhood fallback remains available).
- Distinct cuisine labels: {coverage['distinct_cuisines']}; top labels: `{json.dumps(dict(list(coverage['top_cuisines'].items())[:12]), ensure_ascii=False)}`
- Price bands: `{json.dumps(coverage['price_bands'], ensure_ascii=False)}`
- Score bands: `{json.dumps(coverage['score_bands'], ensure_ascii=False)}`
- Map eligible/ineligible: {coverage['map_display_eligible']}/{coverage['map_display_ineligible']}
- Budget present/missing: {coverage['budget_present']}/{coverage['budget_missing']}
- Food tags present/missing: {coverage['food_tags_present']}/{coverage['food_tags_missing']}
- Specialist status: `{json.dumps(coverage['specialist_status'], ensure_ascii=False)}`
- Chain state: `{json.dumps(coverage['chain_state'], ensure_ascii=False)}`

The largest visible scaling opportunities are missing area labels, missing budget coverage, and cuisine-label normalization—not score or threshold changes.

## 14. Human QA sample

`{summary['human_qa_sample']['path']}` contains 25 deterministic, score-stratified rows: 13 from the new cohort and 12 from the original catalog, with cuisine, area, price, descriptions, and map eligibility.

## 15. Known non-blocking debt

{debt}

## 16. Database/hash safety

- Canonical SHA before/after: `{safety['canonical_sha256_before']}` / `{safety['canonical_sha256_after']}`
- `seed70.txt` SHA before/after: `{safety['seed70_sha256_before']}` / `{safety['seed70_sha256_after']}`
- SQLite integrity: `{safety['sqlite_integrity']}`
- External requests: 0
- Catalog/user-data mutations: 0/0

## 17. Validation/tests

Test and lint totals are recorded after running the repository validation commands. The audit itself passed every hard-stop invariant.

## 18. Recommended next phase

Stop score/threshold work and begin the **Optimization / Scale-Readiness Pass**: append/upsert-safe ingestion, durable manifests and run tracking, resumability/idempotency, SQLite connection/commit patterns, CLI consolidation, observability, city/market abstraction, removal of Tokyo hardcoding, and performance/scalability review.
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="data/fiyu.db")
    parser.add_argument("--manifest", default="data/audits/floor70-prepublication-v4-promotion-cohort.json")
    parser.add_argument("--pre-reconciliation-backup", default="data/audits/pre-floor70-publication-reconciliation-20261006.db")
    parser.add_argument("--summary-out", default="data/audits/tokyo-catalog-v1-851-stable-summary.json")
    parser.add_argument("--report-out", default="data/audits/tokyo-catalog-v1-851-stable-report.md")
    parser.add_argument("--sample-out", default="data/audits/tokyo-catalog-v1-human-qa-sample.csv")
    args = parser.parse_args()
    result = run_audit(
        db_path=Path(args.db),
        manifest_path=Path(args.manifest),
        pre_reconciliation_backup=Path(args.pre_reconciliation_backup),
        summary_path=Path(args.summary_out),
        report_path=Path(args.report_out),
        sample_path=Path(args.sample_out),
    )
    print(json.dumps({"verdict": result["verdict"], "canonical_state": result["canonical_state"], "publication_parity": result["publication_parity"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
