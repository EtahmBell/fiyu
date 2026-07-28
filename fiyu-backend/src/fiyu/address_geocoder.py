from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class AddressGeocodeResult:
    normalized_address: str
    latitude: float
    longitude: float
    address_level_match: str
    town_id: str | None = None
    address_id: str | None = None
    precision: str = "approximate"
    warnings: tuple[str, ...] = field(default_factory=tuple)
    provenance: str = ""


class AddressGeocoder(Protocol):
    """Provider-neutral extension point for a future local ABR adapter."""

    def geocode(self, independently_verified_address: str) -> AddressGeocodeResult | None: ...
