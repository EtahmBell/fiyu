import { getApiBaseUrl } from "@/lib/config/env";

/**
 * URL construction for the public backend endpoints.
 *
 * Constraints are taken from the FastAPI route signatures in
 * fiyu-backend/src/fiyu/api.py and enforced here so we never send a request the
 * backend will reject with a 422.
 *
 * The /live-details route was removed from the backend; the frontend no longer
 * fetches Google ratings, hours, price or review counts anywhere.
 */

/** `limit: Annotated[int, Query(ge=1, le=200)] = 100` */
export const LIST_LIMIT_MIN = 1;
export const LIST_LIMIT_MAX = 200;
export const LIST_LIMIT_DEFAULT = 100;

/** `limit: Annotated[int, Query(ge=1, le=10)] = 5` on the photos route. */
export const PHOTOS_LIMIT_MIN = 1;
export const PHOTOS_LIMIT_MAX = 10;
export const PHOTOS_LIMIT_DEFAULT = 5;

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Paths, used for logging and for error classification. */
export const paths = {
  restaurants: "/public/restaurants",
  restaurant: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}`,
  photoPreview: (placeId: string) =>
    `/public/restaurants/${encodeURIComponent(placeId)}/photo-preview`,
  photos: (placeId: string) => `/public/restaurants/${encodeURIComponent(placeId)}/photos`,
  locationAnchors: "/public/location-anchors",
} as const;

export function restaurantsUrl(limit: number = LIST_LIMIT_DEFAULT): string {
  const url = new URL(paths.restaurants, `${getApiBaseUrl()}/`);
  url.searchParams.set("limit", String(clamp(limit, LIST_LIMIT_MIN, LIST_LIMIT_MAX, LIST_LIMIT_DEFAULT)));
  return url.toString();
}

export function restaurantUrl(placeId: string): string {
  return `${getApiBaseUrl()}${paths.restaurant(placeId)}`;
}

export function photoPreviewUrl(placeId: string): string {
  return `${getApiBaseUrl()}${paths.photoPreview(placeId)}`;
}

export function photosUrl(placeId: string, limit: number = PHOTOS_LIMIT_DEFAULT): string {
  const url = new URL(`${getApiBaseUrl()}${paths.photos(placeId)}`);
  url.searchParams.set(
    "limit",
    String(clamp(limit, PHOTOS_LIMIT_MIN, PHOTOS_LIMIT_MAX, PHOTOS_LIMIT_DEFAULT)),
  );
  return url.toString();
}

export function locationAnchorsUrl(): string {
  return `${getApiBaseUrl()}${paths.locationAnchors}`;
}
