export const LIST_LIMIT_MIN = 1;
export const LIST_LIMIT_MAX = 200;
export const LIST_LIMIT_DEFAULT = 100;

export const paths = {
  restaurants: "/public/restaurants",
  restaurant: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}`,
  photoPreview: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}/photo-preview`,
  discoveryLocation: "/profiles/me/discovery-location",
  dailyPicksAssign: "/daily-picks/assign",
  dailyPicksActive: "/daily-picks/active",
  dailyPicksRecent: "/daily-picks/recent",
  dailyPicksReveal: (roundId: string) => `/daily-picks/${encodeURIComponent(roundId)}/reveal`,
  personalizedPicksState: "/personalized-picks/me",
  personalizedPicksEvents: "/personalized-picks/events",
  personalizedPicksDismiss: (eventId: string) => `/personalized-picks/${encodeURIComponent(eventId)}/dismiss`,
  personalizedPicksSelect: (eventId: string) => `/personalized-picks/${encodeURIComponent(eventId)}/select`,
  log: "/log",
  defaultList: "/lists/default",
  defaultListItems: "/lists/default/items",
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
