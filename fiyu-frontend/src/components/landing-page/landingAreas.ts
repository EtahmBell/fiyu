import { STATION_TIERS } from "@/lib/map/landmarks";

/**
 * The Tokyo areas named on the public page, derived rather than typed out.
 *
 * The source is `STATION_TIERS`, which is the product's own hand-authored list
 * of the areas it labels in English on the discovery map -- the only place in
 * this codebase where a human-facing Tokyo area name is a considered editorial
 * decision rather than a geocoder field. The live `/public/location-anchors`
 * response is still empty, and the catalog's own `neighborhood` values are
 * chome-level strings that have no business on a marketing page, so neither is a
 * usable source for this.
 *
 * Every one of these sits inside the backend's Tokyo discovery boundary
 * (`TOKYO_SERVICE_AREA` in discovery_location.py: 35.50-35.85N, 139.45-139.95E),
 * checked against the generated OSM station coordinates. That is why the list can
 * be presented as coverage without qualification, and why it is derived here
 * instead of curated: adding a station tier adds an area, and a tier that ever
 * falls outside the service boundary would have to be handled rather than
 * silently shown.
 *
 * Order is `STATION_TIERS` order, which runs most recognisable first, so the
 * grid opens on the names a visitor will know.
 */
export const TOKYO_AREAS: readonly string[] = STATION_TIERS.map((tier) => tier.label);
