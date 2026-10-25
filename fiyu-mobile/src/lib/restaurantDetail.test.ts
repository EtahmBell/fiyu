import { FiyuApiError } from "@fiyu/contracts";
import { QueryClient } from "@tanstack/react-query";

import { findCachedRestaurant, picksKeys } from "@/api/queries";
import { restaurantFixture } from "@/test/restaurantFixture";
import { restaurantDetailErrorCopy } from "./restaurantDetail";

describe("native restaurant detail states", () => {
  it("distinguishes not-found, malformed, and retryable network failures", () => {
    expect(restaurantDetailErrorCopy(new FiyuApiError({ kind: "not-found", endpoint: "/restaurant" }))).toEqual(expect.objectContaining({ title: "Restaurant not found", retryable: false }));
    expect(restaurantDetailErrorCopy(new FiyuApiError({ kind: "invalid-response", endpoint: "/restaurant" }))).toEqual(expect.objectContaining({ title: "Restaurant details could not be read", retryable: true }));
    expect(restaurantDetailErrorCopy(new FiyuApiError({ kind: "network", endpoint: "/restaurant" }))).toEqual(expect.objectContaining({ title: "Restaurant could not be loaded", retryable: true }));
  });

  it("hydrates navigation immediately from a cached Picks restaurant while detail refreshes", () => {
    const client = new QueryClient();
    client.setQueryData(picksKeys.active, {
      round_id: "round", city_id: "tokyo", place_ids: [restaurantFixture.place_id], assigned_at: "2026-10-25T00:00:00Z",
      expires_at: "2026-10-26T00:00:00Z", revealed_at: null, revealed_place_ids: [], revealed_at_by_place_id: {}, restaurants: [restaurantFixture],
    });
    expect(findCachedRestaurant(client, restaurantFixture.place_id)).toEqual(expect.objectContaining({ place_id: restaurantFixture.place_id, cuisine_terms_en: [] }));
    client.clear();
  });
});
