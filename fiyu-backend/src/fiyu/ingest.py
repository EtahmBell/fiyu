from __future__ import annotations

import csv
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

from .columns import raw_record_from_row
from .config import ScoringConfig
from .database import replace_restaurants
from .normalize import add_chain_features, clean_and_dedupe
from .readers import iter_input_files, iter_rows
from .scoring import score_records


EXPORT_FIELDS = [
    "place_id",
    "cid",
    "title",
    "address",
    "city",
    "neighborhood",
    "latitude",
    "longitude",
    "search_area",
    "source_areas",
    "category",
    "broad_category",
    "rating",
    "review_count",
    "website",
    "website_domain",
    "digital_footprint_type",
    "chain_flag",
    "chain_reason",
    "adjusted_rating",
    "quality_score",
    "underexposure_score",
    "digital_footprint_score",
    "confidence_score",
    "independent_score",
    "score_penalty",
    "internal_fiyu_score",
    "candidate_tier",
    "confidence_band",
    "matches_simple_rule",
    "candidate_eligible",
    "score_reasons",
    "peer_group_size",
    "peer_review_percentile",
    "maps_url",
    "image_url",
    "price",
    "phone",
    "scraped_at",
    "source_files",
]


def iter_normalized_records(files: Iterable[Path]) -> Iterable[dict[str, object]]:
    for path in files:
        for row in iter_rows(path):
            yield raw_record_from_row(row, str(path))


def _serialize(value: object) -> object:
    if isinstance(value, list):
        return "|".join(str(item) for item in value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def export_csv(records: list[dict[str, object]], output_path: str | Path) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=EXPORT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for record in sorted(
            records, key=lambda item: float(item.get("internal_fiyu_score") or 0), reverse=True
        ):
            writer.writerow({field: _serialize(record.get(field)) for field in EXPORT_FIELDS})


def run_ingestion(
    input_paths: list[str | Path],
    *,
    db_path: str | Path,
    csv_output: str | Path | None,
    config: ScoringConfig,
    include_all_categories: bool = False,
) -> dict[str, object]:
    files = iter_input_files(input_paths)
    normalized = iter_normalized_records(files)
    records, cleaning_stats = clean_and_dedupe(
        normalized, include_all_categories=include_all_categories
    )
    add_chain_features(records, config.chain_title_threshold, config.chain_domain_threshold)
    score_records(records, config)
    replace_restaurants(db_path, records, config)
    if csv_output:
        export_csv(records, csv_output)

    return {
        "files": [str(path) for path in files],
        "cleaning": asdict(cleaning_stats),
        "candidate_count": sum(bool(record.get("candidate_eligible")) for record in records),
        "simple_rule_count": sum(bool(record.get("matches_simple_rule")) for record in records),
        "top_candidate_count": sum(
            record.get("candidate_tier") == "top_candidate" for record in records
        ),
        "database": str(db_path),
        "csv_output": str(csv_output) if csv_output else None,
        "scoring_config": config.to_dict(),
    }
