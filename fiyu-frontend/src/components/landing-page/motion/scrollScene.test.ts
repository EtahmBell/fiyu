import { describe, expect, it } from "vitest";

import { pinRawProgress, transitionProgress } from "@/components/landing-page/motion/scrollScene";

const VIEWPORT = 900;

/** A 200svh runway holding a 100svh stage: 900px of scrub. */
function runway(top: number, height = VIEWPORT * 2) {
  return pinRawProgress({ top, height }, VIEWPORT);
}

describe("pinned scroll geometry", () => {
  it("starts at zero on the frame the stage pins and ends on the frame it releases", () => {
    // Runway top still below the viewport top: the stage has not pinned yet.
    expect(runway(400)).toBe(0);
    expect(runway(1)).toBeCloseTo(0, 3);
    // Top exactly at the viewport top: pinned, and nothing has happened.
    expect(runway(0)).toBe(0);
    // Halfway through the scrub.
    expect(runway(-450)).toBeCloseTo(0.5, 3);
    // Runway bottom meets the viewport bottom: released, and finished.
    expect(runway(-900)).toBe(1);
    expect(runway(-2000)).toBe(1);
  });

  it("reports finished rather than scrubbing when the runway cannot hold the stage", () => {
    // This is the short-viewport and landscape-phone case. A 60px runway must
    // not race a whole sequence; it must show the completed composition.
    expect(pinRawProgress({ top: -30, height: VIEWPORT }, VIEWPORT)).toBe(1);
    expect(pinRawProgress({ top: -30, height: VIEWPORT - 200 }, VIEWPORT)).toBe(1);
  });

  it("never leaves progress outside zero to one, whatever the scroll position", () => {
    for (let top = 2000; top > -4000; top -= 37) {
      const value = runway(top);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("is a pure function of position, so reversing scroll retraces exactly", () => {
    const down = [];
    for (let top = 0; top >= -900; top -= 90) down.push(runway(top));
    const up = [];
    for (let top = -900; top <= 0; top += 90) up.push(runway(top));
    expect(down).toEqual([...up].reverse());
  });
});

describe("hold windows", () => {
  const holdIn = 0.16;
  const holdOut = 0.22;

  it("holds a composed start state, then a composed end state", () => {
    // The whole point: a reader arriving sees 0 for the first sixth of the
    // runway and 1 for the last fifth, so neither end is ever mid-animation.
    expect(transitionProgress(0, holdIn, holdOut)).toBe(0);
    expect(transitionProgress(0.1, holdIn, holdOut)).toBe(0);
    expect(transitionProgress(0.16, holdIn, holdOut)).toBe(0);
    expect(transitionProgress(0.78, holdIn, holdOut)).toBe(1);
    expect(transitionProgress(0.9, holdIn, holdOut)).toBe(1);
    expect(transitionProgress(1, holdIn, holdOut)).toBe(1);
  });

  it("spreads the transition evenly across the window between the holds", () => {
    expect(transitionProgress(0.47, holdIn, holdOut)).toBeCloseTo(0.5, 2);
    expect(transitionProgress(0.315, holdIn, holdOut)).toBeCloseTo(0.25, 2);
    expect(transitionProgress(0.625, holdIn, holdOut)).toBeCloseTo(0.75, 2);
  });

  it("degrades safely if the holds are ever set to consume the whole runway", () => {
    // Guards against a future edit dividing by zero and writing NaN into a
    // custom property, which would silently blank a whole stage.
    for (const value of [0, 0.5, 1]) {
      const progress = transitionProgress(value, 0.7, 0.7);
      expect(Number.isFinite(progress)).toBe(true);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });
});
