import type { z } from "zod";

import {
  FiyuApiError,
  extractDetail,
  kindForNetworkFailure,
  kindForStatus,
} from "@/lib/api/errors";
import {
  LIST_LIMIT_DEFAULT,
  type LiveDetailsLanguage,
  liveDetailsUrl,
  paths,
  restaurantUrl,
  restaurantsUrl,
} from "@/lib/api/endpoints";
import {
  type GoogleLiveDetails,
  type ParsedRestaurantList,
  type PublicRestaurant,
  describeZodIssues,
  googleLiveDetailsSchema,
  parseRestaurantList,
  publicRestaurantSchema,
} from "@/lib/api/schemas";

/**
 * The only module in the app that performs network I/O against the backend.
 *
 * It runs unchanged in Server Components and in the browser, because
 * NEXT_PUBLIC_FIYU_API_URL is available in both. `next.revalidate` is honoured
 * server-side and ignored by the browser's fetch.
 *
 * Every response is validated with Zod before it reaches a component, and every
 * failure is normalised into a FiyuApiError so the UI can branch on `kind`
 * rather than on status codes.
 */

export interface RequestOptions {
  signal?: AbortSignal;
  /** Server-side cache lifetime in seconds. Ignored in the browser. */
  revalidate?: number | false;
}

/** Default catalog cache window. The catalog changes only on manual publish. */
export const CATALOG_REVALIDATE_SECONDS = 300;

/**
 * Fetch and decode a response body, mapping every transport and HTTP failure
 * onto FiyuApiError. Schema validation is left to the caller so that the
 * catalog can validate row by row.
 */
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
    // An abort is a caller-initiated cancellation, not a failure. Let it pass
    // through so callers can ignore it (e.g. a detail sheet closing mid-flight).
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    // The raw undici rejection is not attached as `cause`: its nested
    // TypeError -> ECONNREFUSED chain crashes the Next 16 dev error overlay
    // ("frame.join is not a function"), which would turn an expected
    // backend-down state into a 500 during local development. The message is
    // preserved as `detail`, which is all the UI needs.
    throw new FiyuApiError({
      kind: kindForNetworkFailure(),
      endpoint,
      detail: cause instanceof Error ? cause.message : undefined,
    });
  }

  if (!response.ok) {
    // The error body is best-effort: a crashed backend may return HTML.
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
 * Sorted by fiyu_score DESC by the backend.
 *
 * Rows are validated individually: a malformed record is dropped and reported
 * in `rejected` rather than failing the whole catalog. Callers should surface a
 * non-empty `rejected` list to the user instead of silently showing fewer
 * restaurants than the backend published.
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
 * A single published restaurant.
 *
 * Note: the backend's PublicRestaurantDetail is `pass` over
 * PublicRestaurantSummary, so this returns exactly the same fields as a list
 * item. Prefer reusing already-fetched list data where possible.
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
 * Fresh Google Places data for one restaurant.
 *
 * Each call costs one billed, uncached Google Places request on the backend
 * (10s upstream timeout, no server-side caching). Call this ONLY when a user
 * opens a restaurant -- never while rendering a list.
 */
export function fetchLiveDetails(
  placeId: string,
  language: LiveDetailsLanguage = "en",
  options: RequestOptions = {},
): Promise<GoogleLiveDetails> {
  return requestJson(
    liveDetailsUrl(placeId, language),
    paths.liveDetails(placeId),
    googleLiveDetailsSchema,
    // revalidate: 0 disables caching. Live details are point-in-time (open_now
    // flips during the day) and must never be served from a stale cache.
    { revalidate: 0, ...options },
  );
}
