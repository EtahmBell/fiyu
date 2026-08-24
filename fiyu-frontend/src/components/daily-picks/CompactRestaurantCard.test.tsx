// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
import { publicRestaurantSchema, type PublicRestaurant } from "@/lib/api/schemas";
import photoFixture from "@/test/fixtures/photo-preview.json";

function restaurant(overrides: Partial<PublicRestaurant> = {}): PublicRestaurant {
  return publicRestaurantSchema.parse({
    place_id: "compact",
    name_ja: "江戸酒場 海",
    name_en: "Edo Sakaba Umi",
    description_en: "A small standing bar near the National Stadium.",
    category: "Izakaya / standing bar",
    neighborhood: "Jingumae",
    fiyu_score: 87,
    food_tags: ["Izakaya", "standing bar", "sake", "counter seats"],
    signature_dishes: ["Grilled chicken"],
    external_map_search_query: "Tokyo Jingumae 2-23-4",
    ...overrides,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("compact restaurant card content", () => {
  it("uses the Japanese title and English subtitle", () => {
    render(
      <CompactRestaurantCard restaurant={restaurant()} saved={false} onToggleSaved={() => {}} />,
    );
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("江戸酒場 海");
    expect(screen.getByText("Edo Sakaba Umi")).toBeTruthy();
  });

  it("omits Japanese descriptions and tags without synthesizing location filler", () => {
    render(
      <CompactRestaurantCard
        restaurant={restaurant({
          description_en: "日本語の説明です。",
          food_tags: ["居酒屋", "standing bar", "日本酒"],
          signature_dishes: ["焼き鳥", "Grilled chicken"],
        })}
        saved={false}
        onToggleSaved={() => {}}
      />,
    );

    expect(screen.queryByText("日本語の説明です。")).toBeNull();
    expect(screen.queryByText("居酒屋")).toBeNull();
    expect(screen.queryByText("日本酒")).toBeNull();
    expect(screen.queryByText("焼き鳥")).toBeNull();
    expect(screen.queryByText(/is an izakaya|available listing|discovery area/i)).toBeNull();
    expect(screen.getByText("standing bar")).toBeTruthy();
  });

  it("shows no more than three English tags and an overflow count", () => {
    render(
      <CompactRestaurantCard restaurant={restaurant()} saved={false} onToggleSaved={() => {}} />,
    );
    expect(screen.getByText("+3")).toBeTruthy();
  });

  it("uses the larger editorial score mark and image without an approximate label", () => {
    render(
      <CompactRestaurantCard
        restaurant={restaurant({
          map_location_approximate: true,
          location_label: "Approximate area",
        })}
        saved={false}
        onToggleSaved={() => {}}
      />,
    );
    expect(screen.getByLabelText("Fiyu score 8.7 out of 10")).toBeTruthy();
    expect(screen.getByText("8.7").textContent).toContain("/10");
    expect(screen.getByText("8.7").className).toContain("text-[2rem]");
    expect(screen.getByText("Fiyu Score").className).toContain("text-[0.5rem]");
    expect(screen.getByText("Fiyu Score")).toBeTruthy();
    expect(screen.queryByText("Approximate area")).toBeNull();
  });

  it("keeps long card content and map actions inside the assigned column", () => {
    render(
      <CompactRestaurantCard
        restaurant={restaurant({
          name_ja: "とても長い名前のレストラン".repeat(12),
          name_en: "A deliberately long restaurant name ".repeat(10),
          description_en: "A long discovery-card description that must remain inside its pane. ".repeat(20),
        })}
        saved={false}
        onToggleSaved={() => {}}
      />,
    );

    const card = screen.getByTestId("compact-restaurant-card");
    expect(card.className).toContain("min-w-0");
    expect(card.className).toContain("w-full");
    const layout = screen.getByTestId("compact-card-layout");
    expect(layout.className).toContain("min-w-0");
    expect(layout.className).toContain("min-w-0");
    const japaneseName = screen.getByRole("heading", { level: 3 });
    expect(japaneseName.className).not.toContain("truncate");
    expect(japaneseName.className).toContain("break-words");
    const englishName = screen.getByText(/A deliberately long restaurant name/);
    expect(englishName.className).toContain("line-clamp-2");
    expect(englishName.className).toContain("break-words");
    const photo = screen.getByTestId("restaurant-photo-region");
    expect(photo.className).toContain("h-20");
    expect(photo.className).toContain("w-full");
    const description = screen.getByText(/A long discovery-card description/);
    expect(description.className).toContain("line-clamp-2");
    expect(description.className).toContain("lg:line-clamp-3");
    const readMore = screen.getByRole("button", { name: "Read more" });
    expect(readMore.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(readMore);
    expect(photo.className).toContain("float-left");
    expect(photo.className).toContain("w-[6.75rem]");
    expect(description.className).not.toContain("line-clamp-2");
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByLabelText("Fiyu score 8.7 out of 10")).toBeTruthy();
    const googleLink = screen.getByRole("link", { name: "Open in Google Maps" });
    expect(googleLink.className).toContain("break-words");
    expect(googleLink.closest("ul")?.className).toContain("flex-wrap");
    expect(googleLink.closest("ul")?.className).toContain("max-w-full");
  });

  it("uses the stored researched description without a generic replacement", () => {
    const researched =
      "Edo Sakaba Umi is an izakaya and standing bar serving grilled chicken and sake in Jingumae. Its compact counter format is documented in the stored restaurant research.";
    render(
      <CompactRestaurantCard
        restaurant={restaurant({ description_en: researched })}
        saved={false}
        onToggleSaved={() => {}}
      />,
    );
    expect(screen.getByText(researched).className).toContain("line-clamp-2");
  });

  it("prefers the canonical enriched card description", () => {
    const enriched = "A compact counter izakaya centered on charcoal-grilled seafood and sake.";
    render(
      <CompactRestaurantCard
        restaurant={restaurant({
          card_description: enriched,
          description_en: "Edo Sakaba Umi is a restaurant in Jingumae.",
        })}
        saved={false}
        onToggleSaved={() => {}}
      />,
    );
    expect(screen.getByText(enriched)).toBeTruthy();
    expect(screen.queryByText(/is a restaurant in Jingumae/i)).toBeNull();
  });

  it("gives a working photo a large stable region with accessible overlay attribution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => photoFixture,
      }),
    );
    const onOpen = vi.fn();
    render(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved={false}
        onOpen={onOpen}
        onToggleSaved={() => {}}
      />,
    );

    const image = await screen.findByRole("img", { name: /photo from Google/ });
    expect(image.className).toContain("object-cover");
    expect(image.className).toContain("object-center");
    expect(image.style.objectPosition).toBe("50% 58%");
    const photoRegion = screen.getByTestId("restaurant-photo-region");
    expect(photoRegion.className).toContain("h-20");
    expect(photoRegion.firstElementChild?.className).toContain("h-full");
    expect(photoRegion.firstElementChild?.className).not.toContain("min-h-44");
    expect(image.getAttribute("width")).toBe(String(photoFixture.width));
    expect(image.getAttribute("height")).toBe(String(photoFixture.height));
    expect(screen.queryByText(/Photo by/)).toBeNull();

    expect(screen.queryByRole("button", { name: "Photo information" })).toBeNull();
    fireEvent.click(photoRegion);
    const overlay = screen.getByTestId("photo-attribution-overlay");
    expect(overlay.className).toContain("h-3");
    expect(overlay.className).toContain("text-[0.5rem]");
    expect(overlay.className).toContain("pointer-events-none");
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(photoRegion);
    expect(screen.queryByTestId("photo-attribution-overlay")).toBeNull();
  });

  it("uses lavender for current cards and brass for recent-history score accents", () => {
    const { rerender } = render(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved={false}
        onOpen={() => {}}
        onToggleSaved={() => {}}
      />,
    );
    const card = screen.getByTestId("compact-restaurant-card");
    const score = screen.getByLabelText("Fiyu score 8.7 out of 10");
    expect(card.className).toContain("border-t-lavender-500/45");
    expect(card.className).toContain("focus-visible:outline-lavender-600");
    expect(screen.getByText("Fiyu Score").className).toContain("text-lavender-700");
    expect((score.lastElementChild as HTMLElement).className).toContain("bg-lavender-500");

    rerender(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved={false}
        tone="history"
        onOpen={() => {}}
        onToggleSaved={() => {}}
      />,
    );
    expect(card.className).toContain("border-t-gold/50");
    expect(card.className).toContain("focus-visible:outline-gold");
    expect(screen.getByText("Fiyu Score").className).toContain("text-gold-700");
    expect((score.lastElementChild as HTMLElement).className).toContain("bg-gold");
  });

  it("never renders an internal why_fiyu value", () => {
    const withInternalField = {
      ...restaurant(),
      why_fiyu: "Internal research evidence must stay private.",
    } as PublicRestaurant;
    render(
      <CompactRestaurantCard
        restaurant={withInternalField}
        saved={false}
        onToggleSaved={() => {}}
      />,
    );
    expect(screen.queryByText(/Internal research evidence/)).toBeNull();
  });
});

describe("compact card interaction", () => {
  it("opens from the card or keyboard but not from Save or map links", () => {
    const onOpen = vi.fn();
    const onToggleSaved = vi.fn();
    render(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved={false}
        onOpen={onOpen}
        onToggleSaved={onToggleSaved}
      />,
    );

    const card = screen.getByRole("button", { name: "View 江戸酒場 海" });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Save restaurant" }));
    expect(onToggleSaved).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("link", { name: "Open in Google Maps" }));
    fireEvent.click(screen.getByRole("link", { name: "Open in Apple Maps" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("opens the reusable detail route action without triggering card selection", () => {
    const onOpen = vi.fn();
    const onViewDetails = vi.fn();
    const value = restaurant();
    render(
      <CompactRestaurantCard
        restaurant={value}
        saved={false}
        onOpen={onOpen}
        onViewDetails={onViewDetails}
        onToggleSaved={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View restaurant" }));

    expect(onViewDetails).toHaveBeenCalledWith(value);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("uses a fine-pointer double-click on card content as a detail shortcut", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    const onOpen = vi.fn();
    const onViewDetails = vi.fn();
    const value = restaurant();
    render(
      <CompactRestaurantCard
        restaurant={value}
        saved={false}
        onOpen={onOpen}
        onViewDetails={onViewDetails}
        onToggleSaved={() => {}}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("heading", { level: 3 }));

    expect(onViewDetails).toHaveBeenCalledOnce();
    expect(onViewDetails).toHaveBeenCalledWith(value);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open details from double-clicks on nested card actions", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    const onViewDetails = vi.fn();
    render(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved={false}
        onOpen={vi.fn()}
        onViewDetails={onViewDetails}
        onToggleSaved={vi.fn()}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("button", { name: "Save restaurant" }));
    fireEvent.doubleClick(screen.getByRole("link", { name: "Open in Google Maps" }));
    fireEvent.doubleClick(screen.getByRole("link", { name: "Open in Apple Maps" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "View restaurant" }));

    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it("does not add a mobile double-tap navigation gesture", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false }),
    );
    const onViewDetails = vi.fn();
    render(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved={false}
        onOpen={vi.fn()}
        onViewDetails={onViewDetails}
        onToggleSaved={() => {}}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("heading", { level: 3 }));

    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it("renders a flat editorial footer with accessible bookmark states", () => {
    const { rerender } = render(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved={false}
        onToggleSaved={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    const googleMaps = screen.getByRole("link", { name: "Open in Google Maps" });
    const appleMaps = screen.getByRole("link", { name: "Open in Apple Maps" });
    const viewRestaurant = screen.getByRole("button", { name: "View restaurant" });
    const saveRestaurant = screen.getByRole("button", { name: "Save restaurant" });

    expect(screen.getByTestId("compact-card-footer").className).toContain("border-t");
    expect(screen.getByTestId("compact-card-footer").firstElementChild?.className).toContain("flex");
    for (const mapLink of [googleMaps, appleMaps]) {
      expect(mapLink.className).toContain("min-h-11");
      expect(mapLink.className).not.toContain("rounded-chip");
      expect(mapLink.className).not.toContain("bg-surface");
      expect(mapLink.className).not.toContain("border-line");
    }
    expect(viewRestaurant.textContent).toContain("→");
    expect(viewRestaurant.className).toContain("text-plum");
    expect(viewRestaurant.className).not.toContain("rounded-chip");
    expect(saveRestaurant.className).toContain("size-11");
    expect(saveRestaurant.className).toContain("size-9");
    expect(saveRestaurant.className).not.toContain("rounded-chip");
    expect(saveRestaurant.querySelector("svg")?.getAttribute("fill")).toBe("none");

    rerender(
      <CompactRestaurantCard
        restaurant={restaurant()}
        saved
        onToggleSaved={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    const removeSaved = screen.getByRole("button", {
      name: "Remove restaurant from saved",
    });
    expect(removeSaved.getAttribute("aria-pressed")).toBe("true");
    expect(removeSaved.className).toContain("text-gold-700");
    expect(removeSaved.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
  });
});
