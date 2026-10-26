import { paths, withQuery } from "@fiyu/contracts";
import type { MyPick } from "@fiyu/contracts";

import { myPickPollingInterval } from "./queries";
import { myPickSubmissionBody } from "./client";

describe("native Picks endpoint contract", () => {
  it("uses the same authenticated lifecycle paths as web", () => {
    expect(withQuery(paths.dailyPicksActive, { city_id: "tokyo" })).toBe("/daily-picks/active?city_id=tokyo");
    expect(withQuery(paths.dailyPicksRecent, { city_id: "tokyo" })).toBe("/daily-picks/recent?city_id=tokyo");
    expect(paths.dailyPicksReveal("round/one")).toBe("/daily-picks/round%2Fone/reveal");
    expect(paths.personalizedPicksSelect("event/one")).toBe("/personalized-picks/event%2Fone/select");
    expect(paths.myPicks).toBe("/my-picks");
    expect(paths.myPicksQuota).toBe("/my-picks/quota");
    expect(paths.myPick("pick/one")).toBe("/my-picks/pick%2Fone");
    expect(paths.myPickPlaceSuggestions).toBe("/my-picks/place-suggestions");
  });

  it("keeps mutations on narrow domain endpoints", () => {
    expect(paths.defaultListItems).toBe("/lists/default/items");
    expect(paths.log).toBe("/log");
    expect(paths.photoPreview("place/one")).toBe("/public/restaurants/place%2Fone/photo-preview");
    expect(withQuery(paths.photos("place/one"), { limit: "5" })).toBe("/public/restaurants/place%2Fone/photos?limit=5");
  });

  it("polls My Pick only while unfinished work exists", () => {
    const item = { status: "pending", result_ready: false, fiyu_score: null, score_version: null } as MyPick;
    expect(myPickPollingInterval([item])).toBe(30_000);
    expect(myPickPollingInterval([{ ...item, result_ready: true }])).toBe(false);
    expect(myPickPollingInterval([{ ...item, status: "ready", result_ready: true }])).toBe(false);
    expect(myPickPollingInterval([{ ...item, status: "needs_location", result_ready: true }])).toBe(false);
    expect(myPickPollingInterval(undefined)).toBe(false);
  });

  it("submits only the selected identity and original authored hints", () => {
    expect(myPickSubmissionBody({ externalPlaceId: "ChIJselected", userNameHint: "Original name", userAddressHint: "Original address" })).toEqual({
      provider: "google",
      external_place_id: "ChIJselected",
      user_name_hint: "Original name",
      user_address_hint: "Original address",
    });
  });
});
