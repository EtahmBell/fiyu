"use client";

import type { MappableRestaurant } from "@/lib/geo/mappable";
import type { MarkerCluster } from "@/lib/map/clustering";
import { resolveNames } from "@/lib/format/language";
import { isApproximateLocation, locationLabel } from "@/lib/geo/precision";
import { svgNumber } from "@/lib/map/projection";
import { cn } from "@/lib/utils/cn";

/**
 * Restaurant pins and cluster bubbles.
 *
 * Sizes are divided by the current scale so a marker keeps a constant apparent
 * size and a constant touch target at every zoom level.
 *
 * Deliberately not a red teardrop pin: a cream disc with a lavender ring reads
 * as Fiyu's own mark rather than a generic map POI. Selection fills with deep
 * plum and adds a restrained halo, matching the selected card so the two
 * surfaces read as one state.
 *
 * An approximately-located restaurant gets a different FORM, not just a
 * different colour: a larger dashed ring with a translucent wash and no solid
 * centre. The solid centre is precisely what makes the exact pin read as "the
 * door is here", so an area anchor must not have one. Colour alone would fail
 * for anyone who cannot distinguish it.
 */

/** Visual radius at k = 1, in viewBox units. */
const MARKER_RADIUS = 11;
/** Invisible hit area. Larger than the visual mark so touch targets clear 44px. */
const HIT_RADIUS = 22;
const CLUSTER_RADIUS = 17;
/** Area anchors read as an extent, so they are drawn wider than an exact pin. */
const APPROXIMATE_RADIUS = 16;

export interface MapMarkersProps {
  clusters: MarkerCluster<MappableRestaurant>[];
  selectedPlaceId: string | null;
  scale: number;
  onSelect: (restaurant: MappableRestaurant) => void;
  onExpandCluster: (cluster: MarkerCluster<MappableRestaurant>) => void;
}

export function MapMarkers({
  clusters,
  selectedPlaceId,
  scale,
  onSelect,
  onExpandCluster,
}: MapMarkersProps) {
  // Rounded so the rendered attribute string is engine-independent; cluster
  // points arrive already rounded. See svgNumber() in lib/map/projection.ts.
  const size = (value: number) => svgNumber(value / scale);

  return (
    <g>
      {clusters.map((cluster) => {
        const { x, y } = cluster.point;

        if (cluster.members.length > 1) {
          const count = cluster.members.length;
          // A mixed cluster must not imply every member is precisely located.
          const anyApproximate = cluster.members.some((member) =>
            isApproximateLocation(member.item),
          );
          return (
            <g
              key={cluster.id}
              role="button"
              tabIndex={0}
              aria-label={
                anyApproximate
                  ? `${count} restaurants in this area. Includes approximate locations. Activate to zoom in.`
                  : `${count} restaurants in this area. Activate to zoom in.`
              }
              className="cursor-pointer focus:outline-none [&:focus-visible>circle:first-child]:opacity-100"
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
        const approximate = isApproximateLocation(restaurant);
        const precisionNote = locationLabel(restaurant);

        if (approximate) {
          return (
            <g
              key={cluster.id}
              role="button"
              tabIndex={0}
              aria-label={precisionNote === null ? label : `${label}. ${precisionNote}`}
              aria-pressed={selected}
              data-place-id={restaurant.place_id}
              data-location-approximate="true"
              className={cn(
                "cursor-pointer focus:outline-none",
                "[&:focus-visible>circle:first-child]:opacity-100",
                "[&:hover>circle:first-child]:opacity-60",
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
                r={size(APPROXIMATE_RADIUS + 7)}
                fill="var(--map-marker-approximate)"
                opacity={selected ? 0.28 : 0}
                className="transition-opacity duration-[180ms] ease-(--ease-fiyu)"
              />
              <circle cx={x} cy={y} r={size(HIT_RADIUS)} fill="transparent" />
              {/* Wash plus dashed edge: an extent, with no point to misread. */}
              <circle
                cx={x}
                cy={y}
                r={size(selected ? APPROXIMATE_RADIUS + 1.5 : APPROXIMATE_RADIUS)}
                fill="var(--map-marker-approximate)"
                fillOpacity={selected ? 0.32 : 0.18}
                stroke="var(--map-marker-approximate)"
                strokeWidth={size(2)}
                strokeDasharray={`${size(4)} ${size(3)}`}
                className="transition-all duration-[180ms] ease-(--ease-fiyu)"
              />
              {/* Said out loud, not only to assistive tech -- but only when
                  selected, so the default view stays legible. */}
              {selected && precisionNote !== null && (
                <text
                  x={x}
                  y={svgNumber(y + (APPROXIMATE_RADIUS + 13) / scale)}
                  textAnchor="middle"
                  fill="var(--map-label)"
                  fontSize={size(11)}
                  className="pointer-events-none select-none"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {precisionNote}
                </text>
              )}
              <title>{precisionNote === null ? label : `${label} — ${precisionNote}`}</title>
            </g>
          );
        }

        return (
          <g
            key={cluster.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            data-place-id={restaurant.place_id}
            className={cn(
              "cursor-pointer focus:outline-none",
              "[&:focus-visible>circle:first-child]:opacity-100",
              "[&:hover>circle:first-child]:opacity-60",
            )}
            onClick={() => onSelect(restaurant)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(restaurant);
              }
            }}
          >
            {/* Halo: hover, focus and selection all surface through this. */}
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
          </g>
        );
      })}
    </g>
  );
}
