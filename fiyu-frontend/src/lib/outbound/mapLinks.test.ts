import { describe, expect, it } from "vitest";

import { type PublicRestaurant, publicRestaurantSchema } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { appleMapsUrl, googleMapsUrl, outboundMapLinks } from "@/lib/outbound/mapLinks";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/** A restaurant the backend cleared for coordinate-based navigation. */
function precise(overrides: Record<string, unknown> = {}): PublicRestaurant {
  return publicRestaurantSchema.parse({
    place_id: "ChIJKdddfwDzGGAR1YfPayuwpFo",
    name_ja: "浜田山叙々苑",
    name_en: "Hamadayama Jojoen",
    latitude: 35.6819325,
    longitude: 139.6273512,
    location_precision: "exact",
    map_display_eligible: true,
    directions_coordinates_eligible: true,
    ...overrides,
  });
}

/** A chome-anchored restaurant: real coordinates, but not a navigable point. */
function approximate(overrides: Record<string, unknown> = {}): PublicRestaurant {
  return publicRestaurantSchema.parse({
    place_id: "ChIJKdddfwDzGGAR1YfPayuwpFo",
    name_ja: "浜田山叙々苑",
    latitude: 35.68212640976458,
    longitude: 139.6297809321488,
    location_precision: "chome",
    map_display_eligible: true,
    map_location_approximate: true,
    directions_coordinates_eligible: false,
    external_map_search_query: "東京都杉並区浜田山3-30-5",
    ...overrides,
  });
}

function url(href: string | null): URL {
  expect(href).not.toBeNull();
  return new URL(href as string);
}

describe("googleMapsUrl", () => {
  it("positions by coordinates when the backend cleared them", () => {
    const parsed = url(googleMapsUrl(precise()));
    expect(parsed.origin + parsed.pathname).toBe("https://www.google.com/maps/search/");
    expect(parsed.searchParams.get("query")).toBe("35.6819325,139.6273512");
    expect(parsed.searchParams.get("query_place_id")).toBe("ChIJKdddfwDzGGAR1YfPayuwpFo");
  });

  it("uses the verified written address for an approximate location", () => {
    const parsed = url(googleMapsUrl(approximate()));
    expect(parsed.searchParams.get("query")).toBe("東京都杉並区浜田山3-30-5");
    // The place id is an identifier, not a position, so it stays.
    expect(parsed.searchParams.get("query_place_id")).toBe("ChIJKdddfwDzGGAR1YfPayuwpFo");
  });

  it("does not request directions or embed a map", () => {
    expect(googleMapsUrl(precise())).not.toMatch(/dir\/|directions|embed|maps\/embed/);
  });
});

describe("appleMapsUrl", () => {
  it("positions by coordinates and labels with the primary name", () => {
    const parsed = url(appleMapsUrl(precise()));
    expect(parsed.origin + parsed.pathname).toBe("https://maps.apple.com/");
    expect(parsed.searchParams.get("ll")).toBe("35.6819325,139.6273512");
    expect(parsed.searchParams.get("q")).toBe("浜田山叙々苑");
  });

  it("omits ll entirely for an approximate location", () => {
    // Letting Apple geocode the address beats dropping someone at a centroid.
    const parsed = url(appleMapsUrl(approximate()));
    expect(parsed.searchParams.get("ll")).toBeNull();
    expect(parsed.searchParams.get("q")).toBe("東京都杉並区浜田山3-30-5");
  });

  it("encodes Japanese names safely", () => {
    expect(appleMapsUrl(precise())).toContain("q=%E6%B5%9C%E7%94%B0%E5%B1%B1");
  });

  it("falls back to the English name when there is no Japanese one", () => {
    expect(url(appleMapsUrl(precise({ name_ja: null }))).searchParams.get("q")).toBe(
      "Hamadayama Jojoen",
    );
  });

  it("falls back to a generic label when a restaurant is unnamed", () => {
    expect(
      url(appleMapsUrl(precise({ name_ja: null, name_en: null }))).searchParams.get("q"),
    ).toBe("Restaurant");
  });
});

describe("outboundMapLinks", () => {
  it("offers exactly the two documented destinations", () => {
    expect(outboundMapLinks(precise()).map((link) => link.id)).toEqual(["google", "apple"]);
  });

  it("labels each action clearly", () => {
    expect(outboundMapLinks(precise()).map((link) => link.label)).toEqual([
      "Open in Google Maps",
      "Open in Apple Maps",
    ]);
  });

  it("produces absolute https URLs", () => {
    for (const link of outboundMapLinks(precise())) {
      expect(link.href.startsWith("https://")).toBe(true);
    }
  });

  it("still offers both destinations for an approximate, addressed restaurant", () => {
    expect(outboundMapLinks(approximate()).map((link) => link.id)).toEqual(["google", "apple"]);
  });
});

describe("a link is never built from an approximate coordinate", () => {
  /**
   * THE REQUIREMENT, stated directly. An approximate coordinate must not reach a
   * maps app as a destination -- a chome anchor is nominal to 100-400 m, so it
   * would drop someone at a block centroid while presenting it as the restaurant.
   */
  it("puts no coordinate digits in any URL for an approximate restaurant", () => {
    const restaurant = approximate();
    for (const link of outboundMapLinks(restaurant)) {
      expect(link.href).not.toContain(String(restaurant.latitude));
      expect(link.href).not.toContain(String(restaurant.longitude));
      // Not even a truncated form.
      expect(link.href).not.toMatch(/35\.6/);
      expect(link.href).not.toMatch(/139\.6[0-9]/);
    }
  });

  it("holds for every approximate restaurant in the live catalog", () => {
    const approximateRows = mappableRestaurants(
      restaurantsFixture.map((row) => publicRestaurantSchema.parse(row)),
    ).filter((row) => row.map_location_approximate);

    expect(approximateRows).toHaveLength(3);

    for (const restaurant of approximateRows) {
      const links = outboundMapLinks(restaurant);
      // Each has a verified written address, so directions are still offered.
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(decodeURIComponent(link.href)).toContain(restaurant.external_map_search_query);
        expect(link.href).not.toContain(String(restaurant.latitude));
        expect(link.href).not.toContain(String(restaurant.longitude));
      }
    }
  });

  it("offers nothing at all when there is neither a point nor an address", () => {
    const nothing = publicRestaurantSchema.parse({
      place_id: "x",
      latitude: 35.68,
      longitude: 139.76,
      map_display_eligible: true,
      map_location_approximate: true,
      directions_coordinates_eligible: false,
      external_map_search_query: null,
    });
    // No coordinate fallback. That is the rule with teeth.
    expect(googleMapsUrl(nothing)).toBeNull();
    expect(appleMapsUrl(nothing)).toBeNull();
    expect(outboundMapLinks(nothing)).toEqual([]);
  });

  it("offers nothing for a restaurant the backend has not cleared", () => {
    const ineligible = publicRestaurantSchema.parse({
      place_id: "x",
      latitude: 35.68,
      longitude: 139.76,
      location_precision: "exact",
      map_display_eligible: false,
      // Even if this flag were set, isMappable must still gate the branch.
      directions_coordinates_eligible: true,
    });
    expect(outboundMapLinks(ineligible)).toEqual([]);
  });
});
