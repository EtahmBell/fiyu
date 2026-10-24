export const LIST_LIMIT_MIN = 1;
export const LIST_LIMIT_MAX = 200;
export const LIST_LIMIT_DEFAULT = 100;

export const paths = {
  restaurants: "/public/restaurants",
  restaurant: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}`,
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

export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
