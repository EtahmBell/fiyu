// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/authService", () => ({ authService: { getAccessToken: vi.fn(async () => null) } }));

import { fetchMyPickQuota, submitMyPick } from "@/lib/api/client";
import type { FiyuApiError } from "@/lib/api/errors";

const ready = {
  my_pick_id: "00000000-0000-4000-8000-000000000123", provider: "google", external_place_id: "google-place-1",
  display_name_hint: null, status: "ready", status_message: "ready", failure_code: null,
  created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:01Z", resolved_at: "2026-10-15T00:00:01Z",
  place_id: "canonical-1", name_ja: null, name_en: "Small Tokyo Restaurant", primary_category: "Izakaya", display_area: "Koenji",
  fiyu_score: 42, score_version: "quality-v4", map_ready: true, latitude: 35.7, longitude: 139.65,
  location_precision: "area", is_public: false, recommendation_review_status: "not_eligible",
};

afterEach(() => vi.unstubAllGlobals());

describe("submitMyPick", () => {
  it("sends only the Google provider and selected external Place ID", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(ready), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await submitMyPick("google-place-1");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ provider: "google", external_place_id: "google-place-1" });
  });

  it("preserves the structured quota response on an exhausted submission", async () => {
    const body = {
      detail: {
        code: "my_pick_quota_exhausted",
        message: "You've used your 3 My Picks for now.",
        quota: { limit: 3, used: 3, remaining: 0, window_hours: 24, next_available_at: "2026-10-20T00:00:00Z" },
      },
    };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(submitMyPick("google-place-4")).rejects.toMatchObject({
      kind: "rate-limited",
      responseBody: body,
    } satisfies Partial<FiyuApiError>);
  });
});

describe("fetchMyPickQuota", () => {
  it("reads the authenticated server-owned rolling-window summary", async () => {
    const quota = { limit: 3, used: 1, remaining: 2, window_hours: 24, next_available_at: null };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(quota), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMyPickQuota()).resolves.toEqual(quota);
    expect(fetchMock.mock.calls[0][0]).toContain("/my-picks/quota");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
  });
});
