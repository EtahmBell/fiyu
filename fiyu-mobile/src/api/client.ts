import {
  activeDailyPickAssignmentResponseSchema,
  createFetchTransport,
  dailyPickAssignmentResponseSchema,
  dailyPickRevealResponseSchema,
  defaultListMutationResponseSchema,
  defaultListResponseSchema,
  discoveryLocationSchema,
  FiyuApiError,
  googlePhotoSchema,
  googlePhotoListSchema,
  myPickListSchema,
  myPickPlaceSuggestionListSchema,
  myPickQuotaSchema,
  myPickSchema,
  mapRestaurantListSchema,
  parseRestaurantList,
  paths,
  personalizedPickStateSchema,
  publicRestaurantDetailSchema,
  recentDailyPickRoundListSchema,
  restaurantPath,
  restaurantVisitListSchema,
  restaurantVisitSchema,
  restaurantsPath,
  withQuery,
  type DailyPickAssignmentResponse,
  type DefaultListMutationResponse,
  type DefaultListResponse,
  type DiscoveryLocation,
  type GooglePhoto,
  type MyPick,
  type MyPickPlaceSuggestion,
  type MyPickQuota,
  type MapRestaurant,
  type ParsedRestaurantList,
  type PersonalizedPickState,
  type PublicRestaurantDetail,
  type RecentDailyPickRound,
  type RestaurantVisit,
} from "@fiyu/contracts";
import * as SecureStore from "expo-secure-store";

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

const CLIENT_ID_KEY = "fiyu.native.client-id";
let clientIdPromise: Promise<string> | null = null;

async function getClientId(): Promise<string> {
  if (!clientIdPromise) {
    clientIdPromise = (async () => {
      const stored = await SecureStore.getItemAsync(CLIENT_ID_KEY);
      if (stored) return stored;
      const created = `native-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await SecureStore.setItemAsync(CLIENT_ID_KEY, created);
      return created;
    })();
  }
  return clientIdPromise;
}

async function identityHeaders(): Promise<Record<string, string>> {
  return { "X-Fiyu-Client-Id": await getClientId() };
}

export interface DailyPickAssignmentRequest {
  city_id: string;
  legacy_served_place_ids: string[];
  categories: string[];
  non_japanese: "yes" | "occasionally" | "japanese-only";
  active_area: string | null;
  location_mode?: "current" | "preview" | "manual" | null;
  location_state?: "in_tokyo_live_gps" | "outside_tokyo_with_preview_area" | "outside_tokyo_needs_preview_area" | "location_unavailable" | null;
  discovery_latitude?: number | null;
  discovery_longitude?: number | null;
  requested_count: 3;
}

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

export async function fetchActiveDailyPicks(cityId: string): Promise<DailyPickAssignmentResponse | null> {
  return transport.requestJson(withQuery(paths.dailyPicksActive, { city_id: cityId }), activeDailyPickAssignmentResponseSchema, { headers: await identityHeaders() });
}

export async function fetchRecentDailyPicks(cityId: string): Promise<RecentDailyPickRound[]> {
  return transport.requestJson(withQuery(paths.dailyPicksRecent, { city_id: cityId }), recentDailyPickRoundListSchema, { headers: await identityHeaders() });
}

export async function assignDailyPicks(request: DailyPickAssignmentRequest): Promise<DailyPickAssignmentResponse> {
  return transport.requestJson(paths.dailyPicksAssign, dailyPickAssignmentResponseSchema, { method: "POST", body: request, headers: await identityHeaders() });
}

export async function revealDailyPick(roundId: string, placeId: string) {
  return transport.requestJson(paths.dailyPicksReveal(roundId), dailyPickRevealResponseSchema, { method: "POST", body: { place_id: placeId }, headers: await identityHeaders() });
}

export function fetchDiscoveryLocation(): Promise<DiscoveryLocation> {
  return transport.requestJson(paths.discoveryLocation, discoveryLocationSchema);
}

export function fetchAuthenticatedMapRestaurants(): Promise<MapRestaurant[]> {
  return transport.requestJson(paths.authenticatedMapRestaurants, mapRestaurantListSchema);
}

export async function fetchDefaultList(cityId: string): Promise<DefaultListResponse> {
  return transport.requestJson(withQuery(paths.defaultList, { city_id: cityId }), defaultListResponseSchema, { headers: await identityHeaders() });
}

export async function addToDefaultList(cityId: string, placeId: string): Promise<DefaultListMutationResponse> {
  return transport.requestJson(paths.defaultListItems, defaultListMutationResponseSchema, { method: "POST", body: { city_id: cityId, place_id: placeId }, headers: await identityHeaders() });
}

export async function removeFromDefaultList(cityId: string, placeId: string): Promise<DefaultListMutationResponse> {
  return transport.requestJson(paths.defaultListItems, defaultListMutationResponseSchema, { method: "DELETE", body: { city_id: cityId, place_id: placeId }, headers: await identityHeaders() });
}

export async function fetchRestaurantLog(): Promise<RestaurantVisit[]> {
  return transport.requestJson(paths.log, restaurantVisitListSchema, { headers: await identityHeaders() });
}

export async function createRestaurantVisit(input: { place_id: string; visited_at: string; rating: 1 | 2 | 3 | 4 | 5; private_note: string | null }): Promise<RestaurantVisit> {
  return transport.requestJson(paths.log, restaurantVisitSchema, { method: "POST", body: input, headers: await identityHeaders() });
}

export function fetchPhotoPreview(placeId: string): Promise<GooglePhoto> {
  return transport.requestJson(paths.photoPreview(placeId), googlePhotoSchema);
}

export function fetchPhotos(placeId: string, limit = 5): Promise<GooglePhoto[]> {
  return transport.requestJson(
    withQuery(paths.photos(placeId), { limit: String(limit) }),
    googlePhotoListSchema,
  );
}

export function fetchPersonalizedPickState(): Promise<PersonalizedPickState> {
  return transport.requestJson(paths.personalizedPicksState, personalizedPickStateSchema);
}

export function createPersonalizedPickEvent(): Promise<PersonalizedPickState> {
  return transport.requestJson(paths.personalizedPicksEvents, personalizedPickStateSchema, { method: "POST" });
}

export function dismissPersonalizedPickEvent(eventId: string): Promise<PersonalizedPickState> {
  return transport.requestJson(paths.personalizedPicksDismiss(eventId), personalizedPickStateSchema, { method: "POST" });
}

export function selectPersonalizedPick(eventId: string, position: number): Promise<PersonalizedPickState> {
  return transport.requestJson(paths.personalizedPicksSelect(eventId), personalizedPickStateSchema, { method: "POST", body: { position } });
}

export function fetchMyPicks(): Promise<MyPick[]> {
  return transport.requestJson(paths.myPicks, myPickListSchema);
}

export function fetchMyPick(myPickId: string): Promise<MyPick> {
  return transport.requestJson(paths.myPick(myPickId), myPickSchema);
}

export function fetchMyPickQuota(): Promise<MyPickQuota> {
  return transport.requestJson(paths.myPicksQuota, myPickQuotaSchema);
}

export function fetchMyPickPlaceSuggestions(input: {
  name: string;
  address: string;
  session_token: string;
}): Promise<MyPickPlaceSuggestion[]> {
  return transport.requestJson(paths.myPickPlaceSuggestions, myPickPlaceSuggestionListSchema, {
    method: "POST",
    body: input,
  });
}

export function submitMyPick(input: {
  externalPlaceId: string;
  userNameHint: string;
  userAddressHint: string;
}): Promise<MyPick> {
  return transport.requestJson(paths.myPicks, myPickSchema, {
    method: "POST",
    body: myPickSubmissionBody(input),
  });
}

export function myPickSubmissionBody(input: {
  externalPlaceId: string;
  userNameHint: string;
  userAddressHint: string;
}) {
  return {
    provider: "google" as const,
    external_place_id: input.externalPlaceId,
    user_name_hint: input.userNameHint,
    user_address_hint: input.userAddressHint,
  };
}
