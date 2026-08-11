from __future__ import annotations

import logging
import os
import re
import secrets
from collections.abc import Iterable
from datetime import UTC, date, datetime
from math import cos, isfinite, radians
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from . import supabase_user_data as shared_user_data
from .account_deletion import delete_local_account_data
from .daily_picks import (
    InsufficientUnseenPoolError,
    assign_daily_picks,
    seed_served_history,
    served_place_ids,
)
from .database import connect, decode_restaurant_row
from .discovery_location import (
    TOKYO_SERVICE_AREA,
    can_change_location_freely,
    nearest_tokyo_anchor,
)
from .entitlements import (
    CAPABILITY_CUSTOM_LISTS,
    CAPABILITY_PREMIUM_SMART_VIEWS,
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
from .restaurant_visits import (
    create_visit,
    delete_visit,
    get_visit,
    list_visits,
    update_visit,
)
from .smart_views import (
    SMART_VIEW_KEYS,
    SMART_VIEW_META,
    list_available_smart_view_keys,
    list_smart_view_counts,
    list_smart_view_entries,
    smart_view_definition,
    utc_now_iso,
)
from .supabase_auth import (
    SupabaseAuthError,
    SupabaseConfigurationError,
    authenticated_supabase_user,
    sign_in_with_supabase,
    sign_up_with_supabase,
)
from .user_accounts import (
    create_contact_submission,
    ensure_account_schema,
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
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)


@app.exception_handler(shared_user_data.SharedUserDataError)
async def shared_user_data_unavailable(
    _request: Request, _error: shared_user_data.SharedUserDataError
) -> JSONResponse:
    logger.exception("Authenticated account storage request failed")
    return JSONResponse(status_code=503, content={"detail": "Account data is unavailable"})


@app.exception_handler(shared_user_data.SharedUserDataConflict)
async def shared_user_data_conflict(
    _request: Request, _error: shared_user_data.SharedUserDataConflict
) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": "Username is unavailable"})


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


class DiscoveryLocationResponse(BaseModel):
    configured: bool
    location_mode: Literal["current", "preview", "manual"] | None = None
    discovery_latitude: float | None = None
    discovery_longitude: float | None = None
    discovery_label: str | None = None
    arrival_date: date | None = None
    last_location_check_at: datetime | None = None
    updated_at: datetime | None = None
    can_change_location_freely: bool = False


class CheckCurrentLocationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CurrentLocationCheckResponse(BaseModel):
    inside_service_area: bool
    location: DiscoveryLocationResponse


class SaveManualLocationRequest(BaseModel):
    location_mode: Literal["preview", "manual"]
    discovery_label: str = Field(min_length=1, max_length=120)
    discovery_latitude: float = Field(ge=-90, le=90)
    discovery_longitude: float = Field(ge=-180, le=180)
    arrival_date: date | None = None


class SavedRestaurantSummary(BaseModel):
    place_id: str
    name_ja: str | None = None
    name_en: str | None = None
    primary_category: str | None = None
    neighborhood: str | None = None
    fiyu_score: float | None = None
    score_band: str | None = None


class CreateVisitRequest(BaseModel):
    place_id: str = Field(min_length=1, max_length=256)
    visited_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    reaction: Literal["love_it", "like_it", "not_for_me"]
    private_note: str | None = Field(default=None, max_length=2000)

    @field_validator("visited_at")
    @classmethod
    def validate_visited_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("visited_at must include a timezone")
        return value

    @field_validator("place_id")
    @classmethod
    def normalize_place_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("place_id is required")
        return value

    @field_validator("private_note")
    @classmethod
    def normalize_private_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class UpdateVisitRequest(BaseModel):
    visited_at: datetime | None = None
    reaction: Literal["love_it", "like_it", "not_for_me"] | None = None
    private_note: str | None = Field(default=None, max_length=2000)

    @field_validator("visited_at")
    @classmethod
    def validate_visited_at(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("visited_at must include a timezone")
        return value

    @field_validator("private_note")
    @classmethod
    def normalize_private_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class RestaurantVisitResponse(BaseModel):
    id: str
    place_id: str
    visited_at: str
    reaction: Literal["love_it", "like_it", "not_for_me"] | None = None
    private_note: str | None = None
    created_at: str
    updated_at: str
    restaurant: SavedRestaurantSummary


class DeleteVisitResponse(BaseModel):
    deleted: bool


USERNAME_PATTERN = re.compile(r"^[a-z0-9_]{3,30}$")
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")


def _normalized_username(value: str) -> str:
    normalized = value.strip().lower().removeprefix("@")
    if not USERNAME_PATTERN.fullmatch(normalized):
        raise ValueError("username must use 3-30 letters, numbers, or underscores")
    return normalized


def _normalized_email(value: str) -> str:
    normalized = value.strip().lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("valid email is required")
    return normalized


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=320)
    message: str = Field(min_length=1, max_length=4000)

    @field_validator("name", "message")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("field is required")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalized_email(value)


class ContactResponse(BaseModel):
    id: str
    status: Literal["new"]
    created_at: str


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)
    username: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalized_email(value)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return _normalized_username(value)


class AuthSessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int | None = None
    token_type: str | None = None


class SignupResponse(BaseModel):
    status: Literal["authenticated", "verification_required"]
    user_id: str
    email: str
    username: str
    session: AuthSessionResponse | None = None
    email_verification_required: bool


class SigninRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        normalized = value.strip()
        if EMAIL_PATTERN.fullmatch(normalized.lower()):
            return normalized.lower()
        return _normalized_username(normalized)


class SigninResponse(BaseModel):
    user_id: str
    session: AuthSessionResponse


class DeleteAccountResponse(BaseModel):
    deleted: Literal[True]


class UserProfileResponse(BaseModel):
    user_id: str
    username: str
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    created_at: str
    updated_at: str


class UpdateUserProfileRequest(BaseModel):
    username: str
    display_name: str | None = Field(default=None, max_length=50)
    bio: str | None = Field(default=None, max_length=160)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return _normalized_username(value)

    @field_validator("display_name", "bio")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class UpdateUserAvatarRequest(BaseModel):
    avatar_url: str | None = Field(default=None, max_length=2048)

    @field_validator("avatar_url")
    @classmethod
    def normalize_avatar_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


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


class DailyPickAssignmentRequest(BaseModel):
    city_id: str = Field(min_length=1, max_length=64)
    candidate_place_ids: list[str] = Field(min_length=3, max_length=200)
    legacy_served_place_ids: list[str] = Field(default_factory=list, max_length=500)
    categories: list[
        Literal["sushi", "izakaya", "noodles", "yakiniku", "yakitori", "tempura"]
    ] = Field(default_factory=list, max_length=3)
    non_japanese: Literal["yes", "occasionally", "japanese-only"] = "occasionally"
    active_area: str | None = Field(default=None, max_length=120)
    discovery_latitude: float | None = Field(default=None, ge=-90, le=90)
    discovery_longitude: float | None = Field(default=None, ge=-180, le=180)
    seed: int
    requested_count: Literal[3] = 3


class DailyPickAssignmentResponse(BaseModel):
    round_id: str
    city_id: str
    place_ids: list[str]
    assigned_at: str


class SeenRestaurantsResponse(BaseModel):
    place_ids: list[str]


NotificationType = Literal[
    "picks_ready",
    "smart_list_ready",
    "new_drop",
    "early_access_unlocked",
    "trip_reminder",
]


class UserNotificationResponse(BaseModel):
    id: UUID
    type: NotificationType
    title: str
    body: str
    target_url: str | None = None
    metadata: dict[str, object] | None = None
    created_at: datetime
    read_at: datetime | None = None


class MarkAllNotificationsReadResponse(BaseModel):
    updated: int


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
    tier: str
    collection_type: str
    required_capability: str | None = None
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
    tier: str
    collection_type: str
    required_capability: str | None = None
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


class OwnerIdentity(str):
    authenticated: bool

    def __new__(cls, value: str, *, authenticated: bool):
        instance = super().__new__(cls, value)
        instance.authenticated = authenticated
        return instance


def _owner_id_from_header(
    x_fiyu_client_id: Annotated[str | None, Header(alias="X-Fiyu-Client-Id")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if authorization:
        return OwnerIdentity(_authenticated_user_id(authorization), authenticated=True)
    if x_fiyu_client_id is None:
        raise HTTPException(status_code=400, detail="Missing X-Fiyu-Client-Id header")
    value = x_fiyu_client_id.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Missing X-Fiyu-Client-Id header")
    try:
        return OwnerIdentity(str(UUID(value)), authenticated=False)
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


def _catalog_enriched(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    if not rows:
        return []
    place_ids = list(dict.fromkeys(str(row["place_id"]) for row in rows))
    placeholders = ",".join("?" for _ in place_ids)
    with connect(DB_PATH) as connection:
        catalog_rows = connection.execute(
            f"""
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
                   r.neighborhood, p.fiyu_score, p.score_band
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.place_id IN ({placeholders})
            """,
            place_ids,
        ).fetchall()
    catalog = {str(row["place_id"]): dict(row) for row in catalog_rows}
    return [{**row, **catalog.get(str(row["place_id"]), {})} for row in rows]


def _items_for_list(owner_id: str, list_id: int) -> list[dict[str, object]]:
    if _shared_owner(owner_id):
        return _catalog_enriched(
            shared_user_data.list_items(user_id=str(owner_id), list_id=list_id)
        )
    return list_items(DB_PATH, list_id=list_id)


def _default_list_row(owner_id: str, city_id: str) -> dict[str, object]:
    if _shared_owner(owner_id):
        return shared_user_data.get_or_create_default_list(
            user_id=str(owner_id), city_id=city_id
        )
    return get_or_create_default_list(DB_PATH, owner_id=owner_id, city_id=city_id)


def _default_list_response(owner_id: str, city_id: str) -> RestaurantListResponse:
    row = _default_list_row(owner_id, city_id)
    items = _items_for_list(owner_id, int(row["id"]))
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


def _visit_response_from_row(row: dict[str, object]) -> RestaurantVisitResponse:
    return RestaurantVisitResponse(
        id=str(row["id"]),
        place_id=str(row["place_id"]),
        visited_at=str(row["visited_at"]),
        reaction=row.get("reaction"),
        private_note=str(row["private_note"]) if row.get("private_note") is not None else None,
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
        restaurant=SavedRestaurantSummary(
            place_id=str(row["place_id"]),
            name_ja=row.get("name_ja"),
            name_en=row.get("name_en"),
            primary_category=row.get("primary_category"),
            neighborhood=row.get("neighborhood"),
            fiyu_score=row.get("fiyu_score"),
            score_band=row.get("score_band"),
        ),
    )


def _list_response_from_row(owner_id: str, row: dict[str, object]) -> RestaurantListResponse:
    items = _items_for_list(owner_id, int(row["id"]))
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


def _list_summary_response_from_row(
    owner_id: str, row: dict[str, object]
) -> RestaurantListSummaryResponse:
    return RestaurantListSummaryResponse(
        list_id=int(row["id"]),
        city_id=str(row["city_id"]),
        name=str(row["name"]),
        list_kind=str(row["list_kind"]),
        item_count=(
            len(_items_for_list(owner_id, int(row["id"])))
            if _shared_owner(owner_id)
            else count_items(DB_PATH, list_id=int(row["id"]))
        ),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def _owned_list_or_404(owner_id: str, list_id: int) -> dict[str, object]:
    row = (
        shared_user_data.get_list(user_id=str(owner_id), list_id=list_id)
        if _shared_owner(owner_id)
        else get_list_by_id(DB_PATH, owner_id=owner_id, list_id=list_id)
    )
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

    definition = smart_view_definition(view_key)
    meta = SMART_VIEW_META[view_key]
    return SmartViewResponse(
        city_id=city_id,
        view_key=view_key,
        label=meta["label"],
        description=meta["description"],
        tier=definition.tier,
        collection_type=definition.collection_type,
        required_capability=definition.required_capability,
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


@app.post("/daily-picks/assign", response_model=DailyPickAssignmentResponse)
def create_daily_pick_assignment(
    request: DailyPickAssignmentRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> DailyPickAssignmentResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    city_id = _normalize_list_city(request.city_id)
    authenticated_owner = _shared_owner(owner_id)
    shared_seen = (
        shared_user_data.seen_place_ids(user_id=str(owner_id)) if authenticated_owner else []
    )
    # Browser history is only an anonymous-client compatibility input. Once an
    # account is authenticated, Supabase is authoritative for what was surfaced.
    legacy_served_place_ids = [] if authenticated_owner else request.legacy_served_place_ids
    seed_served_history(
        DB_PATH,
        owner_id=owner_id,
        place_ids=[*shared_seen, *legacy_served_place_ids],
    )
    active_area = request.active_area
    discovery_latitude = request.discovery_latitude
    discovery_longitude = request.discovery_longitude
    if _shared_owner(owner_id):
        saved_location = shared_user_data.get_discovery_location(user_id=str(owner_id))
        if saved_location and saved_location.get("location_mode"):
            active_area = str(saved_location["discovery_label"])
            discovery_latitude = float(saved_location["discovery_latitude"])
            discovery_longitude = float(saved_location["discovery_longitude"])
    try:
        assignment = assign_daily_picks(
            DB_PATH,
            owner_id=owner_id,
            city_id=city_id,
            candidate_place_ids=request.candidate_place_ids,
            categories=request.categories,
            non_japanese=request.non_japanese,
            active_area=active_area,
            discovery_latitude=discovery_latitude,
            discovery_longitude=discovery_longitude,
            seed=request.seed,
            requested_count=request.requested_count,
        )
    except InsufficientUnseenPoolError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "insufficient_unseen_pool",
                "message": "Not enough unseen restaurants are available for a new daily selection.",
                "available_count": exc.available_count,
                "required_count": exc.required_count,
            },
        ) from None

    if authenticated_owner:
        shared_user_data.record_seen(
            user_id=str(owner_id),
            place_ids=list(assignment.place_ids),
        )
    return DailyPickAssignmentResponse(
        round_id=assignment.round_id,
        city_id=city_id,
        place_ids=list(assignment.place_ids),
        assigned_at=assignment.assigned_at,
    )


@app.get("/seen/restaurants", response_model=SeenRestaurantsResponse)
def get_seen_restaurants(
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> SeenRestaurantsResponse:
    _ensure_database()
    place_ids = (
        shared_user_data.seen_place_ids(user_id=str(owner_id))
        if _shared_owner(owner_id)
        else served_place_ids(DB_PATH, owner_id=owner_id)
    )
    return SeenRestaurantsResponse(place_ids=place_ids)


@app.get("/map/restaurants", response_model=list[PublicRestaurantSummary])
def get_map_restaurants(
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> list[dict[str, object]]:
    """Join one owner's surfaced history to the current public-safe catalog."""
    _ensure_database()
    if isinstance(owner_id, OwnerIdentity) and owner_id.authenticated:
        if not shared_user_data.configured():
            raise HTTPException(
                status_code=503,
                detail="Authenticated restaurant history is not configured",
            )
        place_ids = shared_user_data.seen_place_ids(user_id=str(owner_id))
    else:
        place_ids = served_place_ids(DB_PATH, owner_id=owner_id)
    if not place_ids:
        return []
    return _map_eligible_public_restaurants_for_place_ids(place_ids)


def _public_restaurants_for_place_ids(place_ids: Iterable[str]) -> list[dict[str, object]]:
    restaurants: list[dict[str, object]] = []
    for place_id in place_ids:
        restaurant = get_public_restaurant(DB_PATH, place_id)
        if restaurant is not None:
            restaurants.append(restaurant)
    return restaurants


def _map_eligible_public_restaurants_for_place_ids(
    place_ids: Iterable[str],
) -> list[dict[str, object]]:
    """Return only seen restaurants that are safe and usable as map markers."""
    restaurants: list[dict[str, object]] = []
    for restaurant in _public_restaurants_for_place_ids(place_ids):
        latitude = restaurant.get("latitude")
        longitude = restaurant.get("longitude")
        if (
            restaurant.get("map_display_eligible") is True
            and isinstance(latitude, (int, float))
            and isinstance(longitude, (int, float))
            and isfinite(latitude)
            and isfinite(longitude)
        ):
            restaurants.append(restaurant)
    return restaurants


def _shared_owner(owner_id: str) -> bool:
    return (
        isinstance(owner_id, OwnerIdentity)
        and owner_id.authenticated
        and shared_user_data.configured()
    )


def _authenticated_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    try:
        return authenticated_supabase_user(authorization)
    except SupabaseConfigurationError:
        raise HTTPException(status_code=503, detail="Authentication is not configured") from None
    except SupabaseAuthError:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from None


def _authenticated_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    return str(_authenticated_user(authorization)["id"])


@app.get("/profiles/me/map-restaurants", response_model=list[PublicRestaurantSummary])
def get_authenticated_map_restaurants(
    user_id: Annotated[str, Depends(_authenticated_user_id)],
) -> list[dict[str, object]]:
    """Intersect the authenticated account's seen history with map eligibility."""
    _ensure_database()
    logger.warning("MAP AUTH USER: %s", user_id)
    logger.warning(
        "MAP SEEN SOURCE: supabase_user_data.seen_place_ids -> "
        "fiyu_restaurant_seen (PostgREST, authenticated user_id filter)"
    )
    seen_place_ids = shared_user_data.seen_place_ids(user_id=user_id)
    logger.warning("MAP SEEN IDS: %s", seen_place_ids)
    if not seen_place_ids:
        logger.warning("MAP RESPONSE IDS: []")
        return []
    restaurants = _map_eligible_public_restaurants_for_place_ids(seen_place_ids)
    logger.warning(
        "MAP RESPONSE IDS: %s",
        [restaurant.get("place_id") for restaurant in restaurants],
    )
    return restaurants


@app.get("/notifications", response_model=list[UserNotificationResponse])
def list_user_notifications(
    user_id: Annotated[str, Depends(_authenticated_user_id)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[dict[str, object]]:
    return shared_user_data.list_notifications(user_id=user_id, limit=limit)


@app.patch("/notifications/read-all", response_model=MarkAllNotificationsReadResponse)
def mark_all_user_notifications_read(
    user_id: Annotated[str, Depends(_authenticated_user_id)],
) -> MarkAllNotificationsReadResponse:
    return MarkAllNotificationsReadResponse(
        updated=shared_user_data.mark_all_notifications_read(user_id=user_id)
    )


@app.patch("/notifications/{notification_id}/read", response_model=UserNotificationResponse)
def mark_user_notification_read(
    notification_id: UUID,
    user_id: Annotated[str, Depends(_authenticated_user_id)],
) -> dict[str, object]:
    notification = shared_user_data.mark_notification_read(
        user_id=user_id,
        notification_id=str(notification_id),
    )
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


def _require_admin_access(
    x_fiyu_admin_key: Annotated[str | None, Header(alias="X-Fiyu-Admin-Key")] = None,
) -> None:
    configured_key = os.getenv("FIYU_ADMIN_API_KEY", "").strip()
    if not configured_key:
        raise HTTPException(status_code=404, detail="Not found")
    supplied_key = (x_fiyu_admin_key or "").strip()
    if not supplied_key or not secrets.compare_digest(supplied_key, configured_key):
        raise HTTPException(status_code=403, detail="Admin access required")


def _profile_response(row: dict[str, object]) -> UserProfileResponse:
    return UserProfileResponse(
        user_id=str(row["user_id"]),
        username=str(row["username"] or ""),
        display_name=str(row["display_name"]) if row.get("display_name") is not None else None,
        bio=str(row["bio"]) if row.get("bio") is not None else None,
        avatar_url=str(row["avatar_url"]) if row.get("avatar_url") is not None else None,
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def _validated_avatar_url(*, user_id: str, avatar_url: str | None) -> str | None:
    if avatar_url is None:
        return None
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not supabase_url:
        raise HTTPException(status_code=503, detail="Avatar storage is not configured")
    supplied = urlsplit(avatar_url)
    canonical_supplied = urlunsplit((supplied.scheme, supplied.netloc, supplied.path, "", ""))
    expected = f"{supabase_url}/storage/v1/object/public/avatars/{user_id}/avatar.webp"
    if canonical_supplied != expected or supplied.fragment:
        raise HTTPException(status_code=422, detail="Invalid avatar reference")
    return avatar_url


def _auth_user(result: dict[str, object]) -> dict[str, object] | None:
    nested = result.get("user")
    if isinstance(nested, dict):
        return nested
    if "id" in result:
        return result
    return None


def _auth_session(result: dict[str, object]) -> AuthSessionResponse | None:
    nested = result.get("session")
    if isinstance(nested, dict):
        return AuthSessionResponse.model_validate(nested)
    if "access_token" in result and "refresh_token" in result:
        return AuthSessionResponse.model_validate(result)
    return None


def _profile_username_from_auth_user(
    user: dict[str, object], *, preferred_username: str | None = None
) -> str | None:
    raw_username: object = preferred_username
    if raw_username is None:
        metadata = user.get("user_metadata")
        raw_username = metadata.get("username") if isinstance(metadata, dict) else None
    if not isinstance(raw_username, str):
        return None
    try:
        return _normalized_username(raw_username)
    except ValueError:
        return None


def _ensure_authenticated_profile(
    user: dict[str, object],
    *,
    preferred_username: str | None = None,
    auth_email: str | None = None,
) -> dict[str, object]:
    try:
        user_id = str(UUID(str(user["id"])))
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=502, detail="Authentication provider returned an invalid response"
        ) from None
    if not shared_user_data.configured():
        raise shared_user_data.SharedUserDataError(
            "Authenticated profile storage is not configured"
        )
    email_value = auth_email or (
        str(user["email"]).strip().lower() if user.get("email") else None
    )
    return shared_user_data.ensure_profile(
        user_id=user_id,
        username=_profile_username_from_auth_user(
            user, preferred_username=preferred_username
        ),
        auth_email=email_value,
    )


def _auth_user_subject(user: dict[str, object]) -> str:
    try:
        return str(UUID(str(user["id"])))
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=502, detail="Authentication provider returned an invalid response"
        ) from None


def _location_response(row: dict[str, object] | None) -> DiscoveryLocationResponse:
    return DiscoveryLocationResponse(
        configured=bool(row and row.get("location_mode")),
        location_mode=row.get("location_mode") if row else None,
        discovery_latitude=row.get("discovery_latitude") if row else None,
        discovery_longitude=row.get("discovery_longitude") if row else None,
        discovery_label=row.get("discovery_label") if row else None,
        arrival_date=row.get("arrival_date") if row else None,
        last_location_check_at=row.get("last_location_check_at") if row else None,
        updated_at=row.get("updated_at") if row else None,
        can_change_location_freely=can_change_location_freely(()),
    )


def _provision_profile_after_signin(
    *,
    user: dict[str, object],
    user_id: str,
    auth_email: str,
) -> None:
    ensured = _ensure_authenticated_profile(user, auth_email=auth_email)
    if str(ensured["user_id"]) != user_id:
        raise shared_user_data.SharedUserDataError("Profile ownership mismatch")


@app.post("/contact", response_model=ContactResponse, status_code=201)
def submit_contact(payload: ContactRequest) -> ContactResponse:
    _ensure_database()
    row = create_contact_submission(
        DB_PATH,
        name=payload.name,
        email=payload.email,
        message=payload.message,
    )
    return ContactResponse(**row)


@app.post("/auth/signup", response_model=SignupResponse, status_code=201)
def signup(payload: SignupRequest) -> SignupResponse:
    _ensure_database()
    ensure_account_schema(DB_PATH)
    if not shared_user_data.configured():
        raise shared_user_data.SharedUserDataError(
            "Authenticated profile storage is not configured"
        )
    available = shared_user_data.username_available(username=payload.username)
    if not available:
        raise HTTPException(status_code=409, detail="Username is unavailable")
    try:
        result = sign_up_with_supabase(
            email=payload.email,
            password=payload.password,
            username=payload.username,
        )
    except SupabaseConfigurationError:
        raise HTTPException(status_code=503, detail="Authentication is not configured") from None
    except SupabaseAuthError as exc:
        message = str(exc).lower()
        if "already" in message or "registered" in message:
            raise HTTPException(status_code=409, detail="An account already exists for this email") from None
        raise HTTPException(status_code=400, detail="Unable to create account") from None

    user = _auth_user(result)
    if user is None:
        raise HTTPException(status_code=502, detail="Authentication provider returned an invalid response")
    try:
        user_id = str(UUID(str(user["id"])))
    except (KeyError, ValueError):
        raise HTTPException(status_code=502, detail="Authentication provider returned an invalid response") from None
    email = str(user.get("email") or payload.email).strip().lower()
    profile = _ensure_authenticated_profile(
        user,
        preferred_username=payload.username,
        auth_email=email,
    )
    if profile is None:
        raise HTTPException(status_code=409, detail="Username is unavailable")

    session = _auth_session(result)
    return SignupResponse(
        status="verification_required" if session is None else "authenticated",
        user_id=user_id,
        email=email,
        username=payload.username,
        session=session,
        email_verification_required=session is None,
    )


@app.post("/auth/signin", response_model=SigninResponse)
def signin(payload: SigninRequest) -> SigninResponse:
    _ensure_database()
    ensure_account_schema(DB_PATH)
    if not shared_user_data.configured():
        raise shared_user_data.SharedUserDataError(
            "Authenticated profile storage is not configured"
        )
    if EMAIL_PATTERN.fullmatch(payload.identifier):
        auth_email = payload.identifier
    else:
        auth_email = shared_user_data.resolve_auth_email(username=payload.identifier)
        if auth_email is None:
            raise HTTPException(
                status_code=401,
                detail="Incorrect email/username or password.",
            )
    try:
        result = sign_in_with_supabase(email=auth_email, password=payload.password)
    except SupabaseConfigurationError:
        raise HTTPException(status_code=503, detail="Authentication is not configured") from None
    except SupabaseAuthError as exc:
        message = str(exc).lower()
        if "confirm" in message or "verif" in message:
            raise HTTPException(
                status_code=403,
                detail="Please verify your email before signing in. Check your inbox for the verification link.",
            ) from None
        raise HTTPException(
            status_code=401,
            detail="Incorrect email/username or password.",
        ) from None

    user = _auth_user(result)
    session = _auth_session(result)
    if user is None or session is None:
        raise HTTPException(status_code=401, detail="Incorrect email/username or password.")
    try:
        user_id = str(UUID(str(user["id"])))
    except (KeyError, ValueError):
        raise HTTPException(status_code=502, detail="Authentication provider returned an invalid response") from None
    signed_in_email = str(user.get("email") or auth_email).strip().lower()
    _provision_profile_after_signin(
        user=user,
        user_id=user_id,
        auth_email=signed_in_email,
    )
    return SigninResponse(user_id=user_id, session=session)


@app.get("/profiles/me", response_model=UserProfileResponse)
def get_my_profile(
    auth_user: Annotated[dict[str, object], Depends(_authenticated_user)],
) -> UserProfileResponse:
    _ensure_database()
    row = _ensure_authenticated_profile(auth_user)
    return _profile_response(row)


@app.patch("/profiles/me", response_model=UserProfileResponse)
def update_my_profile(
    payload: UpdateUserProfileRequest,
    auth_user: Annotated[dict[str, object], Depends(_authenticated_user)],
) -> UserProfileResponse:
    _ensure_database()
    existing = _ensure_authenticated_profile(auth_user)
    user_id = str(existing["user_id"])
    row = shared_user_data.update_profile(
        user_id=user_id,
        username=payload.username,
        display_name=payload.display_name,
        bio=payload.bio,
    )
    if row is None:
        raise HTTPException(status_code=409, detail="Username is unavailable")
    return _profile_response(row)


@app.patch("/profiles/me/avatar", response_model=UserProfileResponse)
def update_my_avatar(
    payload: UpdateUserAvatarRequest,
    auth_user: Annotated[dict[str, object], Depends(_authenticated_user)],
) -> UserProfileResponse:
    _ensure_database()
    existing = _ensure_authenticated_profile(auth_user)
    user_id = str(existing["user_id"])
    avatar_url = _validated_avatar_url(user_id=user_id, avatar_url=payload.avatar_url)
    row = shared_user_data.update_avatar(user_id=user_id, avatar_url=avatar_url)
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _profile_response(row)


@app.delete("/profiles/me/account", response_model=DeleteAccountResponse)
def delete_my_account(
    auth_user: Annotated[dict[str, object], Depends(_authenticated_user)],
) -> DeleteAccountResponse:
    """Permanently delete the verified user's non-cascading data and Auth user."""
    _ensure_database()
    user_id = _auth_user_subject(auth_user)
    try:
        local_deleted = delete_local_account_data(DB_PATH, user_id=user_id)
        avatar_deleted = shared_user_data.delete_avatar_object(user_id=user_id)
        shared_user_data.delete_auth_user(user_id=user_id)
    except Exception:
        logger.exception(
            "Account deletion failed for authenticated subject ending %s",
            user_id[-8:],
        )
        raise HTTPException(status_code=503, detail="Account could not be deleted") from None
    logger.info(
        "Account deletion completed for subject ending %s; avatar_deleted=%s; local_rows=%s",
        user_id[-8:],
        avatar_deleted,
        sum(local_deleted.values()),
    )
    return DeleteAccountResponse(deleted=True)


@app.get("/profiles/me/discovery-location", response_model=DiscoveryLocationResponse)
def get_my_discovery_location(
    auth_user: Annotated[dict[str, object], Depends(_authenticated_user)],
) -> DiscoveryLocationResponse:
    user_id = _auth_user_subject(auth_user)
    if not shared_user_data.configured():
        raise shared_user_data.SharedUserDataError("Discovery location storage is not configured")
    return _location_response(shared_user_data.get_discovery_location(user_id=user_id))


@app.post(
    "/profiles/me/discovery-location/check-current",
    response_model=CurrentLocationCheckResponse,
)
def check_my_current_location(
    payload: CheckCurrentLocationRequest,
    auth_user: Annotated[dict[str, object], Depends(_authenticated_user)],
) -> CurrentLocationCheckResponse:
    user_id = _auth_user_subject(auth_user)
    checked_at = datetime.now(UTC).isoformat()
    inside = TOKYO_SERVICE_AREA.contains(payload.latitude, payload.longitude)
    changes: dict[str, object] = {"last_location_check_at": checked_at}
    if inside:
        anchor = nearest_tokyo_anchor(payload.latitude, payload.longitude)
        changes.update(
            location_mode="current",
            discovery_latitude=payload.latitude,
            discovery_longitude=payload.longitude,
            discovery_label=anchor["area_name"],
            arrival_date=None,
        )
    row = shared_user_data.upsert_discovery_location(user_id=user_id, changes=changes)
    return CurrentLocationCheckResponse(
        inside_service_area=inside,
        location=_location_response(row),
    )


@app.put("/profiles/me/discovery-location", response_model=DiscoveryLocationResponse)
def save_my_manual_discovery_location(
    payload: SaveManualLocationRequest,
    auth_user: Annotated[dict[str, object], Depends(_authenticated_user)],
) -> DiscoveryLocationResponse:
    user_id = _auth_user_subject(auth_user)
    anchor = next(
        (
            item
            for item in load_location_anchors()
            if payload.discovery_label in {item["area_name"], item["display_name"]}
            and abs(float(item["latitude"]) - payload.discovery_latitude) < 0.000001
            and abs(float(item["longitude"]) - payload.discovery_longitude) < 0.000001
        ),
        None,
    )
    if anchor is None:
        raise HTTPException(status_code=422, detail="Choose a supported Tokyo area")
    row = shared_user_data.upsert_discovery_location(
        user_id=user_id,
        changes={
            "location_mode": payload.location_mode,
            "discovery_latitude": anchor["latitude"],
            "discovery_longitude": anchor["longitude"],
            "discovery_label": anchor["area_name"],
            "arrival_date": payload.arrival_date.isoformat() if payload.arrival_date else None,
        },
    )
    return _location_response(row)


@app.get("/log", response_model=list[RestaurantVisitResponse])
def get_restaurant_log(
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> list[RestaurantVisitResponse]:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    rows = (
        _catalog_enriched(shared_user_data.list_visits(user_id=str(owner_id)))
        if _shared_owner(owner_id)
        else list_visits(DB_PATH, owner_id=owner_id)
    )
    return [_visit_response_from_row(row) for row in rows]


@app.post("/log", response_model=RestaurantVisitResponse, status_code=201)
def create_restaurant_log_visit(
    payload: CreateVisitRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantVisitResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    if _shared_owner(owner_id):
        if get_published_restaurant_city(DB_PATH, place_id=payload.place_id) is None:
            raise HTTPException(status_code=404, detail="Published restaurant not found")
        row = _catalog_enriched([
            shared_user_data.create_visit(
                user_id=str(owner_id), place_id=payload.place_id,
                visited_at=payload.visited_at.astimezone(UTC).isoformat(),
                reaction=payload.reaction, private_note=payload.private_note,
            )
        ])[0]
    else:
        row = create_visit(
            DB_PATH, owner_id=owner_id, place_id=payload.place_id,
            visited_at=payload.visited_at.astimezone(UTC).isoformat(),
            reaction=payload.reaction, private_note=payload.private_note,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Published restaurant not found")
    return _visit_response_from_row(row)


@app.get("/log/{visit_id}", response_model=RestaurantVisitResponse)
def get_restaurant_log_visit(
    visit_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantVisitResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    row = (
        shared_user_data.get_visit(user_id=str(owner_id), visit_id=visit_id)
        if _shared_owner(owner_id)
        else get_visit(DB_PATH, owner_id=owner_id, visit_id=visit_id)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Visit not found")
    return _visit_response_from_row(_catalog_enriched([row])[0] if _shared_owner(owner_id) else row)


@app.patch("/log/{visit_id}", response_model=RestaurantVisitResponse)
def update_restaurant_log_visit(
    visit_id: str,
    payload: UpdateVisitRequest,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantVisitResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    update_visited_at = "visited_at" in payload.model_fields_set
    if update_visited_at and payload.visited_at is None:
        raise HTTPException(status_code=422, detail="visited_at cannot be null")
    update_reaction = "reaction" in payload.model_fields_set
    if update_reaction and payload.reaction is None:
        raise HTTPException(status_code=422, detail="reaction cannot be null")
    existing = (
        shared_user_data.get_visit(user_id=str(owner_id), visit_id=visit_id)
        if _shared_owner(owner_id)
        else get_visit(DB_PATH, owner_id=owner_id, visit_id=visit_id)
    )
    if existing is None:
        raise HTTPException(status_code=404, detail="Visit not found")
    if not update_reaction and existing.get("reaction") is None:
        raise HTTPException(status_code=422, detail="reaction is required")
    if _shared_owner(owner_id):
        changes: dict[str, object] = {}
        if update_visited_at:
            changes["visited_at"] = payload.visited_at.astimezone(UTC).isoformat()
        if update_reaction:
            changes["reaction"] = payload.reaction
        if "private_note" in payload.model_fields_set:
            changes["private_note"] = payload.private_note
        row = shared_user_data.update_visit(
            user_id=str(owner_id), visit_id=visit_id, changes=changes
        )
        if row is not None:
            row = _catalog_enriched([row])[0]
    else:
        row = update_visit(
            DB_PATH, owner_id=owner_id, visit_id=visit_id,
            visited_at=(payload.visited_at.astimezone(UTC).isoformat() if payload.visited_at is not None else None),
            reaction=payload.reaction, private_note=payload.private_note,
            update_visited_at=update_visited_at, update_reaction=update_reaction,
            update_private_note="private_note" in payload.model_fields_set,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Visit not found")
    return _visit_response_from_row(row)


@app.delete("/log/{visit_id}", response_model=DeleteVisitResponse)
def delete_restaurant_log_visit(
    visit_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> DeleteVisitResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    deleted = (
        shared_user_data.delete_visit(user_id=str(owner_id), visit_id=visit_id)
        if _shared_owner(owner_id)
        else delete_visit(DB_PATH, owner_id=owner_id, visit_id=visit_id)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Visit not found")
    return DeleteVisitResponse(deleted=True)


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
        _default_list_row(owner_id, resolved_city_id)

    rows = (
        shared_user_data.list_lists(
            user_id=str(owner_id),
            city_id=resolved_city_ids[0] if len(resolved_city_ids) == 1 else None,
        )
        if _shared_owner(owner_id)
        else list_lists_for_owner(
            DB_PATH,
            owner_id=owner_id,
            city_id=resolved_city_ids[0] if len(resolved_city_ids) == 1 else None,
        )
    )
    return RestaurantListCollectionResponse(
        lists=[_list_summary_response_from_row(owner_id, row) for row in rows],
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

    row = (
        shared_user_data.create_list(
            user_id=str(owner_id), city_id=resolved_city_id, name=name
        )
        if _shared_owner(owner_id)
        else create_custom_list(
            DB_PATH, owner_id=owner_id, city_id=resolved_city_id, name=name
        )
    )
    return _list_response_from_row(owner_id, row)


@app.get("/lists/{list_id:int}", response_model=RestaurantListResponse)
def get_list(
    list_id: int,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> RestaurantListResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    row = _owned_list_or_404(owner_id, list_id)
    return _list_response_from_row(owner_id, row)


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

    renamed = (
        shared_user_data.rename_list(
            user_id=str(owner_id), list_id=list_id, name=name
        )
        if _shared_owner(owner_id)
        else rename_list(DB_PATH, owner_id=owner_id, list_id=list_id, name=name)
    )
    if renamed is None:
        raise HTTPException(status_code=404, detail="List not found")
    return _list_response_from_row(owner_id, renamed)


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

    changed = (
        shared_user_data.delete_list(user_id=str(owner_id), list_id=list_id)
        if _shared_owner(owner_id)
        else delete_list(DB_PATH, owner_id=owner_id, list_id=list_id)
    )
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

    changed = (
        shared_user_data.add_item(
            user_id=str(owner_id), list_id=int(row["id"]), place_id=place_id
        )
        if _shared_owner(owner_id)
        else add_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    )
    latest = _owned_list_or_404(owner_id, list_id)
    return ListItemMutationResponse(
        list=_list_response_from_row(owner_id, latest), changed=changed
    )


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

    changed = (
        shared_user_data.remove_item(
            user_id=str(owner_id), list_id=int(row["id"]), place_id=place_id
        )
        if _shared_owner(owner_id)
        else remove_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    )
    latest = _owned_list_or_404(owner_id, list_id)
    return ListItemMutationResponse(
        list=_list_response_from_row(owner_id, latest), changed=changed
    )


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

    row = _default_list_row(owner_id, resolved_city_id)
    changed = (
        shared_user_data.add_item(
            user_id=str(owner_id), list_id=int(row["id"]), place_id=place_id
        )
        if _shared_owner(owner_id)
        else add_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    )
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

    row = _default_list_row(owner_id, resolved_city_id)
    changed = (
        shared_user_data.remove_item(
            user_id=str(owner_id), list_id=int(row["id"]), place_id=place_id
        )
        if _shared_owner(owner_id)
        else remove_item(DB_PATH, list_id=int(row["id"]), place_id=place_id)
    )
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
    row = _default_list_row(owner_id, resolved_city_id)
    if _shared_owner(owner_id):
        is_saved = any(
            item["place_id"] == place_id
            for item in shared_user_data.list_items(
                user_id=str(owner_id), list_id=int(row["id"])
            )
        )
    else:
        is_saved = contains_place_id(
            DB_PATH, list_id=int(row["id"]), place_id=place_id
        )
    return DefaultListMembershipResponse(
        list_id=int(row["id"]),
        city_id=resolved_city_id,
        place_id=place_id,
        is_saved=is_saved,
    )


@app.get("/lists/default/smart-views", response_model=SmartViewCatalogResponse)
def get_default_list_smart_view_catalog(
    city_id: str,
    owner_id: Annotated[str, Depends(_owner_id_from_header)],
) -> SmartViewCatalogResponse:
    _ensure_database()
    ensure_public_schema(DB_PATH)
    resolved_city_id = _normalize_list_city(city_id)
    capabilities = resolve_owner_capabilities(owner_id)
    available_keys = list_available_smart_view_keys(capabilities)
    counts = list_smart_view_counts(DB_PATH, owner_id=owner_id, city_id=resolved_city_id)
    return SmartViewCatalogResponse(
        city_id=resolved_city_id,
        views=[
            SmartViewCatalogEntryResponse(
                key=key,
                label=SMART_VIEW_META[key]["label"],
                description=SMART_VIEW_META[key]["description"],
                tier=smart_view_definition(key).tier,
                collection_type=smart_view_definition(key).collection_type,
                required_capability=smart_view_definition(key).required_capability,
                item_count=counts[key],
            )
            for key in available_keys
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
    definition = smart_view_definition(view_key)
    if definition.required_capability == CAPABILITY_PREMIUM_SMART_VIEWS:
        _require_owner_capability(owner_id, CAPABILITY_PREMIUM_SMART_VIEWS)

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
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/stats")
def stats(
    _admin: Annotated[None, Depends(_require_admin_access)],
) -> dict[str, object]:
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
def areas(
    _admin: Annotated[None, Depends(_require_admin_access)],
) -> list[dict[str, object]]:
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
    _admin: Annotated[None, Depends(_require_admin_access)],
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
    _admin: Annotated[None, Depends(_require_admin_access)],
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
    _admin: Annotated[None, Depends(_require_admin_access)],
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
def restaurant_detail(
    restaurant_id: int,
    _admin: Annotated[None, Depends(_require_admin_access)],
) -> dict[str, object]:
    _ensure_database()
    with connect(DB_PATH) as connection:
        row = connection.execute(
            "SELECT * FROM restaurants WHERE id = ?", (restaurant_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return decode_restaurant_row(row)
