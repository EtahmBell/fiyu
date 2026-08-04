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
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M9.2 13.2c0-1.4.8-2.3 2-2.3 1.2 0 2 .9 2 2.3v3.4" />
        <path d="M9.2 16.6h4" />
        <path d="M14.8 11.4h3.2" />
        <path d="M16.4 9.8v3.2" />
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
        <path d="M4 7.5h16" />
        <path d="M4 12h16" />
        <path d="M4 16.5h16" />
        <path d="M9 6v12" />
        <path d="M15 6v12" />
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
        {prominentNearby && <SpatialMotif />}

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
