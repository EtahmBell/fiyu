import { getApiBaseUrl } from "@/lib/config/env";

/**
 * URL construction for the three public backend endpoints.
 *
 * Constraints below are taken from the FastAPI route signatures in
 * fiyu-backend/src/fiyu/api.py and are enforced here so that we never send a
 * request the backend will reject with a 422.
 */

/** `limit: Annotated[int, Query(ge=1, le=200)] = 100` */
export const LIST_LIMIT_MIN = 1;
export const LIST_LIMIT_MAX = 200;
export const LIST_LIMIT_DEFAULT = 100;

/** `language_code: Annotated[str, Query(pattern="^(en|ja)$")] = "en"` */
export const LIVE_DETAILS_LANGUAGES = ["en", "ja"] as const;
export type LiveDetailsLanguage = (typeof LIVE_DETAILS_LANGUAGES)[number];

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return LIST_LIMIT_DEFAULT;
  return Math.min(LIST_LIMIT_MAX, Math.max(LIST_LIMIT_MIN, Math.trunc(limit)));
}

/** Path used for logging and for error classification (503 disambiguation). */
export const paths = {
  restaurants: "/public/restaurants",
  restaurant: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}`,
  liveDetails: (placeId: string) =>
    `/public/restaurants/${encodeURIComponent(placeId)}/live-details`,
} as const;

export function restaurantsUrl(limit: number = LIST_LIMIT_DEFAULT): string {
  const url = new URL(paths.restaurants, `${getApiBaseUrl()}/`);
  url.searchParams.set("limit", String(clampLimit(limit)));
  return url.toString();
}

export function restaurantUrl(placeId: string): string {
  return `${getApiBaseUrl()}${paths.restaurant(placeId)}`;
}

export function liveDetailsUrl(placeId: string, language: LiveDetailsLanguage = "en"): string {
  const url = new URL(`${getApiBaseUrl()}${paths.liveDetails(placeId)}`);
  url.searchParams.set("language_code", language);
  return url.toString();
}
