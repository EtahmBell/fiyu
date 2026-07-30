// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DailyPicksPanel } from "@/components/daily-picks/DailyPicksPanel";
import { publicRestaurantSchema, type PublicRestaurant } from "@/lib/api/schemas";
import { createDailyPicksStorage } from "@/lib/daily-picks/storage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function restaurant(placeId: string, category: string, score: number): PublicRestaurant {
  return publicRestaurantSchema.parse({
    place_id: placeId,
    name_ja: `店 ${placeId}`,
    name_en: `Restaurant ${placeId}`,
    description_en: `Editorial description ${placeId}`,
    category,
    fiyu_score: score,
    food_tags: [category],
    discovery_area: "Shibuya",
  });
}

const catalog = [
  restaurant("one", "Sushi", 91),
  restaurant("two", "Ramen", 89),
  restaurant("three", "Yakitori", 87),
  restaurant("four", "Tempura", 85),
  restaurant("five", "Izakaya", 83),
  restaurant("six", "Yakiniku", 81),
];

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Today’s Fiyu Picks panel", () => {
  it("persists exactly three picks and reveal state across a reload", () => {
    const firstStorage = createDailyPicksStorage(window.localStorage);
    const firstRender = render(<DailyPicksPanel restaurants={catalog} storage={firstStorage} />);

    fireEvent.click(screen.getByRole("button", { name: /Receive today's restaurants/i }));
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(3);
    const selectedIds = firstStorage.getSnapshot()?.selection?.restaurantIds;
    expect(selectedIds).toHaveLength(3);
    expect(new Set(selectedIds).size).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 1" }));
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(1);
    const revealedId = firstStorage.getSnapshot()?.selection?.revealedIds[0];
    expect(revealedId).toBeTruthy();

    firstRender.unmount();
    render(
      <DailyPicksPanel
        restaurants={catalog}
        storage={createDailyPicksStorage(window.localStorage)}
      />,
    );
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(2);
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(1);
    expect(screen.getByText(`店 ${revealedId}`)).toBeTruthy();
  });

  it("hydrates deterministically without a localStorage mismatch", async () => {
    const storage = createDailyPicksStorage(window.localStorage);
    const element = <DailyPicksPanel restaurants={catalog} storage={storage} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);

    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(errors).toEqual([]);
    expect(container.querySelector("[data-testid='daily-picks-hydrating']")).toBeNull();
  });
});
