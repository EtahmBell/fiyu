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
 *    unrecognised value must not fail the parse. Score bands are narrowed in
 *    lib/format/score.ts. `location_precision` is narrowed NOWHERE -- see the
 *    note on the coordinate block below.
 *  - Every field the backend sends is declared here. Zod strips unknown keys
 *    silently, so an omission is invisible at runtime; the key-parity test in
 *    schemas.test.ts is what keeps this schema honest.
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

/** Address component maps, e.g. { ward: "杉並区", chome: "3" }. */
const stringRecord = z
  .record(z.string(), z.string())
  .nullish()
  .transform((value) => value ?? {});

/**
 * Loosely-typed object arrays, e.g. discovery_areas. The backend controls the
 * item shape and has changed it before; validating the keys here would fail the
 * parse on a shape this layer does not actually read.
 */
const objectArray = z
  .array(z.record(z.string(), z.unknown()))
  .nullish()
  .transform((value) => value ?? []);

/**
 * OpenStreetMap provenance for a verified coordinate, built at
 * public_catalog.py:889-898. `attribution` carries the ODbL credit and must be
 * displayed wherever the coordinate is.
 *
 * Declared as a loose object: the six keys are named so backend drift stays
 * visible, but an added key must not fail the parse.
 */
const locationProvenanceSchema = z
  .looseObject({
    attribution: nullableString,
    osm_type: nullableString,
    osm_id: nullableNumber,
    osm_version: nullableNumber,
    osm_timestamp: nullableString,
    representative_point_method: nullableString,
  })
  .nullish()
  .transform((value) => value ?? null);

/** GET /public/restaurants item, and GET /public/restaurants/{place_id}. */
export const publicRestaurantSchema = z.object({
  place_id: z.string().min(1),
  name_ja: nullableString,
  name_en: nullableString,
  category: nullableString,
  /** Public editorial description. Replaced the internal why_fiyu field. */
  description_en: nullableString,

  /*
   * Coordinates are gated by the backend: public_catalog.py:903-911 nulls them
   * whenever map_display_eligible is false, so an ineligible restaurant can
   * never carry a position. That nulling is the contract isMappable() relies
   * on -- eligibility, not the precision string, decides what may be plotted.
   *
   * location_precision is INFORMATIONAL ONLY and must never gate rendering.
   * Its vocabulary is owned by the backend and spans at least nine values
   * across three modules (address_geocoding.py, address_research.py), served
   * as COALESCE(map_location_precision, location_precision). Live values today
   * include "exact", "parcel_or_street_number" and "chome". A frontend
   * allow-list over this field silently hid 3 of 5 pins once already.
   *
   * The three booleans below are derived by the backend at
   * public_catalog.py:866-882 and are the fields to gate on instead:
   *  - map_location_approximate: the coordinate is an area anchor, not a door.
   *  - distance_sort_eligible: safe to measure and rank by distance.
   *  - directions_coordinates_eligible: safe to hand to a maps app as a point.
   * The last two are both `eligible && !map_location_approximate`, but read
   * them separately -- they answer different questions and may diverge.
   */
  latitude: nullableNumber,
  longitude: nullableNumber,
  location_precision: nullableString,
  map_display_eligible: boolWithDefault(false),
  map_location_approximate: boolWithDefault(false),
  distance_sort_eligible: boolWithDefault(false),
  directions_coordinates_eligible: boolWithDefault(false),

  /*
   * Location disclosure. `location_label` carries the backend's own wording
   * ("Approximate area") and is rendered verbatim, never paraphrased -- the
   * same rule as LocationAnchor.qualifier below.
   */
  location_status: nullableString,
  location_label: nullableString,
  map_anchor_type: nullableString,
  map_anchor_id: nullableString,
  /** The verified written address, for directions when coordinates are coarse. */
  external_map_search_query: nullableString,

  verified_core_address: nullableString,
  core_address_verified: boolWithDefault(false),
  full_address_verified: boolWithDefault(false),

  /* Which address components the geocoder matched, and which it could not. */
  matched_components: stringRecord,
  unmatched_components: stringRecord,
  provenance: locationProvenanceSchema,
  source_reference: nullableString,

  /* Editorial sourcing. `discovery_area_conflict` flags contradictory sources. */
  discovery_area: nullableString,
  discovery_area_type: nullableString,
  discovery_areas: objectArray,
  multiple_discovery_areas: boolWithDefault(false),
  discovery_area_conflict: boolWithDefault(false),

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
