from __future__ import annotations

import argparse
import json
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
    backfill_enrichment.add_argument("--dry-run", action="store_true")

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
    else:
        result = pipeline_status(db)
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
