import { describe, expect, it } from "vitest";

import {
  TOKYO_BOUNDS,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  isWithinBounds,
  mercatorY,
  project,
  toPath,
  unproject,
} from "@/lib/map/projection";

/** Real coordinates, used to check relative geography rather than magic numbers. */
const LANDMARKS = {
  tokyoStation: { lat: 35.6812, lng: 139.7671 },
  shibuya: { lat: 35.658, lng: 139.7016 },
  ikebukuro: { lat: 35.7295, lng: 139.7109 },
  shinagawa: { lat: 35.6285, lng: 139.7387 },
};

describe("viewBox geometry", () => {
  it("uses a height derived from the Mercator aspect of the bounds", () => {
    // Any other height would vertically stretch the geography.
    const lngSpan = ((TOKYO_BOUNDS.east - TOKYO_BOUNDS.west) * Math.PI) / 180;
    const latSpan = mercatorY(TOKYO_BOUNDS.north) - mercatorY(TOKYO_BOUNDS.south);
    const expected = Math.round(VIEWBOX_WIDTH * (latSpan / lngSpan));
    expect(VIEWBOX_HEIGHT).toBe(expected);
  });
});

describe("project", () => {
  it("maps the bounds corners onto the viewBox corners", () => {
    const topLeft = project({ lat: TOKYO_BOUNDS.north, lng: TOKYO_BOUNDS.west });
    expect(topLeft.x).toBeCloseTo(0, 6);
    expect(topLeft.y).toBeCloseTo(0, 6);

    const bottomRight = project({ lat: TOKYO_BOUNDS.south, lng: TOKYO_BOUNDS.east });
    expect(bottomRight.x).toBeCloseTo(VIEWBOX_WIDTH, 6);
    expect(bottomRight.y).toBeCloseTo(VIEWBOX_HEIGHT, 6);
  });

  it("places northern places above southern ones", () => {
    // Ikebukuro is north of Tokyo Station, which is north of Shinagawa.
    expect(project(LANDMARKS.ikebukuro).y).toBeLessThan(project(LANDMARKS.tokyoStation).y);
    expect(project(LANDMARKS.tokyoStation).y).toBeLessThan(project(LANDMARKS.shinagawa).y);
  });

  it("places western places left of eastern ones", () => {
    expect(project(LANDMARKS.shibuya).x).toBeLessThan(project(LANDMARKS.tokyoStation).x);
  });

  it("is not a plain linear latitude scale", () => {
    // A linear scale would put the midpoint latitude exactly halfway down.
    const midLat = (TOKYO_BOUNDS.north + TOKYO_BOUNDS.south) / 2;
    const y = project({ lat: midLat, lng: TOKYO_BOUNDS.west }).y;
    expect(y).not.toBeCloseTo(VIEWBOX_HEIGHT / 2, 6);
    // ...but Mercator over 0.3 degrees is only slightly off centre.
    expect(Math.abs(y - VIEWBOX_HEIGHT / 2)).toBeLessThan(1);
  });

  it("projects out-of-bounds coordinates outside the viewBox rather than clamping", () => {
    // Total maths; callers filter with isWithinBounds.
    expect(project({ lat: 35.9, lng: 139.7 }).y).toBeLessThan(0);
    expect(project({ lat: 35.7, lng: 140.5 }).x).toBeGreaterThan(VIEWBOX_WIDTH);
  });
});

describe("unproject", () => {
  it("round-trips every landmark to within a millidegree", () => {
    for (const [name, coordinate] of Object.entries(LANDMARKS)) {
      const result = unproject(project(coordinate));
      expect(result.lat, name).toBeCloseTo(coordinate.lat, 9);
      expect(result.lng, name).toBeCloseTo(coordinate.lng, 9);
    }
  });

  it("round-trips the viewBox corners", () => {
    const nw = unproject({ x: 0, y: 0 });
    expect(nw.lat).toBeCloseTo(TOKYO_BOUNDS.north, 9);
    expect(nw.lng).toBeCloseTo(TOKYO_BOUNDS.west, 9);

    const se = unproject({ x: VIEWBOX_WIDTH, y: VIEWBOX_HEIGHT });
    expect(se.lat).toBeCloseTo(TOKYO_BOUNDS.south, 9);
    expect(se.lng).toBeCloseTo(TOKYO_BOUNDS.east, 9);
  });

  it("round-trips an arbitrary interior point, which pin placement depends on", () => {
    const point = { x: 412.5, y: 733.25 };
    const back = project(unproject(point));
    expect(back.x).toBeCloseTo(point.x, 6);
    expect(back.y).toBeCloseTo(point.y, 6);
  });
});

describe("isWithinBounds", () => {
  it("accepts coordinates inside Tokyo, including the edges", () => {
    expect(isWithinBounds(LANDMARKS.shibuya)).toBe(true);
    expect(isWithinBounds({ lat: TOKYO_BOUNDS.north, lng: TOKYO_BOUNDS.east })).toBe(true);
  });

  it("rejects coordinates outside the map", () => {
    expect(isWithinBounds({ lat: 34.6937, lng: 135.5023 })).toBe(false); // Osaka
    expect(isWithinBounds({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("toPath", () => {
  it("builds a move-then-line path", () => {
    const path = toPath([
      { lat: TOKYO_BOUNDS.north, lng: TOKYO_BOUNDS.west },
      { lat: TOKYO_BOUNDS.south, lng: TOKYO_BOUNDS.east },
    ]);
    expect(path).toBe(`M0.00 0.00 L${VIEWBOX_WIDTH.toFixed(2)} ${VIEWBOX_HEIGHT.toFixed(2)}`);
  });

  it("closes a polygon when asked", () => {
    expect(toPath([LANDMARKS.shibuya, LANDMARKS.ikebukuro], true).endsWith(" Z")).toBe(true);
  });

  it("returns an empty string for no coordinates", () => {
    expect(toPath([])).toBe("");
  });
});
