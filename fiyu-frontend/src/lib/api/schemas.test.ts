import { describe, expect, it } from "vitest";

import {
  dailyPickAssignmentResponseSchema,
  googlePhotoSchema,
  locationAnchorListSchema,
  parseRestaurantList,
  publicRestaurantListSchema,
  publicRestaurantSchema,
} from "@/lib/api/schemas";
import anchorsFixture from "@/test/fixtures/location-anchors.json";
import photoFixture from "@/test/fixtures/photo-preview.json";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * Fixtures are unmodified responses captured from the running backend. If the
 * contract changes, these tests are the first thing that should fail.
 */

describe("publicRestaurantListSchema", () => {
  it("accepts the full published catalog as returned by the backend", () => {
    expect(publicRestaurantListSchema.safeParse(restaurantsFixture).success).toBe(true);
  });

  it("captured a non-empty catalog, so the fixture is meaningful", () => {
    expect(restaurantsFixture.length).toBeGreaterThan(0);
  });

  it("exposes no internal fields the backend forbids", () => {
    const forbidden = [
      "internal_fiyu_score",
      "why_fiyu",
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

  it("exposes no Google rating, review count, hours or price", () => {
    const forbidden = ["rating", "rating_count", "user_rating_count", "price_level", "open_now", "weekday_hours"];
    for (const row of restaurantsFixture as Record<string, unknown>[]) {
      for (const key of forbidden) {
        expect(row).not.toHaveProperty(key);
      }
    }
  });

  /**
   * LOAD-BEARING. Do not delete as redundant.
   *
   * Zod strips unknown keys silently, so a field the backend adds and this
   * schema omits vanishes with no error, no rejected row and no console
   * warning. That is exactly how 20 location fields -- including
   * map_location_approximate, location_label and directions_coordinates_eligible
   * -- were discarded while the map showed one pin instead of five.
   *
   * z.object output has exactly the declared keys, so comparing key sets makes
   * this bidirectional: it fails if the schema drops a field the backend sends,
   * AND if the schema declares one the backend has stopped sending.
   */
  it("declares exactly the keys the backend sends, dropping and inventing none", () => {
    for (const row of restaurantsFixture as Record<string, unknown>[]) {
      const parsed = publicRestaurantSchema.parse(row);
      expect(Object.keys(parsed).sort()).toEqual(Object.keys(row).sort());
    }
  });
});

describe("publicRestaurantSchema", () => {
  const minimal = { place_id: "ChIJtest" };

  it("requires only place_id and fills every other field", () => {
    const parsed = publicRestaurantSchema.parse(minimal);
    expect(parsed.place_id).toBe("ChIJtest");
    expect(parsed.name_ja).toBeNull();
    expect(parsed.description_en).toBeNull();
    expect(parsed.food_tags).toEqual([]);
    expect(parsed.signature_dishes).toEqual([]);
  });

  it("preserves the canonical enriched card description", () => {
    expect(
      publicRestaurantSchema.parse({
        place_id: "ChIJtest",
        card_description: "A focused neighborhood restaurant description.",
      }).card_description,
    ).toBe("A focused neighborhood restaurant description.");
  });

  it("preserves sanitized public enrichment without exposing source provenance", () => {
    const parsed = publicRestaurantSchema.parse({
      place_id: "ChIJtest",
      review_themes: [{
        theme: "Quiet counter atmosphere",
        sentiment: "positive",
        supporting_source_count: 2,
        confidence: 0.8,
        source_urls: ["https://internal.example"],
      }],
      practical_info: {
        reservation: { status: "recommended", confidence: 0.7 },
        source_urls: ["https://internal.example"],
      },
      opening_hours: {
        monday: { status: "closed", periods: [] },
        sources: [{ url: "https://internal.example" }],
        unresolved_conflicts: ["internal conflict"],
      },
    });

    expect(parsed.review_themes?.[0].theme).toBe("Quiet counter atmosphere");
    expect(parsed.practical_info?.reservation?.status).toBe("recommended");
    expect(parsed.opening_hours?.monday?.status).toBe("closed");
    expect(parsed.review_themes?.[0]).not.toHaveProperty("source_urls");
    expect(parsed.practical_info).not.toHaveProperty("source_urls");
    expect(parsed.opening_hours).not.toHaveProperty("sources");
    expect(parsed.opening_hours).not.toHaveProperty("unresolved_conflicts");
  });

  it("defaults map_display_eligible to false rather than true", () => {
    // Defaulting the other way would plot restaurants the backend never cleared.
    expect(publicRestaurantSchema.parse(minimal).map_display_eligible).toBe(false);
  });

  it("defaults community counters to zero and keeps them hidden", () => {
    const parsed = publicRestaurantSchema.parse(minimal);
    expect(parsed.community_recommendation_count).toBe(0);
    expect(parsed.community_positive_count).toBe(0);
    expect(parsed.community_recommendation_rate).toBeNull();
    expect(parsed.community_stats_visible).toBe(false);
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

  it("accepts unknown band and precision values so a new one cannot break the page", () => {
    const parsed = publicRestaurantSchema.parse({
      place_id: "ChIJtest",
      score_band: "brand_new_band",
      location_precision: "rooftop",
    });
    expect(parsed.score_band).toBe("brand_new_band");
    expect(parsed.location_precision).toBe("rooftop");
  });

  it("rejects a score sent as a string", () => {
    expect(
      publicRestaurantSchema.safeParse({ place_id: "ChIJtest", fiyu_score: "88.39" }).success,
    ).toBe(false);
  });

  it("defaults every location gate to the safe answer", () => {
    const parsed = publicRestaurantSchema.parse(minimal);
    expect(parsed.map_location_approximate).toBe(false);
    expect(parsed.distance_sort_eligible).toBe(false);
    expect(parsed.directions_coordinates_eligible).toBe(false);
    expect(parsed.location_label).toBeNull();
    expect(parsed.external_map_search_query).toBeNull();
    expect(parsed.provenance).toBeNull();
    expect(parsed.matched_components).toEqual({});
  });

  it("keeps the OSM provenance attribution, which must be displayed", () => {
    const parsed = publicRestaurantSchema.parse({
      place_id: "ChIJtest",
      provenance: {
        attribution: "Map data © OpenStreetMap contributors",
        osm_type: "relation",
        osm_id: 17294925,
        // An added key must not fail the parse.
        future_key: "ignored but preserved",
      },
    });
    expect(parsed.provenance?.attribution).toBe("Map data © OpenStreetMap contributors");
    expect(parsed.provenance?.osm_id).toBe(17294925);
  });
});

describe("backend location derivation", () => {
  const coordinateRows = (restaurantsFixture as Record<string, unknown>[]).filter(
    (row) => row.latitude !== null,
  );

  it("captured the five map-eligible restaurants", () => {
    expect(coordinateRows).toHaveLength(5);
  });

  /**
   * Pins the backend rule at public_catalog.py:872-874. If this breaks, the
   * frontend's distance and directions gates are reading a field that no longer
   * means what they assume.
   */
  it("derives both eligibility gates from map_location_approximate", () => {
    for (const row of coordinateRows) {
      const parsed = publicRestaurantSchema.parse(row);
      expect(parsed.distance_sort_eligible).toBe(!parsed.map_location_approximate);
      expect(parsed.directions_coordinates_eligible).toBe(!parsed.map_location_approximate);
    }
  });

  it("labels every approximate coordinate and gives it a written address", () => {
    const approximate = coordinateRows
      .map((row) => publicRestaurantSchema.parse(row))
      .filter((row) => row.map_location_approximate);

    expect(approximate).toHaveLength(3);
    for (const row of approximate) {
      expect(row.location_label).toBe("Approximate area");
      // The written address is the only safe basis for directions.
      expect(row.external_map_search_query).toBeTruthy();
    }
  });

  it("serves precision values outside any allow-list the frontend could hold", () => {
    const precisions = new Set(coordinateRows.map((row) => row.location_precision));
    // Documents why isMappable() must not gate on this field.
    expect(precisions).toContain("chome");
    expect(precisions).toContain("parcel_or_street_number");
  });
});

describe("parseRestaurantList", () => {
  it("accepts the whole real catalog with nothing rejected", () => {
    const parsed = parseRestaurantList(restaurantsFixture);
    expect(parsed?.restaurants).toHaveLength(restaurantsFixture.length);
    expect(parsed?.rejected).toEqual([]);
  });

  it("keeps valid rows when one row is malformed", () => {
    const parsed = parseRestaurantList([
      { place_id: "good-1", fiyu_score: 88 },
      { place_id: "bad", fiyu_score: "not a number" },
      { place_id: "good-2", fiyu_score: 72 },
    ]);
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
    expect(parseRestaurantList([])).toEqual({ restaurants: [], rejected: [] });
  });

  it("returns null when the payload is not an array at all", () => {
    expect(parseRestaurantList({ detail: "Restaurant not found" })).toBeNull();
    expect(parseRestaurantList(null)).toBeNull();
    expect(parseRestaurantList("<html>502</html>")).toBeNull();
  });
});

describe("googlePhotoSchema", () => {
  it("accepts a real photo-preview response", () => {
    expect(googlePhotoSchema.safeParse(photoFixture).success).toBe(true);
  });

  it("preserves author attribution, which must always be displayed", () => {
    const parsed = googlePhotoSchema.parse(photoFixture);
    expect(parsed.author_attributions.length).toBeGreaterThan(0);
    expect(parsed.author_attributions[0].display_name).toBeTruthy();
    expect(parsed.author_attributions[0].uri).toBeTruthy();
  });

  it("keeps the reporting and source links when the backend returns them", () => {
    const parsed = googlePhotoSchema.parse(photoFixture);
    expect(parsed.google_maps_uri).toBeTruthy();
    expect(parsed.flag_content_uri).toBeTruthy();
  });

  it("requires a media_url, since a photo without one cannot render", () => {
    expect(googlePhotoSchema.safeParse({ width: 100, height: 100 }).success).toBe(false);
    expect(
      googlePhotoSchema.safeParse({ media_url: "", width: 100, height: 100 }).success,
    ).toBe(false);
  });

  it("defaults attribution to an empty list rather than undefined", () => {
    const parsed = googlePhotoSchema.parse({ media_url: "u", width: 1, height: 1 });
    expect(parsed.author_attributions).toEqual([]);
  });
});

describe("locationAnchorListSchema", () => {
  it("accepts the live anchors response, which is currently empty", () => {
    const parsed = locationAnchorListSchema.safeParse(anchorsFixture);
    expect(parsed.success).toBe(true);
    // Documents that no anchor is reviewed yet; update when they are imported.
    expect(anchorsFixture).toEqual([]);
  });

  it("accepts a reviewed anchor with its approximate-nature qualifier", () => {
    const parsed = locationAnchorListSchema.parse([
      {
        id: "shibuya-station",
        display_name: "Shibuya Station",
        area_name: "Shibuya",
        latitude: 35.658,
        longitude: 139.7016,
        precision: "area_anchor",
        qualifier: "Approximate center of Shibuya",
      },
    ]);
    expect(parsed[0].qualifier).toBe("Approximate center of Shibuya");
    expect(parsed[0].precision).toBe("area_anchor");
  });

  it("rejects an anchor without coordinates", () => {
    expect(
      locationAnchorListSchema.safeParse([
        {
          id: "x",
          display_name: "X",
          area_name: "X",
          latitude: null,
          longitude: null,
          precision: "area_anchor",
          qualifier: "q",
        },
      ]).success,
    ).toBe(false);
  });
});

describe("dailyPickAssignmentResponseSchema", () => {
  it("requires exactly three backend-assigned restaurant IDs", () => {
    const response = {
      round_id: "round-one",
      city_id: "tokyo",
      place_ids: ["one", "two", "three"],
      assigned_at: "2026-08-07T12:00:00Z",
    };
    expect(dailyPickAssignmentResponseSchema.parse(response).place_ids).toEqual(response.place_ids);
    expect(
      dailyPickAssignmentResponseSchema.safeParse({ ...response, place_ids: ["one", "two"] })
        .success,
    ).toBe(false);
  });
});

describe("restaurantVisitSchema", () => {
  it("accepts the compact private Log response without internal restaurant fields", async () => {
    const { restaurantVisitSchema } = await import("@/lib/api/schemas");
    const parsed = restaurantVisitSchema.parse({
      id: "visit-one",
      place_id: "tokyo-a",
      visited_at: "2026-08-08T12:00:00+00:00",
      reaction: "love_it",
      private_note: "Private note",
      created_at: "2026-08-08T12:00:00+00:00",
      updated_at: "2026-08-08T12:00:00+00:00",
      restaurant: {
        place_id: "tokyo-a",
        name_ja: "Tokyo A",
        name_en: "Tokyo A",
        primary_category: "sushi",
        neighborhood: "Asakusa",
        fiyu_score: 91,
        score_band: "excellent",
      },
    });

    expect(parsed.private_note).toBe("Private note");
    expect(parsed.reaction).toBe("love_it");
    expect(parsed.restaurant).not.toHaveProperty("why_fiyu");
  });
});
