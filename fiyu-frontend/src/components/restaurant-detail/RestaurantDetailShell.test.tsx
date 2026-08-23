// @vitest-environment jsdom
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByText("Counter Sushi Restaurant")).toBeTruthy();
    expect(screen.getByText("Approximate area")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open in Google Maps" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open in Apple Maps" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("desktop-detail-map")).toBeTruthy();
    expect(document.querySelectorAll('[data-place-id="detail-place"]')).toHaveLength(2);

    expect(await screen.findAllByRole("img", { name: /photo 1 from Google/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Photographer" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Photo attribution: Photographer/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("why_fiyu");
    expect(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY) ?? "").not.toContain(PHOTO_URL);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(PHOTO_URL);
  });

  it("uses the same canonical enriched description as the Picks card", () => {
    const enriched = "A restrained enriched description shared by card and detail views.";
    const enrichedRestaurant = publicRestaurantDetailSchema.parse({
      ...restaurant,
      card_description: enriched,
      description_en: "An older general description.",
    });
    render(
      <RestaurantDetailShell
        restaurant={enrichedRestaurant}
        restaurants={[enrichedRestaurant]}
      />,
    );
    expect(screen.getByText(enriched)).toBeTruthy();
    expect(screen.queryByText("An older general description.")).toBeNull();
  });

  it("shows the complete ROLLS description when incomplete enriched copy is persisted", () => {
    const fullDescription =
      "A compact wine bar in Hamamatsucho centered on wine and original spring rolls, including four distinct spring-roll varieties described by visitors as more creative than conventional Chinese spring rolls.";
    const rolls = publicRestaurantDetailSchema.parse({
      ...restaurant,
      place_id: "ChIJe1D1MyeLGGARBHKRN0-hQUw",
      name_ja: "ROLLS wine and springrolls",
      card_description:
        "A compact wine bar in Hamamatsucho centered on wine and original spring rolls, including four distinct spring-roll varieties described by visitors as more creative than.",
      description_en: fullDescription,
    });

    render(<RestaurantDetailShell restaurant={rolls} restaurants={[rolls]} />);

    expect(screen.getByRole("heading", { name: "About" })).toBeTruthy();
    expect(screen.getByText(fullDescription)).toBeTruthy();
    expect(screen.queryByText(/more creative than\.$/)).toBeNull();
  });

  it("renders only public-facing detail enrichment and formats known hours", () => {
    const enrichedRestaurant = publicRestaurantDetailSchema.parse({
      ...restaurant,
      review_themes: [{
        theme: "Quiet counter atmosphere",
        sentiment: "positive",
        supporting_source_count: 7,
        confidence: 0.83,
      }],
      practical_info: {
        reservation: { status: "recommended", confidence: 0.81 },
        seating: { counter: true, tables: null, private_rooms: false, small_capacity: true },
        visit_style: { solo_friendly: true, group_friendly: null, date_friendly: false },
        service_periods: { lunch: true, dinner: true, late_night: null },
        payment: { cash_only: false, cards: true, electronic_payment: null },
        other: [],
        confidence: 0.76,
      },
      opening_hours: {
        monday: {
          status: "open",
          periods: [
            { open: "12:00", close: "14:00", label: "lunch", last_order: "13:30" },
            { open: "18:00", close: "22:00", label: "dinner", last_order: "21:30" },
          ],
        },
        tuesday: { status: "closed", periods: [] },
        wednesday: { status: "irregular", periods: [] },
        thursday: { status: "unknown", periods: [] },
        reservation_only: true,
        schedule_note: "Hours may change on public holidays.",
        confidence: 0.79,
        checked_at: "2026-08-01T00:00:00Z",
      },
      hours_confidence: 0.79,
      hours_checked_at: "2026-08-01T00:00:00Z",
    });

    render(<RestaurantDetailShell restaurant={enrichedRestaurant} restaurants={[enrichedRestaurant]} />);

    expect(screen.getByRole("heading", { name: "People like" })).toBeTruthy();
    expect(screen.getByText("Quiet counter atmosphere")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Good to know" })).toBeTruthy();
    for (const fact of ["Reservations recommended", "Counter seating", "Small capacity", "Solo-friendly", "Lunch", "Dinner", "Cards accepted"]) {
      expect(screen.getByText(fact)).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "Hours" })).toBeTruthy();
    expect(screen.getByText("Lunch 12:00–14:00, last order 13:30; Dinner 18:00–22:00, last order 21:30")).toBeTruthy();
    expect(screen.getByText("Closed")).toBeTruthy();
    expect(screen.getByText("Irregular")).toBeTruthy();
    expect(screen.getByText("Reservation only")).toBeTruthy();
    expect(screen.getByText("Hours may change on public holidays.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("0.83");
    expect(document.body.textContent).not.toContain("0.79");
    expect(document.body.textContent).not.toContain("supporting_source_count");
    expect(document.body.textContent).not.toContain("2026-08-01");
  });

  it("keeps Koda-style sparse enrichment clean without filler sections", () => {
    const koda = publicRestaurantDetailSchema.parse({
      ...restaurant,
      place_id: "ChIJF0XdG2CJGGARXPEmJ6ULqUA",
      name_ja: "幸田",
      name_en: "Koda",
      card_description: "A compact Tsukiji kappo restaurant serving traditional kaiseki-style Japanese cuisine, including seasonal seafood dishes and fugu.",
      review_themes: [],
      practical_info: {},
      opening_hours: {},
      restaurant_type_en: null,
      cuisine_terms_en: [],
      signature_dishes_en: [],
    });

    render(<RestaurantDetailShell restaurant={koda} restaurants={[koda]} />);

    expect(screen.getByRole("heading", { name: "About" })).toBeTruthy();
    expect(screen.getByText(koda.card_description ?? "missing description")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "People like" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Good to know" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Hours" })).toBeNull();
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
      review_themes: [],
      practical_info: {},
      opening_hours: {},
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

    const saveButtons = await screen.findAllByRole("button", { name: "Save restaurant" });
    expect(saveButtons.every((button) => button.textContent === "Save")).toBe(true);
    expect(saveButtons.every((button) => button.querySelector("svg")?.getAttribute("fill") === "none")).toBe(true);
    expect(saveButtons.every((button) => !button.className.includes("rounded-chip"))).toBe(true);
    expect(saveButtons.every((button) => !button.className.includes("border"))).toBe(true);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const savedButtons = screen.getAllByRole("button", {
        name: "Remove restaurant from saved",
      });
      expect(savedButtons.length).toBeGreaterThan(0);
      expect(savedButtons.every((button) => button.textContent === "Saved")).toBe(true);
      expect(
        savedButtons.every(
          (button) => button.querySelector("svg")?.getAttribute("fill") === "currentColor",
        ),
      ).toBe(true);
    });
    expect(JSON.parse(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY) ?? "null").savedRestaurantIds).toContain("detail-place");

    fireEvent.click(screen.getAllByRole("button", { name: "Back to Picks" })[0]);
    expect(router.push).toHaveBeenCalledWith("/picks");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("title-cases English display tags without mutating stored values or Japanese text", () => {
    const japaneseTag = "\u5bff\u53f8";
    const storedTags = [
      "Okinawa soba",
      "Okinawa cuisine",
      "Japanese noodles",
      "lunch",
      "NASA ramen",
      japaneseTag,
    ];
    const taggedRestaurant = publicRestaurantDetailSchema.parse({
      ...restaurant,
      food_tags: storedTags,
    });
    const originalValues = [...taggedRestaurant.food_tags];

    render(
      <RestaurantDetailShell restaurant={taggedRestaurant} restaurants={[taggedRestaurant]} />,
    );

    for (const displayed of [
      "Okinawa Soba",
      "Okinawa Cuisine",
      "Japanese Noodles",
      "Lunch",
      "NASA Ramen",
      japaneseTag,
    ]) {
      expect(screen.getByText(displayed)).toBeTruthy();
    }
    expect(taggedRestaurant.food_tags).toEqual(originalValues);
    expect(screen.queryByText("Okinawa soba")).toBeNull();
  });

  it("uses an accessible editorial Information and sources disclosure", () => {
    render(<RestaurantDetailShell restaurant={restaurant} restaurants={[restaurant]} />);

    const section = screen.getByTestId("information-and-sources");
    const trigger = within(section).getByRole("button", { name: "Information and sources" });
    const contentId = trigger.getAttribute("aria-controls");
    if (!contentId) throw new Error("Expected disclosure content id");
    const content = document.getElementById(contentId) as HTMLElement;

    expect(section.className).toContain("border-y");
    expect(section.className).toContain("min-w-0");
    expect(section.className).not.toContain("rounded-card");
    expect(section.className).not.toContain("bg-subtle");
    expect(trigger.className).toContain("justify-center");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(content.hidden).toBe(true);
    expect(screen.queryByRole("link", { name: "example.com" })).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(content.hidden).toBe(false);
    expect(screen.getByTestId("information-chevron").className).toContain("rotate-180");
    expect(screen.getByTestId("information-chevron").className).toContain(
      "motion-reduce:transition-none",
    );
    expect(screen.getByRole("link", { name: "example.com" }).getAttribute("href")).toBe(
      "https://example.com/editorial-source",
    );
    expect(screen.getByRole("link", { name: "OpenStreetMap object" })).toBeTruthy();
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
