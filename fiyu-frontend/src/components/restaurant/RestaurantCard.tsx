"use client";

import { SignatureDishes } from "@/components/restaurant/SignatureDishes";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { detectTextLang, resolveNames } from "@/lib/format/language";
import { scoreBandLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

export interface RestaurantCardProps {
  restaurant: PublicRestaurant;
  selected?: boolean;
  onSelect?: (restaurant: PublicRestaurant) => void;
  /** Compact variant for the mobile map peek sheet. */
  dense?: boolean;
}

/** Shown when both name fields are null, so the card never renders headless. */
const UNNAMED = "Unnamed restaurant";

/**
 * Restaurant card.
 *
 * Reads as an editorial index entry rather than a dashboard row: no border and
 * no box at rest, sitting directly on the canvas and separated from its
 * neighbours by a hairline. Hover lifts it onto a white surface; selection adds
 * a lavender left rule. The lavender is spent only on the score mark, the band
 * kicker and the selected rule.
 *
 * Hierarchy, strongest first: restaurant name, then the editorial description,
 * then the score mark.
 *
 * Never rendered here: the internal why_fiyu field (not exposed by the API),
 * Google ratings, review counts, hours or price, and any community statistic.
 * The community_* counters are all zero with community_stats_visible false, so
 * showing them would fabricate engagement.
 *
 * Content is strictly what the API returns, rendered verbatim. No photo,
 * rating, price, distance or review count exists in the payload and none is
 * invented. `detectTextLang` only picks a `lang` attribute; it never alters
 * text.
 *
 * Interaction uses the stretched-control pattern: one button, named by the
 * restaurant, whose ::after covers the card. That gives a single tab stop, a
 * correct accessible name and a full-card hit area without nesting
 * interactive elements.
 */
export function RestaurantCard({
  restaurant,
  selected = false,
  onSelect,
  dense = false,
}: RestaurantCardProps) {
  const names = resolveNames(restaurant);
  const band = scoreBandLabel(restaurant.score_band);
  // The public editorial description. The internal why_fiyu field is not
  // exposed by the API and is never rendered.
  const description = restaurant.description_en;
  const category = restaurant.category;
  const neighborhood = restaurant.neighborhood;

  return (
    <article
      data-place-id={restaurant.place_id}
      className={cn(
        "group relative isolate rounded-card transition-[background-color,box-shadow] duration-200",
        "ease-(--ease-fiyu)",
        // The focus ring follows the inner button so keyboard users see the
        // whole card highlighted, not just the name.
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lavender-500 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas",
        dense ? "p-4" : "px-4 py-5 sm:px-5",
        selected
          ? "bg-surface shadow-[0_1px_2px_rgba(25,23,29,0.04),0_8px_24px_-12px_rgba(49,40,61,0.18)]"
          : "hover:bg-surface hover:shadow-[0_1px_2px_rgba(25,23,29,0.04)]",
      )}
    >
      {/* Selection rule. An accent bar rather than a tinted card: it reads at a
          glance next to a map pin without washing the whole row in lavender. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-4 bottom-4 -left-px w-0.5 rounded-full bg-lavender-500",
          "transition-opacity duration-200 ease-(--ease-fiyu)",
          selected ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {band && (
            <p className="mb-1.5 text-[0.625rem] font-medium tracking-[0.16em] text-lavender-700 uppercase">
              {band}
            </p>
          )}

          <h3
            className={cn(
              "font-display text-ink",
              dense ? "text-xl leading-tight" : "text-2xl leading-[1.15] sm:text-[1.75rem]",
            )}
          >
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(restaurant)}
                // aria-current belongs on the button: on a non-focusable
                // ancestor it is never announced.
                aria-current={selected ? "true" : undefined}
                className="text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
              >
                <span lang={names.primary?.lang}>{names.primary?.text ?? UNNAMED}</span>
              </button>
            ) : (
              <span lang={names.primary?.lang}>{names.primary?.text ?? UNNAMED}</span>
            )}
          </h3>

          {names.secondary && (
            <p lang={names.secondary.lang} className="mt-1 text-sm text-ink-muted">
              {names.secondary.text}
            </p>
          )}

          {(category || neighborhood) && (
            <p className="mt-2 text-xs text-ink-faint">
              {category && <span lang={detectTextLang(category)}>{category}</span>}
              {category && neighborhood && <span aria-hidden="true"> · </span>}
              {neighborhood && <span lang={detectTextLang(neighborhood)}>{neighborhood}</span>}
            </p>
          )}
        </div>

        <ScoreMark score={restaurant.fiyu_score} size={dense ? "sm" : "md"} className="mt-0.5" />
      </div>

      {description && (
        <p
          lang={detectTextLang(description)}
          className={cn(
            "mt-4 line-clamp-3 text-[0.9375rem] leading-relaxed text-ink/85",
            dense && "mt-3 text-sm",
          )}
        >
          {description}
        </p>
      )}

      {/* Three tags maximum: beyond that the row reads as metadata soup. */}
      <TagList tags={restaurant.food_tags} max={3} className="mt-4" />

      {restaurant.signature_dishes.length > 0 && (
        <SignatureDishes dishes={restaurant.signature_dishes} max={3} className="mt-3" />
      )}
    </article>
  );
}
