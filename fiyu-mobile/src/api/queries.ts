import { useQuery } from "@tanstack/react-query";

import { fetchRestaurant, fetchRestaurants } from "@/api/client";

export const catalogQueryKey = ["catalog", "published"] as const;

export function useRestaurants() {
  return useQuery({
    queryKey: catalogQueryKey,
    queryFn: () => fetchRestaurants(200),
  });
}

export function useRestaurant(placeId: string) {
  return useQuery({
    queryKey: ["restaurant", placeId],
    queryFn: () => fetchRestaurant(placeId),
    enabled: placeId.length > 0,
  });
}
