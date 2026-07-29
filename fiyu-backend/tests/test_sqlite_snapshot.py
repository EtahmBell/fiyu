from __future__ import annotations

import hashlib
import os
import sqlite3
from pathlib import Path

import pytest

from fiyu.sqlite_snapshot import readonly_sqlite_snapshot


def _contents(path: Path) -> dict[str, tuple[int, str] | None]:
    state: dict[str, tuple[int, str] | None] = {}
    for suffix in ("", "-wal", "-shm", "-journal"):
        artifact = Path(f"{path}{suffix}")
        if artifact.is_file():
            payload = artifact.read_bytes()
            state[suffix] = (len(payload), hashlib.sha256(payload).hexdigest())
        else:
            state[suffix] = None
    return state


def _create_database(path: Path, *, journal_mode: str) -> None:
    connection = sqlite3.connect(path)
    try:
        assert connection.execute(f"PRAGMA journal_mode={journal_mode}").fetchone()[0]
        connection.execute("CREATE TABLE sample (value TEXT NOT NULL)")
        connection.execute("INSERT INTO sample VALUES ('committed')")
        connection.commit()
    finally:
        connection.close()


def test_snapshot_reads_wal_mode_database_without_shm(tmp_path):
    path = tmp_path / "wal-no-shm.sqlite"
    _create_database(path, journal_mode="WAL")
    Path(f"{path}-shm").unlink(missing_ok=True)
    before = _contents(path)

    with readonly_sqlite_snapshot(path) as connection:
        assert connection.execute("SELECT value FROM sample").fetchone()[0] == "committed"

    assert _contents(path) == before
    assert not Path(f"{path}-shm").exists()


def test_snapshot_reads_committed_wal_with_existing_wal_and_shm(tmp_path):
    path = tmp_path / "wal-live.sqlite"
    writer = sqlite3.connect(path)
    try:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute("CREATE TABLE sample (value TEXT NOT NULL)")
        writer.execute("INSERT INTO sample VALUES ('from-wal')")
        writer.commit()
        assert Path(f"{path}-wal").is_file()
        assert Path(f"{path}-shm").is_file()
        before = _contents(path)

        with readonly_sqlite_snapshot(path) as connection:
            assert connection.execute("SELECT value FROM sample").fetchone()[0] == "from-wal"

        assert _contents(path) == before
    finally:
        writer.close()


def test_snapshot_reads_rollback_journal_mode_database(tmp_path):
    path = tmp_path / "rollback.sqlite"
    _create_database(path, journal_mode="DELETE")
    before = _contents(path)

    with readonly_sqlite_snapshot(path) as connection:
        assert connection.execute("SELECT value FROM sample").fetchone()[0] == "committed"

    assert _contents(path) == before


def test_snapshot_ignores_timestamp_only_source_change(tmp_path):
    path = tmp_path / "timestamp.sqlite"
    _create_database(path, journal_mode="DELETE")
    before = _contents(path)
    stat = path.stat()

    with readonly_sqlite_snapshot(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM sample").fetchone()[0] == 1
        os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))

    assert _contents(path) == before


def test_snapshot_reports_source_content_mutation_details(tmp_path):
    path = tmp_path / "mutated.sqlite"
    _create_database(path, journal_mode="DELETE")

    with pytest.raises(RuntimeError) as error:
        with readonly_sqlite_snapshot(path):
            path.write_bytes(path.read_bytes() + b"changed")

    message = str(error.value)
    assert str(path) in message
    assert '"suffix": "main"' in message
    assert '"meaningful_change": true' in message
    assert '"sha256"' in message
    assert '"size"' in message


def test_snapshot_reports_sidecar_content_mutation_details(tmp_path):
    path = tmp_path / "sidecar.sqlite"
    _create_database(path, journal_mode="DELETE")
    shm = Path(f"{path}-shm")
    shm.write_bytes(b"before")

    with pytest.raises(RuntimeError) as error:
        with readonly_sqlite_snapshot(path):
            shm.write_bytes(b"after")

    message = str(error.value)
    assert str(shm) in message
    assert '"suffix": "-shm"' in message
    assert '"meaningful_change": true' in message
