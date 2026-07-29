from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path


_SQLITE_ARTIFACT_SUFFIXES = ("", "-wal", "-shm", "-journal")


@dataclass(frozen=True)
class SQLiteArtifactState:
    path: str
    exists: bool
    size: int | None
    sha256: str | None
    mtime_ns: int | None

    @property
    def meaningful_state(self) -> tuple[bool, int | None, str | None]:
        return self.exists, self.size, self.sha256


def _artifact_states(source: Path) -> dict[str, SQLiteArtifactState]:
    states: dict[str, SQLiteArtifactState] = {}
    for suffix in _SQLITE_ARTIFACT_SUFFIXES:
        artifact = Path(f"{source}{suffix}")
        if not artifact.is_file():
            states[suffix] = SQLiteArtifactState(str(artifact), False, None, None, None)
            continue
        digest = hashlib.sha256()
        with artifact.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        stat = artifact.stat()
        states[suffix] = SQLiteArtifactState(
            str(artifact), True, stat.st_size, digest.hexdigest(), stat.st_mtime_ns
        )
    return states


def _artifact_changes(
    before: dict[str, SQLiteArtifactState],
    after: dict[str, SQLiteArtifactState],
) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    for suffix in _SQLITE_ARTIFACT_SUFFIXES:
        old = before[suffix]
        new = after[suffix]
        if old == new:
            continue
        changes.append(
            {
                "artifact": new.path,
                "suffix": suffix or "main",
                "meaningful_change": old.meaningful_state != new.meaningful_state,
                "mtime_only": (
                    old.meaningful_state == new.meaningful_state
                    and old.mtime_ns != new.mtime_ns
                ),
                "before": asdict(old),
                "after": asdict(new),
            }
        )
    return changes


def _build_consistent_snapshot(source: Path, directory: Path) -> Path:
    """Consolidate a file-level copy without opening the source through SQLite."""

    staging = directory / "staging.sqlite"
    snapshot = directory / "snapshot.sqlite"
    shutil.copyfile(source, staging)
    # WAL carries committed pages not yet checkpointed. A rollback journal may be
    # needed to recover a hot rollback-mode copy. SHM is only a volatile WAL index;
    # SQLite safely recreates it beside the disposable staging database.
    for suffix in ("-wal", "-journal"):
        sidecar = Path(f"{source}{suffix}")
        if sidecar.is_file():
            shutil.copyfile(sidecar, Path(f"{staging}{suffix}"))

    staging_connection = sqlite3.connect(staging)
    snapshot_connection = sqlite3.connect(snapshot)
    try:
        staging_connection.backup(snapshot_connection)
    finally:
        snapshot_connection.close()
        staging_connection.close()
    return snapshot


@contextmanager
def readonly_sqlite_snapshot(db_path: str | Path) -> Iterator[sqlite3.Connection]:
    """Query a consistent immutable snapshot without opening the source via SQLite."""

    source = Path(db_path)
    before = _artifact_states(source)
    try:
        with tempfile.TemporaryDirectory(prefix="fiyu-sqlite-readonly-") as directory:
            snapshot = _build_consistent_snapshot(source, Path(directory))
            connection = sqlite3.connect(
                f"{snapshot.resolve().as_uri()}?mode=ro&immutable=1", uri=True
            )
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA query_only=ON")
            try:
                yield connection
            finally:
                connection.close()
    finally:
        after = _artifact_states(source)
        changes = _artifact_changes(before, after)
        meaningful = [change for change in changes if change["meaningful_change"]]
        if meaningful:
            summary = "\n".join(
                f"- {change['artifact']}: before={change['before']} after={change['after']}"
                for change in changes
            )
            raise RuntimeError(
                "read-only SQLite snapshot detected source artifact mutation:\n"
                + summary
                + "\n"
                + json.dumps({"changed_artifacts": changes}, indent=2, sort_keys=True)
            )
