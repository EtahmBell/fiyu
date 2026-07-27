import type { PublicRestaurant } from "@/lib/api/schemas";
import { parseScoreBand } from "@/lib/format/score";

/**
 * Editorial labels, derived strictly from real backend fields.
 *
 * These replace anything that would look like social proof. A label here is a
 * restatement of Fiyu's own editorial score band -- never a claim about how
 * many people liked, saved or visited a place.
 *
 * NOT IMPLEMENTED, because no backing field exists in the public payload:
 *
 *   "Independent Restaurant"  needs an independence flag. The scoring pipeline
 *                             computes `likely_chain` internally but does not
 *                             expose it.
 *   "Newly Added"             needs a published-at or created-at timestamp.
 *
 * Both are deliberately absent rather than approximated. Inferring "newly
 * added" from position in the list, or independence from the category string,
 * would be fabrication.
 */

export type EditorialLabel = "Fiyu Pick" | "Strong Hidden-Gem Match" | "Under-the-Radar";

/**
 * One label per band, so the label is a faithful rename rather than a
 * judgement layered on top.
 *
 *   exceptional (>=85)  -> Fiyu Pick
 *   strong      (>=75)  -> Strong Hidden-Gem Match
 *   promising   (>=65)  -> Under-the-Radar
 *   borderline  (>=55)  -> no label
 *   not_recommended     -> no label (also filtered from browsable lists)
 */
const BAND_LABELS: Record<string, EditorialLabel | null> = {
  exceptional: "Fiyu Pick",
  strong: "Strong Hidden-Gem Match",
  promising: "Under-the-Radar",
  borderline: null,
  not_recommended: null,
};

/** The editorial label for a restaurant, or null when none applies. */
export function editorialLabel(restaurant: PublicRestaurant): EditorialLabel | null {
  const band = parseScoreBand(restaurant.score_band);
  return band ? (BAND_LABELS[band] ?? null) : null;
}

/**
 * Whether real community statistics may be shown.
 *
 * The backend owns this decision through `community_stats_visible`. Every
 * restaurant currently reports false with zero counts, so nothing renders.
 * A count must never be displayed when this is false, and a zero count must
 * never be dressed up as activity.
 */
export function hasVisibleCommunityStats(restaurant: PublicRestaurant): boolean {
  return restaurant.community_stats_visible && restaurant.community_recommendation_count > 0;
}

/**
 * Neutral copy for a restaurant with no community record yet.
 *
 * Used only where a community section is genuinely wanted; the card omits the
 * section entirely rather than repeating this on every row.
 */
export const NO_COMMUNITY_ACTIVITY_COPY = "New to the Fiyu community";
