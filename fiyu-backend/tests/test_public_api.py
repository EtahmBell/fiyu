import json

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.google_places import (
    GooglePlacesConfigurationError,
    GooglePlacesProviderError,
    GooglePlacesTimeoutError,
    normalize_live_place_details,
)
from fiyu.public_catalog import ensure_public_schema


@pytest.fixture
def public_db(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.executemany(
            """
            INSERT INTO restaurants
                (place_id, title, latitude, longitude, neighborhood, rating, review_count)
            VALUES (?, ?, ?, ?, ?, 4.5, 20)
            """,
            [
                ("published", "Published", 35.1, 139.1, "Asakusa"),
                ("hidden", "Hidden", 35.2, 139.2, "Ueno"),
            ],
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.executemany(
            """
            INSERT INTO public_restaurants
                (place_id, name_en, food_tags_json, signature_dishes_json,
                 fiyu_score, fiyu_confidence, local_signal, evidence_json,
                 evidence_urls_json, research_error, model_name, prompt_version,
                 is_published, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 88, 75, '{"secret": true}', '["private"]',
                    'private error', 'private model', 'private prompt', ?, 'now', 'now')
            """,
            [
                ("published", "Published", json.dumps(["soba"]), json.dumps(["zaru soba"]), 91, 1),
                ("hidden", "Hidden", "[]", "[]", 99, 0),
            ],
        )
        connection.commit()
    monkeypatch.setattr(api, "DB_PATH", path)
    return path


def test_public_list_only_returns_safe_published_rows(public_db):
    response = TestClient(api.app).get("/public/restaurants")
    assert response.status_code == 200
    assert [row["place_id"] for row in response.json()] == ["published"]
    row = response.json()[0]
    assert row["food_tags"] == ["soba"]
    assert row["signature_dishes"] == ["zaru soba"]
    forbidden = {
        "internal_fiyu_score", "evidence", "evidence_json", "evidence_urls_json",
        "research_error", "model_name", "prompt_version", "source_restaurant_id",
    }
    assert forbidden.isdisjoint(row)


def test_public_detail_requires_published_restaurant(public_db):
    client = TestClient(api.app)
    assert client.get("/public/restaurants/published").status_code == 200
    assert client.get("/public/restaurants/hidden").status_code == 404
    assert client.get("/public/restaurants/unknown").status_code == 404


def test_normalize_google_response_handles_fields_and_defaults():
    result = normalize_live_place_details(
        {
            "id": "abc", "displayName": {"text": "Soba"},
            "location": {"latitude": 35.0, "longitude": 139.0},
            "rating": 4.6, "userRatingCount": 42,
            "currentOpeningHours": {"openNow": True, "weekdayDescriptions": ["Mon: 9-5"]},
        },
        requested_place_id="fallback",
    )
    assert result["place_id"] == "abc"
    assert result["name"] == "Soba"
    assert result["address"] == ""
    assert result["open_now"] is True


@pytest.mark.parametrize(
    ("exception", "status"),
    [
        (GooglePlacesConfigurationError("private configuration details"), 503),
        (GooglePlacesTimeoutError("private timeout details"), 504),
        (GooglePlacesProviderError("private provider details"), 502),
    ],
)
def test_live_details_maps_provider_errors(public_db, monkeypatch, exception, status):
    def fail(*args, **kwargs):
        raise exception

    monkeypatch.setattr(api, "fetch_live_place_details", fail)
    response = TestClient(api.app).get("/public/restaurants/published/live-details")
    assert response.status_code == status
    assert "private" not in response.text


def test_live_details_passes_supported_language(public_db, monkeypatch):
    seen = {}

    def fetch(place_id, *, language_code):
        seen["language_code"] = language_code
        return {"id": place_id}

    monkeypatch.setattr(api, "fetch_live_place_details", fetch)
    client = TestClient(api.app)
    assert client.get("/public/restaurants/published/live-details?language_code=ja").status_code == 200
    assert seen == {"language_code": "ja"}
    assert client.get("/public/restaurants/published/live-details?language_code=fr").status_code == 422
