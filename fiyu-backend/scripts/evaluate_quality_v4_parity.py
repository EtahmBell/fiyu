"""Read-only full-catalog parity audit for the experimental Quality override."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any

from fiyu.card_enrichment import scoring_research_view
from fiyu.catalog_pipeline import _effective_structured_research
from fiyu.experimental_score_v4 import evaluate_with_quality_adjustment
from fiyu.public_score import FiyuEvidence, InternalSignals, evaluate_fiyu_candidate


def _json(value: object, fallback: object) -> Any:
    try:
        return json.loads(str(value or ""))
    except (json.JSONDecodeError, TypeError):
        return fallback


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def audit(db_path: Path) -> dict[str, object]:
    before = _hash(db_path)
    connection = sqlite3.connect(f"file:{db_path.resolve().as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    query = """
        SELECT p.*, r.title AS candidate_title, r.category AS candidate_category,
               r.broad_category AS candidate_broad_category,
               r.quality_score, r.underexposure_score, r.digital_footprint_score,
               rr.structured_research_json
        FROM public_restaurants p
        JOIN restaurants r ON r.place_id=p.place_id
        LEFT JOIN restaurant_research_runs rr ON rr.id=(
            SELECT latest.id FROM restaurant_research_runs latest
            WHERE latest.public_restaurant_id=p.place_id AND latest.status='complete'
            ORDER BY latest.is_current DESC, latest.id DESC LIMIT 1
        )
        WHERE p.research_status='complete' AND p.fiyu_score IS NOT NULL
        ORDER BY p.place_id
    """
    parity_mismatches: list[dict[str, object]] = []
    monotonicity_violations: list[dict[str, object]] = []
    stored_score_mismatches = 0
    component_drift: Counter[str] = Counter()
    maximum_parity_mismatch = 0.0
    evaluated = 0
    try:
        for sqlite_row in connection.execute(query).fetchall():
            row = dict(sqlite_row)
            evidence_payload = _json(row.get("evidence_json"), {})
            structured = _json(row.get("structured_research_json"), {})
            if not isinstance(evidence_payload, dict) or not isinstance(structured, dict):
                continue
            evidence = FiyuEvidence(**evidence_payload)
            effective = scoring_research_view(
                _effective_structured_research(connection, str(row["place_id"]), structured)
            )
            internal = InternalSignals(
                quality_score=float(row.get("quality_score") or 0),
                underexposure_score=float(row.get("underexposure_score") or 0),
                digital_footprint_score=float(row.get("digital_footprint_score") or 0),
            )
            primary_category = str(
                row.get("primary_category")
                or row.get("candidate_category")
                or row.get("candidate_broad_category")
                or ""
            )
            production = evaluate_fiyu_candidate(
                evidence,
                internal,
                effective,
                primary_category=primary_category,
            )
            zero = evaluate_with_quality_adjustment(
                evidence,
                internal,
                effective,
                primary_category=primary_category,
            )
            evaluated += 1
            mismatch = abs(zero.fiyu_score - production.fiyu_score)
            maximum_parity_mismatch = max(maximum_parity_mismatch, mismatch)
            if mismatch:
                parity_mismatches.append(
                    {
                        "place_id": row["place_id"],
                        "production": production.fiyu_score,
                        "experimental": zero.fiyu_score,
                    }
                )
            if float(row.get("fiyu_score") or 0) != production.fiyu_score:
                stored_score_mismatches += 1
            for field, current_value in (
                ("hiddenness_signal", production.hiddenness_signal),
                ("independence_signal", production.independence_signal),
                ("local_discovery_score", production.local_discovery_score),
            ):
                if float(row.get(field) or 0) != current_value:
                    component_drift[field] += 1
            for adjustment in (-20.0, -10.0, -5.0, -1.0, 1.0, 5.0, 10.0, 20.0):
                candidate = evaluate_with_quality_adjustment(
                    evidence,
                    internal,
                    effective,
                    primary_category=primary_category,
                    quality_adjustment=adjustment,
                )
                violates = (adjustment > 0 and candidate.fiyu_score < production.fiyu_score) or (
                    adjustment < 0 and candidate.fiyu_score > production.fiyu_score
                )
                if violates:
                    monotonicity_violations.append(
                        {
                            "place_id": row["place_id"],
                            "adjustment": adjustment,
                            "production": production.fiyu_score,
                            "experimental": candidate.fiyu_score,
                        }
                    )
    finally:
        connection.close()
    after = _hash(db_path)
    return {
        "restaurants_evaluated": evaluated,
        "exact_zero_adjustment_matches": evaluated - len(parity_mismatches),
        "zero_adjustment_mismatches": len(parity_mismatches),
        "maximum_absolute_mismatch": round(maximum_parity_mismatch, 12),
        "monotonicity_violations": len(monotonicity_violations),
        "parity_mismatch_examples": parity_mismatches[:20],
        "monotonicity_violation_examples": monotonicity_violations[:20],
        "historical_stored_score_mismatches_vs_current_v3": stored_score_mismatches,
        "historical_component_drift_counts": dict(component_drift),
        "prior_bug_root_cause": (
            "The prior runner combined a freshly recomputed current-v3 score with "
            "historical stored H/I/LD columns from the comparison CSV, then recomposed "
            "the score outside the canonical production evaluator."
        ),
        "production_database_sha256_before": before,
        "production_database_sha256_after": after,
        "production_database_unchanged": before == after,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=Path("data/fiyu.db"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/audits/quality-v4-parity-summary.json"),
    )
    args = parser.parse_args()
    result = audit(args.db)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
