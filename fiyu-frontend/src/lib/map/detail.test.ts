import { describe, expect, it } from "vitest";

import {
  DETAIL_LEVELS,
  DETAIL_THRESHOLDS,
  type DetailLevel,
  detailLevelFor,
  detailLevelLabel,
  isVisibleAt,
  thresholdsAreReachable,
} from "@/lib/map/detail";
import { MAX_SCALE, MIN_SCALE, ZOOM_STEP } from "@/lib/map/viewport";

describe("detailLevelFor", () => {
  it("starts at the overview level", () => {
    expect(detailLevelFor(MIN_SCALE)).toBe(1);
  });

  it("reaches the closest level at maximum zoom", () => {
    expect(detailLevelFor(MAX_SCALE)).toBe(3);
  });

  it("is monotonic across the whole scale range", () => {
    let previous = 0;
    for (let scale = MIN_SCALE; scale <= MAX_SCALE; scale += 0.05) {
      const level = detailLevelFor(scale);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("returns the overview level for a corrupt scale rather than throwing", () => {
    // Matches clampScale's reasoning: showing the whole map is recoverable.
    expect(detailLevelFor(Number.NaN)).toBe(1);
    expect(detailLevelFor(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("changes at most twice across the range, which is what keeps panning cheap", () => {
    const levels = new Set<DetailLevel>();
    for (let scale = MIN_SCALE; scale <= MAX_SCALE; scale += 0.01) {
      levels.add(detailLevelFor(scale));
    }
    expect(levels.size).toBe(3);
  });

  /**
   * The initial auto-fit for the current catalog lands near 1.78. Opening the map
   * should show the calm overview, so that must still be level 1.
   */
  it("keeps the default auto-fit at the overview level", () => {
    expect(detailLevelFor(1.7768514)).toBe(1);
  });

  it("is reachable by pressing the zoom control", () => {
    // Three presses from the default must reach the closest level, or the
    // street-detail layers would be effectively unreachable by keyboard.
    const afterPresses = (n: number) => MIN_SCALE * ZOOM_STEP ** n;
    expect(detailLevelFor(afterPresses(1))).toBe(1);
    expect(detailLevelFor(afterPresses(2))).toBe(2);
    expect(detailLevelFor(afterPresses(3))).toBe(3);
  });
});

describe("isVisibleAt", () => {
  it("is additive: detail never disappears as you zoom in", () => {
    for (const minDetail of DETAIL_LEVELS) {
      let seen = false;
      for (const level of DETAIL_LEVELS) {
        const visible = isVisibleAt(minDetail, level);
        if (visible) seen = true;
        // Once a layer is visible it must stay visible at every closer level.
        if (seen) expect(visible).toBe(true);
      }
    }
  });

  it("shows overview features at every level", () => {
    for (const level of DETAIL_LEVELS) {
      expect(isVisibleAt(1, level)).toBe(true);
    }
  });

  it("hides close-zoom features at the overview", () => {
    expect(isVisibleAt(3, 1)).toBe(false);
    expect(isVisibleAt(2, 1)).toBe(false);
  });
});

describe("thresholds", () => {
  it("all sit inside the usable scale range", () => {
    // A threshold above MAX_SCALE would make its layers dead code.
    expect(thresholdsAreReachable()).toBe(true);
  });

  it("increase strictly with the level", () => {
    expect(DETAIL_THRESHOLDS[1]).toBeLessThan(DETAIL_THRESHOLDS[2]);
    expect(DETAIL_THRESHOLDS[2]).toBeLessThan(DETAIL_THRESHOLDS[3]);
  });
});

describe("detailLevelLabel", () => {
  it("describes every level", () => {
    for (const level of DETAIL_LEVELS) {
      expect(detailLevelLabel(level)).toMatch(/\w/);
    }
  });

  it("gives each level a distinct description", () => {
    const labels = DETAIL_LEVELS.map(detailLevelLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
