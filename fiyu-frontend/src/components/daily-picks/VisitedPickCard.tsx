"use client";

import type { MapRestaurant, PublicRestaurant } from "@/lib/api/schemas";
import { restaurantMetadataParts } from "@/lib/restaurant/displayArea";

function stars(rating: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

export function VisitedPickCard({
  restaurant,
  visit,
  onOpen,
  onViewDetails,
}: {
  restaurant: PublicRestaurant;
  visit: MapRestaurant;
  onOpen?: (restaurant: PublicRestaurant) => void;
  onViewDetails?: (restaurant: PublicRestaurant) => void;
}) {
  const nameJa = restaurant.name_ja?.trim() || null;
  const nameEn = restaurant.name_en?.trim() || null;
  const title = nameJa ?? nameEn ?? "Unnamed restaurant";
  const subtitle = nameEn && nameEn !== title ? nameEn : null;
  const metadata = restaurantMetadataParts(restaurant.category, restaurant).join(" · ");

  return (
    <article
      data-testid="visited-pick-card"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Show ${title} on map` : undefined}
      onClick={() => onOpen?.(restaurant)}
      onKeyDown={(event) => {
        if (!onOpen || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onOpen(restaurant);
      }}
      className="min-w-0 rounded-card border border-line border-t-gold/60 bg-surface px-4 py-3 shadow-[0_6px_20px_-18px_rgba(49,40,61,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-gold-700 uppercase">
            Visited
          </p>
          <h3 lang={nameJa ? "ja" : "en"} className="mt-1 font-display text-xl leading-tight text-ink">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{subtitle}</p>}
          {metadata && <p className="mt-1 text-xs leading-5 text-ink-faint">{metadata}</p>}
        </div>
        {visit.user_rating !== null && visit.user_rating !== undefined && (
          <p
            aria-label={`${visit.user_rating} out of 5 stars`}
            className="shrink-0 text-sm tracking-[0.06em] text-gold-700"
          >
            <span aria-hidden="true">{stars(visit.user_rating)}</span>
          </p>
        )}
      </div>
      {onViewDetails && (
        <div className="mt-2 flex justify-end border-t border-gold-line/60 pt-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onViewDetails(restaurant);
            }}
            className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <span>View restaurant</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </article>
  );
}
