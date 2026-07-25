"use client";

import { Chip } from "@/components/ui/Chip";
import {
  DISCOVERY_MODES,
  type DiscoveryMode,
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  fiyuRankingAdapter,
} from "@/lib/discovery/ranking";

export interface RankingControlProps {
  mode: DiscoveryMode;
  onChange: (mode: DiscoveryMode) => void;
}

/**
 * Minimal two-position surface for the discovery axis.
 *
 * Phase 6 replaces this with the continuous slider. The adapter already models
 * the axis as a 0-1 blend, so that swap needs no ranking change -- this control
 * simply pins the blend to either end.
 *
 * The disclosure below is not decorative. The catalog exposes no popularity
 * data at all, so "Hidden Gems" is under-exposure and "Top Fiyu Picks" is
 * Fiyu's own score -- neither is a popularity ranking, and the UI says so.
 */
export function RankingControl({ mode, onChange }: RankingControlProps) {
  return (
    <div>
      <div
        role="group"
        aria-label="Rank restaurants by"
        className="flex flex-wrap items-center gap-2"
      >
        {DISCOVERY_MODES.map((option) => (
          <Chip key={option} selected={mode === option} onClick={() => onChange(option)}>
            {MODE_LABELS[option]}
          </Chip>
        ))}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        {MODE_DESCRIPTIONS[mode]}
        {!fiyuRankingAdapter.popularityAvailable && (
          <>
            {" "}
            Popularity data isn&apos;t available from the public API, so neither option ranks
            by ratings or review counts.
          </>
        )}
      </p>
    </div>
  );
}
