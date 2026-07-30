"""Offline generation of the Fiyu discovery-map base geography.

Reads a Kanto ``.osm.pbf`` extract, clips it to the Fiyu Tokyo map extent,
simplifies the geometry and writes compact JSON layers for the frontend.

WHY OFFLINE. The browser must never parse a 480 MB PBF, and the frontend must
never fetch base-map data at runtime. Everything here runs once on a developer
machine and produces static assets that are committed alongside the code.

PROVENANCE. Every coordinate written by this module comes from OpenStreetMap and
carries ODbL attribution in the output. No Google geometry, no Google-derived
coordinate, and no invented road, station or shoreline is introduced. Editorial
judgement is limited to *which* OSM features to keep and how prominently to
label them -- never to where they are.

DETERMINISM. The same PBF produces byte-identical output: features are sorted by
OSM id, simplification is a pure function, and coordinates are quantised to a
fixed number of decimals. Nothing here consults the clock or a random source.

Usage::

    fiyu export-map-assets --pbf C:/data/osm/kanto-latest.osm.pbf

The database is never opened, and no restaurant data is read or written.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

# ---------------------------------------------------------------------------
# Extent
#
# Must match TOKYO_BOUNDS in fiyu-frontend/src/lib/map/projection.ts. A feature
# outside this box cannot be projected into the viewBox, so keeping it would be
# pure payload weight.
# ---------------------------------------------------------------------------

WEST = 139.56
EAST = 139.92
SOUTH = 35.52
NORTH = 35.82

#: Features are kept slightly beyond the extent so a road entering the map does
#: not visibly stop short of the edge. The SVG viewBox clips the remainder.
CLIP_PAD = 0.02

#: ~1.1 m. Well below one viewBox unit (~28 m), so invisible, and it roughly
#: halves the JSON size against full float precision.
COORD_DECIMALS = 5

ATTRIBUTION = "Map data © OpenStreetMap contributors, ODbL 1.0"
SOURCE_URL = "https://www.openstreetmap.org/copyright"


# ---------------------------------------------------------------------------
# Layer definitions
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LineLayer:
    """A layer built from OSM ways."""

    name: str
    #: tag key -> accepted values
    match: dict[str, frozenset[str]]
    #: Douglas-Peucker tolerance in degrees.
    tolerance: float
    #: Minimum surviving length in degrees; shorter fragments are dropped.
    min_length: float = 0.0
    #: Tag keys copied into the output, when present.
    keep_tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class AreaLayer:
    """A layer built from OSM areas (closed ways and multipolygon relations)."""

    name: str
    match: dict[str, frozenset[str]]
    tolerance: float
    #: Minimum bounding-box diagonal in degrees. Drops back-garden noise.
    min_extent: float = 0.0
    keep_tags: tuple[str, ...] = ()


# Roads. Deliberately not every residential street: motorway/trunk/primary read
# as the arterial skeleton, secondary fills in at closer zoom.
ROADS_MAJOR = LineLayer(
    name="roads_major",
    match={"highway": frozenset({"motorway", "trunk", "primary"})},
    tolerance=0.00025,
    min_length=0.004,
    keep_tags=("ref",),
)

ROADS_SECONDARY = LineLayer(
    name="roads_secondary",
    match={"highway": frozenset({"secondary"})},
    tolerance=0.00035,
    min_length=0.006,
)

# Rail. `railway=rail` with a main/branch usage is the JR/private-line network;
# subway is kept separately so the two can be styled differently.
RAIL_SURFACE = LineLayer(
    name="rail_surface",
    match={"railway": frozenset({"rail"})},
    tolerance=0.00025,
    min_length=0.004,
    keep_tags=("name", "name:en", "operator"),
)

RAIL_SUBWAY = LineLayer(
    name="rail_subway",
    match={"railway": frozenset({"subway"})},
    tolerance=0.0004,
    min_length=0.006,
    keep_tags=("name", "name:en", "operator"),
)

# Waterways as lines: the Sumida and the canal network.
WATERWAYS = LineLayer(
    name="waterways",
    match={"waterway": frozenset({"river", "canal"})},
    tolerance=0.00025,
    min_length=0.003,
    keep_tags=("name", "name:en", "waterway"),
)

LINE_LAYERS: tuple[LineLayer, ...] = (
    ROADS_MAJOR,
    ROADS_SECONDARY,
    RAIL_SURFACE,
    RAIL_SUBWAY,
    WATERWAYS,
)

# Areas.
PARKS = AreaLayer(
    name="parks",
    match={"leisure": frozenset({"park", "garden"})},
    tolerance=0.0003,
    min_extent=0.004,
    keep_tags=("name", "name:en"),
)

WATER_AREAS = AreaLayer(
    name="water",
    match={
        "natural": frozenset({"water", "bay"}),
        "waterway": frozenset({"riverbank", "dock"}),
        "landuse": frozenset({"reservoir"}),
    },
    tolerance=0.0003,
    min_extent=0.003,
    keep_tags=("name", "name:en"),
)

WARDS = AreaLayer(
    name="wards",
    match={"boundary": frozenset({"administrative"})},
    tolerance=0.0006,
    min_extent=0.02,
    keep_tags=("name", "name:en", "admin_level"),
)

AREA_LAYERS: tuple[AreaLayer, ...] = (PARKS, WATER_AREAS, WARDS)

#: Tokyo's 23 special wards sit at admin_level 7.
WARD_ADMIN_LEVEL = "7"

#: Rail values that exist in the data but are not running passenger track.
EXCLUDED_RAILWAY_SERVICE = frozenset({"yard", "siding", "spur", "crossover"})
EXCLUDED_LIFECYCLE = frozenset(
    {"disused", "abandoned", "razed", "construction", "proposed", "planned"}
)


# ---------------------------------------------------------------------------
# Geometry helpers -- pure functions, no dependencies beyond the stdlib
# ---------------------------------------------------------------------------


def _in_padded_extent(lat: float, lng: float) -> bool:
    return (
        SOUTH - CLIP_PAD <= lat <= NORTH + CLIP_PAD
        and WEST - CLIP_PAD <= lng <= EAST + CLIP_PAD
    )


def split_to_extent(
    points: Sequence[tuple[float, float]],
) -> list[list[tuple[float, float]]]:
    """Split a polyline into the runs that fall inside the padded extent.

    A single point either side of the boundary is retained so a road visibly
    crosses the map edge instead of stopping short of it.
    """
    runs: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []

    for index, point in enumerate(points):
        inside = _in_padded_extent(*point)
        if inside:
            # Reach back one point so the segment leaves the frame cleanly.
            if not current and index > 0:
                current.append(points[index - 1])
            current.append(point)
        else:
            if current:
                current.append(point)
                runs.append(current)
                current = []

    if current:
        runs.append(current)
    return [run for run in runs if len(run) >= 2]


def _perpendicular_distance(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    """Distance from ``point`` to the ``start``-``end`` line, in degrees.

    Longitude is scaled by cos(latitude) so the tolerance means roughly the same
    thing on both axes at Tokyo's latitude.
    """
    scale = math.cos(math.radians(start[0]))
    px, py = point[1] * scale, point[0]
    ax, ay = start[1] * scale, start[0]
    bx, by = end[1] * scale, end[0]

    dx, dy = bx - ax, by - ay
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - ax, py - ay)

    # Projection of AP onto AB, clamped to the segment.
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(
    points: Sequence[tuple[float, float]], tolerance: float
) -> list[tuple[float, float]]:
    """Ramer-Douglas-Peucker simplification.

    Iterative rather than recursive so a long coastline cannot exhaust the
    Python stack. Deterministic for a given input and tolerance.
    """
    if len(points) <= 2 or tolerance <= 0:
        return list(points)

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue

        worst_index = -1
        worst_distance = 0.0
        for index in range(first + 1, last):
            distance = _perpendicular_distance(points[index], points[first], points[last])
            if distance > worst_distance:
                worst_distance = distance
                worst_index = index

        if worst_index != -1 and worst_distance > tolerance:
            keep[worst_index] = True
            stack.append((first, worst_index))
            stack.append((worst_index, last))

    return [point for point, kept in zip(points, keep) if kept]


def polyline_length(points: Sequence[tuple[float, float]]) -> float:
    """Approximate length in degrees, longitude scaled for latitude."""
    scale = math.cos(math.radians(points[0][0])) if points else 1.0
    return sum(
        math.hypot((b[1] - a[1]) * scale, b[0] - a[0])
        for a, b in zip(points, points[1:])
    )


def bbox_extent(points: Sequence[tuple[float, float]]) -> float:
    """Bounding-box diagonal in degrees, longitude scaled for latitude."""
    if not points:
        return 0.0
    lats = [p[0] for p in points]
    lngs = [p[1] for p in points]
    scale = math.cos(math.radians(lats[0]))
    return math.hypot((max(lngs) - min(lngs)) * scale, max(lats) - min(lats))


def quantise(points: Iterable[tuple[float, float]]) -> list[list[float]]:
    """Round to COORD_DECIMALS and drop points that collapse onto each other."""
    out: list[list[float]] = []
    for lat, lng in points:
        pair = [round(lat, COORD_DECIMALS), round(lng, COORD_DECIMALS)]
        if not out or out[-1] != pair:
            out.append(pair)
    return out


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


@dataclass
class Feature:
    osm_type: str
    osm_id: int
    coordinates: list[list[float]]
    tags: dict[str, str] = field(default_factory=dict)

    def sort_key(self) -> tuple[int, str]:
        return (self.osm_id, self.osm_type)


@dataclass
class RawWay:
    """A way as read from the PBF, before clipping or simplification."""

    osm_id: int
    #: Node ids, used to stitch fragments back together exactly.
    node_refs: tuple[int, ...]
    points: tuple[tuple[float, float], ...]


def stitch_ways(ways: Sequence[RawWay]) -> list[list[tuple[float, float]]]:
    """Join way fragments that share an endpoint node into continuous polylines.

    WHY THIS MATTERS MORE THAN IT LOOKS. OSM splits a road at every junction, so a
    single avenue arrives as dozens of two- and three-point fragments. Two
    consequences, both bad: per-feature JSON overhead ends up costing more than
    the coordinates themselves, and Douglas-Peucker has nothing to work with --
    there is no redundant point to remove from a three-point fragment, so
    simplification silently does nothing.

    Stitching first turns those fragments into long corridors, which makes
    simplification effective and collapses the metadata overhead.

    Matching is by node **id**, not by position, so it is exact -- no float
    comparison, no tolerance.

    A chain stops growing when its tail node has anything other than exactly one
    unused way attached: zero means a dead end, and two or more means a junction
    where picking a continuation would be arbitrary. Note that this is evaluated
    against the ways still unused, so at a three-way junction the first chain
    stops there and the remaining two ways -- now each other's only option -- do
    join. That is intentional: it keeps chains long without ever making an
    arbitrary choice, and it depends only on OSM id order.

    Guarantees, all asserted in tests/test_map_assets.py:
      - no way is dropped, and no point is duplicated or lost;
      - the result is independent of input order;
      - the same input always produces the same output.

    Chain *direction* is not canonicalised: a chain may be emitted head-to-tail or
    tail-to-head. Nothing downstream cares, since a stroked polyline renders
    identically either way.
    """
    ordered = sorted(ways, key=lambda way: way.osm_id)

    # endpoint node id -> indices of ways that start or end there
    endpoints: dict[int, list[int]] = {}
    for index, way in enumerate(ordered):
        if len(way.node_refs) < 2:
            continue
        for ref in (way.node_refs[0], way.node_refs[-1]):
            endpoints.setdefault(ref, []).append(index)

    used = [False] * len(ordered)
    chains: list[list[tuple[float, float]]] = []

    def extend(points: list[tuple[float, float]], refs: list[int]) -> None:
        """Grow the chain forward from its tail for as long as one way continues it."""
        while True:
            tail = refs[-1]
            candidates = [i for i in endpoints.get(tail, []) if not used[i]]
            if len(candidates) != 1:
                # Zero: dead end. More than one: a junction, so stop rather than
                # pick arbitrarily -- an arbitrary choice would not be stable.
                return
            index = candidates[0]
            way = ordered[index]
            used[index] = True
            if way.node_refs[0] == tail:
                points.extend(way.points[1:])
                refs.extend(way.node_refs[1:])
            elif way.node_refs[-1] == tail:
                points.extend(reversed(way.points[:-1]))
                refs.extend(reversed(way.node_refs[:-1]))
            else:
                return

    for index, way in enumerate(ordered):
        if used[index] or len(way.node_refs) < 2:
            continue
        used[index] = True
        points = list(way.points)
        refs = list(way.node_refs)

        extend(points, refs)
        # Then the other direction, by reversing and extending again.
        points.reverse()
        refs.reverse()
        extend(points, refs)

        if len(points) >= 2:
            chains.append(points)

    return chains


def _tags_to_dict(tags) -> dict[str, str]:
    return {key: value for key, value in tags}


def _matches(tags: dict[str, str], match: dict[str, frozenset[str]]) -> bool:
    return any(tags.get(key) in values for key, values in match.items())


def _is_live_railway(tags: dict[str, str]) -> bool:
    """Exclude yards, sidings and anything not currently carrying trains."""
    if tags.get("service") in EXCLUDED_RAILWAY_SERVICE:
        return False
    if tags.get("railway") in EXCLUDED_LIFECYCLE:
        return False
    for key in ("disused", "abandoned", "construction", "proposed"):
        if tags.get(key) is not None:
            return False
    return tags.get("usage") != "industrial"


def _keep(tags: dict[str, str], keys: Sequence[str]) -> dict[str, str]:
    return {key: tags[key] for key in keys if tags.get(key)}


def extract_lines(pbf_path: Path) -> dict[str, list[list[list[float]]]]:
    """One streaming pass over the ways, filling every line layer at once.

    Returns polylines per layer, not features: roads and rail carry no per-feature
    identity that the map uses, so the OSM ids and tags are dropped after
    stitching. That is most of the payload saving -- see stitch_ways.
    """
    import osmium

    raw: dict[str, list[RawWay]] = {layer.name: [] for layer in LINE_LAYERS}

    # Reject in C++ before anything crosses into Python. A Kanto extract holds
    # hundreds of millions of objects, and building a tag dict for each one in
    # Python is the difference between minutes and tens of minutes. The key set is
    # a strict superset of what the layer matchers accept, so filtering here cannot
    # change the output -- only how fast it is produced.
    keys = sorted({key for layer in LINE_LAYERS for key in layer.match})
    processor = (
        osmium.FileProcessor(str(pbf_path))
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter(*keys))
        .with_locations("sparse_file_array")
    )

    for obj in processor:
        if not isinstance(obj, osmium.osm.Way):
            continue

        tags = _tags_to_dict(obj.tags)
        layers = [layer for layer in LINE_LAYERS if _matches(tags, layer.match)]
        if not layers:
            continue
        if any(layer.name.startswith("rail") for layer in layers) and not _is_live_railway(tags):
            continue

        try:
            nodes = [(node.ref, node.lat, node.lon) for node in obj.nodes if node.location.valid()]
        except osmium.InvalidLocationError:
            continue
        if len(nodes) < 2:
            continue

        # Cheap reject before stitching: a way wholly outside the padded extent
        # can never contribute, and skipping it keeps the stitch graph small.
        if not any(_in_padded_extent(lat, lon) for _, lat, lon in nodes):
            continue

        way = RawWay(
            osm_id=obj.id,
            node_refs=tuple(ref for ref, _, _ in nodes),
            points=tuple((lat, lon) for _, lat, lon in nodes),
        )
        for layer in layers:
            raw[layer.name].append(way)

    # Stitch, then clip and simplify. Order matters: simplifying first would
    # destroy the shared endpoints that stitching depends on.
    results: dict[str, list[list[list[float]]]] = {}
    for layer in LINE_LAYERS:
        lines: list[list[list[float]]] = []
        for chain in stitch_ways(raw[layer.name]):
            for run in split_to_extent(chain):
                simplified = simplify(run, layer.tolerance)
                if len(simplified) < 2:
                    continue
                if polyline_length(simplified) < layer.min_length:
                    continue
                quantised = quantise(simplified)
                if len(quantised) >= 2:
                    lines.append(quantised)
        # Deterministic order, independent of stitch traversal.
        lines.sort()
        results[layer.name] = lines

    return results


def extract_stations(pbf_path: Path) -> list[Feature]:
    """Passenger rail stations inside the extent, as points.

    Coordinates and names are OSM's. Which stations get a prominent label is an
    editorial call made in the frontend, not here.
    """
    import osmium

    stations: list[Feature] = []
    seen: set[tuple[float, float]] = set()

    # Same reasoning as extract_lines: a `railway` key filter in C++ is a strict
    # superset of `railway=station`, so this is a pure speed-up. Without it this
    # pass walks every node in Kanto through the Python layer.
    processor = (
        osmium.FileProcessor(str(pbf_path))
        .with_filter(osmium.filter.EntityFilter(osmium.osm.NODE))
        .with_filter(osmium.filter.KeyFilter("railway"))
    )
    for obj in processor:
        if not isinstance(obj, osmium.osm.Node):
            continue
        tags = _tags_to_dict(obj.tags)
        if tags.get("railway") != "station":
            continue
        if not _is_live_railway(tags):
            continue
        if not obj.location.valid():
            continue

        lat, lng = obj.location.lat, obj.location.lon
        if not (SOUTH <= lat <= NORTH and WEST <= lng <= EAST):
            continue
        name = tags.get("name") or tags.get("name:en")
        if not name:
            continue

        # Interchanges are tagged once per operator; keep one node per position.
        key = (round(lat, 4), round(lng, 4))
        if key in seen:
            continue
        seen.add(key)

        stations.append(
            Feature(
                "node",
                obj.id,
                [[round(lat, COORD_DECIMALS), round(lng, COORD_DECIMALS)]],
                # Only what the map reads. `operator` and `station` were carried
                # here initially and cost ~30% of this layer's bytes for data
                # nothing rendered -- and every byte ships to the browser.
                _keep(tags, ("name", "name:en")),
            )
        )

    return stations


def extract_areas(pbf_path: Path) -> dict[str, list[Feature]]:
    """One pass over assembled areas, filling every polygon layer.

    ``with_areas`` makes pyosmium assemble multipolygon relations as well as
    closed ways, which is what ward boundaries and the larger parks require.
    """
    import osmium

    results: dict[str, list[Feature]] = {layer.name: [] for layer in AREA_LAYERS}

    processor = osmium.FileProcessor(str(pbf_path)).with_areas()
    for obj in processor:
        if not isinstance(obj, osmium.osm.Area):
            continue

        tags = _tags_to_dict(obj.tags)
        layers = [layer for layer in AREA_LAYERS if _matches(tags, layer.match)]
        if not layers:
            continue
        # Administrative boundaries exist at every level from country to
        # neighbourhood; only the special wards are wanted.
        if WARDS in layers and tags.get("admin_level") != WARD_ADMIN_LEVEL:
            layers = [layer for layer in layers if layer is not WARDS]
            if not layers:
                continue

        try:
            rings = [
                [(node.lat, node.lon) for node in ring if node.location.valid()]
                for ring in obj.outer_rings()
            ]
        except (osmium.InvalidLocationError, RuntimeError):
            continue

        for ring in rings:
            if len(ring) < 4:
                continue
            if not any(_in_padded_extent(*point) for point in ring):
                continue

            for layer in layers:
                simplified = simplify(ring, layer.tolerance)
                if len(simplified) < 4:
                    continue
                if bbox_extent(simplified) < layer.min_extent:
                    continue
                results[layer.name].append(
                    Feature(
                        "area",
                        obj.orig_id(),
                        quantise(simplified),
                        _keep(tags, layer.keep_tags),
                    )
                )

    return results


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def _layer_document(name: str, features: Sequence[Feature]) -> dict[str, object]:
    ordered = sorted(features, key=Feature.sort_key)
    return {
        **_envelope(name, len(ordered)),
        "features": [
            {
                "id": f"{feature.osm_type[0]}{feature.osm_id}",
                **({"tags": feature.tags} if feature.tags else {}),
                "coordinates": feature.coordinates,
            }
            for feature in ordered
        ],
    }


def _envelope(name: str, count: int) -> dict[str, object]:
    """Shared header. Attribution travels with every layer, not just one."""
    return {
        "layer": name,
        "attribution": ATTRIBUTION,
        "source": SOURCE_URL,
        "extent": {"west": WEST, "east": EAST, "south": SOUTH, "north": NORTH},
        "coordinateDecimals": COORD_DECIMALS,
        "count": count,
    }


def _write_json(path: Path, document: dict[str, object]) -> int:
    # separators drop insignificant whitespace; the caller has already ordered
    # everything, so key order is stable without sort_keys.
    text = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text + "\n", encoding="utf-8")
    return len(text.encode("utf-8"))


def write_layer(out_dir: Path, name: str, features: Sequence[Feature]) -> tuple[Path, int]:
    """Write a feature layer -- one that needs per-feature names or ids."""
    path = out_dir / f"{name}.json"
    return path, _write_json(path, _layer_document(name, features))


def write_line_layer(
    out_dir: Path, name: str, lines: Sequence[Sequence[Sequence[float]]]
) -> tuple[Path, int]:
    """Write a geometry-only layer as bare polylines.

    No ids and no tags: nothing in the map addresses an individual road or rail
    segment, and for a layer of a thousand short chains that metadata costs more
    than the coordinates it labels.
    """
    path = out_dir / f"{name}.json"
    document = {**_envelope(name, len(lines)), "lines": lines}
    return path, _write_json(path, document)


def export_map_assets(pbf_path: Path, out_dir: Path) -> dict[str, dict[str, int]]:
    """Extract every layer and write it. Returns per-layer counts and sizes."""
    if not pbf_path.is_file():
        raise FileNotFoundError(f"PBF not found: {pbf_path}")

    out_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, dict[str, int]] = {}

    print(f"Reading {pbf_path} ({pbf_path.stat().st_size / 1e6:.0f} MB)", flush=True)

    print("  pass 1/3: ways (roads, rail, waterways)", flush=True)
    for name, lines in extract_lines(pbf_path).items():
        path, size = write_line_layer(out_dir, name, lines)
        points = sum(len(line) for line in lines)
        summary[name] = {"features": len(lines), "bytes": size, "points": points}
        print(
            f"    {name:18} {len(lines):>6} lines  {points:>7} points  {size / 1024:>8.1f} KiB",
            flush=True,
        )

    print("  pass 2/3: nodes (stations)", flush=True)
    stations = extract_stations(pbf_path)
    path, size = write_layer(out_dir, "stations", stations)
    summary["stations"] = {"features": len(stations), "bytes": size}
    print(f"    {'stations':18} {len(stations):>6} features  {size / 1024:>8.1f} KiB", flush=True)

    print("  pass 3/3: areas (parks, water, wards)", flush=True)
    for name, features in extract_areas(pbf_path).items():
        path, size = write_layer(out_dir, name, features)
        summary[name] = {"features": len(features), "bytes": size}
        print(f"    {name:18} {len(features):>6} features  {size / 1024:>8.1f} KiB", flush=True)

    total = sum(entry["bytes"] for entry in summary.values())
    print(f"  total {total / 1024:.1f} KiB across {len(summary)} layers -> {out_dir}", flush=True)
    return summary
