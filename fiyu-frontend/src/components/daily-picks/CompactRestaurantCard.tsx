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

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-bookmark-state={filled ? "saved" : "unsaved"}
    >
      <path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75v15l-5-3.25-5 3.25v-15Z" />
    </svg>
  );
}

export interface CompactRestaurantCardProps {
  restaurant: PublicRestaurant;
  saved: boolean;
  savePending?: boolean;
  expirationLabel?: string;
  onOpen?: (restaurant: PublicRestaurant) => void;
  onViewDetails?: (restaurant: PublicRestaurant) => void;
  onToggleSaved(): void;
}

const INTERACTIVE_CARD_SELECTOR =
  'a, button, input, select, textarea, [role="button"], [data-no-card-navigation]';

function nestedInteractiveTarget(
  target: EventTarget | null,
  currentTarget: HTMLElement,
): boolean {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(INTERACTIVE_CARD_SELECTOR);
  return interactive !== null && interactive !== currentTarget;
}

function hasFinePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

export function CompactRestaurantCard({
  restaurant,
  saved,
  savePending = false,
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
    if (!nestedInteractiveTarget(event.target, event.currentTarget)) open();
  };
  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (
      !onViewDetails ||
      !hasFinePointer() ||
      nestedInteractiveTarget(event.target, event.currentTarget)
    ) {
      return;
    }
    onViewDetails(restaurant);
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
      onDoubleClick={handleDoubleClick}
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

      <div
        data-testid="compact-card-footer"
        className="relative z-10 mt-3 min-w-0 border-t border-line pt-2.5"
      >
        <div className="min-w-0 max-w-full" onClick={(event) => event.stopPropagation()}>
          <OutboundMapActions restaurant={restaurant} variant="footer" />
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-3">
          {onViewDetails && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails(restaurant);
              }}
              className="relative z-10 inline-flex min-h-11 min-w-0 items-center gap-1.5 py-2 pr-3 text-left text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
            >
              <span>View restaurant</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
          <button
            type="button"
            aria-pressed={saved}
            aria-label={saved ? "Remove restaurant from saved" : "Save restaurant"}
            disabled={savePending}
            data-no-card-navigation="true"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (savePending) return;
              onToggleSaved();
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className={cn(
              "relative z-10 ml-auto inline-flex size-11 shrink-0 items-center justify-center",
              "transition-[color,transform] duration-[180ms]",
              "ease-(--ease-fiyu) active:scale-[0.98]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
              saved
                ? "text-plum hover:text-lavender-900"
                : "text-ink-muted hover:text-plum",
            )}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
      </div>
    </article>
  );
}
