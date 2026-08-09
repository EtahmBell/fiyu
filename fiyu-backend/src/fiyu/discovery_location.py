from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .location_anchors import load_location_anchors
from .utils import haversine_km


@dataclass(frozen=True)
class ServiceArea:
    city_id: str
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float

    def contains(self, latitude: float, longitude: float) -> bool:
        return (
            self.min_latitude <= latitude <= self.max_latitude
            and self.min_longitude <= longitude <= self.max_longitude
        )


# Location V1 supports the central Tokyo discovery area covered by the curated catalog.
# Keep this server-side so clients cannot drift onto different boundary definitions.
TOKYO_SERVICE_AREA = ServiceArea(
    city_id="tokyo",
    min_latitude=35.50,
    max_latitude=35.85,
    min_longitude=139.45,
    max_longitude=139.95,
)


def nearest_tokyo_anchor(latitude: float, longitude: float) -> dict[str, object]:
    anchors = load_location_anchors()
    if not anchors:
        raise RuntimeError("No reviewed Tokyo location anchors are configured")
    return min(
        anchors,
        key=lambda item: haversine_km(
            latitude,
            longitude,
            float(item["latitude"]),
            float(item["longitude"]),
        ),
    )


def can_change_location_freely(capabilities: Iterable[str]) -> bool:
    """Single future entitlement seam; Location V1 does not enforce change limits."""
    return "unrestricted_location_switching" in capabilities
