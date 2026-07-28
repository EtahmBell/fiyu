from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .location_names import normalize_location_name


def resolve_osm_anchors(
    osm_index_path: str | Path, anchor_config_path: str | Path, output_path: str | Path
) -> dict[str, object]:
    anchors = json.loads(Path(anchor_config_path).read_text(encoding="utf-8"))
    index = sqlite3.connect(f"file:{Path(osm_index_path).resolve().as_posix()}?mode=ro", uri=True)
    index.row_factory = sqlite3.Row
    proposed = []
    resolved = 0
    ambiguous = 0
    try:
        for anchor in anchors:
            name = normalize_location_name(anchor.get("display_name"))
            rows = index.execute(
                """
                SELECT * FROM osm_locations WHERE object_kind='station'
                AND (name_norm=? OR name_ja_norm=? OR name_en_norm=? OR official_name_norm=?)
                ORDER BY osm_type, osm_id
                """, (name, name, name, name),
            ).fetchall()
            output = dict(anchor)
            output["reviewed"] = False
            if len(rows) == 1:
                row = rows[0]
                output.update({
                    "latitude": row["latitude"], "longitude": row["longitude"],
                    "source": "openstreetmap",
                    "source_reference": (
                        f"https://www.openstreetmap.org/{row['osm_type']}/{row['osm_id']}"
                    ),
                    "osm_type": row["osm_type"], "osm_id": row["osm_id"],
                    "verified_at": None, "resolution_status": "exact_match_proposed",
                })
                resolved += 1
            else:
                output["resolution_status"] = "unresolved" if not rows else "ambiguous"
                ambiguous += int(bool(rows))
            proposed.append(output)
    finally:
        index.close()
    Path(output_path).write_text(
        json.dumps(proposed, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {
        "anchors": len(anchors), "exact_match_proposals": resolved,
        "ambiguous": ambiguous, "output": str(output_path),
    }
