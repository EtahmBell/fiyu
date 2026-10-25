import { paths, withQuery } from "@fiyu/contracts";

describe("native Picks endpoint contract", () => {
  it("uses the same authenticated lifecycle paths as web", () => {
    expect(withQuery(paths.dailyPicksActive, { city_id: "tokyo" })).toBe("/daily-picks/active?city_id=tokyo");
    expect(withQuery(paths.dailyPicksRecent, { city_id: "tokyo" })).toBe("/daily-picks/recent?city_id=tokyo");
    expect(paths.dailyPicksReveal("round/one")).toBe("/daily-picks/round%2Fone/reveal");
    expect(paths.personalizedPicksSelect("event/one")).toBe("/personalized-picks/event%2Fone/select");
  });

  it("keeps mutations on narrow domain endpoints", () => {
    expect(paths.defaultListItems).toBe("/lists/default/items");
    expect(paths.log).toBe("/log");
    expect(paths.photoPreview("place/one")).toBe("/public/restaurants/place%2Fone/photo-preview");
    expect(withQuery(paths.photos("place/one"), { limit: "5" })).toBe("/public/restaurants/place%2Fone/photos?limit=5");
  });
});
