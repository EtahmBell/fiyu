import { describe, expect, it } from "vitest";

import type { MyPick } from "@/lib/api/schemas";
import { completedMyPicks, isMyPickHomepageVisible } from "./lifecycle";

const pick = (overrides: Partial<MyPick> = {}): MyPick => ({
  my_pick_id: "10000000-0000-4000-8000-000000000001",
  provider: "google",
  external_place_id: "place",
  display_name_hint: null,
  user_query_hint: null,
  user_name_hint: null,
  user_address_hint: null,
  status: "ready",
  status_message: "Ready",
  failure_code: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T01:00:00Z",
  resolved_at: "2026-10-01T01:00:00Z",
  featured_until: "2026-10-04T01:00:00Z",
  place_id: "place",
  name_ja: null,
  name_en: "Mine",
  primary_category: "Izakaya",
  display_area: "Koenji",
  fiyu_score: 80,
  score_version: "quality-v4-production-1",
  result_ready: true,
  map_ready: true,
  latitude: 35.7,
  longitude: 139.6,
  location_precision: "poi",
  is_public: true,
  recommendation_review_status: "approved",
  ...overrides,
});

describe("My Pick lifecycle", () => {
  it("features a ready result before its server deadline and removes it afterward", () => {
    expect(isMyPickHomepageVisible(pick(), Date.parse("2026-10-04T00:59:59Z"))).toBe(true);
    expect(isMyPickHomepageVisible(pick(), Date.parse("2026-10-04T01:00:00Z"))).toBe(false);
  });

  it("keeps unfinished work visible and tolerates the previous response during rollout", () => {
    expect(isMyPickHomepageVisible(pick({ status: "researching", result_ready: false, featured_until: null }), Date.parse("2099-01-01T00:00:00Z"))).toBe(true);
    expect(isMyPickHomepageVisible(pick({ featured_until: null }), Date.parse("2099-01-01T00:00:00Z"))).toBe(true);
  });

  it("keeps every completed result in Mine newest first without treating it as Saved", () => {
    const old = pick({ my_pick_id: "10000000-0000-4000-8000-000000000002", featured_until: "2026-10-04T01:00:00Z" });
    const newest = pick({ my_pick_id: "10000000-0000-4000-8000-000000000003", featured_until: "2026-10-05T01:00:00Z" });
    const pending = pick({ my_pick_id: "10000000-0000-4000-8000-000000000004", result_ready: false, fiyu_score: null, score_version: null });
    expect(completedMyPicks([old, pending, newest]).map((item) => item.my_pick_id)).toEqual([newest.my_pick_id, old.my_pick_id]);
    expect(completedMyPicks([old])[0]).not.toHaveProperty("is_saved");
  });
});
