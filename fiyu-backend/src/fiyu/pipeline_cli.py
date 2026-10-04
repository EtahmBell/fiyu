from __future__ import annotations

import argparse
import json
import statistics
import sys
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

    research = commands.add_parser("research")
    research.add_argument("--place-id")
    research.add_argument("--limit", type=int, default=1)
    research.add_argument("--model")
    research.add_argument("--retry-failed", action="store_true")
    research.add_argument("--dry-run", action="store_true")

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


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = _parser().parse_args()
    db = Path(args.db)
    if args.command == "inspect":
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
        result = seed_unseeded_public_queue(
            db,
            limit=args.limit,
            min_internal_score=args.min_score,
            seed=args.seed,
            dry_run=args.dry_run,
        )
        if manifest_path is not None:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n",
                encoding="utf-8",
            )
            result["manifest_out"] = str(manifest_path)
    elif args.command == "research":
        from .research_worker import run_research_batch

        result = run_research_batch(
            db,
            limit=args.limit,
            model=args.model,
            retry_failed=args.retry_failed,
            place_id=args.place_id,
            dry_run=args.dry_run,
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
    else:
        result = pipeline_status(db)
    if args.command == "seed-unseeded" and not args.verbose:
        print(_format_seed_unseeded_summary(result))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
