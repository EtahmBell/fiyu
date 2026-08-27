import { describe, expect, it } from "vitest";

import {
  DAILY_PICKS_STORAGE_KEY,
  DAILY_PICKS_DURATION_MS,
  EMPTY_DAILY_PICKS_STATE,
  createDailyPicksStorage,
  dailyPicksStorageKey,
  createDailySelection,
  parseDailyPicksState,
  selectionIsActive,
} from "@/lib/daily-picks/storage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("daily picks storage", () => {
  it("isolates authenticated Picks state by account UUID", () => {
    const localStorage = new MemoryStorage();
    const accountA = createDailyPicksStorage(localStorage, dailyPicksStorageKey("user-a"));
    const accountB = createDailyPicksStorage(localStorage, dailyPicksStorageKey("user-b"));

    accountA.save({
      ...EMPTY_DAILY_PICKS_STATE,
      selection: createDailySelection(["one", "two", "three"], Date.now()),
      servedRestaurantIds: ["one", "two", "three"],
    });

    expect(accountA.getSnapshot()?.selection?.restaurantIds).toEqual(["one", "two", "three"]);
    expect(accountB.getSnapshot()).toEqual(EMPTY_DAILY_PICKS_STATE);
  });
  it("survives adapter recreation with preferences, reveals, and saved IDs intact", () => {
    const localStorage = new MemoryStorage();
    const firstSession = createDailyPicksStorage(localStorage);
    const selection = {
      ...createDailySelection(["a", "b", "c"], 1_000),
      revealedIds: ["b"],
    };
    firstSession.save({
      version: 2,
      preferences: { categories: ["sushi"], nonJapanese: "japanese-only" },
      selection,
      discoveries: [{ restaurantId: "b", revealedAt: "1970-01-01T00:00:02.000Z" }],
      savedRestaurantIds: ["b"],
    });

    const reloaded = createDailyPicksStorage(localStorage).getSnapshot();
    expect(reloaded?.selection).toEqual(selection);
    expect(reloaded?.preferences.categories).toEqual(["sushi"]);
    expect(reloaded?.savedRestaurantIds).toEqual(["b"]);
    expect(reloaded?.servedRestaurantIds).toEqual(["a", "b", "c"]);
  });

  it("migrates old revealed IDs using selection creation time", () => {
    const localStorage = new MemoryStorage();
    const selection = {
      ...createDailySelection(["a", "b", "c"], 1_000),
      revealedIds: ["b"],
    };
    localStorage.setItem(
      DAILY_PICKS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection,
        savedRestaurantIds: [],
      }),
    );

    expect(createDailyPicksStorage(localStorage).getSnapshot()?.discoveries).toEqual([
      { restaurantId: "b", revealedAt: selection.generatedAt },
    ]);
  });

  it("migrates oversized and duplicate legacy cuisine preferences safely", () => {
    const localStorage = new MemoryStorage();
    localStorage.setItem(
      DAILY_PICKS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        preferences: {
          categories: ["sushi", "sushi", "izakaya", "noodles", "tempura", "unknown"],
          nonJapanese: "occasionally",
        },
        selection: null,
        savedRestaurantIds: [],
      }),
    );

    expect(createDailyPicksStorage(localStorage).getSnapshot()?.preferences.categories).toEqual([
      "sushi",
      "izakaya",
      "noodles",
    ]);
  });

  it("keeps the selection active for exactly its 24-hour window", () => {
    const selection = createDailySelection(["a", "b", "c"], 5_000);

    expect(selectionIsActive(selection, 5_000 + DAILY_PICKS_DURATION_MS - 1)).toBe(true);
    expect(selectionIsActive(selection, 5_000 + DAILY_PICKS_DURATION_MS)).toBe(false);
  });

  it("rejects anything other than three unique IDs", () => {
    expect(() => createDailySelection(["a", "a", "b"], 0)).toThrow(/exactly three unique/);
  });

  it("restores repaired partial and empty active snapshots", () => {
    const generatedAt = "2026-08-27T00:00:00.000Z";
    const expiresAt = "2026-08-28T00:00:00.000Z";
    const partial = parseDailyPicksState(
      JSON.stringify({
        version: 3,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection: {
          restaurantIds: ["a", "b"],
          revealedIds: ["a"],
          generatedAt,
          expiresAt,
        },
        discoveries: [],
        savedRestaurantIds: [],
      }),
    );
    const empty = parseDailyPicksState(
      JSON.stringify({
        ...partial,
        selection: { restaurantIds: [], revealedIds: [], generatedAt, expiresAt },
      }),
    );

    expect(partial.selection?.restaurantIds).toEqual(["a", "b"]);
    expect(empty.selection?.restaurantIds).toEqual([]);
  });
});
