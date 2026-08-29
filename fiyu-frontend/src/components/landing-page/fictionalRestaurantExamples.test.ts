import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_FICTIONAL_EXAMPLES,
  LOCATION_SETS,
  scoreMarkValue,
} from "@/components/landing-page/fictionalRestaurantExamples";

const LANDING_DIR = join(process.cwd(), "src", "components", "landing-page");
const read = (name: string) => readFileSync(join(LANDING_DIR, name), "utf8");

/**
 * These guards exist because the failure mode is silent and expensive: a
 * marketing fixture that grows an id, a coordinate or a link is one refactor away
 * from being treated as a catalog entity, and a real underexposed restaurant
 * printed on a public page is exactly what Fiyu is supposed to prevent.
 */
describe("marketing examples cannot become real entities", () => {
  it("carries no identifier that anything could resolve", () => {
    for (const example of ALL_FICTIONAL_EXAMPLES) {
      const fields = Object.keys(example);
      for (const banned of ["id", "place_id", "placeId", "restaurantId", "userId"]) {
        expect(fields, `${example.key} must not carry ${banned}`).not.toContain(banned);
      }
      // A Google place id always starts with this. A slug never can.
      expect(example.key).not.toMatch(/^ChIJ/);
      expect(example.key).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("carries no geometry, no photo and no backend score field", () => {
    for (const example of ALL_FICTIONAL_EXAMPLES) {
      const fields = Object.keys(example);
      for (const banned of [
        "latitude",
        "longitude",
        "lat",
        "lng",
        "coordinates",
        "photo",
        "photoUrl",
        "mediaUrl",
        "googleMapsUri",
        "fiyu_score",
        "score",
        "scoreBand",
        "score_band",
      ]) {
        expect(fields, `${example.key} must not carry ${banned}`).not.toContain(banned);
      }
      // The score lives on the public 0-10 scale under a name that cannot be
      // mistaken for the backend's 0-100 `fiyu_score`.
      expect(example.displayScore).toBeGreaterThan(0);
      expect(example.displayScore).toBeLessThanOrEqual(10);
      expect(scoreMarkValue(example.displayScore)).toBe(example.displayScore * 10);
    }
  });

  it("is unique, and is the only example source the landing page has", () => {
    const keys = ALL_FICTIONAL_EXAMPLES.map((example) => example.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(19);

    // The file that held real published catalog rows is deleted, not merely
    // unused, so no import can reach one again.
    expect(() => read("landingExamples.ts")).toThrow();
  });

  it("is never linked, mapped or fetched from a landing-page surface", () => {
    const sources = [
      "HeroSection.tsx",
      "HowFiyuWorks.tsx",
      "LookBeyondSection.tsx",
      "OnlyAFewSection.tsx",
      "PickedNearbySection.tsx",
      "PickComposition.tsx",
      "RestaurantMoment.tsx",
      "ExamplePickCard.tsx",
      "fictionalRestaurantExamples.ts",
    ].map((name) => [name, read(name)] as const);

    for (const [name, source] of sources) {
      for (const banned of [
        "/restaurants/",
        "google.com/maps",
        "maps.google",
        "fetchRestaurant",
        "fetchPhotoPreview",
        "fetchLocationAnchors",
        "@/lib/api/client",
        "@/lib/api/schemas",
        "supabase",
      ]) {
        expect(source, `${name} must not reference ${banned}`).not.toContain(banned);
      }
    }
  });

  it("spans the cities the page walks through, and invents every restaurant", () => {
    const cities = new Set(ALL_FICTIONAL_EXAMPLES.map((example) => example.city));
    expect([...cities].sort()).toEqual(["Los Angeles", "New York", "Paris", "Seoul", "Tokyo"]);

    // The location demonstration uses the three areas a visitor recognises.
    expect(LOCATION_SETS.map((set) => set.area)).toEqual(["Shinjuku", "Shibuya", "Ginza"]);
    for (const set of LOCATION_SETS) {
      expect(set.picks).toHaveLength(3);
      // Nearby, not the same name repeated back at the reader.
      expect(set.picks.map((pick) => pick.area)).not.toContain(set.area);
    }
  });
});
