import { describe, expect, it } from "vitest";

import {
  DAILY_PICKS_DURATION_MS,
  createDailyPicksStorage,
  createDailySelection,
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
  it("survives adapter recreation with preferences, reveals, and saved IDs intact", () => {
    const localStorage = new MemoryStorage();
    const firstSession = createDailyPicksStorage(localStorage);
    const selection = {
      ...createDailySelection(["a", "b", "c"], 1_000),
      revealedIds: ["b"],
    };
    firstSession.save({
      version: 1,
      preferences: { categories: ["sushi"], nonJapanese: "japanese-only" },
      selection,
      savedRestaurantIds: ["b"],
    });

    const reloaded = createDailyPicksStorage(localStorage).getSnapshot();
    expect(reloaded?.selection).toEqual(selection);
    expect(reloaded?.preferences.categories).toEqual(["sushi"]);
    expect(reloaded?.savedRestaurantIds).toEqual(["b"]);
  });

  it("keeps the selection active for exactly its 24-hour window", () => {
    const selection = createDailySelection(["a", "b", "c"], 5_000);

    expect(selectionIsActive(selection, 5_000 + DAILY_PICKS_DURATION_MS - 1)).toBe(true);
    expect(selectionIsActive(selection, 5_000 + DAILY_PICKS_DURATION_MS)).toBe(false);
  });

  it("rejects anything other than three unique IDs", () => {
    expect(() => createDailySelection(["a", "a", "b"], 0)).toThrow(/exactly three unique/);
  });
});
