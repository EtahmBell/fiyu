from __future__ import annotations

import re
import unicodedata

_WHITESPACE = re.compile(r"\s+")
_REPEATED_PUNCTUATION = re.compile(r"([!！?？。、,，.・･:：;；\-ー])\1+")


def normalize_location_name(value: str | None) -> str:
    """Normalize for comparison without translating or removing branch words."""

    if not value:
        return ""
    text = unicodedata.normalize("NFKC", value).casefold().strip()
    text = _WHITESPACE.sub(" ", text)
    text = _REPEATED_PUNCTUATION.sub(r"\1", text)
    return text


def comparable_names(*values: str | None) -> set[str]:
    return {normalized for value in values if (normalized := normalize_location_name(value))}
