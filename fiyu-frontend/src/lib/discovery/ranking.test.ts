import { describe, expect, it } from "vitest";

import type { PublicRestaurant } from "@/lib/api/schemas";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import {
  MODE_BLEND,
  fiyuRankingAdapter,
  hasCoordinates,
  rankByMode,
} from "@/lib/discovery/ranking";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * Synthetic rows are used here to isolate ranking behaviour from whatever the
 * live catalog happens to contain today. Real fixture data is exercised
 * separately at the bottom of this file.
 */
function makeRestaurant(overrides: Partial<PublicRestaurant> & { place_id: string }) {
  return publicRestaurantSchema.parse(overrides);
}

const hiddenButLowScore = makeRestaurant({
  place_id: "hidden",
  fiyu_score: 60,
  local_language_web_signal: 95,
});
const visibleButHighScore = makeRestaurant({
  place_id: "picked",
  fiyu_score: 95,
  local_language_web_signal: 60,
});

describe("fiyuRankingAdapter", () => {
  it("reports that popularity data is unavailable", () => {
    expect(fiyuRankingAdapter.popularityAvailable).toBe(false);
  });

  it("returns null popularity for every restaurant, including complete ones", () => {
    // Guards against a future edit quietly substituting fiyu_score as a proxy.
    for (const row of restaurantsFixture) {
      expect(fiyuRankingAdapter.popularity(publicRestaurantSchema.parse(row))).toBeNull();
    }
  });

  it("derives hiddenness from local_language_web_signal", () => {
    expect(fiyuRankingAdapter.hiddenness(hiddenButLowScore)).toBeCloseTo(0.95);
  });

  it("derives pick strength from fiyu_score", () => {
    expect(fiyuRankingAdapter.pickStrength(visibleButHighScore)).toBeCloseTo(0.95);
  });

  it("returns null for both signals when the fields are absent", () => {
    const bare = makeRestaurant({ place_id: "bare" });
    expect(fiyuRankingAdapter.hiddenness(bare)).toBeNull();
    expect(fiyuRankingAdapter.pickStrength(bare)).toBeNull();
  });
});

describe("ranking by mode", () => {
  const catalog = [visibleButHighScore, hiddenButLowScore];

  it("puts the highest Fiyu score first for top picks", () => {
    expect(rankByMode(catalog, "top-picks").map((r) => r.place_id)).toEqual([
      "picked",
      "hidden",
    ]);
  });

  it("puts the least exposed first for hidden gems", () => {
    expect(rankByMode(catalog, "hidden-gems").map((r) => r.place_id)).toEqual([
      "hidden",
      "picked",
    ]);
  });

  it("produces genuinely different orders for the two modes", () => {
    const picks = rankByMode(catalog, "top-picks").map((r) => r.place_id);
    const gems = rankByMode(catalog, "hidden-gems").map((r) => r.place_id);
    expect(picks).not.toEqual(gems);
  });

  it("does not mutate the input array", () => {
    const input = [...catalog];
    rankByMode(input, "hidden-gems");
    expect(input.map((r) => r.place_id)).toEqual(["picked", "hidden"]);
  });

  it("is stable and deterministic when scores tie", () => {
    const tied = [
      makeRestaurant({ place_id: "zzz", fiyu_score: 80, local_language_web_signal: 80 }),
      makeRestaurant({ place_id: "aaa", fiyu_score: 80, local_language_web_signal: 80 }),
    ];
    // Tiebreak on place_id keeps server and client render order identical.
    expect(rankByMode(tied, "top-picks").map((r) => r.place_id)).toEqual(["aaa", "zzz"]);
    expect(rankByMode([...tied].reverse(), "top-picks").map((r) => r.place_id)).toEqual([
      "aaa",
      "zzz",
    ]);
  });

  it("sorts restaurants with no signals last instead of treating them as zero", () => {
    const withGap = [
      makeRestaurant({ place_id: "none" }),
      makeRestaurant({ place_id: "low", fiyu_score: 1, local_language_web_signal: 1 }),
    ];
    expect(rankByMode(withGap, "top-picks").map((r) => r.place_id)).toEqual(["low", "none"]);
  });

  it("falls back to the available signal when one is missing", () => {
    const partial = [
      makeRestaurant({ place_id: "score-only", fiyu_score: 90 }),
      makeRestaurant({ place_id: "signal-only", local_language_web_signal: 10 }),
    ];
    // Ranked by hidden gems, the score-only row still beats a weak signal
    // rather than being dropped for lacking local_language_web_signal.
    expect(rankByMode(partial, "hidden-gems").map((r) => r.place_id)).toEqual([
      "score-only",
      "signal-only",
    ]);
  });

  it("clamps out-of-range blend values", () => {
    const catalogCopy = [...catalog];
    expect(fiyuRankingAdapter.rank(catalogCopy, 5).map((r) => r.place_id)).toEqual(
      rankByMode(catalogCopy, "top-picks").map((r) => r.place_id),
    );
    expect(fiyuRankingAdapter.rank(catalogCopy, -5).map((r) => r.place_id)).toEqual(
      rankByMode(catalogCopy, "hidden-gems").map((r) => r.place_id),
    );
  });

  it("handles an empty catalog", () => {
    expect(rankByMode([], "top-picks")).toEqual([]);
  });

  it("blends continuously between the two ends", () => {
    // The midpoint must be a real blend, not a snap to either extreme.
    const midpoint = fiyuRankingAdapter.rank(catalog, 0.5).map((r) => r.place_id);
    expect(midpoint).toHaveLength(2);
    expect(new Set(midpoint)).toEqual(new Set(["picked", "hidden"]));
  });
});

describe("ranking against the real catalog", () => {
  const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));

  it("preserves every restaurant in both modes", () => {
    for (const mode of ["top-picks", "hidden-gems"] as const) {
      expect(rankByMode(catalog, mode)).toHaveLength(catalog.length);
    }
  });

  it("orders top picks by descending fiyu_score, matching the backend order", () => {
    const scores = rankByMode(catalog, "top-picks").map((r) => r.fiyu_score ?? 0);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("orders hidden gems by descending local signal", () => {
    const signals = rankByMode(catalog, "hidden-gems").map(
      (r) => r.local_language_web_signal ?? 0,
    );
    for (let i = 1; i < signals.length; i += 1) {
      expect(signals[i]).toBeLessThanOrEqual(signals[i - 1]);
    }
  });

  it("actually reorders the real catalog between modes", () => {
    expect(rankByMode(catalog, "top-picks").map((r) => r.place_id)).not.toEqual(
      rankByMode(catalog, "hidden-gems").map((r) => r.place_id),
    );
  });
});

describe("MODE_BLEND", () => {
  it("pins each mode to an end of the 0-1 axis the Phase 6 slider will use", () => {
    expect(MODE_BLEND["hidden-gems"]).toBe(0);
    expect(MODE_BLEND["top-picks"]).toBe(1);
  });
});

describe("hasCoordinates", () => {
  it("accepts a mappable restaurant", () => {
    expect(
      hasCoordinates(makeRestaurant({ place_id: "a", latitude: 35.6, longitude: 139.7 })),
    ).toBe(true);
  });

  it("rejects partial or absent coordinates", () => {
    expect(hasCoordinates(makeRestaurant({ place_id: "a", latitude: 35.6 }))).toBe(false);
    expect(hasCoordinates(makeRestaurant({ place_id: "a" }))).toBe(false);
  });

  it("treats 0 as a real coordinate rather than as missing", () => {
    expect(hasCoordinates(makeRestaurant({ place_id: "a", latitude: 0, longitude: 0 }))).toBe(
      true,
    );
  });

  it("confirms every restaurant in the real catalog is mappable", () => {
    expect(catalogCoordinateGaps()).toBe(0);
  });
});

function catalogCoordinateGaps(): number {
  return restaurantsFixture
    .map((row) => publicRestaurantSchema.parse(row))
    .filter((row) => !hasCoordinates(row)).length;
}
