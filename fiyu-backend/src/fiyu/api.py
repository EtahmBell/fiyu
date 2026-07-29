from __future__ import annotations

import logging
import os
from math import cos, radians
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .database import connect, decode_restaurant_row
from .google_places import (
    GooglePlacesConfigurationError,
    GooglePlacesNoPhotosError,
    GooglePlacesProviderError,
    GooglePlacesTimeoutError,
    get_place_photos,
)
from .location_anchors import load_location_anchors
from .osm_index import OSM_ATTRIBUTION
from .public_catalog import get_public_restaurant, list_published_restaurants
from .utils import haversine_km

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")
DB_PATH = Path(os.getenv("FIYU_DB_PATH", "data/fiyu.db"))
logger = logging.getLogger(__name__)
origins = [
    value.strip()
    for value in os.getenv(
        "FIYU_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if value.strip()
]

app = FastAPI(
    title="Fiyu Candidate API",
    version="0.1.0",
    description=(
        "Nearby Tokyo restaurant recommendations using an internal/provisional candidate score. "
        "The score is not a verified localness or public quality rating."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


class PublicRestaurantSummary(BaseModel):
    place_id: str
    name_ja: str | None = None
    name_en: str | None = None
    category: str | None = None
    description_en: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    neighborhood: str | None = None
    fiyu_score: float | None = None
    score_band: str | None = None
    score_type: str = "editorial_research"
    food_tags: list[str] = Field(default_factory=list)
    signature_dishes: list[str] = Field(default_factory=list)
    discovery_area: str | None = None
    discovery_area_type: str | None = None
    discovery_areas: list[dict[str, object]] = Field(default_factory=list)
    multiple_discovery_areas: bool = False
    discovery_area_conflict: bool = False
    location_precision: str | None = None
    verified_core_address: str | None = None
    core_address_verified: bool = False
    full_address_verified: bool = False
    map_location_approximate: bool = False
    map_display_eligible: bool = False
    map_anchor_type: str | None = None
    map_anchor_id: str | None = None
    location_status: str | None = None
    location_label: str | None = None
    matched_components: dict[str, str] = Field(default_factory=dict)
    unmatched_components: dict[str, str] = Field(default_factory=dict)
    provenance: dict[str, object | None] = Field(default_factory=dict)
    source_reference: str | None = None
    distance_sort_eligible: bool = False
    directions_coordinates_eligible: bool = False
    external_map_search_query: str | None = None
    community_recommendation_count: int = 0
    community_positive_count: int = 0
    community_recommendation_rate: float | None = None
    community_stats_visible: bool = False


class PublicRestaurantDetail(PublicRestaurantSummary):
    pass


class PhotoAttribution(BaseModel):
    display_name: str | None = None
    uri: str | None = None
    photo_uri: str | None = None
    flag_content_uri: str | None = None


class GooglePhoto(BaseModel):
    media_url: str
    width: int
    height: int
    author_attributions: list[PhotoAttribution] = Field(default_factory=list)
    google_maps_uri: str | None = None
    flag_content_uri: str | None = None


class LocationAnchorResponse(BaseModel):
    id: str
    display_name: str
    area_name: str
    latitude: float
    longitude: float
    precision: str
    qualifier: str


def _ensure_database() -> None:
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                f"Database not found at {DB_PATH}. Run the ingestion command first: "
                "python -m fiyu.cli ingest data/raw --db data/fiyu.db"
            ),
        )


@app.get("/public/restaurants", response_model=list[PublicRestaurantSummary])
def public_restaurants(
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[dict[str, object]]:
    _ensure_database()
    return list_published_restaurants(DB_PATH, limit=limit)


@app.get("/public/restaurants/{place_id}", response_model=PublicRestaurantDetail)
def public_restaurant_detail(place_id: str) -> dict[str, object]:
    _ensure_database()
    restaurant = get_public_restaurant(DB_PATH, place_id)
    if restaurant is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant


def _photos_or_http_error(place_id: str, *, limit: int) -> list[dict[str, object]]:
    _ensure_database()
    if get_public_restaurant(DB_PATH, place_id) is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    try:
        return get_place_photos(place_id, limit=limit)
    except GooglePlacesConfigurationError:
        logger.error("Google Places is not configured")
        raise HTTPException(status_code=503, detail="Restaurant photos are unavailable") from None
    except GooglePlacesNoPhotosError:
        raise HTTPException(status_code=404, detail="Restaurant photos not found") from None
    except GooglePlacesTimeoutError:
        logger.warning("Google photo request timed out for place_id=%s", place_id)
        raise HTTPException(status_code=504, detail="Restaurant photo provider timed out") from None
    except GooglePlacesProviderError as exc:
        logger.warning(
            "Google photo request failed for place_id=%s: %s", place_id, type(exc).__name__
        )
        raise HTTPException(status_code=502, detail="Restaurant photo provider failed") from None
    except (TypeError, ValueError):
        logger.warning("Google Places returned invalid photo fields for place_id=%s", place_id)
        raise HTTPException(status_code=502, detail="Restaurant photo provider failed") from None


@app.get("/public/restaurants/{place_id}/photo-preview", response_model=GooglePhoto)
def public_restaurant_photo_preview(place_id: str) -> dict[str, object]:
    return _photos_or_http_error(place_id, limit=1)[0]


@app.get("/public/restaurants/{place_id}/photos", response_model=list[GooglePhoto])
def public_restaurant_photos(
    place_id: str, limit: Annotated[int, Query(ge=1, le=10)] = 5
) -> list[dict[str, object]]:
    return _photos_or_http_error(place_id, limit=limit)


@app.get("/public/location-anchors", response_model=list[LocationAnchorResponse])
def public_location_anchors() -> list[dict[str, object]]:
    return load_location_anchors()


@app.get("/public/map-config")
def public_map_config() -> dict[str, str]:
    return {"attribution": OSM_ATTRIBUTION}


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "database_exists": DB_PATH.exists(), "database": str(DB_PATH)}


@app.get("/stats")
def stats() -> dict[str, object]:
    _ensure_database()
    with connect(DB_PATH) as connection:
        row = connection.execute(
            """
            SELECT
              COUNT(*) AS restaurant_count,
              SUM(candidate_eligible) AS candidate_count,
              SUM(matches_simple_rule) AS simple_rule_count,
              ROUND(AVG(internal_fiyu_score), 2) AS average_score,
              MAX(internal_fiyu_score) AS maximum_score
            FROM restaurants
            """
        ).fetchone()
        metadata = {
            item["key"]: item["value"]
            for item in connection.execute("SELECT key, value FROM metadata").fetchall()
        }
    return {**dict(row), "metadata": metadata}


@app.get("/areas")
def areas() -> list[dict[str, object]]:
    _ensure_database()
    with connect(DB_PATH) as connection:
        rows = connection.execute(
            """
            SELECT search_area,
                   COUNT(*) AS restaurant_count,
                   SUM(candidate_eligible) AS candidate_count,
                   ROUND(AVG(internal_fiyu_score), 2) AS average_score
            FROM restaurants
            GROUP BY search_area
            ORDER BY restaurant_count DESC, search_area
            """
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/restaurants/candidates")
def candidates(
    area: str | None = None,
    category: str | None = None,
    min_score: Annotated[float, Query(ge=0, le=100)] = 55.0,
    simple_rule_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, object]]:
    _ensure_database()
    conditions = ["internal_fiyu_score >= ?"]
    parameters: list[object] = [min_score]
    if area:
        conditions.append("search_area = ?")
        parameters.append(area)
    if category:
        conditions.append("broad_category = ?")
        parameters.append(category)
    if simple_rule_only:
        conditions.append("matches_simple_rule = 1")
    else:
        conditions.append("candidate_eligible = 1")
        parameters.extend([limit, offset])
    sql = f"""
        SELECT * FROM restaurants
        WHERE {' AND '.join(conditions)}
        ORDER BY internal_fiyu_score DESC, confidence_score DESC
        LIMIT ? OFFSET ?
    """
    with connect(DB_PATH) as connection:
        rows = connection.execute(sql, parameters).fetchall()
    return [decode_restaurant_row(row) for row in rows]

@app.get("/restaurants/candidates/random")
def random_candidates(
    area: str | None = None,
    category: str | None = None,
    min_score: Annotated[float, Query(ge=0, le=100)] = 55.0,
    simple_rule_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[dict[str, object]]:
    """Return a random sample of eligible restaurant candidates."""
    _ensure_database()

    conditions = ["internal_fiyu_score >= ?"]
    parameters: list[object] = [min_score]

    if area:
        conditions.append("search_area = ?")
        parameters.append(area)

    if category:
        conditions.append("broad_category = ?")
        parameters.append(category)

    if simple_rule_only:
        conditions.append("matches_simple_rule = 1")
    else:
        conditions.append("candidate_eligible = 1")

    parameters.append(limit)

    sql = f"""
        SELECT *
        FROM restaurants
        WHERE {' AND '.join(conditions)}
        ORDER BY RANDOM()
        LIMIT ?
    """

    with connect(DB_PATH) as connection:
        rows = connection.execute(sql, parameters).fetchall()

    return [decode_restaurant_row(row) for row in rows]


@app.get("/restaurants/nearby")
def nearby(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    radius_km: Annotated[float, Query(gt=0, le=25)] = 3.0,
    min_score: Annotated[float, Query(ge=0, le=100)] = 55.0,
    category: str | None = None,
    include_borderline: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[dict[str, object]]:
    _ensure_database()
    lat_delta = radius_km / 110.574
    longitude_scale = max(0.1, abs(cos(radians(lat))))
    lng_delta = radius_km / (111.320 * longitude_scale)

    conditions = [
        "latitude BETWEEN ? AND ?",
        "longitude BETWEEN ? AND ?",
        "internal_fiyu_score >= ?",
    ]
    parameters: list[object] = [
        lat - lat_delta,
        lat + lat_delta,
        lng - lng_delta,
        lng + lng_delta,
        min_score,
    ]
    if not include_borderline:
        conditions.append("candidate_eligible = 1")
    if category:
        conditions.append("broad_category = ?")
        parameters.append(category)

    sql = f"""
        SELECT * FROM restaurants
        WHERE {' AND '.join(conditions)}
        ORDER BY internal_fiyu_score DESC
        LIMIT 500
    """
    with connect(DB_PATH) as connection:
        rows = connection.execute(sql, parameters).fetchall()

    results: list[dict[str, object]] = []
    for row in rows:
        item = decode_restaurant_row(row)
        if item.get("latitude") is None or item.get("longitude") is None:
            continue
        distance = haversine_km(lat, lng, float(item["latitude"]), float(item["longitude"]))
        if distance <= radius_km:
            item["distance_km"] = round(distance, 3)
            results.append(item)

    results.sort(
        key=lambda item: (
            float(item.get("internal_fiyu_score") or 0),
            -float(item.get("distance_km") or 0),
        ),
        reverse=True,
    )
    return results[:limit]


@app.get("/restaurants/{restaurant_id}")
def restaurant_detail(restaurant_id: int) -> dict[str, object]:
    _ensure_database()
    with connect(DB_PATH) as connection:
        row = connection.execute(
            "SELECT * FROM restaurants WHERE id = ?", (restaurant_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return decode_restaurant_row(row)
