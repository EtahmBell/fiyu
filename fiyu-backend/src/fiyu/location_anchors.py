from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError

ANCHOR_CONFIG_PATH = Path(__file__).with_name("location_anchors.json")


class LocationAnchor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9-]+$")
    display_name: str = Field(min_length=1)
    area_name: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    precision: str = Field(pattern="^area_anchor$")
    qualifier: str = Field(min_length=1)
    source: str = Field(min_length=1)
    source_reference: str = Field(min_length=1)
    osm_type: str | None = Field(default=None, pattern="^(node|way|relation)$")
    osm_id: int | None = Field(default=None, gt=0)
    verified_at: date
    reviewed: bool


def load_location_anchors(path: str | Path | None = None) -> list[dict[str, object]]:
    config_path = Path(path) if path else ANCHOR_CONFIG_PATH
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, list):
        return []
    anchors = []
    for raw in payload:
        if not isinstance(raw, dict) or not raw.get("reviewed"):
            continue
        try:
            anchor = LocationAnchor.model_validate(raw)
        except ValidationError:
            continue
        source_text = f"{anchor.source} {anchor.source_reference}".casefold()
        if "google" in source_text or "unknown" in source_text:
            continue
        if not (34.8 <= anchor.latitude <= 36.0 and 138.8 <= anchor.longitude <= 140.2):
            continue
        item = anchor.model_dump(exclude={
            "reviewed", "source", "source_reference", "osm_type", "osm_id", "verified_at"
        })
        anchors.append(item)
    return anchors


def anchor_review_status(path: str | Path | None = None) -> dict[str, int]:
    config_path = Path(path) if path else ANCHOR_CONFIG_PATH
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"reviewed": 0, "unreviewed": 0, "failures": 1}
    if not isinstance(payload, list):
        return {"reviewed": 0, "unreviewed": 0, "failures": 1}
    requested = sum(isinstance(raw, dict) and raw.get("reviewed") is True for raw in payload)
    reviewed = len(load_location_anchors(config_path))
    return {
        "reviewed": reviewed,
        "unreviewed": sum(
            isinstance(raw, dict) and raw.get("reviewed") is not True for raw in payload
        ),
        "failures": requested - reviewed,
    }
