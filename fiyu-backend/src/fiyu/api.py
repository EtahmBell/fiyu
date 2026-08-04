from __future__ import annotations

import logging
import os
from math import cos, radians
from pathlib import Path
from typing import Annotated
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .database import connect, decode_restaurant_row
from .entitlements import (
    CAPABILITY_CUSTOM_LISTS,
    EntitlementError,
    resolve_owner_capabilities,
)
from .google_places import (
    GooglePlacesConfigurationError,
    GooglePlacesNoPhotosError,
    GooglePlacesProviderError,
    GooglePlacesTimeoutError,
    get_place_photos,
)
from .list_policy import ListPolicyError, resolve_capability
from .location_anchors import load_location_anchors
from .osm_index import OSM_ATTRIBUTION
from .public_catalog import (
    ensure_public_schema,
    get_public_restaurant,
    get_public_restaurant_detail,
    list_published_restaurants,
)
from .restaurant_lists import (
    CUSTOM_LIST_KIND,
    add_item,
    contains_place_id,
    count_items,
    create_custom_list,
    delete_list,
    get_list_by_id,
    get_or_create_default_list,
    get_published_restaurant_city,
    list_items,
    list_lists_for_owner,
    remove_item,
    rename_list,
)
from .smart_views import (
    SMART_VIEW_KEYS,
    SMART_VIEW_META,
    list_smart_view_counts,
    list_smart_view_entries,
    utc_now_iso,
)
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
    allow_methods=["GET", "POST", "DELETE", "PATCH"],
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
    restaurant_type_en: str | None = None
    cuisine_terms_en: list[str] = Field(default_factory=list)
    signature_dishes_en: list[str] = Field(default_factory=list)
    supporting_source_urls: list[str] = Field(default_factory=list)
    researched_at: str | None = None


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


class SavedRestaurantSummary(BaseModel):
    place_id: str
    name_ja: str | None = None
    name_en: str | None = None
    primary_category: str | None = None
    neighborhood: str | None = None
    fiyu_score: float | None = None
    score_band: str | None = None


class RestaurantListItemResponse(BaseModel):
    place_id: str
    added_at: str
    restaurant: SavedRestaurantSummary


class RestaurantListResponse(BaseModel):
    list_id: int
    city_id: str
    name: str
    list_kind: str
    item_count: int
    items: list[RestaurantListItemResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class RestaurantListSummaryResponse(BaseModel):
    list_id: int
    city_id: str
    name: str
    list_kind: str
    item_count: int
    created_at: str
    updated_at: str


class RestaurantListCollectionResponse(BaseModel):
    lists: list[RestaurantListSummaryResponse] = Field(default_factory=list)


class UpsertDefaultListItemRequest(BaseModel):
    city_id: str = Field(min_length=1, max_length=64)
    place_id: str = Field(min_length=1, max_length=256)


class RemoveDefaultListItemRequest(BaseModel):
    city_id: str = Field(min_length=1, max_length=64)
    place_id: str = Field(min_length=1, max_length=256)


class CreateCustomListRequest(BaseModel):
    city_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)


class RenameListRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class UpsertListItemRequest(BaseModel):
    place_id: str = Field(min_length=1, max_length=256)


class DefaultListItemMutationResponse(BaseModel):
    list: RestaurantListResponse
    changed: bool


class DefaultListMembershipResponse(BaseModel):
    list_id: int
    city_id: str
    place_id: str
    is_saved: bool


class ListItemMutationResponse(BaseModel):
    list: RestaurantListResponse
    changed: bool


class EntitlementErrorResponse(BaseModel):
    code: str
    capability: str
    message: str


class SmartViewCatalogEntryResponse(BaseModel):
    key: str
    label: str
    description: str
    item_count: int


class SmartViewCatalogResponse(BaseModel):
    city_id: str
    views: list[SmartViewCatalogEntryResponse] = Field(default_factory=list)
    generated_at: str


class SmartViewRestaurantSummary(SavedRestaurantSummary):
    pass


class SmartViewItemResponse(BaseModel):
    place_id: str
    added_at: str
    is_visited: bool = False
    distance_km: float | None = None
    restaurant: SmartViewRestaurantSummary


class SmartViewGroupResponse(BaseModel):
    group_key: str
    title: str
    item_count: int
    items: list[SmartViewItemResponse] = Field(default_factory=list)


class SmartViewResponse(BaseModel):
    city_id: str
    view_key: str
    label: str
    description: str
    item_count: int
    items: list[SmartViewItemResponse] = Field(default_factory=list)
    groups: list[SmartViewGroupResponse] = Field(default_factory=list)
    generated_at: str


def _ensure_database() -> None:
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                f"Database not found at {DB_PATH}. Run the ingestion command first: "
                "python -m fiyu.cli ingest data/raw --db data/fiyu.db"
            ),
        )


def _owner_id_from_header(
    x_fiyu_client_id: Annotated[str | None, Header(alias="X-Fiyu-Client-Id")] = None,
) -> str:
    if x_fiyu_client_id is None:
        raise HTTPException(status_code=400, detail="Missing X-Fiyu-Client-Id header")
    value = x_fiyu_client_id.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Missing X-Fiyu-Client-Id header")
    try:
        return str(UUID(value))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid X-Fiyu-Client-Id header; expected UUID",
        ) from None


def _normalize_list_city(city_id: str) -> str:
    try:
        return resolve_capability(city_id).city_id
    except ListPolicyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


def _require_owner_capability(owner_id: str, capability: str) -> None:
    try:
        capabilities = resolve_owner_capabilities(owner_id)
        if capability not in capabilities:
            raise EntitlementError(capability=capability)
    except EntitlementError as exc:
        raise HTTPException(
            status_code=403,
            detail=EntitlementErrorResponse(
                code=exc.code,
                capability=exc.capability,
                message=exc.message,
            ).model_dump(),
        ) from None


TOKYO_CITY_ALIASES: frozenset[str] = frozenset(
    {
        "tokyo",
        "tokyo-to",
        "東京都",
        "chiyoda",
        "chiyodacity",
        "chiyodaku",
        "chuo",
        "chuocity",
        "chuoku",
        "minato",
        "minatocity",
        "minatoku",
        "shinjuku",
        "shinjukucity",
        "shinjukuku",
        "bunkyo",
        "bunkyocity",
        "bunkyoku",
        "taito",
        "taitocity",
        "taitoku",
        "sumida",
        "sumidacity",
        "sumidaku",
        "koto",
        "kotocity",
        "kotoku",
        "shinagawa",
        "shinagawacity",
        "shinagawaku",
        "meguro",
        "megurocity",
        "meguroku",
        "ota",
        "otacity",
        "otaku",
        "setagaya",
        "setagayacity",
        "setagayaku",
        "shibuya",
        "shibuyacity",
        "shibuyaku",
        "nakano",
        "nakanocity",
        "nakanoku",
        "suginami",
        "suginamicity",
        "suginamiku",
        "toshima",
        "toshimacity",
        "toshimaku",
        "kita",
        "kitacity",
        "kitaku",
        "arakawa",
        "arakawacity",
        "arakawaku",
        "itabashi",
        "itabashicity",
        "itabashiku",
        "nerima",
        "nerimacity",
        "nerimaku",
        "adachi",
        "adachicity",
        "adachiku",
        "katsushika",
        "katsushikacity",
        "katsushikaku",
        "edogawa",
        "edogawacity",
        "edogawaku",
    }
)


def _city_matches_list(
    *,
    city_id: str,
    restaurant_city: str | None,
) -> bool:
    if restaurant_city is None:
        return True
    normalized = restaurant_city.strip().lower().replace(" ", "")
    if city_id == "tokyo":
        return normalized in TOKYO_CITY_ALIASES
    return normalized == city_id


def _default_list_response(owner_id: str, city_id: str) -> RestaurantListResponse:
    row = get_or_create_default_list(DB_PATH, owner_id=owner_id, city_id=city_id)
    items = list_items(DB_PATH, list_id=int(row["id"]))
    return RestaurantListResponse(
        list_id=int(row["id"]),
        city_id=str(row["city_id"]),
        name=str(row["name"]),
        list_kind=str(row["list_kind"]),
        item_count=len(items),
        items=[
            RestaurantListItemResponse(
                place_id=str(item["place_id"]),
                added_at=str(item["added_at"]),
                restaurant=SavedRestaurantSummary(
                    place_id=str(item["place_id"]),
                    name_ja=item.get("name_ja"),
                    name_en=item.get("name_en"),
                    primary_category=item.get("primary_category"),
                    neighborhood=item.get("neighborhood"),
                    fiyu_score=item.get("fiyu_score"),
                    score_band=item.get("score_band"),
                ),
            )
            for item in items
        ],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def _list_response_from_row(row: dict[str, object]) -> RestaurantListResponse:
    items = list_items(DB_PATH, list_id=int(row["id"]))
    return RestaurantListResponse(
        list_id=int(row["id"]),
        city_id=str(row["city_id"]),
        name=str(row["name"]),
        list_kind=str(row["list_kind"]),
        item_count=len(items),
        items=[
            RestaurantListItemResponse(
                place_id=str(item["place_id"]),
                added_at=str(item["added_at"]),
                restaurant=SavedRestaurantSummary(
                    place_id=str(item["place_id"]),
                    name_ja=item.get("name_ja"),
                    name_en=item.get("name_en"),
                    primary_category=item.get("primary_category"),
                    neighborhood=item.get("neighborhood"),
                    fiyu_score=item.get("fiyu_score"),
                    score_band=item.get("score_band"),
                ),
            )
            for item in items
        ],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def _list_summary_response_from_row(row: dict[str, object]) -> RestaurantListSummaryResponse:
    return RestaurantListSummaryResponse(
        list_id=int(row["id"]),
        city_id=str(row["city_id"]),
        name=str(row["name"]),
        list_kind=str(row["list_kind"]),
        item_count=count_items(DB_PATH, list_id=int(row["id"])),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def _owned_list_or_404(owner_id: str, list_id: int) -> dict[str, object]:
    row = get_list_by_id(DB_PATH, owner_id=owner_id, list_id=list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="List not found")
    return row


def _smart_view_response(
    *,
    city_id: str,
    view_key: str,
    payload: dict[str, object],
) -> SmartViewResponse:
    items_raw = payload.get("items")
    groups_raw = payload.get("groups")
    items_raw_list = list(items_raw) if isinstance(items_raw, list) else []
    groups_raw_list = list(groups_raw) if isinstance(groups_raw, list) else []

    items = [
        SmartViewItemResponse(
            place_id=str(item["place_id"]),
            added_at=str(item["added_at"]),
            is_visited=bool(item.get("is_visited", False)),
            distance_km=float(item["distance_km"]) if item.get("distance_km") is not None else None,
            restaurant=SmartViewRestaurantSummary(
                place_id=str(item["restaurant"]["place_id"]),
                name_ja=item["restaurant"].get("name_ja"),
                name_en=item["restaurant"].get("name_en"),
                primary_category=item["restaurant"].get("primary_category"),
                neighborhood=item["restaurant"].get("neighborhood"),
                fiyu_score=item["restaurant"].get("fiyu_score"),
                score_band=item["restaurant"].get("score_band"),
            ),
        )
        for item in items_raw_list
    ]

    groups = [
        SmartViewGroupResponse(
            group_key=str(group["group_key"]),
            title=str(group["title"]),
            item_count=int(group["item_count"]),
            items=[
                SmartViewItemResponse(
                    place_id=str(item["place_id"]),
                    added_at=str(item["added_at"]),
                    is_visited=bool(item.get("is_visited", False)),
                    distance_km=float(item["distance_km"]) if item.get("distance_km") is not None else None,
                    restaurant=SmartViewRestaurantSummary(
                        place_id=str(item["restaurant"]["place_id"]),
                        name_ja=item["restaurant"].get("name_ja"),
                        name_en=item["restaurant"].get("name_en"),
                        primary_category=item["restaurant"].get("primary_category"),
                        neighborhood=item["restaurant"].get("neighborhood"),
                        fiyu_score=item["restaurant"].get("fiyu_score"),
                        score_band=item["restaurant"].get("score_band"),
                    ),
                )
                for item in group.get("items", [])
            ],
        )
        for group in groups_raw_list
    ]

    item_count = len(items)
    if groups:
        item_count = sum(group.item_count for group in groups)

    meta = SMART_VIEW_META[view_key]
    return SmartViewResponse(
        city_id=city_id,
        view_key=view_key,
        label=meta["label"],
        description=meta["description"],
        item_count=item_count,
        items=items,
        groups=groups,
        generated_at=utc_now_iso(),
    )


@app.get("/public/restaurants", response_model=list[PublicRestaurantSummary])
def public_restaurants(
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[dict[str, object]]:
    _ensure_database()
    return list_published_restaurants(DB_PATH, limit=limit)


@app.get("/lists", response_model=RestaurantListCollectionResponse)
def get_lists(
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
    city_id: str | None = None,
) -> RestaurantListCollectionResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)

    if city_id is None:
        resolved_city_ids = ["tokyo"]
    else:
        resolved_city_ids = [_normalize_list_city(city_id)]

    for resolved_city_id in resolved_city_ids:
        get_or_create_default_list(DB_PATH, owner_id=owner_id, city_id=resolved_city_id)

    rows = list_lists_for_owner(
        DB_PATH,
        owner_id=owner_id,
        city_id=resolved_city_ids[0] if len(resolved_city_ids) == 1 else None,
    )
    return RestaurantListCollectionResponse(
        lists=[_list_summary_response_from_row(row) for row in rows],
    )


@app.post("/lists", response_model=RestaurantListResponse)
def create_list(
    payload: CreateCustomListRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantListResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    _require_owner_capability(owner_id, CAPABILITY_CUSTOM_LISTS)

    resolved_city_id = _normalize_list_city(payload.city_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")

    row = create_custom_list(
        DB_PATH,
        owner_id=owner_id,
        city_id=resolved_city_id,
        name=name,
    )
    return _list_response_from_row(row)


@app.get("/lists/{list_id:int}", response_model=RestaurantListResponse)
def get_list(
    list_id: int,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantListResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    row = _owned_list_or_404(owner_id, list_id)
    return _list_response_from_row(row)


@app.patch("/lists/{list_id:int}", response_model=RestaurantListResponse)
def rename_custom_list(
    list_id: int,
    payload: RenameListRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantListResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    _require_owner_capability(owner_id, CAPABILITY_CUSTOM_LISTS)

    row = _owned_list_or_404(owner_id, list_id)
    if str(row["list_kind"]) != CUSTOM_LIST_KIND:
        raise HTTPException(status_code=400, detail="Default list cannot be renamed")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")

    renamed = rename_list(DB_PATH, owner_id=owner_id, list_id=list_id, name=name)
    if renamed is None:
        raise HTTPException(status_code=404, detail="List not found")
    return _list_response_from_row(renamed)


@app.delete("/lists/{list_id:int}")
def delete_custom_list(
    list_id: int,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> dict[str, bool]:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    _require_owner_capability(owner_id, CAPABILITY_CUSTOM_LISTS)

    row = _owned_list_or_404(owner_id, list_id)
    if str(row["list_kind"]) != CUSTOM_LIST_KIND:
        raise HTTPException(status_code=400, detail="Default list cannot be deleted")

    changed = delete_list(DB_PATH, owner_id=owner_id, list_id=list_id)
    return {"changed": changed}


@app.post("/lists/{list_id:int}/items", response_model=ListItemMutationResponse)
def add_list_item(
    list_id: int,
    payload: UpsertListItemRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> ListItemMutationResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    _require_owner_capability(owner_id, CAPABILITY_CUSTOM_LISTS)

    row = _owned_list_or_404(owner_id, list_id)
    if str(row["list_kind"]) != CUSTOM_LIST_KIND:
        raise HTTPException(status_code=400, detail="Use /lists/default/items for default list saves")

    place_id = payload.place_id.strip()
    if not place_id:
        raise HTTPException(status_code=422, detail="place_id is required")

    restaurant_city = get_published_restaurant_city(DB_PATH, place_id=place_id)
    if restaurant_city is None:
        raise HTTPException(status_code=404, detail="Published restaurant not found")
    if not _city_matches_list(city_id=str(row["city_id"]), restaurant_city=restaurant_city):
        raise HTTPException(status_code=400, detail="Restaurant does not belong to the requested city")

    changed = add_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    latest = _owned_list_or_404(owner_id, list_id)
    return ListItemMutationResponse(list=_list_response_from_row(latest), changed=changed)


@app.delete("/lists/{list_id:int}/items/{place_id}", response_model=ListItemMutationResponse)
def remove_list_item(
    list_id: int,
    place_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> ListItemMutationResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    _require_owner_capability(owner_id, CAPABILITY_CUSTOM_LISTS)

    row = _owned_list_or_404(owner_id, list_id)
    if str(row["list_kind"]) != CUSTOM_LIST_KIND:
        raise HTTPException(status_code=400, detail="Use /lists/default/items for default list saves")

    changed = remove_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    latest = _owned_list_or_404(owner_id, list_id)
    return ListItemMutationResponse(list=_list_response_from_row(latest), changed=changed)


@app.get("/lists/default", response_model=RestaurantListResponse)
def get_default_list(
    city_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantListResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    resolved_city_id = _normalize_list_city(city_id)
    return _default_list_response(owner_id, resolved_city_id)


@app.post("/lists/default/items", response_model=DefaultListItemMutationResponse)
def add_default_list_item(
    payload: UpsertDefaultListItemRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> DefaultListItemMutationResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    resolved_city_id = _normalize_list_city(payload.city_id)
    place_id = payload.place_id.strip()
    if not place_id:
        raise HTTPException(status_code=422, detail="place_id is required")

    restaurant_city = get_published_restaurant_city(DB_PATH, place_id=place_id)
    if restaurant_city is None:
        raise HTTPException(status_code=404, detail="Published restaurant not found")
    if not _city_matches_list(city_id=resolved_city_id, restaurant_city=restaurant_city):
        raise HTTPException(status_code=400, detail="Restaurant does not belong to the requested city")

    row = get_or_create_default_list(DB_PATH, owner_id=owner_id, city_id=resolved_city_id)
    changed = add_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    return DefaultListItemMutationResponse(
        list=_default_list_response(owner_id, resolved_city_id),
        changed=changed,
    )


@app.delete("/lists/default/items", response_model=DefaultListItemMutationResponse)
def remove_default_list_item(
    payload: RemoveDefaultListItemRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> DefaultListItemMutationResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    resolved_city_id = _normalize_list_city(payload.city_id)
    place_id = payload.place_id.strip()
    if not place_id:
        raise HTTPException(status_code=422, detail="place_id is required")

    row = get_or_create_default_list(DB_PATH, owner_id=owner_id, city_id=resolved_city_id)
    changed = remove_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    return DefaultListItemMutationResponse(
        list=_default_list_response(owner_id, resolved_city_id),
        changed=changed,
    )


@app.get("/lists/default/membership", response_model=DefaultListMembershipResponse)
def get_default_list_membership(
    city_id: str,
    place_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> DefaultListMembershipResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    resolved_city_id = _normalize_list_city(city_id)
    row = get_or_create_default_list(DB_PATH, owner_id=owner_id, city_id=resolved_city_id)
    return DefaultListMembershipResponse(
        list_id=int(row["id"]),
        city_id=resolved_city_id,
        place_id=place_id,
        is_saved=contains_place_id(DB_PATH, list_id=int(row["id"]), place_id=place_id),
    )


@app.get("/lists/default/smart-views", response_model=SmartViewCatalogResponse)
def get_default_list_smart_view_catalog(
    city_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> SmartViewCatalogResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    resolved_city_id = _normalize_list_city(city_id)
    counts = list_smart_view_counts(DB_PATH, owner_id=owner_id, city_id=resolved_city_id)
    return SmartViewCatalogResponse(
        city_id=resolved_city_id,
        views=[
            SmartViewCatalogEntryResponse(
                key=key,
                label=SMART_VIEW_META[key]["label"],
                description=SMART_VIEW_META[key]["description"],
                item_count=counts[key],
            )
            for key in SMART_VIEW_KEYS
        ],
        generated_at=utc_now_iso(),
    )


@app.get("/lists/default/smart-views/{view_key}", response_model=SmartViewResponse)
def get_default_list_smart_view(
    view_key: str,
    city_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
    origin_latitude: float | None = Query(default=None, ge=-90.0, le=90.0),
    origin_longitude: float | None = Query(default=None, ge=-180.0, le=180.0),
) -> SmartViewResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    resolved_city_id = _normalize_list_city(city_id)
    if view_key not in SMART_VIEW_KEYS:
        raise HTTPException(status_code=404, detail="Unknown smart view key")

    try:
        payload = list_smart_view_entries(
            DB_PATH,
            owner_id=owner_id,
            city_id=resolved_city_id,
            view_key=view_key,
            origin_latitude=origin_latitude,
            origin_longitude=origin_longitude,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    return _smart_view_response(city_id=resolved_city_id, view_key=view_key, payload=payload)


@app.get("/public/restaurants/{place_id}", response_model=PublicRestaurantDetail)
def public_restaurant_detail(place_id: str) -> dict[str, object]:
    _ensure_database()
    restaurant = get_public_restaurant_detail(DB_PATH, place_id)
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
