import { project, TOKYO_BOUNDS, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./projection";
import { IDENTITY_VIEW, MAX_SCALE, normalizeView, panBy, pinchView, viewBoxFor, zoomAt } from "./viewport";

describe("native map camera", () => {
  it("projects Tokyo bounds onto the canonical viewbox", () => {
    expect(project({ lat: TOKYO_BOUNDS.north, lng: TOKYO_BOUNDS.west })).toEqual({ x: 0, y: 0 });
    expect(project({ lat: TOKYO_BOUNDS.south, lng: TOKYO_BOUNDS.east })).toEqual({ x: VIEWBOX_WIDTH, y: VIEWBOX_HEIGHT });
  });
  it("bounds pan and zoom without losing the map", () => {
    expect(normalizeView({ x: 100, y: 100, k: 2 })).toMatchObject({ x: 0, y: 0, k: 2 });
    expect(zoomAt(IDENTITY_VIEW, 99, { x: 500, y: 513 }).k).toBe(MAX_SCALE);
    expect(panBy({ x: -100, y: -100, k: 2 }, -9999, -9999)).toEqual({ x: -1000, y: -1026, k: 2 });
  });
  it("anchors pinch at its focal point and emits a native SVG viewbox", () => {
    const view = pinchView(IDENTITY_VIEW, { x: 500, y: 500 }, 100, { x: 500, y: 500 }, 200);
    expect(view).toEqual({ x: -500, y: -500, k: 2 });
    expect(viewBoxFor(view)).toBe("250 250 500 513");
  });
});
