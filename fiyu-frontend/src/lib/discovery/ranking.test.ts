import { describe, expect, it } from "vitest";

import type { PublicRestaurant } from "@/lib/api/schemas";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { selectBrowsable } from "@/lib/discovery/filters";
import {
  DEFAULT_MODE,
  DISCOVERY_MODES,
  fiyuRankingAdapter,
  getMode,
  isModeAvailable,
  rankByMode,
} from "@/lib/discovery/ranking";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

function make(overrides: Partial<PublicRestaurant> & { place_id: string }) {
  return publicRestaurantSchema.parse(overrides);
}

describe("discovery modes", () => {
  it("exposes Local and Trending, in that order", () => {
    expect(DISCOVERY_MODES.map((m) => m.id)).toEqual(["local", "trending"]);
    expect(DISCOVERY_MODES.map((m) => m.label)).toEqual(["Local", "Trending"]);
  });

  it("defaults to Local, because Trending would render empty", () => {
    expect(DEFAULT_MODE).toBe("local");
    expect(isModeAvailable(DEFAULT_MODE)).toBe(true);
  });

  it("marks Trending unavailable until a data source exists", () => {
    expect(isModeAvailable("trending")).toBe(false);
  });

  it("throws on an unknown mode rather than silently ranking wrong", () => {
    // @ts-expect-error deliberately invalid mode
    expect(() => getMode("popular")).toThrow();
  });
});

describe("fiyuRankingAdapter", () => {
  it("reports that popularity data is unavailable", () => {
    expect(fiyuRankingAdapter.popularityAvailable).toBe(false);
  });

  it("returns null popularity for every restaurant in the real catalog", () => {
    // Guards against a future edit substituting fiyu_score, or reading the
    // community_* counters, as a popularity proxy.
    for (const row of restaurantsFixture) {
      expect(fiyuRankingAdapter.popularity(publicRestaurantSchema.parse(row))).toBeNull();
    }
  });

  it("returns null popularity even if community counters were populated", () => {
    const withCommunity = make({
      place_id: "a",
      community_recommendation_count: 42,
      community_positive_count: 40,
      community_recommendation_rate: 0.95,
      community_stats_visible: true,
    });
    expect(fiyuRankingAdapter.popularity(withCommunity)).toBeNull();
  });

  it("derives pick strength from fiyu_score", () => {
    expect(fiyuRankingAdapter.pickStrength(make({ place_id: "a", fiyu_score: 95 }))).toBeCloseTo(
      0.95,
    );
  });

  it("returns null pick strength when the score is absent", () => {
    expect(fiyuRankingAdapter.pickStrength(make({ place_id: "bare" }))).toBeNull();
  });
});

describe("Local mode", () => {
  const catalog = [
    make({ place_id: "low", fiyu_score: 60 }),
    make({ place_id: "high", fiyu_score: 95 }),
  ];

  it("ranks by fiyu_score, highest first", () => {
    expect(rankByMode(catalog, "local").map((r) => r.place_id)).toEqual(["high", "low"]);
  });

  it("does not mutate the input array", () => {
    const input = [...catalog];
    rankByMode(input, "local");
    expect(input.map((r) => r.place_id)).toEqual(["low", "high"]);
  });

  it("is stable and deterministic when scores tie", () => {
    const tied = [
      make({ place_id: "zzz", fiyu_score: 80 }),
      make({ place_id: "aaa", fiyu_score: 80 }),
    ];
    // Tiebreak on place_id keeps server and client render order identical.
    expect(rankByMode(tied, "local").map((r) => r.place_id)).toEqual(["aaa", "zzz"]);
    expect(rankByMode([...tied].reverse(), "local").map((r) => r.place_id)).toEqual([
      "aaa",
      "zzz",
    ]);
  });

  it("sorts restaurants with no score last instead of treating them as zero", () => {
    const withGap = [make({ place_id: "none" }), make({ place_id: "low", fiyu_score: 1 })];
    expect(rankByMode(withGap, "local").map((r) => r.place_id)).toEqual(["low", "none"]);
  });

  it("handles an empty catalog", () => {
    expect(rankByMode([], "local")).toEqual([]);
  });
});

describe("Trending mode", () => {
  const catalog = [
    make({ place_id: "a", fiyu_score: 90 }),
    make({ place_id: "b", fiyu_score: 60 }),
  ];

  it("returns nothing, because no trending data source exists", () => {
    expect(rankByMode(catalog, "trending")).toEqual([]);
  });

  it("does not fall back to the Fiyu score ordering", () => {
    // The empty result must be a real absence, not a copy of Local.
    expect(rankByMode(catalog, "trending")).not.toEqual(rankByMode(catalog, "local"));
  });
});

describe("Local against the real catalog", () => {
  const browsable = selectBrowsable(
    restaurantsFixture.map((row) => publicRestaurantSchema.parse(row)),
  ).restaurants;

  it("leads with Hamadayama Jojoen then Atarayo", () => {
    const top = rankByMode(browsable, "local").slice(0, 2);
    expect(top[0].name_en).toBe("Hamadayama Jojoen");
    expect(top[1].name_en).toBe("Atarayo Akihabara");
  });

  it("orders strictly by descending fiyu_score", () => {
    const scores = rankByMode(browsable, "local").map((r) => r.fiyu_score ?? 0);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("contains no withheld restaurants", () => {
    expect(rankByMode(browsable, "local").some((r) => r.score_band === "not_recommended")).toBe(
      false,
    );
  });

  it("preserves every browsable restaurant", () => {
    expect(rankByMode(browsable, "local")).toHaveLength(browsable.length);
  });
});
