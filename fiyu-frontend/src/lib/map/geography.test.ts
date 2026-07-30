import { describe, expect, it } from "vitest";

import { DETAIL_LEVELS } from "@/lib/map/detail";
import {
  GEOGRAPHY_STATS,
  OSM_ATTRIBUTION,
  OSM_SOURCE_URL,
  PARK_PATH,
  RAIL_SUBWAY_PATH,
  RAIL_SURFACE_PATH,
  ROAD_MAJOR_PATH,
  ROAD_SECONDARY_PATH,
  STATIONS,
  WARD_PATH,
  WATER_PATH,
  WATERWAY_PATH,
} from "@/lib/map/geography";
import { LANDMARKS, PARK_LABELS, STATION_TIERS } from "@/lib/map/landmarks";
import { TOKYO_BOUNDS, isWithinBounds } from "@/lib/map/projection";

/**
 * The generated OpenStreetMap geography, and the editorial data layered on top.
 *
 * These are the tests that fail loudly when the asset pipeline has not been run,
 * when a layer's tag selector stops matching anything upstream, or when an
 * editorial name drifts out of step with the OSM data it is matched against.
 */

const ALL_PATHS = {
  water: WATER_PATH,
  waterways: WATERWAY_PATH,
  parks: PARK_PATH,
  wards: WARD_PATH,
  roadsMajor: ROAD_MAJOR_PATH,
  roadsSecondary: ROAD_SECONDARY_PATH,
  railSurface: RAIL_SURFACE_PATH,
  railSubway: RAIL_SUBWAY_PATH,
};

describe("generated layers", () => {
  it("is non-empty for every layer", () => {
    for (const [layer, d] of Object.entries(ALL_PATHS)) {
      expect(d.length, `layer ${layer} produced no geometry`).toBeGreaterThan(0);
    }
    expect(STATIONS.length).toBeGreaterThan(0);
  });

  it("produces well-formed SVG path data", () => {
    for (const [layer, d] of Object.entries(ALL_PATHS)) {
      expect(d.startsWith("M"), `${layer} does not begin with a moveto`).toBe(true);
      expect(d, layer).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("rounds every coordinate to at most two decimals", () => {
    // The hydration guarantee for the basemap: these strings must be identical on
    // the server and in the browser. See svgNumber() in projection.ts.
    for (const [layer, d] of Object.entries(ALL_PATHS)) {
      expect(d, layer).not.toMatch(/\d\.\d{3,}/);
    }
  });

  it("closes filled layers and leaves stroked layers open", () => {
    for (const layer of [WATER_PATH, PARK_PATH, WARD_PATH]) {
      expect(layer).toContain("Z");
    }
    for (const layer of [ROAD_MAJOR_PATH, RAIL_SURFACE_PATH, WATERWAY_PATH]) {
      expect(layer).not.toContain("Z");
    }
  });

  it("reports a subpath count for every layer", () => {
    for (const [layer, count] of Object.entries(GEOGRAPHY_STATS)) {
      expect(count, layer).toBeGreaterThan(0);
    }
  });

  it("carries the ODbL credit the licence requires", () => {
    expect(OSM_ATTRIBUTION).toContain("OpenStreetMap");
    expect(OSM_ATTRIBUTION).toContain("ODbL");
    expect(OSM_SOURCE_URL).toContain("openstreetmap.org");
  });
});

describe("stations", () => {
  it("keeps every station inside the projected extent", () => {
    for (const station of STATIONS) {
      expect(isWithinBounds(station.at), station.name).toBe(true);
    }
  });

  it("gives every station a name and a rounded position", () => {
    for (const station of STATIONS) {
      expect(station.name.length).toBeGreaterThan(0);
      expect(String(station.x)).toMatch(/^-?\d+(\.\d{1,2})?$/);
      expect(String(station.y)).toMatch(/^-?\d+(\.\d{1,2})?$/);
    }
  });

  it("labels a station only when the editorial list names it", () => {
    for (const station of STATIONS) {
      expect(station.labelled).toBe(station.label !== null);
    }
  });

  /**
   * THE GUARD THAT MATTERS. Station tiers are matched against OSM names by exact
   * string, so a single wrong character silently demotes a major interchange to
   * level 3 and it quietly stops being labelled at the default zoom. Nothing
   * throws; the map just gets worse.
   *
   * This caught 阿佐ヶ谷 vs 阿佐ケ谷 -- hiragana versus katakana.
   */
  it("matches every editorial station tier to a real OSM station", () => {
    const osmNames = new Set(STATIONS.map((station) => station.name));
    const unmatched = STATION_TIERS.filter((tier) => !osmNames.has(tier.name));

    expect(
      unmatched.map((tier) => `${tier.name} (${tier.label})`),
      "editorial station names not present in the generated OSM data",
    ).toEqual([]);
  });

  it("labels every major interchange at the overview zoom", () => {
    const majors = STATIONS.filter((station) => station.minDetail === 1);
    const labels = majors.map((station) => station.label);

    // The set someone can navigate the whole city by.
    for (const expected of ["Tokyo", "Shinjuku", "Shibuya", "Ikebukuro", "Ueno"]) {
      expect(labels, expected).toContain(expected);
    }
  });

  it("leaves unlisted stations as unlabelled context at the closest zoom", () => {
    const unlisted = STATIONS.filter((station) => !station.labelled);
    expect(unlisted.length).toBeGreaterThan(0);
    for (const station of unlisted) {
      expect(station.minDetail).toBe(3);
    }
  });

  it("orders stations by prominence, so important labels are placed first", () => {
    const levels = STATIONS.map((station) => station.minDetail);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it("keeps only one station node per position", () => {
    const positions = STATIONS.map((station) => `${station.x},${station.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  /**
   * REGRESSION GUARD. OSM models a large interchange as one node per operator,
   * all within a couple of hundred metres: Ikebukuro has six, Shibuya and Tokyo
   * five each. Rendered as-is that is five overlapping rings and five stacked
   * "Shibuya" labels.
   *
   * Positional dedupe alone does not catch it -- the nodes are genuinely at
   * different coordinates. Only name dedupe does.
   */
  it("keeps only one station per name, so interchange labels cannot stack", () => {
    const names = STATIONS.map((station) => station.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("labels each major interchange exactly once", () => {
    const labels = STATIONS.filter((station) => station.minDetail === 1).map(
      (station) => station.label,
    );
    expect(new Set(labels).size).toBe(labels.length);
    // Seven tier-1 anchors in the editorial list, one node each after deduping.
    expect(labels).toHaveLength(7);
  });
});

describe("editorial landmarks", () => {
  it("keeps the set small enough to stay orientation rather than decoration", () => {
    expect(LANDMARKS.length).toBeLessThanOrEqual(10);
  });

  it("places every landmark inside the map extent", () => {
    for (const landmark of LANDMARKS) {
      expect(isWithinBounds(landmark.at), landmark.id).toBe(true);
    }
  });

  it("gives every landmark both an English and a Japanese name", () => {
    for (const landmark of LANDMARKS) {
      expect(landmark.label.length, landmark.id).toBeGreaterThan(0);
      expect(landmark.labelJa.length, landmark.id).toBeGreaterThan(0);
    }
  });

  it("uses only declared detail levels", () => {
    for (const landmark of LANDMARKS) {
      expect(DETAIL_LEVELS).toContain(landmark.minDetail);
    }
    for (const label of PARK_LABELS) {
      expect(DETAIL_LEVELS).toContain(label.minDetail);
    }
  });

  it("shows some landmarks at the overview, so the map is never unanchored", () => {
    expect(LANDMARKS.filter((landmark) => landmark.minDetail === 1).length).toBeGreaterThan(2);
  });

  it("uses unique ids", () => {
    const ids = LANDMARKS.map((landmark) => landmark.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("places every park label inside the map extent", () => {
    for (const label of PARK_LABELS) {
      expect(isWithinBounds(label.at), label.id).toBe(true);
    }
  });
});

describe("generated extent agrees with the projection", () => {
  it("matches the bounds the generator clipped to", () => {
    // If these drift apart, features would be generated that cannot be projected.
    expect(TOKYO_BOUNDS).toEqual({ west: 139.56, east: 139.92, south: 35.52, north: 35.82 });
  });
});
