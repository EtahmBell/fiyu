from __future__ import annotations

import json
import os
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

DEFAULT_TIMEOUT_SECONDS = 10.0
PHOTO_FIELD_MASK = "photos,googleMapsUri"
AUTOCOMPLETE_FIELD_MASK = (
    "suggestions.placePrediction.placeId,"
    "suggestions.placePrediction.structuredFormat"
)
AUTOCOMPLETE_TIMEOUT_SECONDS = 5.0


class GooglePlacesError(Exception):
    """Base exception for safe API-layer provider error mapping."""


class GooglePlacesConfigurationError(GooglePlacesError):
    pass


class GooglePlacesProviderError(GooglePlacesError):
    pass


class GooglePlacesTimeoutError(GooglePlacesError):
    pass


class GooglePlacesNoPhotosError(GooglePlacesError):
    pass


def _request_json(
    url: str, *, api_key: str | None, timeout: float, field_mask: str | None = None
) -> dict[str, object]:
    key = api_key or os.getenv("GOOGLE_PLACES_SERVER_KEY")
    if not key:
        raise GooglePlacesConfigurationError("Google Places server key is not configured")
    headers = {"X-Goog-Api-Key": key, "Accept": "application/json"}
    if field_mask:
        headers["X-Goog-FieldMask"] = field_mask
    request = Request(url, headers=headers, method="GET")
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


def _post_json(
    url: str,
    payload: dict[str, object],
    *,
    api_key: str | None,
    timeout: float,
    field_mask: str | None = None,
) -> dict[str, object]:
    key = api_key or os.getenv("GOOGLE_PLACES_SERVER_KEY")
    if not key:
        raise GooglePlacesConfigurationError("Google Places server key is not configured")
    headers = {
        "X-Goog-Api-Key": key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if field_mask:
        headers["X-Goog-FieldMask"] = field_mask
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            parsed = json.loads(response.read().decode("utf-8"))
            if not isinstance(parsed, dict):
                raise GooglePlacesProviderError("Google Places returned a non-object response")
            return parsed
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


def get_place_suggestions(
    name: str,
    address: str,
    *,
    session_token: str,
    api_key: str | None = None,
    timeout: float = AUTOCOMPLETE_TIMEOUT_SECONDS,
) -> list[dict[str, str | None]]:
    """Return identity-safe Kanto restaurant suggestions without fetching details."""

    query = f"{name.strip()} {address.strip()}".strip()
    if not name.strip() or not address.strip():
        raise ValueError("name and address are required")
    payload: dict[str, object] = {
        "input": query,
        "includedRegionCodes": ["jp"],
        "languageCode": "ja",
        "regionCode": "jp",
        "sessionToken": session_token,
        "locationRestriction": {
            "rectangle": {
                "low": {"latitude": 34.8, "longitude": 138.3},
                "high": {"latitude": 36.5, "longitude": 141.0},
            }
        },
    }
    response = _post_json(
        "https://places.googleapis.com/v1/places:autocomplete",
        payload,
        api_key=api_key,
        timeout=timeout,
        field_mask=AUTOCOMPLETE_FIELD_MASK,
    )
    suggestions = response.get("suggestions", [])
    if not isinstance(suggestions, list):
        raise GooglePlacesProviderError("Google Places returned malformed suggestions")
    normalized: list[dict[str, str | None]] = []
    for suggestion in suggestions:
        if not isinstance(suggestion, dict):
            continue
        prediction = suggestion.get("placePrediction")
        if not isinstance(prediction, dict):
            continue
        place_id = prediction.get("placeId")
        structured = prediction.get("structuredFormat")
        if not isinstance(place_id, str) or not isinstance(structured, dict):
            continue
        main = structured.get("mainText")
        secondary = structured.get("secondaryText")
        primary_text = main.get("text") if isinstance(main, dict) else None
        secondary_text = secondary.get("text") if isinstance(secondary, dict) else None
        if not isinstance(primary_text, str) or not primary_text.strip():
            continue
        normalized.append(
            {
                "external_place_id": place_id,
                "primary_text": primary_text,
                "secondary_text": secondary_text if isinstance(secondary_text, str) else None,
            }
        )
    return normalized


def fetch_photo_metadata(
    place_id: str,
    *,
    api_key: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, object]:
    """Fetch fresh photo resource metadata. The result is never persisted by Fiyu."""

    if not place_id.strip():
        raise ValueError("place_id cannot be blank")
    url = f"https://places.googleapis.com/v1/places/{quote(place_id, safe='')}"
    return _request_json(
        url, api_key=api_key, timeout=timeout, field_mask=PHOTO_FIELD_MASK
    )


def fetch_photo_media(
    resource_name: str,
    *,
    max_width_px: int = 1200,
    api_key: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    if not resource_name.startswith("places/") or "/photos/" not in resource_name:
        raise GooglePlacesProviderError("Google Places returned a malformed photo resource")
    url = (
        f"https://places.googleapis.com/v1/{quote(resource_name, safe='/')}/media"
        f"?maxWidthPx={max_width_px}&skipHttpRedirect=true"
    )
    payload = _request_json(url, api_key=api_key, timeout=timeout)
    media_url = payload.get("photoUri")
    if not isinstance(media_url, str) or not media_url.startswith("https://"):
        raise GooglePlacesProviderError("Google Places returned a malformed photo response")
    return media_url


def normalize_photo_metadata(payload: dict[str, object]) -> list[dict[str, object]]:
    photos = payload.get("photos")
    if photos is None:
        return []
    if not isinstance(photos, list):
        raise GooglePlacesProviderError("Google Places returned malformed photos")
    google_maps_uri = payload.get("googleMapsUri")
    if google_maps_uri is not None and not isinstance(google_maps_uri, str):
        raise GooglePlacesProviderError("Google Places returned a malformed source link")
    normalized = []
    for photo in photos:
        if not isinstance(photo, dict):
            raise GooglePlacesProviderError("Google Places returned a malformed photo")
        name = photo.get("name")
        width = photo.get("widthPx")
        height = photo.get("heightPx")
        authors = photo.get("authorAttributions", [])
        if (
            not isinstance(name, str)
            or not isinstance(width, int)
            or not isinstance(height, int)
            or not isinstance(authors, list)
        ):
            raise GooglePlacesProviderError("Google Places returned incomplete photo metadata")
        clean_authors = []
        for author in authors:
            if not isinstance(author, dict):
                raise GooglePlacesProviderError("Google Places returned malformed attribution")
            for field in ("displayName", "uri", "photoUri", "flagContentUri"):
                if author.get(field) is not None and not isinstance(author[field], str):
                    raise GooglePlacesProviderError(
                        "Google Places returned malformed attribution"
                    )
        if photo.get("flagContentUri") is not None and not isinstance(
            photo["flagContentUri"], str
        ):
            raise GooglePlacesProviderError("Google Places returned malformed photo metadata")
        for author in authors:
            clean_authors.append(
                {
                    "display_name": author.get("displayName"),
                    "uri": author.get("uri"),
                    "photo_uri": author.get("photoUri"),
                    "flag_content_uri": author.get("flagContentUri"),
                }
            )
        normalized.append(
            {
                "resource_name": name,
                "width": width,
                "height": height,
                "author_attributions": clean_authors,
                "google_maps_uri": google_maps_uri,
                "flag_content_uri": photo.get("flagContentUri"),
            }
        )
    return normalized


def get_place_photos(
    place_id: str,
    *,
    limit: int,
    api_key: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> list[dict[str, object]]:
    metadata = normalize_photo_metadata(
        fetch_photo_metadata(place_id, api_key=api_key, timeout=timeout)
    )
    if not metadata:
        raise GooglePlacesNoPhotosError("Google Places returned no photos")
    results = []
    for photo in metadata[:limit]:
        resource_name = str(photo.pop("resource_name"))
        photo["media_url"] = fetch_photo_media(
            resource_name, api_key=api_key, timeout=timeout
        )
        results.append(photo)
    return results
