from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import UTC, datetime
from pathlib import Path

from .address_research import recover_address_research_for_retry
from .catalog_pipeline import (
    backfill_legacy_published_locations,
    inspect_candidate,
    pipeline_status,
    publish_candidate,
    restore_best_location_from_history,
    review_candidate,
    verify_location,
)
from .public_catalog import (
    recalculate_from_stored_evidence,
    recover_research_for_retry,
    seed_public_queue,
    seed_unseeded_public_queue,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Unified Fiyu restaurant catalog pipeline")
    parser.add_argument("--db", default="data/fiyu.db")
    commands = parser.add_subparsers(dest="command", required=True)

    ingest = commands.add_parser(
        "ingest", help="Import or refresh one complete source snapshot additively"
    )
    ingest.add_argument("inputs", nargs="+")
    ingest.add_argument("--source-key", required=True)
    ingest.add_argument("--csv-out")
    ingest.add_argument("--include-all-categories", action="store_true")
    ingest.add_argument("--summary-out")
    from .cli import _add_scoring_arguments

    _add_scoring_arguments(ingest)

    source_status = commands.add_parser(
        "source-run-status", help="Inspect one durable source-provenance run"
    )
    source_status.add_argument("run_id", type=int)
    source_status.add_argument("--summary-out")

    source_runs = commands.add_parser("source-runs", help="List recent source import runs")
    source_runs.add_argument("--source-key")
    source_runs.add_argument("--limit", type=int, default=20)
    source_runs.add_argument("--summary-out")

    backup = commands.add_parser(
        "backup", help="Create a non-overwriting integrity-checked SQLite backup"
    )
    backup.add_argument("--output", required=True)
    backup.add_argument("--summary-out")

    inspect = commands.add_parser("inspect")
    inspect.add_argument("--place-id")
    inspect.add_argument("--limit", type=int, default=20)

    seed = commands.add_parser("import-candidates")
    seed.add_argument("--limit", type=int, default=25)
    seed.add_argument("--min-score", type=float, default=60.0)

    seed_unseeded = commands.add_parser(
        "seed-unseeded",
        help="Deterministically randomize and seed eligible candidates not yet public",
    )
    seed_unseeded.add_argument("--limit", type=int, default=500)
    seed_unseeded.add_argument("--min-score", type=float, default=60.0)
    seed_unseeded.add_argument("--seed", required=True)
    seed_unseeded.add_argument("--dry-run", action="store_true")
    seed_unseeded.add_argument(
        "--verbose",
        action="store_true",
        help="Print the full JSON result, including every selected candidate",
    )
    seed_unseeded.add_argument("--manifest-out")
    seed_unseeded.add_argument(
        "--cohort-manifest",
        help="Seed exactly the ordered place-id allowlist in an existing manifest",
    )

    research = commands.add_parser("research")
    research.add_argument("--place-id")
    research.add_argument("--cohort-manifest")
    research.add_argument("--limit", type=int)
    research.add_argument("--model")
    research.add_argument("--retry-failed", action="store_true")
    research.add_argument("--dry-run", action="store_true")
    research.add_argument("--resume-run", type=int)
    research.add_argument("--worker-id")
    research.add_argument("--lease-seconds", type=int, default=900)
    research.add_argument("--max-items", type=int)
    research.add_argument("--summary-out")

    resume = commands.add_parser(
        "research-resume", help="Resume pending or stale work in one frozen research run"
    )
    resume.add_argument("run_id", type=int)
    resume.add_argument("--model")
    resume.add_argument("--worker-id")
    resume.add_argument("--lease-seconds", type=int, default=900)
    resume.add_argument("--max-items", type=int)
    resume.add_argument("--dry-run", action="store_true")
    resume.add_argument("--summary-out")

    retry_run = commands.add_parser(
        "research-retry", help="Retry only retryable failures in one frozen research run"
    )
    retry_run.add_argument("run_id", type=int)
    retry_run.add_argument("--model")
    retry_run.add_argument("--worker-id")
    retry_run.add_argument("--lease-seconds", type=int, default=900)
    retry_run.add_argument("--max-items", type=int)
    retry_run.add_argument("--dry-run", action="store_true")
    retry_run.add_argument("--summary-out")

    run_status = commands.add_parser(
        "pipeline-run-status", help="Show durable pipeline run and item-state totals"
    )
    run_status.add_argument("run_id", type=int)
    run_status.add_argument("--summary-out")

    canonical_run_status = commands.add_parser(
        "run-status", help="Inspect one durable pipeline run"
    )
    canonical_run_status.add_argument("run_id", type=int)
    canonical_run_status.add_argument("--summary-out")

    runs = commands.add_parser("runs", help="List recent durable pipeline runs")
    runs.add_argument("--type", dest="run_type")
    runs.add_argument("--limit", type=int, default=20)
    runs.add_argument("--summary-out")

    low_footprint = commands.add_parser(
        "research-low-footprint",
        help="Run the targeted Japanese/local enrichment pass for eligible candidates",
    )
    low_footprint.add_argument("--place-id", action="append", dest="place_ids")
    low_footprint.add_argument("--limit", type=int, default=5)
    low_footprint.add_argument("--model")
    low_footprint.add_argument("--dry-run", action="store_true")

    retry = commands.add_parser(
        "retry-research",
        help="Explicitly make an interrupted/failed candidate eligible for a later research call",
    )
    retry.add_argument("--place-id", required=True)
    retry.add_argument("--dry-run", action="store_true")

    retry_address = commands.add_parser(
        "retry-address-research",
        help="Explicitly authorize a later retry of an interrupted address fallback",
    )
    retry_address.add_argument("--place-id", required=True)
    retry_address.add_argument("--dry-run", action="store_true")

    run = commands.add_parser("run", help="Research, score, locate, and auto-publish")
    run.add_argument("--place-id")
    run.add_argument("--limit", type=int, default=1)
    run.add_argument("--osm-index", required=True)
    run.add_argument("--osm-address-index")
    run.add_argument("--model")
    run.add_argument("--dry-run", action="store_true")

    score = commands.add_parser("score")
    score.add_argument("--place-id", required=True)

    locate = commands.add_parser("verify-location")
    locate.add_argument("--place-id", required=True)
    locate.add_argument("--osm-index", required=True)
    locate.add_argument("--osm-address-index")
    locate.add_argument("--dry-run", action="store_true")

    restore_location = commands.add_parser(
        "restore-best-location",
        help="Restore the strongest valid locally stored location-history entry",
    )
    restore_location.add_argument("--place-id", required=True)
    restore_location.add_argument("--dry-run", action="store_true")

    backfill_locations = commands.add_parser(
        "backfill-published-locations",
        help="Apply the local-only finalized location hierarchy to legacy published rows",
    )
    backfill_locations.add_argument("--osm-index", required=True)
    backfill_locations.add_argument("--osm-address-index", required=True)
    backfill_locations.add_argument("--dry-run", action="store_true")

    backfill_enrichment = commands.add_parser(
        "backfill-card-enrichment",
        help="Backfill published restaurant card metadata from stored evidence or explicit research",
    )
    backfill_enrichment.add_argument("--phase", choices=("local", "research"), default="local")
    backfill_enrichment.add_argument("--limit", type=int, default=1000)
    backfill_enrichment.add_argument("--model")
    backfill_enrichment.add_argument("--place-id")
    backfill_enrichment.add_argument("--min-fiyu-score", type=float)
    backfill_enrichment.add_argument("--retry-failed", action="store_true")
    backfill_enrichment.add_argument("--dry-run", action="store_true")

    canonical_details = commands.add_parser(
        "backfill-canonical-details",
        help="Normalize reservation and budget fields from existing local structured data",
    )
    canonical_details.add_argument("--dry-run", action="store_true")

    retry_enrichment = commands.add_parser(
        "retry-card-enrichment",
        help="Explicitly authorize retry of one ambiguous targeted enrichment request",
    )
    retry_enrichment.add_argument("--place-id", required=True)
    retry_enrichment.add_argument("--dry-run", action="store_true")

    quality_v4 = commands.add_parser(
        "quality-v4-backfill",
        help="Run resumable Quality-v4 research and persist shadow scores only",
    )
    quality_v4.add_argument("--limit", type=int, default=100)
    quality_v4.add_argument("--place-id")
    quality_v4.add_argument("--cohort-manifest")
    quality_v4.add_argument("--start-after")
    quality_v4.add_argument("--model")
    quality_v4_selection = quality_v4.add_mutually_exclusive_group()
    quality_v4_selection.add_argument("--force", action="store_true")
    quality_v4_selection.add_argument(
        "--retry-failed",
        action="store_true",
        help="Retry only explicitly retryable provider failures",
    )
    quality_v4_selection.add_argument(
        "--floor70-prepublication",
        action="store_true",
        help="Select only unpublished, gate-clean v3 score-only rows already at floor 70",
    )
    quality_v4.add_argument("--dry-run", action="store_true")
    quality_v4.add_argument("--verbose", action="store_true")
    quality_v4.add_argument("--manifest-out")
    quality_v4.add_argument("--results-out")

    quality_v4_promote = commands.add_parser(
        "quality-v4-promote",
        help="Promote completed local Quality-v4 shadow evidence into production scores",
    )
    quality_v4_promote.add_argument("--source-db", required=True)
    quality_v4_promote.add_argument(
        "--cohort-manifest",
        help="Strict place_id allowlist for an audited Quality-v4 promotion cohort",
    )
    quality_v4_promote.add_argument("--dry-run", action="store_true")
    quality_v4_promote.add_argument("--backup-out")
    quality_v4_promote.add_argument("--summary-out")
    quality_v4_promote.add_argument("--report-out")
    quality_v4_promote.add_argument("--verbose", action="store_true")

    quality_v4_version_fix = commands.add_parser(
        "quality-v4-fix-specialist-version",
        help="Correct an audited Quality-v4 cohort's specialist-tristate version metadata",
    )
    quality_v4_version_fix.add_argument("--cohort-manifest", required=True)
    quality_v4_version_fix.add_argument("--source-db")
    quality_v4_version_fix.add_argument("--dry-run", action="store_true")
    quality_v4_version_fix.add_argument("--backup-out")
    quality_v4_version_fix.add_argument("--summary-out")
    quality_v4_version_fix.add_argument("--report-out")
    quality_v4_version_fix.add_argument("--verbose", action="store_true")

    specialist_migrate = commands.add_parser(
        "specialist-tristate-migrate",
        help="Migrate stored specialist booleans to versioned tri-state semantics",
    )
    specialist_migrate.add_argument("--dry-run", action="store_true")
    specialist_migrate.add_argument("--backup-out")
    specialist_migrate.add_argument("--summary-out")
    specialist_migrate.add_argument("--report-out")
    specialist_migrate.add_argument("--verbose", action="store_true")

    reconcile = commands.add_parser(
        "reconcile-publication",
        help="Reconcile canonical publication membership at an audited score threshold",
    )
    reconcile.add_argument("--threshold", type=float, required=True)
    reconcile.add_argument("--cohort-manifest", required=True)
    reconcile.add_argument("--dry-run", action="store_true")
    reconcile.add_argument("--backup-out")
    reconcile.add_argument("--summary-out", required=True)
    reconcile.add_argument("--report-out", required=True)
    reconcile.add_argument("--changes-out", required=True)
    reconcile.add_argument("--verbose", action="store_true")

    review = commands.add_parser("review")
    review.add_argument("--place-id", required=True)

    for command in ("approve", "reject"):
        decision = commands.add_parser(command)
        decision.add_argument("--place-id", required=True)
        decision.add_argument("--reviewed-by", required=True)
        decision.add_argument("--notes")

    publish = commands.add_parser("publish")
    publish.add_argument("--place-id", required=True)

    commands.add_parser("status")
    for name, help_text in (
        ("catalog-status", "Show the current stored catalog and readiness state"),
        ("funnel", "Show the stored candidate-to-publication funnel"),
        ("coverage", "Show ward, cuisine, price, discovery, and map coverage"),
    ):
        report = commands.add_parser(name, help=help_text)
        report.add_argument("--summary-out")

    for name, help_text, with_report, with_changes in (
        ("cuisine-normalize", "Dry-run versioned cuisine normalization", True, True),
        ("discovery-area-backfill", "Dry-run deterministic discovery-area fills", True, True),
        ("price-normalize", "Dry-run deterministic stored price normalization", True, True),
        ("missing-budget", "Dry-run the future targeted missing-budget selector", False, False),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--dry-run", action="store_true", required=True)
        command.add_argument("--summary-out")
        if with_report:
            command.add_argument("--report-out")
        if with_changes:
            command.add_argument("--changes-out")
    completeness_apply = commands.add_parser(
        "completeness-apply",
        help="Apply all three exact Phase E1 deterministic cohorts transactionally",
    )
    completeness_apply.add_argument("--apply", action="store_true", required=True)
    completeness_apply.add_argument("--backup-out", required=True)
    completeness_apply.add_argument("--audit-dir", default="data/audits")
    completeness_apply.add_argument("--seed", default="seed70.txt")
    completeness_apply.add_argument("--summary-out", required=True)
    completeness_apply.add_argument("--report-out", required=True)
    return parser


def _seed_score_bands(scores: list[float]) -> list[tuple[str, int]]:
    bands = (
        ("<60", lambda score: score < 60),
        ("60–64.99", lambda score: 60 <= score < 65),
        ("65–69.99", lambda score: 65 <= score < 70),
        ("70–71.99", lambda score: 70 <= score < 72),
        ("72–73.99", lambda score: 72 <= score < 74),
        ("74+", lambda score: score >= 74),
    )
    return [
        (label, count)
        for label, contains in bands
        if (count := sum(contains(score) for score in scores))
    ]


def _format_seed_unseeded_summary(result: dict[str, object]) -> str:
    selected = result.get("selected_candidates")
    candidates = selected if isinstance(selected, list) else []
    scores = [
        float(candidate["internal_score"])
        for candidate in candidates
        if isinstance(candidate, dict)
        and isinstance(candidate.get("internal_score"), (int, float))
        and not isinstance(candidate.get("internal_score"), bool)
    ]
    if result.get("dry_run"):
        lines = [
            f"Eligible unseeded pool: {result['eligible_unseeded_pool_before']}",
            f"Requested: {result['requested_count']}",
            f"Selected: {result['selected_count']}",
        ]
        if scores:
            lines.extend(
                (
                    f"Min score: {min(scores):.2f}",
                    f"Median score: {statistics.median(scores):.2f}",
                    f"Mean score: {statistics.mean(scores):.2f}",
                    f"Max score: {max(scores):.2f}",
                )
            )
        lines.extend(
            (
                f"Seed: {result['seed']}",
                f"Min-score filter: {result['min_score']:g}",
                "Database writes: 0",
            )
        )
        distribution = _seed_score_bands(scores)
        if distribution:
            lines.append("")
            lines.append("Selected score distribution:")
            lines.extend(f"{label}: {count}" for label, count in distribution)
        return "\n".join(lines)

    return "\n".join(
        (
            f"Eligible unseeded before: {result['eligible_unseeded_pool_before']}",
            f"Requested: {result['requested_count']}",
            f"Selected: {result['selected_count']}",
            f"Seeded: {result['seeded_count']}",
            f"Skipped/already existing: {result['already_existing_race_skips']}",
            f"Eligible unseeded remaining: {result['eligible_unseeded_pool_remaining']}",
            f"Seed: {result['seed']}",
            f"Min-score: {result['min_score']:g}",
        )
    )


def main(argv: list[str] | None = None, *, canonical: bool = False) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = _parser().parse_args(argv)
    db = Path(args.db)
    operator_output: dict[str, object] | None = None
    summary_out = getattr(args, "summary_out", None)
    if args.command == "ingest":
        from .cli import _config_from_args
        from .operator_reporting import operator_summary
        from .source_ingestion import run_source_ingestion

        result = run_source_ingestion(
            args.inputs,
            source_key=args.source_key,
            db_path=db,
            csv_output=args.csv_out,
            config=_config_from_args(args),
            include_all_categories=args.include_all_categories,
        )
        impact = result["impact"]
        operator_output = operator_summary(
            "source-ingest",
            status=str(result["status"]),
            run_id=int(result["run_id"]),
            input_data={"source_key": args.source_key, "files": result["files"]},
            counts={
                "selected": result["cleaning"]["input_rows"],
                "created": result["new_candidates"],
                "updated": result["updated_candidates"],
                "unchanged": impact["unchanged_candidates"],
            },
            canonical_db=db,
            mutations=int(result["new_candidates"]) + int(result["updated_candidates"]),
            artifacts={"csv": args.csv_out},
            details={"source": result, "impact": impact},
        )
    elif args.command == "source-run-status":
        from .operator_reporting import operator_summary
        from .source_ingestion import get_source_run_status

        result = get_source_run_status(db, args.run_id)
        operator_output = operator_summary(
            "source-run-status",
            status=str(result["status"]),
            run_id=int(result["id"]),
            started_at=result["started_at"],
            completed_at=result["completed_at"],
            input_data={
                "source_key": result["source_key"],
                "input_fingerprint": result["input_fingerprint"],
            },
            counts={
                "selected": result["total_rows_seen"],
                "created": result["new_candidates"],
                "updated": result["updated_candidates"],
                "unchanged": result["unchanged_candidates"],
            },
            canonical_db=db,
            mutations=0,
            details=result,
        )
    elif args.command == "source-runs":
        from .operator_reporting import operator_summary
        from .source_ingestion import list_source_runs

        result = list_source_runs(db, source_key=args.source_key, limit=args.limit)
        operator_output = operator_summary(
            "source-runs",
            status="completed",
            input_data={"source_key": args.source_key, "limit": args.limit},
            counts={"selected": len(result)},
            canonical_db=db,
            mutations=0,
            details={"runs": result},
        )
    elif args.command == "backup":
        from .operator_reporting import operator_summary
        from .sqlite_snapshot import create_sqlite_backup

        result = create_sqlite_backup(db, args.output)
        operator_output = operator_summary(
            "sqlite-backup",
            status="completed",
            input_data={"source": str(db)},
            counts={"created": 1},
            canonical_db=db,
            mutations=0,
            artifacts={"backup": result["output"]},
            details=result,
        )
    elif args.command == "inspect":
        if args.place_id:
            result = inspect_candidate(db, args.place_id)
        else:
            from .public_catalog import list_review_candidates

            result = list_review_candidates(db, limit=args.limit)
    elif args.command == "import-candidates":
        result = {
            "seeded": seed_public_queue(db, limit=args.limit, min_internal_score=args.min_score)
        }
    elif args.command == "seed-unseeded":
        manifest_path = Path(args.manifest_out) if args.manifest_out else None
        if manifest_path is not None and manifest_path.exists():
            raise FileExistsError(f"Manifest already exists: {manifest_path}")
        seed_place_ids = None
        if args.cohort_manifest:
            from .cohort_manifest import load_cohort_place_ids

            seed_place_ids = load_cohort_place_ids(args.cohort_manifest)
            if args.limit != len(seed_place_ids):
                raise ValueError("--limit must equal the cohort manifest size")
        result = seed_unseeded_public_queue(
            db,
            limit=args.limit,
            min_internal_score=args.min_score,
            seed=args.seed,
            dry_run=args.dry_run,
            place_ids=seed_place_ids,
        )
        if manifest_path is not None:
            result = {
                "manifest_version": "deterministic-unseeded-cohort-1",
                "cohort_id": str(args.seed),
                "selection_timestamp": datetime.now(UTC).isoformat(),
                "selector_semantics": "eligible unseeded candidates, stable SHA-256 seed order",
                "ordered_place_ids": result["selected_place_ids"],
                **result,
            }
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n",
                encoding="utf-8",
            )
            result["manifest_out"] = str(manifest_path)
    elif args.command in {"research", "research-resume", "research-retry"}:
        from .pipeline_runs import get_pipeline_run_status
        from .research_worker import run_research_batch

        if args.command == "research":
            if args.resume_run is not None and (
                args.place_id or args.cohort_manifest or args.limit is not None
            ):
                raise ValueError(
                    "--resume-run cannot be combined with fresh selector flags "
                    "--place-id, --cohort-manifest, or --limit"
                )
            resume_run_id = args.resume_run
            retry_failed = args.retry_failed
            limit = args.limit or 1
        else:
            resume_run_id = args.run_id
            retry_failed = args.command == "research-retry"
            limit = 1
        place_ids = None
        if args.command == "research" and args.cohort_manifest:
            if args.place_id or args.limit is not None:
                raise ValueError(
                    "--cohort-manifest cannot be combined with --place-id or --limit"
                )
            from .cohort_manifest import load_cohort_place_ids

            place_ids = load_cohort_place_ids(args.cohort_manifest)
            limit = len(place_ids)
        if resume_run_id is not None:
            stored = get_pipeline_run_status(db, resume_run_id)
            if stored["run_type"] != "standard_restaurant_research":
                raise ValueError(
                    f"Pipeline run {resume_run_id} is not a standard research run"
                )
            if retry_failed and not stored["failed_retryable"]:
                raise ValueError(f"Pipeline run {resume_run_id} has no retryable failures")
            if not retry_failed and not (
                stored["pending"] or stored["claimed"] or stored["running"]
            ):
                if stored["failed_retryable"]:
                    raise ValueError(
                        f"Pipeline run {resume_run_id} has only retryable failures; "
                        "use research-retry"
                    )
                raise ValueError(f"Pipeline run {resume_run_id} has no remaining work")
        result = run_research_batch(
            db,
            limit=limit,
            model=args.model,
            retry_failed=retry_failed,
            place_id=args.place_id if args.command == "research" else None,
            place_ids=place_ids,
            max_items=args.max_items,
            dry_run=args.dry_run,
            resume_run_id=resume_run_id,
            worker_id=args.worker_id,
            lease_seconds=args.lease_seconds,
        )
        if canonical or args.command != "research" or summary_out:
            from .operator_reporting import operator_summary

            run_status = result.get("run_status", result)
            operator_output = operator_summary(
                "research-retry"
                if retry_failed and resume_run_id is not None
                else "research-resume"
                if resume_run_id is not None
                else "research-create",
                status=str(run_status.get("status", "planned")),
                mode="dry_run" if args.dry_run else "real",
                dry_run=args.dry_run,
                run_id=result.get("run_id", resume_run_id),
                input_data={"limit": limit, "model": args.model},
                counts={
                    "selected": run_status.get("selected", len(result.get("candidates", []))),
                    "succeeded": run_status.get("succeeded", result.get("completed", 0)),
                    "retryable_failed": run_status.get("failed_retryable", 0),
                    "terminal_failed": run_status.get("failed_terminal", 0),
                    "skipped": run_status.get("skipped", 0),
                },
                canonical_db=db,
                external_requests=int(result.get("responses_requests", 0)),
                mutations="planned" if args.dry_run else "checkpointed per item",
                details=result,
            )
    elif args.command in {"pipeline-run-status", "run-status"}:
        from .operator_reporting import operator_summary
        from .pipeline_runs import get_pipeline_run_status

        result = get_pipeline_run_status(db, args.run_id)
        operator_output = operator_summary(
            "pipeline-run-status",
            status=str(result["status"]),
            run_id=int(result["run_id"]),
            started_at=result["started_at"],
            completed_at=result["completed_at"],
            input_data={"run_type": result["run_type"]},
            counts={
                "selected": result["selected"],
                "succeeded": result["succeeded"],
                "retryable_failed": result["failed_retryable"],
                "terminal_failed": result["failed_terminal"],
                "skipped": result["skipped"],
            },
            canonical_db=db,
            external_requests=int(result["provider_requests"]),
            mutations=0,
            details=result,
        )
    elif args.command == "runs":
        from .operator_reporting import operator_summary
        from .pipeline_runs import list_pipeline_runs

        result = list_pipeline_runs(db, run_type=args.run_type, limit=args.limit)
        operator_output = operator_summary(
            "pipeline-runs",
            status="completed",
            input_data={"run_type": args.run_type, "limit": args.limit},
            counts={"selected": len(result)},
            canonical_db=db,
            mutations=0,
            details={"runs": result},
        )
    elif args.command == "retry-research":
        result = recover_research_for_retry(db, args.place_id, dry_run=args.dry_run)
    elif args.command == "research-low-footprint":
        from .low_footprint_research import run_low_footprint_research

        result = run_low_footprint_research(
            db,
            place_ids=args.place_ids,
            limit=args.limit,
            model=args.model,
            dry_run=args.dry_run,
        )
    elif args.command == "retry-address-research":
        result = recover_address_research_for_retry(db, args.place_id, dry_run=args.dry_run)
    elif args.command == "score":
        result = {"recalculated": recalculate_from_stored_evidence(db, place_id=args.place_id)}
        result["candidate"] = inspect_candidate(db, args.place_id)
    elif args.command == "run":
        from .catalog_pipeline import run_pipeline_batch

        result = run_pipeline_batch(
            db,
            place_id=args.place_id,
            limit=args.limit,
            osm_index=args.osm_index,
            osm_address_index=args.osm_address_index,
            model=args.model,
            dry_run=args.dry_run,
        )
    elif args.command == "verify-location":
        result = verify_location(
            db,
            args.place_id,
            osm_index=args.osm_index,
            osm_address_index=args.osm_address_index,
            dry_run=args.dry_run,
        )
    elif args.command == "restore-best-location":
        result = restore_best_location_from_history(db, args.place_id, dry_run=args.dry_run)
    elif args.command == "backfill-published-locations":
        result = backfill_legacy_published_locations(
            db,
            osm_index=args.osm_index,
            osm_address_index=args.osm_address_index,
            dry_run=args.dry_run,
        )
    elif args.command == "backfill-card-enrichment":
        from .card_enrichment import backfill_card_enrichment

        result = backfill_card_enrichment(
            db,
            phase=args.phase,
            dry_run=args.dry_run,
            limit=args.limit,
            model=args.model,
            place_id=args.place_id,
            min_fiyu_score=args.min_fiyu_score,
            retry_failed=args.retry_failed,
        )
    elif args.command == "retry-card-enrichment":
        from .card_enrichment import authorize_card_enrichment_retry

        result = authorize_card_enrichment_retry(db, args.place_id, dry_run=args.dry_run)
    elif args.command == "backfill-canonical-details":
        from .card_enrichment import backfill_canonical_details

        result = backfill_canonical_details(db, dry_run=args.dry_run)
    elif args.command == "quality-v4-backfill":
        from .quality_v4_backfill import run_quality_v4_backfill

        quality_place_ids = None
        if args.cohort_manifest:
            if args.place_id:
                raise ValueError("--cohort-manifest cannot be combined with --place-id")
            from .cohort_manifest import load_cohort_place_ids

            quality_place_ids = load_cohort_place_ids(args.cohort_manifest)

        result = run_quality_v4_backfill(
            db,
            limit=args.limit,
            place_id=args.place_id,
            place_ids=quality_place_ids,
            start_after=args.start_after,
            model=args.model,
            force=args.force,
            retry_failed=args.retry_failed,
            floor70_prepublication=args.floor70_prepublication,
            dry_run=args.dry_run,
            manifest_path=args.manifest_out,
            results_path=args.results_out,
        )
    elif args.command == "quality-v4-promote":
        from .quality_v4_promotion import run_quality_v4_promotion

        result = run_quality_v4_promotion(
            db,
            source_db=args.source_db,
            cohort_manifest=args.cohort_manifest,
            dry_run=args.dry_run,
            backup_path=args.backup_out,
            summary_path=args.summary_out,
            report_path=args.report_out,
        )
    elif args.command == "quality-v4-fix-specialist-version":
        from .quality_v4_version_fix import run_specialist_version_fix

        result = run_specialist_version_fix(
            db,
            cohort_manifest=args.cohort_manifest,
            source_db=args.source_db,
            dry_run=args.dry_run,
            backup_path=args.backup_out,
            summary_path=args.summary_out,
            report_path=args.report_out,
        )
    elif args.command == "specialist-tristate-migrate":
        from .specialist_tristate_migration import run_migration

        result = run_migration(
            db,
            dry_run=args.dry_run,
            backup_path=args.backup_out,
            summary_path=args.summary_out,
            report_path=args.report_out,
        )
    elif args.command == "reconcile-publication":
        from .publication_reconciliation import run_publication_reconciliation

        result = run_publication_reconciliation(
            db,
            threshold=args.threshold,
            cohort_manifest=args.cohort_manifest,
            dry_run=args.dry_run,
            backup_path=args.backup_out,
            summary_path=args.summary_out,
            report_path=args.report_out,
            changes_path=args.changes_out,
        )
    elif args.command == "review":
        result = inspect_candidate(db, args.place_id)
    elif args.command in {"approve", "reject"}:
        result = review_candidate(
            db,
            args.place_id,
            decision="approved" if args.command == "approve" else "rejected",
            reviewed_by=args.reviewed_by,
            notes=args.notes,
        )
    elif args.command == "publish":
        result = publish_candidate(db, args.place_id).to_dict()
    elif args.command == "completeness-apply":
        from .completeness import run_completeness_apply

        result = run_completeness_apply(
            db,
            backup_path=args.backup_out,
            audit_dir=args.audit_dir,
            seed_path=args.seed,
            summary_path=args.summary_out,
            report_path=args.report_out,
        )
    elif args.command in {
        "cuisine-normalize", "discovery-area-backfill", "price-normalize", "missing-budget"
    }:
        from .completeness import (
            run_cuisine_dry_run,
            run_discovery_area_dry_run,
            run_missing_budget_selector,
            run_price_dry_run,
        )

        if args.command == "cuisine-normalize":
            result = run_cuisine_dry_run(
                db,
                summary_path=args.summary_out,
                report_path=args.report_out,
                changes_path=args.changes_out,
            )
        elif args.command == "discovery-area-backfill":
            result = run_discovery_area_dry_run(
                db,
                summary_path=args.summary_out,
                report_path=args.report_out,
                changes_path=args.changes_out,
            )
        elif args.command == "price-normalize":
            result = run_price_dry_run(
                db,
                summary_path=args.summary_out,
                report_path=args.report_out,
                changes_path=args.changes_out,
            )
        else:
            result = run_missing_budget_selector(db, summary_path=args.summary_out)
    elif args.command in {"catalog-status", "funnel", "coverage"}:
        from .operator_reporting import operator_summary
        from .operator_status import catalog_status, coverage_report, funnel_report

        operation = args.command
        if operation == "catalog-status":
            result = catalog_status(db)
            selected = int(result["catalog"]["total"])
        elif operation == "funnel":
            result = funnel_report(db)
            selected = int(result["stages"]["seeded"])
        else:
            result = coverage_report(db)
            selected = int(result["completeness"]["published"])
        operator_output = operator_summary(
            operation,
            status="completed",
            counts={"selected": selected},
            canonical_db=db,
            mutations=0,
            details=result,
        )
    else:
        result = pipeline_status(db)
    if operator_output is not None:
        from .operator_reporting import format_operator_summary, write_operator_summary

        write_operator_summary(operator_output, summary_out)
        print(format_operator_summary(operator_output))
    elif args.command == "seed-unseeded" and not args.verbose:
        print(_format_seed_unseeded_summary(result))
    elif args.command == "quality-v4-backfill" and not args.verbose:
        from .quality_v4_backfill import compact_backfill_summary

        print(compact_backfill_summary(result))
    elif args.command == "quality-v4-promote" and not args.verbose:
        from .quality_v4_promotion import compact_promotion_summary

        print(compact_promotion_summary(result))
    elif args.command == "quality-v4-fix-specialist-version" and not args.verbose:
        from .quality_v4_version_fix import compact_summary

        print(compact_summary(result))
    elif args.command == "specialist-tristate-migrate" and not args.verbose:
        from .specialist_tristate_migration import compact_summary

        print(compact_summary(result))
    elif args.command == "reconcile-publication" and not args.verbose:
        from .publication_reconciliation import compact_summary

        print(compact_summary(result))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    if (
        operator_output is not None
        and operator_output["mode"] != "dry_run"
        and str(operator_output["operation"]).startswith("research-")
    ):
        counts = operator_output["counts"]
        if counts["retryable_failed"] or counts["terminal_failed"]:
            return 3
    return 0


if __name__ == "__main__":
    print(
        "Notice: `python -m fiyu.pipeline_cli` is a compatibility entry point; "
        "prefer `fiyu pipeline`.",
        file=sys.stderr,
    )
    raise SystemExit(main())
