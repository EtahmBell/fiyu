from __future__ import annotations

from datetime import datetime
from math import asin, cos, radians, sin, sqrt
import re
from urllib.parse import urlparse


NULL_STRINGS = {"", "none", "null", "nan", "n/a", "na", "undefined", "false"}


def clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.casefold() in NULL_STRINGS:
        return None
    return text


def parse_float(value: object) -> float | None:
    text = clean_text(value)
    if text is None:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def parse_int(value: object) -> int | None:
    number = parse_float(value)
    if number is None:
        return None
    return max(0, int(number))


def parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    text = clean_text(value)
    if text is None:
        return False
    return text.casefold() in {"1", "true", "yes", "y", "t"}


def parse_datetime(value: object) -> datetime | None:
    text = clean_text(value)
    if text is None:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return max(lower, min(upper, value))


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    text = value.casefold()
    text = re.sub(r"[\s\-–—_・･/\\|｜()（）\[\]【】]+", "", text)
    text = re.sub(r"[^0-9a-z\u3040-\u30ff\u3400-\u9fff]", "", text)
    return text


def domain_from_url(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    if not re.match(r"^[a-z][a-z0-9+.-]*://", candidate, flags=re.I):
        candidate = "https://" + candidate
    try:
        host = urlparse(candidate).hostname
    except ValueError:
        return None
    if not host:
        return None
    host = host.casefold()
    return host.removeprefix("www.")


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371.0088
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    d_phi = radians(lat2 - lat1)
    d_lambda = radians(lng2 - lng1)
    a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(a))
