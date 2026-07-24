from __future__ import annotations

import argparse
import json
from pathlib import Path

from .public_catalog import (
    ensure_public_schema,
    export_public_csv,
    list_public_restaurants,
    recalculate_from_stored_evidence,
    seed_public_queue,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fiyu public catalog and research commands")
    parser.add_argument("--db", default="data/fiyu.db", help="SQLite database path")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init", help="Create the public_restaurants table")

    seed = subparsers.add_parser("seed", help="Seed the research queue from candidates")
    seed.add_argument("--limit", type=int, default=50)
    seed.add_argument("--min-score", type=float, default=60.0)
    seed.add_argument("--simple-rule-only", action="store_true")

    research = subparsers.add_parser("research", help="Research queued candidates with OpenAI")
    research.add_argument("--limit", type=int, default=10)
    research.add_argument("--model", default=None)
    research.add_argument("--retry-failed", action="store_true")

    subparsers.add_parser("recalculate", help="Recalculate scores from stored evidence")

    show = subparsers.add_parser("list", help="Print catalog rows as JSON")
    show.add_argument("--limit", type=int, default=20)
    show.add_argument("--published-only", action="store_true")

    export = subparsers.add_parser("export", help="Export a spreadsheet-friendly CSV")
    export.add_argument("--output", default="data/processed/public_restaurants.csv")
    export.add_argument("--published-only", action="store_true")
    return parser


def main() -> None:
    args = _parser().parse_args()
    db_path = Path(args.db)

    if args.command == "init":
        ensure_public_schema(db_path)
        print(json.dumps({"status": "ok", "table": "public_restaurants"}, indent=2))
    elif args.command == "seed":
        count = seed_public_queue(
            db_path,
            limit=args.limit,
            min_internal_score=args.min_score,
            simple_rule_only=args.simple_rule_only,
        )
        print(json.dumps({"seeded": count}, indent=2))
    elif args.command == "research":
        from .research_worker import run_research_batch

        result = run_research_batch(
            db_path,
            limit=args.limit,
            model=args.model,
            retry_failed=args.retry_failed,
        )
        print(json.dumps(result, indent=2))
    elif args.command == "recalculate":
        print(json.dumps({"recalculated": recalculate_from_stored_evidence(db_path)}, indent=2))
    elif args.command == "list":
        print(
            json.dumps(
                list_public_restaurants(
                    db_path,
                    published_only=args.published_only,
                    limit=args.limit,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
    elif args.command == "export":
        count = export_public_csv(
            db_path,
            args.output,
            published_only=args.published_only,
        )
        print(json.dumps({"exported": count, "path": args.output}, indent=2))


if __name__ == "__main__":
    main()
