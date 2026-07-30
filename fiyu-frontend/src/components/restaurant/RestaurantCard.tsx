"use client";

import { OutboundMapActions } from "@/components/restaurant/OutboundMapActions";
import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { SignatureDishes } from "@/components/restaurant/SignatureDishes";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { distanceAccessibleLabel, formatDistance } from "@/lib/geo/distance";
import { editorialLabel } from "@/lib/format/editorialLabels";
import { detectTextLang, resolveNames } from "@/lib/format/language";
import { type DiscoveryAnchor, anchorDistanceSuffix, restaurantDistance } from "@/lib/location/anchor";
import { cn } from "@/lib/utils/cn";

export interface RestaurantCardProps {
  restaurant: PublicRestaurant;
  selected?: boolean;
  onSelect?: (restaurant: PublicRestaurant) => void;
  /** Compact variant for the mobile map peek sheet. */
  dense?: boolean;
  /** Starting point for the distance line, if the user set one. */
  anchor?: DiscoveryAnchor | null;
}

/** Shown when both name fields are null, so the card never renders headless. */
const UNNAMED = "Unnamed restaurant";

/**
 * Restaurant card.
 *
 * Content order: photo, Japanese name, English name, description, category and
 * neighbourhood, Fiyu score, then a short tag preview.
 *
 * Reads as an editorial index entry rather than a dashboard row: no border and
 * no box at rest, separated from its neighbours by a hairline. Hover lifts it
 * onto a white surface; selection adds a lavender left rule matching the map
 * pin, so the two surfaces read as one state.
 *
 * NEVER RENDERED HERE, and each for a specific reason:
 *  - the internal why_fiyu field, which the API does not expose;
 *  - Google ratings, review counts, hours or price, which Fiyu does not show;
 *  - community counts, which are all zero with community_stats_visible false,
 *    so displaying them would fabricate engagement;
 *  - any translation of API content, which the backend owns.
 *
 * `detectTextLang` only picks a `lang` attribute and never alters text.
 */
export function RestaurantCard({
  restaurant,
  selected = false,
  onSelect,
  dense = false,
  anchor = null,
}: RestaurantCardProps) {
  const names = resolveNames(restaurant);
  const label = editorialLabel(restaurant);
  const description = restaurant.description_en;
  const category = restaurant.category;
  const neighborhood = restaurant.neighborhood;

  /*
   * Distance needs an anchor and coordinates the backend has verified.
   * restaurantDistance owns the precision policy: it reports whether either
   * endpoint is an area anchor, and a coarse measurement is bucketed to 100 m
   * and hedged rather than stated as if it were a door-to-door figure.
   */
  const measured = restaurantDistance(anchor, restaurant);
  const distance =
    anchor === null || measured === null
      ? null
      : formatDistance(measured.meters, {
          suffix: anchorDistanceSuffix(anchor),
          approximate: measured.approximate,
          coarse: measured.approximate,
        });


  return (
    <article
      data-place-id={restaurant.place_id}
      className={cn(
        "group relative isolate rounded-card transition-[background-color,box-shadow] duration-200",
        "ease-(--ease-fiyu)",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lavender-500 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas",
        dense ? "p-4" : "px-4 py-5 sm:px-5",
        selected
          ? "bg-surface shadow-[0_1px_2px_rgba(25,23,29,0.04),0_8px_24px_-12px_rgba(49,40,61,0.18)]"
          : "hover:bg-surface hover:shadow-[0_1px_2px_rgba(25,23,29,0.04)]",
      )}
    >
      {/* Selection rule: an accent bar rather than a tinted card, so it reads
          at a glance beside a map pin without washing the row in lavender. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-4 bottom-4 -left-px w-0.5 rounded-full bg-lavender-500",
          "transition-opacity duration-200 ease-(--ease-fiyu)",
          selected ? "opacity-100" : "opacity-0",
        )}
      />

      {!dense && (
        <RestaurantPhoto
          placeId={restaurant.place_id}
          restaurantName={names.primary?.text ?? UNNAMED}
          className="mb-4"
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {label && (
            <p className="mb-1.5 text-[0.625rem] font-medium tracking-[0.16em] text-lavender-700 uppercase">
              {label}
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

      {(category || neighborhood || distance) && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          {category && <span lang={detectTextLang(category)}>{category}</span>}
          {category && neighborhood && <span aria-hidden="true">·</span>}
          {neighborhood && <span lang={detectTextLang(neighborhood)}>{neighborhood}</span>}
          {distance && (
            <>
              <span aria-hidden="true">·</span>
              <span
                title={distanceAccessibleLabel(distance, measured?.approximate ?? false)}
                className="text-ink-muted"
              >
                {distance}
              </span>
            </>
          )}
        </p>
      )}

      {/* Three tags maximum: beyond that the row reads as metadata soup. */}
      <TagList tags={restaurant.food_tags} max={3} className="mt-3" />

      {restaurant.signature_dishes.length > 0 && (
        <SignatureDishes dishes={restaurant.signature_dishes} max={3} className="mt-3" />
      )}

      {/* Verified coordinates when the backend cleared them for navigation, the
          verified written address otherwise, nothing when neither exists. */}
      <OutboundMapActions restaurant={restaurant} className="mt-3" />
    </article>
  );
}
