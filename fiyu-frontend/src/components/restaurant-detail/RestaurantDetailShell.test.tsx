// @vitest-environment jsdom
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestaurantDetailShell } from "@/components/restaurant-detail/RestaurantDetailShell";
import { publicRestaurantDetailSchema } from "@/lib/api/schemas";
import { DAILY_PICKS_STORAGE_KEY } from "@/lib/daily-picks/storage";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
const photos = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/client", () => ({ fetchPhotos: photos.fetch }));

const PHOTO_URL = "https://photos.example/transient-media";
const restaurant = publicRestaurantDetailSchema.parse({
  place_id: "detail-place",
  name_ja: "鮨さいとう",
  name_en: "Sushi Saito",
  category: "Sushi",
  description_en: "A concise, grounded description of the restaurant and its counter format.",
  latitude: 35.67,
  longitude: 139.76,
  map_display_eligible: true,
  map_location_approximate: true,
  location_precision: "chome",
  location_label: "Approximate area",
  location_status: "location_provisional",
  verified_core_address: "東京都港区六本木1丁目",
  external_map_search_query: "東京都港区六本木1丁目",
  fiyu_score: 94,
  food_tags: ["寿司", "おまかせ"],
  restaurant_type_en: "Counter sushi restaurant",
  cuisine_terms_en: ["Edomae sushi"],
  signature_dishes_en: ["Seasonal nigiri"],
  supporting_source_urls: ["https://example.com/editorial-source"],
  researched_at: "2026-07-20T12:00:00Z",
  source_reference: "https://www.openstreetmap.org/relation/123",
  provenance: { attribution: "Map data © OpenStreetMap contributors" },
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  router.back.mockReset();
  router.push.mockReset();
  photos.fetch.mockResolvedValue([
    {
      media_url: PHOTO_URL,
      width: 1200,
      height: 800,
      author_attributions: [{ display_name: "Photographer", uri: "https://author.example" }],
      google_maps_uri: "https://maps.google.com/photo-source",
      flag_content_uri: null,
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("restaurant detail view", () => {
  it("renders grounded detail sections, selected map, approximate label, and accessible photo credit", async () => {
    render(<RestaurantDetailShell restaurant={restaurant} restaurants={[restaurant]} />);

    expect(screen.getByRole("heading", { level: 1, name: "鮨さいとう" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "About" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Signature dishes" })).toBeTruthy();
    expect(screen.getByText("Seasonal nigiri")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Menu and format" })).toBeTruthy();
    expect(screen.getByText("Counter sushi restaurant")).toBeTruthy();
    expect(screen.getByText("Approximate area")).toBeTruthy();
    expect(screen.getByTestId("desktop-detail-map")).toBeTruthy();
    expect(document.querySelectorAll('[data-place-id="detail-place"]')).toHaveLength(2);

    expect(await screen.findAllByRole("img", { name: /photo 1 from Google/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Photographer" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Photo attribution: Photographer/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("why_fiyu");
    expect(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY) ?? "").not.toContain(PHOTO_URL);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(PHOTO_URL);
  });

  it("omits unsupported optional sections and degrades cleanly when photos fail", async () => {
    photos.fetch.mockRejectedValueOnce(new Error("provider unavailable"));
    const sparse = publicRestaurantDetailSchema.parse({
      ...restaurant,
      description_en: null,
      restaurant_type_en: null,
      cuisine_terms_en: [],
      signature_dishes_en: [],
      supporting_source_urls: [],
      researched_at: null,
      latitude: null,
      longitude: null,
      map_display_eligible: false,
      map_location_approximate: false,
      verified_core_address: null,
      source_reference: null,
      provenance: null,
    });

    render(<RestaurantDetailShell restaurant={sparse} restaurants={[sparse]} />);

    expect(screen.queryByRole("heading", { name: "About" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Signature dishes" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Menu and format" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Location" })).toBeNull();
    expect(screen.queryByText("Information and sources")).toBeNull();
    expect(await screen.findByText("Photos unavailable right now")).toBeTruthy();
  });

  it("preserves shared Saved state and uses Picks as the safe direct-load Back destination", async () => {
    window.localStorage.setItem(
      DAILY_PICKS_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection: null,
        discoveries: [],
        savedRestaurantIds: [],
      }),
    );
    render(<RestaurantDetailShell restaurant={restaurant} restaurants={[restaurant]} />);

    const saveButtons = await screen.findAllByRole("button", { name: "Save" });
    fireEvent.click(saveButtons[0]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Saved" }).length).toBeGreaterThan(0));
    expect(JSON.parse(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY) ?? "null").savedRestaurantIds).toContain("detail-place");

    fireEvent.click(screen.getAllByRole("button", { name: "Back to Picks" })[0]);
    expect(router.push).toHaveBeenCalledWith("/picks");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("hydrates without introducing a warning", async () => {
    photos.fetch.mockResolvedValue([]);
    const element = <RestaurantDetailShell restaurant={restaurant} restaurants={[restaurant]} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    const messages: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => messages.push(args.map(String).join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...args) => messages.push(args.map(String).join(" ")));

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(messages).toEqual([]);
  });
});
