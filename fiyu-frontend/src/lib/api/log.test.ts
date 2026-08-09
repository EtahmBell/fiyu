import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRestaurantVisit,
  deleteRestaurantVisit,
  fetchRestaurantLog,
  updateRestaurantVisit,
} from "@/lib/api/client";

const identity = { clientId: "11111111-1111-4111-8111-111111111111" };

const visit = {
  id: "visit-one",
  place_id: "tokyo-a",
  visited_at: "2026-08-08T12:00:00+00:00",
  reaction: "like_it",
  private_note: "Private note",
  created_at: "2026-08-08T12:00:00+00:00",
  updated_at: "2026-08-08T12:00:00+00:00",
  restaurant: {
    place_id: "tokyo-a",
    name_ja: "Tokyo A",
    name_en: "Tokyo A",
    primary_category: "sushi",
    neighborhood: "Asakusa",
    fiyu_score: 91,
    score_band: "excellent",
  },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("private Log API adapter", () => {
  it("lists, creates, updates, and deletes with the shared owner header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json([visit]))
      .mockResolvedValueOnce(json(visit))
      .mockResolvedValueOnce(json({ ...visit, private_note: "Revised" }))
      .mockResolvedValueOnce(json({ deleted: true }));

    await fetchRestaurantLog(identity);
    await createRestaurantVisit(
      {
        place_id: "tokyo-a",
        visited_at: "2026-08-08T12:00:00.000Z",
        reaction: "like_it",
        private_note: "Private note",
      },
      identity,
    );
    await updateRestaurantVisit("visit-one", { private_note: "Revised" }, identity);
    await deleteRestaurantVisit("visit-one", identity);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual([
      "GET",
      "POST",
      "PATCH",
      "DELETE",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("X-Fiyu-Client-Id")).toBe(identity.clientId);
    }
    expect(String(fetchMock.mock.calls[0][0])).toContain("/log");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/log/visit-one");
  });
});
