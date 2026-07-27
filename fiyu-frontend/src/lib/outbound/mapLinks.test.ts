import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";
import { appleMapsUrl, googleMapsUrl, outboundMapLinks } from "@/lib/outbound/mapLinks";

function mappable(overrides: Record<string, unknown> = {}): MappableRestaurant {
  const [only] = mappableRestaurants([
    publicRestaurantSchema.parse({
      place_id: "ChIJKdddfwDzGGAR1YfPayuwpFo",
      name_ja: "浜田山叙々苑",
      name_en: "Hamadayama Jojoen",
      latitude: 35.6819325,
      longitude: 139.6273512,
      location_precision: "exact",
      map_display_eligible: true,
      ...overrides,
    }),
  ]);
  return only;
}

describe("googleMapsUrl", () => {
  it("positions by coordinates and disambiguates with the place id", () => {
    const url = new URL(googleMapsUrl(mappable()));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("query")).toBe("35.6819325,139.6273512");
    expect(url.searchParams.get("query_place_id")).toBe("ChIJKdddfwDzGGAR1YfPayuwpFo");
  });

  it("does not request directions or embed a map", () => {
    const url = googleMapsUrl(mappable());
    expect(url).not.toMatch(/dir\/|directions|embed|maps\/embed/);
  });
});

describe("appleMapsUrl", () => {
  it("positions by coordinates and labels with the primary name", () => {
    const url = new URL(appleMapsUrl(mappable()));
    expect(url.origin + url.pathname).toBe("https://maps.apple.com/");
    expect(url.searchParams.get("ll")).toBe("35.6819325,139.6273512");
    expect(url.searchParams.get("q")).toBe("浜田山叙々苑");
  });

  it("encodes Japanese names safely", () => {
    expect(appleMapsUrl(mappable())).toContain("q=%E6%B5%9C%E7%94%B0%E5%B1%B1");
  });

  it("falls back to the English name when there is no Japanese one", () => {
    expect(new URL(appleMapsUrl(mappable({ name_ja: null }))).searchParams.get("q")).toBe(
      "Hamadayama Jojoen",
    );
  });

  it("falls back to a generic label when a restaurant is unnamed", () => {
    expect(
      new URL(appleMapsUrl(mappable({ name_ja: null, name_en: null }))).searchParams.get("q"),
    ).toBe("Restaurant");
  });
});

describe("outboundMapLinks", () => {
  it("offers exactly the two documented destinations", () => {
    expect(outboundMapLinks(mappable()).map((link) => link.id)).toEqual(["google", "apple"]);
  });

  it("labels each action clearly", () => {
    expect(outboundMapLinks(mappable()).map((link) => link.label)).toEqual([
      "Open in Google Maps",
      "Open in Apple Maps",
    ]);
  });

  it("produces absolute https URLs", () => {
    for (const link of outboundMapLinks(mappable())) {
      expect(link.href.startsWith("https://")).toBe(true);
    }
  });
});

describe("links cannot be built from unverified coordinates", () => {
  it("excludes an ineligible restaurant at the type level", () => {
    // mappableRestaurants is the only way to obtain the argument type, so a
    // restaurant the backend has not cleared can never reach these helpers.
    const ineligible = publicRestaurantSchema.parse({
      place_id: "x",
      latitude: 35.68,
      longitude: 139.76,
      location_precision: "exact",
      map_display_eligible: false,
    });
    expect(mappableRestaurants([ineligible])).toEqual([]);
  });
});
