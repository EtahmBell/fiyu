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
    match_status: str | None = None
    map_location_approximate: bool | None = None
    suggested_verification_tier: str | None = None
    osm_type: str | None = None
    osm_id: int | None = None
    osm_version: int | None = None
    osm_timestamp: str | None = None
    representative_point_method: str | None = None


class AddressGeocoderLookupError(LookupError):
    """Controlled per-address lookup outcome that should not stop a batch."""

    def __init__(self, status: str, message: str, *, warnings: tuple[str, ...] = ()):
        super().__init__(message)
        self.status = status
        self.warnings = warnings


class AddressGeocoder(Protocol):
    """Provider-neutral extension point for local independent address lookup."""

    def geocode(
        self,
        independently_verified_address: str,
        *,
        place_id: str | None = None,
        input_fingerprint: str | None = None,
    ) -> AddressGeocodeResult | None: ...


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
        for index, item in enumerate(payload, start=1):
            if not isinstance(item, dict):
                raise TypeError(f"geocoder result {index} must be an object")
            status = str(item.get("status") or item.get("match_status") or "").strip()
            if status and status not in {
                "matched_exact", "matched_building", "matched_block_approximate",
                "location_verified", "location_provisional",
            }:
                continue
            raw = str(item.get("raw_address") or "").strip()
            if not raw:
                raise ValueError(f"geocoder result {index} requires raw_address")
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
                place_id=str(item.get("place_id") or "").strip() or None,
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
            )
            self._by_address.setdefault(raw, parsed)
            if parsed.place_id:
                self._by_address_and_place[(raw, parsed.place_id)] = parsed

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

    def __init__(self, index_path: str | Path):
        self.index_path = Path(index_path)
        if not self.index_path.is_file():
            raise RuntimeError(f"local OSM address index is missing: {self.index_path}")
        with self._connect() as connection:
            table = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='osm_addresses'"
            ).fetchone()
        if table is None:
            raise RuntimeError(
                "OSM index does not contain osm_addresses; rebuild it with build-osm-index"
            )

    def _connect(self) -> sqlite3.Connection:
        path = self.index_path.resolve().as_posix()
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _select_unique(rows: list[sqlite3.Row]) -> sqlite3.Row:
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
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM osm_addresses
                WHERE neighborhood_norm=?
                ORDER BY osm_type, osm_id
                """,
                (expected.neighborhood,),
            ).fetchall()
        if not rows:
            raise AddressGeocoderLookupError("not_found", "no OSM address in the neighborhood")

        number_matches = [
            row for row in rows if row["address_number_norm"] == expected.number_key
        ]
        ward_matches = [
            row for row in number_matches
            if row["ward_norm"] == expected.ward
            and row["prefecture_norm"] in {None, "", "東京都"}
        ]
        if number_matches and not ward_matches:
            raise AddressGeocoderLookupError(
                "rejected_ward_mismatch", "matching OSM address belongs to another ward"
            )
        same_ward = [
            row for row in rows
            if row["ward_norm"] == expected.ward
            and row["prefecture_norm"] in {None, "", "東京都"}
        ]
        if not ward_matches:
            if same_ward:
                raise AddressGeocoderLookupError(
                    "rejected_address_number_mismatch",
                    "OSM neighborhood exists but the house/block number differs",
                )
            raise AddressGeocoderLookupError("not_found", "no matching OSM address")

        exact = [
            row for row in ward_matches
            if row["object_kind"] != "address_interpolation"
            and (row["addr_housenumber"] or row["addr_full"])
        ]
        block = [
            row for row in ward_matches
            if row["object_kind"] != "address_interpolation"
            and row["addr_block_number"] and not row["addr_housenumber"]
        ]
        if exact:
            selected = self._select_unique(exact)
            building = selected["object_kind"] == "addressed_building"
            status = "matched_building" if building else "matched_exact"
            match_level = "building" if building else "address"
            approximate = False
            tier = "provisional_high"
            warnings: tuple[str, ...] = ()
        elif block:
            selected = self._select_unique(block)
            status = "matched_block_approximate"
            match_level = "block"
            approximate = True
            tier = "provisional_medium"
            warnings = ("osm_block_level_match_is_approximate",)
        else:
            interpolation = [
                row for row in ward_matches
                if row["object_kind"] == "address_interpolation"
                and row["geometry_span_meters"] is not None
                and float(row["geometry_span_meters"]) <= 150
            ]
            if not interpolation:
                raise AddressGeocoderLookupError(
                    "not_found", "OSM match does not reach address or narrow block precision"
                )
            selected = self._select_unique(interpolation)
            status = "matched_block_approximate"
            match_level = "block"
            approximate = True
            tier = "provisional_medium"
            warnings = ("osm_narrow_interpolation_match_is_approximate",)

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
            provider_version="osm-address-index-v1",
            source_reference=str(selected["source_reference"]),
            provenance="Map data © OpenStreetMap contributors",
            warnings=warnings,
            place_id=place_id,
            input_fingerprint=input_fingerprint,
            matched_components={
                "prefecture": "東京都",
                "ward": expected.ward_ja or expected.ward,
                "neighborhood": expected.neighborhood,
                "address_number": expected.number_key,
            },
            match_status=status,
            map_location_approximate=approximate,
            suggested_verification_tier=tier,
            osm_type=str(selected["osm_type"]),
            osm_id=int(selected["osm_id"]),
            osm_version=selected["osm_version"],
            osm_timestamp=selected["osm_timestamp"],
            representative_point_method=str(selected["representative_point_method"]),
        )
