import Link from "next/link";

import type { SmartViewCatalogEntry } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";
import {
  isUnavailableForMissingArea,
  smartViewCountLabelMaybe,
  smartViewDisplayLabel,
} from "@/components/lists/smartViewPresentation";

function PremiumSparkle() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 text-lavender-700" fill="currentColor">
      <path d="M10 1.9c0 3 1.2 4.2 4.2 4.2-3 0-4.2 1.2-4.2 4.2 0-3-1.2-4.2-4.2-4.2C8.8 6.1 10 4.9 10 1.9Z" />
      <path d="M16.6 10.2c0 1.7.7 2.4 2.4 2.4-1.7 0-2.4.7-2.4 2.4 0-1.7-.7-2.4-2.4-2.4 1.7 0 2.4-.7 2.4-2.4Z" />
    </svg>
  );
}

function RamenMotif() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 176 120"
      className="pointer-events-none absolute -right-4 -top-3 h-28 text-lavender-500 sm:h-32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g opacity="0.26" strokeWidth="0.9">
        <path d="M102 16h58v26h-58Z" />
        <path d="M114 16v26M130 16v26M146 16v26" />
      </g>
      <g opacity="0.34" strokeWidth="0.95">
        <path d="M84 76c0 14 12 24 28 24s28-10 28-24" />
        <path d="M88 74h48" />
        <path d="M97 84c0 6 6 10 15 10s15-4 15-10" />
      </g>
      <g opacity="0.24" strokeWidth="0.8">
        <path d="M44 94c12 8 28 8 41 0" strokeDasharray="3 5" />
      </g>
      <circle cx="44" cy="94" r="1.5" fill="currentColor" stroke="none" opacity="0.32" />
    </svg>
  );
}

function GemsMotif() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 176 120"
      className="pointer-events-none absolute -right-5 -top-4 h-28 text-lavender-500 sm:h-32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g opacity="0.32" strokeWidth="0.9">
        <path d="M102 22h34l14 19-31 38-31-38Z" />
        <path d="M88 41h62" />
        <path d="M102 22 111 41" />
        <path d="M136 22 127 41" />
      </g>
      <g opacity="0.24" strokeWidth="0.8">
        <path d="M38 92c20 6 43-3 59-22" strokeDasharray="3 5" />
      </g>
      <circle cx="38" cy="92" r="1.5" fill="currentColor" stroke="none" opacity="0.34" />
    </svg>
  );
}

function DetourMotif() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 176 120"
      className="pointer-events-none absolute -right-5 -top-3 h-28 text-lavender-500 sm:h-32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g opacity="0.28" strokeWidth="0.9">
        <path d="M34 89c24 8 52-3 72-24 16-16 30-24 48-25" strokeDasharray="3 5" />
        <path d="M144 30c0 10-8 18-18 18s-18-8-18-18 8-18 18-18 18 8 18 18Z" />
        <circle cx="126" cy="30" r="4.8" />
      </g>
      <circle cx="34" cy="89" r="1.6" fill="currentColor" stroke="none" opacity="0.36" />
    </svg>
  );
}

function PremiumMotif({ viewKey }: { viewKey: string }) {
  if (viewKey === "ramen_in_shibuya") return <RamenMotif />;
  if (viewKey === "out_of_the_way_gems") return <GemsMotif />;
  return <DetourMotif />;
}

export function PremiumSmartCollectionCard({
  view,
  onLockedOpen,
}: {
  view: SmartViewCatalogEntry;
  onLockedOpen(view: SmartViewCatalogEntry): void;
}) {
  const label = smartViewDisplayLabel(view.key, view.title ?? view.label);
  const unavailableForArea = isUnavailableForMissingArea(view);
  const countLabel = smartViewCountLabelMaybe(view.item_count);

  if (view.available === false) {
    return (
      <li>
        <article className="relative min-h-[10.5rem] overflow-hidden rounded-card border border-lavender-200/85 bg-surface px-4 py-4">
          <PremiumMotif viewKey={view.key} />
          <div className="relative flex h-full flex-col">
            <p className="inline-flex items-center gap-1 text-[0.68rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
              <PremiumSparkle />
              <span>Premium</span>
            </p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-ink">{label}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              {view.unavailable_reason ?? "This collection is currently unavailable."}
            </p>
            {unavailableForArea && (
              <Link
                href="/picks"
                className="mt-auto pt-4 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
              >
                Set discovery origin →
              </Link>
            )}
          </div>
        </article>
      </li>
    );
  }

  if (view.locked) {
    return (
      <li>
        <article className="relative min-h-[10.5rem] overflow-hidden rounded-card border border-lavender-200/85 bg-surface px-4 py-4">
          <PremiumMotif viewKey={view.key} />
          <div className="relative flex h-full flex-col">
            <p className="inline-flex items-center gap-1 text-[0.68rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
              <PremiumSparkle />
              <span>Premium</span>
            </p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-ink">{label}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{view.description}</p>
            <button
              type="button"
              onClick={() => onLockedOpen(view)}
              className="mt-auto pt-4 text-left text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
            >
              Explore with Premium →
            </button>
          </div>
        </article>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/lists/smart/${encodeURIComponent(view.key)}`}
        className={cn(
          "group relative flex min-h-[10.5rem] h-full flex-col overflow-hidden rounded-card border border-lavender-200/85 bg-surface px-4 py-4 text-left",
          "transition-colors duration-200 ease-(--ease-fiyu) hover:border-lavender-500/55",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
        )}
      >
        <PremiumMotif viewKey={view.key} />
        <div className="relative flex h-full flex-col">
          <p className="inline-flex items-center gap-1 text-[0.68rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
            <PremiumSparkle />
            <span>Premium</span>
          </p>
          <h3 className="mt-3 font-display text-2xl leading-tight text-ink">{label}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{view.description}</p>
          {countLabel && (
            <p className={cn("mt-auto pt-4 text-sm font-semibold", view.item_count && view.item_count > 0 ? "text-plum" : "text-ink-muted")}>
              {countLabel}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
