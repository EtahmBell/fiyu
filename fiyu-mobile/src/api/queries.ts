import { useQuery } from "@tanstack/react-query";

import {
  fetchActiveDailyPicks,
  fetchDefaultList,
  fetchDiscoveryLocation,
  fetchPersonalizedPickState,
  fetchRecentDailyPicks,
  fetchRestaurant,
  fetchRestaurantLog,
  fetchRestaurants,
} from "@/api/client";

export const PICKS_CITY_ID = "tokyo";
export const picksKeys = {
  active: ["picks", "active", PICKS_CITY_ID] as const,
  recent: ["picks", "recent", PICKS_CITY_ID] as const,
  saved: ["lists", "default", PICKS_CITY_ID] as const,
  log: ["log"] as const,
  location: ["profile", "discovery-location"] as const,
  personalized: ["personalized-picks"] as const,
};

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

export function usePicksResources() {
  const active = useQuery({ queryKey: picksKeys.active, queryFn: () => fetchActiveDailyPicks(PICKS_CITY_ID) });
  const recent = useQuery({ queryKey: picksKeys.recent, queryFn: () => fetchRecentDailyPicks(PICKS_CITY_ID) });
  const saved = useQuery({ queryKey: picksKeys.saved, queryFn: () => fetchDefaultList(PICKS_CITY_ID) });
  const log = useQuery({ queryKey: picksKeys.log, queryFn: fetchRestaurantLog });
  const location = useQuery({ queryKey: picksKeys.location, queryFn: fetchDiscoveryLocation });
  const personalized = useQuery({ queryKey: picksKeys.personalized, queryFn: fetchPersonalizedPickState });
  return { active, recent, saved, log, location, personalized };
}
