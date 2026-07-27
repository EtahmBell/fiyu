import { z } from "zod";

/**
 * Runtime validation for the public Fiyu endpoints.
 *
 * Mirrors the Pydantic models in fiyu-backend/src/fiyu/api.py. Hand-written
 * rather than generated, because the backend's OpenAPI document omits the
 * 404/502/503/504 responses its route handlers actually emit.
 *
 * Design rules:
 *  - Every scalar the backend types as `X | None` is normalised to `X | null`,
 *    so components never distinguish null from undefined.
 *  - Numeric fields carry NO range assertions. A future out-of-range value
 *    should degrade in a formatter rather than blank an entire page.
 *  - Band and precision fields are validated as plain strings, not enums: an
 *    unrecognised value must not fail the parse. Narrowing happens in
 *    lib/format/score.ts and lib/geo.
 *  - No field is translated, rewritten or normalised. Localization is owned by
 *    the backend; this layer only validates shape.
 */

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const nullableNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const stringArray = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? []);

const boolWithDefault = (fallback: boolean) =>
  z
    .boolean()
    .nullish()
    .transform((value) => value ?? fallback);

const intWithDefault = (fallback: number) =>
  z
    .number()
    .nullish()
    .transform((value) => value ?? fallback);

/** GET /public/restaurants item, and GET /public/restaurants/{place_id}. */
export const publicRestaurantSchema = z.object({
  place_id: z.string().min(1),
  name_ja: nullableString,
  name_en: nullableString,
  category: nullableString,
  /** Public editorial description. Replaced the internal why_fiyu field. */
  description_en: nullableString,

  /*
   * Coordinates are gated by the backend: public_catalog.py nulls them
   * whenever map_display_eligible is false, so an ineligible restaurant can
   * never carry a position. Treat all three as one unit -- see isMappable().
   */
  latitude: nullableNumber,
  longitude: nullableNumber,
  location_precision: nullableString,
  map_display_eligible: boolWithDefault(false),

  neighborhood: nullableString,
  fiyu_score: nullableNumber,
  score_band: nullableString,
  /** Provenance of the score, e.g. "editorial_research". */
  score_type: nullableString,

  food_tags: stringArray,
  signature_dishes: stringArray,

  /*
   * Real community records. All zero today. Never render these as engagement
   * numbers unless community_stats_visible is true -- the backend owns that
   * decision, and inventing activity is out of bounds.
   */
  community_recommendation_count: intWithDefault(0),
  community_positive_count: intWithDefault(0),
  community_recommendation_rate: nullableNumber,
  community_stats_visible: boolWithDefault(false),
});

export const publicRestaurantListSchema = z.array(publicRestaurantSchema);

/** One author credit on a Google photo. Attribution must always be displayed. */
export const photoAttributionSchema = z.object({
  display_name: nullableString,
  uri: nullableString,
  photo_uri: nullableString,
  flag_content_uri: nullableString,
});

/**
 * GET /public/restaurants/{place_id}/photo-preview and .../photos.
 *
 * `media_url` is proxied by the backend; the browser never calls Google Places.
 */
export const googlePhotoSchema = z.object({
  media_url: z.string().min(1),
  width: z.number(),
  height: z.number(),
  author_attributions: z.array(photoAttributionSchema).nullish().transform((v) => v ?? []),
  google_maps_uri: nullableString,
  flag_content_uri: nullableString,
});

export const googlePhotoListSchema = z.array(googlePhotoSchema);

/**
 * GET /public/location-anchors.
 *
 * Approximate area centres, not user positions. `qualifier` carries the
 * backend's own wording ("Approximate center of Shibuya") and must be shown
 * alongside the name so an anchor is never mistaken for a precise location.
 */
export const locationAnchorSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  area_name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  precision: z.string(),
  qualifier: z.string(),
});

export const locationAnchorListSchema = z.array(locationAnchorSchema);

export type PublicRestaurant = z.infer<typeof publicRestaurantSchema>;
export type PublicRestaurantList = z.infer<typeof publicRestaurantListSchema>;
export type GooglePhoto = z.infer<typeof googlePhotoSchema>;
export type PhotoAttribution = z.infer<typeof photoAttributionSchema>;
export type LocationAnchor = z.infer<typeof locationAnchorSchema>;

/** Compact, log-safe description of why a payload failed validation. */
export function describeZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

export interface RejectedRestaurant {
  index: number;
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
 * Using the list schema directly would reject the whole catalog if a single row
 * were malformed, turning one bad record into a blank page. This keeps every
 * valid row and reports the rest.
 *
 * Returns null if the payload is not an array, which is unrecoverable.
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
