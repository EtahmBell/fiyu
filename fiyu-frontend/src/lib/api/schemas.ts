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

const reviewThemeSchema = z.object({
  theme: z.string(),
  sentiment: nullableString.optional(),
  supporting_source_count: nullableNumber.optional(),
  confidence: nullableNumber.optional(),
});

const practicalInfoSchema = z.object({
  reservation: z.object({
    status: nullableString,
    confidence: nullableNumber.optional(),
  }).optional(),
  seating: z.object({
    counter: z.boolean().nullable().optional(),
    tables: z.boolean().nullable().optional(),
    private_rooms: z.boolean().nullable().optional(),
    small_capacity: z.boolean().nullable().optional(),
  }).optional(),
  visit_style: z.object({
    solo_friendly: z.boolean().nullable().optional(),
    group_friendly: z.boolean().nullable().optional(),
    date_friendly: z.boolean().nullable().optional(),
  }).optional(),
  service_periods: z.object({
    lunch: z.boolean().nullable().optional(),
    dinner: z.boolean().nullable().optional(),
    late_night: z.boolean().nullable().optional(),
  }).optional(),
  payment: z.object({
    cash_only: z.boolean().nullable().optional(),
    cards: z.boolean().nullable().optional(),
    electronic_payment: z.boolean().nullable().optional(),
  }).optional(),
  other: z.array(z.string()).optional(),
  confidence: nullableNumber.optional(),
});

const hoursPeriodSchema = z.object({
  open: nullableString,
  close: nullableString,
  label: nullableString.optional(),
  last_order: nullableString.optional(),
});

const dayHoursSchema = z.object({
  status: nullableString,
  periods: z.array(hoursPeriodSchema).optional(),
});

const openingHoursSchema = z.object({
  monday: dayHoursSchema.optional(),
  tuesday: dayHoursSchema.optional(),
  wednesday: dayHoursSchema.optional(),
  thursday: dayHoursSchema.optional(),
  friday: dayHoursSchema.optional(),
  saturday: dayHoursSchema.optional(),
  sunday: dayHoursSchema.optional(),
  reservation_only: z.boolean().nullable().optional(),
  schedule_note: nullableString.optional(),
  confidence: nullableNumber.optional(),
  checked_at: nullableString.optional(),
});

/** GET /public/restaurants item, and GET /public/restaurants/{place_id}. */
export const publicRestaurantSchema = z.object({
  place_id: z.string().min(1),
  name_ja: nullableString,
  name_en: nullableString,
  category: nullableString,
  /** Public editorial description. Replaced the internal why_fiyu field. */
  description_en: nullableString,
  /** Canonical compact public copy produced by the card-enrichment pipeline. */
  card_description: nullableString.optional(),
  /** Sanitized, public card-enrichment fields. Evidence provenance stays server-side. */
  review_themes: z.array(reviewThemeSchema).optional(),
  practical_info: practicalInfoSchema.optional(),
  reservation_status: z.string().optional(),
  reservation_confidence: nullableNumber.optional(),
  booking_methods: z.array(z.string()).optional(),
  phone_number: nullableString.optional(),
  booking_url: nullableString.optional(),
  contact_note: nullableString.optional(),
  budget: z.object({
    currency: z.string().length(3),
    minimum: nullableNumber,
    maximum: nullableNumber,
    band: z.enum(["budget", "moderate", "upscale", "splurge"]),
    source_type: z.enum(["candidate_price_import", "researched_source"]),
    confidence: z.number().min(0).max(1),
    checked_at: nullableString.optional(),
  }).nullable().optional(),
  opening_hours: openingHoursSchema.optional(),
  hours_display: nullableString.optional(),
  hours_confidence: nullableNumber.optional(),
  hours_checked_at: nullableString.optional(),

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

/** Account-private presentation state returned only by Map endpoints. */
export const mapRestaurantSchema = publicRestaurantSchema.extend({
  is_visited: z.boolean(),
});
export const mapRestaurantListSchema = z.array(mapRestaurantSchema);

/**
 * GET /public/restaurants/{place_id}.
 *
 * Detail-only editorial fields come from the latest accepted grounded
 * description-research run. They deliberately do not appear in the catalog
 * response, and every section that consumes them must tolerate their absence.
 */
export const publicRestaurantDetailSchema = publicRestaurantSchema.extend({
  restaurant_type_en: nullableString,
  cuisine_terms_en: stringArray,
  signature_dishes_en: stringArray,
  supporting_source_urls: stringArray,
  researched_at: nullableString,
});

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

export const discoveryLocationSchema = z.object({
  configured: z.boolean(),
  location_mode: z.enum(["current", "preview", "manual"]).nullable(),
  discovery_latitude: nullableNumber,
  discovery_longitude: nullableNumber,
  discovery_label: nullableString,
  arrival_date: nullableString,
  last_location_check_at: nullableString,
  updated_at: nullableString,
  can_change_location_freely: z.boolean(),
});

export const currentLocationCheckSchema = z.object({
  inside_service_area: z.boolean(),
  location: discoveryLocationSchema,
});

const savedRestaurantSummarySchema = z.object({
  place_id: z.string().min(1),
  name_ja: nullableString,
  name_en: nullableString,
  primary_category: nullableString,
  neighborhood: nullableString,
  fiyu_score: nullableNumber,
  score_band: nullableString,
});

export const defaultListItemSchema = z.object({
  place_id: z.string().min(1),
  added_at: z.string().min(1),
  restaurant: savedRestaurantSummarySchema,
});

export const defaultListResponseSchema = z.object({
  list_id: z.number(),
  city_id: z.string().min(1),
  name: z.string().min(1),
  list_kind: z.string().min(1),
  item_count: z.number(),
  items: z.array(defaultListItemSchema),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const defaultListMutationResponseSchema = z.object({
  list: defaultListResponseSchema,
  changed: z.boolean(),
});

export const defaultListMembershipResponseSchema = z.object({
  list_id: z.number(),
  city_id: z.string().min(1),
  place_id: z.string().min(1),
  is_saved: z.boolean(),
});

export const dailyPickAssignmentResponseSchema = z.object({
  round_id: z.string().min(1),
  city_id: z.string().min(1),
  place_ids: z.array(z.string().min(1)).max(3),
  assigned_at: z.string().min(1),
  // Optional only for rolling compatibility with a backend that predates the
  // server-owned snapshot response. Current servers always return both.
  expires_at: z.string().min(1).optional(),
  discovery_mode: z.enum(["current", "preview", "manual"]).nullable().optional(),
  discovery_label: z.string().nullable().optional(),
  restaurants: z.array(publicRestaurantSchema).max(3).optional(),
});

export const activeDailyPickAssignmentResponseSchema = dailyPickAssignmentResponseSchema.nullable();

export const recentDailyPickRoundSchema = z.object({
  round_id: z.string().min(1),
  city_id: z.string().min(1),
  place_ids: z.array(z.string().min(1)).max(3),
  assigned_at: z.string().min(1),
  retention_expires_at: z.string().min(1),
  restaurants: z.array(publicRestaurantSchema).max(3),
});

export const recentDailyPickRoundListSchema = z.array(recentDailyPickRoundSchema);

export const visitReactionSchema = z.enum(["love_it", "like_it", "not_for_me"]);

export const restaurantVisitSchema = z.object({
  id: z.string().min(1),
  place_id: z.string().min(1),
  visited_at: z.string().min(1),
  reaction: visitReactionSchema.nullable(),
  private_note: nullableString,
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  restaurant: savedRestaurantSummarySchema,
});

export const restaurantVisitListSchema = z.array(restaurantVisitSchema);

export const seenRestaurantsResponseSchema = z.object({
  place_ids: z.array(z.string()),
});

export type SeenRestaurantsResponse = z.infer<typeof seenRestaurantsResponseSchema>;

export const notificationTypeSchema = z.enum([
  "picks_ready",
  "smart_list_ready",
  "new_drop",
  "early_access_unlocked",
  "trip_reminder",
]);

export const userNotificationSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  target_url: nullableString,
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().min(1),
  read_at: nullableString,
});

export const userNotificationListSchema = z.array(userNotificationSchema);
export const markAllNotificationsReadResponseSchema = z.object({ updated: z.number().int().nonnegative() });

export type UserNotification = z.infer<typeof userNotificationSchema>;

export const deleteRestaurantVisitResponseSchema = z.object({
  deleted: z.boolean(),
});

export const smartViewCatalogEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1),
  tier: z.enum(["free", "premium"]).nullish().transform((value) => value ?? "free"),
  locked: z.boolean().nullish().transform((value) => value ?? false),
  available: z.boolean().nullish().transform((value) => (value === undefined ? null : value)),
  item_count: nullableNumber,
  required_capability: nullableString,
  unavailable_reason: nullableString,
  collection_type: nullableString,
}).transform((value) => ({
  ...value,
  label: value.title ?? value.label ?? "Smart view",
}));

export const smartViewCatalogResponseSchema = z.object({
  city_id: z.string().min(1),
  views: z.array(smartViewCatalogEntrySchema),
  generated_at: z.string().min(1),
});

export const smartViewItemSchema = z.object({
  place_id: z.string().min(1),
  added_at: z.string().min(1),
  is_visited: z.boolean(),
  distance_km: nullableNumber,
  restaurant: savedRestaurantSummarySchema,
});

export const smartViewGroupSchema = z.object({
  group_key: z.string().min(1),
  title: z.string().min(1),
  item_count: z.number(),
  items: z.array(smartViewItemSchema),
});

export const smartViewResponseSchema = z.object({
  city_id: z.string().min(1),
  view_key: z.string().min(1),
  label: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1),
  tier: z.enum(["free", "premium"]).nullish().transform((value) => value ?? "free"),
  locked: z.boolean().nullish().transform((value) => value ?? false),
  available: z.boolean().nullish().transform((value) => (value === undefined ? null : value)),
  item_count: nullableNumber,
  required_capability: nullableString,
  unavailable_reason: nullableString,
  collection_type: nullableString,
  items: z.array(smartViewItemSchema),
  groups: z.array(smartViewGroupSchema),
  generated_at: z.string().min(1),
}).transform((value) => ({
  ...value,
  label: value.title ?? value.label ?? "Smart view",
}));

export type PublicRestaurant = z.infer<typeof publicRestaurantSchema>;
export type MapRestaurant = z.infer<typeof mapRestaurantSchema>;
export type PublicRestaurantDetail = z.infer<typeof publicRestaurantDetailSchema>;
export type PublicRestaurantList = z.infer<typeof publicRestaurantListSchema>;
export type GooglePhoto = z.infer<typeof googlePhotoSchema>;
export type PhotoAttribution = z.infer<typeof photoAttributionSchema>;
export type LocationAnchor = z.infer<typeof locationAnchorSchema>;
export type DiscoveryLocation = z.infer<typeof discoveryLocationSchema>;
export type CurrentLocationCheck = z.infer<typeof currentLocationCheckSchema>;
export type SavedRestaurantSummary = z.infer<typeof savedRestaurantSummarySchema>;
export type DefaultListItem = z.infer<typeof defaultListItemSchema>;
export type DefaultListResponse = z.infer<typeof defaultListResponseSchema>;
export type DefaultListMutationResponse = z.infer<typeof defaultListMutationResponseSchema>;
export type DefaultListMembershipResponse = z.infer<typeof defaultListMembershipResponseSchema>;
export type DailyPickAssignmentResponse = z.infer<typeof dailyPickAssignmentResponseSchema>;
export type RecentDailyPickRound = z.infer<typeof recentDailyPickRoundSchema>;
export type RestaurantVisit = z.infer<typeof restaurantVisitSchema>;
export type VisitReaction = z.infer<typeof visitReactionSchema>;
export type DeleteRestaurantVisitResponse = z.infer<typeof deleteRestaurantVisitResponseSchema>;
export type SmartViewCatalogEntry = z.infer<typeof smartViewCatalogEntrySchema>;
export type SmartViewCatalogResponse = z.infer<typeof smartViewCatalogResponseSchema>;
export type SmartViewItem = z.infer<typeof smartViewItemSchema>;
export type SmartViewGroup = z.infer<typeof smartViewGroupSchema>;
export type SmartViewResponse = z.infer<typeof smartViewResponseSchema>;

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
