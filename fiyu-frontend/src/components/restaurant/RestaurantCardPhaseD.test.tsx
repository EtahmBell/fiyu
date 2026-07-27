// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import type { DiscoveryAnchor } from "@/lib/location/anchor";
import photoFixture from "@/test/fixtures/photo-preview.json";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * Phase C and D behaviour on the card: distance, Google photos with
 * attribution, editorial labels, outbound actions, and the things that must
 * never appear.
 */

const MAPPABLE = {
  place_id: "mappable",
  name_ja: "浜田山叙々苑",
  name_en: "Hamadayama Jojoen",
  latitude: 35.6819325,
  longitude: 139.6273512,
  location_precision: "exact",
  map_display_eligible: true,
};

function make(overrides: Record<string, unknown>) {
  return publicRestaurantSchema.parse({ place_id: "a", ...overrides });
}

const CURRENT_LOCATION: DiscoveryAnchor = {
  kind: "current-location",
  point: { lat: 35.6812, lng: 139.7671 },
  accuracyMeters: 20,
};

const AREA: DiscoveryAnchor = {
  kind: "area-anchor",
  point: { lat: 35.658, lng: 139.7016 },
  id: "shibuya-station",
  displayName: "Shibuya Station",
  areaName: "Shibuya",
  qualifier: "Approximate center of Shibuya",
};

beforeEach(() => {
  // IntersectionObserver is absent in jsdom; useInView falls back to a frame,
  // so photos load without needing an observer stub.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("distance", () => {
  it("shows nothing when there is no anchor", () => {
    render(<RestaurantCard restaurant={make(MAPPABLE)} />);
    expect(screen.queryByText(/from your location/)).toBeNull();
  });

  it("shows a straight-line distance from the user's location", () => {
    render(<RestaurantCard restaurant={make(MAPPABLE)} anchor={CURRENT_LOCATION} />);
    expect(screen.getByText(/from your location$/)).toBeTruthy();
  });

  it("hedges and names the area for an area anchor", () => {
    render(<RestaurantCard restaurant={make(MAPPABLE)} anchor={AREA} />);
    expect(screen.getByText(/^About .+ from Shibuya$/)).toBeTruthy();
  });

  it("spells out that the measurement is a straight line", () => {
    render(<RestaurantCard restaurant={make(MAPPABLE)} anchor={CURRENT_LOCATION} />);
    expect(screen.getByText(/from your location$/).getAttribute("title")).toMatch(
      /straight-line distance$/,
    );
  });

  it("never claims a walking distance or travel time", () => {
    const { container } = render(
      <RestaurantCard restaurant={make(MAPPABLE)} anchor={CURRENT_LOCATION} />,
    );
    expect(container.textContent).not.toMatch(/\bwalk|\bmin\b|minutes|drive|transit/i);
  });

  it("shows no distance for a map-ineligible restaurant, even with an anchor", () => {
    // Its coordinates are withheld by the backend, so any distance would be
    // invented.
    render(
      <RestaurantCard
        restaurant={make({ ...MAPPABLE, map_display_eligible: false })}
        anchor={CURRENT_LOCATION}
      />,
    );
    expect(screen.queryByText(/from your location/)).toBeNull();
  });
});

describe("outbound map actions", () => {
  it("offers Google and Apple Maps for a mappable restaurant", () => {
    render(<RestaurantCard restaurant={make(MAPPABLE)} />);
    const google = screen.getByRole("link", { name: "Open in Google Maps" });
    const apple = screen.getByRole("link", { name: "Open in Apple Maps" });

    // Parse rather than string-match: URLSearchParams percent-encodes the
    // comma, which Google accepts but a raw substring check would miss.
    expect(new URL(google.getAttribute("href")!).searchParams.get("query")).toBe(
      "35.6819325,139.6273512",
    );
    expect(new URL(apple.getAttribute("href")!).searchParams.get("ll")).toBe(
      "35.6819325,139.6273512",
    );
    expect(google.getAttribute("rel")).toContain("noopener");
  });

  it("shows nothing when the location is not verified", () => {
    render(<RestaurantCard restaurant={make({ ...MAPPABLE, map_display_eligible: false })} />);
    expect(screen.queryByRole("link", { name: /Open in/ })).toBeNull();
  });

  it("shows nothing for the real catalog, which has no verified coordinates", () => {
    for (const row of restaurantsFixture.slice(0, 3)) {
      const { unmount } = render(<RestaurantCard restaurant={publicRestaurantSchema.parse(row)} />);
      expect(screen.queryByRole("link", { name: /Open in/ })).toBeNull();
      unmount();
    }
  });
});

describe("editorial labels", () => {
  it("labels an exceptional restaurant a Fiyu Pick", () => {
    render(<RestaurantCard restaurant={make({ score_band: "exceptional" })} />);
    expect(screen.getByText("Fiyu Pick")).toBeTruthy();
  });

  it("uses no label where the band does not warrant one", () => {
    render(<RestaurantCard restaurant={make({ score_band: "borderline" })} />);
    expect(screen.queryByText(/Fiyu Pick|Hidden-Gem|Under-the-Radar/)).toBeNull();
  });
});

describe("photos", () => {
  it("reserves the aspect ratio before anything loads, so nothing shifts", () => {
    const { container } = render(<RestaurantCard restaurant={make(MAPPABLE)} />);
    expect(container.querySelector(".aspect-\\[16\\/9\\]")).toBeTruthy();
  });

  it("shows a branded placeholder rather than a broken image", () => {
    const { container } = render(<RestaurantCard restaurant={make(MAPPABLE)} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("Fiyu").length).toBeGreaterThan(0);
  });

  it("renders the photo with its author attribution once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => photoFixture,
      }),
    );

    render(<RestaurantCard restaurant={make(MAPPABLE)} />);

    const image = await screen.findByRole("img", { name: /photo from Google/ });
    expect(image.getAttribute("src")).toBe(photoFixture.media_url);

    // Attribution must travel with the photo.
    const author = photoFixture.author_attributions[0];
    const credit = await screen.findByRole("link", { name: author.display_name });
    expect(credit.getAttribute("href")).toBe(author.uri);

    // And the source and reporting links must be preserved.
    expect(screen.getByRole("link", { name: "View on Google Maps" }).getAttribute("href")).toBe(
      photoFixture.google_maps_uri,
    );
    expect(screen.getByRole("link", { name: "Report" }).getAttribute("href")).toBe(
      photoFixture.flag_content_uri,
    );
  });

  it("keeps the placeholder when the photo request fails", async () => {
    render(<RestaurantCard restaurant={make(MAPPABLE)} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("img", { name: /photo from Google/ })).toBeNull();
  });

  it("loads no photo in the dense map-sheet variant", () => {
    render(<RestaurantCard restaurant={make(MAPPABLE)} dense />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("things that must never appear", () => {
  const complete = make({
    ...MAPPABLE,
    description_en: "An editorial description.",
    score_band: "exceptional",
    food_tags: ["焼肉"],
    signature_dishes: ["カルビ"],
    community_recommendation_count: 0,
    community_stats_visible: false,
  });

  it("renders no Google rating, review count, hours or price", () => {
    const { container } = render(<RestaurantCard restaurant={complete} anchor={CURRENT_LOCATION} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/★|stars?|\brating\b|reviews?|open now|closed now|¥¥/i);
  });

  it("renders no community or engagement statistics", () => {
    const { container } = render(<RestaurantCard restaurant={complete} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/saves?|visits?|views?|recommend|community|popular|trending/i);
  });

  it("renders no why_fiyu, which the API does not expose", () => {
    const { container } = render(<RestaurantCard restaurant={complete} />);
    expect(container.textContent).not.toMatch(/why fiyu/i);
  });

  it("leaves Japanese content untranslated", () => {
    render(<RestaurantCard restaurant={complete} />);
    expect(screen.getByText("焼肉")).toBeTruthy();
    expect(screen.getByText("カルビ")).toBeTruthy();
    expect(screen.queryByText(/yakiniku|karubi/i)).toBeNull();
  });

  it("keeps name_ja as the heading with name_en beneath", () => {
    render(<RestaurantCard restaurant={complete} />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("浜田山叙々苑");
    expect(screen.getByText("Hamadayama Jojoen").tagName).toBe("P");
  });
});
