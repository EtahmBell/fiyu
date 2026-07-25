from __future__ import annotations

import logging
import os
from math import cos, radians
from pathlib import Path

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .database import connect, decode_restaurant_row
from .google_places import (
    GooglePlacesConfigurationError,
    GooglePlacesProviderError,
    GooglePlacesTimeoutError,
    fetch_live_place_details,
    normalize_live_place_details,
)
from .public_catalog import get_public_restaurant, list_published_restaurants
from .utils import haversine_km

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
    primary_category: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    neighborhood: str | None = None
    fiyu_score: float | None = None
    fiyu_confidence: float | None = None
    confidence_band: str | None = None
    score_band: str | None = None
    why_fiyu: str | None = None
    food_tags: list[str] = Field(default_factory=list)
    signature_dishes: list[str] = Field(default_factory=list)
    local_language_web_signal: float | None = None


class PublicRestaurantDetail(PublicRestaurantSummary):
    pass


class GoogleLiveDetails(BaseModel):
    place_id: str
    name: str
    address: str
    latitude: float
    longitude: float
    rating: float
    rating_count: int
    price_level: str | None = None
    open_now: bool | None = None
    weekday_hours: list[str] = Field(default_factory=list)
    google_maps_uri: str | None = None
    primary_type: str | None = None


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


@app.get("/public/restaurants/{place_id}/live-details", response_model=GoogleLiveDetails)
def public_restaurant_live_details(
    place_id: str,
    language_code: Annotated[str, Query(pattern="^(en|ja)$")] = "en",
) -> dict[str, object]:
    _ensure_database()
    if get_public_restaurant(DB_PATH, place_id) is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    try:
        payload = fetch_live_place_details(place_id, language_code=language_code)
        return normalize_live_place_details(payload, requested_place_id=place_id)
    except GooglePlacesConfigurationError:
        logger.error("Google Places is not configured")
        raise HTTPException(status_code=503, detail="Live details are unavailable") from None
    except GooglePlacesTimeoutError:
        logger.warning("Google Places request timed out for place_id=%s", place_id)
        raise HTTPException(status_code=504, detail="Live details provider timed out") from None
    except GooglePlacesProviderError as exc:
        logger.warning(
            "Google Places request failed for place_id=%s: %s", place_id, type(exc).__name__
        )
        raise HTTPException(status_code=502, detail="Live details provider failed") from None
    except (TypeError, ValueError):
        logger.warning("Google Places returned invalid fields for place_id=%s", place_id)
        raise HTTPException(status_code=502, detail="Live details provider failed") from None


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
