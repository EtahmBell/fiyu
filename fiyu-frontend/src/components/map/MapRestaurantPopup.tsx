"use client";

import Link from "next/link";

import type { MappableRestaurant } from "@/lib/geo/mappable";
import type { Point } from "@/lib/map/projection";
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "@/lib/map/projection";
import type { MapView } from "@/lib/map/viewport";
import { restaurantDetailHref } from "@/lib/navigation/restaurantDetail";
import { cn } from "@/lib/utils/cn";

const PREFERRED_WIDTH = 272;
const MIN_WIDTH = 220;
const POPUP_HEIGHT = 172;
const POPUP_GAP = 18;
const EDGE_MARGIN = 12;

interface MapRestaurantPopupProps {
  restaurant: MappableRestaurant;
  point: Point;
  view: MapView;
  containerWidth: number;
  containerHeight: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Stable screen-space card anchored to a geographic marker. */
export function MapRestaurantPopup({
  restaurant,
  point,
  view,
  containerWidth,
  containerHeight,
}: MapRestaurantPopupProps) {
  const renderedScale = Math.min(
    containerWidth / VIEWBOX_WIDTH,
    containerHeight / VIEWBOX_HEIGHT,
  );
  const renderedWidth = VIEWBOX_WIDTH * renderedScale;
  const renderedHeight = VIEWBOX_HEIGHT * renderedScale;
  const mapOffsetX = (containerWidth - renderedWidth) / 2;
  const mapOffsetY = (containerHeight - renderedHeight) / 2;
  const markerX = mapOffsetX + (point.x * view.k + view.x) * renderedScale;
  const markerY = mapOffsetY + (point.y * view.k + view.y) * renderedScale;
  const width = Math.min(
    PREFERRED_WIDTH,
    Math.max(MIN_WIDTH, containerWidth - EDGE_MARGIN * 2),
  );
  const left = clamp(
    markerX - width / 2,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, containerWidth - width - EDGE_MARGIN),
  );
  const above = markerY - POPUP_HEIGHT - POPUP_GAP;
  const top = above >= EDGE_MARGIN
    ? above
    : clamp(
        markerY + POPUP_GAP,
        EDGE_MARGIN,
        Math.max(EDGE_MARGIN, containerHeight - POPUP_HEIGHT - EDGE_MARGIN),
      );
  const caretLeft = clamp(markerX - left, 18, width - 18);
  const caretAbove = top < markerY;

  const localName = restaurant.name_ja ?? restaurant.name_en ?? "Unnamed restaurant";
  const englishName = restaurant.name_en && restaurant.name_en !== localName
    ? restaurant.name_en
    : null;
  const metadata = [restaurant.category, restaurant.neighborhood ?? restaurant.discovery_area]
    .map((value) => value?.trim())
    .filter(
      (value, index, values): value is string =>
        Boolean(value) && values.indexOf(value) === index,
    )
    .join(" · ");
  const score = restaurant.fiyu_score === null ? null : (restaurant.fiyu_score / 10).toFixed(1);

  return (
    <div
      data-layer="restaurant-popup"
      data-place-id={restaurant.place_id}
      data-visited={restaurant.is_visited ? "true" : "false"}
      className={cn(
        "pointer-events-auto absolute z-30 flex h-[10.75rem] min-w-0 flex-col rounded-lg border bg-surface px-4 py-3.5 shadow-md",
        restaurant.is_visited ? "border-gold/45" : "border-line",
      )}
      style={{ left, top, width }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span
        aria-hidden="true"
        className={
          caretAbove
            ? "absolute top-full size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-line bg-surface"
            : "absolute bottom-full size-3 -translate-x-1/2 translate-y-1/2 rotate-45 border-t border-l border-line bg-surface"
        }
        style={{ left: caretLeft }}
      />
      <p className="line-clamp-2 min-w-0 break-words text-base leading-snug font-semibold text-ink">
        {localName}
      </p>
      {englishName && (
        <p className="mt-1 line-clamp-2 min-w-0 break-words text-[0.8125rem] leading-snug text-ink-muted">
          {englishName}
        </p>
      )}
      {metadata && (
        <p className="mt-2 truncate text-xs text-ink-muted">{metadata}</p>
      )}
      {score && (
        <div
          data-testid="map-popup-score"
          className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-1.5"
        >
          <span className="text-[0.6875rem] font-medium tracking-wide text-ink-muted">
            Fiyu Score
          </span>
          <span className="text-lg leading-none font-semibold text-lavender-700">{score}</span>
        </div>
      )}
      <Link
        href={restaurantDetailHref(restaurant.place_id)}
        className="mt-auto inline-flex min-h-7 w-fit items-center whitespace-nowrap text-xs font-medium text-lavender-700 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-700"
      >
        View restaurant →
      </Link>
    </div>
  );
}
