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
import {
  CARD_LAYOUT,
  REVEAL_CARD_LAYOUT,
} from "@/components/daily-picks/compactCardLayout";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PublicRestaurant } from "@/lib/api/schemas";
import {
  compactDescription,
  englishCardTags,
  englishStructuredValue,
} from "@/lib/daily-picks/cardContent";
import { hasGoldFiyuTreatment } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";
import { formatRestaurantBudget } from "@/lib/restaurant/budget";
import { restaurantMetadataParts } from "@/lib/restaurant/displayArea";
import {
  WHY_FIYU_FOUND_IT_SECTION,
  type RestaurantDetailSection,
} from "@/lib/navigation/restaurantDetail";

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 shrink-0 fill-none stroke-lavender-600"
    >
      <path d="m4.5 2.75 3.25 3.25L4.5 9.25" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Case-, width- and punctuation-insensitive name comparison. */
function sameDisplayName(first: string, second: string): boolean {
  const normalize = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]/gu, "");
  return normalize(first) === normalize(second);
}

/**
 * What a compact card shows, derived once so the card and its reveal sizer
 * always agree on which rows exist.
 */
export function compactCardContent(restaurant: PublicRestaurant) {
  const englishName = englishStructuredValue(restaurant.name_en);
  const title = restaurant.name_ja?.trim() || englishName || "Unnamed restaurant";
  const titleLang: "ja" | "en" = restaurant.name_ja?.trim() ? "ja" : "en";
  const subtitle = englishName && !sameDisplayName(englishName, title) ? englishName : null;
  // With no distinct romanization -- no English name, or one that only repeats
  // the title (SILVER SPOON / Silver Spoon) -- the secondary line carries the
  // cuisine and area the card already has instead.
  const metadata = restaurantMetadataParts(englishStructuredValue(restaurant.category), {
    display_area: englishStructuredValue(restaurant.display_area),
    neighborhood: englishStructuredValue(restaurant.neighborhood),
    discovery_area: englishStructuredValue(restaurant.discovery_area),
  }).join(" · ");
  return {
    title,
    titleLang,
    secondaryLine: subtitle ?? (metadata || null),
    description: compactDescription(restaurant),
    tags: englishCardTags(restaurant),
    budget: formatRestaurantBudget(restaurant.budget),
  };
}

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
 * family. `history` is a place already discovered, and earns the two dusty-blue
 * details defined below -- a cool top rule and a matching expiry line -- so a
 * run of past discoveries reads as a different group from a run of Picks
 * without either one becoming a different kind of object. `together` is a pick
 * that belongs to a pair, and takes plum in the same two places.
 *
 * All three stay on white paper with the same structure. The tense is carried
 * by the accent across the top edge and by the score's wordmark and rule,
 * never by the card's fill or a tinted panel: three identically-shaped
 * restaurants have to be equally readable whichever section a reader is in. An
 * exceptional (9+) current Pick swaps that accent and rule for brass and
 * changes nothing else.
 */
export type CompactCardTone = "current" | "history" | "together" | "personalized";

/** The one coloured edge. Every other side of the card stays neutral. */
const TONE_EDGE: Record<CompactCardTone, string> = {
  current: "before:bg-lavender-500",
  history: "before:bg-discovery",
  together: "before:bg-plum-500",
  personalized: "before:bg-personalized",
};

/*
 * Keyboard focus sits flush on the card (offset 0) and takes the border with
 * it, so outline, border and the inset top accent read as one continuous band
 * rather than two parallel lines. `:focus-visible` only: a pointer press
 * leaves no outline behind.
 */
const TONE_FOCUS: Record<CompactCardTone, string> = {
  current: "focus-visible:border-lavender-600 focus-visible:outline-lavender-600",
  history: "focus-visible:border-discovery focus-visible:outline-discovery",
  together: "focus-visible:border-plum-700 focus-visible:outline-plum-700",
  personalized: "focus-visible:border-personalized focus-visible:outline-personalized",
};

export interface CompactRestaurantCardProps {
  restaurant: PublicRestaurant;
  saved: boolean;
  savePending?: boolean;
  expirationLabel?: string;
  tone?: CompactCardTone;
  /** Dense, fixed-height front used only inside the shared Pick reveal frame. */
  layout?: "standard" | "reveal";
  onOpen?: (restaurant: PublicRestaurant) => void;
  onViewDetails?: (
    restaurant: PublicRestaurant,
    section?: RestaurantDetailSection,
  ) => void;
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
  layout = "standard",
  onOpen,
  onViewDetails,
  onToggleSaved,
}: CompactRestaurantCardProps) {
  const cardLayout = layout === "reveal" ? REVEAL_CARD_LAYOUT : CARD_LAYOUT;
  const fixedReveal = layout === "reveal";
  const history = tone === "history";
  const { title, titleLang, secondaryLine, description, tags, budget } =
    compactCardContent(restaurant);
  const exceptional = tone === "current" && hasGoldFiyuTreatment(restaurant.fiyu_score);
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

  const showReadToggle = Boolean(description) && (descriptionExpanded || descriptionTruncated);
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
      data-card-layout={layout}
      data-description-expanded={descriptionExpanded ? "true" : "false"}
      data-score-treatment={exceptional ? "exceptional" : "standard"}
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
        // A sheet of card paper: warm hairline edge, one barely-there fall of
        // shadow, and 16px of breathing room (20px on desktop).
        cardLayout.frame,
        fixedReveal && descriptionExpanded && REVEAL_CARD_LAYOUT.frameExpanded,
        "border-paper-line bg-surface shadow-paper",
        // The one coloured edge: a 3px accent across the top, clipped by the
        // card's own radius, so it reads as a printed rule rather than an
        // outline. The other three sides stay neutral.
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-[3px]",
        exceptional ? "before:bg-gold" : TONE_EDGE[tone],
        "transition-[border-color] duration-150 ease-(--ease-fiyu)",
        onOpen &&
          cn(
            // `!`: the global focus rule in globals.css is unlayered and would
            // otherwise restore its 2px offset, re-opening a gap (a second
            // line) between the outline and the card edge.
            "cursor-pointer hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-0! focus-visible:rounded-card!",
            TONE_FOCUS[tone],
          ),
      )}
      style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
    >
      <div
        data-testid="compact-card-layout"
        className={cn(
          cardLayout.main,
          fixedReveal && descriptionExpanded && REVEAL_CARD_LAYOUT.mainExpanded,
        )}
      >
        <div className={cardLayout.header}>
          <div className={cardLayout.titleBlock}>
            <h3
              lang={titleLang}
              // The strongest text on the card, at a size that holds Japanese
              // glyphs with confidence.
              className={cn(cardLayout.title, "text-ink")}
            >
              {title}
            </h3>
            {tone === "personalized" && !fixedReveal ? (
              <p className="mt-1 text-[0.625rem] font-semibold tracking-[0.14em] text-personalized-700 uppercase">
                Picked for you
              </p>
            ) : null}
            {secondaryLine && !fixedReveal && (
              <p className={cn(cardLayout.secondary, "text-ink-muted")}>
                {secondaryLine}
              </p>
            )}
          </div>

          {/*
            Set on the card's own paper, level with the name: the tracked
            wordmark aligns with the title's cap line and the rule closes the
            name block. The top accent already carries the colour mass, so the
            score needs no panel of its own.
          */}
          <ScoreMark
            score={restaurant.fiyu_score}
            size={fixedReveal ? "reveal" : "card"}
            tone={tone}
            className={cardLayout.score}
          />
        </div>

        <div
          className={cn(
            cardLayout.body,
            descriptionExpanded
              ? cn("flow-root", fixedReveal && REVEAL_CARD_LAYOUT.bodyExpanded)
              : cardLayout.bodyGrid,
          )}
        >
          <RestaurantPhoto
            placeId={restaurant.place_id}
            restaurantName={title}
            fill
            className={cn(
              cardLayout.photo,
              descriptionExpanded
                ? fixedReveal
                  ? "float-left mr-3 mb-1 w-[5.625rem]"
                  : "float-left mr-3 mb-1 w-[6.75rem] lg:mr-4 lg:w-[34%]"
                : "w-full",
            )}
          />
          <div className={cn(cardLayout.textColumn, !descriptionExpanded && cardLayout.textColumnResting)}>
            {fixedReveal && (secondaryLine || tone === "personalized") && (
              <p className={cn(cardLayout.secondary, "text-ink-muted")}>
                {tone === "personalized" ? (
                  <span className="font-semibold tracking-[0.08em] text-personalized-700 uppercase">
                    Picked for you{secondaryLine ? " · " : ""}
                  </span>
                ) : null}
                {secondaryLine}
              </p>
            )}
            {description && (
              <p
                ref={descriptionRef}
                id={descriptionId}
                className={cn(
                  cardLayout.description,
                  "text-ink-body",
                  !descriptionExpanded && (fixedReveal ? "line-clamp-2" : "line-clamp-3"),
                )}
              >
                {description}
              </p>
            )}
            {/*
              Read more and the price share one row under the description
              instead of stacking two short lines. Read more stays first in the
              DOM, straight after the copy it controls; the row is reversed
              visually so the price leads on the left.
            */}
            {(budget || showReadToggle) && (
              <div className={cardLayout.bodyRow}>
                {showReadToggle && (
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
                    className={cn(
                      cardLayout.readMore,
                      // The visual row stays compact; a pseudo-element extends
                      // the fixed-frame hit target without consuming height.
                      "relative rounded-md text-lavender-700 underline decoration-lavender-500/40 underline-offset-[3px] transition-colors duration-150 before:absolute before:-inset-x-1 before:content-[''] hover:text-plum hover:decoration-lavender-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lavender-600",
                      fixedReveal ? "before:-inset-y-3" : "before:-inset-y-2",
                    )}
                  >
                    {descriptionExpanded ? (fixedReveal ? "Show less" : "Read less") : "Read more"}
                  </button>
                )}
                {budget && (
                  // Never shrinks, wraps or truncates: a price missing its last
                  // digit is a wrong price.
                  <p
                    data-testid="compact-card-budget"
                    className={cn(cardLayout.price, "text-ink-body")}
                  >
                    {budget}
                  </p>
                )}
              </div>
            )}

          {/*
            The expiry line is the one piece of copy on this card that is about
            the past rather than the restaurant, so on a history card it carries
            the discovery blue. The wording states the status on its own; the colour
            only reinforces it.
          */}
            {expirationLabel && (
              <p
                className={cn(
                  "clear-both mt-1 text-xs",
                  history
                    ? "font-medium text-discovery-700"
                    : tone === "personalized"
                      ? "font-medium text-personalized-700"
                      : "text-ink-muted",
                )}
              >
                {expirationLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      {tags.length > 0 && (
        // One row only: a wrapping second row of chips would make the card's
        // height depend on tag text the concealed face cannot know.
        <TagList tags={tags} max={3} className={cardLayout.tags} />
      )}

      {/*
        Two tiers. The primary action owns a full row with Save at its right
        edge; Why Fiyu found it and the two map hand-offs sit in a quieter
        utility row beneath. `mt-auto` keeps the actions on the card's bottom
        edge when an expanded neighbour-free layout leaves spare height.
      */}
      <div
        data-testid="compact-card-footer"
        className={cardLayout.footer}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn(cardLayout.actionRow, "border-line")}>
          {onViewDetails && (
            <button
              type="button"
              aria-label="View restaurant"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails(restaurant);
              }}
              className={cn(
                "group/view -ml-2 inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 text-left text-[0.9375rem] font-semibold whitespace-nowrap text-plum transition-[background-color,transform] duration-150 ease-(--ease-fiyu) hover:bg-lavender-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 active:scale-[0.99] active:bg-lavender-100/70",
                cardLayout.viewAction,
              )}
            >
              <span>View restaurant</span>
              <span
                aria-hidden="true"
                className="text-lavender-600 transition-transform duration-150 ease-(--ease-fiyu) group-hover/view:translate-x-0.5"
              >
                →
              </span>
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
              "relative z-10 -mr-2 ml-auto inline-flex items-center justify-center rounded-lg",
              cardLayout.saveAction,
              "transition-[background-color,color,transform] duration-150",
              "ease-(--ease-fiyu) active:scale-[0.97]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
              saved
                ? "text-lavender-700 hover:bg-lavender-50 active:bg-lavender-100/70"
                : "text-ink-muted hover:bg-lavender-50 hover:text-plum active:bg-lavender-100/70",
            )}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
        <div className={cardLayout.utilityRow}>
          {onViewDetails && tone !== "together" && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails(restaurant, WHY_FIYU_FOUND_IT_SECTION);
              }}
              className={cn(
                cardLayout.why,
                "rounded-md text-ink-body transition-colors duration-150 ease-(--ease-fiyu) hover:bg-lavender-50 hover:text-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 active:bg-lavender-100/70",
              )}
            >
              Why Fiyu found it
              <ChevronIcon />
            </button>
          )}
          <OutboundMapActions restaurant={restaurant} variant="footer" className="ml-auto" />
        </div>
      </div>
    </article>
  );
}
