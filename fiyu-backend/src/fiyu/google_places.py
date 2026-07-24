from __future__ import annotations

import json
import os
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

DEFAULT_FIELD_MASK = (
    "id,displayName,formattedAddress,location,primaryTypeDisplayName,rating,"
    "userRatingCount,priceLevel,currentOpeningHours,googleMapsUri"
)

DEFAULT_TIMEOUT_SECONDS = 10.0


class GooglePlacesError(Exception):
    """Base exception for safe API-layer provider error mapping."""


class GooglePlacesConfigurationError(GooglePlacesError):
    pass


class GooglePlacesProviderError(GooglePlacesError):
    pass


class GooglePlacesTimeoutError(GooglePlacesError):
    pass


def fetch_live_place_details(
    place_id: str,
    *,
    api_key: str | None = None,
    field_mask: str = DEFAULT_FIELD_MASK,
    language_code: str = "en",
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, object]:
    """Fetch live Google Place Details without writing the response to the database.

    The default mask intentionally omits reviews. Add `reviews` only on a detail view
    after reviewing Google's current pricing, display, attribution, and storage rules.
    """

    key = api_key or os.getenv("GOOGLE_PLACES_SERVER_KEY")
    if not key:
        raise GooglePlacesConfigurationError("Google Places server key is not configured")
    if not place_id.strip():
        raise ValueError("place_id cannot be blank")

    url = (
        f"https://places.googleapis.com/v1/places/{quote(place_id, safe='')}"
        f"?languageCode={quote(language_code, safe='')}"
    )
    request = Request(
        url,
        headers={
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": field_mask,
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict):
                raise GooglePlacesProviderError("Google Places returned a non-object response")
            return payload
    except HTTPError as exc:
        raise GooglePlacesProviderError(f"Google Places returned HTTP {exc.code}") from exc
    except URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            raise GooglePlacesTimeoutError("Google Places request timed out") from exc
        raise GooglePlacesProviderError("Google Places request failed") from exc
    except TimeoutError as exc:
        raise GooglePlacesTimeoutError("Google Places request timed out") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise GooglePlacesProviderError("Google Places returned an invalid response") from exc


def normalize_live_place_details(
    payload: dict[str, object], *, requested_place_id: str
) -> dict[str, object]:
    """Normalize Google Place Details into the frontend's stable response shape."""

    display_name = payload.get("displayName")
    location = payload.get("location")
    opening_hours = payload.get("currentOpeningHours")
    primary_type = payload.get("primaryTypeDisplayName")

    display_name = display_name if isinstance(display_name, dict) else {}
    location = location if isinstance(location, dict) else {}
    opening_hours = opening_hours if isinstance(opening_hours, dict) else {}
    primary_type = primary_type if isinstance(primary_type, dict) else {}
    weekday_hours = opening_hours.get("weekdayDescriptions")

    return {
        "place_id": str(payload.get("id") or requested_place_id),
        "name": str(display_name.get("text") or ""),
        "address": str(payload.get("formattedAddress") or ""),
        "latitude": float(location.get("latitude") or 0.0),
        "longitude": float(location.get("longitude") or 0.0),
        "rating": float(payload.get("rating") or 0.0),
        "rating_count": int(payload.get("userRatingCount") or 0),
        "price_level": payload.get("priceLevel"),
        "open_now": opening_hours.get("openNow"),
        "weekday_hours": weekday_hours if isinstance(weekday_hours, list) else [],
        "google_maps_uri": payload.get("googleMapsUri"),
        "primary_type": primary_type.get("text"),
    }
