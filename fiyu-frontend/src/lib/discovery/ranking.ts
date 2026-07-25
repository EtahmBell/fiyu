import type { PublicRestaurant } from "@/lib/api/schemas";
import { normalizeSignal } from "@/lib/format/score";

/**
 * Discovery ranking.
 *
 * ALL ordering logic lives behind this adapter. Components receive an already
 * ranked array and never sort, so the ranking rules can change (or be replaced
 * wholesale) without touching presentation.
 *
 * The axis runs from Hidden Gems to Top Fiyu Picks. Both ends are backed by
 * real fields:
 *
 *   Hidden Gems     local_language_web_signal -- Japanese-language web
 *                   presence, the backend's proxy for under-exposure.
 *   Top Fiyu Picks  fiyu_score -- Fiyu's own composite editorial score.
 *
 * What this is NOT: a popularity axis. The public catalog exposes no rating,
 * review count or popularity rank of any kind (see docs/LIMITATIONS.md §1), so
 * `popularity()` returns null for every restaurant and `popularityAvailable`
 * is false. Nothing here approximates or infers popularity from other fields.
 */

export type DiscoveryMode = "top-picks" | "hidden-gems";

/**
 * Blend position: 0 = purely Hidden Gems, 1 = purely Top Fiyu Picks.
 * Modelled as a continuous value so the Phase 6 slider needs no adapter change.
 */
export const MODE_BLEND: Record<DiscoveryMode, number> = {
  "hidden-gems": 0,
  "top-picks": 1,
};

export const DISCOVERY_MODES: readonly DiscoveryMode[] = ["top-picks", "hidden-gems"];

export const MODE_LABELS: Record<DiscoveryMode, string> = {
  "top-picks": "Top Fiyu Picks",
  "hidden-gems": "Hidden Gems",
};

export const MODE_DESCRIPTIONS: Record<DiscoveryMode, string> = {
  "top-picks": "Highest Fiyu score first.",
  "hidden-gems": "Strongest Japanese-language web presence first — the least exposed.",
};

export interface DiscoveryRankingAdapter {
  readonly id: string;
  /**
   * False while the backend exposes no popularity data. Consumers must use
   * this to decide whether a popularity-labelled control may be shown at all.
   */
  readonly popularityAvailable: boolean;
  /** Under-exposure, 0-1. Null when the backing signal is missing. */
  hiddenness(restaurant: PublicRestaurant): number | null;
  /** Fiyu's own score, 0-1. Null when the backing signal is missing. */
  pickStrength(restaurant: PublicRestaurant): number | null;
  /** Always null today. Present so a real signal can be dropped in later. */
  popularity(restaurant: PublicRestaurant): number | null;
  /** Ranked copy of the input. Never mutates the argument. */
  rank(restaurants: readonly PublicRestaurant[], blend: number): PublicRestaurant[];
}

/**
 * Restaurants with neither signal sort last rather than being treated as zero,
 * which would scatter them among genuinely low-scoring entries.
 */
const NO_SIGNAL = -1;

function blendedScore(
  adapter: Pick<DiscoveryRankingAdapter, "hiddenness" | "pickStrength">,
  restaurant: PublicRestaurant,
  blend: number,
): number {
  const hidden = adapter.hiddenness(restaurant);
  const pick = adapter.pickStrength(restaurant);

  if (hidden === null && pick === null) return NO_SIGNAL;
  // With one signal missing, fall back to the other rather than penalising the
  // restaurant for incomplete backend data.
  if (hidden === null) return pick as number;
  if (pick === null) return hidden;

  return (1 - blend) * hidden + blend * pick;
}

export const fiyuRankingAdapter: DiscoveryRankingAdapter = {
  id: "fiyu-hiddenness-v1",
  popularityAvailable: false,

  hiddenness(restaurant) {
    return normalizeSignal(restaurant.local_language_web_signal);
  },

  pickStrength(restaurant) {
    return normalizeSignal(restaurant.fiyu_score);
  },

  popularity() {
    // No popularity field exists in the public catalog. Returning null is the
    // honest answer; do not substitute fiyu_score or any other proxy here.
    return null;
  },

  rank(restaurants, blend) {
    const clamped = Math.min(1, Math.max(0, blend));

    return [...restaurants]
      .map((restaurant) => ({
        restaurant,
        score: blendedScore(this, restaurant, clamped),
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

export function rankByMode(
  restaurants: readonly PublicRestaurant[],
  mode: DiscoveryMode,
  adapter: DiscoveryRankingAdapter = fiyuRankingAdapter,
): PublicRestaurant[] {
  return adapter.rank(restaurants, MODE_BLEND[mode]);
}

/** Whether a restaurant can be placed on the map (Phase 4). */
export function hasCoordinates(
  restaurant: PublicRestaurant,
): restaurant is PublicRestaurant & { latitude: number; longitude: number } {
  return restaurant.latitude !== null && restaurant.longitude !== null;
}
