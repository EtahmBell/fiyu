import { restaurantDetailFixture } from "@/test/restaurantFixture";
import { restaurantDirectionsUrl, restaurantShareUrl } from "./outbound";

describe("native restaurant outbound actions", () => {
  it("builds a canonical share URL without temporary photo URLs", () => {
    expect(restaurantShareUrl("place/one")).toBe("https://fiyu.app/restaurants/place%2Fone");
  });

  it("uses coordinates only when the backend cleared them for directions", () => {
    expect(restaurantDirectionsUrl(restaurantDetailFixture, "android")).toContain("query=35.705%2C139.65");
    expect(restaurantDirectionsUrl({ ...restaurantDetailFixture, directions_coordinates_eligible: false, external_map_search_query: null }, "android")).toBeNull();
  });

  it("falls back to the verified map search query without using coarse coordinates", () => {
    const url = restaurantDirectionsUrl({ ...restaurantDetailFixture, directions_coordinates_eligible: false, map_location_approximate: true, external_map_search_query: "Verified Tokyo address" }, "ios");
    expect(url).toContain("q=Verified%20Tokyo%20address");
    expect(url).not.toContain("35.705");
  });
});
