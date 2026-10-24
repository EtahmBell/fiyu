import {
  createFetchTransport,
  FiyuApiError,
  parseRestaurantList,
  publicRestaurantDetailSchema,
  restaurantPath,
  restaurantsPath,
  type ParsedRestaurantList,
  type PublicRestaurantDetail,
} from "@fiyu/contracts";

import { getSupabaseClient, isSupabaseConfigured } from "@/auth/supabase";
import { getApiBaseUrl } from "@/config/env";

const transport = createFetchTransport({
  baseUrl: getApiBaseUrl(),
  tokenProvider: {
    async getAccessToken() {
      if (!isSupabaseConfigured()) return null;
      const { data } = await getSupabaseClient().auth.getSession();
      return data.session?.access_token ?? null;
    },
  },
});

export async function fetchRestaurants(limit = 100): Promise<ParsedRestaurantList> {
  const path = restaurantsPath(limit);
  const { payload, status } = await transport.requestRaw(path);
  const parsed = parseRestaurantList(payload);
  if (!parsed) {
    throw new FiyuApiError({
      kind: "invalid-response",
      endpoint: path,
      status,
      detail: "Expected a JSON array of restaurants",
    });
  }
  return parsed;
}

export function fetchRestaurant(placeId: string): Promise<PublicRestaurantDetail> {
  const path = restaurantPath(placeId);
  return transport.requestJson(path, publicRestaurantDetailSchema);
}
