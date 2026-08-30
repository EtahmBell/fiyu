"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

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
import { formatRestaurantBudget } from "@/lib/restaurant/budget";

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

/**
 * Which tense the card is in.
 *
 * `current` is a pick from today's selection and stays entirely in the lavender
 * family. `history` is a place already discovered, and earns the two champagne
 * details defined below -- a warm top rule and a champagne expiry line -- so a
 * run of past discoveries reads as a different group from a run of Picks
 * without either one becoming a different kind of object.
 */
export type CompactCardTone = "current" | "history";

export interface CompactRestaurantCardProps {
  restaurant: PublicRestaurant;
  saved: boolean;
  savePending?: boolean;
  expirationLabel?: string;
  tone?: CompactCardTone;
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

const MOBILE_CARD_QUERY = "(max-width: 63.999rem)";
const DOUBLE_TAP_WINDOW_MS = 320;
const TAP_MOVEMENT_TOLERANCE_PX = 12;
const DOUBLE_TAP_DISTANCE_PX = 24;

interface TapPoint {
  at: number;
  x: number;
  y: number;
}

function isMobileCardViewport(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_CARD_QUERY).matches;
}

function distance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function CompactRestaurantCard({
  restaurant,
  saved,
  savePending = false,
  expirationLabel,
  tone = "current",
  onOpen,
  onViewDetails,
  onToggleSaved,
}: CompactRestaurantCardProps) {
  const history = tone === "history";
  const englishName = englishStructuredValue(restaurant.name_en);
  const title = restaurant.name_ja?.trim() || englishName || "Unnamed restaurant";
  const subtitle = englishName && englishName !== title ? englishName : null;
  const description = compactDescription(restaurant);
  const tags = englishCardTags(restaurant);
  const budget = formatRestaurantBudget(restaurant.budget);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionTruncated, setDescriptionTruncated] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const descriptionId = useId();
  const pointerStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastTap = useRef<TapPoint | null>(null);

  const measureDescription = useCallback(() => {
    const element = descriptionRef.current;
    if (!element || descriptionExpanded) return;
    setDescriptionTruncated(element.scrollHeight > element.clientHeight + 1);
  }, [descriptionExpanded]);

  useLayoutEffect(() => {
    if (!description || descriptionExpanded) return;
    measureDescription();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measureDescription);
    if (descriptionRef.current) observer?.observe(descriptionRef.current);
    window.addEventListener("resize", measureDescription);
    void document.fonts?.ready.then(measureDescription);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureDescription);
    };
  }, [description, descriptionExpanded, measureDescription]);

  const open = () => onOpen?.(restaurant);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!nestedInteractiveTarget(event.target, event.currentTarget)) open();
  };
  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (
      !onViewDetails ||
      !isMobileCardViewport() ||
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      nestedInteractiveTarget(event.target, event.currentTarget)
    ) {
      pointerStart.current = null;
      lastTap.current = null;
      return;
    }
    pointerStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (
      !start ||
      start.pointerId !== event.pointerId ||
      !onViewDetails ||
      !isMobileCardViewport() ||
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      nestedInteractiveTarget(event.target, event.currentTarget) ||
      distance(start, { x: event.clientX, y: event.clientY }) > TAP_MOVEMENT_TOLERANCE_PX
    ) {
      lastTap.current = null;
      return;
    }

    const tap = { at: Date.now(), x: event.clientX, y: event.clientY };
    const previous = lastTap.current;
    if (
      previous &&
      tap.at - previous.at <= DOUBLE_TAP_WINDOW_MS &&
      distance(previous, tap) <= DOUBLE_TAP_DISTANCE_PX
    ) {
      lastTap.current = null;
      onViewDetails(restaurant);
      return;
    }
    lastTap.current = tap;
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    open();
  };

  return (
    <article
      data-testid="compact-restaurant-card"
      data-tone={tone}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `View ${title}` : undefined}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerStart.current = null;
        lastTap.current = null;
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative min-w-0 w-full overflow-hidden rounded-card border border-line bg-surface p-2 shadow-[0_6px_20px_-18px_rgba(49,40,61,0.35)] sm:p-3.5 lg:p-3",
        // A single warm hairline along the top edge -- the card stays white and
        // its other three sides stay neutral, so this reads as a rule rather
        // than as a gold outline.
        history ? "border-t-gold/50" : "border-t-lavender-500/45",
        onOpen &&
          cn(
            "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
            history ? "focus-visible:outline-gold" : "focus-visible:outline-lavender-600",
          ),
      )}
      style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
    >
      <div
        data-testid="compact-card-layout"
        className="min-w-0"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pt-0.5">
            <h3
              lang={restaurant.name_ja?.trim() ? "ja" : "en"}
              className="line-clamp-2 break-words font-display text-lg leading-tight text-ink lg:text-xl"
            >
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 line-clamp-2 break-words text-xs leading-snug text-ink-muted lg:mt-1 lg:text-[0.8125rem]">
                {subtitle}
              </p>
            )}
          </div>

          <ScoreMark score={restaurant.fiyu_score} size="card" tone={tone} />
        </div>

        <div
          className={cn(
            "mt-1.5 min-w-0 lg:mt-2",
            descriptionExpanded
              ? "flow-root"
              : "grid grid-cols-[6.75rem_minmax(0,1fr)] gap-1.5 lg:grid-cols-[34%_minmax(0,1fr)] lg:gap-2.5",
          )}
        >
          <RestaurantPhoto
            placeId={restaurant.place_id}
            restaurantName={title}
            fill
            className={cn(
              "h-20 min-w-0 lg:h-32",
              descriptionExpanded
                ? "float-left mr-1.5 mb-0.5 w-[6.75rem] lg:mr-2.5 lg:w-[34%]"
                : "w-full",
            )}
          />
          <div className="min-w-0">
            {description && (
              <p
                ref={descriptionRef}
                id={descriptionId}
                className={cn(
                  "text-xs leading-[1.125rem] text-ink/75 lg:text-[0.8125rem] lg:leading-5",
                  !descriptionExpanded && "line-clamp-2 lg:line-clamp-3",
                )}
              >
                {description}
              </p>
            )}
            {budget && (
              <p className="mt-1 text-[0.6875rem] font-medium leading-none text-ink-muted lg:text-xs">
                {budget}
              </p>
            )}
            {description && (descriptionExpanded || descriptionTruncated) && (
              <button
                type="button"
                data-no-card-navigation="true"
                aria-controls={descriptionId}
                aria-expanded={descriptionExpanded}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDescriptionExpanded((expanded) => !expanded);
                }}
                className="mt-0.5 inline-flex min-h-6 items-center text-[0.6875rem] font-medium text-ink-muted underline decoration-gold-line underline-offset-2 transition-colors hover:text-gold-700 hover:decoration-gold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold"
              >
                {descriptionExpanded ? "Show less" : "Read more"}
              </button>
            )}

          {/*
            The expiry line is the one piece of copy on this card that is about
            the past rather than the restaurant, so on a history card it carries
            the champagne. The wording states the status on its own; the colour
            only reinforces it.
          */}
            {expirationLabel && (
              <p
                className={cn(
                  "clear-both mt-1.5 text-[0.6875rem] lg:mt-2",
                  history ? "font-medium text-gold-700" : "text-ink-faint",
                )}
              >
                {expirationLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      {tags.length > 0 && (
        <TagList tags={tags} max={3} className="mt-2 hidden lg:flex" />
      )}

      <div
        data-testid="compact-card-footer"
        className="relative z-10 mt-1.5 min-w-0 border-t border-line pt-1 lg:mt-2 lg:pt-2"
      >
        <div className="flex min-w-0 items-center gap-1 lg:block" onClick={(event) => event.stopPropagation()}>
          <div className="min-w-0 flex-1 lg:max-w-full">
            <OutboundMapActions restaurant={restaurant} variant="footer" />
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-1 lg:mt-0.5 lg:w-full lg:gap-3">
            {onViewDetails && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails(restaurant);
              }}
              className="relative z-10 inline-flex min-h-9 min-w-0 items-center gap-1 py-0.5 pr-1 text-left text-xs font-semibold whitespace-nowrap text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 lg:min-h-11 lg:gap-1.5 lg:py-2 lg:pr-3 lg:text-sm"
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
              "relative z-10 inline-flex size-9 shrink-0 items-center justify-center lg:ml-auto lg:size-11",
              "transition-[color,transform] duration-[180ms]",
              "ease-(--ease-fiyu) active:scale-[0.98]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
              saved
                ? "text-gold-700 hover:text-gold focus-visible:outline-gold"
                : "text-ink-muted hover:text-plum",
            )}
          >
            <BookmarkIcon filled={saved} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
