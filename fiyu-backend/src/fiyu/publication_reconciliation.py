"""Transactional, manifest-asserted reconciliation of canonical publication state."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import tempfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .catalog_pipeline import (
    PIPELINE_VERSION,
    PUBLICATION_THRESHOLD_METADATA_KEY,
    automatic_publication_decision,
    publication_score_threshold,
)
from .database import connect
from .quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION
from .quality_v4_promotion import _create_backup, _sha256
from .sqlite_snapshot import readonly_sqlite_snapshot

EXPECTED_TOTAL = 1203
EXPECTED_CURRENT_PUBLISHED = 538
EXPECTED_FINAL_PUBLISHED = 851
EXPECTED_MANIFEST_COUNT = 313
EXPECTED_VERSION_COUNTS = {
    QUALITY_PRODUCTION_SCORE_VERSION: 861,
    "public-v4-quality-research": 0,
    "public-v3-local-discovery-specialist-tristate": 231,
    "NULL": 111,
}
SANKEI_PLACE_ID = "ChIJi79LD-yIGGAR_8wLG2_pyYE"
ALLOWED_PUBLICATION_FIELDS = {
    "is_published",
    "review_status",
    "review_notes",
    "pipeline_version",
    "updated_at",
}


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError(f"expected JSON object: {path}")
    return payload


def _manifest_ids(path: Path) -> list[str]:
    payload = _load_json(path)
    if payload.get("manifest_version") != "quality-v4-promotion-cohort-1":
        raise ValueError("unexpected cohort manifest version")
    if payload.get("cohort_name") != "floor70-prepublication-v4":
        raise ValueError("unexpected cohort manifest name")
    if float(payload.get("target_floor", 0)) != 70.0:
        raise ValueError("cohort manifest target_floor must be 70")
    rows = payload.get("restaurants")
    if not isinstance(rows, list):
        raise TypeError("cohort manifest restaurants must be a list")
    ids = [str(row["place_id"]) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("cohort manifest contains duplicate place_ids")
    if int(payload.get("cohort_count", -1)) != len(ids):
        raise ValueError("cohort_count does not match manifest rows")
    audit = Path(str(payload.get("created_from_audit") or ""))
    expected_audit_sha = str(payload.get("audit_summary_sha256") or "").upper()
    if audit.exists() and expected_audit_sha and _sha256(audit) != expected_audit_sha:
        raise ValueError("cohort audit summary SHA does not match manifest")
    return ids


def _is_expansion_manifest(path: Path) -> bool:
    return _load_json(path).get("manifest_version") == "deterministic-unseeded-cohort-1"


def _expansion_manifest_ids(path: Path) -> list[str]:
    from .cohort_manifest import load_cohort_place_ids

    ids = load_cohort_place_ids(path)
    if len(ids) > 100:
        raise ValueError("expansion reconciliation cohort is unexpectedly large")
    return ids


def _version_counts(connection: sqlite3.Connection) -> dict[str, int]:
    counts = Counter(
        "NULL" if row["score_version"] is None else str(row["score_version"])
        for row in connection.execute("SELECT score_version FROM public_restaurants")
    )
    return dict(counts)


def _public_rows(connection: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    return {
        str(row["place_id"]): dict(row)
        for row in connection.execute(
            """
            SELECT p.*, r.title AS candidate_title
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            ORDER BY p.place_id
            """
        )
    }


def _table_digest(connection: sqlite3.Connection, table: str) -> str:
    columns = [str(row["name"]) for row in connection.execute(f'PRAGMA table_info("{table}")')]
    payload = [columns]
    for row in connection.execute(f'SELECT * FROM "{table}" ORDER BY rowid'):
        payload.append([row[column] for column in columns])
    encoded = json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _database_digests(connection: sqlite3.Connection) -> dict[str, str]:
    tables = [
        str(row["name"])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    ]
    return {table: _table_digest(connection, table) for table in sorted(tables)}


def _snapshot_database(source: Path, target: Path) -> None:
    with readonly_sqlite_snapshot(source) as source_connection:
        target_connection = sqlite3.connect(target)
        try:
            source_connection.backup(target_connection)
        finally:
            target_connection.close()


def _reason_category(decision: dict[str, Any]) -> str:
    if decision.get("reconciliation_block"):
        return str(decision["reconciliation_block"])
    missing = set(decision["readiness"]["missing"])
    policy = decision["policy"]
    conditions = policy.get("conditions", {})
    critical = tuple(policy.get("critical_contradiction_reasons", ()))
    if "completed_research" in missing or "deterministic_score" in missing:
        return "incomplete_research_or_score"
    if any(str(reason).startswith("duplicate_of_published:") for reason in critical):
        return "deterministic_duplicate"
    if critical:
        if any("address" in str(reason).casefold() for reason in critical):
            return "address_or_identity_conflict"
        return "critical_publication_contradiction"
    if not conditions.get("chain_not_excluded", True):
        return "chain_exclusion"
    if not conditions.get("product_eligible", True):
        diagnostics = policy.get("diagnostics", {})
        return (
            "unresolved_identity"
            if diagnostics.get("matched_restaurant") is not True
            else "product_eligibility_failure"
        )
    if "map_ready" in missing:
        return "location_not_map_ready"
    content_missing = missing - {"deterministic_score_policy"}
    if content_missing:
        return "content_or_pipeline_incomplete"
    return "score_floor"


def _reconciliation_decision(
    row: dict[str, Any], decision: dict[str, Any], threshold: float
) -> dict[str, Any]:
    """Apply established admission-readiness and legacy-retention semantics."""

    result = dict(decision)
    policy = result.get("policy", {})
    if row.get("is_published"):
        if result.get("published"):
            return result
        # Nineteen legacy published records predate restaurant_research_runs.
        # Their current canonical score/research/product state is authoritative
        # for retention; this reconciliation does not force them through the
        # newer-row admission prerequisite or rewrite their review state.
        if (
            policy.get("reason") == "completed_score_run_missing"
            and row.get("research_status") == "complete"
            and row.get("fiyu_score") is not None
            and str(row.get("score_version") or "")
            and float(row["fiyu_score"]) >= threshold
            and bool(row.get("product_eligible"))
        ):
            result.update(
                published=True,
                outcome=row.get("review_status"),
                reason=row.get("review_notes"),
                legacy_published_retention=True,
            )
        return result

    if not result.get("published"):
        return result
    diagnostics = policy.get("diagnostics", {})
    block: str | None = None
    if diagnostics.get("matched_restaurant") is not True:
        block = "identity_not_matched"
    elif float(diagnostics.get("identity_confidence") or 0) < 0.6:
        block = "unresolved_identity"
    elif row.get("review_status") != "auto_rejected" or row.get(
        "review_notes"
    ) != "score_or_product_policy_rejected":
        block = "not_score_only_rejected"
    if block:
        result.update(
            published=False,
            outcome=row.get("review_status"),
            reason=row.get("review_notes"),
            reconciliation_block=block,
        )
    return result


def _evaluate_all(db_path: Path, threshold: float) -> dict[str, dict[str, Any]]:
    with connect(db_path) as connection:
        rows = {
            str(row["place_id"]): dict(row)
            for row in connection.execute(
                """
                SELECT p.*, r.title AS candidate_title, r.address AS source_address,
                       r.neighborhood, r.image_url,
                       r.category AS candidate_category,
                       r.broad_category AS candidate_broad_category
                FROM public_restaurants p
                LEFT JOIN restaurants r ON r.place_id=p.place_id
                ORDER BY p.place_id
                """
            )
        }
        published_rows = [
            dict(row)
            for row in connection.execute(
                """
                SELECT p.*, r.title AS candidate_title
                FROM public_restaurants p
                LEFT JOIN restaurants r ON r.place_id=p.place_id
                WHERE p.is_published=1
                ORDER BY p.created_at, p.place_id
                """
            )
        ]
        return {
            place_id: automatic_publication_decision(
                db_path,
                place_id,
                publication_threshold=threshold,
                _connection=connection,
                _row_data=row,
                _published_duplicate_rows=published_rows,
            )
            for place_id, row in rows.items()
        }


def _apply_target_membership_for_duplicate_pass(
    db_path: Path, decisions: dict[str, dict[str, Any]], threshold: float
) -> None:
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.executemany(
            "UPDATE public_restaurants SET is_published=? WHERE place_id=?",
            [
                (int(bool(decision["published"])), place_id)
                for place_id, decision in decisions.items()
            ],
        )
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (PUBLICATION_THRESHOLD_METADATA_KEY, f"{threshold:g}"),
        )
        connection.commit()


def _row_change(
    row: dict[str, Any], decision: dict[str, Any], category: str
) -> dict[str, Any]:
    target_published = bool(decision["published"])
    return {
        "place_id": row["place_id"],
        "restaurant_name": row.get("name_en") or row.get("name_ja") or row.get("candidate_title"),
        "current_score": row.get("fiyu_score"),
        "score_version": row.get("score_version"),
        "previous_is_published": bool(row.get("is_published")),
        "target_is_published": target_published,
        "product_eligible": bool(row.get("product_eligible")),
        "previous_review_status": row.get("review_status"),
        "target_review_status": decision["outcome"],
        "previous_rejection_reason": row.get("review_notes"),
        "target_rejection_reason": decision["reason"],
        "previous_product_eligibility_classification": row.get(
            "product_eligibility_classification"
        ),
        "reason_for_transition": category,
    }


def inspect_publication_reconciliation(
    db_path: str | Path,
    *,
    threshold: float,
    cohort_manifest: str | Path,
) -> dict[str, Any]:
    """Evaluate all canonical rows on an isolated snapshot and enforce cohort equality."""

    source = Path(db_path)
    manifest_path = Path(cohort_manifest)
    if threshold != 70.0:
        raise ValueError("this audited reconciliation supports only threshold 70")
    if _is_expansion_manifest(manifest_path):
        return _inspect_expansion_publication_reconciliation(
            source, threshold=threshold, manifest_path=manifest_path
        )
    manifest_ids = _manifest_ids(manifest_path)
    if len(manifest_ids) != EXPECTED_MANIFEST_COUNT:
        raise ValueError(f"expected {EXPECTED_MANIFEST_COUNT} manifest rows")
    before_sha = _sha256(source)

    with tempfile.TemporaryDirectory(prefix="fiyu-floor70-") as directory:
        snapshot = Path(directory) / "counterfactual.db"
        _snapshot_database(source, snapshot)
        current_threshold = publication_score_threshold(snapshot)
        with connect(snapshot) as connection:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("database snapshot integrity check failed")
            rows = _public_rows(connection)
            version_counts = _version_counts(connection)
            current_published_ids = {
                place_id for place_id, row in rows.items() if row["is_published"]
            }
            research_digest = _table_digest(connection, "restaurant_research_runs")
            quality_digest = _table_digest(connection, "quality_v4_research_runs")
        if len(rows) != EXPECTED_TOTAL:
            raise ValueError(f"expected {EXPECTED_TOTAL} canonical restaurants")
        expected_current = (
            EXPECTED_CURRENT_PUBLISHED if current_threshold == 75 else EXPECTED_FINAL_PUBLISHED
        )
        if current_threshold not in {70.0, 75.0}:
            raise ValueError(f"unexpected current publication threshold: {current_threshold}")
        if len(current_published_ids) != expected_current:
            raise ValueError("unexpected current published count")
        if {key: version_counts.get(key, 0) for key in EXPECTED_VERSION_COUNTS} != EXPECTED_VERSION_COUNTS:
            raise ValueError(f"unexpected score-version distribution: {version_counts}")

        evaluated = _evaluate_all(snapshot, threshold)
        first = {
            place_id: _reconciliation_decision(rows[place_id], decision, threshold)
            for place_id, decision in evaluated.items()
        }
        _apply_target_membership_for_duplicate_pass(snapshot, first, threshold)
        first_additions = {
            place_id
            for place_id, decision in first.items()
            if decision["published"] and place_id not in current_published_ids
        }
        final = dict(first)
        with connect(snapshot) as connection:
            published_rows = [
                dict(row)
                for row in connection.execute(
                    """
                    SELECT p.*, r.title AS candidate_title
                    FROM public_restaurants p
                    LEFT JOIN restaurants r ON r.place_id=p.place_id
                    WHERE p.is_published=1
                    ORDER BY p.created_at, p.place_id
                    """
                )
            ]
            for place_id in sorted(first_additions):
                reevaluated = automatic_publication_decision(
                    snapshot,
                    place_id,
                    publication_threshold=threshold,
                    _connection=connection,
                    _published_duplicate_rows=published_rows,
                )
                final[place_id] = _reconciliation_decision(
                    rows[place_id], reevaluated, threshold
                )
        first_ids = {place_id for place_id, decision in first.items() if decision["published"]}
        final_ids = {place_id for place_id, decision in final.items() if decision["published"]}
        if first_ids != final_ids:
            raise ValueError("publication membership is not stable after duplicate reevaluation")

        target_published_ids = final_ids
        additions = target_published_ids - current_published_ids
        removals = current_published_ids - target_published_ids
        manifest = set(manifest_ids)
        if current_threshold == 75.0:
            if additions != manifest or removals or len(target_published_ids) != EXPECTED_FINAL_PUBLISHED:
                raise ValueError(
                    "floor-70 hard stop: additions/removals do not match audited "
                    f"expectations (additions={len(additions)}, removals={len(removals)}, "
                    f"resulting={len(target_published_ids)}, "
                    f"unexpected={sorted(additions - manifest)}, "
                    f"missing={sorted(manifest - additions)}, "
                    f"removed={sorted(removals)})"
                )
        else:
            if additions or removals or not manifest <= target_published_ids:
                raise ValueError("floor-70 idempotency hard stop")

        for place_id in manifest:
            row = rows.get(place_id)
            if row is None:
                raise ValueError(f"manifest restaurant missing: {place_id}")
            policy = final[place_id]["policy"]
            if row.get("score_version") != QUALITY_PRODUCTION_SCORE_VERSION:
                raise ValueError(f"manifest row has unexpected score version: {place_id}")
            if float(row.get("fiyu_score") or 0) < threshold:
                raise ValueError(f"manifest row is below threshold: {place_id}")
            if not row.get("product_eligible") or not final[place_id]["published"]:
                raise ValueError(f"manifest row remains policy-blocked: {place_id}")
            if policy.get("critical_publication_contradiction") or policy.get("chain_excluded"):
                raise ValueError(f"manifest row has a non-score block: {place_id}")
            if policy.get("diagnostics", {}).get("matched_restaurant") is not True:
                raise ValueError(f"manifest row identity is unresolved: {place_id}")

        classifications = Counter()
        changes: list[dict[str, Any]] = []
        blocked: list[dict[str, Any]] = []
        for place_id, row in rows.items():
            was = place_id in current_published_ids
            will = place_id in target_published_ids
            classification = (
                "PUBLISHED_STAYS_PUBLISHED" if was and will else
                "PUBLISHED_BECOMES_UNPUBLISHED" if was else
                "UNPUBLISHED_BECOMES_PUBLISHED" if will else
                "UNPUBLISHED_STAYS_UNPUBLISHED"
            )
            classifications[classification] += 1
            category = _reason_category(final[place_id])
            if was != will:
                changes.append(_row_change(row, final[place_id], category))
            if not will and float(row.get("fiyu_score") or 0) >= threshold:
                blocked.append(
                    {
                        "place_id": place_id,
                        "restaurant_name": row.get("name_en") or row.get("name_ja") or row.get("candidate_title"),
                        "score": row.get("fiyu_score"),
                        "reason_category": category,
                        "missing": final[place_id]["readiness"]["missing"],
                    }
                )

        rescue_ids: set[str] = set()
        rescue_path = Path("data/audits/catalog-floor-decision-audit-summary.json")
        if rescue_path.exists():
            rescue = _load_json(rescue_path)
            rescue_ids = set(rescue.get("research_sets", {}).get("70", {}).get("place_ids", []))
        floor68_ids: set[str] = set()
        floor68_path = Path("data/audits/floor70-prepublication-v4-final-audit-summary.json")
        if floor68_path.exists():
            floor68 = _load_json(floor68_path)
            floor68_ids = set(
                floor68.get("floor68_catalog_counterfactual", {}).get(
                    "v3_rows_needing_v4_ids", []
                )
            )
        sankei = rows[SANKEI_PLACE_ID]
        after_sha = _sha256(source)
        if before_sha != after_sha:
            raise ValueError("canonical database changed during dry-run inspection")

        return {
            "mode": "inspection",
            "canonical_db": str(source),
            "manifest": str(manifest_path),
            "database_sha256_before": before_sha,
            "database_sha256_after": after_sha,
            "integrity": "ok",
            "current": {
                "total": len(rows),
                "published": len(current_published_ids),
                "unpublished": len(rows) - len(current_published_ids),
                "threshold": current_threshold,
                "score_version_counts": version_counts,
            },
            "target_threshold": threshold,
            "result": {
                "stays_published": classifications["PUBLISHED_STAYS_PUBLISHED"],
                "additions": len(additions),
                "removals": len(removals),
                "stays_unpublished": classifications["UNPUBLISHED_STAYS_UNPUBLISHED"],
                "resulting_published": len(target_published_ids),
                "resulting_unpublished": len(rows) - len(target_published_ids),
            },
            "cohort_assertion": {
                "manifest_ids": len(manifest),
                "exact_overlap": len(additions & manifest),
                "unexpected_additions": sorted(additions - manifest),
                "manifest_rows_missing": sorted(manifest - additions) if current_threshold == 75 else [],
            },
            "non_score_blocked_at_or_above_threshold": {
                "count": len(blocked),
                "categories": dict(Counter(row["reason_category"] for row in blocked)),
                "rows": blocked,
                "published": 0,
            },
            "changes": sorted(changes, key=lambda row: str(row["place_id"])),
            "sankei_sushi": {
                "place_id": SANKEI_PLACE_ID,
                "score": sankei.get("fiyu_score"),
                "score_version": sankei.get("score_version"),
                "current_published": SANKEI_PLACE_ID in current_published_ids,
                "target_published": SANKEI_PLACE_ID in target_published_ids,
                "score_mutation": False,
            },
            "rescue_cohort": {
                "ids": len(rescue_ids),
                "admitted": len(rescue_ids & additions),
            },
            "floor68_v3_population": {
                "ids": len(floor68_ids),
                "admitted": len(floor68_ids & additions),
            },
            "invariants": {
                "score_changes": 0,
                "score_version_changes": 0,
                "research_changes": 0,
                "quality_v4_changes": 0,
                "restaurant_research_digest": research_digest,
                "quality_v4_research_digest": quality_digest,
                "external_requests": 0,
            },
        }


def _inspect_expansion_publication_reconciliation(
    source: Path, *, threshold: float, manifest_path: Path
) -> dict[str, Any]:
    """Evaluate one frozen expansion allowlist without changing legacy membership."""

    manifest_ids = _expansion_manifest_ids(manifest_path)
    manifest = set(manifest_ids)
    before_sha = _sha256(source)
    with tempfile.TemporaryDirectory(prefix="fiyu-expansion-publication-") as directory:
        snapshot = Path(directory) / "counterfactual.db"
        _snapshot_database(source, snapshot)
        current_threshold = publication_score_threshold(snapshot)
        if current_threshold != threshold:
            raise ValueError(
                f"canonical publication threshold changed: {current_threshold} != {threshold}"
            )
        with connect(snapshot) as connection:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("database snapshot integrity check failed")
            rows = _public_rows(connection)
            version_counts = _version_counts(connection)
            current_published_ids = {
                place_id for place_id, row in rows.items() if row["is_published"]
            }
            research_digest = _table_digest(connection, "restaurant_research_runs")
            quality_digest = _table_digest(connection, "quality_v4_research_runs")
        missing = sorted(manifest - set(rows))
        if missing:
            raise ValueError(f"expansion manifest restaurants are missing: {missing}")
        already_published = manifest & current_published_ids

        evaluated = _evaluate_all(snapshot, threshold)
        first_additions = {
            place_id
            for place_id in manifest - already_published
            if bool(evaluated[place_id]["published"])
        }
        scoped_membership = {
            place_id: {
                "published": place_id in current_published_ids or place_id in first_additions
            }
            for place_id in rows
        }
        _apply_target_membership_for_duplicate_pass(snapshot, scoped_membership, threshold)
        final = {place_id: evaluated[place_id] for place_id in manifest}
        with connect(snapshot) as connection:
            published_rows = [
                dict(row)
                for row in connection.execute(
                    """
                    SELECT p.*, r.title AS candidate_title
                    FROM public_restaurants p
                    LEFT JOIN restaurants r ON r.place_id=p.place_id
                    WHERE p.is_published=1
                    ORDER BY p.created_at, p.place_id
                    """
                )
            ]
            for place_id in sorted(first_additions):
                final[place_id] = automatic_publication_decision(
                    snapshot,
                    place_id,
                    publication_threshold=threshold,
                    _connection=connection,
                    _published_duplicate_rows=published_rows,
                )
        additions = {
            place_id
            for place_id, decision in final.items()
            if place_id not in already_published and decision["published"]
        }
        if additions != first_additions:
            raise ValueError("expansion membership is unstable after duplicate reevaluation")
        canonical_publishable = {
            place_id
            for place_id, decision in final.items()
            if decision["published"]
        }
        target_published_ids = current_published_ids | additions
        changes: list[dict[str, Any]] = []
        blocked: list[dict[str, Any]] = []
        for place_id in manifest_ids:
            row = rows[place_id]
            decision = final[place_id]
            category = _reason_category(decision)
            if place_id in already_published:
                continue
            if place_id in additions:
                policy = decision["policy"]
                if row.get("score_version") != QUALITY_PRODUCTION_SCORE_VERSION:
                    raise ValueError(f"addition has unexpected score version: {place_id}")
                if float(row.get("fiyu_score") or 0) < threshold:
                    raise ValueError(f"addition is below threshold: {place_id}")
                if not row.get("product_eligible"):
                    raise ValueError(f"addition is product-ineligible: {place_id}")
                if policy.get("critical_publication_contradiction") or policy.get(
                    "chain_excluded"
                ):
                    raise ValueError(f"addition has a policy contradiction: {place_id}")
                if policy.get("diagnostics", {}).get("matched_restaurant") is not True:
                    raise ValueError(f"addition identity is unresolved: {place_id}")
                changes.append(_row_change(row, decision, category))
            else:
                blocked.append(
                    {
                        "place_id": place_id,
                        "restaurant_name": row.get("name_en")
                        or row.get("name_ja")
                        or row.get("candidate_title"),
                        "score": row.get("fiyu_score"),
                        "reason_category": category,
                        "missing": decision["readiness"]["missing"],
                    }
                )
        after_sha = _sha256(source)
        if before_sha != after_sha:
            raise ValueError("canonical database changed during dry-run inspection")
        sankei = rows[SANKEI_PLACE_ID]
        return {
            "mode": "inspection",
            "reconciliation_scope": "frozen_expansion_cohort",
            "canonical_db": str(source),
            "manifest": str(manifest_path),
            "database_sha256_before": before_sha,
            "database_sha256_after": after_sha,
            "integrity": "ok",
            "current": {
                "total": len(rows),
                "published": len(current_published_ids),
                "unpublished": len(rows) - len(current_published_ids),
                "threshold": current_threshold,
                "score_version_counts": version_counts,
            },
            "target_threshold": threshold,
            "result": {
                "stays_published": len(current_published_ids),
                "additions": len(additions),
                "removals": 0,
                "stays_unpublished": len(rows) - len(current_published_ids) - len(additions),
                "resulting_published": len(target_published_ids),
                "resulting_unpublished": len(rows) - len(target_published_ids),
            },
            "cohort_assertion": {
                "manifest_ids": len(manifest),
                "exact_overlap": len(additions),
                "unexpected_additions": [],
                "manifest_rows_missing": [],
                "blocked_cohort_rows": sorted(manifest - additions - already_published),
                "already_published_cohort_rows": sorted(already_published),
                "canonical_publishable_cohort_rows": sorted(canonical_publishable),
            },
            "non_score_blocked_at_or_above_threshold": {
                "count": len(blocked),
                "categories": dict(Counter(row["reason_category"] for row in blocked)),
                "rows": blocked,
                "published": 0,
            },
            "changes": sorted(changes, key=lambda row: str(row["place_id"])),
            "sankei_sushi": {
                "place_id": SANKEI_PLACE_ID,
                "score": sankei.get("fiyu_score"),
                "score_version": sankei.get("score_version"),
                "current_published": SANKEI_PLACE_ID in current_published_ids,
                "target_published": SANKEI_PLACE_ID in target_published_ids,
                "score_mutation": False,
            },
            "rescue_cohort": {"ids": 0, "admitted": 0},
            "floor68_v3_population": {"ids": 0, "admitted": 0},
            "invariants": {
                "score_changes": 0,
                "score_version_changes": 0,
                "research_changes": 0,
                "quality_v4_changes": 0,
                "restaurant_research_digest": research_digest,
                "quality_v4_research_digest": quality_digest,
                "external_requests": 0,
                "existing_published_removals": 0,
                "unrelated_additions": 0,
            },
        }


def _write_artifacts(
    summary: dict[str, Any], *, summary_path: Path, report_path: Path, changes_path: Path
) -> None:
    for path in (summary_path, report_path, changes_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    changes_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in summary["changes"]),
        encoding="utf-8",
    )
    result = summary["result"]
    cohort = summary["cohort_assertion"]
    blocked = summary["non_score_blocked_at_or_above_threshold"]
    report_path.write_text(
        "\n".join(
            (
                "# Floor-70 publication reconciliation",
                "",
                "## 1. Executive summary",
                f"Mode: {summary['mode']}. Threshold {summary['current']['threshold']:g} -> {summary['target_threshold']:g}.",
                f"Published {summary['current']['published']} -> {result['resulting_published']}; additions {result['additions']}; removals {result['removals']}.",
                "",
                "## 2. Current canonical state",
                f"Total {summary['current']['total']}; published {summary['current']['published']}; integrity {summary['integrity']}.",
                "",
                "## 3. Threshold source of truth",
                f"Database metadata key `{PUBLICATION_THRESHOLD_METADATA_KEY}` with code fallback 75 for pre-migration databases.",
                "",
                "## 4. Full 1203-row counterfactual",
                json.dumps(result, ensure_ascii=False),
                "",
                "## 5. 313-manifest set equality",
                json.dumps(cohort, ensure_ascii=False),
                "",
                "## 6. Non-score blocked rows",
                f"Count {blocked['count']}; categories {json.dumps(blocked['categories'], ensure_ascii=False)}; published 0.",
                "",
                "## 7. Existing published retention",
                f"Stays published {result['stays_published']}; removals {result['removals']}.",
                "",
                "## 8. Planned additions",
                f"{result['additions']} rows; see JSONL artifact.",
                "",
                "## 9. Planned removals",
                f"{result['removals']} rows.",
                "",
                "## 10. Sankei Sushi",
                json.dumps(summary["sankei_sushi"], ensure_ascii=False),
                "",
                "## 11. Rescue/floor-68 exclusions",
                json.dumps({"rescue": summary["rescue_cohort"], "floor68": summary["floor68_v3_population"]}, ensure_ascii=False),
                "",
                "## 12. API/public visibility",
                "Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.",
                "",
                "## 13. Database invariants",
                json.dumps(summary["invariants"], ensure_ascii=False),
                "",
                "## 14. Exact real execution command",
                ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl",
                "",
            )
        ),
        encoding="utf-8",
    )


def run_publication_reconciliation(
    db_path: str | Path,
    *,
    threshold: float,
    cohort_manifest: str | Path,
    dry_run: bool,
    backup_path: str | Path | None,
    summary_path: str | Path,
    report_path: str | Path,
    changes_path: str | Path,
) -> dict[str, Any]:
    """Inspect, and only when explicitly requested, atomically apply publication changes."""

    db = Path(db_path)
    summary = inspect_publication_reconciliation(
        db, threshold=threshold, cohort_manifest=cohort_manifest
    )
    if dry_run:
        summary["mode"] = "dry_run"
        _write_artifacts(
            summary,
            summary_path=Path(summary_path),
            report_path=Path(report_path),
            changes_path=Path(changes_path),
        )
        return summary
    if backup_path is None:
        raise ValueError("real reconciliation requires --backup-out")
    source_sha, backup_sha = _create_backup(db, Path(backup_path))
    before_public: dict[str, dict[str, Any]]
    with connect(db) as connection:
        before_public = _public_rows(connection)
        before_digests = _database_digests(connection)
        before_metadata = {
            str(row["key"]): str(row["value"])
            for row in connection.execute("SELECT key, value FROM metadata")
        }
        connection.execute("BEGIN IMMEDIATE")
        try:
            connection.execute(
                "INSERT INTO metadata(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (PUBLICATION_THRESHOLD_METADATA_KEY, f"{threshold:g}"),
            )
            now = _utc_now()
            for change in summary["changes"]:
                cursor = connection.execute(
                    """
                    UPDATE public_restaurants
                    SET is_published=?, review_status=?, review_notes=?, pipeline_version=?, updated_at=?
                    WHERE place_id=? AND is_published=?
                    """,
                    (
                        int(change["target_is_published"]),
                        change["target_review_status"],
                        change["target_rejection_reason"],
                        PIPELINE_VERSION,
                        now,
                        change["place_id"],
                        int(change["previous_is_published"]),
                    ),
                )
                if cursor.rowcount != 1:
                    raise RuntimeError(f"publication precondition changed: {change['place_id']}")
            after_public = _public_rows(connection)
            after_digests = _database_digests(connection)
            after_metadata = {
                str(row["key"]): str(row["value"])
                for row in connection.execute("SELECT key, value FROM metadata")
            }
            for table, digest in before_digests.items():
                if table not in {"public_restaurants", "metadata"} and after_digests[table] != digest:
                    raise RuntimeError(f"unrelated table changed: {table}")
            changed_ids = {str(row["place_id"]) for row in summary["changes"]}
            for place_id, before in before_public.items():
                after = after_public[place_id]
                changed_fields = {key for key in before if before[key] != after[key]}
                if place_id not in changed_ids and changed_fields:
                    raise RuntimeError(f"unplanned public row changed: {place_id}")
                if changed_fields - ALLOWED_PUBLICATION_FIELDS:
                    raise RuntimeError(f"out-of-scope columns changed for {place_id}: {changed_fields}")
            expected_metadata = dict(before_metadata)
            expected_metadata[PUBLICATION_THRESHOLD_METADATA_KEY] = f"{threshold:g}"
            if after_metadata != expected_metadata:
                raise RuntimeError("metadata changes exceeded the publication threshold key")
            if sum(bool(row["is_published"]) for row in after_public.values()) != summary[
                "result"
            ]["resulting_published"]:
                raise RuntimeError("post-migration published count mismatch")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    post = inspect_publication_reconciliation(db, threshold=threshold, cohort_manifest=cohort_manifest)
    if post["result"]["additions"] or post["result"]["removals"]:
        raise RuntimeError("post-migration idempotency check failed")
    summary.update(
        mode="real",
        backup_path=str(backup_path),
        pre_migration_sha256=source_sha,
        backup_sha256=backup_sha,
        post_migration_sha256=_sha256(db),
        post_migration_idempotent=True,
    )
    _write_artifacts(
        summary,
        summary_path=Path(summary_path),
        report_path=Path(report_path),
        changes_path=Path(changes_path),
    )
    return summary


def compact_summary(summary: dict[str, Any]) -> str:
    result = summary["result"]
    cohort = summary["cohort_assertion"]
    return "\n".join(
        (
            f"Mode: {summary['mode']}",
            f"Threshold: {summary['current']['threshold']:g} -> {summary['target_threshold']:g}",
            f"Published: {summary['current']['published']} -> {result['resulting_published']}",
            f"Additions: {result['additions']}",
            f"Removals: {result['removals']}",
            f"Manifest overlap: {cohort['exact_overlap']}",
            f"Unexpected additions: {len(cohort['unexpected_additions'])}",
            f"Missing additions: {len(cohort['manifest_rows_missing'])}",
        )
    )
