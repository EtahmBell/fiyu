// @vitest-environment jsdom
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publicRestaurantSchema, type PublicRestaurant } from "@/lib/api/schemas";
import { createDailyPicksStorage, createDailySelection } from "@/lib/daily-picks/storage";

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

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 6, 30, 12));
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("unlimited Picks development mode", () => {
  it("generates repeated fresh sets while preserving reveals and saves", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIYU_DEV_MODE", "true");
    const { DailyPicksPanel } = await import("@/components/daily-picks/DailyPicksPanel");
    const storage = createDailyPicksStorage(window.localStorage);
    const generatedAt = Date.now() - 1_000;
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: {
        ...createDailySelection(["one", "two", "three"], generatedAt),
        revealedIds: ["one"],
      },
      discoveries: [
        { restaurantId: "one", revealedAt: new Date(generatedAt).toISOString() },
      ],
      savedRestaurantIds: ["two"],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    expect(screen.getByTestId("unlimited-picks-dev-controls")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate another test set" }));
    expect(new Set(storage.getSnapshot()?.selection?.restaurantIds)).toEqual(
      new Set(["four", "five", "six"]),
    );
    expect(storage.getSnapshot()?.selection?.revealedIds).toEqual([]);
    expect(storage.getSnapshot()?.discoveries).toEqual([
      { restaurantId: "one", revealedAt: new Date(generatedAt).toISOString() },
    ]);
    expect(storage.getSnapshot()?.savedRestaurantIds).toEqual(["two"]);

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(3);
    expect(screen.getByText("Restaurant one")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Generate another test set" }));
    expect(new Set(storage.getSnapshot()?.selection?.restaurantIds)).toEqual(
      new Set(["one", "two", "three"]),
    );
    act(() => vi.advanceTimersByTime(3_000));
  });

  it("requires the explicit public development flag", async () => {
    const { DailyPicksPanel } = await import("@/components/daily-picks/DailyPicksPanel");
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["one", "two", "three"], Date.now()),
      discoveries: [],
      savedRestaurantIds: [],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    expect(screen.queryByTestId("unlimited-picks-dev-controls")).toBeNull();
    expect(screen.getByText(/Next selection available in/)).toBeTruthy();
  });

  it("stays unavailable in production even with flags in the environment and localStorage", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FIYU_DEV_MODE", "true");
    window.localStorage.setItem("fiyu.dev-mode", "true");
    const { DailyPicksPanel } = await import("@/components/daily-picks/DailyPicksPanel");
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["one", "two", "three"], Date.now()),
      discoveries: [],
      savedRestaurantIds: [],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    expect(screen.queryByTestId("unlimited-picks-dev-controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate another test set" })).toBeNull();
    expect(screen.getByText(/Next selection available in/)).toBeTruthy();
  });
});
