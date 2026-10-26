import {
  activeDailyPickAssignmentResponseSchema,
  createFetchTransport,
  dailyPickAssignmentResponseSchema,
  dailyPickRevealResponseSchema,
  defaultListMutationResponseSchema,
  defaultListResponseSchema,
  deleteRestaurantVisitResponseSchema,
  developerMyPickHardResetSchema,
  developerMyPickProcessSchema,
  developerStatusSchema,
  discoveryLocationSchema,
  FiyuApiError,
  googlePhotoSchema,
  googlePhotoListSchema,
  myPickListSchema,
  myPickPlaceSuggestionListSchema,
  myPickQuotaSchema,
  myPickSchema,
  mapRestaurantListSchema,
  locationAnchorListSchema,
  parseRestaurantList,
  paths,
  personalizedPickStateSchema,
  publicRestaurantDetailSchema,
  recentDailyPickRoundListSchema,
  restaurantPath,
  restaurantVisitListSchema,
  restaurantVisitSchema,
  smartViewCatalogResponseSchema,
  smartViewResponseSchema,
  togetherInviteCreatedSchema,
  togetherInvitePreviewSchema,
  togetherSessionSchema,
  togetherStateSchema,
  userProfileSchema,
  restaurantsPath,
  withQuery,
  type DailyPickAssignmentResponse,
  type DefaultListMutationResponse,
  type DefaultListResponse,
  type DeveloperMyPickHardReset,
  type DeveloperMyPickProcess,
  type DeveloperStatus,
  type DiscoveryLocation,
  type GooglePhoto,
  type MyPick,
  type MyPickPlaceSuggestion,
  type MyPickQuota,
  type MapRestaurant,
  type LocationAnchor,
  type ParsedRestaurantList,
  type PersonalizedPickState,
  type PublicRestaurantDetail,
  type RecentDailyPickRound,
  type RestaurantVisit,
  type SmartViewCatalogResponse,
  type SmartViewResponse,
  type TogetherInviteCreated,
  type TogetherInvitePreview,
  type TogetherSession,
  type TogetherState,
  type UserProfile,
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

export function fetchLocationAnchors(): Promise<LocationAnchor[]> {
  return transport.requestJson(paths.locationAnchors, locationAnchorListSchema);
}

export function updateDiscoveryLocation(anchor: LocationAnchor): Promise<DiscoveryLocation> {
  return transport.requestJson(paths.discoveryLocation, discoveryLocationSchema, {
    method: "PUT",
    body: {
      location_mode: "manual",
      discovery_latitude: anchor.latitude,
      discovery_longitude: anchor.longitude,
      discovery_label: anchor.area_name,
      arrival_date: null,
    },
  });
}

export function fetchProfile(): Promise<UserProfile> {
  return transport.requestJson(paths.profile, userProfileSchema);
}

export function updateProfile(input: { username: string; display_name: string | null; bio: string | null }): Promise<UserProfile> {
  return transport.requestJson(paths.profile, userProfileSchema, { method: "PATCH", body: input });
}

export function updateProfileAvatar(avatarUrl: string | null): Promise<UserProfile> {
  return transport.requestJson(paths.profileAvatar, userProfileSchema, { method: "PATCH", body: { avatar_url: avatarUrl } });
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

export function updateRestaurantVisit(visitId: string, input: { visited_at?: string; rating?: 1 | 2 | 3 | 4 | 5; private_note?: string | null }): Promise<RestaurantVisit> {
  return transport.requestJson(paths.logVisit(visitId), restaurantVisitSchema, { method: "PATCH", body: input });
}

export function deleteRestaurantVisit(visitId: string): Promise<boolean> {
  return transport.requestJson(paths.logVisit(visitId), deleteRestaurantVisitResponseSchema, { method: "DELETE" }).then((value) => value.deleted);
}

export function fetchSmartViews(cityId: string): Promise<SmartViewCatalogResponse> {
  return transport.requestJson(withQuery(paths.defaultListSmartViews, { city_id: cityId }), smartViewCatalogResponseSchema);
}

export function fetchSmartView(cityId: string, viewKey: string, location?: DiscoveryLocation): Promise<SmartViewResponse> {
  const query: Record<string, string> = { city_id: cityId };
  if (location?.discovery_latitude != null && location.discovery_longitude != null) {
    query.origin_latitude = String(location.discovery_latitude);
    query.origin_longitude = String(location.discovery_longitude);
  }
  return transport.requestJson(withQuery(paths.defaultListSmartView(viewKey), query), smartViewResponseSchema);
}

export function fetchDeveloperStatus(): Promise<DeveloperStatus> {
  return transport.requestJson(paths.developerStatus, developerStatusSchema);
}

export function processDeveloperMyPick(myPickId: string): Promise<DeveloperMyPickProcess> {
  return transport.requestJson(paths.developerMyPicksProcess, developerMyPickProcessSchema, {
    method: "POST", body: { my_pick_id: myPickId, retry_failed: true },
  });
}

export function hardResetDeveloperMyPick(myPickId: string): Promise<DeveloperMyPickHardReset> {
  return transport.requestJson(paths.developerMyPickHardReset, developerMyPickHardResetSchema, {
    method: "POST", body: { my_pick_id: myPickId },
  });
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

export function fetchTogetherState(): Promise<TogetherState> {
  return transport.requestJson(paths.togetherState, togetherStateSchema);
}

export function createTogetherInvite(): Promise<TogetherInviteCreated> {
  return transport.requestJson(paths.togetherInvites, togetherInviteCreatedSchema, { method: "POST" });
}

export function rotateTogetherInvite(sessionId: string): Promise<TogetherInviteCreated> {
  return transport.requestJson(paths.togetherShareToken(sessionId), togetherInviteCreatedSchema, { method: "POST" });
}

export async function cancelTogetherInvite(sessionId: string): Promise<void> {
  await transport.requestRaw(paths.togetherSession(sessionId), { method: "DELETE" });
}

export function fetchTogetherInvite(token: string): Promise<TogetherInvitePreview> {
  return transport.requestJson(paths.togetherInvite(token), togetherInvitePreviewSchema);
}

export function acceptTogetherInvite(token: string): Promise<TogetherSession> {
  return transport.requestJson(paths.togetherAccept(token), togetherSessionSchema, { method: "POST" });
}

export function fetchTogetherSession(sessionId: string): Promise<TogetherSession> {
  return transport.requestJson(paths.togetherSession(sessionId), togetherSessionSchema);
}

export function revealTogetherSession(sessionId: string): Promise<TogetherSession> {
  return transport.requestJson(paths.togetherReveal(sessionId), togetherSessionSchema, { method: "POST" });
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
