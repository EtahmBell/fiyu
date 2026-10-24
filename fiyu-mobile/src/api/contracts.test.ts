import { parseRestaurantList, publicRestaurantSchema } from "@fiyu/contracts";

import { restaurantFixture } from "@/test/restaurantFixture";

describe("shared Fiyu contracts", () => {
  it("parses the same real-shaped restaurant schema used by web", () => {
    expect(publicRestaurantSchema.parse(restaurantFixture).place_id).toBe("ChIJnativeproof");
  });

  it("parses a native catalog response through the shared row-safe parser", () => {
    expect(parseRestaurantList([restaurantFixture])?.restaurants).toHaveLength(1);
  });

  it("rejects malformed rows consistently without discarding valid rows", () => {
    const parsed = parseRestaurantList([restaurantFixture, { place_id: "bad", fiyu_score: "84" }]);
    expect(parsed?.restaurants).toHaveLength(1);
    expect(parsed?.rejected).toHaveLength(1);
  });
});
