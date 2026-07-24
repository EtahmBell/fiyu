from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_FIELD_MASK = ",".join(
    [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "primaryTypeDisplayName",
        "rating",
        "userRatingCount",
        "priceLevel",
        "currentOpeningHours",
        "googleMapsUri",
    ]
)


def fetch_live_place_details(
    place_id: str,
    *,
    api_key: str | None = None,
    field_mask: str = DEFAULT_FIELD_MASK,
    language_code: str = "en",
) -> dict[str, object]:
    """Fetch live Google Place Details without writing the response to the database.

    The default mask intentionally omits reviews. Add `reviews` only on a detail view
    after reviewing Google's current pricing, display, attribution, and storage rules.
    """

    key = api_key or os.getenv("GOOGLE_PLACES_SERVER_KEY")
    if not key:
        raise RuntimeError("GOOGLE_PLACES_SERVER_KEY is missing")
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
        with urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Google Places returned HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Google Places request failed: {exc.reason}") from exc
