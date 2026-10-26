import type { DailyPickAssignmentResponse, MyPick, ParsedRestaurantList, PersonalizedPickState, PublicRestaurantDetail, RecentDailyPickRound } from "@fiyu/contracts";
import { publicRestaurantDetailSchema } from "@fiyu/contracts";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  fetchActiveDailyPicks,
  fetchDiscoveryLocation,
  fetchMyPickQuota,
  fetchMyPicks,
  fetchPersonalizedPickState,
  fetchPhotos,
  fetchRecentDailyPicks,
  fetchRestaurant,
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
  myPicks: ["my-picks"] as const,
  myPickQuota: ["my-picks", "quota"] as const,
};

const MY_PICK_UNFINISHED = new Set<MyPick["status"]>(["pending", "resolving_identity", "researching"]);

export function myPickPollingInterval(items: MyPick[] | undefined): number | false {
  return items?.some((item) => {
    const resultReady = item.result_ready || (item.fiyu_score !== null && item.score_version !== null);
    return !resultReady && MY_PICK_UNFINISHED.has(item.status);
  }) ? 30_000 : false;
}

export const catalogQueryKey = ["catalog", "published"] as const;
export const restaurantQueryKey = (placeId: string) => ["restaurant", placeId] as const;
export const restaurantPhotosQueryKey = (placeId: string) => ["restaurant-photos", placeId] as const;

export function useRestaurants() {
  return useQuery({
    queryKey: catalogQueryKey,
    queryFn: () => fetchRestaurants(200),
  });
}

export function useRestaurant(placeId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: restaurantQueryKey(placeId),
    queryFn: () => fetchRestaurant(placeId),
    enabled: placeId.length > 0,
    placeholderData: () => findCachedRestaurant(queryClient, placeId),
  });
}

export function findCachedRestaurant(queryClient: QueryClient, placeId: string): PublicRestaurantDetail | undefined {
  const active = queryClient.getQueryData<DailyPickAssignmentResponse | null>(picksKeys.active);
  const recent = queryClient.getQueryData<RecentDailyPickRound[]>(picksKeys.recent) ?? [];
  const personalized = queryClient.getQueryData<PersonalizedPickState>(picksKeys.personalized);
  const catalog = queryClient.getQueryData<ParsedRestaurantList>(catalogQueryKey);
  const candidate = active?.restaurants?.find((item) => item.place_id === placeId)
    ?? recent.flatMap((round) => round.restaurants).find((item) => item.place_id === placeId)
    ?? (personalized?.selected_restaurant?.place_id === placeId ? personalized.selected_restaurant : undefined)
    ?? catalog?.restaurants.find((item) => item.place_id === placeId);
  if (!candidate) return undefined;
  const parsed = publicRestaurantDetailSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function useRestaurantPhotos(placeId: string) {
  return useQuery({
    queryKey: restaurantPhotosQueryKey(placeId),
    queryFn: () => fetchPhotos(placeId, 5),
    enabled: placeId.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function usePicksResources() {
  const active = useQuery({ queryKey: picksKeys.active, queryFn: () => fetchActiveDailyPicks(PICKS_CITY_ID) });
  const recent = useQuery({ queryKey: picksKeys.recent, queryFn: () => fetchRecentDailyPicks(PICKS_CITY_ID) });
  const location = useQuery({ queryKey: picksKeys.location, queryFn: fetchDiscoveryLocation });
  const personalized = useQuery({ queryKey: picksKeys.personalized, queryFn: fetchPersonalizedPickState });
  return { active, recent, location, personalized };
}

export function useMyPickResources() {
  const picks = useQuery({
    queryKey: picksKeys.myPicks,
    queryFn: fetchMyPicks,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      return myPickPollingInterval(query.state.data as MyPick[] | undefined);
    },
    refetchIntervalInBackground: false,
  });
  const quota = useQuery({
    queryKey: picksKeys.myPickQuota,
    queryFn: fetchMyPickQuota,
    refetchOnWindowFocus: true,
  });
  return { picks, quota };
}
