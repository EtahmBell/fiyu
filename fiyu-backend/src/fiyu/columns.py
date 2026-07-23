from __future__ import annotations

from pathlib import Path
from typing import Mapping

from .utils import clean_text, parse_bool, parse_datetime, parse_float, parse_int


ALIASES: dict[str, tuple[str, ...]] = {
    "place_id": ("placeId", "place_id", "googlePlaceId"),
    "cid": ("cid",),
    "fid": ("fid",),
    "title": ("title", "name", "displayName"),
    "address": ("address", "formattedAddress"),
    "street": ("street",),
    "city": ("city",),
    "state": ("state",),
    "postal_code": ("postalCode", "postal_code"),
    "neighborhood": ("neighborhood",),
    "latitude": ("location/lat", "latitude", "lat", "location.lat"),
    "longitude": ("location/lng", "longitude", "lng", "lon", "location.lng"),
    "category": ("categoryName", "category", "primaryType"),
    "rating": ("totalScore", "rating", "score"),
    "review_count": ("reviewsCount", "reviewCount", "userRatingCount"),
    "website": ("website", "officialWebsite"),
    "phone": ("phone", "phoneUnformatted"),
    "price": ("price", "priceLevel"),
    "permanently_closed": ("permanentlyClosed", "permanently_closed"),
    "temporarily_closed": ("temporarilyClosed", "temporarily_closed"),
    "is_advertisement": ("isAdvertisement", "is_advertisement"),
    "maps_url": ("url", "googleMapsUri", "mapsUrl"),
    "image_url": ("imageUrl", "image_url"),
    "scraped_at": ("scrapedAt", "scraped_at"),
    "search_area": ("searchString", "search_string", "query", "locationQuery"),
    "language": ("language",),
    "country_code": ("countryCode", "country_code"),
}


def _get(row: Mapping[str, object], aliases: tuple[str, ...]) -> object:
    for alias in aliases:
        if alias in row:
            return row[alias]
    return None


def _collect_categories(row: Mapping[str, object]) -> list[str]:
    values: list[str] = []
    primary = clean_text(_get(row, ALIASES["category"]))
    if primary:
        values.append(primary)
    for key, value in row.items():
        if key.startswith("categories/"):
            text = clean_text(value)
            if text and text not in values:
                values.append(text)
    return values


def raw_record_from_row(row: Mapping[str, object], source_file: str) -> dict[str, object]:
    title = clean_text(_get(row, ALIASES["title"]))
    place_id = clean_text(_get(row, ALIASES["place_id"]))
    cid = clean_text(_get(row, ALIASES["cid"]))
    fid = clean_text(_get(row, ALIASES["fid"]))
    source_path = Path(source_file)
    search_area = (
        source_path.stem
        .replace("_", " ")
        .replace("-", " ")
        .strip()
    )

    return {
        "place_id": place_id,
        "cid": cid,
        "fid": fid,
        "title": title,
        "address": clean_text(_get(row, ALIASES["address"])),
        "street": clean_text(_get(row, ALIASES["street"])),
        "city": clean_text(_get(row, ALIASES["city"])),
        "state": clean_text(_get(row, ALIASES["state"])),
        "postal_code": clean_text(_get(row, ALIASES["postal_code"])),
        "neighborhood": clean_text(_get(row, ALIASES["neighborhood"])),
        "latitude": parse_float(_get(row, ALIASES["latitude"])),
        "longitude": parse_float(_get(row, ALIASES["longitude"])),
        "category": clean_text(_get(row, ALIASES["category"])),
        "categories": _collect_categories(row),
        "rating": parse_float(_get(row, ALIASES["rating"])),
        "review_count": parse_int(_get(row, ALIASES["review_count"])),
        "website": clean_text(_get(row, ALIASES["website"])),
        "phone": clean_text(_get(row, ALIASES["phone"])),
        "price": clean_text(_get(row, ALIASES["price"])),
        "permanently_closed": parse_bool(_get(row, ALIASES["permanently_closed"])),
        "temporarily_closed": parse_bool(_get(row, ALIASES["temporarily_closed"])),
        "is_advertisement": parse_bool(_get(row, ALIASES["is_advertisement"])),
        "maps_url": clean_text(_get(row, ALIASES["maps_url"])),
        "image_url": clean_text(_get(row, ALIASES["image_url"])),
        "scraped_at": parse_datetime(_get(row, ALIASES["scraped_at"])),
        "search_area": search_area,
        "source_file": source_path.name,
        "language": clean_text(_get(row, ALIASES["language"])),
        "country_code": clean_text(_get(row, ALIASES["country_code"])),
    }
