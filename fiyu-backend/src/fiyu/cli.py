from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import ScoringConfig
from .ingest import run_ingestion


def _add_scoring_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", help="Optional JSON scoring configuration file")
    parser.add_argument("--target-rating", type=float, help="Override target rating (default 4.2)")
    parser.add_argument("--minimum-rating", type=float, help="Override minimum rating (default 3.9)")
    parser.add_argument("--soft-review-cap", type=int, help="Override simple-rule cap (default 100)")
    parser.add_argument("--minimum-review-count", type=int, help="Minimum reviews for candidate eligibility")
    parser.add_argument(
        "--maximum-review-count", type=int, help="Maximum reviews for candidate eligibility"
    )
    parser.add_argument("--minimum-candidate-score", type=float, help="Eligibility score threshold")


def _config_from_args(args: argparse.Namespace) -> ScoringConfig:
    base = ScoringConfig.from_json(args.config)
    updates = {
        "target_rating": args.target_rating,
        "minimum_rating": args.minimum_rating,
        "soft_review_cap": args.soft_review_cap,
        "minimum_review_count": args.minimum_review_count,
        "maximum_review_count": args.maximum_review_count,
        "minimum_candidate_score": args.minimum_candidate_score,
    }
    values = base.to_dict()
    values.update({key: value for key, value in updates.items() if value is not None})
    config = ScoringConfig(**values)
    config.validate()
    return config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="fiyu", description="Fiyu candidate scoring backend")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest = subparsers.add_parser("ingest", help="Combine, clean, deduplicate, and score datasets")
    ingest.add_argument("inputs", nargs="+", help="Input files or directories")
    ingest.add_argument("--db", default="data/fiyu.db", help="SQLite output path")
    ingest.add_argument("--csv-out", default="data/processed/restaurants_scored.csv")
    ingest.add_argument(
        "--include-all-categories",
        action="store_true",
        help="Skip restaurant-category filtering",
    )
    _add_scoring_arguments(ingest)

    demo = subparsers.add_parser("demo", help="Ingest the included sample dataset")
    demo.add_argument("--db", default="data/demo.db")
    demo.add_argument("--csv-out", default="data/processed/demo_scored.csv")
    _add_scoring_arguments(demo)

    init_config = subparsers.add_parser("write-config", help="Write default scoring JSON")
    init_config.add_argument("path", nargs="?", default="scoring.example.json")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "write-config":
        path = Path(args.path)
        path.write_text(json.dumps(ScoringConfig().to_dict(), indent=2), encoding="utf-8")
        print(f"Wrote {path}")
        return

    config = _config_from_args(args)
    if args.command == "demo":
        project_root = Path(__file__).resolve().parents[2]
        sample = project_root / "sample_data" / "sample_apify.csv"
        if not sample.exists():
            raise FileNotFoundError(f"Sample file missing: {sample}")
        inputs = [sample]
        include_all_categories = False
    else:
        inputs = args.inputs
        include_all_categories = args.include_all_categories

    result = run_ingestion(
        inputs,
        db_path=args.db,
        csv_output=args.csv_out,
        config=config,
        include_all_categories=include_all_categories,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
