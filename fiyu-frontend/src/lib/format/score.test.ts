import { describe, expect, it } from "vitest";

import {
  MISSING_VALUE,
  formatFiyuScore,
  formatScore,
  hasGoldFiyuTreatment,
  normalizeSignal,
  parseScoreBand,
  scoreBandLabel,
} from "@/lib/format/score";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

describe("band parsing", () => {
  it("accepts every band the backend can emit", () => {
    // public_score.py:111-130
    for (const band of ["exceptional", "strong", "promising", "borderline", "not_recommended"]) {
      expect(parseScoreBand(band)).toBe(band);
    }
  });

  it("returns null for unknown or absent bands instead of throwing", () => {
    expect(parseScoreBand("future_band")).toBeNull();
    expect(parseScoreBand(null)).toBeNull();
  });

  it("recognises every band present in the real catalog", () => {
    for (const row of restaurantsFixture) {
      expect(parseScoreBand(row.score_band)).not.toBeNull();
    }
  });
});

describe("scoreBandLabel", () => {
  it("labels the bands that are shown as chips", () => {
    expect(scoreBandLabel("exceptional")).toBe("Exceptional");
    expect(scoreBandLabel("strong")).toBe("Strong");
    expect(scoreBandLabel("promising")).toBe("Promising");
    expect(scoreBandLabel("borderline")).toBe("Emerging");
  });

  it("suppresses the chip for not_recommended rather than labelling it", () => {
    // These rows are capped at 54.99 by the chain/evidence rules but were still
    // published manually. The numeric score is shown; the chip is not.
    expect(scoreBandLabel("not_recommended")).toBeNull();
  });

  it("suppresses the chip for unknown bands", () => {
    expect(scoreBandLabel("something_new")).toBeNull();
    expect(scoreBandLabel(null)).toBeNull();
  });
});

describe("formatScore", () => {
  it("displays the backend score on a one-decimal 10-point scale", () => {
    expect(formatFiyuScore(88)).toBe("8.8");
    expect(formatScore(90)).toBe("9.0");
    expect(formatScore(54.99)).toBe("5.5");
  });

  it("renders a placeholder when the score is absent or not finite", () => {
    expect(formatScore(null)).toBe(MISSING_VALUE);
    expect(formatScore(Number.NaN)).toBe(MISSING_VALUE);
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe(MISSING_VALUE);
  });
});

describe("gold treatment", () => {
  it("starts at an internal score of 90", () => {
    expect(hasGoldFiyuTreatment(90)).toBe(true);
    expect(hasGoldFiyuTreatment(89.99)).toBe(false);
    expect(hasGoldFiyuTreatment(null)).toBe(false);
  });
});

describe("normalizeSignal", () => {
  it("maps 0-100 onto 0-1", () => {
    expect(normalizeSignal(0)).toBe(0);
    expect(normalizeSignal(50)).toBe(0.5);
    expect(normalizeSignal(100)).toBe(1);
  });

  it("clamps out-of-range values rather than propagating them", () => {
    expect(normalizeSignal(140)).toBe(1);
    expect(normalizeSignal(-20)).toBe(0);
  });

  it("returns null when the signal is absent", () => {
    expect(normalizeSignal(null)).toBeNull();
    expect(normalizeSignal(Number.NaN)).toBeNull();
  });
});
