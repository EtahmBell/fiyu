import { toPath, type LatLng } from "./projection";

import parksJson from "../../../../fiyu-frontend/src/lib/map/generated/parks.json";
import railSubwayJson from "../../../../fiyu-frontend/src/lib/map/generated/rail_subway.json";
import railSurfaceJson from "../../../../fiyu-frontend/src/lib/map/generated/rail_surface.json";
import roadsMajorJson from "../../../../fiyu-frontend/src/lib/map/generated/roads_major.json";
import roadsSecondaryJson from "../../../../fiyu-frontend/src/lib/map/generated/roads_secondary.json";
import wardsJson from "../../../../fiyu-frontend/src/lib/map/generated/wards.json";
import waterJson from "../../../../fiyu-frontend/src/lib/map/generated/water.json";
import waterwaysJson from "../../../../fiyu-frontend/src/lib/map/generated/waterways.json";

type FeatureLayer = { attribution: string; source: string; features: { coordinates: number[][] }[] };
type LineLayer = { lines: number[][][] };
const coordinate = (pair: number[]): LatLng => ({ lat: pair[0], lng: pair[1] });
function linesToPath(lines: number[][][], close: boolean) { return lines.filter((line) => line.length > 1).map((line) => toPath(line.map(coordinate), close)).join(" "); }
function featuresToPath(layer: FeatureLayer, close: boolean) { return linesToPath(layer.features.map((feature) => feature.coordinates), close); }

const bay: LatLng[] = [
  { lat: 35.52, lng: 139.74 }, { lat: 35.5665, lng: 139.752 }, { lat: 35.6105, lng: 139.7705 },
  { lat: 35.6395, lng: 139.807 }, { lat: 35.6635, lng: 139.8365 }, { lat: 35.6845, lng: 139.92 },
  { lat: 35.52, lng: 139.92 },
];

export const mapGeography = {
  bay: toPath(bay, true),
  water: featuresToPath(waterJson as FeatureLayer, true),
  parks: featuresToPath(parksJson as FeatureLayer, true),
  wards: featuresToPath(wardsJson as FeatureLayer, true),
  waterways: linesToPath((waterwaysJson as LineLayer).lines, false),
  roadsMajor: linesToPath((roadsMajorJson as LineLayer).lines, false),
  roadsSecondary: linesToPath((roadsSecondaryJson as LineLayer).lines, false),
  railSurface: linesToPath((railSurfaceJson as LineLayer).lines, false),
  railSubway: linesToPath((railSubwayJson as LineLayer).lines, false),
  attribution: (parksJson as FeatureLayer).attribution,
  source: (parksJson as FeatureLayer).source,
} as const;
