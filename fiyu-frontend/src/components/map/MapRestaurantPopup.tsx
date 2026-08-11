"use client";

import Link from "next/link";

import type { MappableRestaurant } from "@/lib/geo/mappable";
import type { Point } from "@/lib/map/projection";
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH, svgNumber } from "@/lib/map/projection";
import type { MapView } from "@/lib/map/viewport";
import { restaurantDetailHref } from "@/lib/navigation/restaurantDetail";

const POPUP_WIDTH = 190;
const POPUP_HEIGHT = 104;
const POPUP_GAP = 20;
const EDGE_MARGIN = 12;

interface MapRestaurantPopupProps {
  restaurant: MappableRestaurant;
  point: Point;
  view: MapView;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Compact identification label used only when its parent map opts into it. */
export function MapRestaurantPopup({ restaurant, point, view }: MapRestaurantPopupProps) {
  const screenX = point.x * view.k + view.x;
  const screenY = point.y * view.k + view.y;
  const screenLeft = clamp(
    screenX - POPUP_WIDTH / 2,
    EDGE_MARGIN,
    VIEWBOX_WIDTH - POPUP_WIDTH - EDGE_MARGIN,
  );
  const above = screenY - POPUP_HEIGHT - POPUP_GAP;
  const screenTop =
    above >= EDGE_MARGIN
      ? above
      : clamp(
          screenY + POPUP_GAP,
          EDGE_MARGIN,
          VIEWBOX_HEIGHT - POPUP_HEIGHT - EDGE_MARGIN,
        );

  const x = svgNumber((screenLeft - view.x) / view.k);
  const y = svgNumber((screenTop - view.y) / view.k);
  const width = svgNumber(POPUP_WIDTH / view.k);
  const height = svgNumber(POPUP_HEIGHT / view.k);

  const localName = restaurant.name_ja ?? restaurant.name_en ?? "Unnamed restaurant";
  const englishName = restaurant.name_en && restaurant.name_en !== localName
    ? restaurant.name_en
    : null;

  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height}
      data-layer="restaurant-popup"
      data-place-id={restaurant.place_id}
      className="overflow-visible"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="flex h-full flex-col justify-center rounded-md border border-line bg-surface px-3.5 py-3 shadow-sm"
      >
        <p className="truncate font-display text-[0.95rem] leading-tight text-ink">{localName}</p>
        {englishName && (
          <p className="mt-1 truncate text-[0.7rem] leading-tight text-ink-muted">{englishName}</p>
        )}
        <Link
          href={restaurantDetailHref(restaurant.place_id)}
          className="mt-2 inline-flex min-h-6 w-fit items-center text-xs font-medium text-lavender-700 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-700"
        >
          View →
        </Link>
      </div>
    </foreignObject>
  );
}
