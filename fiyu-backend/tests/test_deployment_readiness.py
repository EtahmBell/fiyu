from __future__ import annotations

import sqlite3
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from fiyu import api


def test_production_rejects_legacy_client_identity(monkeypatch):
    monkeypatch.setenv("FIYU_ENVIRONMENT", "production")
    monkeypatch.setenv("FIYU_ALLOW_LEGACY_CLIENT_ID", "true")

    with pytest.raises(HTTPException) as error:
        api._owner_id_from_header(x_fiyu_client_id=str(uuid4()))

    assert error.value.status_code == 401
    assert error.value.detail == "Bearer authentication required"


def test_explicit_local_setting_keeps_legacy_client_identity(monkeypatch):
    owner_id = str(uuid4())
    monkeypatch.setenv("FIYU_ENVIRONMENT", "development")
    monkeypatch.setenv("FIYU_ALLOW_LEGACY_CLIENT_ID", "true")

    identity = api._owner_id_from_header(x_fiyu_client_id=owner_id)

    assert str(identity) == owner_id
    assert identity.authenticated is False


def test_production_cors_is_env_driven_and_fails_closed_without_configuration(monkeypatch):
    monkeypatch.setenv("FIYU_ENVIRONMENT", "production")
    monkeypatch.delenv("FIYU_CORS_ORIGINS", raising=False)
    assert api._configured_cors_origins() == []

    monkeypatch.setenv("FIYU_CORS_ORIGINS", "https://fiyu.app")
    assert api._configured_cors_origins() == ["https://fiyu.app"]


def test_readiness_requires_readable_catalog_schema(tmp_path, monkeypatch):
    missing = tmp_path / "missing.db"
    monkeypatch.setattr(api, "DB_PATH", missing)
    client = TestClient(api.app)
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 503

    incomplete = tmp_path / "incomplete.db"
    sqlite3.connect(incomplete).close()
    monkeypatch.setattr(api, "DB_PATH", incomplete)
    assert client.get("/ready").status_code == 503

    ready = tmp_path / "ready.db"
    connection = sqlite3.connect(ready)
    connection.executescript(
        "CREATE TABLE restaurants (place_id TEXT);"
        "CREATE TABLE public_restaurants (place_id TEXT);"
    )
    connection.commit()
    connection.close()
    monkeypatch.setattr(api, "DB_PATH", ready)

    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "database": "readable",
        "catalog_schema": "available",
    }
