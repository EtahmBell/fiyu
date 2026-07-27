import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import {
  NO_COMMUNITY_ACTIVITY_COPY,
  editorialLabel,
  hasVisibleCommunityStats,
} from "@/lib/format/editorialLabels";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

function make(overrides: Record<string, unknown>) {
  return publicRestaurantSchema.parse({ place_id: "a", ...overrides });
}

describe("editorialLabel", () => {
  it("maps each supported band to its label", () => {
    expect(editorialLabel(make({ score_band: "exceptional" }))).toBe("Fiyu Pick");
    expect(editorialLabel(make({ score_band: "strong" }))).toBe("Strong Hidden-Gem Match");
    expect(editorialLabel(make({ score_band: "promising" }))).toBe("Under-the-Radar");
  });

  it("gives no label to the bands that do not warrant one", () => {
    expect(editorialLabel(make({ score_band: "borderline" }))).toBeNull();
    expect(editorialLabel(make({ score_band: "not_recommended" }))).toBeNull();
  });

  it("gives no label for an absent or unrecognised band", () => {
    expect(editorialLabel(make({}))).toBeNull();
    expect(editorialLabel(make({ score_band: "future_band" }))).toBeNull();
  });

  it("derives only from score_band, never from community counters", () => {
    // A restaurant with fabricated engagement must not earn a label from it.
    const withCommunity = make({
      score_band: "borderline",
      community_recommendation_count: 5000,
      community_stats_visible: true,
    });
    expect(editorialLabel(withCommunity)).toBeNull();
  });

  it("never produces a popularity claim", () => {
    for (const band of ["exceptional", "strong", "promising"]) {
      const label = editorialLabel(make({ score_band: band })) ?? "";
      expect(label).not.toMatch(/popular|trending|loved|favou?rite|visited|rated/i);
    }
  });

  it("labels the real catalog without inventing anything", () => {
    for (const row of restaurantsFixture) {
      const label = editorialLabel(publicRestaurantSchema.parse(row));
      expect(label === null || ["Fiyu Pick", "Strong Hidden-Gem Match", "Under-the-Radar"].includes(label)).toBe(
        true,
      );
    }
  });

  it("does not offer labels that have no backing field", () => {
    // "Independent Restaurant" and "Newly Added" are intentionally absent:
    // the payload exposes neither an independence flag nor a timestamp.
    const labels = restaurantsFixture
      .map((row) => editorialLabel(publicRestaurantSchema.parse(row)))
      .filter(Boolean);
    expect(labels).not.toContain("Independent Restaurant");
    expect(labels).not.toContain("Newly Added");
  });
});

describe("hasVisibleCommunityStats", () => {
  it("is false when the backend hides stats, even with a non-zero count", () => {
    expect(
      hasVisibleCommunityStats(
        make({ community_stats_visible: false, community_recommendation_count: 12 }),
      ),
    ).toBe(false);
  });

  it("is false when visible but there is no activity to report", () => {
    // A zero count must never be dressed up as activity.
    expect(
      hasVisibleCommunityStats(
        make({ community_stats_visible: true, community_recommendation_count: 0 }),
      ),
    ).toBe(false);
  });

  it("is true only for genuine, backend-approved activity", () => {
    expect(
      hasVisibleCommunityStats(
        make({ community_stats_visible: true, community_recommendation_count: 3 }),
      ),
    ).toBe(true);
  });

  it("is false for every restaurant in the real catalog today", () => {
    for (const row of restaurantsFixture) {
      expect(hasVisibleCommunityStats(publicRestaurantSchema.parse(row))).toBe(false);
    }
  });
});

describe("neutral community copy", () => {
  it("claims no activity", () => {
    expect(NO_COMMUNITY_ACTIVITY_COPY).toBe("New to the Fiyu community");
    expect(NO_COMMUNITY_ACTIVITY_COPY).not.toMatch(/\d/);
  });
});
