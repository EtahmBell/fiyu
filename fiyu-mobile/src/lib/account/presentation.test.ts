import type { DeveloperStatus, MyPick, RestaurantVisit, SmartViewCatalogEntry } from "@fiyu/contracts";

import {
  canProcessMyPick,
  groupVisits,
  isDeveloperAuthorized,
  sortSmartViews,
} from "@/lib/account/presentation";

const restaurant = {
  place_id: "place-1",
  name_ja: "フィーユ食堂",
  name_en: "Fiyu Shokudo",
  primary_category: "Japanese",
  neighborhood: "Koenji",
  display_area: "Koenji",
  fiyu_score: 84,
  score_band: "strong",
};

function visit(id: string, visitedAt: string, rating: number | null, note: string | null): RestaurantVisit {
  return {
    id,
    place_id: restaurant.place_id,
    visited_at: visitedAt,
    reaction: null,
    rating,
    private_note: note,
    created_at: visitedAt,
    updated_at: visitedAt,
    restaurant,
  } as RestaurantVisit;
}

describe("account presentation", () => {
  it("sorts Smart Lists into the established product order", () => {
    const views = [
      { key: "nearby", label: "Nearby" },
      { key: "recently_saved", label: "Recently saved" },
      { key: "not_visited", label: "Not visited" },
      { key: "fiyu_9_plus", label: "Fiyu 9+" },
    ].map((view) => ({
      ...view,
      description: view.label,
      tier: "free",
      locked: false,
      available: true,
      item_count: 1,
      required_capability: null,
      unavailable_reason: null,
      collection_type: null,
    })) as SmartViewCatalogEntry[];

    expect(sortSmartViews(views).map((view) => view.key)).toEqual([
      "recently_saved",
      "fiyu_9_plus",
      "not_visited",
      "nearby",
    ]);
  });

  it("groups visits newest-first by month without dropping ratings or notes", () => {
    const groups = groupVisits([
      visit("older", "2026-08-12T12:00:00Z", 3, "Quiet lunch."),
      visit("newest", "2026-10-25T18:00:00Z", 5, "Excellent counter."),
      visit("middle", "2026-10-02T18:00:00Z", 4, null),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["2026-10", "2026-08"]);
    expect(groups[0].visits.map((item) => item.id)).toEqual(["newest", "middle"]);
    expect(groups[0].visits[0]).toMatchObject({ rating: 5, private_note: "Excellent counter." });
  });

  it("requires explicit server authorization for native developer tools", () => {
    expect(isDeveloperAuthorized(undefined)).toBe(false);
    expect(isDeveloperAuthorized({ enabled: true, authorized: false } as unknown as DeveloperStatus)).toBe(false);
    expect(isDeveloperAuthorized({ enabled: true, authorized: true } as DeveloperStatus)).toBe(true);
  });

  it("only offers processing for non-terminal My Pick states", () => {
    expect(canProcessMyPick({ status: "pending" } as MyPick)).toBe(true);
    expect(canProcessMyPick({ status: "failed_retryable" } as MyPick)).toBe(true);
    expect(canProcessMyPick({ status: "ready" } as MyPick)).toBe(false);
    expect(canProcessMyPick({ status: "failed_terminal" } as MyPick)).toBe(false);
  });
});
