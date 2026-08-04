import type { ReactNode } from "react";
import Link from "next/link";

import type { SmartViewCatalogEntry } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";
import {
  smartViewCountLabel,
  smartViewDescriptionForCard,
  smartViewDisplayLabel,
  smartViewTintClass,
} from "@/components/lists/smartViewPresentation";

/**
 * Abstract spatial motif for the Nearby card.
 *
 * Faint rings and a few points, and deliberately nothing more: no coastline, no
 * street grid, no distances and no plotted places. It is a decorative mark that
 * says "around you", not a depiction of any location or of live positioning.
 * Held well below the text in contrast so it never competes for the eye.
 */
function SpatialMotif() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 120"
      className="pointer-events-none absolute -top-4 -right-5 h-28 text-lavender-500 sm:h-40"
      fill="none"
      stroke="currentColor"
    >
      <g opacity="0.3">
        <circle cx="104" cy="60" r="17" strokeWidth="1" />
        <circle cx="104" cy="60" r="33" strokeWidth="0.85" strokeDasharray="2 4.5" />
        <circle cx="104" cy="60" r="51" strokeWidth="0.7" strokeDasharray="1.5 5.5" />
        <path d="M22 94 70 76" strokeWidth="0.8" strokeDasharray="3 5" />
        <path d="M92 16 126 32" strokeWidth="0.8" strokeDasharray="3 5" />
      </g>
      <g fill="currentColor" stroke="none" opacity="0.45">
        <circle cx="104" cy="60" r="2.6" />
        <circle cx="70" cy="76" r="1.7" />
        <circle cx="126" cy="32" r="1.7" />
        <circle cx="136" cy="88" r="1.3" />
      </g>
    </svg>
  );
}

/**
 * Shared frame for the four standard Smart View motifs.
 *
 * One viewBox, one hairline weight and one colour, so the grid reads as a set
 * rather than four illustrations. The Nearby mark sets the register: lavender
 * linework held around three-tenths opacity, with a couple of solid points for
 * rhythm. Anything heavier competes with the heading; anything lighter reads as
 * a printing fault.
 */
function MotifFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 170 120"
      className={cn(
        "pointer-events-none absolute -top-3 -right-5 h-28 text-lavender-500 sm:h-34",
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 22 x 44 bookmark, drawn from its own origin so it can be fanned. */
const MOTIF_BOOKMARK = "M0 2a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v42l-11-7-11 7Z";

function SmartCardMotif({ viewKey }: { viewKey: string }) {
  if (viewKey === "recently_saved") {
    // Three bookmarks fanned and filled with the card's own paper, so the
    // overlaps read as a small stack of things collected rather than as
    // outlines crossing each other.
    return (
      <MotifFrame>
        <g opacity="0.3" strokeWidth="0.9" fill="var(--fiyu-tint-surface)">
          <path d={MOTIF_BOOKMARK} transform="translate(88 24) rotate(-11 11 22)" />
          <path d={MOTIF_BOOKMARK} transform="translate(105 18)" />
          <path d={MOTIF_BOOKMARK} transform="translate(122 24) rotate(11 11 22)" />
        </g>
        <g opacity="0.26">
          <path d="M56 90C76 98 106 95 128 80" strokeWidth="0.8" strokeDasharray="3 5" />
        </g>
        <circle cx="56" cy="90" r="1.6" fill="currentColor" stroke="none" opacity="0.4" />
      </MotifFrame>
    );
  }

  if (viewKey === "fiyu_9_plus") {
    // A cut stone rather than a numeral: the count already says "9+", and type
    // set inside a decorative mark never sits right at this scale.
    return (
      <MotifFrame className="-top-4 -right-6">
        <g opacity="0.3" strokeWidth="0.9">
          <path d="M96 26h36l16 22-34 42-34-42Z" />
          <path d="M80 48h68" strokeWidth="0.8" />
          <path d="M96 26 106 48" strokeWidth="0.8" />
          <path d="M132 26 122 48" strokeWidth="0.8" />
          <path d="M106 48 114 90" strokeWidth="0.75" />
          <path d="M122 48 114 90" strokeWidth="0.75" />
        </g>
        <g fill="currentColor" stroke="none" opacity="0.34">
          <path d="M56 58c0 6 2.6 8.6 8.6 8.6-6 0-8.6 2.6-8.6 8.6 0-6-2.6-8.6-8.6-8.6 6 0 8.6-2.6 8.6-8.6Z" />
          <path d="M146 16c0 3.4 1.5 4.9 4.9 4.9-3.4 0-4.9 1.5-4.9 4.9 0-3.4-1.5-4.9-4.9-4.9 3.4 0 4.9-1.5 4.9-4.9Z" />
        </g>
      </MotifFrame>
    );
  }

  if (viewKey === "not_visited") {
    // A marker at the end of a dotted approach: somewhere plotted but not yet
    // reached. The dashed ground ellipse keeps the pin from sitting in a void.
    return (
      <MotifFrame className="-top-2">
        <g opacity="0.3" strokeWidth="0.9">
          <path d="M118 88s22-26 22-42a22 22 0 1 0-44 0c0 16 22 42 22 42Z" />
          <circle cx="118" cy="46" r="7.5" strokeWidth="0.8" />
          <ellipse cx="118" cy="95" rx="12" ry="3.2" strokeWidth="0.75" strokeDasharray="2 4" />
        </g>
        <g opacity="0.26">
          <path d="M38 96C62 99 80 92 94 74" strokeWidth="0.8" strokeDasharray="3 5" />
        </g>
        <circle cx="38" cy="96" r="1.7" fill="currentColor" stroke="none" opacity="0.4" />
      </MotifFrame>
    );
  }

  if (viewKey === "by_neighborhood") {
    // Four irregular blocks either side of two drifting streets: quietly
    // architectural, and deliberately not a real map of anywhere.
    return (
      <MotifFrame>
        <g opacity="0.22" strokeWidth="0.8">
          <path d="M118 8C116 36 120 64 116 106" />
          <path d="M52 58C82 51 128 61 162 54" />
        </g>
        <g opacity="0.32" strokeWidth="0.9">
          <path d="M80 24 108 18 111 42 84 48Z" />
          <path d="M126 20 152 27 150 46 126 42Z" />
          <path d="M82 66 110 61 108 85 86 81Z" />
          <path d="M126 63 152 59 150 83 126 80Z" />
        </g>
        <g fill="currentColor" stroke="none" opacity="0.38">
          <circle cx="95" cy="33" r="1.6" />
          <circle cx="138" cy="71" r="1.6" />
        </g>
      </MotifFrame>
    );
  }

  return <SpatialMotif />;
}

function SmartViewGlyph({ viewKey }: { viewKey: string }) {
  const stroke = "currentColor";

  if (viewKey === "recently_saved") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75v15l-5-3.25-5 3.25v-15Z" />
        <path d="M14.8 8.2A2.8 2.8 0 0 0 12 5.4" />
      </svg>
    );
  }

  if (viewKey === "fiyu_9_plus") {
    // A cut stone, not a "9+" glyph: numerals inside a 20px disk never resolve.
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.6 3.8h6.8l3.6 4.9-7 11.5-7-11.5 3.6-4.9Z" />
        <path d="M4.4 8.7h15.2" strokeWidth="1.25" />
        <path d="M8.6 3.8 10.5 8.7" strokeWidth="1.25" />
        <path d="M15.4 3.8 13.5 8.7" strokeWidth="1.25" />
      </svg>
    );
  }

  if (viewKey === "not_visited") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20c3-3 5-6 5-9a5 5 0 1 0-10 0c0 3 2 6 5 9Z" />
        <circle cx="12" cy="11" r="1.8" />
      </svg>
    );
  }

  if (viewKey === "by_neighborhood") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 7 8.5 5l3 1.7v4.6L8.4 13l-3.9-1.9Z" />
        <path d="M11.5 6.8 15.6 5l3.9 2v4.2l-4 2.1-4-2Z" />
        <path d="M8.4 13.2 12 11.4l3.6 1.8v4.3L12 19.3l-3.6-1.8Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4.5v1.8" />
      <path d="M12 17.7v1.8" />
      <path d="M4.5 12h1.8" />
      <path d="M17.7 12h1.8" />
      <circle cx="8" cy="8.6" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15.9" cy="9.2" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="13.9" cy="16" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CardCornerAccent() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 80 56"
      className="pointer-events-none absolute -left-1 -bottom-1 h-12 text-lavender-600/25 sm:h-14"
      fill="none"
    >
      <path d="M0 56V20l18-7 26 9 16 20-12 14Z" fill="currentColor" opacity="0.22" />
      <path d="M0 56V24l18-7 28 10" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    </svg>
  );
}

export function SmartViewCard({ view }: { view: SmartViewCatalogEntry }) {
  const prominentNearby = view.key === "nearby";
  const label = smartViewDisplayLabel(view.key, view.label);

  return (
    <li className={cn(smartViewTintClass(view.key), prominentNearby && "sm:col-span-2")}>
      {/*
       * The per-view tint carries the card's identity, so the repeated
       * "Smart view" kicker that used to sit here is gone: the tab and the page
       * heading already say it, and five uppercase labels in one grid read as
       * noise rather than structure.
       */}
      <Link
        href={`/lists/smart/${encodeURIComponent(view.key)}`}
        className={cn(
          "group relative flex min-h-[10.5rem] h-full flex-col overflow-hidden rounded-card border px-4 py-4 text-left",
          "border-[color:var(--fiyu-tint-edge)] bg-[color:var(--fiyu-tint-surface)]",
          "transition-colors duration-200 ease-(--ease-fiyu) hover:border-lavender-500/55",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
          prominentNearby && "sm:px-5",
        )}
      >
        <CardCornerAccent />
        <SmartCardMotif viewKey={view.key} />

        {/* On the wide Nearby card the text column stops short of the motif; on
            mobile the motif sits above the heading line, so nothing is reserved. */}
        <div className={cn("relative flex flex-1 flex-col", prominentNearby && "sm:pr-36")}>
          {/* A small colour moment: tinted disk, plum linework -- never a filled icon. */}
          <div className="inline-flex size-9 shrink-0 items-center justify-center self-start rounded-full border border-[color:var(--fiyu-tint-edge)] bg-[color:var(--fiyu-tint-disk)] text-plum">
            <SmartViewGlyph viewKey={view.key} />
          </div>

          <h2 className="mt-4 font-display text-2xl leading-tight text-ink">{label}</h2>
          <p className="mt-2 max-w-prose text-sm leading-6 text-ink-muted">
            {smartViewDescriptionForCard(view)}
          </p>

          <p
            className={cn(
              "mt-auto pt-5 text-sm font-semibold",
              view.item_count > 0 ? "text-plum" : "text-ink-muted",
            )}
          >
            {smartViewCountLabel(view.item_count)}
          </p>
        </div>
      </Link>
    </li>
  );
}
