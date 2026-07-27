import type { z } from "zod";

import {
  FiyuApiError,
  extractDetail,
  kindForNetworkFailure,
  kindForStatus,
} from "@/lib/api/errors";
import {
  LIST_LIMIT_DEFAULT,
  PHOTOS_LIMIT_DEFAULT,
  locationAnchorsUrl,
  paths,
  photoPreviewUrl,
  photosUrl,
  restaurantUrl,
  restaurantsUrl,
} from "@/lib/api/endpoints";
import {
  type GooglePhoto,
  type LocationAnchor,
  type ParsedRestaurantList,
  type PublicRestaurant,
  describeZodIssues,
  googlePhotoListSchema,
  googlePhotoSchema,
  locationAnchorListSchema,
  parseRestaurantList,
  publicRestaurantSchema,
} from "@/lib/api/schemas";

/**
 * The only module in the app that performs network I/O against the backend.
 *
 * Runs unchanged in Server Components and in the browser, because
 * NEXT_PUBLIC_FIYU_API_URL is available in both. `next.revalidate` is honoured
 * server-side and ignored by the browser.
 *
 * Every response is validated with Zod before reaching a component, and every
 * failure is normalised into a FiyuApiError so the UI branches on `kind`
 * rather than on status codes.
 *
 * There is deliberately no live-details call: the backend removed that route,
 * and Google ratings, hours, price and review counts are not shown anywhere.
 */

export interface RequestOptions {
  signal?: AbortSignal;
  /** Server-side cache lifetime in seconds. Ignored in the browser. */
  revalidate?: number | false;
}

/** Catalog cache window. The catalog changes only on manual publish. */
export const CATALOG_REVALIDATE_SECONDS = 300;

/**
 * Photo references are short-lived upstream, so they are cached briefly and
 * never indefinitely. A stale media_url resolves to a broken image.
 */
export const PHOTO_REVALIDATE_SECONDS = 900;

/** Anchors are operator-curated config and change rarely. */
export const ANCHOR_REVALIDATE_SECONDS = 3600;

async function requestRaw(
  url: string,
  endpoint: string,
  options: RequestOptions = {},
): Promise<{ payload: unknown; status: number }> {
  const { signal, revalidate } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      ...(revalidate === undefined ? {} : { next: { revalidate } }),
    });
  } catch (cause) {
    // An abort is a caller-initiated cancellation, not a failure.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    // The raw undici rejection is not attached as `cause`: its nested
    // TypeError -> ECONNREFUSED chain crashes the Next 16 dev error overlay.
    throw new FiyuApiError({
      kind: kindForNetworkFailure(),
      endpoint,
      detail: cause instanceof Error ? cause.message : undefined,
    });
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = extractDetail(await response.json());
    } catch {
      detail = undefined;
    }
    throw new FiyuApiError({
      kind: kindForStatus(response.status, endpoint),
      endpoint,
      status: response.status,
      detail,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new FiyuApiError({
      kind: "invalid-response",
      endpoint,
      status: response.status,
      detail: "Response body was not valid JSON",
      cause,
    });
  }

  return { payload, status: response.status };
}

async function requestJson<TSchema extends z.ZodType>(
  url: string,
  endpoint: string,
  schema: TSchema,
  options: RequestOptions = {},
): Promise<z.infer<TSchema>> {
  const { payload, status } = await requestRaw(url, endpoint, options);

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new FiyuApiError({
      kind: "invalid-response",
      endpoint,
      status,
      detail: describeZodIssues(parsed.error),
      cause: parsed.error,
    });
  }

  return parsed.data;
}

/**
 * The published catalog. Returns every published restaurant in one call --
 * the backend has no pagination, so filtering and ranking happen client-side.
 *
 * Rows are validated individually: a malformed record is dropped and reported
 * in `rejected` rather than failing the whole catalog.
 */
export async function fetchRestaurants(
  limit: number = LIST_LIMIT_DEFAULT,
  options: RequestOptions = {},
): Promise<ParsedRestaurantList> {
  const { payload, status } = await requestRaw(restaurantsUrl(limit), paths.restaurants, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
    ...options,
  });

  const parsed = parseRestaurantList(payload);
  if (parsed === null) {
    throw new FiyuApiError({
      kind: "invalid-response",
      endpoint: paths.restaurants,
      status,
      detail: "Expected a JSON array of restaurants",
    });
  }

  return parsed;
}

/**
 * A single published restaurant. Returns exactly the same fields as a list
 * item, so prefer reusing already-fetched list data where possible.
 */
export function fetchRestaurant(
  placeId: string,
  options: RequestOptions = {},
): Promise<PublicRestaurant> {
  return requestJson(restaurantUrl(placeId), paths.restaurant(placeId), publicRestaurantSchema, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
    ...options,
  });
}

/**
 * One preview photo for a card. Each call costs a billed Google request on the
 * backend, so callers must fetch lazily -- as a card nears the viewport, never
 * for the whole list at once.
 */
export function fetchPhotoPreview(
  placeId: string,
  options: RequestOptions = {},
): Promise<GooglePhoto> {
  return requestJson(photoPreviewUrl(placeId), paths.photoPreview(placeId), googlePhotoSchema, {
    revalidate: PHOTO_REVALIDATE_SECONDS,
    ...options,
  });
}

/** Up to ten photos for a detail view. Call only when the detail opens. */
export function fetchPhotos(
  placeId: string,
  limit: number = PHOTOS_LIMIT_DEFAULT,
  options: RequestOptions = {},
): Promise<GooglePhoto[]> {
  return requestJson(photosUrl(placeId, limit), paths.photos(placeId), googlePhotoListSchema, {
    revalidate: PHOTO_REVALIDATE_SECONDS,
    ...options,
  });
}

/** Operator-curated approximate area centres. May legitimately be empty. */
export function fetchLocationAnchors(options: RequestOptions = {}): Promise<LocationAnchor[]> {
  return requestJson(locationAnchorsUrl(), paths.locationAnchors, locationAnchorListSchema, {
    revalidate: ANCHOR_REVALIDATE_SECONDS,
    ...options,
  });
}
