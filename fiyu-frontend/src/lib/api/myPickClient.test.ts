// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/authService", () => ({ authService: { getAccessToken: vi.fn(async () => null) } }));

import { fetchMyPickQuota, hardResetDeveloperMyPick, processDeveloperMyPick, submitMyPick } from "@/lib/api/client";
import type { FiyuApiError } from "@/lib/api/errors";

const ready = {
  my_pick_id: "00000000-0000-4000-8000-000000000123", provider: "google", external_place_id: "google-place-1",
  display_name_hint: null, user_query_hint: null, user_name_hint: "Toritsune Shizendo", user_address_hint: "1-2-3 Sotokanda", status: "ready", status_message: "ready", failure_code: null,
  created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:01Z", resolved_at: "2026-10-15T00:00:01Z",
  place_id: "canonical-1", name_ja: null, name_en: "Small Tokyo Restaurant", primary_category: "Izakaya", display_area: "Koenji",
  fiyu_score: 42, score_version: "quality-v4", map_ready: true, latitude: 35.7, longitude: 139.65,
  location_precision: "area", is_public: false, recommendation_review_status: "not_eligible",
};

afterEach(() => vi.unstubAllGlobals());

describe("submitMyPick", () => {
  it("sends only the Google identity and exact user-authored query hint", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(ready), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await submitMyPick("google-place-1", "Toritsune Shizendo", "1-2-3 Sotokanda, Tokyo");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      provider: "google",
      external_place_id: "google-place-1",
      user_name_hint: "Toritsune Shizendo",
      user_address_hint: "1-2-3 Sotokanda, Tokyo",
    });
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

    await expect(submitMyPick("google-place-4", "鳥つね自然洞", "東京都千代田区")).rejects.toMatchObject({
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

describe("processDeveloperMyPick", () => {
  it("targets one existing My Pick without creating a submission or sending worker paths", async () => {
    const response = { my_pick: ready, worker_summary: { jobs_claimed: 1, ready: 1 } };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await processDeveloperMyPick(ready.my_pick_id);

    expect(fetchMock.mock.calls[0][0]).toContain("/developer/my-picks/process");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      my_pick_id: ready.my_pick_id,
      retry_failed: true,
    });
  });
});

describe("hardResetDeveloperMyPick", () => {
  it("targets exactly one existing developer Pick", async () => {
    const response = {
      reset: true,
      deleted_my_picks: 1,
      deleted_canonical_work: 1,
      deleted_transient_placeholder: true,
      preserved_canonical_restaurant: false,
    };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(hardResetDeveloperMyPick(ready.my_pick_id)).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0][0]).toContain("/developer/my-picks/hard-reset");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      my_pick_id: ready.my_pick_id,
    });
  });
});
