"use client";

import { resolveNames } from "@/lib/format/language";
import type { MappableRestaurant } from "@/lib/geo/mappable";
import type { MarkerCluster } from "@/lib/map/clustering";
import { svgNumber } from "@/lib/map/projection";
import { cn } from "@/lib/utils/cn";

/** Visual radius at k = 1, in viewBox units. */
const MARKER_RADIUS = 11;
/** Invisible hit area. Larger than the visual mark so touch targets clear 44px. */
const HIT_RADIUS = 22;
const CLUSTER_RADIUS = 17;

export interface MapMarkersProps {
  clusters: MarkerCluster<MappableRestaurant>[];
  selectedPlaceId: string | null;
  newlyRevealedPlaceIds: ReadonlySet<string>;
  scale: number;
  onSelect: (restaurant: MappableRestaurant) => void;
  onExpandCluster: (cluster: MarkerCluster<MappableRestaurant>) => void;
}

/**
 * Restaurant pins and cluster bubbles.
 *
 * The map is an orientation surface, not a directions product. Every eligible
 * restaurant therefore uses the same Fiyu pin at the representative point the
 * backend supplied. This component never fabricates, shifts, or recentres a
 * coordinate; approximate area geometry remains a backend provenance concern.
 */
export function MapMarkers({
  clusters,
  selectedPlaceId,
  newlyRevealedPlaceIds,
  scale,
  onSelect,
  onExpandCluster,
}: MapMarkersProps) {
  const size = (value: number) => svgNumber(value / scale);

  return (
    <g>
      {clusters.map((cluster) => {
        const { x, y } = cluster.point;
        const newlyRevealed = cluster.members.some((member) =>
          newlyRevealedPlaceIds.has(member.item.place_id),
        );

        if (cluster.members.length > 1) {
          const count = cluster.members.length;
          return (
            <g
              key={cluster.id}
              role="button"
              tabIndex={0}
              aria-label={`${count} restaurants in this area. Activate to zoom in.`}
              data-newly-revealed={newlyRevealed ? "true" : undefined}
              className={cn(
                "cursor-pointer focus:outline-none [&:focus-visible>circle:first-child]:opacity-100",
                newlyRevealed && "fiyu-map-pin-sprout",
              )}
              onClick={() => onExpandCluster(cluster)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onExpandCluster(cluster);
                }
              }}
            >
              <circle
                cx={x}
                cy={y}
                r={size(CLUSTER_RADIUS + 6)}
                fill="var(--map-marker)"
                opacity={0}
                className="transition-opacity duration-[180ms]"
              />
              <circle cx={x} cy={y} r={size(HIT_RADIUS)} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={size(CLUSTER_RADIUS)}
                fill="var(--map-marker)"
                stroke="var(--map-marker-center)"
                strokeWidth={size(2)}
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--map-marker-center)"
                fontSize={size(13)}
                className="pointer-events-none select-none font-medium"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {count}
              </text>
            </g>
          );
        }

        const restaurant = cluster.members[0].item;
        const selected = restaurant.place_id === selectedPlaceId;
        const label = resolveNames(restaurant).primary?.text ?? "Unnamed restaurant";

        return (
          <g
            key={cluster.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            data-place-id={restaurant.place_id}
            data-newly-revealed={newlyRevealed ? "true" : undefined}
            className={cn(
              "cursor-pointer focus:outline-none",
              "[&:focus-visible>circle:first-child]:opacity-100",
              "[&:hover>circle:first-child]:opacity-60",
              newlyRevealed && "fiyu-map-pin-sprout",
            )}
            onClick={() => onSelect(restaurant)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(restaurant);
              }
            }}
          >
            <circle
              cx={x}
              cy={y}
              r={size(MARKER_RADIUS + 7)}
              fill="var(--map-marker)"
              opacity={selected ? 0.28 : 0}
              className="transition-opacity duration-[180ms] ease-(--ease-fiyu)"
            />
            <circle cx={x} cy={y} r={size(HIT_RADIUS)} fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={size(selected ? MARKER_RADIUS + 1.5 : MARKER_RADIUS)}
              fill={selected ? "var(--map-marker-selected)" : "var(--map-marker-center)"}
              stroke={selected ? "var(--map-marker-selected)" : "var(--map-marker)"}
              strokeWidth={size(3)}
              className="transition-all duration-[180ms] ease-(--ease-fiyu)"
            />
            {selected && (
              <circle
                cx={x}
                cy={y}
                r={size(3.5)}
                fill="var(--map-marker-center)"
                className="transition-all duration-[180ms] ease-(--ease-fiyu)"
              />
            )}
            <title>{label}</title>
          </g>
        );
      })}
    </g>
  );
}
