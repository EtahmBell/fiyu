from __future__ import annotations

from dataclasses import dataclass


AVAILABLE_CITY_IDS: frozenset[str] = frozenset({"tokyo"})
DEFAULT_LIST_KIND = "default"


@dataclass(frozen=True)
class ListCapability:
    city_id: str
    allows_default_list: bool
    allows_custom_lists: bool


class ListPolicyError(ValueError):
    pass


def normalize_city_id(city_id: str) -> str:
    return city_id.strip().lower()


def resolve_capability(city_id: str) -> ListCapability:
    normalized = normalize_city_id(city_id)
    if normalized not in AVAILABLE_CITY_IDS:
        raise ListPolicyError(f"Unsupported city: {city_id}")
    return ListCapability(
        city_id=normalized,
        allows_default_list=True,
        allows_custom_lists=False,
    )


def custom_list_creation_allowed(city_id: str) -> bool:
    return resolve_capability(city_id).allows_custom_lists
