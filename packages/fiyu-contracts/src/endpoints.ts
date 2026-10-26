export const LIST_LIMIT_MIN = 1;
export const LIST_LIMIT_MAX = 200;
export const LIST_LIMIT_DEFAULT = 100;

export const paths = {
  restaurants: "/public/restaurants",
  restaurant: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}`,
  photoPreview: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}/photo-preview`,
  photos: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}/photos`,
  locationAnchors: "/public/location-anchors",
  profile: "/profiles/me",
  profileAvatar: "/profiles/me/avatar",
  profileAccount: "/profiles/me/account",
  discoveryLocation: "/profiles/me/discovery-location",
  authenticatedMapRestaurants: "/profiles/me/map-restaurants",
  dailyPicksAssign: "/daily-picks/assign",
  dailyPicksActive: "/daily-picks/active",
  dailyPicksRecent: "/daily-picks/recent",
  dailyPicksReveal: (roundId: string) => `/daily-picks/${encodeURIComponent(roundId)}/reveal`,
  personalizedPicksState: "/personalized-picks/me",
  personalizedPicksEvents: "/personalized-picks/events",
  personalizedPicksDismiss: (eventId: string) => `/personalized-picks/${encodeURIComponent(eventId)}/dismiss`,
  personalizedPicksSelect: (eventId: string) => `/personalized-picks/${encodeURIComponent(eventId)}/select`,
  myPicks: "/my-picks",
  myPicksQuota: "/my-picks/quota",
  myPick: (myPickId: string) => `/my-picks/${encodeURIComponent(myPickId)}`,
  myPickPlaceSuggestions: "/my-picks/place-suggestions",
  log: "/log",
  logVisit: (visitId: string) => `/log/${encodeURIComponent(visitId)}`,
  defaultList: "/lists/default",
  defaultListItems: "/lists/default/items",
  defaultListSmartViews: "/lists/default/smart-views",
  defaultListSmartView: (viewKey: string) => `/lists/default/smart-views/${encodeURIComponent(viewKey)}`,
  developerStatus: "/developer/status",
  developerMyPicksProcess: "/developer/my-picks/process",
  developerMyPickHardReset: "/developer/my-picks/hard-reset",
  authSignIn: "/auth/signin",
  authSignUp: "/auth/signup",
} as const;

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function restaurantsPath(limit: number = LIST_LIMIT_DEFAULT): string {
  const safeLimit = clamp(limit, LIST_LIMIT_MIN, LIST_LIMIT_MAX, LIST_LIMIT_DEFAULT);
  return `${paths.restaurants}?limit=${safeLimit}`;
}

export function restaurantPath(placeId: string): string {
  return paths.restaurant(placeId);
}

export function withQuery(path: string, values: Record<string, string>): string {
  const query = new URLSearchParams(values).toString();
  return query ? `${path}?${query}` : path;
}

export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
