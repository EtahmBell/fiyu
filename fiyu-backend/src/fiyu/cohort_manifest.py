"""Strict place-id allowlists for bounded catalog operations."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_cohort_place_ids(path: str | Path) -> list[str]:
    """Load one ordered, duplicate-free place-id allowlist from an audit manifest."""

    payload: Any = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError("cohort manifest must contain a JSON object")
    raw_ids = payload.get("ordered_place_ids") or payload.get("selected_place_ids")
    if raw_ids is None:
        rows = payload.get("restaurants") or payload.get("selected_candidates")
        if not isinstance(rows, list):
            raise ValueError("cohort manifest has no ordered place-id allowlist")
        raw_ids = [row.get("place_id") if isinstance(row, dict) else None for row in rows]
    if not isinstance(raw_ids, list) or not raw_ids:
        raise ValueError("cohort manifest place-id allowlist must be non-empty")
    place_ids = [str(value or "").strip() for value in raw_ids]
    if any(not place_id for place_id in place_ids):
        raise ValueError("cohort manifest contains an empty place_id")
    if len(place_ids) != len(set(place_ids)):
        raise ValueError("cohort manifest contains duplicate place_ids")
    declared = payload.get("cohort_count", payload.get("selected_count"))
    if declared is not None and int(declared) != len(place_ids):
        raise ValueError("cohort manifest count does not match its place-id allowlist")
    return place_ids
