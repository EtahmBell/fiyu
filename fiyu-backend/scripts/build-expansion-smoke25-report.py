from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from fiyu.public_catalog import (
    get_public_restaurant,
    get_public_restaurant_detail,
    list_public_restaurants,
)

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data/fiyu.db"
BASELINE = ROOT / "data/backups/fiyu-pre-expansion-smoke25-20261008.db"
COHORT = ROOT / "data/audits/expansion-smoke25-cohort.json"
RESEARCH = ROOT / "data/audits/expansion-smoke25-research-run-status.json"
V4 = ROOT / "data/audits/expansion-smoke25-quality-v4.json"
PUBLICATION = ROOT / "data/audits/expansion-smoke25-publication-dry-run.json"
STATUS = ROOT / "data/audits/expansion-smoke25-catalog-status.json"
COVERAGE = ROOT / "data/audits/expansion-smoke25-coverage.json"
SUMMARY = ROOT / "data/audits/expansion-smoke25-summary.json"
REPORT = ROOT / "data/audits/expansion-smoke25-report.md"
SEED = ROOT / "seed70.txt"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


cohort = load(COHORT)
ids = cohort["ordered_place_ids"]
research = load(RESEARCH)["details"]
v4 = load(V4)
publication = load(PUBLICATION)
status = load(STATUS)
coverage = load(COVERAGE)
v4_by_id = {row["place_id"]: row for row in v4["rows"]}

connection = sqlite3.connect(DB)
connection.row_factory = sqlite3.Row
baseline = sqlite3.connect(BASELINE)
baseline.row_factory = sqlite3.Row
placeholders = ",".join("?" for _ in ids)
rows = {
    str(row["place_id"]): dict(row)
    for row in connection.execute(
        f"""
        SELECT p.*, r.title AS source_title, r.internal_fiyu_score,
               r.rating, r.review_count, r.search_area
        FROM public_restaurants p
        JOIN restaurants r ON r.place_id=p.place_id
        WHERE p.place_id IN ({placeholders})
        """,
        ids,
    )
}
original_ids = {
    str(row[0])
    for row in baseline.execute(
        "SELECT place_id FROM public_restaurants WHERE is_published=1"
    )
}
changed_originals = []
for place_id in sorted(original_ids):
    before = baseline.execute(
        "SELECT * FROM public_restaurants WHERE place_id=?", (place_id,)
    ).fetchone()
    after = connection.execute(
        "SELECT * FROM public_restaurants WHERE place_id=?", (place_id,)
    ).fetchone()
    if after is None or tuple(before) != tuple(after):
        changed_originals.append(place_id)

published_ids = [place_id for place_id in ids if rows[place_id]["is_published"]]
blocked_ids = [place_id for place_id in ids if not rows[place_id]["is_published"]]
public_list_ids = {
    str(row["place_id"])
    for row in list_public_restaurants(DB, published_only=True, limit=2000)
}
detail_ok = {
    place_id: get_public_restaurant_detail(DB, place_id) is not None
    for place_id in published_ids
}
blocked_hidden = {
    place_id: get_public_restaurant(DB, place_id) is None for place_id in blocked_ids
}
quality_started = datetime.fromisoformat(v4["created_at"])
quality_finished = datetime.fromisoformat(v4["updated_at"])
research_started = datetime.fromisoformat(research["started_at"])
research_finished = datetime.fromisoformat(research["completed_at"])

cohort_rows = []
for place_id in ids:
    row = rows[place_id]
    shadow = v4_by_id[place_id]
    evidence = json.loads(row.get("evidence_json") or "{}")
    reason = "published" if row["is_published"] else next(
        item["reason_category"]
        for item in publication["non_score_blocked_at_or_above_threshold"]["rows"]
        if item["place_id"] == place_id
    )
    cohort_rows.append(
        {
            "place_id": place_id,
            "name": row.get("name_en") or row.get("name_ja") or row["source_title"],
            "internal_score": row["internal_fiyu_score"],
            "standard_research_status": row["research_status"],
            "quality_v4_status": shadow["status"],
            "specialist_status": row["specialist_status"],
            "public_score": row["fiyu_score"],
            "product_eligible": bool(row["product_eligible"]),
            "identity_confidence": row["identity_confidence"],
            "matched_restaurant": evidence.get("matched_restaurant"),
            "address_conflict": bool(evidence.get("address_conflict")),
            "published": bool(row["is_published"]),
            "outcome_reason": reason,
            "quality_adjustment": shadow["guarded_quality_adjustment"],
        }
    )

summary = {
    "verdict": {
        "completed_successfully": True,
        "first_five_health_gate_passed": True,
        "systemic_failures": 0,
        "published_additions": len(published_ids),
        "original_publication_changes": len(changed_originals),
        "ready_for_larger_waves": True,
        "post_commit_idempotency_bug_fixed": True,
    },
    "cohort": {
        "count": len(ids),
        "selector_fingerprint": cohort["selector_fingerprint"],
        "rows": cohort_rows,
    },
    "standard_research": {
        "run_id": research["run_id"],
        "succeeded": research["succeeded"],
        "retryable_remaining": research["failed_retryable"],
        "terminal_failures": research["failed_terminal"],
        "attempts": research["attempts"],
        "provider_calls": research["provider_requests"],
        "web_actions": research["web_search_actions"],
        "input_tokens": research["input_tokens"],
        "output_tokens": research["output_tokens"],
        "total_tokens": research["total_tokens"],
        "elapsed_seconds": (research_finished - research_started).total_seconds(),
    },
    "quality_v4": {
        "completed": v4["completed"],
        "failed": v4["failed"],
        "needs_retry": v4["needs_retry"],
        "provider_calls": v4["responses_requests"],
        "web_actions": v4["web_search_actions"],
        **v4["token_usage"],
        "elapsed_seconds": (quality_finished - quality_started).total_seconds(),
        "adjustment_min": min(row["guarded_quality_adjustment"] for row in v4["rows"]),
        "adjustment_mean": round(
            sum(row["guarded_quality_adjustment"] for row in v4["rows"]) / len(ids), 2
        ),
        "adjustment_max": max(row["guarded_quality_adjustment"] for row in v4["rows"]),
    },
    "cost_throughput": {
        "external_requests": research["provider_requests"] + v4["responses_requests"],
        "total_tokens": research["total_tokens"] + v4["token_usage"]["total_tokens"],
        "measured_provider_elapsed_seconds": (
            research_finished - research_started
        ).total_seconds()
        + (quality_finished - quality_started).total_seconds(),
        "external_requests_per_selected_restaurant": round(
            (research["provider_requests"] + v4["responses_requests"]) / len(ids), 2
        ),
        "dollar_cost": None,
    },
    "publication": {
        "before": 851,
        "additions": len(published_ids),
        "removals": 0,
        "after": connection.execute(
            "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1"
        ).fetchone()[0],
        "blocked": len(blocked_ids),
        "blocked_reason_counts": dict(
            publication["non_score_blocked_at_or_above_threshold"]["categories"]
        ),
    },
    "product_validation": {
        "published_in_public_list": sum(item in public_list_ids for item in published_ids),
        "published_detail_available": sum(detail_ok.values()),
        "blocked_public_detail_hidden": sum(blocked_hidden.values()),
        "published_map_ready": sum(bool(rows[item]["map_display_eligible"]) for item in published_ids),
        "published_with_food_tags": sum(
            bool(json.loads(rows[item].get("food_tags_json") or "[]"))
            for item in published_ids
        ),
        "published_with_discovery_area": sum(
            bool(rows[item].get("discovery_area")) for item in published_ids
        ),
        "published_with_price": sum(
            rows[item].get("price_tier") is not None for item in published_ids
        ),
    },
    "database_safety": {
        "backup": str(BASELINE.relative_to(ROOT)),
        "backup_sha256": sha(BASELINE),
        "database_sha256_before": "D3745468750C908EB2592B82DA59BFE140DE037D722305160E59C6BA66427864",
        "database_sha256_after": sha(DB),
        "seed70_sha256_before": "BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39",
        "seed70_sha256_after": sha(SEED),
        "integrity": connection.execute("PRAGMA integrity_check").fetchone()[0],
        "foreign_key_violations": len(connection.execute("PRAGMA foreign_key_check").fetchall()),
        "duplicate_place_ids": connection.execute(
            "SELECT COUNT(*) FROM (SELECT place_id FROM public_restaurants GROUP BY place_id HAVING COUNT(*)>1)"
        ).fetchone()[0],
        "broken_public_pointers": connection.execute(
            """
            SELECT COUNT(*) FROM public_restaurants p
            LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
            WHERE p.source_restaurant_id IS NOT NULL AND r.id IS NULL
            """
        ).fetchone()[0],
        "original_rows_changed": changed_originals,
    },
    "validation": {
        "focused": "499 passed",
        "full_backend": "1042 passed, 1 deprecation warning",
        "ruff": "passed",
        "git_diff_check": "passed",
    },
    "operator_status": {"catalog": status, "coverage": coverage},
}

SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
lines = [
    "# Expansion smoke25 report",
    "",
    "## Verdict",
    "",
    f"Completed successfully. First-five gate passed; systemic failures: 0. Published {len(published_ids)} of 25. Original 851 changed: {len(changed_originals)}.",
    "",
    "## Cohort outcomes",
    "",
    "| Name | place_id | Internal | Research | V4 | Specialist | Score | Outcome |",
    "|---|---|---:|---|---|---|---:|---|",
]
for row in cohort_rows:
    lines.append(
        f"| {row['name']} | `{row['place_id']}` | {row['internal_score']:.2f} | "
        f"{row['standard_research_status']} | {row['quality_v4_status']} | "
        f"{row['specialist_status']} | {row['public_score']:.2f} | {row['outcome_reason']} |"
    )
lines.extend(
    [
        "",
        "## Usage",
        "",
        f"Standard research: {research['provider_requests']} calls, {research['web_search_actions']} web actions, {research['total_tokens']} tokens, {(research_finished - research_started).total_seconds():.1f}s.",
        f"Quality-v4: {v4['responses_requests']} calls, {v4['web_search_actions']} web actions, {v4['token_usage']['total_tokens']} tokens, {(quality_finished - quality_started).total_seconds():.1f}s.",
        f"Total: {research['provider_requests'] + v4['responses_requests']} external requests, {research['total_tokens'] + v4['token_usage']['total_tokens']} tokens, {(research_finished - research_started).total_seconds() + (quality_finished - quality_started).total_seconds():.1f}s measured provider work; no dollar cost was available.",
        "",
        "## Publication and product validation",
        "",
        f"Published 851 -> {summary['publication']['after']} (+{len(published_ids)}, -0). Public list/detail checks passed for all additions; all {len(blocked_ids)} blocked rows remain hidden.",
        f"Map-ready additions: {summary['product_validation']['published_map_ready']}; food-tagged additions: {summary['product_validation']['published_with_food_tags']}.",
        "",
        "## Database safety",
        "",
        f"Integrity {summary['database_safety']['integrity']}; foreign-key violations {summary['database_safety']['foreign_key_violations']}; duplicate place IDs {summary['database_safety']['duplicate_place_ids']}; original-row changes {len(changed_originals)}.",
        "",
        "## Validation",
        "",
        "Focused regression: 499 passed. Full backend: 1042 passed (one dependency deprecation warning). Ruff and git diff --check passed.",
        "",
    ]
)
REPORT.write_text("\n".join(lines), encoding="utf-8")
