from __future__ import annotations

import csv
import json
import os
import re
import tempfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .database import connect
from .location_names import normalize_location_name
from .public_catalog import ensure_public_schema

MANIFEST_PATH = Path(__file__).with_name("discovery_area_sources.json")
PROVENANCE_SOURCE = "reviewed_source_manifest"
ENRICHED_COLUMNS = [
    "discovery_area",
    "discovery_area_type",
    "discovery_area_source",
    "discovery_source_file",
    "discovery_source_row",
    "discovery_areas_json",
    "multiple_discovery_areas",
    "discovery_area_conflict",
    "discovery_area_conflict_reason",
]
ALLOWED_AREA_TYPES = {"ward", "neighborhood", "station_area", "search_bucket", "unknown"}
MOJIBAKE_PATTERN = re.compile(
    r"(?:\u00c3[\x80-\u00bf]|\u00c2[\x80-\u00bf]|\u00e2[\u20ac-\u2122])"
)

TOKYO_WARD_NAMES = {
    "Adachi": ("adachi", "adachi city", "足立区"),
    "Arakawa": ("arakawa", "arakawa city", "荒川区"),
    "Bunkyo": ("bunkyo", "bunkyo city", "文京区"),
    "Chiyoda": ("chiyoda", "chiyoda city", "千代田区"),
    "Chuo": ("chuo", "chuo city", "中央区"),
    "Edogawa": ("edogawa", "edogawa city", "江戸川区"),
    "Itabashi": ("itabashi", "itabashi city", "板橋区"),
    "Katsushika": ("katsushika", "katsushika city", "葛飾区"),
    "Kita": ("kita", "kita city", "北区"),
    "Koto": ("koto", "koto city", "江東区"),
    "Meguro": ("meguro", "meguro city", "目黒区"),
    "Minato": ("minato", "minato city", "港区"),
    "Nakano": ("nakano", "nakano city", "中野区"),
    "Nerima": ("nerima", "nerima city", "練馬区"),
    "Ota": ("ota", "ota city", "大田区"),
    "Setagaya": ("setagaya", "setagaya city", "世田谷区"),
    "Shibuya": ("shibuya", "shibuya city", "渋谷区"),
    "Shinagawa": ("shinagawa", "shinagawa city", "品川区"),
    "Shinjuku": ("shinjuku", "shinjuku city", "新宿区"),
    "Suginami": ("suginami", "suginami city", "杉並区"),
    "Sumida": ("sumida", "sumida city", "墨田区"),
    "Taito": ("taito", "taito city", "台東区"),
    "Toshima": ("toshima", "toshima city", "豊島区"),
}

ADJACENT_WARDS = {
    "Adachi": {"Kita", "Arakawa", "Katsushika"},
    "Chiyoda": {"Chuo", "Minato", "Shinjuku", "Bunkyo", "Taito"},
    "Chuo": {"Chiyoda", "Minato", "Taito", "Koto", "Sumida"},
    "Koto": {"Chuo", "Sumida", "Edogawa"},
    "Minato": {"Chiyoda", "Chuo", "Shinjuku", "Shibuya", "Shinagawa"},
    "Ota": {"Shinagawa", "Meguro", "Setagaya"},
    "Setagaya": {"Ota", "Meguro", "Shibuya", "Suginami"},
    "Shibuya": {"Minato", "Shinjuku", "Setagaya", "Suginami", "Meguro", "Shinagawa"},
    "Shinjuku": {"Chiyoda", "Minato", "Shibuya", "Suginami", "Nakano", "Toshima", "Bunkyo"},
    "Suginami": {"Setagaya", "Shibuya", "Shinjuku", "Nakano", "Nerima"},
    "Taito": {"Chiyoda", "Chuo", "Bunkyo", "Arakawa", "Sumida"},
    "Toshima": {"Shinjuku", "Bunkyo", "Kita", "Arakawa", "Itabashi", "Nerima", "Nakano"},
}


@dataclass(frozen=True)
class SourceMapping:
    source_file: str
    discovery_area: str
    discovery_area_type: str
    reviewed: bool


class DiscoveryAreaError(ValueError):
    pass


def load_source_manifest(path: str | Path = MANIFEST_PATH) -> dict[str, SourceMapping]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise DiscoveryAreaError("discovery-area manifest must be a JSON list")
    result: dict[str, SourceMapping] = {}
    for index, raw in enumerate(payload, start=1):
        if not isinstance(raw, dict):
            raise DiscoveryAreaError(f"manifest entry {index} must be an object")
        mapping = SourceMapping(
            source_file=str(raw.get("source_file") or "").strip(),
            discovery_area=str(raw.get("discovery_area") or "").strip(),
            discovery_area_type=str(raw.get("discovery_area_type") or "").strip(),
            reviewed=raw.get("reviewed") is True,
        )
        if not mapping.source_file or not mapping.discovery_area:
            raise DiscoveryAreaError(f"manifest entry {index} has blank required fields")
        if mapping.discovery_area_type not in ALLOWED_AREA_TYPES:
            raise DiscoveryAreaError(f"invalid area type for {mapping.source_file}")
        if mapping.source_file in result:
            raise DiscoveryAreaError(f"duplicate manifest source file: {mapping.source_file}")
        result[mapping.source_file] = mapping
    return result


def _source_files(source_dir: str | Path) -> list[Path]:
    return sorted(Path(source_dir).glob("*_Initial.csv"), key=lambda path: path.name.casefold())


def _crosswalk(
    source_dir: str | Path, manifest_path: str | Path
) -> tuple[dict[str, list[dict[str, object]]], dict[str, object]]:
    manifest = load_source_manifest(manifest_path)
    files = _source_files(source_dir)
    found_names = {path.name for path in files}
    missing_mappings = sorted(found_names - manifest.keys())
    missing_files = sorted(manifest.keys() - found_names)
    if missing_mappings or missing_files:
        raise DiscoveryAreaError(
            f"source/manifest mismatch: unmapped={missing_mappings}, missing={missing_files}"
        )
    crosswalk: dict[str, list[dict[str, object]]] = defaultdict(list)
    file_reports = []
    source_names: dict[str, set[str]] = defaultdict(set)
    for path in files:
        mapping = manifest[path.name]
        if not mapping.reviewed:
            raise DiscoveryAreaError(f"source mapping is not reviewed: {path.name}")
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or "placeId" not in reader.fieldnames:
                raise DiscoveryAreaError(f"{path.name} does not contain placeId")
            rows = list(reader)
            columns = list(reader.fieldnames)
        ids = [(row.get("placeId") or "").strip() for row in rows]
        duplicates = {key: value for key, value in Counter(ids).items() if key and value > 1}
        for source_row, row in enumerate(rows, start=2):
            place_id = (row.get("placeId") or "").strip()
            if not place_id:
                continue
            source_names[place_id].add((row.get("title") or "").strip())
            crosswalk[place_id].append({
                "area": mapping.discovery_area,
                "area_type": mapping.discovery_area_type,
                "source_file": mapping.source_file,
                "source_row": source_row,
            })
        file_reports.append({
            "source_file": path.name,
            "source_path": str(path.resolve()),
            "row_count": len(rows),
            "column_count": len(columns),
            "relevant_columns": [
                column for column in columns
                if column in {
                    "placeId", "title", "address", "city", "state", "postalCode",
                    "neighborhood", "location/lat", "location/lng", "searchString",
                    "searchPageUrl",
                }
            ],
            "encoding": "utf-8-sig",
            "identifier_column": "placeId",
            "duplicate_place_ids": duplicates,
            "unicode_replacement_values": sum(
                "\ufffd" in value for row in rows for value in row.values() if value
            ),
            "likely_mojibake_values": sum(
                bool(MOJIBAKE_PATTERN.search(value))
                for row in rows for value in row.values() if value
            ),
        })
    for occurrences in crosswalk.values():
        occurrences.sort(key=lambda item: (str(item["source_file"]).casefold(), int(item["source_row"])))
    multi = {key: value for key, value in crosswalk.items() if len(value) > 1}
    diagnostics: dict[str, object] = {
        "source_files": file_reports,
        "source_rows": sum(int(report["row_count"]) for report in file_reports),
        "unique_source_place_ids": len(crosswalk),
        "multi_area_place_ids": multi,
        "inconsistent_names": {
            key: sorted(value) for key, value in source_names.items() if len(value) > 1
        },
        "reviewed_source_mapping": [
            {
                "source_file": item.source_file,
                "discovery_area": item.discovery_area,
                "discovery_area_type": item.discovery_area_type,
                "reviewed": item.reviewed,
            }
            for item in manifest.values()
        ],
    }
    return dict(crosswalk), diagnostics


def _write_json(path: str | Path, payload: object) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def audit_discovery_areas(
    source_dir: str | Path,
    public_csv: str | Path,
    *,
    manifest_path: str | Path = MANIFEST_PATH,
    report_path: str | Path | None = None,
) -> dict[str, object]:
    crosswalk, report = _crosswalk(source_dir, manifest_path)
    with Path(public_csv).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or "place_id" not in reader.fieldnames:
            raise DiscoveryAreaError("public CSV does not contain place_id")
        public_rows = list(reader)
    public_ids = [(row.get("place_id") or "").strip() for row in public_rows]
    source_ids = set(crosswalk)
    unique_public = {value for value in public_ids if value}
    report.update({
        "public_csv": str(Path(public_csv)),
        "public_rows": len(public_rows),
        "public_columns": list(reader.fieldnames or []),
        "public_encoding": "utf-8-sig",
        "public_source_information_columns": [
            column for column in (reader.fieldnames or [])
            if "source" in column.casefold() or "discovery" in column.casefold()
        ],
        "public_duplicate_place_ids": {
            key: value for key, value in Counter(public_ids).items() if key and value > 1
        },
        "public_not_in_sources": sorted(unique_public - source_ids),
        "source_place_ids_not_in_public": sorted(source_ids - unique_public),
        "source_rows_not_in_public": sum(
            len(occurrences) for key, occurrences in crosswalk.items() if key not in unique_public
        ),
        "public_multi_area_place_ids": {
            key: crosswalk[key] for key in sorted(unique_public & source_ids)
            if len(crosswalk[key]) > 1
        },
    })
    if report_path:
        _write_json(report_path, report)
    return report


def generate_enriched_public_csv(
    source_dir: str | Path,
    public_csv: str | Path,
    output_path: str | Path,
    *,
    manifest_path: str | Path = MANIFEST_PATH,
    report_path: str | Path | None = None,
) -> dict[str, object]:
    crosswalk, crosswalk_report = _crosswalk(source_dir, manifest_path)
    inconsistent_names = set(crosswalk_report["inconsistent_names"])
    with Path(public_csv).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or "place_id" not in reader.fieldnames:
            raise DiscoveryAreaError("public CSV does not contain place_id")
        original_columns = list(reader.fieldnames)
        rows = list(reader)
    if any(column in original_columns for column in ENRICHED_COLUMNS):
        raise DiscoveryAreaError("input public CSV is already discovery-area enriched")
    duplicate_public = {
        key: value
        for key, value in Counter((row.get("place_id") or "").strip() for row in rows).items()
        if key and value > 1
    }
    if duplicate_public:
        raise DiscoveryAreaError(f"duplicate public place IDs: {sorted(duplicate_public)}")
    unmatched = []
    conflicts = []
    enriched = []
    for row in rows:
        clean = dict(row)
        place_id = (row.get("place_id") or "").strip()
        occurrences = crosswalk.get(place_id, [])
        multiple = len(occurrences) > 1
        conflict = place_id in inconsistent_names
        if not occurrences:
            unmatched.append(place_id)
        if multiple:
            conflicts.append(place_id)
        singular = occurrences[0] if len(occurrences) == 1 else {}
        clean.update({
            "discovery_area": singular.get("area", ""),
            "discovery_area_type": singular.get("area_type", ""),
            "discovery_area_source": PROVENANCE_SOURCE if occurrences else "",
            "discovery_source_file": singular.get("source_file", ""),
            "discovery_source_row": singular.get("source_row", ""),
            "discovery_areas_json": json.dumps(
                occurrences, ensure_ascii=False, separators=(",", ":")
            ),
            "multiple_discovery_areas": "true" if multiple else "false",
            "discovery_area_conflict": "true" if conflict else "false",
            "discovery_area_conflict_reason": (
                "source_records_disagree_on_identity" if conflict else ""
            ),
        })
        enriched.append(clean)
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=target.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with temporary.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=[*original_columns, *ENRICHED_COLUMNS])
            writer.writeheader()
            writer.writerows(enriched)
        os.replace(temporary, target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    report = {
        "input": str(Path(public_csv)),
        "output": str(target),
        "rows": len(enriched),
        "uniquely_mapped": len(enriched) - len(unmatched) - len(conflicts),
        "multiple_discovery_areas": conflicts,
        "true_area_conflicts": sorted(inconsistent_names & {row.get("place_id", "") for row in rows}),
        "unmatched_public_rows": unmatched,
        "preserved_columns": original_columns,
        "added_columns": ENRICHED_COLUMNS,
    }
    if report_path:
        _write_json(report_path, report)
    return report


def _parse_occurrences(raw: str, line: int) -> list[dict[str, object]]:
    try:
        value = json.loads(raw or "[]")
    except json.JSONDecodeError as exc:
        raise DiscoveryAreaError(f"line {line}: invalid discovery_areas_json") from exc
    if not isinstance(value, list):
        raise DiscoveryAreaError(f"line {line}: discovery_areas_json must be a list")
    for occurrence in value:
        if not isinstance(occurrence, dict):
            raise DiscoveryAreaError(f"line {line}: invalid discovery occurrence")
        if not all(occurrence.get(field) for field in ("area", "area_type", "source_file", "source_row")):
            raise DiscoveryAreaError(f"line {line}: incomplete discovery occurrence")
        if occurrence["area_type"] not in ALLOWED_AREA_TYPES:
            raise DiscoveryAreaError(f"line {line}: invalid discovery area type")
    return value


def import_discovery_areas(
    db_path: str | Path,
    input_path: str | Path,
    *,
    dry_run: bool = False,
    report_path: str | Path | None = None,
) -> dict[str, object]:
    with Path(input_path).open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    parsed: dict[str, tuple[dict[str, str], list[dict[str, object]]]] = {}
    errors = []
    for line, row in enumerate(rows, start=2):
        place_id = (row.get("place_id") or "").strip()
        try:
            if not place_id:
                raise DiscoveryAreaError(f"line {line}: blank place_id")
            occurrences = _parse_occurrences(row.get("discovery_areas_json") or "", line)
            conflict = (row.get("discovery_area_conflict") or "").strip().casefold() == "true"
            multiple = (row.get("multiple_discovery_areas") or "").strip().casefold() == "true"
            conflict_reason = (row.get("discovery_area_conflict_reason") or "").strip()
            if multiple != (len(occurrences) > 1):
                raise DiscoveryAreaError(f"line {line}: multiple-area metadata is inconsistent")
            if conflict and not conflict_reason:
                raise DiscoveryAreaError(f"line {line}: conflict requires an explicit reason")
            if conflict_reason and not conflict:
                raise DiscoveryAreaError(f"line {line}: conflict reason requires conflict=true")
            if place_id in parsed:
                previous = parsed[place_id][1]
                if not conflict or previous != occurrences:
                    raise DiscoveryAreaError(f"line {line}: conflicting duplicate place_id {place_id}")
                continue
            parsed[place_id] = (row, occurrences)
        except DiscoveryAreaError as exc:
            errors.append({"line": line, "place_id": place_id or None, "error": str(exc)})
    if not dry_run and not errors:
        ensure_public_schema(db_path)
    with connect(db_path) as connection:
        database_ids = {
            str(row[0]) for row in connection.execute("SELECT place_id FROM public_restaurants")
        }
        input_ids = set(parsed)
        unmatched = sorted(input_ids - database_ids)
        absent = sorted(database_ids - input_ids)
        if not dry_run and not errors:
            now = datetime.now(UTC).isoformat()
            for place_id in sorted(input_ids & database_ids):
                row, occurrences = parsed[place_id]
                connection.execute(
                    """
                    UPDATE public_restaurants SET
                        discovery_area=?, discovery_area_type=?, discovery_area_source=?,
                        discovery_source_file=?, discovery_source_row=?, discovery_areas_json=?,
                        multiple_discovery_areas=?, discovery_area_conflict=?,
                        discovery_area_conflict_reason=?, updated_at=?
                    WHERE place_id=?
                    """,
                    (
                        (row.get("discovery_area") or "").strip() or None,
                        (row.get("discovery_area_type") or "").strip() or None,
                        (row.get("discovery_area_source") or "").strip() or None,
                        (row.get("discovery_source_file") or "").strip() or None,
                        int(row["discovery_source_row"]) if row.get("discovery_source_row") else None,
                        json.dumps(occurrences, ensure_ascii=False, separators=(",", ":")),
                        int(len(occurrences) > 1), int(
                            (row.get("discovery_area_conflict") or "").strip().casefold() == "true"
                        ),
                        (row.get("discovery_area_conflict_reason") or "").strip() or None,
                        now,
                        place_id,
                    ),
                )
            connection.commit()
    report = {
        "input_rows": len(rows),
        "validated_place_ids": len(parsed),
        "dry_run": dry_run,
        "updated": 0 if dry_run or errors else len(set(parsed) & database_ids),
        "would_update": len(set(parsed) & database_ids),
        "unmatched_input_rows": unmatched,
        "database_records_absent_from_input": absent,
        "validation_failures": errors,
    }
    if report_path:
        _write_json(report_path, report)
    return report


def discovery_occurrences(restaurant: dict[str, object]) -> list[dict[str, object]]:
    raw = restaurant.get("discovery_areas_json")
    try:
        value = json.loads(str(raw or "[]"))
    except json.JSONDecodeError:
        return []
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def infer_tokyo_ward(tags: dict[str, str]) -> str | None:
    address_values = [
        normalize_location_name(value)
        for key, value in tags.items()
        if key in {"addr:city", "addr:district", "addr:suburb", "addr:neighbourhood"}
    ]
    for ward, aliases in TOKYO_WARD_NAMES.items():
        for alias in aliases:
            normalized = normalize_location_name(alias)
            for value in address_values:
                if value == normalized or value.startswith(f"{normalized} "):
                    return ward
    return None


def canonical_tokyo_ward(*values: str | None) -> str | None:
    """Return a canonical ward only for an exact reviewed ward-name alias."""

    normalized_values = {
        normalize_location_name(value) for value in values if value and value.strip()
    }
    for ward, aliases in TOKYO_WARD_NAMES.items():
        if normalized_values & {normalize_location_name(alias) for alias in aliases}:
            return ward
    return None
