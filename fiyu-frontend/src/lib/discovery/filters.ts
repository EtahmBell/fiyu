import type { PublicRestaurant } from "@/lib/api/schemas";
import { parseScoreBand } from "@/lib/format/score";

/**
 * Catalog-level filtering, applied before ranking.
 */

/**
 * Score bands withheld from the discovery lists.
 *
 * `not_recommended` covers restaurants the backend capped at 54.99 via the
 * chain and low-evidence rules in public_score.py. They are still published, so
 * they remain reachable by direct link and by the detail route -- this only
 * keeps them out of the browsable lists.
 *
 * TEMPORARY: requested as a "for now" measure. Removing this filter is a
 * one-line change, and no other code assumes the exclusion.
 */
const WITHHELD_SCORE_BANDS = new Set(["not_recommended"]);

/**
 * A restaurant whose score_band is unrecognised is kept, not dropped. A future
 * backend band must not silently disappear from the catalog.
 */
export function isBrowsable(restaurant: PublicRestaurant): boolean {
  const band = parseScoreBand(restaurant.score_band);
  return band === null || !WITHHELD_SCORE_BANDS.has(band);
}

export interface BrowsableCatalog {
  restaurants: PublicRestaurant[];
  /** How many were withheld, for logging and future disclosure. */
  withheld: number;
}

export function selectBrowsable(restaurants: readonly PublicRestaurant[]): BrowsableCatalog {
  const kept = restaurants.filter(isBrowsable);
  return { restaurants: kept, withheld: restaurants.length - kept.length };
}
