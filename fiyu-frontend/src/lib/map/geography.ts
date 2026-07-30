import type { DetailLevel } from "@/lib/map/detail";
import { STATION_TIER_BY_NAME } from "@/lib/map/landmarks";
import { type LatLng, isWithinBounds, project, svgNumber, toPath } from "@/lib/map/projection";

import parksLayer from "@/lib/map/generated/parks.json";
import railSubwayLayer from "@/lib/map/generated/rail_subway.json";
import railSurfaceLayer from "@/lib/map/generated/rail_surface.json";
import roadsMajorLayer from "@/lib/map/generated/roads_major.json";
import roadsSecondaryLayer from "@/lib/map/generated/roads_secondary.json";
import stationsLayer from "@/lib/map/generated/stations.json";
import wardsLayer from "@/lib/map/generated/wards.json";
import waterLayer from "@/lib/map/generated/water.json";
import waterwaysLayer from "@/lib/map/generated/waterways.json";

/**
 * The base geography, projected once.
 *
 * Bridges the machine-generated OpenStreetMap layers in ./generated/ to the SVG
 * the map renders.
 *
 * WHY EVERYTHING HAPPENS AT MODULE SCOPE. The generated data is static: the same
 * PBF, the same projection, the same output forever. Projecting it inside a
 * component -- even inside useMemo -- would repeat the work per mount, per route
 * change and once more during hydration. Doing it here means each path string is
 * built exactly once per process, and the render path is then a plain array read.
 *
 * Paths go through `toPath`, which rounds to two decimals via svgNumber, so every
 * string here is byte-identical on the server and in the browser. That is the
 * hydration guarantee for the whole basemap.
 *
 * ATTRIBUTION. Every layer carries ODbL attribution from the generator; it is
 * re-exported as OSM_ATTRIBUTION and displayed on the map. Do not drop it.
 */

/**
 * Shapes written by `fiyu export-map-assets`.
 *
 * Two formats, for a reason. Layers whose individual features are addressable --
 * stations by name, parks and wards by name -- keep ids and tags. Geometry-only
 * layers (roads, rail, waterways) are bare polylines: nothing in the map
 * addresses one road segment, and for a thousand short chains that metadata cost
 * more than the coordinates it labelled.
 */
interface FeatureLayer {
  layer: string;
  attribution: string;
  source: string;
  count: number;
  features: {
    id: string;
    tags?: Record<string, string>;
    coordinates: number[][];
  }[];
}

interface LineLayer {
  layer: string;
  attribution: string;
  source: string;
  count: number;
  lines: number[][][];
}

export interface StationPoint {
  id: string;
  /** OSM name, usually Japanese. */
  name: string;
  /** Editorial English label, when this station is one we label. */
  label: string | null;
  at: LatLng;
  /** Projected position, already rounded. */
  x: number;
  y: number;
  /** Lowest detail level at which this station appears. */
  minDetail: DetailLevel;
  /** True when the station carries a rendered text label. */
  labelled: boolean;
}

/** ODbL credit for every generated layer. Rendered on the map. */
export const OSM_ATTRIBUTION = (parksLayer as FeatureLayer).attribution;
export const OSM_SOURCE_URL = (parksLayer as FeatureLayer).source;

function toLatLng(pair: number[]): LatLng {
  return { lat: pair[0], lng: pair[1] };
}

/**
 * Collapse a whole layer into ONE SVG path string.
 *
 * An SVG `d` holds any number of subpaths, so a thousand roads can be a thousand
 * `M...L...` runs inside a single `<path>`. That matters a great deal here: it
 * turns the base geography from roughly 4,000 DOM elements into eight. React has
 * eight nodes to reconcile, the browser has eight nodes to style and hit-test,
 * and the memory cost of the element tree effectively disappears.
 *
 * The trade-off is that individual features stop being addressable. For roads,
 * rail and water that is exactly what we want -- nothing hovers or selects a road
 * segment. Where per-feature identity IS needed (stations), the data keeps its
 * ids and is handled separately below.
 *
 * `close` decides fill versus stroke. Empty layers yield an empty string, which
 * the components skip rather than emitting a useless element.
 */
function combinePaths(lines: number[][][], close: boolean): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    const d = toPath(line.map(toLatLng), close);
    if (d !== "") parts.push(d);
  }
  return parts.join(" ");
}

function combineFeatures(layer: FeatureLayer, close: boolean): string {
  return combinePaths(
    layer.features.map((feature) => feature.coordinates),
    close,
  );
}

/* Water and green space. Fills. */
export const WATER_PATH = combineFeatures(waterLayer as FeatureLayer, true);
export const PARK_PATH = combineFeatures(parksLayer as FeatureLayer, true);

/* Administrative context. Stroked outline only. */
export const WARD_PATH = combineFeatures(wardsLayer as FeatureLayer, true);

/* Lines. */
export const WATERWAY_PATH = combinePaths((waterwaysLayer as LineLayer).lines, false);
export const ROAD_SECONDARY_PATH = combinePaths((roadsSecondaryLayer as LineLayer).lines, false);
export const ROAD_MAJOR_PATH = combinePaths((roadsMajorLayer as LineLayer).lines, false);
export const RAIL_SURFACE_PATH = combinePaths((railSurfaceLayer as LineLayer).lines, false);
export const RAIL_SUBWAY_PATH = combinePaths((railSubwayLayer as LineLayer).lines, false);

/**
 * One entry per station NAME.
 *
 * OSM models a large interchange as one node per operator, all within a couple of
 * hundred metres: Ikebukuro has six, Shibuya five, Tokyo five. Drawn as-is that is
 * five overlapping rings and five stacked "Shibuya" labels — which reads as a
 * rendering bug, because it is one.
 *
 * Collapsing by name is a display decision, so it lives here rather than in the
 * generator: the asset stays a faithful extract of what OSM holds, and this layer
 * decides how to draw it. The kept node is the lowest OSM id, which is arbitrary
 * but stable — any of them is within a block of the concourse, and at this map's
 * scale they are the same dot.
 */
function dedupeByName(stations: StationPoint[]): StationPoint[] {
  const byName = new Map<string, StationPoint>();
  // Ascending id first, so "the lowest id wins" is deterministic.
  for (const station of [...stations].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!byName.has(station.name)) byName.set(station.name, station);
  }
  return [...byName.values()];
}

/**
 * Stations, projected and tiered.
 *
 * Prominence comes from the editorial list in ./landmarks.ts; position and name
 * come from OSM. A station absent from that list still renders, as an unlabelled
 * node at the closest detail level -- the list decides labelling, not existence.
 *
 * Sorted by prominence so that when labels are placed, the important ones are
 * considered first and win any collision.
 */
export const STATIONS: StationPoint[] = dedupeByName(
  (stationsLayer as FeatureLayer).features.flatMap((feature) => {
    const pair = feature.coordinates[0];
    if (!pair) return [];
    const at = toLatLng(pair);
    if (!isWithinBounds(at)) return [];

    const name = feature.tags?.name ?? feature.tags?.["name:en"] ?? "";
    if (name === "") return [];

    const tier = STATION_TIER_BY_NAME.get(name);
    const { x, y } = project(at);
    return [
      {
        id: feature.id,
        name,
        label: tier?.label ?? null,
        at,
        // project() is exact by design; svgNumber is the one rounding boundary.
        x: svgNumber(x),
        y: svgNumber(y),
        minDetail: tier?.prominence ?? 3,
        labelled: tier !== undefined,
      } satisfies StationPoint,
    ];
  }),
  // Sorted after deduping, so prominence order is not disturbed by it.
).sort(
  (a, b) =>
    a.minDetail - b.minDetail ||
    Number(b.labelled) - Number(a.labelled) ||
    a.id.localeCompare(b.id),
);

/**
 * Per-layer subpath counts, for the tests and the asset-size report.
 *
 * Counting `M` commands rather than array lengths, because after combining there
 * is no array left to count -- and this is the number that actually describes how
 * much geometry reaches the browser.
 */
function subpathCount(d: string): number {
  let count = 0;
  for (const character of d) if (character === "M") count += 1;
  return count;
}

export const GEOGRAPHY_STATS = {
  water: subpathCount(WATER_PATH),
  waterways: subpathCount(WATERWAY_PATH),
  parks: subpathCount(PARK_PATH),
  wards: subpathCount(WARD_PATH),
  roadsMajor: subpathCount(ROAD_MAJOR_PATH),
  roadsSecondary: subpathCount(ROAD_SECONDARY_PATH),
  railSurface: subpathCount(RAIL_SURFACE_PATH),
  railSubway: subpathCount(RAIL_SUBWAY_PATH),
  stations: STATIONS.length,
  labelledStations: STATIONS.filter((station) => station.labelled).length,
} as const;
