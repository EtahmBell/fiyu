from __future__ import annotations

import hashlib
import os
import sqlite3
from pathlib import Path

from .sqlite_snapshot import readonly_sqlite_snapshot

# These tables are read by the normal hosted API. Public restaurant fields that
# were produced by research are already materialized in public_restaurants; only
# accepted description rows remain necessary for the detail response.
RUNTIME_TABLES: frozenset[str] = frozenset(
    {
        "community_recommendations",
        "description_research_runs",
        "public_restaurants",
        "restaurants",
    }
)

# Keep schemas for compatibility with local relationship helpers and admin code,
# but ship no local account state or research/audit history in the hosted image.
SCRUBBED_TABLES: tuple[str, ...] = (
    "restaurant_list_items",
    "restaurant_lists",
    "restaurant_visits",
    "daily_pick_round_items",
    "daily_pick_rounds",
    "daily_pick_served_history",
    "contact_submissions",
    "user_profiles",
    "address_decision_audits",
    "address_review_decisions",
    "address_search_attempts",
    "address_geocode_results",
    "verified_restaurant_addresses",
    "address_evidence",
    "address_research_runs",
    "location_history",
    "location_match_candidates",
    "restaurant_card_enrichment_runs",
    "low_footprint_research_runs",
    "score_calculation_runs",
    "restaurant_research_runs",
    "metadata",
)

KNOWN_TABLES = RUNTIME_TABLES | frozenset(SCRUBBED_TABLES)
REQUIRED_RUNTIME_TABLES: frozenset[str] = frozenset({"public_restaurants", "restaurants"})
SCRUBBED_PUBLIC_COLUMNS: dict[str, str] = {
    "access_evidence_json": "[]",
    "access_evidence_urls_json": "[]",
    "card_enrichment_conflicts_json": "[]",
    "evidence_json": "{}",
    "evidence_urls_json": "[]",
    "local_audience_signals_json": "[]",
    "local_discovery_components_json": "{}",
    "low_footprint_trigger_score_json": "{}",
    "product_eligibility_reasons_json": "[]",
    "score_json": "{}",
    "tourist_signals_json": "[]",
}


class ProductionSnapshotError(RuntimeError):
    pass


def _table_names(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    }


def _row_counts(connection: sqlite3.Connection, tables: set[str]) -> dict[str, int]:
    return {
        table: int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
        for table in sorted(tables)
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def create_production_snapshot(
    source_path: str | Path,
    output_path: str | Path,
    *,
    force: bool = False,
) -> dict[str, object]:
    """Create an atomic, scrubbed runtime copy without mutating the source database."""

    source = Path(source_path).resolve()
    output = Path(output_path).resolve()
    if not source.is_file():
        raise ProductionSnapshotError(f"Source database does not exist: {source}")
    if source == output:
        raise ProductionSnapshotError("Production snapshot output must differ from the source")
    if output.exists() and not force:
        raise ProductionSnapshotError(
            f"Output already exists: {output}. Pass --force to replace it atomically."
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    temporary.unlink(missing_ok=True)

    try:
        with readonly_sqlite_snapshot(source) as source_connection:
            source_tables = _table_names(source_connection)
            missing = REQUIRED_RUNTIME_TABLES - source_tables
            unknown = source_tables - KNOWN_TABLES
            if missing:
                raise ProductionSnapshotError(
                    f"Source is missing required runtime tables: {sorted(missing)}"
                )
            if unknown:
                raise ProductionSnapshotError(
                    "Unclassified SQLite tables must be reviewed before release: "
                    f"{sorted(unknown)}"
                )
            before_counts = _row_counts(source_connection, source_tables)
            destination = sqlite3.connect(temporary)
            try:
                source_connection.backup(destination)
            finally:
                destination.close()

        destination = sqlite3.connect(temporary)
        try:
            destination.execute("PRAGMA foreign_keys=OFF")
            for table in SCRUBBED_TABLES:
                if table in source_tables:
                    destination.execute(f'DELETE FROM "{table}"')

            # Only accepted rows are consulted by Restaurant Detail.
            if "description_research_runs" in source_tables:
                destination.execute(
                    "DELETE FROM description_research_runs "
                    "WHERE status <> 'accepted' OR public_restaurant_id NOT IN "
                    "(SELECT place_id FROM public_restaurants)"
                )
            # Candidate rows outside the canonical public catalog and raw local
            # ingestion filenames are not needed by the hosted runtime.
            destination.execute(
                "DELETE FROM restaurants WHERE place_id IS NULL OR place_id NOT IN "
                "(SELECT place_id FROM public_restaurants)"
            )
            columns = {
                str(row[1])
                for row in destination.execute("PRAGMA table_info(restaurants)").fetchall()
            }
            if "source_files_json" in columns:
                destination.execute("UPDATE restaurants SET source_files_json = '[]'")
            public_columns = {
                str(row[1])
                for row in destination.execute(
                    "PRAGMA table_info(public_restaurants)"
                ).fetchall()
            }
            for column, replacement in SCRUBBED_PUBLIC_COLUMNS.items():
                if column in public_columns:
                    destination.execute(
                        f'UPDATE public_restaurants SET "{column}" = ?', (replacement,)
                    )

            destination.commit()
            foreign_key_issues = destination.execute("PRAGMA foreign_key_check").fetchall()
            if foreign_key_issues:
                raise ProductionSnapshotError(
                    f"Snapshot has foreign-key violations: {foreign_key_issues[:5]}"
                )
            integrity = str(destination.execute("PRAGMA integrity_check").fetchone()[0])
            if integrity != "ok":
                raise ProductionSnapshotError(f"Snapshot integrity check failed: {integrity}")
            after_counts = _row_counts(destination, source_tables)
            destination.execute("VACUUM")
        finally:
            destination.close()

        os.replace(temporary, output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    return {
        "source": str(source),
        "output": str(output),
        "size_bytes": output.stat().st_size,
        "sha256": _sha256(output),
        "retained_tables": sorted(RUNTIME_TABLES & source_tables),
        "scrubbed_tables": sorted(set(SCRUBBED_TABLES) & source_tables),
        "scrubbed_public_columns": sorted(set(SCRUBBED_PUBLIC_COLUMNS) & public_columns),
        "before_counts": before_counts,
        "after_counts": after_counts,
    }
