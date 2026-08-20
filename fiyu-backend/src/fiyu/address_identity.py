from __future__ import annotations

import re
from collections.abc import Mapping

_IDENTITY_IRRELEVANT_ADDRESS = re.compile(
    r"\bsimilarly named (?:restaurant|business|listing)\b|"
    r"\b(?:different|separate|unrelated|another)(?:\s+[\w・]+){0,4}\s+"
    r"(?:restaurant|business|listing|branch)\b|"
    r"\bmay be (?:a )?(?:different|separate|unrelated)\b|"
    r"\bdoes not resolve the identity\b|\bnot (?:the )?candidate(?: restaurant)?\b|"
    r"\bdo not merge\b|\bmust not be merged\b|\bshould remain separate\b|"
    r"\bnot at (?:the )?(?:reviewed|candidate|supplied) (?:address|location)\b|"
    r"\bnavigation(?:/| or )landmark reference\b",
    re.IGNORECASE,
)


def address_candidate_identity_relevant(candidate: object) -> bool:
    """Return false only when audit text explicitly identifies another entity."""

    if isinstance(candidate, Mapping):
        summary = candidate.get("summary")
    else:
        summary = getattr(candidate, "summary", "")
    return not bool(_IDENTITY_IRRELEVANT_ADDRESS.search(str(summary or "")))
