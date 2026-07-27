"use client";

import { Chip } from "@/components/ui/Chip";
import {
  DISCOVERY_MODES,
  type DiscoveryMode,
  fiyuRankingAdapter,
  getMode,
} from "@/lib/discovery/ranking";

export interface RankingControlProps {
  mode: DiscoveryMode;
  onChange: (mode: DiscoveryMode) => void;
  /** Result count, shown inline so the control carries its own context. */
  count?: number;
}

/**
 * Mode switch for the discovery lists.
 *
 * Sticks to the top of the scrolling list column, so filtering stays reachable
 * without hunting back up. The chip row scrolls horizontally on narrow screens
 * with the edge padding bled out, so chips run to the edge instead of stopping
 * at an arbitrary inset.
 *
 * Unavailable modes stay selectable rather than disabled: a disabled control is
 * skipped by keyboard navigation and explains nothing, whereas selecting
 * Trending reaches a state that says plainly why it is empty.
 */
export function RankingControl({ mode, onChange, count }: RankingControlProps) {
  const active = getMode(mode);

  return (
    <div className="sticky top-0 z-20 -mx-5 bg-canvas px-5 pt-4 pb-3 sm:-mx-8 sm:px-8">
      <div className="flex items-baseline justify-between gap-4">
        <div
          role="group"
          aria-label="Rank restaurants by"
          className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {DISCOVERY_MODES.map((definition) => (
            <Chip
              key={definition.id}
              selected={mode === definition.id}
              onClick={() => onChange(definition.id)}
              className="snap-start"
            >
              {definition.label}
            </Chip>
          ))}
        </div>

        {count !== undefined && active.available && (
          <p className="hidden shrink-0 text-xs whitespace-nowrap text-ink-faint sm:block">
            <span className="tabular-nums">{count}</span>{" "}
            {count === 1 ? "place" : "places"}
          </p>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        {active.description}
        {active.available && !fiyuRankingAdapter.popularityAvailable && (
          <>
            {" "}
            Popularity data isn&apos;t available from the public API, so this list doesn&apos;t
            rank by ratings or review counts.
          </>
        )}
      </p>
    </div>
  );
}
