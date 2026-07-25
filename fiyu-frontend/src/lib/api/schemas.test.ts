import { describe, expect, it } from "vitest";

import {
  googleLiveDetailsSchema,
  parseRestaurantList,
  publicRestaurantListSchema,
  publicRestaurantSchema,
} from "@/lib/api/schemas";
import liveDetailsFixture from "@/test/fixtures/live-details.json";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * Fixtures are unmodified responses captured from the running backend
 * (GET /public/restaurants?limit=200 and one live-details call). If the backend
 * contract changes, these tests are the first thing that should fail.
 */

describe("publicRestaurantListSchema", () => {
  it("accepts the full published catalog as returned by the backend", () => {
    const result = publicRestaurantListSchema.safeParse(restaurantsFixture);
    expect(result.success).toBe(true);
  });

  it("captured a non-empty catalog, so the fixture is meaningful", () => {
    expect(restaurantsFixture.length).toBeGreaterThan(0);
  });

  it("exposes no internal fields the backend forbids", () => {
    const forbidden = [
      "internal_fiyu_score",
      "evidence",
      "evidence_json",
      "evidence_urls_json",
      "research_error",
      "model_name",
      "prompt_version",
      "source_restaurant_id",
    ];
    for (const row of restaurantsFixture as Record<string, unknown>[]) {
      for (const key of forbidden) {
        expect(row).not.toHaveProperty(key);
      }
    }
  });
});

describe("publicRestaurantSchema", () => {
  const minimal = { place_id: "ChIJtest" };

  it("requires only place_id and fills every other field", () => {
    const parsed = publicRestaurantSchema.parse(minimal);
    expect(parsed.place_id).toBe("ChIJtest");
    expect(parsed.name_ja).toBeNull();
    expect(parsed.fiyu_score).toBeNull();
    expect(parsed.food_tags).toEqual([]);
    expect(parsed.signature_dishes).toEqual([]);
  });

  it("normalises explicit nulls and missing keys to the same shape", () => {
    const fromNulls = publicRestaurantSchema.parse({
      place_id: "ChIJtest",
      name_en: null,
      food_tags: null,
    });
    expect(fromNulls).toEqual(publicRestaurantSchema.parse(minimal));
  });

  it("rejects a payload with no place_id", () => {
    expect(publicRestaurantSchema.safeParse({ name_en: "Somewhere" }).success).toBe(false);
  });

  it("rejects an empty place_id, which would build a broken detail URL", () => {
    expect(publicRestaurantSchema.safeParse({ place_id: "" }).success).toBe(false);
  });

  it("accepts unknown band values so a new backend band cannot break the page", () => {
    const parsed = publicRestaurantSchema.parse({
      place_id: "ChIJtest",
      score_band: "brand_new_band",
      confidence_band: "unheard_of",
    });
    expect(parsed.score_band).toBe("brand_new_band");
  });

  it("accepts out-of-range scores rather than failing the whole list", () => {
    const parsed = publicRestaurantSchema.parse({ place_id: "ChIJtest", fiyu_score: 140 });
    expect(parsed.fiyu_score).toBe(140);
  });

  it("rejects a score sent as a string", () => {
    expect(
      publicRestaurantSchema.safeParse({ place_id: "ChIJtest", fiyu_score: "88.39" }).success,
    ).toBe(false);
  });
});

describe("parseRestaurantList", () => {
  it("accepts the whole real catalog with nothing rejected", () => {
    const parsed = parseRestaurantList(restaurantsFixture);
    expect(parsed?.restaurants).toHaveLength(restaurantsFixture.length);
    expect(parsed?.rejected).toEqual([]);
  });

  it("keeps valid rows when one row is malformed", () => {
    // One bad record must not blank the whole catalog.
    const payload = [
      { place_id: "good-1", fiyu_score: 88 },
      { place_id: "bad", fiyu_score: "not a number" },
      { place_id: "good-2", fiyu_score: 72 },
    ];
    const parsed = parseRestaurantList(payload);
    expect(parsed?.restaurants.map((r) => r.place_id)).toEqual(["good-1", "good-2"]);
    expect(parsed?.rejected).toHaveLength(1);
  });

  it("reports the index and place_id of a rejected row", () => {
    const parsed = parseRestaurantList([{ place_id: "bad", food_tags: [1, 2] }]);
    expect(parsed?.rejected[0]).toMatchObject({ index: 0, placeId: "bad" });
    expect(parsed?.rejected[0].issues).toContain("food_tags");
  });

  it("handles a rejected row that has no usable place_id", () => {
    const parsed = parseRestaurantList([{ name_en: "No id here" }, null, "nonsense"]);
    expect(parsed?.restaurants).toEqual([]);
    expect(parsed?.rejected).toHaveLength(3);
    expect(parsed?.rejected.every((row) => row.placeId === null)).toBe(true);
  });

  it("distinguishes an empty catalog from a malformed one", () => {
    const empty = parseRestaurantList([]);
    expect(empty?.restaurants).toEqual([]);
    expect(empty?.rejected).toEqual([]);
  });

  it("returns null when the payload is not an array at all", () => {
    // Unrecoverable: the caller must raise invalid-response, not render empty.
    expect(parseRestaurantList({ detail: "Restaurant not found" })).toBeNull();
    expect(parseRestaurantList(null)).toBeNull();
    expect(parseRestaurantList("<html>502</html>")).toBeNull();
  });
});

describe("googleLiveDetailsSchema", () => {
  it("accepts a real live-details response", () => {
    const result = googleLiveDetailsSchema.safeParse(liveDetailsFixture);
    expect(result.success).toBe(true);
  });

  it("accepts the backend's zero-coerced 'unknown' values", () => {
    const parsed = googleLiveDetailsSchema.parse({
      place_id: "ChIJtest",
      name: "",
      address: "",
      latitude: 0,
      longitude: 0,
      rating: 0,
      rating_count: 0,
    });
    expect(parsed.rating_count).toBe(0);
    expect(parsed.open_now).toBeNull();
    expect(parsed.weekday_hours).toEqual([]);
  });

  it("requires the non-nullable Google fields to be present", () => {
    expect(googleLiveDetailsSchema.safeParse({ place_id: "ChIJtest" }).success).toBe(false);
  });
});
