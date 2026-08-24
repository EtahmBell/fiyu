import json

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.database import SCHEMA, connect
from fiyu.google_places import (
    GooglePlacesConfigurationError,
    GooglePlacesNoPhotosError,
    GooglePlacesProviderError,
    GooglePlacesTimeoutError,
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
                (place_id, title, address, latitude, longitude, neighborhood, rating, review_count)
            VALUES (?, ?, ?, ?, ?, ?, 4.5, 20)
            """,
            [
                ("eligible", "Eligible", "1-1 Asakusa, Tokyo", 35.1, 139.1, "Asakusa"),
                ("unknown", "Unknown", "2-2 Ueno, Tokyo", 35.2, 139.2, "Ueno"),
                ("hidden", "Hidden", "3-3 Ginza, Tokyo", 35.3, 139.3, "Ginza"),
            ],
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.executemany(
            """
            INSERT INTO public_restaurants
                (place_id, name_ja, name_en, why_fiyu, description_en, primary_category,
                 food_tags_json, signature_dishes_json, fiyu_score, score_band,
                 local_signal, evidence_json, evidence_urls_json, research_error,
                 model_name, prompt_version, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Internal why_fiyu evidence.', ?, 'soba', ?, ?, ?, 'excellent', 75,
                    '{"secret": true}', '["private"]', 'private error',
                    'private model', 'private prompt', ?, 'now', 'now')
            """,
            [
                (
                    "eligible",
                    "独立店",
                    "Independent",
                    "An English description.",
                    json.dumps(["soba"]),
                    json.dumps(["ざる蕎麦"]),
                    91,
                    1,
                ),
                (
                    "unknown",
                    "不明",
                    "Unknown",
                    "Another description.",
                    "[]",
                    "[]",
                    89,
                    1,
                ),
                (
                    "hidden",
                    "非公開",
                    "Hidden",
                    "Hidden description.",
                    "[]",
                    "[]",
                    99,
                    0,
                ),
            ],
        )
        connection.execute(
            """
            UPDATE public_restaurants
            SET latitude = 35.11, longitude = 139.11, location_source = 'manual-survey',
                location_verified_at = '2026-07-01', location_precision = 'exact',
                map_display_eligible = 1
            WHERE place_id = 'eligible'
            """
        )
        connection.commit()
    monkeypatch.setattr(api, "DB_PATH", path)
    return path


def test_public_contract_uses_only_independently_eligible_coordinates(public_db):
    response = TestClient(api.app).get("/public/restaurants")
    assert response.status_code == 200
    rows = {row["place_id"]: row for row in response.json()}
    assert set(rows) == {"eligible", "unknown"}
    assert rows["eligible"]["latitude"] == 35.11
    assert rows["eligible"]["location_precision"] == "exact"
    assert rows["eligible"]["map_display_eligible"] is True
    assert rows["unknown"]["latitude"] is None
    assert rows["unknown"]["longitude"] is None
    assert rows["unknown"]["map_display_eligible"] is False
    assert rows["unknown"]["external_map_search_query"] == "2-2 Ueno, Tokyo"
    assert rows["eligible"]["description_en"] == "An English description."
    assert rows["eligible"]["score_type"] == "editorial_research"
    assert rows["eligible"]["fiyu_score"] == 91


def test_google_operational_fields_are_absent_publicly(public_db):
    row = TestClient(api.app).get("/public/restaurants/eligible").json()
    forbidden = {
        "rating",
        "rating_count",
        "review_count",
        "open_now",
        "weekday_hours",
        "price_level",
        "why_fiyu",
        "fiyu_confidence",
        "confidence_band",
        "local_language_web_signal",
        "evidence",
        "location_reviewer_notes",
        "location_match_confidence",
        "location_match_method",
        "location_verification_method",
        "location_osm_id",
        "location_source_reference",
    }
    assert forbidden.isdisjoint(row)
    assert row["opening_hours"] == {}
    assert TestClient(api.app).get("/public/restaurants/eligible/live-details").status_code == 404


def test_public_core_only_location_omits_disputed_detail(public_db):
    with connect(public_db) as connection:
        connection.execute(
            """
            UPDATE public_restaurants SET
                verified_core_address='東京都千代田区神田佐久間町3-38',
                core_address_verified=1, full_address_verified=0,
                map_location_precision='block', map_location_approximate=1,
                map_anchor_type='block', location_status='location_provisional',
                location_osm_type='relation', location_osm_id=123,
                location_osm_version=4, location_osm_timestamp='2026-07-01T00:00:00Z',
                location_representative_point_method='polygon_centroid_inside',
                location_source_reference='https://www.openstreetmap.org/relation/123',
                location_provenance='Map data © OpenStreetMap contributors',
                location_matched_components_json='{"ward":"千代田区","block":"38"}',
                location_unmatched_components_json='{"sub_number":"4"}',
                unresolved_address_detail='building: A vs B; floor: 1階 vs B1F'
            WHERE place_id='eligible'
            """
        )
        connection.commit()
    row = TestClient(api.app).get("/public/restaurants/eligible").json()
    assert row["verified_core_address"] == "東京都千代田区神田佐久間町3-38"
    assert row["location_precision"] == "block"
    assert row["map_location_approximate"] is True
    assert row["core_address_verified"] is True
    assert row["full_address_verified"] is False
    assert row["location_label"] == "Approximate area"
    assert row["location_status"] == "location_provisional"
    assert row["map_anchor_type"] == "block"
    assert row["map_anchor_id"] == "relation:123"
    assert row["distance_sort_eligible"] is False
    assert row["directions_coordinates_eligible"] is False
    assert row["external_map_search_query"] == row["verified_core_address"]
    assert row["matched_components"]["block"] == "38"
    assert row["provenance"]["osm_id"] == 123
    assert row["source_reference"].endswith("/relation/123")
    assert "building" not in row and "floor" not in row
    assert "unresolved_address_detail" not in row


def test_public_map_config_exposes_osm_attribution_only():
    assert TestClient(api.app).get("/public/map-config").json() == {
        "attribution": "Map data © OpenStreetMap contributors"
    }


def test_public_detail_requires_published_restaurant(public_db):
    client = TestClient(api.app)
    assert client.get("/public/restaurants/eligible").status_code == 200
    assert client.get("/public/restaurants/hidden").status_code == 404


def test_public_detail_exposes_latest_grounded_description_fields_only(public_db):
    with connect(public_db) as connection:
        connection.execute(
            """
            INSERT INTO description_research_runs (
                public_restaurant_id, provider, model, status, description_en,
                restaurant_type_en, cuisine_terms_en_json, signature_dishes_en_json,
                supporting_source_urls_json, created_at
            ) VALUES (?, 'openai_responses', 'test-model', 'accepted', ?, ?, ?, ?, ?, ?)
            """,
            (
                "eligible",
                "Grounded detail.",
                "Standing soba shop",
                json.dumps(["soba", "tempura"]),
                json.dumps(["Zaru soba"]),
                json.dumps(["https://example.com/source"]),
                "2026-07-20T12:00:00+00:00",
            ),
        )
        connection.commit()

    client = TestClient(api.app)
    summary = client.get("/public/restaurants").json()[0]
    detail = client.get("/public/restaurants/eligible").json()

    assert "restaurant_type_en" not in summary
    assert detail["restaurant_type_en"] == "Standing soba shop"
    assert detail["cuisine_terms_en"] == ["soba", "tempura"]
    assert detail["signature_dishes_en"] == ["Zaru soba"]
    assert detail["supporting_source_urls"] == ["https://example.com/source"]
    assert detail["researched_at"] == "2026-07-20T12:00:00+00:00"
    assert "why_fiyu" not in detail


def test_public_card_enrichment_omits_internal_source_provenance(public_db):
    with connect(public_db) as connection:
        connection.execute(
            """UPDATE public_restaurants SET
                card_description='Small neighborhood soba counter.',
                review_themes_json=?, practical_info_json=?, opening_hours_json=?,
                hours_display='Tue-Sun - 17:00-23:00', hours_confidence=0.8,
                hours_checked_at='2026-08-20T00:00:00+00:00'
               WHERE place_id='eligible'""",
            (
                json.dumps(
                    [
                        {
                            "theme": "hand-cut soba",
                            "sentiment": "positive",
                            "supporting_source_count": 2,
                            "confidence": 0.8,
                            "source_urls": [
                                "https://internal.example/a",
                                "https://internal.example/a-2",
                            ],
                        }
                    ]
                ),
                json.dumps(
                    {
                        "reservation": {"status": "unknown", "confidence": None},
                        "seating": {"counter": True},
                        "source_urls": ["https://internal.example/b"],
                        "checked_at": "2026-08-20T00:00:00+00:00",
                    }
                ),
                json.dumps(
                    {
                        "tuesday": {
                            "status": "open",
                            "periods": [{"open": "17:00", "close": "23:00"}],
                        },
                        "sources": [
                            {
                                "url": "https://internal.example/c",
                                "source_type": "official_website",
                            }
                        ],
                        "unresolved_conflicts": [],
                    }
                ),
            ),
        )
        connection.commit()
    row = TestClient(api.app).get("/public/restaurants/eligible").json()
    assert row["card_description"] == "Small neighborhood soba counter."
    assert row["review_themes"][0]["theme"] == "hand-cut soba"
    assert "source_urls" not in row["review_themes"][0]
    assert "source_urls" not in row["practical_info"]
    assert "sources" not in row["opening_hours"]
    assert row["hours_checked_at"] == "2026-08-20T00:00:00+00:00"


def test_public_detail_exposes_sanitized_canonical_booking_and_budget(public_db):
    with connect(public_db) as connection:
        connection.execute(
            """UPDATE public_restaurants SET reservation_status='strongly_recommended',
                   reservation_confidence=0.9, booking_methods_json='["phone", "online"]',
                   phone_number='03-1234-5678', booking_url='https://reserve.example/eligible',
                   contact_note='Same-day bookings may be limited.',
                   budget_json=? , budget_source_value='raw internal value'
               WHERE place_id='eligible'""",
            (
                json.dumps(
                    {
                        "currency": "JPY",
                        "minimum": 3000,
                        "maximum": 5000,
                        "band": "moderate",
                        "source_type": "candidate_price_import",
                        "confidence": 0.8,
                    }
                ),
            ),
        )
        connection.commit()
    row = TestClient(api.app).get("/public/restaurants/eligible").json()
    assert row["reservation_status"] == "strongly_recommended"
    assert row["booking_methods"] == ["phone", "online"]
    assert row["phone_number"] == "03-1234-5678"
    assert row["booking_url"] == "https://reserve.example/eligible"
    assert row["budget"]["band"] == "moderate"
    assert "budget_source_value" not in row


def test_photo_endpoint_preserves_attribution_without_persisting(public_db, monkeypatch):
    with connect(public_db) as connection:
        before = dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id = 'eligible'"
            ).fetchone()
        )

    def photos(place_id, *, limit):
        assert place_id == "eligible"
        assert limit == 1
        return [
            {
                "media_url": "https://photos.example/fresh",
                "width": 1200,
                "height": 800,
                "google_maps_uri": "https://maps.google.com/source",
                "flag_content_uri": "https://google.example/flag",
                "author_attributions": [
                    {
                        "display_name": "Photographer",
                        "uri": "https://author.example",
                        "photo_uri": "https://author.example/photo",
                        "flag_content_uri": "https://author.example/flag",
                    }
                ],
            }
        ]

    monkeypatch.setattr(api, "get_place_photos", photos)
    response = TestClient(api.app).get("/public/restaurants/eligible/photo-preview")
    assert response.status_code == 200
    body = response.json()
    assert body["author_attributions"][0]["display_name"] == "Photographer"
    assert body["google_maps_uri"].startswith("https://maps.google.com")
    assert "resource_name" not in body
    with connect(public_db) as connection:
        after = dict(
            connection.execute(
                "SELECT * FROM public_restaurants WHERE place_id = 'eligible'"
            ).fetchone()
        )
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(public_restaurants)")
        }
    assert after == before
    assert {"photo_resource_name", "photo_media_url"}.isdisjoint(columns)


@pytest.mark.parametrize(
    ("exception", "status"),
    [
        (GooglePlacesConfigurationError("private"), 503),
        (GooglePlacesNoPhotosError("private"), 404),
        (GooglePlacesTimeoutError("private"), 504),
        (GooglePlacesProviderError("private"), 502),
    ],
)
def test_photo_endpoints_map_controlled_errors(public_db, monkeypatch, exception, status):
    def fail(*args, **kwargs):
        raise exception

    monkeypatch.setattr(api, "get_place_photos", fail)
    response = TestClient(api.app).get("/public/restaurants/eligible/photos")
    assert response.status_code == status
    assert "private" not in response.text


def test_location_anchors_are_approximate_and_receive_no_user_location(public_db, monkeypatch):
    monkeypatch.setattr(
        api,
        "load_location_anchors",
        lambda: [
            {
                "id": "reviewed-anchor",
                "display_name": "Reviewed Station",
                "area_name": "Reviewed",
                "latitude": 35.0,
                "longitude": 139.0,
                "precision": "area_anchor",
                "qualifier": "Approximate center of Reviewed",
            }
        ],
    )
    client = TestClient(api.app)
    response = client.get("/public/location-anchors")
    assert response.status_code == 200
    assert response.json()[0]["qualifier"].startswith("Approximate center")
    assert response.json()[0]["precision"] == "area_anchor"
    assert client.post("/public/location-anchors", json={"latitude": 1}).status_code == 405


def test_community_rate_hidden_below_minimum(public_db, monkeypatch):
    monkeypatch.setenv("FIYU_COMMUNITY_MINIMUM_RESPONSES", "3")
    with connect(public_db) as connection:
        connection.executemany(
            """
            INSERT INTO community_recommendations
                (response_id, place_id, user_subject_id, recommends, created_at)
            VALUES (?, 'eligible', ?, ?, 'now')
            """,
            [("r1", "u1", 1), ("r2", "u2", 0)],
        )
        connection.commit()
    client = TestClient(api.app)
    row = client.get("/public/restaurants/eligible").json()
    assert row["community_recommendation_count"] == 2
    assert row["community_recommendation_rate"] is None
    assert row["community_stats_visible"] is False
    assert client.post("/public/restaurants/eligible/community", json={"rate": 1}).status_code in {
        404,
        405,
    }
