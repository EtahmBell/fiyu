import { describe, expect, it } from "vitest";

import type { TogetherSession } from "@/lib/api/schemas";
import {
  activeTogetherSessions,
  formatTogetherExpiry,
  togetherCycleExpiryMs,
  togetherPartnerKey,
} from "@/lib/profile/togetherLifecycle";

function session(id: string, expiry: string): TogetherSession {
  return {
    session_id: id,
    status: "generated",
    role: "initiator",
    expires_at: expiry,
    cycle_expires_at: expiry,
    partner: { display_name: "Lianne", username: "lianne", avatar_url: null },
    restaurants: [],
    consumed_trial: false,
    invite_url: null,
    revealed_at: null,
    reveal_pending: true,
    pick_count: 3,
    expires_at_for_current_user: expiry,
    active_for_current_user: true,
    partner_key: "partner-lianne",
  };
}

describe("Together lifecycle", () => {
  it("keeps the Picks-cycle eligibility boundary separate from display expiry", () => {
    const item = session("round", "2026-09-15T12:00:00Z");
    item.cycle_expires_at = "2026-09-13T12:00:00Z";
    expect(togetherCycleExpiryMs(item)).toBe(Date.parse("2026-09-13T12:00:00Z"));
    expect(activeTogetherSessions([item], Date.parse("2026-09-14T12:00:00Z"))).toEqual([item]);
  });

  it("removes a round exactly at its participant-specific expiry", () => {
    const expiry = Date.parse("2026-09-13T12:00:00Z");
    const item = session("round", new Date(expiry).toISOString());
    expect(activeTogetherSessions([item], expiry - 1)).toEqual([item]);
    expect(activeTogetherSessions([item], expiry)).toEqual([]);
  });

  it("formats quiet day, hour, and minute countdowns", () => {
    expect(formatTogetherExpiry(72 * 3_600_000, 0)).toBe("Expires in 3 days");
    expect(formatTogetherExpiry(18 * 3_600_000, 0)).toBe("Expires in 18h");
    expect(formatTogetherExpiry(42 * 60_000, 0)).toBe("Expires in 42m");
  });

  it("uses the server-safe canonical partner key for cross-cycle grouping", () => {
    expect(togetherPartnerKey(session("one", "2026-09-13T12:00:00Z"))).toBe("partner-lianne");
  });
});
