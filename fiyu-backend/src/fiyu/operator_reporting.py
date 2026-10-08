"""Small shared envelope for current operator-facing pipeline summaries."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

OPERATOR_SUMMARY_VERSION = "operator-summary-v1"
COUNT_FIELDS = (
    "selected",
    "created",
    "updated",
    "unchanged",
    "skipped",
    "succeeded",
    "retryable_failed",
    "terminal_failed",
    "blocked",
)


def operator_summary(
    operation: str,
    *,
    status: str,
    mode: str = "real",
    run_id: int | None = None,
    started_at: object = None,
    completed_at: object = None,
    input_data: dict[str, object] | None = None,
    counts: dict[str, object] | None = None,
    canonical_db: str | Path | None = None,
    dry_run: bool = False,
    external_requests: int = 0,
    mutations: int | str | None = 0,
    artifacts: dict[str, object] | None = None,
    details: dict[str, object] | list[object] | None = None,
) -> dict[str, object]:
    supplied = counts or {}
    normalized_counts = {field: int(supplied.get(field, 0) or 0) for field in COUNT_FIELDS}
    summary: dict[str, object] = {
        "operation": operation,
        "operation_version": OPERATOR_SUMMARY_VERSION,
        "run_id": run_id,
        "mode": "dry_run" if dry_run else mode,
        "started_at": started_at,
        "completed_at": completed_at or datetime.now(UTC).isoformat(),
        "status": status,
        "input": input_data or {},
        "counts": normalized_counts,
        "safety": {
            "canonical_db": str(canonical_db) if canonical_db is not None else None,
            "dry_run": dry_run,
            "external_requests": int(external_requests),
            "mutations": 0 if dry_run else mutations,
        },
        "artifacts": artifacts or {},
        "details": details or {},
    }
    return summary


def write_operator_summary(summary: dict[str, object], path: str | Path | None) -> None:
    if path is None:
        return
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def format_operator_summary(summary: dict[str, Any]) -> str:
    """Render the stable envelope without dumping operation-specific bulk data."""

    lines = [
        f"Operation: {summary['operation']}",
        f"Run: {summary.get('run_id') if summary.get('run_id') is not None else '-'}",
        f"Mode: {summary['mode']}",
        f"Status: {summary['status']}",
    ]
    counts = summary.get("counts", {})
    visible = [(name, value) for name, value in counts.items() if value]
    if visible:
        lines.append("")
        lines.extend(f"{name.replace('_', ' ').title()}: {value}" for name, value in visible)
    safety = summary.get("safety", {})
    lines.extend(("", f"External requests: {safety.get('external_requests', 0)}"))
    details = summary.get("details", {})
    operation = summary["operation"]
    if operation == "catalog-status":
        catalog = details["catalog"]
        readiness = details["readiness"]
        lineage = details["lineage"]
        lines.extend(
            (
                "",
                "Catalog:",
                f"  raw candidates: {catalog['raw_candidate_rows']}",
                f"  seeded/public rows: {catalog['total']}",
                f"  published: {catalog['published']}",
                f"  unpublished: {catalog['unpublished']}",
                f"  threshold: {catalog['publication_threshold']:g}",
                "Lineage:",
                f"  V4 specialist: {lineage['v4_specialist']}",
                f"  stale V4: {lineage['stale_v4']}",
                f"  V3 specialist: {lineage['v3_specialist']}",
                f"  unscored: {lineage['unscored']}",
                "Readiness:",
                f"  research pending: {readiness['research_pending']}",
                f"  retryable research failures: {readiness['retryable_research_failures']}",
                f"  Quality-v4 remaining: {readiness['quality_v4_remaining']}",
                (
                    f"  >= threshold but unpublished: "
                    f"{readiness['score_at_or_above_threshold_but_unpublished']}"
                ),
                f"  map/Picks-ready published: {readiness['map_picks_ready_published']}",
            )
        )
    elif operation == "funnel":
        lines.extend(("", "Funnel:"))
        lines.extend(
            f"  {name.replace('_', ' ')}: {value}"
            for name, value in details["stages"].items()
        )
    elif operation == "coverage":
        lines.extend(("", "Completeness:"))
        lines.extend(
            f"  {name.replace('_', ' ')}: {value}"
            for name, value in details["completeness"].items()
        )
        for label in ("published_by_ward", "candidate_unseeded_by_area", "published_cuisine"):
            lines.append(f"{label.replace('_', ' ').title()} (top 10):")
            lines.extend(
                f"  {name}: {value}"
                for name, value in list(details[label].items())[:10]
            )
    elif operation == "source-run-status":
        impact = details.get("impact", {})
        cheap = impact.get("cheap_score", {})
        lines.extend(
            (
                "",
                f"Source: {details['source_key']}",
                f"Rows seen: {details['total_rows_seen']}",
                f"Valid / invalid: {details['valid_rows']} / {details['invalid_rows']}",
                (
                    f"New / updated / unchanged: {details['new_candidates']} / "
                    f"{details['updated_candidates']} / {details['unchanged_candidates']}"
                ),
                f"Source-local stale: {details['source_local_missing']}",
                f"Cheap scores changed: {cheap.get('scores_changed', 0)}",
                (
                    f"Became eligible / ineligible: "
                    f"{cheap.get('became_seed_eligible', 0)} / "
                    f"{cheap.get('became_seed_ineligible', 0)}"
                ),
            )
        )
    elif operation == "pipeline-run-status":
        lines.extend(
            (
                "",
                f"Type: {details['run_type']}",
                (
                    f"Pending / running: {details['pending']} / "
                    f"{details['claimed'] + details['running']}"
                ),
                f"Attempts: {details['attempts']}",
                "Remaining work: "
                + ("none" if details["no_remaining_work"] else str(details["remaining_work"])),
            )
        )
    elif operation in {"pipeline-runs", "source-runs"}:
        lines.append("")
        for run in details["runs"]:
            lines.append(
                " | ".join(
                    str(run.get(key, "-"))
                    for key in ("run_id" if operation == "pipeline-runs" else "id", "run_type" if operation == "pipeline-runs" else "source_key", "status", "created_at" if operation == "pipeline-runs" else "started_at")
                )
            )
    elif operation == "source-ingest":
        impact = details["impact"]
        cheap = impact["cheap_score"]
        lines.extend(
            (
                "",
                (
                    f"Candidates before / after: {impact['canonical_candidates_before']} / "
                    f"{impact['canonical_candidates_after']}"
                ),
                f"Cheap scores changed: {cheap['scores_changed']}",
                (
                    f"Median / max absolute delta: {cheap['median_absolute_delta']} / "
                    f"{cheap['max_absolute_delta']}"
                ),
                (
                    f"Became eligible / ineligible: {cheap['became_seed_eligible']} / "
                    f"{cheap['became_seed_ineligible']}"
                ),
            )
        )
    elif operation == "sqlite-backup":
        lines.extend(
            (
                "",
                f"Output: {details['output']}",
                f"SHA-256: {details['sha256']}",
                f"Integrity: {details['integrity']}",
            )
        )
    return "\n".join(lines)
