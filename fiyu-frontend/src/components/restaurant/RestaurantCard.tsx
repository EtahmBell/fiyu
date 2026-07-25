"use client";

import { SignatureDishes } from "@/components/restaurant/SignatureDishes";
import { TagList } from "@/components/restaurant/TagList";
import { Badge } from "@/components/ui/Badge";
import { ScoreDial } from "@/components/ui/ScoreDial";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { detectTextLang, resolveNames } from "@/lib/format/language";
import { confidenceBandLabel, formatConfidence, scoreBandLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

export interface RestaurantCardProps {
  restaurant: PublicRestaurant;
  selected?: boolean;
  onSelect?: (restaurant: PublicRestaurant) => void;
}

/** Shown when both name fields are null, so the card never renders headless. */
const UNNAMED = "Unnamed restaurant";

/**
 * Restaurant card.
 *
 * Content is strictly what the public catalog provides. There is deliberately
 * no photo, rating, price, distance or review count: none of those exist in the
 * payload, and inventing them is explicitly out of bounds. Visual weight comes
 * from the type scale and the score dial instead.
 *
 * Interaction uses the "stretched control" pattern: a single button, named by
 * the restaurant, whose ::after covers the whole card. That gives one tab stop
 * for the entire card, a correct accessible name, and a full-card hit area
 * without nesting interactive elements or adding a click handler to a div.
 *
 * Phase 5 replaces the button with a Link to /restaurants/[placeId]; the layout
 * and the stretched-control pattern stay the same.
 */
export function RestaurantCard({ restaurant, selected = false, onSelect }: RestaurantCardProps) {
  const names = resolveNames(restaurant);
  const band = scoreBandLabel(restaurant.score_band);
  const confidence = confidenceBandLabel(restaurant.confidence_band);
  const why = restaurant.why_fiyu;

  const category = restaurant.primary_category;
  const neighborhood = restaurant.neighborhood;

  return (
    <article
      data-place-id={restaurant.place_id}
      className={cn(
        "relative rounded-card border bg-surface p-4 transition-colors duration-150 ease-out sm:p-5",
        // The ring follows the inner button's focus so keyboard users see the
        // whole card highlighted, not just the name text.
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2",
        selected
          ? "border-accent bg-accent-soft/25"
          : "border-hairline hover:border-ink-faint",
      )}
    >
      <div className="flex items-start gap-4">
        <ScoreDial score={restaurant.fiyu_score} size="md" />

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-snug text-ink sm:text-2xl">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(restaurant)}
                // aria-current lives on the button, not the <article>. Placed on
                // a non-focusable ancestor it is never announced, so a screen
                // reader user would get no indication of which card is selected.
                aria-current={selected ? "true" : undefined}
                // The card owns the focus ring; suppress the default outline on
                // the name itself so the two do not double up.
                className="text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
              >
                <span lang={names.primary?.lang}>{names.primary?.text ?? UNNAMED}</span>
              </button>
            ) : (
              <span lang={names.primary?.lang}>{names.primary?.text ?? UNNAMED}</span>
            )}
          </h3>

          {names.secondary && (
            <p lang={names.secondary.lang} className="mt-0.5 text-sm text-ink-muted">
              {names.secondary.text}
            </p>
          )}

          {(category || neighborhood) && (
            <p className="mt-1.5 text-xs text-ink-faint">
              {category && <span lang={detectTextLang(category)}>{category}</span>}
              {category && neighborhood && <span aria-hidden="true"> · </span>}
              {neighborhood && <span lang={detectTextLang(neighborhood)}>{neighborhood}</span>}
            </p>
          )}
        </div>
      </div>

      {(band || confidence) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {band && <Badge tone="accent">{band}</Badge>}
          {confidence && (
            <Badge tone="outline" title={`Fiyu confidence ${formatConfidence(restaurant.fiyu_confidence)}`}>
              {confidence}
            </Badge>
          )}
        </div>
      )}

      {why && (
        <p
          lang={detectTextLang(why)}
          className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-muted"
        >
          {why}
        </p>
      )}

      <TagList tags={restaurant.food_tags} max={4} className="mt-3" />
      <SignatureDishes dishes={restaurant.signature_dishes} max={3} className="mt-2" />
    </article>
  );
}
