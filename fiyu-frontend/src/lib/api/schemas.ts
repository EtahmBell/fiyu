import { z } from "zod";

/**
 * Runtime validation for the three public Fiyu endpoints.
 *
 * These schemas mirror the Pydantic models in fiyu-backend/src/fiyu/api.py
 * (PublicRestaurantSummary, PublicRestaurantDetail, GoogleLiveDetails) as of
 * backend version 0.1.0. They are hand-written rather than generated, because
 * the backend's OpenAPI document omits the 404/502/503/504 responses that the
 * route handlers actually emit.
 *
 * Design rules:
 *  - Every scalar the backend types as `X | None` is normalised to `X | null`,
 *    so components never have to distinguish null from undefined.
 *  - `food_tags` and `signature_dishes` are `list[str]` with a default_factory
 *    on the backend and are never null, but we still default them defensively.
 *  - Numeric fields carry NO range assertions. The backend clamps scores to
 *    0-100, but a future out-of-range value should degrade in the formatter
 *    rather than blow up an entire page of results.
 *  - Band fields are validated as plain strings, not enums. An unrecognised
 *    band must not fail the parse; see parseScoreBand/parseConfidenceBand in
 *    lib/format/score.ts, which narrow known values and return null otherwise.
 */

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const nullableNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const nullableBoolean = z
  .boolean()
  .nullish()
  .transform((value) => value ?? null);

const stringArray = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? []);

/** GET /public/restaurants item, and GET /public/restaurants/{place_id}. */
export const publicRestaurantSchema = z.object({
  place_id: z.string().min(1),
  name_ja: nullableString,
  name_en: nullableString,
  primary_category: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
  neighborhood: nullableString,
  fiyu_score: nullableNumber,
  fiyu_confidence: nullableNumber,
  confidence_band: nullableString,
  score_band: nullableString,
  why_fiyu: nullableString,
  food_tags: stringArray,
  signature_dishes: stringArray,
  local_language_web_signal: nullableNumber,
});

export const publicRestaurantListSchema = z.array(publicRestaurantSchema);

/**
 * GET /public/restaurants/{place_id}/live-details.
 *
 * Caution: the backend normaliser (google_places.py:101-113) coerces missing
 * Google values to "" / 0.0 / 0 rather than null. So `rating: 0` and
 * `rating_count: 0` mean "Google did not return a value", NOT "zero reviews".
 * Use isRatingKnown() from lib/format/google.ts instead of truthiness checks.
 */
export const googleLiveDetailsSchema = z.object({
  place_id: z.string().min(1),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  rating: z.number(),
  rating_count: z.number(),
  price_level: nullableString,
  open_now: nullableBoolean,
  weekday_hours: stringArray,
  google_maps_uri: nullableString,
  primary_type: nullableString,
});

export type PublicRestaurant = z.infer<typeof publicRestaurantSchema>;
export type PublicRestaurantList = z.infer<typeof publicRestaurantListSchema>;
export type GoogleLiveDetails = z.infer<typeof googleLiveDetailsSchema>;

/** Compact, log-safe description of why a payload failed validation. */
export function describeZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

export interface RejectedRestaurant {
  /** Position in the original response, for logging. */
  index: number;
  /** place_id if it was at least a readable string, else null. */
  placeId: string | null;
  issues: string;
}

export interface ParsedRestaurantList {
  restaurants: PublicRestaurant[];
  rejected: RejectedRestaurant[];
}

/**
 * Validate a catalog response row by row.
 *
 * Using publicRestaurantListSchema directly would reject the entire catalog if
 * a single row were malformed, turning one bad record into a blank page. This
 * keeps every valid row and reports the rest, so the UI can render what it has
 * and disclose what it dropped.
 *
 * Returns null if the payload is not an array at all, which is unrecoverable
 * and must surface as an invalid-response error.
 */
export function parseRestaurantList(payload: unknown): ParsedRestaurantList | null {
  if (!Array.isArray(payload)) return null;

  const restaurants: PublicRestaurant[] = [];
  const rejected: RejectedRestaurant[] = [];

  payload.forEach((row, index) => {
    const parsed = publicRestaurantSchema.safeParse(row);
    if (parsed.success) {
      restaurants.push(parsed.data);
      return;
    }
    const rawId = (row as { place_id?: unknown } | null)?.place_id;
    rejected.push({
      index,
      placeId: typeof rawId === "string" && rawId.length > 0 ? rawId : null,
      issues: describeZodIssues(parsed.error),
    });
  });

  return { restaurants, rejected };
}
