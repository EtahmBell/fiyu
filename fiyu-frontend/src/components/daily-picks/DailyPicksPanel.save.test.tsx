// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DAILY_PICKS_DURATION_MS, DAILY_PICKS_STORAGE_KEY } from "@/lib/daily-picks/storage";
import { publicRestaurantSchema, type PublicRestaurant } from "@/lib/api/schemas";

function restaurant(placeId: string): PublicRestaurant {
  return publicRestaurantSchema.parse({
    place_id: placeId,
    name_ja: `Restaurant ${placeId}`,
    name_en: `Restaurant ${placeId}`,
    description_en: `Editorial description for ${placeId}`,
    category: "Sushi",
    fiyu_score: 90,
    food_tags: ["Sushi"],
    discovery_area: "Shibuya",
  });
}

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
        name_ja: `Restaurant ${item.place_id}`,
        name_en: `Restaurant ${item.place_id}`,
        primary_category: "Sushi",
        neighborhood: "Shibuya",
        fiyu_score: 90,
        score_band: "excellent",
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

function seedRevealedPicks() {
  const generatedAt = Date.now();
  window.localStorage.setItem(
    DAILY_PICKS_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: {
        restaurantIds: ["one", "two", "three"],
        revealedIds: ["one"],
        generatedAt: new Date(generatedAt).toISOString(),
        expiresAt: new Date(generatedAt + DAILY_PICKS_DURATION_MS).toISOString(),
      },
      discoveries: [{ restaurantId: "one", revealedAt: new Date(generatedAt).toISOString() }],
      savedRestaurantIds: [],
    }),
  );
}

async function loadDailyPicksPanel() {
  const loaded = await import("@/components/daily-picks/DailyPicksPanel");
  return loaded.DailyPicksPanel;
}

function deferredResponse(): { promise: Promise<Response>; resolve(value: Response): void } {
  let resolver: ((value: Response) => void) | null = null;
  const promise = new Promise<Response>((resolve) => {
    resolver = resolve;
  });
  return {
    promise,
    resolve(value: Response) {
      if (resolver) resolver(value);
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
});

describe("/picks revealed-card save bookmark", () => {
  it("uses the shared save mutation with tokyo city and owner header, then toggles remove", async () => {
    seedRevealedPicks();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, listBody([])))
      .mockResolvedValueOnce(
        json(200, {
          list: listBody([{ place_id: "one", added_at: "2026-08-03T08:00:00Z" }]),
          changed: true,
        }),
      )
      .mockResolvedValueOnce(json(200, { list: listBody([]), changed: true }));

    const onOpenRestaurant = vi.fn();
    const onViewRestaurant = vi.fn();
    const DailyPicksPanel = await loadDailyPicksPanel();

    render(
      <DailyPicksPanel
        restaurants={[restaurant("one"), restaurant("two"), restaurant("three")]}
        onOpenRestaurant={onOpenRestaurant}
        onViewRestaurant={onViewRestaurant}
      />,
    );

    const saveButton = await screen.findByRole("button", { name: "Save restaurant" });
    fireEvent.click(saveButton);

    expect(onOpenRestaurant).not.toHaveBeenCalled();
    expect(onViewRestaurant).not.toHaveBeenCalled();

    await screen.findByRole("button", { name: "Remove restaurant from saved" });

    const postCall = fetchMock.mock.calls.find(([, init]) => {
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      return method === "POST";
    });
    expect(postCall).toBeTruthy();

    const [postUrl, postInit] = postCall as [RequestInfo | URL, RequestInit | undefined];
    expect(String(postUrl)).toContain("/lists/default/items");
    const postBody = JSON.parse(String(postInit?.body ?? "{}")) as {
      city_id?: string;
      place_id?: string;
    };
    expect(postBody.city_id).toBe("tokyo");
    expect(postBody.place_id).toBe("one");

    const postHeaders = new Headers(postInit?.headers);
    expect(postHeaders.get("X-Fiyu-Client-Id") ?? "").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove restaurant from saved" }));
    await screen.findByRole("button", { name: "Save restaurant" });

    const deleteCall = fetchMock.mock.calls.find(([, init]) => {
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      return method === "DELETE";
    });
    expect(deleteCall).toBeTruthy();
    const [, deleteInit] = deleteCall as [RequestInfo | URL, RequestInit | undefined];
    const deleteBody = JSON.parse(String(deleteInit?.body ?? "{}")) as {
      city_id?: string;
      place_id?: string;
    };
    expect(deleteBody.city_id).toBe("tokyo");
    expect(deleteBody.place_id).toBe("one");
  });

  it("blocks duplicate save mutations while a save is pending", async () => {
    seedRevealedPicks();
    const pendingMutation = deferredResponse();

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, listBody([])))
      .mockImplementationOnce(() => pendingMutation.promise);

    const DailyPicksPanel = await loadDailyPicksPanel();
    render(<DailyPicksPanel restaurants={[restaurant("one"), restaurant("two"), restaurant("three")]} />);

    const button = await screen.findByRole("button", { name: "Save restaurant" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => {
        const method = (init as RequestInit | undefined)?.method ?? "GET";
        return method === "POST";
      });
      expect(postCalls).toHaveLength(1);
    });
    expect(button.hasAttribute("disabled")).toBe(true);

    pendingMutation.resolve(
      json(200, {
        list: listBody([{ place_id: "one", added_at: "2026-08-03T08:00:00Z" }]),
        changed: true,
      }),
    );

    await screen.findByRole("button", { name: "Remove restaurant from saved" });
    expect(
      screen.getByRole("button", { name: "Remove restaurant from saved" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("rolls back bookmark state and shows an error when save fails", async () => {
    seedRevealedPicks();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(200, listBody([])))
      .mockRejectedValueOnce(new TypeError("network down"));

    const DailyPicksPanel = await loadDailyPicksPanel();
    render(<DailyPicksPanel restaurants={[restaurant("one"), restaurant("two"), restaurant("three")]} />);

    const button = await screen.findByRole("button", { name: "Save restaurant" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save restaurant" })).toBeTruthy();
      expect(screen.getByText("Could not update saved status. Please try again.")).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: "Save restaurant" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
