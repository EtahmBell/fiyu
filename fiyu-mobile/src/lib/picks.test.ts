import type { RecentDailyPickRound } from "@fiyu/contracts";

import { RECENT_DISCOVERY_MS, budgetLabel, recentDiscoveries } from "@/lib/picks";
import { restaurantFixture } from "@/test/restaurantFixture";

function round(placeId: string, revealedAt: string, retentionExpiresAt: string): RecentDailyPickRound {
  return {
    round_id: `round-${placeId}`,
    city_id: "tokyo",
    place_ids: [placeId],
    assigned_at: revealedAt,
    retention_expires_at: retentionExpiresAt,
    revealed_at_by_place_id: { [placeId]: revealedAt },
    restaurants: [{ ...restaurantFixture, place_id: placeId }],
  };
}

describe("recentDiscoveries", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");

  it("keeps revealed restaurants for exactly 72 hours, newest first", () => {
    const recent = recentDiscoveries([
      round("older", new Date(now - 2 * 60 * 60_000).toISOString(), new Date(now + RECENT_DISCOVERY_MS).toISOString()),
      round("newer", new Date(now - 60 * 60_000).toISOString(), new Date(now + RECENT_DISCOVERY_MS).toISOString()),
      round("expired", new Date(now - RECENT_DISCOVERY_MS).toISOString(), new Date(now + RECENT_DISCOVERY_MS).toISOString()),
    ], now);
    expect(recent.map((item) => item.restaurant.place_id)).toEqual(["newer", "older"]);
  });

  it("excludes current assignments and deduplicates history by canonical place id", () => {
    const recent = recentDiscoveries([
      round("same", new Date(now - 60_000).toISOString(), new Date(now + RECENT_DISCOVERY_MS).toISOString()),
      round("same", new Date(now - 120_000).toISOString(), new Date(now + RECENT_DISCOVERY_MS).toISOString()),
      round("current", new Date(now - 60_000).toISOString(), new Date(now + RECENT_DISCOVERY_MS).toISOString()),
    ], now, new Set(["current"]));
    expect(recent).toHaveLength(1);
    expect(recent[0].restaurant.place_id).toBe("same");
  });
});

it("formats canonical budget data without inventing a price", () => {
  expect(budgetLabel(restaurantFixture)).toBeNull();
  expect(budgetLabel({ ...restaurantFixture, budget: { currency: "JPY", minimum: 2000, maximum: 3000, band: "moderate", source_type: "researched_source", confidence: 0.9, checked_at: null } })).toBe("¥2,000–¥3,000");
});
