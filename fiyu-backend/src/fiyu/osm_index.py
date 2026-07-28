from __future__ import annotations

import json
import os
import re
import sqlite3
import tempfile
import time
import warnings
from collections.abc import Iterable
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path

from .discovery_areas import canonical_tokyo_ward
from .location_names import normalize_location_name

OSM_ATTRIBUTION = "Map data © OpenStreetMap contributors"
FOOD_AMENITIES = {"restaurant", "cafe", "fast_food", "food_court", "bar", "pub"}
TAG_KEYS = {
    "name", "name:ja", "name:en", "alt_name", "official_name", "short_name",
    "brand", "operator", "cuisine", "amenity", "railway", "public_transport",
    "addr:postcode", "addr:prefecture", "addr:city", "addr:district", "addr:suburb",
    "addr:neighbourhood", "addr:street", "addr:housenumber", "website", "contact:website",
}
JAPANESE_PATTERN = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")
CLASSIC_MOJIBAKE_PATTERN = re.compile(
    r"(?:\u00c3[\x80-\u00bf]|\u00c2[\x80-\u00bf]|\u00e2[\u20ac-\u2122])"
)
DEFAULT_MAX_SUSPICIOUS_RATE = 0.001  # One per thousand indexed objects.
DEFAULT_MAX_DIAGNOSTIC_DETAILS = 50

INDEX_SCHEMA = """
CREATE TABLE osm_locations (
    osm_type TEXT NOT NULL,
    osm_id INTEGER NOT NULL,
    osm_version INTEGER,
    osm_timestamp TEXT,
    object_kind TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    name TEXT,
    name_ja TEXT,
    name_en TEXT,
    alt_name TEXT,
    official_name TEXT,
    short_name TEXT,
    name_norm TEXT,
    name_ja_norm TEXT,
    name_en_norm TEXT,
    alt_name_norm TEXT,
    official_name_norm TEXT,
    amenity TEXT,
    cuisine TEXT,
    tags_json TEXT NOT NULL,
    source_attribution TEXT NOT NULL,
    PRIMARY KEY (osm_type, osm_id)
);
CREATE INDEX idx_osm_name_ja ON osm_locations(name_ja_norm);
CREATE INDEX idx_osm_name ON osm_locations(name_norm);
CREATE INDEX idx_osm_name_en ON osm_locations(name_en_norm);
CREATE INDEX idx_osm_kind ON osm_locations(object_kind);
CREATE TABLE osm_ward_boundaries (
    ward_name TEXT PRIMARY KEY,
    osm_type TEXT NOT NULL,
    osm_id INTEGER NOT NULL,
    osm_version INTEGER,
    osm_timestamp TEXT,
    name TEXT,
    name_ja TEXT,
    name_en TEXT,
    min_latitude REAL NOT NULL,
    max_latitude REAL NOT NULL,
    min_longitude REAL NOT NULL,
    max_longitude REAL NOT NULL,
    geometry_json TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    source_attribution TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_osm_ward_boundary_object
    ON osm_ward_boundaries(osm_type, osm_id);
CREATE INDEX idx_osm_ward_boundary_bbox
    ON osm_ward_boundaries(min_latitude, max_latitude, min_longitude, max_longitude);
"""


@dataclass(frozen=True)
class OSMFeature:
    osm_type: str
    osm_id: int
    tags: dict[str, str]
    geometry: tuple[tuple[float, float], ...]
    osm_version: int | None = None
    osm_timestamp: str | None = None
    is_polygon: bool = False


@dataclass(frozen=True)
class OSMWardBoundary:
    ward_name: str
    osm_id: int
    polygons: tuple[
        tuple[tuple[tuple[float, float], ...], tuple[tuple[tuple[float, float], ...], ...]],
        ...,
    ]
    tags: dict[str, str]
    osm_version: int | None = None
    osm_timestamp: str | None = None


class OSMEncodingValidationError(ValueError):
    """Encoding build failure with machine-readable object diagnostics."""

    def __init__(self, message: str, report: dict[str, object]) -> None:
        super().__init__(message)
        self.report = report


def polygon_representative_point(
    coordinates: Iterable[tuple[float, float]],
) -> tuple[float, float]:
    """Return polygon centroid, falling back to mean for degenerate geometry.

    Coordinates are `(latitude, longitude)`. This is appropriate for compact POI
    polygons; it avoids selecting an arbitrary boundary vertex.
    """

    points = list(coordinates)
    if not points:
        raise ValueError("geometry has no coordinates")
    if len(points) == 1:
        return points[0]
    if points[0] != points[-1]:
        points.append(points[0])
    twice_area = 0.0
    centroid_x = 0.0
    centroid_y = 0.0
    for (lat1, lon1), (lat2, lon2) in pairwise(points):
        cross = lon1 * lat2 - lon2 * lat1
        twice_area += cross
        centroid_x += (lon1 + lon2) * cross
        centroid_y += (lat1 + lat2) * cross
    if abs(twice_area) < 1e-12:
        unique = points[:-1]
        return (
            sum(point[0] for point in unique) / len(unique),
            sum(point[1] for point in unique) / len(unique),
        )
    return centroid_y / (3 * twice_area), centroid_x / (3 * twice_area)


def _kind(tags: dict[str, str]) -> str | None:
    if tags.get("amenity") in FOOD_AMENITIES:
        return "food"
    if tags.get("railway") == "station" or tags.get("public_transport") == "station":
        return "station"
    return None


def _raw_tags_are_indexable(raw_tags: object) -> bool:
    tags = raw_tags  # Pyosmium TagList supports mapping-style get without copying.
    return (
        tags.get("amenity") in FOOD_AMENITIES  # type: ignore[union-attr]
        or tags.get("railway") == "station"  # type: ignore[union-attr]
        or tags.get("public_transport") == "station"  # type: ignore[union-attr]
    )


def _tokyo_special_ward(tags: dict[str, str]) -> str | None:
    ward_name = canonical_tokyo_ward(
        tags.get("name"), tags.get("name:ja"), tags.get("name:en")
    )
    japanese_name = tags.get("name:ja") or tags.get("name") or ""
    municipal_code = tags.get("ref") or ""
    if (
        ward_name and tags.get("boundary") == "administrative"
        and tags.get("admin_level") == "7" and japanese_name.endswith("区")
        and len(municipal_code) == 6 and municipal_code.startswith("131")
        and municipal_code.isdigit()
    ):
        return ward_name
    return None


def extract_osm_tags(raw_tags: object) -> dict[str, str]:
    """Copy Pyosmium Unicode tags without performing any codec conversion."""

    extracted: dict[str, str] = {}
    for key, value in dict(raw_tags).items():  # type: ignore[arg-type]
        if not isinstance(key, str) or not isinstance(value, str):
            raise TypeError(
                "OSM parser tags must already be Unicode Python str values; "
                f"received {type(key).__name__}/{type(value).__name__}"
            )
        extracted[key] = value
    return extracted


def _insert_feature(connection: sqlite3.Connection, feature: OSMFeature) -> bool:
    for key, value in feature.tags.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise TypeError("OSMFeature tags must contain Unicode Python str keys and values")
    tags = {key: value for key, value in feature.tags.items() if key in TAG_KEYS and value}
    object_kind = _kind(tags)
    if object_kind is None or not feature.geometry:
        return False
    if feature.is_polygon or len(feature.geometry) > 1:
        latitude, longitude = polygon_representative_point(feature.geometry)
    else:
        latitude, longitude = feature.geometry[0]
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return False
    values = {
        "name": tags.get("name"), "name_ja": tags.get("name:ja"),
        "name_en": tags.get("name:en"), "alt_name": tags.get("alt_name"),
        "official_name": tags.get("official_name"), "short_name": tags.get("short_name"),
    }
    connection.execute(
        """
        INSERT OR REPLACE INTO osm_locations (
            osm_type, osm_id, osm_version, osm_timestamp, object_kind, latitude, longitude,
            name, name_ja, name_en, alt_name, official_name, short_name,
            name_norm, name_ja_norm, name_en_norm, alt_name_norm, official_name_norm,
            amenity, cuisine, tags_json, source_attribution
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            feature.osm_type, feature.osm_id, feature.osm_version, feature.osm_timestamp,
            object_kind, latitude, longitude, values["name"], values["name_ja"],
            values["name_en"], values["alt_name"], values["official_name"],
            values["short_name"], normalize_location_name(values["name"]),
            normalize_location_name(values["name_ja"]), normalize_location_name(values["name_en"]),
            normalize_location_name(values["alt_name"]),
            normalize_location_name(values["official_name"]), tags.get("amenity"),
            tags.get("cuisine"), json.dumps(tags, ensure_ascii=False, sort_keys=True),
            OSM_ATTRIBUTION,
        ),
    )
    return True


def _insert_ward_boundary(
    connection: sqlite3.Connection, boundary: OSMWardBoundary
) -> bool:
    if boundary.ward_name not in {
        "Adachi", "Arakawa", "Bunkyo", "Chiyoda", "Chuo", "Edogawa", "Itabashi",
        "Katsushika", "Kita", "Koto", "Meguro", "Minato", "Nakano", "Nerima", "Ota",
        "Setagaya", "Shibuya", "Shinagawa", "Shinjuku", "Suginami", "Sumida", "Taito",
        "Toshima",
    }:
        return False
    points = [point for outer, inners in boundary.polygons for ring in (outer, *inners) for point in ring]
    if not points:
        return False
    if any(not (-90 <= lat <= 90 and -180 <= lon <= 180) for lat, lon in points):
        return False
    tags = {key: value for key, value in boundary.tags.items() if key in TAG_KEYS or key in {
        "boundary", "admin_level", "type", "ref", "wikidata",
    }}
    geometry = [
        {"outer": outer, "inners": inners} for outer, inners in boundary.polygons
    ]
    latitudes = [point[0] for point in points]
    longitudes = [point[1] for point in points]
    connection.execute(
        """
        INSERT OR REPLACE INTO osm_ward_boundaries (
            ward_name, osm_type, osm_id, osm_version, osm_timestamp, name, name_ja, name_en,
            min_latitude, max_latitude, min_longitude, max_longitude,
            geometry_json, tags_json, source_attribution
        ) VALUES (?, 'relation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            boundary.ward_name, boundary.osm_id, boundary.osm_version,
            boundary.osm_timestamp, tags.get("name"), tags.get("name:ja"), tags.get("name:en"),
            min(latitudes), max(latitudes), min(longitudes), max(longitudes),
            json.dumps(geometry, ensure_ascii=False, separators=(",", ":")),
            json.dumps(tags, ensure_ascii=False, sort_keys=True), OSM_ATTRIBUTION,
        ),
    )
    return True


def _stream_pbf(pbf_path: Path, connection: sqlite3.Connection) -> dict[str, int]:
    try:
        import osmium
    except ImportError as exc:
        raise RuntimeError(
            "The optional 'osmium' package is required to parse .osm.pbf files"
        ) from exc

    counts = {
        "seen": 0, "indexed": 0, "nodes": 0, "ways": 0, "relations": 0,
        "ward_boundaries": 0,
    }

    class Handler(osmium.SimpleHandler):
        def _write(self, feature: OSMFeature) -> None:
            counts["seen"] += 1
            if _insert_feature(connection, feature):
                counts["indexed"] += 1
                counts[{"node": "nodes", "way": "ways", "relation": "relations"}[feature.osm_type]] += 1

        def node(self, node) -> None:
            if node.location.valid() and _raw_tags_are_indexable(node.tags):
                self._write(OSMFeature(
                    "node", node.id, extract_osm_tags(node.tags),
                    ((node.location.lat, node.location.lon),),
                    node.version, str(node.timestamp) if node.timestamp else None,
                ))

        def way(self, way) -> None:
            if not _raw_tags_are_indexable(way.tags):
                return
            coordinates = tuple(
                (node.lat, node.lon) for node in way.nodes if node.location.valid()
            )
            if coordinates:
                self._write(OSMFeature(
                    "way", way.id, extract_osm_tags(way.tags), coordinates, way.version,
                    str(way.timestamp) if way.timestamp else None,
                    len(coordinates) > 3 and coordinates[0] == coordinates[-1],
                ))

        def area(self, area) -> None:
            if area.from_way():
                return
            tags = extract_osm_tags(area.tags)
            ward_name = _tokyo_special_ward(tags)
            if ward_name:
                polygons = []
                for outer in area.outer_rings():
                    outer_points = tuple((node.lat, node.lon) for node in outer)
                    inner_points = tuple(
                        tuple((node.lat, node.lon) for node in inner)
                        for inner in area.inner_rings(outer)
                    )
                    if outer_points:
                        polygons.append((outer_points, inner_points))
                if polygons and _insert_ward_boundary(connection, OSMWardBoundary(
                    ward_name=ward_name,
                    osm_id=area.orig_id(),
                    polygons=tuple(polygons),
                    tags=tags,
                    osm_version=getattr(area, "version", None),
                    osm_timestamp=None,
                )):
                    counts["ward_boundaries"] += 1
                return
            if _kind(tags) is None:
                return
            coordinates = []
            for ring in area.outer_rings():
                coordinates.extend((node.lat, node.lon) for node in ring)
                break
            if coordinates:
                self._write(OSMFeature(
                    "relation", area.orig_id(), tags, tuple(coordinates),
                    getattr(area, "version", None), None, True,
                ))

    Handler().apply_file(str(pbf_path), locations=True, idx="sparse_file_array")
    return counts


def _diagnostic_roundtrips(value: str) -> list[dict[str, object]]:
    """Try reversible codec interpretations for diagnosis only; never repair source text."""

    results = []
    seen = set()
    for codec in ("latin-1", "cp1252"):
        try:
            candidate = value.encode(codec).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if candidate == value or candidate in seen:
            continue
        seen.add(candidate)
        has_japanese = bool(JAPANESE_PATTERN.search(candidate))
        classic_marker = bool(CLASSIC_MOJIBAKE_PATTERN.search(value))
        plausible = has_japanese or classic_marker
        results.append({
            "source_codec": codec,
            "candidate": candidate,
            "candidate_escaped": ascii(candidate),
            "candidate_code_points": [f"U+{ord(character):04X}" for character in candidate],
            "candidate_contains_japanese": has_japanese,
            "plausible_different_string": plausible,
        })
    return results


def _encoding_diagnostics(
    connection: sqlite3.Connection,
    *,
    detail_limit: int = DEFAULT_MAX_DIAGNOSTIC_DETAILS,
) -> tuple[dict[str, object], list[tuple[str, int]]]:
    rows = connection.execute(
        """
        SELECT osm_type, osm_id, name, name_ja, name_en, alt_name, official_name,
               short_name, tags_json
        FROM osm_locations
        """
    )
    total = 0
    japanese = 0
    replacements = 0
    mojibake = 0
    suspicious_objects: list[tuple[str, int]] = []
    details: list[dict[str, object]] = []
    suspicious_value_count = 0
    for row in rows:
        total += 1
        tags = json.loads(row[8])
        values = [(key, value) for key, value in tags.items() if isinstance(value, str)]
        object_has_japanese = any(JAPANESE_PATTERN.search(value) for _, value in values)
        replacement_fields = [(key, value) for key, value in values if "\ufffd" in value]
        suspicious_fields = []
        for key, value in values:
            roundtrips = _diagnostic_roundtrips(value)
            plausible = [item for item in roundtrips if item["plausible_different_string"]]
            if plausible:
                suspicious_fields.append((key, value, plausible))
        japanese += int(object_has_japanese)
        replacements += int(bool(replacement_fields))
        mojibake += int(bool(suspicious_fields))
        if replacement_fields or suspicious_fields:
            suspicious_objects.append((str(row[0]), int(row[1])))
        suspicious_value_count += len(replacement_fields) + len(suspicious_fields)
        if len(details) < detail_limit:
            for key, value in replacement_fields:
                if len(details) >= detail_limit:
                    break
                details.append(_diagnostic_detail(
                    row, key, value, "unicode_replacement_character", []
                ))
            for key, value, roundtrips in suspicious_fields:
                if len(details) >= detail_limit:
                    break
                heuristic = (
                    "valid_latin1_or_cp1252_to_utf8_roundtrip_with_japanese_or_classic_marker"
                )
                details.append(_diagnostic_detail(row, key, value, heuristic, roundtrips))
    percentage = (mojibake / total * 100.0) if total else 0.0
    return {
        "total_indexed_objects": total,
        "japanese_name_objects": japanese,
        "unicode_replacement_objects": replacements,
        "likely_mojibake_objects": mojibake,
        "suspicious_percentage": round(percentage, 8),
        "diagnostic_detail_limit": detail_limit,
        "suspicious_value_count": suspicious_value_count,
        "diagnostic_details_truncated": len(details) < suspicious_value_count,
        "suspicious_details": details,
    }, suspicious_objects


def _diagnostic_detail(
    row: sqlite3.Row | tuple[object, ...],
    tag_key: str,
    value: str,
    heuristic: str,
    roundtrips: list[dict[str, object]],
) -> dict[str, object]:
    return {
        "osm_type": row[0],
        "osm_id": row[1],
        "original_name": row[2],
        "alternate_names": {
            "name:ja": row[3], "name:en": row[4], "alt_name": row[5],
            "official_name": row[6], "short_name": row[7],
        },
        "tag_key": tag_key,
        "exact_value": value,
        "escaped_value": ascii(value),
        "unicode_code_points": [f"U+{ord(character):04X}" for character in value],
        "matched_heuristic": heuristic,
        "contains_japanese": bool(JAPANESE_PATTERN.search(value)),
        "diagnostic_roundtrips": roundtrips,
        "roundtrip_produces_plausible_different_string": any(
            item["plausible_different_string"] for item in roundtrips
        ),
    }


def _write_encoding_report(path: Path, report: dict[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    os.replace(temporary, path)


def build_osm_index(
    pbf_path: str | Path,
    output_path: str | Path,
    *,
    features: Iterable[OSMFeature] | None = None,
    ward_boundaries: Iterable[OSMWardBoundary] | None = None,
    max_suspicious_rate: float = DEFAULT_MAX_SUSPICIOUS_RATE,
    diagnostic_detail_limit: int = DEFAULT_MAX_DIAGNOSTIC_DETAILS,
) -> dict[str, object]:
    if not 0 <= max_suspicious_rate <= 1:
        raise ValueError("max_suspicious_rate must be between 0 and 1")
    if diagnostic_detail_limit < 1:
        raise ValueError("diagnostic_detail_limit must be at least 1")
    source = Path(pbf_path)
    if features is None and (not source.is_file() or source.suffix != ".pbf"):
        raise ValueError("--pbf must be an existing .osm.pbf or .pbf file")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    diagnostic_path = output.with_suffix(".encoding-report.json")
    started = time.perf_counter()
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output.name}.", suffix=".tmp", dir=output.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        connection = sqlite3.connect(temporary)
        try:
            connection.executescript(INDEX_SCHEMA)
            if features is None:
                counts = _stream_pbf(source, connection)
            else:
                counts = {
                    "seen": 0, "indexed": 0, "nodes": 0, "ways": 0, "relations": 0,
                    "ward_boundaries": 0,
                }
                for feature in features:
                    counts["seen"] += 1
                    if _insert_feature(connection, feature):
                        counts["indexed"] += 1
                        key = {"node": "nodes", "way": "ways", "relation": "relations"}[
                            feature.osm_type
                        ]
                        counts[key] += 1
                for boundary in ward_boundaries or []:
                    if _insert_ward_boundary(connection, boundary):
                        counts["ward_boundaries"] += 1
            diagnostics, suspicious_objects = _encoding_diagnostics(
                connection, detail_limit=diagnostic_detail_limit
            )
            diagnostics["tokyo_ward_boundaries"] = counts["ward_boundaries"]
            suspicious_rate = (
                int(diagnostics["likely_mojibake_objects"])
                / int(diagnostics["total_indexed_objects"])
                if diagnostics["total_indexed_objects"] else 0.0
            )
            hard_failure = bool(diagnostics["unicode_replacement_objects"]) or (
                suspicious_rate > max_suspicious_rate
            ) or (features is None and counts["ward_boundaries"] != 23)
            if hard_failure:
                report = {
                    **diagnostics,
                    "max_suspicious_rate": max_suspicious_rate,
                    "build_status": "failed",
                    "quarantined_objects": 0,
                }
                _write_encoding_report(diagnostic_path, report)
                raise OSMEncodingValidationError(
                    "OSM index encoding validation failed or ward boundaries incomplete; see "
                    f"{diagnostic_path} for object-level diagnostics",
                    report,
                )
            for osm_type, osm_id in suspicious_objects:
                connection.execute(
                    "DELETE FROM osm_locations WHERE osm_type = ? AND osm_id = ?",
                    (osm_type, osm_id),
                )
            build_status = "warned" if suspicious_objects else "succeeded"
            diagnostics = {
                **diagnostics,
                "max_suspicious_rate": max_suspicious_rate,
                "build_status": build_status,
                "quarantined_objects": len(suspicious_objects),
                "final_indexed_objects": (
                    int(diagnostics["total_indexed_objects"]) - len(suspicious_objects)
                ),
            }
            connection.commit()
        finally:
            connection.close()
        # The report is completed first so replacing the requested index is the final,
        # atomic operation. Any earlier failure leaves the prior index untouched.
        _write_encoding_report(diagnostic_path, diagnostics)
        if diagnostics["build_status"] == "warned":
            warnings.warn(
                "OSM index completed with isolated suspicious source objects quarantined; "
                f"review {diagnostic_path}",
                RuntimeWarning,
                stacklevel=2,
            )
        os.replace(temporary, output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return {
        **counts,
        **diagnostics,
        "output": str(output),
        "encoding_report": str(diagnostic_path),
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "attribution": OSM_ATTRIBUTION,
    }
