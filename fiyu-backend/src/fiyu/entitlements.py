from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

Capability = Literal[
    "custom_lists",
    "premium_smart_views",
    "live_near_me",
    "day_planning",
]

CAPABILITY_CUSTOM_LISTS: Capability = "custom_lists"
CAPABILITY_PREMIUM_SMART_VIEWS: Capability = "premium_smart_views"
CAPABILITY_LIVE_NEAR_ME: Capability = "live_near_me"
CAPABILITY_DAY_PLANNING: Capability = "day_planning"

PREMIUM_CAPABILITIES: frozenset[Capability] = frozenset(
    {
        CAPABILITY_CUSTOM_LISTS,
        CAPABILITY_PREMIUM_SMART_VIEWS,
        CAPABILITY_LIVE_NEAR_ME,
        CAPABILITY_DAY_PLANNING,
    }
)


@dataclass(frozen=True)
class EntitlementError(ValueError):
    capability: Capability
    code: str = "premium_required"

    @property
    def message(self) -> str:
        return f"Capability '{self.capability}' requires premium access"


def _premium_owner_ids_from_env() -> set[str]:
    raw = os.getenv("FIYU_PREMIUM_OWNER_IDS", "")
    return {value.strip() for value in raw.split(",") if value.strip()}


def resolve_owner_capabilities(owner_id: str) -> frozenset[Capability]:
    if owner_id in _premium_owner_ids_from_env():
        return PREMIUM_CAPABILITIES
    return frozenset()


def require_capability(owner_id: str, capability: Capability) -> None:
    if capability in resolve_owner_capabilities(owner_id):
        return
    raise EntitlementError(capability=capability)
