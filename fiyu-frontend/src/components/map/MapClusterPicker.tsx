"use client";

import { resolveNames } from "@/lib/format/language";
import type { MappableRestaurant } from "@/lib/geo/mappable";

export interface MapClusterPickerProps {
  restaurants: MappableRestaurant[];
  onSelect: (restaurant: MappableRestaurant) => void;
  onClose: () => void;
}

/** Compact fallback for restaurants whose persisted display points coincide. */
export function MapClusterPicker({
  restaurants,
  onSelect,
  onClose,
}: MapClusterPickerProps) {
  return (
    <section
      aria-label="Restaurants at this location"
      data-testid="map-cluster-picker"
      className="absolute bottom-4 left-1/2 z-30 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-card border border-line bg-surface/98 p-3 shadow-[0_12px_30px_-20px_rgba(49,40,61,0.5)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="font-display text-lg text-ink">Restaurants here</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close restaurant list"
          className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <ul className="divide-y divide-line">
        {restaurants.map((restaurant) => {
          const names = resolveNames(restaurant);
          return (
            <li key={restaurant.place_id}>
              <button
                type="button"
                onClick={() => onSelect(restaurant)}
                className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 py-2 text-left hover:text-plum focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lavender-600"
              >
                <span className="min-w-0">
                  <span
                    lang={names.primary?.lang}
                    className="block truncate text-sm font-medium text-ink"
                  >
                    {names.primary?.text ?? "Unnamed restaurant"}
                  </span>
                  {names.secondary && (
                    <span
                      lang={names.secondary.lang}
                      className="mt-0.5 block truncate text-xs text-ink-muted"
                    >
                      {names.secondary.text}
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className="shrink-0 text-sm text-lavender-700">→</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
