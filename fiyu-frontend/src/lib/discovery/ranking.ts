import type { PublicRestaurant } from "@/lib/api/schemas";
import { normalizeSignal } from "@/lib/format/score";

/**
 * Discovery ranking.
 *
 * ALL ordering logic lives behind this adapter. Components receive an already
 * ranked array and never sort, so the rules can change without touching
 * presentation.
 *
 * Two modes today:
 *
 *   Local     Ranked by fiyu_score -- Fiyu's own editorial score. The curated
 *             house list.
 *   Trending  No data source exists, so the mode is marked unavailable and the
 *             UI shows an empty state. Deliberately NOT approximated from
 *             fiyu_score or any other field.
 *
 * What this is NOT: a popularity ranking. The catalog exposes community_*
 * counters but every one is zero and community_stats_visible is false, so
 * `popularity()` returns null and popularityAvailable is false.
 *
 * Note: the previous "hiddenness" pole was backed by local_language_web_signal,
 * which the backend removed from the public payload. There is no longer a
 * second axis, so ranking is a single ordered signal rather than a blend.
 *
 * IF A DISTANCE MODE IS EVER ADDED, it must rank only restaurants whose
 * `distance_sort_eligible` is true. The backend derives that as
 * `map_display_eligible && !map_location_approximate` (public_catalog.py:872-874),
 * because three of today's five mapped restaurants are chome anchors -- nominal
 * to roughly 100-400 m. Ordering "nearest first" on a block centroid would
 * present a guess as a ranking. Measure with restaurantDistance
 * (lib/location/anchor.ts), which already carries that gate; a structural guard
 * in src/test/removals.test.ts keeps haversineMeters out of everywhere else.
 */

export type DiscoveryMode = "local" | "trending";

export interface DiscoveryModeDefinition {
  id: DiscoveryMode;
  label: string;
  description: string;
  /** False when no data source is wired up for this mode yet. */
  available: boolean;
}

export const DISCOVERY_MODES: readonly DiscoveryModeDefinition[] = [
  {
    id: "local",
    label: "Local",
    description: "Fiyu's curated list, highest score first.",
    available: true,
  },
  {
    id: "trending",
    label: "Trending",
    description: "Not connected yet.",
    available: false,
  },
];

/** Local is the default: Trending has no data and would render empty. */
export const DEFAULT_MODE: DiscoveryMode = "local";

export function getMode(mode: DiscoveryMode): DiscoveryModeDefinition {
  const found = DISCOVERY_MODES.find((definition) => definition.id === mode);
  if (!found) throw new Error(`Unknown discovery mode: ${mode}`);
  return found;
}

export function isModeAvailable(mode: DiscoveryMode): boolean {
  return getMode(mode).available;
}

export interface DiscoveryRankingAdapter {
  readonly id: string;
  /**
   * False while no real community or popularity data exists. Consumers must
   * check this before showing any popularity-labelled control.
   */
  readonly popularityAvailable: boolean;
  /** Fiyu's own score, 0-1. Null when the score is missing. */
  pickStrength(restaurant: PublicRestaurant): number | null;
  /** Always null today. Present so a real signal can be dropped in later. */
  popularity(restaurant: PublicRestaurant): number | null;
  /** Ranked copy of the input. Never mutates the argument. */
  rank(restaurants: readonly PublicRestaurant[]): PublicRestaurant[];
}

/** Restaurants with no score sort last rather than being treated as zero. */
const NO_SIGNAL = -1;

export const fiyuRankingAdapter: DiscoveryRankingAdapter = {
  id: "fiyu-ranking-v3",
  popularityAvailable: false,

  pickStrength(restaurant) {
    return normalizeSignal(restaurant.fiyu_score);
  },

  popularity() {
    // community_* counters are all zero and community_stats_visible is false.
    // Returning null is the honest answer; never substitute fiyu_score here.
    return null;
  },

  rank(restaurants) {
    return [...restaurants]
      .map((restaurant) => ({
        restaurant,
        score: this.pickStrength(restaurant) ?? NO_SIGNAL,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Deterministic tiebreak keeps ordering stable across renders and
        // between server and client, which matters for hydration.
        return a.restaurant.place_id.localeCompare(b.restaurant.place_id);
      })
      .map((entry) => entry.restaurant);
  },
};

/**
 * Ranked restaurants for a mode.
 *
 * An unavailable mode returns an empty array. Callers must check
 * `isModeAvailable` first and render that mode's empty state, so "no data
 * source" is never presented as "no matching restaurants".
 */
export function rankByMode(
  restaurants: readonly PublicRestaurant[],
  mode: DiscoveryMode,
  adapter: DiscoveryRankingAdapter = fiyuRankingAdapter,
): PublicRestaurant[] {
  if (!getMode(mode).available) return [];
  return adapter.rank(restaurants);
}
