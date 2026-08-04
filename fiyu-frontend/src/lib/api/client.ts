import type { z } from "zod";

import {
  FiyuApiError,
  extractDetail,
  kindForNetworkFailure,
  kindForStatus,
} from "@/lib/api/errors";
import {
  defaultListItemsUrl,
  defaultListSmartViewUrl,
  defaultListSmartViewsUrl,
  defaultListMembershipUrl,
  defaultListUrl,
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
  type DefaultListMembershipResponse,
  type DefaultListMutationResponse,
  type DefaultListResponse,
  type GooglePhoto,
  type LocationAnchor,
  type ParsedRestaurantList,
  type PublicRestaurantDetail,
  type SmartViewCatalogResponse,
  type SmartViewResponse,
  defaultListMembershipResponseSchema,
  defaultListMutationResponseSchema,
  defaultListResponseSchema,
  describeZodIssues,
  googlePhotoListSchema,
  googlePhotoSchema,
  locationAnchorListSchema,
  parseRestaurantList,
  publicRestaurantDetailSchema,
  smartViewCatalogResponseSchema,
  smartViewResponseSchema,
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
  /** Server-side cache tags, for targeted revalidation. Ignored in the browser. */
  tags?: string[];
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * Catalog cache window. Zero, deliberately -- not a forgotten default.
 *
 * The catalog changes only on manual publish, which is exactly the argument for
 * not caching it: an operator publishing or geocoding a restaurant is an
 * unpredictable, human-triggered write, so any fixed interval is a guess that
 * costs them up to that long staring at a page which does not yet show their
 * change. This previously sat at 300 s.
 *
 * `revalidate: 0` prevents caching (see the bundled Next docs,
 * 01-app/03-api-reference/04-functions/fetch.md). Do not also pass
 * `cache: "no-store"`: conflicting options cause BOTH to be ignored.
 *
 * Consequence: `/` renders dynamically, reported as `ƒ` rather than `○` by
 * `next build`. That does not weaken the "build succeeds with the backend
 * offline" property -- it removes the build-time fetch that could fail.
 *
 * The right end state is caching indefinitely and invalidating on publish, via
 * revalidateTag("catalog") called from the backend's publish command. The tag is
 * already attached below; only the route and the operator workflow are missing.
 */
export const CATALOG_REVALIDATE_SECONDS = 0;

/** Cache tag for the published catalog, for future publish-time invalidation. */
export const CATALOG_CACHE_TAG = "catalog";

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
  const { signal, revalidate, tags } = options;
  const method = options.method ?? "GET";
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };
  const hasBody = options.body !== undefined;
  const body = hasBody ? JSON.stringify(options.body) : undefined;
  if (hasBody) requestHeaders["Content-Type"] = "application/json";

  const next = {
    ...(revalidate === undefined ? {} : { revalidate }),
    ...(tags === undefined ? {} : { tags }),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      signal,
      ...(body === undefined ? {} : { body }),
      ...(Object.keys(next).length === 0 ? {} : { next }),
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
    tags: [CATALOG_CACHE_TAG],
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
): Promise<PublicRestaurantDetail> {
  return requestJson(restaurantUrl(placeId), paths.restaurant(placeId), publicRestaurantDetailSchema, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
    tags: [CATALOG_CACHE_TAG],
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

export interface ListIdentity {
  clientId: string;
}

function listHeaders(identity: ListIdentity): Record<string, string> {
  return { "X-Fiyu-Client-Id": identity.clientId };
}

export function fetchDefaultList(
  cityId: string,
  identity: ListIdentity,
  options: RequestOptions = {},
): Promise<DefaultListResponse> {
  return requestJson(defaultListUrl(cityId), paths.defaultList, defaultListResponseSchema, {
    ...options,
    headers: { ...listHeaders(identity), ...(options.headers ?? {}) },
  });
}

export function addRestaurantToDefaultList(
  cityId: string,
  placeId: string,
  identity: ListIdentity,
  options: RequestOptions = {},
): Promise<DefaultListMutationResponse> {
  return requestJson(defaultListItemsUrl(), paths.defaultListItems, defaultListMutationResponseSchema, {
    ...options,
    method: "POST",
    body: { city_id: cityId, place_id: placeId },
    headers: { ...listHeaders(identity), ...(options.headers ?? {}) },
  });
}

export function removeRestaurantFromDefaultList(
  cityId: string,
  placeId: string,
  identity: ListIdentity,
  options: RequestOptions = {},
): Promise<DefaultListMutationResponse> {
  return requestJson(defaultListItemsUrl(), paths.defaultListItems, defaultListMutationResponseSchema, {
    ...options,
    method: "DELETE",
    body: { city_id: cityId, place_id: placeId },
    headers: { ...listHeaders(identity), ...(options.headers ?? {}) },
  });
}

export function fetchDefaultListMembership(
  cityId: string,
  placeId: string,
  identity: ListIdentity,
  options: RequestOptions = {},
): Promise<DefaultListMembershipResponse> {
  return requestJson(
    defaultListMembershipUrl(cityId, placeId),
    paths.defaultListMembership,
    defaultListMembershipResponseSchema,
    {
      ...options,
      headers: { ...listHeaders(identity), ...(options.headers ?? {}) },
    },
  );
}

export function fetchDefaultListSmartViews(
  cityId: string,
  identity: ListIdentity,
  options: RequestOptions = {},
): Promise<SmartViewCatalogResponse> {
  return requestJson(
    defaultListSmartViewsUrl(cityId),
    paths.defaultListSmartViews,
    smartViewCatalogResponseSchema,
    {
      ...options,
      headers: { ...listHeaders(identity), ...(options.headers ?? {}) },
    },
  );
}

export function fetchDefaultListSmartView(
  cityId: string,
  viewKey: string,
  identity: ListIdentity,
  options: RequestOptions & { originLatitude?: number; originLongitude?: number } = {},
): Promise<SmartViewResponse> {
  return requestJson(
    defaultListSmartViewUrl(cityId, viewKey, {
      originLatitude: options.originLatitude,
      originLongitude: options.originLongitude,
    }),
    `${paths.defaultListSmartViews}/${viewKey}`,
    smartViewResponseSchema,
    {
      ...options,
      headers: { ...listHeaders(identity), ...(options.headers ?? {}) },
    },
  );
}
