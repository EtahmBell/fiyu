from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from .osm_address_normalization import parse_japanese_address


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
    raw_address: str | None = None
    prefecture: str | None = None
    municipality_or_ward: str | None = None
    provider: str = "unconfigured"
    provider_version: str | None = None
    source_reference: str | None = None
    place_id: str | None = None
    input_fingerprint: str | None = None
    interpolation_span_meters: float | None = None
    neighborhood: str | None = None
    matched_components: dict[str, str] = field(default_factory=dict)
    unmatched_components: dict[str, str] = field(default_factory=dict)
    match_status: str | None = None
    map_location_approximate: bool | None = None
    suggested_verification_tier: str | None = None
    osm_type: str | None = None
    osm_id: int | None = None
    osm_version: int | None = None
    osm_timestamp: str | None = None
    representative_point_method: str | None = None
    map_anchor_type: str | None = None
    diagnostic_candidates: tuple[dict[str, object], ...] = field(default_factory=tuple)


class AddressGeocoderLookupError(LookupError):
    """Controlled per-address lookup outcome that should not stop a batch."""

    def __init__(
        self,
        status: str,
        message: str,
        *,
        warnings: tuple[str, ...] = (),
        diagnostics: dict[str, object] | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.warnings = warnings
        self.diagnostics = diagnostics or {}


class AddressGeocoder(Protocol):
    """Provider-neutral extension point for local independent address lookup."""

    def geocode(
        self,
        independently_verified_address: str,
        *,
        place_id: str | None = None,
        input_fingerprint: str | None = None,
    ) -> AddressGeocodeResult | None: ...


IMPORTABLE_GEOCODER_STATUSES = frozenset({
    "matched_exact",
    "matched_building",
    "matched_block_approximate",
    "matched_block_area_approximate",
    "matched_chome_area_approximate",
    "matched_neighborhood_area_approximate",
    "location_verified",
    "location_provisional",
})


class JsonFileAddressGeocoder:
    """Offline adapter for reviewed results produced by an independent geocoder.

    This adapter performs no network calls and does not establish restaurant identity.
    """

    def __init__(self, path: str | Path):
        source = Path(path)
        payload = json.loads(source.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise TypeError("geocoder results JSON must contain a list")
        self._source = source
        self._by_address: dict[str, AddressGeocodeResult] = {}
        self._by_address_and_place: dict[tuple[str, str], AddressGeocodeResult] = {}
        self.excluded_records: list[dict[str, object]] = []
        self._exclusion_by_address: dict[tuple[str, str | None], str] = {}
        for index, item in enumerate(payload, start=1):
            if not isinstance(item, dict):
                self._exclude(index, None, None, None, "record_is_not_an_object")
                continue
            status = str(item.get("status") or item.get("match_status") or "").strip()
            raw = str(item.get("raw_address") or "").strip() or None
            place_id = str(item.get("place_id") or "").strip() or None
            if status and status not in IMPORTABLE_GEOCODER_STATUSES:
                self._exclude(
                    index, raw, place_id, status,
                    f"status_not_importable:{status}",
                )
                continue
            if not raw:
                self._exclude(index, None, place_id, status or None, "missing_raw_address")
                continue
            try:
                parsed = AddressGeocodeResult(
                    raw_address=raw,
                    normalized_address=str(item.get("normalized_address") or "").strip(),
                    latitude=float(item["latitude"]),
                    longitude=float(item["longitude"]),
                    prefecture=str(item.get("prefecture") or "").strip() or None,
                    municipality_or_ward=(
                        str(item.get("municipality_or_ward") or "").strip() or None
                    ),
                    address_level_match=str(item.get("match_level") or "").strip(),
                    town_id=str(item.get("town_id") or "").strip() or None,
                    address_id=str(item.get("address_id") or "").strip() or None,
                    precision=str(item.get("precision") or "").strip(),
                    provider=str(item.get("provider") or "offline_reviewed_result").strip(),
                    provider_version=str(item.get("provider_version") or "").strip() or None,
                    source_reference=(
                        str(item.get("source_reference") or source.resolve()).strip()
                    ),
                    warnings=tuple(str(value) for value in item.get("warnings", [])),
                    provenance=str(item.get("provenance") or source.resolve()),
                    place_id=place_id,
                    input_fingerprint=str(item.get("input_fingerprint") or "").strip() or None,
                    interpolation_span_meters=(
                        float(item["interpolation_span_meters"])
                        if item.get("interpolation_span_meters") is not None
                        else None
                    ),
                    neighborhood=str(item.get("neighborhood") or "").strip() or None,
                    matched_components={
                        str(key): str(value)
                        for key, value in (item.get("matched_components") or {}).items()
                    },
                    unmatched_components={
                        str(key): str(value)
                        for key, value in (item.get("unmatched_components") or {}).items()
                    },
                    match_status=status or None,
                    map_location_approximate=(
                        bool(item["map_location_approximate"])
                        if item.get("map_location_approximate") is not None
                        else None
                    ),
                    suggested_verification_tier=(
                        str(item.get("suggested_verification_tier") or "").strip() or None
                    ),
                    osm_type=str(item.get("osm_type") or "").strip() or None,
                    osm_id=int(item["osm_id"]) if item.get("osm_id") is not None else None,
                    osm_version=(
                        int(item["osm_version"])
                        if item.get("osm_version") is not None
                        else None
                    ),
                    osm_timestamp=str(item.get("osm_timestamp") or "").strip() or None,
                    representative_point_method=(
                        str(item.get("representative_point_method") or "").strip() or None
                    ),
                    map_anchor_type=str(item.get("map_anchor_type") or "").strip() or None,
                    diagnostic_candidates=tuple(
                        dict(candidate)
                        for candidate in item.get("diagnostic_candidates", [])
                        if isinstance(candidate, dict)
                    ),
                )
            except (AttributeError, KeyError, TypeError, ValueError) as exc:
                self._exclude(
                    index, raw, place_id, status or None,
                    f"malformed_geocoder_result:{type(exc).__name__}:{exc}",
                )
                continue
            self._by_address.setdefault(raw, parsed)
            if parsed.place_id:
                self._by_address_and_place[(raw, parsed.place_id)] = parsed

    def _exclude(
        self,
        index: int,
        raw_address: str | None,
        place_id: str | None,
        status: str | None,
        reason: str,
    ) -> None:
        detail = {
            "index": index,
            "place_id": place_id,
            "raw_address": raw_address,
            "status": status,
            "reason": reason,
        }
        self.excluded_records.append(detail)
        if raw_address:
            self._exclusion_by_address[(raw_address, place_id)] = reason

    @property
    def loaded_count(self) -> int:
        return len(self._by_address_and_place) + sum(
            result.place_id is None for result in self._by_address.values()
        )

    def exclusion_reason(
        self, independently_verified_address: str, *, place_id: str | None = None
    ) -> str | None:
        return self._exclusion_by_address.get(
            (independently_verified_address, place_id)
        ) or self._exclusion_by_address.get((independently_verified_address, None))

    def geocode(
        self,
        independently_verified_address: str,
        *,
        place_id: str | None = None,
        input_fingerprint: str | None = None,
    ) -> AddressGeocodeResult | None:
        if place_id:
            exact = self._by_address_and_place.get(
                (independently_verified_address, place_id)
            )
            if exact is not None:
                return exact
        return self._by_address.get(independently_verified_address)


ABR_MATCH_LEVELS = {
    "residential_detail": ("address", "exact"),
    "residential_block": ("block", "approximate"),
    "parcel": ("parcel", "exact"),
    "block": ("block", "approximate"),
    "interpolation": ("interpolation", "approximate"),
    "machiaza_detail": ("neighborhood", "approximate"),
    "machiaza": ("neighborhood", "approximate"),
    "city": ("ward", "approximate"),
}


class DigitalAgencyAbrGeocoder:
    """Local adapter for the Digital Agency Address Base Registry CLI."""

    def __init__(
        self,
        *,
        executable: str = "abrg",
        data_dir: str | Path,
        provider_version: str = "2.3.0",
        runner=subprocess.run,
    ):
        self.executable = executable
        self.data_dir = Path(data_dir)
        self.provider_version = provider_version
        self._runner = runner
        if runner is subprocess.run and shutil.which(executable) is None:
            raise RuntimeError(
                "Digital Agency ABR geocoder executable was not found. "
                "Install @digital-go-jp/abr-geocoder and pass --abr-command if needed."
            )
        if not self.data_dir.is_dir():
            raise RuntimeError(
                f"ABR data directory is missing: {self.data_dir}. "
                "Run `abrg download -c 130001 -d PATH` first."
            )

    def geocode(
        self,
        independently_verified_address: str,
        *,
        place_id: str | None = None,
        input_fingerprint: str | None = None,
    ) -> AddressGeocodeResult | None:
        completed = self._runner(
            [
                self.executable,
                "-",
                "--format",
                "json",
                "--silent",
                "--target",
                "all",
                "-d",
                str(self.data_dir),
            ],
            input=independently_verified_address + "\n",
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if completed.returncode != 0:
            summary = str(completed.stderr or "ABR geocoder failed").strip()[:500]
            raise RuntimeError(f"ABR geocoder failed: {summary}")
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise ValueError("ABR geocoder returned malformed JSON") from exc
        item = payload[0] if isinstance(payload, list) and payload else payload
        if not isinstance(item, dict):
            return None
        result = item.get("result", item)
        if not isinstance(result, dict) or result.get("lat") is None or result.get("lon") is None:
            return None
        abr_level = str(result.get("match_level") or "").strip()
        coordinate_level = str(result.get("coordinate_level") or "").strip()
        match_level, precision = ABR_MATCH_LEVELS.get(
            coordinate_level or abr_level, ("unknown", "approximate")
        )
        city = str(result.get("city") or "").strip()
        ward = str(result.get("ward") or "").strip()
        municipality = f"{city}{ward}" if ward and ward not in city else city or ward
        address_id = (
            str(result.get("rsdt_id") or result.get("prc_id") or result.get("blk_id") or "")
            or None
        )
        warnings = []
        if result.get("other") or result.get("others"):
            warnings.append("abr_unmatched_address_suffix")
        if coordinate_level and coordinate_level != abr_level:
            warnings.append(f"abr_coordinate_level:{coordinate_level}")
        return AddressGeocodeResult(
            raw_address=independently_verified_address,
            normalized_address=str(result.get("output") or "").strip(),
            latitude=float(result["lat"]),
            longitude=float(result["lon"]),
            prefecture=str(result.get("pref") or "").strip() or None,
            municipality_or_ward=municipality or None,
            address_level_match=match_level,
            town_id=str(result.get("machiaza_id") or "").strip() or None,
            address_id=address_id,
            precision=precision,
            provider="digital_agency_address_base_registry",
            provider_version=self.provider_version,
            source_reference="https://github.com/digital-go-jp/abr-geocoder",
            provenance=str(self.data_dir.resolve()),
            warnings=tuple(warnings),
            place_id=place_id,
            input_fingerprint=input_fingerprint,
        )


_OSM_OBJECT_PRIORITY = {
    "addressed_entrance": 1,
    "address_node": 1,
    "restaurant_poi": 1,
    "addressed_building": 2,
    "address_object": 3,
    "address_interpolation": 4,
}


class LocalOSMAddressGeocoder:
    """Read-only Japanese address lookup over a locally built OSM address index."""

    def __init__(
        self,
        index_path: str | Path,
        *,
        include_candidates: bool = False,
        diagnostic_limit: int = 10,
        allow_area_fallback: bool = False,
        minimum_area_precision: str = "neighborhood",
    ):
        self.index_path = Path(index_path)
        self.include_candidates = include_candidates
        self.diagnostic_limit = diagnostic_limit
        self.allow_area_fallback = allow_area_fallback
        self.minimum_area_precision = minimum_area_precision
        if diagnostic_limit < 1:
            raise ValueError("diagnostic_limit must be at least 1")
        if minimum_area_precision not in {"block", "chome", "neighborhood"}:
            raise ValueError(
                "minimum_area_precision must be block, chome, or neighborhood"
            )
        if not self.index_path.is_file():
            raise RuntimeError(f"local OSM address index is missing: {self.index_path}")
        connection = self._connect()
        try:
            table = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='osm_addresses'"
            ).fetchone()
            self._has_area_index = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='osm_address_areas'"
            ).fetchone() is not None
        finally:
            connection.close()
        if table is None:
            raise RuntimeError(
                "OSM index does not contain osm_addresses; rebuild it with build-osm-index"
            )

    def _area_fallback(self, expected, *, place_id, input_fingerprint):
        if not self.allow_area_fallback:
            return None
        if not self._has_area_index:
            raise AddressGeocoderLookupError(
                "area_fallback_unavailable",
                "OSM index has no address-area polygon layer; rebuild it before using "
                "--allow-area-fallback",
                warnings=("osm_address_area_index_missing",),
            )
        rank = {"neighborhood": 1, "chome": 2, "block": 3}
        minimum_rank = rank[self.minimum_area_precision]
        connection = self._connect()
        try:
            rows = connection.execute(
                """
                SELECT * FROM osm_address_areas
                WHERE ward_norm=? AND neighborhood_norm=?
                ORDER BY CASE geometry_level
                    WHEN 'block' THEN 1 WHEN 'chome' THEN 2 ELSE 3 END,
                    osm_type, osm_id
                """,
                (expected.ward, expected.neighborhood),
            ).fetchall()
        finally:
            connection.close()
        matching: dict[str, list[sqlite3.Row]] = {
            "block": [], "chome": [], "neighborhood": []
        }
        for row in rows:
            level = str(row["geometry_level"])
            if rank[level] < minimum_rank:
                continue
            if level == "block" and (
                str(row["chome_norm"] or "") != str(expected.chome or "")
                or str(row["block_component_norm"] or "") != str(expected.block or "")
            ):
                continue
            if level == "chome" and str(row["chome_norm"] or "") != str(expected.chome or ""):
                continue
            if level == "neighborhood" and (
                row["chome_norm"] is not None or row["block_component_norm"] is not None
            ):
                continue
            matching[level].append(row)
        selected_level = next(
            (level for level in ("block", "chome", "neighborhood") if matching[level]),
            None,
        )
        if selected_level is None:
            return None
        candidates = matching[selected_level]
        if len(candidates) != 1:
            raise AddressGeocoderLookupError(
                "ambiguous",
                f"multiple matching OSM {selected_level} polygons",
                warnings=("multiple_matching_osm_area_polygons",),
                diagnostics={
                    "geometry_level": selected_level,
                    "candidates": [
                        {
                            "osm_type": str(row["osm_type"]),
                            "osm_id": int(row["osm_id"]),
                            "geometry_level": selected_level,
                            "area_name": row["area_name"],
                        }
                        for row in candidates[: self.diagnostic_limit]
                    ],
                },
            )
        selected = candidates[0]
        matched = {
            "prefecture": "東京都",
            "ward": expected.ward_ja or expected.ward,
            "neighborhood": expected.neighborhood,
        }
        if selected_level in {"block", "chome"} and expected.chome:
            matched["chome"] = expected.chome
        if selected_level == "block" and expected.block:
            matched["block"] = expected.block
        unmatched = {
            component: value
            for component, value in (
                ("chome", expected.chome),
                ("block", expected.block),
                ("sub_number", expected.sub_number),
            )
            if value is not None and component not in matched
        }
        return AddressGeocodeResult(
            raw_address=expected.original,
            normalized_address=expected.normalized,
            latitude=float(selected["latitude"]),
            longitude=float(selected["longitude"]),
            prefecture="東京都",
            municipality_or_ward=expected.ward_ja,
            neighborhood=expected.neighborhood,
            address_level_match=selected_level,
            precision="approximate",
            provider="local_osm_addresses",
            provider_version="osm-address-index-v3-area",
            source_reference=str(selected["source_reference"]),
            provenance=str(selected["source_attribution"]),
            warnings=(f"osm_{selected_level}_area_fallback_is_approximate",),
            place_id=place_id,
            input_fingerprint=input_fingerprint,
            matched_components=matched,
            unmatched_components=unmatched,
            match_status=f"matched_{selected_level}_area_approximate",
            map_location_approximate=True,
            suggested_verification_tier="provisional_medium",
            osm_type=str(selected["osm_type"]),
            osm_id=int(selected["osm_id"]),
            osm_version=selected["osm_version"],
            osm_timestamp=selected["osm_timestamp"],
            representative_point_method=str(selected["representative_point_method"]),
            map_anchor_type=selected_level,
        )

    def _connect(self) -> sqlite3.Connection:
        path = self.index_path.resolve().as_posix()
        connection = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _hierarchy(row: sqlite3.Row) -> dict[str, object]:
        parsed = parse_japanese_address(
            str(row["normalized_address"] or row["address_number_norm"] or "")
        )
        keys = set(row.keys())

        def stored(column: str, fallback: str | None) -> str | None:
            value = row[column] if column in keys else None
            return str(value) if value not in {None, ""} else fallback

        return {
            "number_key": str(row["address_number_norm"] or "") or parsed.number_key,
            "number_parts": parsed.number_parts,
            "chome": stored("chome_norm", parsed.chome),
            "block": stored("block_component_norm", parsed.block),
            "sub_number": stored("sub_number_norm", parsed.sub_number),
        }

    @staticmethod
    def _row_key(row: sqlite3.Row) -> tuple[str, int]:
        return str(row["osm_type"]), int(row["osm_id"])

    def _candidate_diagnostics(
        self,
        expected,
        rows: list[sqlite3.Row],
        *,
        accepted: sqlite3.Row | None = None,
    ) -> dict[str, object]:
        if not self.include_candidates:
            return {}
        accepted_key = self._row_key(accepted) if accepted is not None else None

        def comparison(row: sqlite3.Row) -> tuple[dict[str, object], tuple[object, ...]]:
            candidate = self._hierarchy(row)
            matched: dict[str, str] = {}
            differing: dict[str, dict[str, str | None]] = {}
            missing: list[str] = []
            expected_values = {
                "ward": expected.ward,
                "neighborhood": expected.neighborhood,
                "chome": expected.chome,
                "block": expected.block,
                "sub_number": expected.sub_number,
            }
            candidate_values = {
                "ward": str(row["ward_norm"] or "") or None,
                "neighborhood": str(row["neighborhood_norm"] or "") or None,
                "chome": candidate["chome"],
                "block": candidate["block"],
                "sub_number": candidate["sub_number"],
            }
            for component, expected_value in expected_values.items():
                if expected_value is None:
                    continue
                candidate_value = candidate_values[component]
                if candidate_value == expected_value:
                    matched[component] = str(expected_value)
                elif candidate_value is None:
                    missing.append(component)
                else:
                    differing[component] = {
                        "expected": str(expected_value),
                        "candidate": str(candidate_value),
                    }

            same_chome = candidate["chome"] == expected.chome and expected.chome is not None
            same_block = candidate["block"] == expected.block and expected.block is not None
            same_sub = candidate["sub_number"] == expected.sub_number
            has_full_number = bool(row["addr_housenumber"] or row["addr_full"])
            if same_chome and same_block and same_sub and has_full_number:
                level = "address"
                reason = "exact_full_number_match"
            elif same_chome and same_block:
                level = "block"
                reason = (
                    "exact_chome_and_block; final sub-number differs or is unavailable"
                )
            elif same_chome and candidate["block"] is None:
                level = "chome"
                reason = "chome_only; block unavailable; not accepted"
            elif same_chome:
                level = "chome"
                reason = "wrong_block; numeric closeness is not accepted"
            else:
                level = "neighborhood"
                reason = "wrong_or_unavailable_chome; not accepted"

            try:
                tags = json.loads(row["tags_json"] or "{}")
            except json.JSONDecodeError:
                tags = {}
            address_tags = {
                str(key): value
                for key, value in tags.items()
                if str(key).startswith("addr:")
            }
            is_accepted = self._row_key(row) == accepted_key
            detail = {
                "osm_type": str(row["osm_type"]),
                "osm_id": int(row["osm_id"]),
                "object_kind": str(row["object_kind"]),
                "address_tags": address_tags,
                "normalized_address": str(row["normalized_address"] or ""),
                "parsed_chome": candidate["chome"],
                "parsed_block": candidate["block"],
                "parsed_sub_number": candidate["sub_number"],
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "match_level": level,
                "matched_components": matched,
                "differing_components": differing,
                "missing_components": missing,
                "distance_meters": None,
                "distance_reference": "unavailable_without_trusted_input_coordinate",
                "representative_point_method": str(row["representative_point_method"]),
                "geometry_span_meters": row["geometry_span_meters"],
                "candidate_decision": "accepted" if is_accepted else "rejected",
                "reason": reason if not is_accepted else f"accepted: {reason}",
            }
            sort_key = (
                -(candidate_values["ward"] == expected.ward),
                -(candidate_values["neighborhood"] == expected.neighborhood),
                -same_chome,
                -same_block,
                -(same_sub and expected.sub_number is not None),
                _OSM_OBJECT_PRIORITY.get(str(row["object_kind"]), 99),
                str(row["osm_type"]),
                int(row["osm_id"]),
            )
            return detail, sort_key

        compared = [comparison(row) for row in rows]
        compared.sort(key=lambda item: item[1])
        return {
            "expected": {
                "raw_address": expected.original,
                "normalized_address": expected.normalized,
                "ward": expected.ward,
                "neighborhood": expected.neighborhood,
                "number_key": expected.number_key,
                "chome": expected.chome,
                "block": expected.block,
                "sub_number": expected.sub_number,
            },
            "candidate_count": len(rows),
            "diagnostic_limit": self.diagnostic_limit,
            "candidates": [item[0] for item in compared[: self.diagnostic_limit]],
        }

    def _select_unique(
        self,
        rows: list[sqlite3.Row],
        *,
        expected,
        all_rows: list[sqlite3.Row],
    ) -> sqlite3.Row:
        priority = min(_OSM_OBJECT_PRIORITY.get(str(row["object_kind"]), 99) for row in rows)
        best = [
            row for row in rows
            if _OSM_OBJECT_PRIORITY.get(str(row["object_kind"]), 99) == priority
        ]
        if len(best) != 1:
            raise AddressGeocoderLookupError(
                "ambiguous",
                "multiple similarly precise OSM address candidates",
                warnings=("multiple_similarly_precise_osm_addresses",),
                diagnostics=self._candidate_diagnostics(expected, all_rows),
            )
        return best[0]

    def geocode(
        self,
        independently_verified_address: str,
        *,
        place_id: str | None = None,
        input_fingerprint: str | None = None,
    ) -> AddressGeocodeResult | None:
        expected = parse_japanese_address(independently_verified_address)
        if expected.prefecture != "東京都" or not expected.ward:
            raise AddressGeocoderLookupError(
                "rejected_ward_mismatch",
                "address does not identify a Tokyo special ward",
            )
        if not expected.neighborhood or not expected.number_key:
            raise AddressGeocoderLookupError(
                "not_found", "street/block-level Japanese address is required"
            )
        connection = self._connect()
        try:
            rows = connection.execute(
                """
                SELECT * FROM osm_addresses
                WHERE neighborhood_norm=?
                ORDER BY osm_type, osm_id
                """,
                (expected.neighborhood,),
            ).fetchall()
        finally:
            connection.close()
        if not rows:
            area = self._area_fallback(
                expected, place_id=place_id, input_fingerprint=input_fingerprint
            )
            if area is not None:
                return area
            raise AddressGeocoderLookupError("not_found", "no OSM address in the neighborhood")

        number_matches = [row for row in rows if self._hierarchy(row)["number_parts"] == expected.number_parts]
        ward_number_matches = [
            row for row in number_matches
            if row["ward_norm"] == expected.ward
            and row["prefecture_norm"] in {None, "", "東京都"}
        ]
        if number_matches and not ward_number_matches:
            raise AddressGeocoderLookupError(
                "rejected_ward_mismatch", "matching OSM address belongs to another ward",
                diagnostics=self._candidate_diagnostics(expected, rows),
            )
        same_ward = [
            row for row in rows
            if row["ward_norm"] == expected.ward
            and row["prefecture_norm"] in {None, "", "東京都"}
        ]
        if not same_ward:
            area = self._area_fallback(
                expected, place_id=place_id, input_fingerprint=input_fingerprint
            )
            if area is not None:
                return area
            raise AddressGeocoderLookupError(
                "not_found", "no matching OSM address",
                diagnostics=self._candidate_diagnostics(expected, rows),
            )

        exact = [
            row for row in ward_number_matches
            if row["object_kind"] != "address_interpolation"
            and (row["addr_housenumber"] or row["addr_full"])
        ]
        same_block = [
            row for row in same_ward
            if self._hierarchy(row)["chome"] == expected.chome
            and self._hierarchy(row)["block"] == expected.block
        ]
        if exact:
            selected = self._select_unique(exact, expected=expected, all_rows=same_ward)
            building = selected["object_kind"] == "addressed_building"
            status = "matched_building" if building else "matched_exact"
            match_level = "building" if building else "address"
            approximate = False
            tier = "provisional_high"
            warnings: tuple[str, ...] = ()
        else:
            block = [
                row for row in same_block
                if row["object_kind"] != "address_interpolation"
            ]
            interpolation = [
                row for row in same_block
                if row["object_kind"] == "address_interpolation"
                and row["geometry_span_meters"] is not None
                and float(row["geometry_span_meters"]) <= 150
            ]
            if block:
                selected = self._select_unique(
                    block, expected=expected, all_rows=same_ward
                )
                warnings = ("osm_block_level_match_is_approximate",)
            elif interpolation:
                selected = self._select_unique(
                    interpolation, expected=expected, all_rows=same_ward
                )
                warnings = ("osm_narrow_interpolation_match_is_approximate",)
            else:
                area = self._area_fallback(
                    expected, place_id=place_id, input_fingerprint=input_fingerprint
                )
                if area is not None:
                    return area
                chome_only = [
                    row for row in same_ward
                    if self._hierarchy(row)["chome"] == expected.chome
                    and self._hierarchy(row)["block"] is None
                ]
                if chome_only or expected.block is None:
                    raise AddressGeocoderLookupError(
                        "matched_chome_only",
                        "OSM matches the chome but does not provide the requested block",
                        diagnostics=self._candidate_diagnostics(expected, same_ward),
                    )
                raise AddressGeocoderLookupError(
                    "rejected_address_number_mismatch",
                    "OSM neighborhood exists but no candidate has the same chome and block",
                    diagnostics=self._candidate_diagnostics(expected, same_ward),
                )
            status = "matched_block_approximate"
            match_level = "block"
            approximate = True
            tier = "provisional_medium"

        selected_hierarchy = self._hierarchy(selected)
        matched_components = {
            "prefecture": "東京都",
            "ward": expected.ward_ja or expected.ward,
            "neighborhood": expected.neighborhood,
            "address_number": (
                expected.number_key
                if not approximate
                else "-".join((expected.chome, expected.block))
            ),
            "chome": expected.chome,
            "block": expected.block,
        }
        if (
            expected.sub_number is not None
            and selected_hierarchy["sub_number"] == expected.sub_number
        ):
            matched_components["sub_number"] = expected.sub_number
        diagnostics = self._candidate_diagnostics(expected, same_ward, accepted=selected)

        return AddressGeocodeResult(
            raw_address=independently_verified_address,
            normalized_address=str(selected["normalized_address"] or ""),
            latitude=float(selected["latitude"]),
            longitude=float(selected["longitude"]),
            prefecture="東京都",
            municipality_or_ward=expected.ward_ja,
            neighborhood=str(selected["neighborhood_norm"] or "") or None,
            address_level_match=match_level,
            precision="approximate" if approximate else "exact",
            provider="local_osm_addresses",
            provider_version="osm-address-index-v2",
            source_reference=str(selected["source_reference"]),
            provenance="Map data © OpenStreetMap contributors",
            warnings=warnings,
            place_id=place_id,
            input_fingerprint=input_fingerprint,
            matched_components=matched_components,
            match_status=status,
            map_location_approximate=approximate,
            suggested_verification_tier=tier,
            osm_type=str(selected["osm_type"]),
            osm_id=int(selected["osm_id"]),
            osm_version=selected["osm_version"],
            osm_timestamp=selected["osm_timestamp"],
            representative_point_method=str(selected["representative_point_method"]),
            diagnostic_candidates=tuple(diagnostics.get("candidates", [])),
        )
