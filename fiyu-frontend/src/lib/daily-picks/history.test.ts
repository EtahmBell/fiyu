import { describe, expect, it } from "vitest";

import {
  RECENT_DISCOVERY_DURATION_MS,
  discoveryIsRecent,
  formatExpirationLabel,
  getDiscoveryExpiration,
  recentDiscoveries,
  recordRevealedDiscovery,
} from "@/lib/daily-picks/history";

const HOUR = 60 * 60 * 1000;

describe("recent discovery history", () => {
  it("records the exact reveal time", () => {
    expect(recordRevealedDiscovery([], "a", 12_345)).toEqual([
      { restaurantId: "a", revealedAt: "1970-01-01T00:00:12.345Z" },
    ]);
  });

  it("expires exactly 72 hours after reveal", () => {
    const discovery = { restaurantId: "a", revealedAt: new Date(1_000).toISOString() };
    expect(discoveryIsRecent(discovery, 1_000 + RECENT_DISCOVERY_DURATION_MS - 1)).toBe(true);
    expect(discoveryIsRecent(discovery, 1_000 + RECENT_DISCOVERY_DURATION_MS)).toBe(false);
  });

  it("excludes current picks and sorts newest discoveries first", () => {
    const discoveries = [
      { restaurantId: "old", revealedAt: new Date(1_000).toISOString() },
      { restaurantId: "current", revealedAt: new Date(3_000).toISOString() },
      { restaurantId: "new", revealedAt: new Date(2_000).toISOString() },
    ];
    expect(
      recentDiscoveries(discoveries, new Set(["current"]), 4_000).map(
        (discovery) => discovery.restaurantId,
      ),
    ).toEqual(["new", "old"]);
  });
});

describe("expiration labels", () => {
  it("formats days, hours, and the final hour", () => {
    expect(formatExpirationLabel(48 * HOUR, 0)).toBe("Expires in 2 days");
    expect(formatExpirationLabel(6 * HOUR, 0)).toBe("Expires in 6 hours");
    expect(formatExpirationLabel(HOUR, 0)).toBe("Expires soon");
    expect(formatExpirationLabel(0, 0)).toBe("Expired");
  });

  it("computes expiration from revealedAt", () => {
    expect(getDiscoveryExpiration(new Date(500).toISOString())).toBe(
      500 + RECENT_DISCOVERY_DURATION_MS,
    );
  });
});
