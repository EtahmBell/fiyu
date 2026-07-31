"use client";

import type { KeyboardEvent, MouseEvent } from "react";

import { OutboundMapActions } from "@/components/restaurant/OutboundMapActions";
import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PublicRestaurant } from "@/lib/api/schemas";
import {
  compactDescription,
  englishCardTags,
  englishStructuredValue,
} from "@/lib/daily-picks/cardContent";
import { cn } from "@/lib/utils/cn";

export interface CompactRestaurantCardProps {
  restaurant: PublicRestaurant;
  saved: boolean;
  expirationLabel?: string;
  onOpen?: (restaurant: PublicRestaurant) => void;
  onViewDetails?: (restaurant: PublicRestaurant) => void;
  onToggleSaved(): void;
}

function actionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("a, button"));
}

export function CompactRestaurantCard({
  restaurant,
  saved,
  expirationLabel,
  onOpen,
  onViewDetails,
  onToggleSaved,
}: CompactRestaurantCardProps) {
  const englishName = englishStructuredValue(restaurant.name_en);
  const title = restaurant.name_ja?.trim() || englishName || "Unnamed restaurant";
  const subtitle = englishName && englishName !== title ? englishName : null;
  const description = compactDescription(restaurant);
  const tags = englishCardTags(restaurant);

  const open = () => onOpen?.(restaurant);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!actionTarget(event.target)) open();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    open();
  };

  return (
    <article
      data-testid="compact-restaurant-card"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `View ${title}` : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative min-w-0 w-full overflow-hidden rounded-card border border-line bg-surface p-3 shadow-[0_6px_20px_-18px_rgba(49,40,61,0.35)] sm:p-3.5",
        onOpen && "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
      )}
      style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
    >
      <div
        data-testid="compact-card-layout"
        className="grid min-w-0 grid-cols-1 items-stretch gap-3 min-[420px]:grid-cols-[minmax(10rem,36%)_minmax(0,1fr)] min-[420px]:gap-3.5"
      >
        <RestaurantPhoto
          placeId={restaurant.place_id}
          restaurantName={title}
          fill
          className="h-44 min-w-0 min-[420px]:h-full min-[420px]:min-h-52"
        />

        <div className="flex min-w-0 flex-col">
          {/*
           * Identity and score share one row rather than the score floating over
           * the card corner: the name column can then shrink against a fixed
           * score column instead of colliding with it.
           */}
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pt-0.5">
              <h3
                lang={restaurant.name_ja?.trim() ? "ja" : "en"}
                className="truncate font-display text-xl leading-tight text-ink"
              >
                {title}
              </h3>
              {subtitle && (
                <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-muted">
                  {subtitle}
                </p>
              )}
            </div>

            <ScoreMark score={restaurant.fiyu_score} size="lg" />
          </div>

          {description && (
            <p className="mt-2.5 line-clamp-4 max-w-prose text-[0.8125rem] leading-6 text-ink/75">
              {description}
            </p>
          )}

          {expirationLabel && (
            <p className="mt-2 text-[0.6875rem] text-ink-faint">{expirationLabel}</p>
          )}
        </div>
      </div>

      {tags.length > 0 && <TagList tags={tags} max={3} className="mt-3" />}

      <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
        <div className="min-w-0 max-w-full" onClick={(event) => event.stopPropagation()}>
          <OutboundMapActions restaurant={restaurant} variant="footer" />
        </div>
        {/*
         * Styled here rather than through `Button`: this control has to sit in
         * the same pill family as the map links beside it, and `cn` joins class
         * strings without resolving Tailwind conflicts, so overriding the
         * button's radius and fill from outside would not be reliable.
         */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {onViewDetails && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails(restaurant);
              }}
              className="relative z-10 inline-flex min-h-11 items-center rounded-chip border border-lavender-100 bg-lavender-50/60 px-4 text-xs font-medium text-lavender-700 transition-colors hover:border-lavender-500 hover:bg-lavender-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
            >
              View restaurant
            </button>
          )}
          <button
            type="button"
            aria-pressed={saved}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSaved();
            }}
            className={cn(
              "relative z-10 inline-flex min-h-11 shrink-0 items-center rounded-chip border px-4 text-xs font-medium",
              "transition-[background-color,border-color,color,transform] duration-[180ms]",
              "ease-(--ease-fiyu) active:scale-[0.98]",
              saved
                ? "border-lavender-600/50 bg-lavender-50 text-lavender-700 hover:bg-lavender-100"
                : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </article>
  );
}
