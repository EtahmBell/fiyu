// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultListStore } from "@/lib/lists/defaultListStore";
import { ownerKeyStorageKey, getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import { DAILY_PICKS_STORAGE_KEY } from "@/lib/daily-picks/storage";

function listBody(items: Array<{ place_id: string; added_at: string }>) {
  return {
    list_id: 1,
    city_id: "tokyo",
    name: "Tokyo",
    list_kind: "default",
    item_count: items.length,
    items: items.map((item) => ({
      ...item,
      restaurant: {
        place_id: item.place_id,
        name_ja: null,
        name_en: null,
        primary_category: "sushi",
        neighborhood: null,
        fiyu_score: null,
        score_band: null,
      },
    })),
    created_at: "2026-08-03T00:00:00Z",
    updated_at: "2026-08-03T00:00:00Z",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("default list store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads the Tokyo default list successfully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, listBody([])));
    const store = new DefaultListStore("tokyo");

    await store.ensureLoaded();

    expect(store.getSnapshot().status).toBe("ready");
    expect(store.getSnapshot().list?.name).toBe("Tokyo");
    expect(store.getSnapshot().savedPlaceIds).toEqual([]);
  });

  it("adds and removes a saved restaurant", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, listBody([])))
      .mockResolvedValueOnce(json(200, { list: listBody([{ place_id: "one", added_at: "2026-08-03T08:00:00Z" }]), changed: true }))
      .mockResolvedValueOnce(json(200, { list: listBody([]), changed: true }));

    const store = new DefaultListStore("tokyo");
    await store.ensureLoaded();
    await store.toggle("one");

    expect(store.isSaved("one")).toBe(true);
    expect(store.getSnapshot().savedPlaceIds).toEqual(["one"]);

    await store.toggle("one");
    expect(store.isSaved("one")).toBe(false);
    expect(store.getSnapshot().savedPlaceIds).toEqual([]);
  });

  it("supports saving before the first list load completes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, listBody([])))
      .mockResolvedValueOnce(
        json(200, {
          list: listBody([{ place_id: "one", added_at: "2026-08-03T08:00:00Z" }]),
          changed: true,
        }),
      );

    const store = new DefaultListStore("tokyo");
    await store.toggle("one");

    expect(store.getSnapshot().status).toBe("ready");
    expect(store.isSaved("one")).toBe(true);
    expect(store.getSnapshot().savedPlaceIds).toEqual(["one"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rolls back optimistic updates on mutation failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, listBody([])))
      .mockRejectedValueOnce(new TypeError("network down"));

    const store = new DefaultListStore("tokyo");
    await store.ensureLoaded();
    await store.toggle("one");

    expect(store.getSnapshot().savedPlaceIds).toEqual([]);
    expect(store.getSnapshot().operationError).toContain("Could not update saved status");
  });

  it("supports retry after initial load failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockRejectedValueOnce(new TypeError("connection"))
      .mockResolvedValueOnce(json(200, listBody([])));

    const store = new DefaultListStore("tokyo");
    await store.ensureLoaded();
    expect(store.getSnapshot().status).toBe("error");

    await store.retry();
    expect(store.getSnapshot().status).toBe("ready");
  });

  it("uses a stable anonymous owner key", () => {
    const first = getOrCreateAnonymousOwnerKey();
    const second = getOrCreateAnonymousOwnerKey();

    expect(first).toBe(second);
    expect(window.localStorage.getItem(ownerKeyStorageKey())).toBe(first);
  });

  it("sends the owner header on list and mutation requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, listBody([])))
      .mockResolvedValueOnce(
        json(200, {
          list: listBody([{ place_id: "one", added_at: "2026-08-03T08:00:00Z" }]),
          changed: true,
        }),
      );

    const store = new DefaultListStore("tokyo");
    await store.ensureLoaded();
    await store.toggle("one");

    const [loadUrl, loadInit] = fetchMock.mock.calls[0] ?? [];
    const [mutateUrl, mutateInit] = fetchMock.mock.calls[1] ?? [];

    expect(String(loadUrl)).toContain("/lists/default");
    expect(String(loadUrl)).toContain("city_id=tokyo");
    expect(String(mutateUrl)).toContain("/lists/default/items");

    const mutateBody = JSON.parse(String((mutateInit as RequestInit | undefined)?.body ?? "{}")) as {
      city_id?: string;
      place_id?: string;
    };
    expect(mutateBody.city_id).toBe("tokyo");
    expect(mutateBody.place_id).toBe("one");

    for (const [, init] of [
      [loadUrl, loadInit] as const,
      [mutateUrl, mutateInit] as const,
    ]) {
      const headers = new Headers((init as RequestInit | undefined)?.headers);
      const owner = headers.get("X-Fiyu-Client-Id") ?? "";
      expect(owner).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it("restores saved membership from backend state after a refresh", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      json(200, listBody([{ place_id: "one", added_at: "2026-08-03T08:00:00Z" }])),
    );

    const store = new DefaultListStore("tokyo");
    await store.ensureLoaded();

    expect(store.isSaved("one")).toBe(true);
    expect(store.getSnapshot().savedPlaceIds).toEqual(["one"]);
  });

  it("migrates legacy saved IDs only once when backend import succeeds", async () => {
    window.localStorage.setItem(
      DAILY_PICKS_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection: null,
        discoveries: [],
        savedRestaurantIds: ["legacy-one", "legacy-two"],
      }),
    );

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, { list: listBody([{ place_id: "legacy-one", added_at: "2026-08-03T08:00:00Z" }]), changed: true }))
      .mockResolvedValueOnce(json(404, { detail: "Published restaurant not found" }))
      .mockResolvedValueOnce(json(200, listBody([{ place_id: "legacy-one", added_at: "2026-08-03T08:00:00Z" }])));

    const store = new DefaultListStore("tokyo");
    await store.ensureLoaded();
    const callsAfterFirstLoad = fetchMock.mock.calls.length;

    expect(store.getSnapshot().savedPlaceIds).toEqual(["legacy-one"]);

    const second = new DefaultListStore("tokyo");
    await second.ensureLoaded();
    const callsAfterSecondLoad = fetchMock.mock.calls.length;

    // One additional GET load only; migration POSTs are not repeated.
    expect(callsAfterSecondLoad - callsAfterFirstLoad).toBe(1);
  });

  it("does not import or rewrite anonymous legacy saves for an authenticated account", async () => {
    const legacy = JSON.stringify({
      version: 3,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: null,
      discoveries: [],
      savedRestaurantIds: ["anonymous-save"],
      servedRestaurantIds: [],
    });
    window.localStorage.setItem(DAILY_PICKS_STORAGE_KEY, legacy);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, listBody([])));

    const store = new DefaultListStore("tokyo", "account-b");
    await store.ensureLoaded();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(store.getSnapshot().savedPlaceIds).toEqual([]);
    expect(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY)).toBe(legacy);
  });

  it("rejects unsupported cities without creating a list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const store = new DefaultListStore("rome");

    await store.ensureLoaded();

    expect(store.getSnapshot().status).toBe("error");
    expect(store.getSnapshot().error?.detail).toContain("Unsupported city");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
