import { describe, expect, it } from "vitest";

import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH, project } from "@/lib/map/projection";
import {
  IDENTITY_VIEW,
  MAX_SCALE,
  MIN_SCALE,
  type MapView,
  clampScale,
  clampTranslate,
  clientToViewBox,
  fitPointsIfOutsideView,
  fitToCoordinates,
  fitToPoints,
  normalizeView,
  panBy,
  viewBoxToContent,
  zoomAt,
  zoomByStep,
} from "@/lib/map/viewport";

const CENTRE = { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 };

/** Screen position of a content point under a view. */
function screenOf(point: { x: number; y: number }, view: MapView) {
  return { x: point.x * view.k + view.x, y: point.y * view.k + view.y };
}

describe("clampScale", () => {
  it("constrains zoom to the documented 1x-4x range", () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it("recovers to the whole-map view for any non-finite input", () => {
    // Corrupt state resets to fully zoomed out rather than to maximum zoom:
    // being dropped at 4x on a bug is disorienting and hard to recover from,
    // whereas 1x always shows where you are.
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MIN_SCALE);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(MIN_SCALE);
  });
});

describe("clampTranslate", () => {
  it("pins the map at the origin when fully zoomed out", () => {
    // At k = 1 there is nothing to pan to, so the map cannot be dragged away.
    expect(clampTranslate({ x: -400, y: 250, k: 1 })).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("never allows a gap at the top or left", () => {
    const view = clampTranslate({ x: 500, y: 500, k: 2 });
    expect(view.x).toBe(0);
    expect(view.y).toBe(0);
  });

  it("never allows a gap at the bottom or right", () => {
    const view = clampTranslate({ x: -99999, y: -99999, k: 2 });
    expect(view.x).toBe(VIEWBOX_WIDTH * (1 - 2));
    expect(view.y).toBe(VIEWBOX_HEIGHT * (1 - 2));
  });

  it("leaves a valid translation untouched", () => {
    const view = { x: -300, y: -200, k: 2 };
    expect(clampTranslate(view)).toEqual(view);
  });

  it("recovers from non-finite translation", () => {
    expect(clampTranslate({ x: Number.NaN, y: Number.NaN, k: 2 })).toEqual({ x: 0, y: 0, k: 2 });
  });

  it("keeps content covering the viewport at every zoom level", () => {
    for (const k of [1, 1.5, 2, 3, 4]) {
      for (const attempt of [
        { x: 9999, y: 9999 },
        { x: -9999, y: -9999 },
      ]) {
        const view = clampTranslate({ ...attempt, k });
        // Top-left of content at or before origin, bottom-right at or past the edge.
        expect(view.x).toBeLessThanOrEqual(0);
        expect(view.y).toBeLessThanOrEqual(0);
        expect(view.x + VIEWBOX_WIDTH * k).toBeGreaterThanOrEqual(VIEWBOX_WIDTH - 1e-9);
        expect(view.y + VIEWBOX_HEIGHT * k).toBeGreaterThanOrEqual(VIEWBOX_HEIGHT - 1e-9);
      }
    }
  });
});

describe("panBy", () => {
  it("moves the view and re-clamps", () => {
    const view = panBy({ x: -100, y: -100, k: 2 }, 40, 40);
    expect(view).toEqual({ x: -60, y: -60, k: 2 });
  });

  it("cannot escape the bounds however far it is dragged", () => {
    const view = panBy({ x: -100, y: -100, k: 2 }, 100000, 100000);
    expect(view).toEqual({ x: 0, y: 0, k: 2 });
  });

  it("is a no-op at minimum zoom", () => {
    expect(panBy(IDENTITY_VIEW, 250, 250)).toEqual(IDENTITY_VIEW);
  });
});

describe("zoomAt", () => {
  it("keeps the focus point visually stationary", () => {
    const view: MapView = { x: -200, y: -150, k: 2 };
    const focus = { x: 400, y: 500 };
    const content = viewBoxToContent(focus, view);

    const zoomed = zoomAt(view, 1.5, focus);
    const after = screenOf(content, zoomed);

    expect(after.x).toBeCloseTo(focus.x, 6);
    expect(after.y).toBeCloseTo(focus.y, 6);
  });

  it("respects the zoom ceiling", () => {
    expect(zoomAt(IDENTITY_VIEW, 100, CENTRE).k).toBe(MAX_SCALE);
  });

  it("respects the zoom floor and returns to the origin", () => {
    const view = zoomAt({ x: -300, y: -300, k: 2 }, 0.01, CENTRE);
    expect(view.k).toBe(MIN_SCALE);
    expect(view).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("is a no-op once already at a limit", () => {
    const atMax: MapView = { x: -100, y: -100, k: MAX_SCALE };
    expect(zoomAt(atMax, 2, CENTRE)).toEqual(clampTranslate(atMax));
  });
});

describe("zoomByStep", () => {
  it("zooms in and out about the viewport centre", () => {
    const inOnce = zoomByStep(IDENTITY_VIEW, 1);
    expect(inOnce.k).toBeGreaterThan(1);

    const backOut = zoomByStep(inOnce, -1);
    expect(backOut.k).toBeCloseTo(1, 6);
  });

  it("never exceeds the documented range however many times it is pressed", () => {
    let view = IDENTITY_VIEW;
    for (let i = 0; i < 20; i += 1) view = zoomByStep(view, 1);
    expect(view.k).toBe(MAX_SCALE);

    for (let i = 0; i < 20; i += 1) view = zoomByStep(view, -1);
    expect(view.k).toBe(MIN_SCALE);
    expect(view).toEqual(IDENTITY_VIEW);
  });
});

describe("fitToPoints", () => {
  it("returns the whole-map view for an empty set", () => {
    // An unmapped catalog must not jump somewhere meaningless.
    expect(fitToPoints([])).toEqual(IDENTITY_VIEW);
  });

  it("centres a single point without slamming to maximum zoom", () => {
    const point = { x: 300, y: 400 };
    const view = fitToPoints([point]);
    const screen = screenOf(point, view);
    expect(screen.x).toBeCloseTo(VIEWBOX_WIDTH / 2, 6);
    expect(screen.y).toBeCloseTo(VIEWBOX_HEIGHT / 2, 6);
    expect(view.k).toBeLessThanOrEqual(3);
  });

  it("brings a spread of points inside the viewport", () => {
    const points = [
      { x: 380, y: 300 },
      { x: 620, y: 700 },
      { x: 500, y: 500 },
    ];
    const view = fitToPoints(points);
    for (const point of points) {
      const screen = screenOf(point, view);
      expect(screen.x).toBeGreaterThanOrEqual(-1e-6);
      expect(screen.x).toBeLessThanOrEqual(VIEWBOX_WIDTH + 1e-6);
      expect(screen.y).toBeGreaterThanOrEqual(-1e-6);
      expect(screen.y).toBeLessThanOrEqual(VIEWBOX_HEIGHT + 1e-6);
    }
  });

  it("keeps padding between the content and the edges", () => {
    const points = [
      { x: 400, y: 400 },
      { x: 600, y: 600 },
    ];
    const view = fitToPoints(points, { padding: 100 });
    const left = screenOf(points[0], view).x;
    expect(left).toBeGreaterThanOrEqual(99);
  });

  it("handles several points stacked at one location", () => {
    const stacked = [
      { x: 500, y: 500 },
      { x: 500, y: 500 },
    ];
    const view = fitToPoints(stacked);
    expect(Number.isFinite(view.k)).toBe(true);
    expect(view.k).toBeLessThanOrEqual(MAX_SCALE);
  });

  it("produces a view that already satisfies the pan bounds", () => {
    const view = fitToPoints([
      { x: 100, y: 100 },
      { x: 900, y: 900 },
    ]);
    expect(clampTranslate(view)).toEqual(view);
  });
});

describe("fitPointsIfOutsideView", () => {
  it("returns the exact current viewport when every point is visible", () => {
    const current = clampTranslate({ x: -500, y: -500, k: 2 });
    const points = [
      { x: 300, y: 300 },
      { x: 700, y: 700 },
    ];

    expect(fitPointsIfOutsideView(points, current)).toBe(current);
  });

  it("fits every point with padding without zooming in past the current scale", () => {
    const current = clampTranslate({ x: -700, y: -700, k: 2 });
    const points = [
      { x: 120, y: 180 },
      { x: 850, y: 820 },
    ];

    const fitted = fitPointsIfOutsideView(points, current, { padding: 120 });

    expect(fitted).not.toBe(current);
    expect(fitted.k).toBeLessThanOrEqual(current.k);
    for (const point of points) {
      const screen = screenOf(point, fitted);
      expect(screen.x).toBeGreaterThanOrEqual(120 - 0.01);
      expect(screen.x).toBeLessThanOrEqual(VIEWBOX_WIDTH - 120 + 0.01);
      expect(screen.y).toBeGreaterThanOrEqual(120 - 0.01);
      expect(screen.y).toBeLessThanOrEqual(VIEWBOX_HEIGHT - 120 + 0.01);
    }
  });
});

describe("fitToCoordinates", () => {
  it("frames real restaurant coordinates", () => {
    const view = fitToCoordinates([
      { lat: 35.6812, lng: 139.7671 },
      { lat: 35.658, lng: 139.7016 },
    ]);
    expect(view.k).toBeGreaterThan(1);

    for (const coordinate of [
      { lat: 35.6812, lng: 139.7671 },
      { lat: 35.658, lng: 139.7016 },
    ]) {
      const screen = screenOf(project(coordinate), view);
      expect(screen.x).toBeGreaterThan(0);
      expect(screen.x).toBeLessThan(VIEWBOX_WIDTH);
      expect(screen.y).toBeGreaterThan(0);
      expect(screen.y).toBeLessThan(VIEWBOX_HEIGHT);
    }
  });
});

describe("clientToViewBox", () => {
  it("maps the centre of a letterboxed container to the viewBox centre", () => {
    // Wider than the viewBox: "meet" leaves bars left and right.
    const rect = { left: 0, top: 0, width: 2000, height: 1026 };
    const point = clientToViewBox(1000, 513, rect);
    expect(point.x).toBeCloseTo(VIEWBOX_WIDTH / 2, 6);
    expect(point.y).toBeCloseTo(VIEWBOX_HEIGHT / 2, 6);
  });

  it("accounts for the container's page offset", () => {
    const rect = { left: 100, top: 50, width: 1000, height: 1026 };
    const point = clientToViewBox(100, 50, rect);
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("gives the same viewBox point regardless of container size", () => {
    // This is what prevents coordinate drift on resize.
    const small = clientToViewBox(250, 256.5, { left: 0, top: 0, width: 500, height: 513 });
    const large = clientToViewBox(500, 513, { left: 0, top: 0, width: 1000, height: 1026 });
    expect(small.x).toBeCloseTo(large.x, 6);
    expect(small.y).toBeCloseTo(large.y, 6);
  });

  it("survives a zero-sized container", () => {
    expect(clientToViewBox(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("viewBoxToContent", () => {
  it("inverts the transform", () => {
    const view: MapView = { x: -250, y: -180, k: 2.5 };
    const content = { x: 333, y: 444 };
    expect(viewBoxToContent(screenOf(content, view), view).x).toBeCloseTo(content.x, 6);
    expect(viewBoxToContent(screenOf(content, view), view).y).toBeCloseTo(content.y, 6);
  });
});

describe("normalizeView", () => {
  it("repairs a view that is out of range on both axes", () => {
    const view = normalizeView({ x: 5000, y: -99999, k: 12 });
    expect(view.k).toBe(MAX_SCALE);
    expect(view.x).toBe(0);
    expect(view.y).toBe(VIEWBOX_HEIGHT * (1 - MAX_SCALE));
  });
});
