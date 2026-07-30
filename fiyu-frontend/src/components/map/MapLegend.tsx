"use client";

import { useState } from "react";

import { OSM_ATTRIBUTION, OSM_SOURCE_URL } from "@/lib/map/geography";
import { cn } from "@/lib/utils/cn";

/**
 * Map key and data credit.
 *
 * HTML rather than SVG, like MapControls: it sits outside the map's pointer
 * surface, so reading the legend can never start a drag, and the disclosure
 * button is a real button for keyboard and screen-reader users.
 *
 * Collapsed to a single line by default. A permanent four-row key would occupy
 * the corner of a map that only ever shows a handful of restaurants, and the
 * restaurant pins share one visual treatment because this is an orientation
 * map, not a directions or survey product.
 *
 * The ODbL credit is not optional and is shown whether the key is open or closed.
 */

interface LegendEntry {
  id: string;
  label: string;
  swatch: React.ReactNode;
}

/** Swatches reuse the map's own CSS variables, so the key cannot drift. */
const ENTRIES: LegendEntry[] = [
  {
    id: "restaurant",
    label: "Restaurant",
    swatch: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="var(--map-marker-center)" stroke="var(--map-marker)" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id: "station",
    label: "Station",
    swatch: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        <circle cx="8" cy="8" r="4" fill="var(--map-station-fill)" stroke="var(--map-station-stroke)" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: "landmark",
    label: "Landmark",
    swatch: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        {/* Not scaled by a map transform here, so stroke-width is in glyph units. */}
        <g
          transform="translate(8 8) scale(5.5)"
          fill="none"
          stroke="var(--map-landmark)"
          strokeWidth="0.28"
          strokeLinecap="round"
        >
          <path d="M-0.8,-0.5 L0.8,-0.5 M-0.62,-0.15 L0.62,-0.15 M-0.42,-0.5 L-0.42,0.75 M0.42,-0.5 L0.42,0.75" />
        </g>
      </svg>
    ),
  },
];

export interface MapLegendProps {
  className?: string;
}

export function MapLegend({ className }: MapLegendProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("pointer-events-auto flex flex-col items-start gap-1", className)}>
      {open && (
        <ul
          id="fiyu-map-legend"
          className={cn(
            "rounded-card border border-line/70 bg-surface/95 px-3 py-2.5",
            "flex flex-col gap-1.5 text-[0.6875rem] text-ink-muted shadow-sm backdrop-blur-[2px]",
          )}
        >
          {ENTRIES.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <span className="shrink-0">{entry.swatch}</span>
              {entry.label}
            </li>
          ))}

          {/*
            The geography is real but simplified for drawing. Saying so is the
            this is an orientation aid, not a survey or navigation map.
          */}
          <li className="max-w-[13rem] pt-1 text-[0.625rem] leading-snug text-ink-faint">
            Illustrated map. Geography is simplified and is not for navigation.
          </li>
        </ul>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="fiyu-map-legend"
          className={cn(
            "rounded-chip border border-line/70 bg-surface/90 px-2 py-1",
            "text-[0.625rem] text-ink-muted transition-colors duration-200 ease-(--ease-fiyu)",
            "hover:text-lavender-700",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-500",
          )}
        >
          {open ? "Hide key" : "Map key"}
        </button>

        {/*
          ODbL requires visible credit wherever the geometry is shown. Small, but
          never hidden behind the disclosure.
        */}
        <a
          href={OSM_SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "text-[0.5625rem] text-[var(--map-label-muted)] underline decoration-line/60 underline-offset-2",
            "transition-colors duration-200 ease-(--ease-fiyu) hover:text-lavender-700",
          )}
        >
          {OSM_ATTRIBUTION}
        </a>
      </div>
    </div>
  );
}
