"""Safe, resumable orchestration for one additive catalog expansion wave."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import statistics
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .catalog_pipeline import backfill_legacy_published_locations
from .operator_status import catalog_status
from .pipeline_runs import get_pipeline_run_status, list_pipeline_runs
from .public_catalog import seed_unseeded_public_queue
from .publication_reconciliation import run_publication_reconciliation
from .quality_v4_backfill import inspect_quality_v4_backfill, run_quality_v4_backfill
from .quality_v4_promotion import run_quality_v4_promotion
from .research_worker import run_research_batch
from .sqlite_snapshot import create_sqlite_backup, readonly_sqlite_snapshot

MINIMUM_SEED_SCORE = 60.0
PUBLICATION_THRESHOLD = 70.0
MAXIMUM_WAVE_SIZE = 100
MANIFEST_VERSION = "deterministic-unseeded-cohort-1"
STATE_VERSION = "expansion-wave-state-1"
_SAFE_WAVE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"expected a JSON object in {path}")
    return value


def _integrity(db_path: Path) -> str:
    with readonly_sqlite_snapshot(db_path) as connection:
        return str(connection.execute("PRAGMA integrity_check").fetchone()[0])


def _validate_index(path: Path, required_tables: set[str], label: str) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"{label} does not exist: {path}")
    try:
        connection = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
        try:
            check = str(connection.execute("PRAGMA quick_check").fetchone()[0])
            tables = {
                str(row[0])
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
        finally:
            connection.close()
    except sqlite3.Error as error:
        raise ValueError(f"{label} is not a readable SQLite index: {path}") from error
    if check != "ok":
        raise ValueError(f"{label} integrity check failed: {check}")
    missing = sorted(required_tables - tables)
    if missing:
        raise ValueError(f"{label} is missing required tables: {missing}")


def _published_digest(db_path: Path, excluded_ids: set[str] | None = None) -> str:
    excluded = excluded_ids or set()
    with readonly_sqlite_snapshot(db_path) as connection:
        columns = [str(row[1]) for row in connection.execute("PRAGMA table_info(public_restaurants)")]
        rows = connection.execute(
            "SELECT * FROM public_restaurants WHERE is_published=1 ORDER BY place_id"
        ).fetchall()
        values = [
            {column: row[column] for column in columns}
            for row in rows
            if str(row["place_id"]) not in excluded
        ]
    return hashlib.sha256(
        json.dumps(values, ensure_ascii=False, sort_keys=True, default=str).encode()
    ).hexdigest()


def _baseline(db_path: Path) -> dict[str, Any]:
    status = catalog_status(db_path)
    integrity = _integrity(db_path)
    if integrity != "ok":
        raise ValueError(f"canonical database integrity check failed: {integrity}")
    catalog = status["catalog"]
    readiness = status["readiness"]
    lineage = status["lineage"]
    if float(catalog["publication_threshold"]) != PUBLICATION_THRESHOLD:
        raise ValueError(
            f"expansion waves require publication threshold {PUBLICATION_THRESHOLD:g}; "
            f"found {catalog['publication_threshold']}"
        )
    return {
        "seeded_public_rows": int(catalog["seeded_public_rows"]),
        "published": int(catalog["published"]),
        "map_picks_ready_published": int(readiness["map_picks_ready_published"]),
        "production_v4": int(lineage["v4_specialist"]),
        "sqlite_integrity": integrity,
        "published_rows_digest": _published_digest(db_path),
    }


def _score_summary(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    scores = [float(row["internal_score"]) for row in candidates]
    bands = (
        ("<60", lambda value: value < 60),
        ("60-64.99", lambda value: 60 <= value < 65),
        ("65-69.99", lambda value: 65 <= value < 70),
        ("70-71.99", lambda value: 70 <= value < 72),
        ("72-73.99", lambda value: 72 <= value < 74),
        ("74+", lambda value: value >= 74),
    )
    return {
        "minimum": min(scores) if scores else None,
        "median": statistics.median(scores) if scores else None,
        "mean": statistics.mean(scores) if scores else None,
        "maximum": max(scores) if scores else None,
        "distribution": {
            label: sum(predicate(score) for score in scores) for label, predicate in bands
        },
    }


def _artifact_paths(output_dir: Path) -> dict[str, Path]:
    return {
        "state": output_dir / "wave-state.json",
        "cohort": output_dir / "frozen-cohort.json",
        "backup": output_dir / "pre-wave.db",
        "backup_summary": output_dir / "pre-wave-backup.json",
        "research": output_dir / "research-summary.json",
        "location": output_dir / "location-summary.json",
        "quality_manifest": output_dir / "quality-v4-manifest.json",
        "quality_results": output_dir / "quality-v4-results.jsonl",
        "promotion_cohort": output_dir / "promotion-cohort.json",
        "promotion_dry_summary": output_dir / "promotion-dry-run-summary.json",
        "promotion_dry_report": output_dir / "promotion-dry-run-report.md",
        "promotion_backup": output_dir / "pre-promotion.db",
        "promotion_summary": output_dir / "promotion-summary.json",
        "promotion_report": output_dir / "promotion-report.md",
        "reconcile_dry_summary": output_dir / "reconciliation-dry-run-summary.json",
        "reconcile_dry_report": output_dir / "reconciliation-dry-run-report.md",
        "reconcile_dry_changes": output_dir / "reconciliation-dry-run-changes.jsonl",
        "reconcile_backup": output_dir / "pre-reconciliation.db",
        "reconcile_summary": output_dir / "reconciliation-summary.json",
        "reconcile_report": output_dir / "reconciliation-report.md",
        "reconcile_changes": output_dir / "reconciliation-changes.jsonl",
        "final": output_dir / "final-summary.json",
    }


def _complete_stage(state: dict[str, Any], stage: str, state_path: Path, **updates: Any) -> None:
    stages = state.setdefault("completed_stages", [])
    if stage not in stages:
        stages.append(stage)
    state.update(updates)
    state["updated_at"] = _now()
    _write_json(state_path, state)


def _recover_research_run(db_path: Path, place_ids: list[str]) -> int | None:
    for run in list_pipeline_runs(db_path, run_type="standard_restaurant_research", limit=200):
        status = get_pipeline_run_status(db_path, int(run["run_id"]))
        if status.get("selector", {}).get("place_ids") == place_ids:
            return int(run["run_id"])
    return None


def _latest_quality_statuses(db_path: Path, place_ids: list[str]) -> dict[str, str]:
    if not place_ids:
        return {}
    placeholders = ",".join("?" for _ in place_ids)
    with readonly_sqlite_snapshot(db_path) as connection:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='quality_v4_research_runs'"
        ).fetchone()
        if exists is None:
            return {}
        rows = connection.execute(
            f"""
            SELECT q.public_restaurant_id, q.status
            FROM quality_v4_research_runs q
            JOIN (
                SELECT public_restaurant_id, MAX(id) AS latest_id
                FROM quality_v4_research_runs
                WHERE public_restaurant_id IN ({placeholders})
                GROUP BY public_restaurant_id
            ) latest ON latest.latest_id=q.id
            """,
            tuple(place_ids),
        ).fetchall()
    return {str(row[0]): str(row[1]) for row in rows}


def _quality_usage_totals(db_path: Path, place_ids: list[str]) -> dict[str, int]:
    placeholders = ",".join("?" for _ in place_ids)
    with readonly_sqlite_snapshot(db_path) as connection:
        row = connection.execute(
            f"""
            SELECT COALESCE(SUM(response_request_count), 0),
                   COALESCE(SUM(web_search_action_count), 0),
                   COALESCE(SUM(input_tokens), 0),
                   COALESCE(SUM(output_tokens), 0),
                   COALESCE(SUM(total_tokens), 0)
            FROM quality_v4_research_runs
            WHERE public_restaurant_id IN ({placeholders})
            """,
            tuple(place_ids),
        ).fetchone()
    return {
        "responses_requests": int(row[0]),
        "web_search_actions": int(row[1]),
        "input_tokens": int(row[2]),
        "output_tokens": int(row[3]),
        "total_tokens": int(row[4]),
    }


def _promotion_manifest(
    frozen: dict[str, Any], completed_ids: list[str], quality_inspection: dict[str, Any]
) -> dict[str, Any]:
    completed = set(completed_ids)
    candidates = [
        row
        for row in frozen.get("selected_candidates", [])
        if isinstance(row, dict) and str(row.get("place_id")) in completed
    ]
    return {
        **frozen,
        "cohort_id": f"{frozen['cohort_id']}-promotion",
        "cohort_name": f"{frozen['cohort_id']} promotable Quality-v4 subset",
        "requested_count": len(completed_ids),
        "selected_count": len(completed_ids),
        "ordered_place_ids": completed_ids,
        "selected_place_ids": completed_ids,
        "selected_candidates": candidates,
        "promotion_subset_of": frozen["cohort_id"],
        "excluded_from_promotion": len(frozen["ordered_place_ids"]) - len(completed_ids),
        "quality_v4_exclusions_by_reason": quality_inspection["exclusions_by_reason"],
    }


def _assert_promotion_plan(summary: dict[str, Any], expected: int) -> None:
    checks = {
        "cohort_ids": expected,
        "source_complete_v4_rows": expected,
        "source_incomplete_rows": 0,
        "matched_canonical_identities": expected,
        "missing_canonical_identities": 0,
        "shadow_production_mismatches": 0,
        "unrelated_rows_selected": 0,
    }
    failures = {key: (summary.get(key), value) for key, value in checks.items() if summary.get(key) != value}
    if failures:
        raise RuntimeError(f"promotion dry-run safety gates failed: {failures}")


def _assert_reconciliation_plan(summary: dict[str, Any]) -> None:
    result = summary["result"]
    cohort = summary["cohort_assertion"]
    invariants = summary["invariants"]
    failures: dict[str, Any] = {}
    if int(result["removals"]) != 0:
        failures["removals"] = result["removals"]
    if cohort.get("unexpected_additions"):
        failures["unexpected_additions"] = cohort["unexpected_additions"]
    if cohort.get("manifest_rows_missing"):
        failures["missing_additions"] = cohort["manifest_rows_missing"]
    if int(invariants.get("unrelated_additions", 0)) != 0:
        failures["unrelated_additions"] = invariants["unrelated_additions"]
    if failures:
        raise RuntimeError(f"publication reconciliation safety gates failed: {failures}")


def _cohort_seeded_count(db_path: Path, place_ids: list[str]) -> int:
    placeholders = ",".join("?" for _ in place_ids)
    with readonly_sqlite_snapshot(db_path) as connection:
        return int(
            connection.execute(
                f"SELECT COUNT(*) FROM public_restaurants WHERE place_id IN ({placeholders})",
                tuple(place_ids),
            ).fetchone()[0]
        )


def _newly_published_map_ready(db_path: Path, place_ids: list[str]) -> tuple[int, int]:
    placeholders = ",".join("?" for _ in place_ids)
    with readonly_sqlite_snapshot(db_path) as connection:
        row = connection.execute(
            f"""
            SELECT SUM(is_published=1),
                   SUM(is_published=1 AND map_display_eligible=1
                       AND latitude IS NOT NULL AND longitude IS NOT NULL)
            FROM public_restaurants WHERE place_id IN ({placeholders})
            """,
            tuple(place_ids),
        ).fetchone()
    return int(row[0] or 0), int(row[1] or 0)


def run_expansion_wave(
    db_path: str | Path,
    *,
    count: int,
    min_score: float,
    seed: str,
    osm_index: str | Path,
    osm_address_index: str | Path,
    output_dir: str | Path | None = None,
    model: str | None = None,
    dry_run: bool = False,
    resume: bool = False,
    allow_short_cohort: bool = False,
) -> dict[str, Any]:
    """Run or resume one exact, additive expansion wave using existing stages."""

    db = Path(db_path)
    wave_id = str(seed).strip()
    if count < 1 or count > MAXIMUM_WAVE_SIZE:
        raise ValueError(f"count must be between 1 and {MAXIMUM_WAVE_SIZE}")
    if min_score < MINIMUM_SEED_SCORE:
        raise ValueError(f"min-score must be at least {MINIMUM_SEED_SCORE:g}")
    if not wave_id or not _SAFE_WAVE_ID.fullmatch(wave_id):
        raise ValueError("seed must be non-empty and contain only letters, digits, '.', '_' or '-'")
    if not db.is_file():
        raise FileNotFoundError(f"canonical database does not exist: {db}")
    poi_index = Path(osm_index)
    address_index = Path(osm_address_index)
    _validate_index(poi_index, {"osm_locations"}, "OSM POI index")
    _validate_index(address_index, {"osm_addresses", "osm_address_areas"}, "OSM address index")

    directory = Path(output_dir) if output_dir else Path("data/audits") / wave_id
    artifacts = _artifact_paths(directory)
    if directory.exists() and not resume:
        raise FileExistsError(
            f"wave output directory already exists: {directory}; use --resume only for this wave"
        )
    if resume:
        if not artifacts["state"].is_file() or not artifacts["cohort"].is_file():
            raise ValueError("resume requires the existing wave-state and frozen-cohort artifacts")
        state = _read_json(artifacts["state"])
        frozen = _read_json(artifacts["cohort"])
        expected = (state.get("wave_id"), state.get("requested_count"), state.get("min_score"))
        supplied = (wave_id, count, min_score)
        if expected != supplied:
            raise ValueError(f"resume arguments do not match frozen wave: expected {expected}, got {supplied}")
        place_ids = [str(value) for value in frozen["ordered_place_ids"]]
    else:
        baseline = _baseline(db)
        selection = seed_unseeded_public_queue(
            db,
            limit=count,
            min_internal_score=min_score,
            seed=wave_id,
            dry_run=True,
        )
        if int(selection["selected_count"]) < count and not allow_short_cohort:
            raise RuntimeError(
                f"eligible pool produced only {selection['selected_count']} of {count}; "
                "use --allow-short-cohort to accept a smaller frozen cohort"
            )
        place_ids = [str(value) for value in selection["selected_place_ids"]]
        if not place_ids:
            raise RuntimeError("deterministic selector returned an empty cohort")
        frozen = {
            "manifest_version": MANIFEST_VERSION,
            "cohort_id": wave_id,
            "selection_timestamp": _now(),
            "selector_semantics": "eligible unseeded candidates, stable SHA-256 seed order",
            "ordered_place_ids": place_ids,
            **selection,
            "score_summary": _score_summary(selection["selected_candidates"]),
        }
        directory.mkdir(parents=True, exist_ok=False)
        _write_json(artifacts["cohort"], frozen)
        state = {
            "state_version": STATE_VERSION,
            "wave_id": wave_id,
            "requested_count": count,
            "frozen_count": len(place_ids),
            "min_score": min_score,
            "created_at": _now(),
            "updated_at": _now(),
            "dry_run_plan": dry_run,
            "frozen_manifest": str(artifacts["cohort"]),
            "completed_stages": ["preflight", "cohort_frozen"],
            "baseline": baseline,
            "artifacts": {key: str(value) for key, value in artifacts.items()},
        }
        _write_json(artifacts["state"], state)

    if dry_run:
        return {
            "mode": "dry_run",
            "wave_id": wave_id,
            "frozen": len(place_ids),
            "score_summary": frozen.get("score_summary"),
            "baseline": state["baseline"],
            "external_requests": 0,
            "database_mutations": 0,
            "artifacts": {key: str(value) for key, value in artifacts.items()},
        }

    completed = set(state["completed_stages"])
    if "backup" not in completed:
        backup = create_sqlite_backup(db, artifacts["backup"])
        _write_json(artifacts["backup_summary"], backup)
        _complete_stage(state, "backup", artifacts["state"])
        completed.add("backup")

    if "seeded" not in completed:
        existing = _cohort_seeded_count(db, place_ids)
        if existing == len(place_ids):
            seed_result = {"seeded_count": len(place_ids), "already_existing_race_skips": 0, "recovered": True}
        elif existing:
            raise RuntimeError(f"partial exact seed detected ({existing}/{len(place_ids)}); refusing selector drift")
        else:
            seed_result = seed_unseeded_public_queue(
                db,
                limit=len(place_ids),
                min_internal_score=min_score,
                seed=wave_id,
                place_ids=place_ids,
            )
            if seed_result["seeded_count"] != len(place_ids) or seed_result["already_existing_race_skips"]:
                raise RuntimeError(f"exact seed safety gate failed: {seed_result}")
        _complete_stage(state, "seeded", artifacts["state"], seed_result=seed_result)
        completed.add("seeded")

    if "research" not in completed:
        run_id = state.get("research_run_id") or _recover_research_run(db, place_ids)
        if run_id is None:
            research = run_research_batch(db, limit=len(place_ids), model=model, place_ids=place_ids)
            run_id = int(research["run_id"])
        else:
            run_status = get_pipeline_run_status(db, int(run_id))
            if run_status["pending"] or run_status["claimed"] or run_status["running"]:
                research = run_research_batch(db, limit=len(place_ids), model=model, resume_run_id=int(run_id))
            else:
                research = {"run_id": int(run_id), "run_status": run_status}
        run_status = research.get("run_status") or get_pipeline_run_status(db, int(run_id))
        _write_json(artifacts["research"], research)
        _complete_stage(state, "research_run_recorded", artifacts["state"], research_run_id=int(run_id))
        if (
            run_status["pending"]
            or run_status["claimed"]
            or run_status["running"]
            or run_status["failed_retryable"]
            or run_status["failed_terminal"]
            or int(run_status["succeeded"]) + int(run_status["skipped"]) != len(place_ids)
        ):
            raise RuntimeError(f"research run {run_id} has unresolved work or failures: {run_status}")
        _complete_stage(state, "research", artifacts["state"])
        completed.add("research")

    if "locations" not in completed:
        location = backfill_legacy_published_locations(
            db,
            osm_index=poi_index,
            osm_address_index=address_index,
            place_ids=place_ids,
            published_only=False,
        )
        if any(int(location.get(key, 0)) for key in ("responses_api_calls", "web_search_calls", "external_geocoding_calls")):
            raise RuntimeError("location stage reported an external request")
        _write_json(artifacts["location"], location)
        _complete_stage(state, "locations", artifacts["state"])
        completed.add("locations")

    if "quality_v4" not in completed:
        before_quality = inspect_quality_v4_backfill(db, place_ids=place_ids)
        blocked = before_quality["blocked_existing_statuses"]
        if any(int(blocked.get(status, 0)) for status in ("failed", "needs_retry", "pending")):
            raise RuntimeError(
                "Quality-v4 has unresolved attempts; use the targeted quality-v4 retry command, "
                "then resume this wave"
            )
        quality: dict[str, Any] | None = None
        if int(before_quality["eligible_pending"]):
            quality = run_quality_v4_backfill(
                db,
                limit=len(place_ids),
                place_ids=place_ids,
                model=model,
                manifest_path=artifacts["quality_manifest"],
                results_path=artifacts["quality_results"],
            )
            if quality["failed"] or quality["needs_retry"]:
                _complete_stage(state, "quality_v4_attempted", artifacts["state"])
                raise RuntimeError(
                    "Quality-v4 provider failures require targeted retry before --resume"
                )
        after_quality = inspect_quality_v4_backfill(db, place_ids=place_ids)
        blocked = after_quality["blocked_existing_statuses"]
        if after_quality["eligible_pending"] or any(
            int(blocked.get(status, 0)) for status in ("failed", "needs_retry", "pending")
        ):
            raise RuntimeError(f"Quality-v4 cohort still has unresolved work: {after_quality}")
        if quality is None and artifacts["quality_manifest"].is_file():
            quality = _read_json(artifacts["quality_manifest"])
        _complete_stage(
            state,
            "quality_v4",
            artifacts["state"],
            quality_v4_inspection=after_quality,
            quality_v4_summary=quality,
        )
        completed.add("quality_v4")

    quality_inspection = state["quality_v4_inspection"]
    if "promotion_cohort" not in completed:
        latest = _latest_quality_statuses(db, place_ids)
        promotable = [place_id for place_id in place_ids if latest.get(place_id) == "complete"]
        if not promotable:
            raise RuntimeError("wave has no completed valid Quality-v4 rows to promote")
        promotion_cohort = _promotion_manifest(frozen, promotable, quality_inspection)
        _write_json(artifacts["promotion_cohort"], promotion_cohort)
        _complete_stage(
            state,
            "promotion_cohort",
            artifacts["state"],
            promotable_ids=promotable,
            excluded_quality_v4=len(place_ids) - len(promotable),
        )
        completed.add("promotion_cohort")
    promotable = [str(value) for value in state["promotable_ids"]]

    if "promoted" not in completed:
        promotion_dry = run_quality_v4_promotion(
            db,
            source_db=db,
            cohort_manifest=artifacts["promotion_cohort"],
            dry_run=True,
            summary_path=artifacts["promotion_dry_summary"],
            report_path=artifacts["promotion_dry_report"],
        )
        _assert_promotion_plan(promotion_dry, len(promotable))
        promotion = run_quality_v4_promotion(
            db,
            source_db=db,
            cohort_manifest=artifacts["promotion_cohort"],
            dry_run=False,
            backup_path=artifacts["promotion_backup"],
            summary_path=artifacts["promotion_summary"],
            report_path=artifacts["promotion_report"],
        )
        _complete_stage(state, "promoted", artifacts["state"], promotion=promotion)
        completed.add("promoted")

    if "reconciled" not in completed:
        reconciliation_dry = run_publication_reconciliation(
            db,
            threshold=PUBLICATION_THRESHOLD,
            cohort_manifest=artifacts["promotion_cohort"],
            dry_run=True,
            summary_path=artifacts["reconcile_dry_summary"],
            report_path=artifacts["reconcile_dry_report"],
            changes_path=artifacts["reconcile_dry_changes"],
        )
        _assert_reconciliation_plan(reconciliation_dry)
        _complete_stage(
            state,
            "reconciliation_planned",
            artifacts["state"],
            reconciliation_expected_additions=int(
                reconciliation_dry["result"]["additions"]
            ),
        )
        reconciliation = run_publication_reconciliation(
            db,
            threshold=PUBLICATION_THRESHOLD,
            cohort_manifest=artifacts["promotion_cohort"],
            dry_run=False,
            backup_path=artifacts["reconcile_backup"],
            summary_path=artifacts["reconcile_summary"],
            report_path=artifacts["reconcile_report"],
            changes_path=artifacts["reconcile_changes"],
        )
        _complete_stage(state, "reconciled", artifacts["state"], reconciliation=reconciliation)
        completed.add("reconciled")

    final_status = catalog_status(db)
    final_integrity = _integrity(db)
    baseline = state["baseline"]
    reconciliation = state["reconciliation"]
    additions = int(
        state.get("reconciliation_expected_additions", reconciliation["result"]["additions"])
    )
    wave_published, wave_map_ready = _newly_published_map_ready(db, promotable)
    failures: dict[str, Any] = {}
    seeded_delta = int(final_status["catalog"]["seeded_public_rows"]) - int(baseline["seeded_public_rows"])
    published_delta = int(final_status["catalog"]["published"]) - int(baseline["published"])
    if seeded_delta != len(place_ids):
        failures["seeded_delta"] = (seeded_delta, len(place_ids))
    if published_delta != additions:
        failures["published_delta"] = (published_delta, additions)
    if reconciliation["result"]["removals"]:
        failures["removals"] = reconciliation["result"]["removals"]
    if int(final_status["lineage"]["stale_v4"]):
        failures["stale_v4"] = final_status["lineage"]["stale_v4"]
    if wave_published != wave_map_ready:
        failures["newly_published_not_map_ready"] = wave_published - wave_map_ready
    if _published_digest(db, set(place_ids)) != baseline["published_rows_digest"]:
        failures["unrelated_existing_published_rows"] = "changed"
    if final_integrity != "ok":
        failures["sqlite_integrity"] = final_integrity
    if failures:
        raise RuntimeError(f"final expansion-wave verification failed: {failures}")

    research_status = get_pipeline_run_status(db, int(state["research_run_id"]))
    quality_usage = _quality_usage_totals(db, place_ids)
    location_summary = _read_json(artifacts["location"])
    final = {
        "wave_id": wave_id,
        "frozen": len(place_ids),
        "seeded": seeded_delta,
        "research": {"completed": research_status["succeeded"], "selected": len(place_ids)},
        "locations": {
            key: location_summary[key]
            for key in (
                "cohort_size",
                "map_ready_before",
                "map_ready_after",
                "map_ineligible_after",
                "method_distribution",
                "missing_after",
                "conflicts",
            )
        },
        "quality_v4": {
            "completed": len(promotable),
            "excluded": len(place_ids) - len(promotable),
            "exclusions_by_reason": quality_inspection["exclusions_by_reason"],
        },
        "promoted": len(promotable),
        "published_additions": additions,
        "removals": 0,
        "unexpected_additions": 0,
        "new_published_total": final_status["catalog"]["published"],
        "new_map_picks_ready_total": final_status["readiness"]["map_picks_ready_published"],
        "external_requests": int(research_status["provider_requests"])
        + quality_usage["responses_requests"],
        "web_actions": int(research_status["web_search_actions"])
        + quality_usage["web_search_actions"],
        "tokens": {
            "input_tokens": int(research_status["input_tokens"])
            + quality_usage["input_tokens"],
            "output_tokens": int(research_status["output_tokens"])
            + quality_usage["output_tokens"],
            "total_tokens": int(research_status["total_tokens"])
            + quality_usage["total_tokens"],
        },
        "sqlite_integrity": final_integrity,
        "historical_backlog_is_non_blocking": True,
        "artifacts": {key: str(value) for key, value in artifacts.items()},
    }
    _write_json(artifacts["final"], final)
    _complete_stage(state, "verified", artifacts["state"], final_summary=str(artifacts["final"]))
    return final


def compact_expansion_wave_summary(result: dict[str, Any]) -> str:
    """Render a bounded operator summary without embedding per-restaurant reports."""

    if result.get("mode") == "dry_run":
        score = result.get("score_summary") or {}
        return "\n".join(
            (
                f"Expansion wave plan: {result['wave_id']}",
                f"Frozen: {result['frozen']}",
                (
                    f"Score min/median/mean/max: {score.get('minimum')} / "
                    f"{score.get('median')} / {score.get('mean')} / {score.get('maximum')}"
                ),
                f"Score distribution: {score.get('distribution')}",
                "Database mutations: 0",
                "External requests: 0",
                f"Artifacts: {result['artifacts']['state']}",
            )
        )
    quality = result["quality_v4"]
    location = result["locations"]
    return "\n".join(
        (
            f"Expansion wave: {result['wave_id']}",
            f"Frozen: {result['frozen']}",
            f"Seeded: {result['seeded']}",
            f"Research: {result['research']['completed']}/{result['research']['selected']}",
            f"Locations: {location['map_ready_after']}/{location['cohort_size']} map-ready",
            (
                f"Quality-v4: {quality['completed']} completed / "
                f"{quality['excluded']} excluded ({quality['exclusions_by_reason']})"
            ),
            f"Promoted: {result['promoted']}",
            f"Published additions: {result['published_additions']}",
            f"Removals: {result['removals']}",
            f"Unexpected additions: {result['unexpected_additions']}",
            f"New published total: {result['new_published_total']}",
            f"New map/Picks-ready total: {result['new_map_picks_ready_total']}",
            f"External requests: {result['external_requests']}",
            f"Web actions: {result['web_actions']}",
            f"Tokens: {result['tokens']['total_tokens']}",
            f"SQLite integrity: {result['sqlite_integrity']}",
            f"Artifacts: {result['artifacts']['state']}",
        )
    )

