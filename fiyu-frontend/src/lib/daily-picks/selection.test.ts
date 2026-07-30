import { describe, expect, it } from "vitest";

import { publicRestaurantSchema, type PublicRestaurant } from "@/lib/api/schemas";
import {
  DEFAULT_DAILY_PREFERENCES,
  selectDailyRestaurants,
} from "@/lib/daily-picks/selection";

function restaurant(
  placeId: string,
  category: string,
  score: number,
  discoveryArea = "Shibuya",
): PublicRestaurant {
  return publicRestaurantSchema.parse({
    place_id: placeId,
    name_ja: `店 ${placeId}`,
    name_en: `Restaurant ${placeId}`,
    category,
    description_en: `Editorial description for ${placeId}.`,
    fiyu_score: score,
    food_tags: [category],
    discovery_area: discoveryArea,
  });
}

const catalog = [
  restaurant("sushi", "Sushi", 82),
  restaurant("ramen", "Ramen", 95),
  restaurant("yakitori", "Yakitori", 91),
  restaurant("tempura", "Tempura", 89, "Ginza"),
  restaurant("izakaya", "Izakaya", 86, "Ginza"),
  restaurant("pizza", "Pizza", 99),
];

describe("daily restaurant selection", () => {
  it("returns exactly three unique restaurants with cuisine variety", () => {
    const picks = selectDailyRestaurants(catalog, DEFAULT_DAILY_PREFERENCES, {
      seed: 20_260_729,
    });

    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((item) => item.place_id)).size).toBe(3);
    expect(new Set(picks.map((item) => item.category)).size).toBe(3);
  });

  it("honors selected Japanese categories ahead of a higher score", () => {
    const picks = selectDailyRestaurants(
      catalog,
      { categories: ["sushi"], nonJapanese: "japanese-only" },
      { seed: 42 },
    );

    expect(picks.map((item) => item.place_id)).toContain("sushi");
    expect(picks.map((item) => item.place_id)).not.toContain("pizza");
  });

  it("uses the active area as a preference without sacrificing three results", () => {
    const picks = selectDailyRestaurants(
      catalog,
      { categories: [], nonJapanese: "japanese-only" },
      { activeArea: "Ginza", seed: 42 },
    );

    expect(picks.filter((item) => item.discovery_area === "Ginza")).toHaveLength(2);
    expect(picks).toHaveLength(3);
  });

  it("deduplicates place IDs", () => {
    const picks = selectDailyRestaurants(
      [catalog[0], catalog[0], ...catalog.slice(1)],
      DEFAULT_DAILY_PREFERENCES,
      { seed: 7 },
    );

    expect(new Set(picks.map((item) => item.place_id)).size).toBe(3);
  });
});
