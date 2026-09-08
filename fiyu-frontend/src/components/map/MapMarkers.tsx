"use client";

import { useEffect, useRef } from "react";

import { resolveNames } from "@/lib/format/language";
import type { MappableRestaurant } from "@/lib/geo/mappable";
import type { MarkerCluster } from "@/lib/map/clustering";
import { personalMapMarkerState } from "@/lib/map/personalMap";
import { svgNumber } from "@/lib/map/projection";
import { cn } from "@/lib/utils/cn";

/** Visual radius at k = 1, in viewBox units. */
const MARKER_RADIUS = 11;
/** Invisible hit area. Larger than the visual mark so touch targets clear 44px. */
const HIT_RADIUS = 22;
const CLUSTER_RADIUS = 17;

export interface MapMarkersProps {
  clusters: MarkerCluster<MappableRestaurant>[];
  activeCluster?: {
    cluster: MarkerCluster<MappableRestaurant>;
    phase: "expanding" | "handoff" | "settled";
    onHandoffComplete: () => void;
  } | null;
  selectedPlaceId: string | null;
  newlyRevealedPlaceIds: ReadonlySet<string>;
  /** Cluster leaves that should only fade in after camera settlement. */
  appearingPlaceIds: ReadonlySet<string>;
  scale: number;
  onSelect: (restaurant: MappableRestaurant) => void;
}

/**
 * Restaurant pins and cluster bubbles.
 *
 * The map is an orientation surface, not a directions product. Pin colour
 * distinguishes only current Picks from account-owned visit history. This
 * component never fabricates, shifts, or recentres a coordinate; approximate
 * area geometry remains a backend provenance concern.
 */
export function MapMarkers({
  clusters,
  activeCluster = null,
  selectedPlaceId,
  newlyRevealedPlaceIds,
  appearingPlaceIds,
  scale,
  onSelect,
}: MapMarkersProps) {
  const size = (value: number) => svgNumber(value / scale);
  const activeClusterGhostRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const ghost = activeClusterGhostRef.current;
    if (!ghost || activeCluster?.phase !== "handoff") return;
    const complete = () => activeCluster.onHandoffComplete();
    ghost.addEventListener("animationend", complete);
    return () => ghost.removeEventListener("animationend", complete);
  }, [activeCluster]);

  return (
    <g data-layer="restaurants">
      {activeCluster && activeCluster.phase !== "settled" && (
        <g
          ref={activeClusterGhostRef}
          aria-hidden="true"
          data-marker-kind="restaurant-cluster-ghost"
          data-place-ids={activeCluster.cluster.members.map((member) => member.id).join(",")}
          data-cluster-phase={activeCluster.phase}
          className={activeCluster.phase === "handoff" ? "fiyu-map-cluster-fade" : undefined}
        >
          <circle
            cx={activeCluster.cluster.point.x}
            cy={activeCluster.cluster.point.y}
            r={size(CLUSTER_RADIUS)}
            fill="var(--map-marker)"
            stroke="var(--map-marker-center)"
            strokeWidth={size(2)}
          />
          <text
            x={activeCluster.cluster.point.x}
            y={activeCluster.cluster.point.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--map-marker-center)"
            fontSize={size(13)}
            className="pointer-events-none select-none font-medium"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {activeCluster.cluster.members.length}
          </text>
        </g>
      )}
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
              aria-hidden="true"
              className={cn(newlyRevealed && "fiyu-map-pin-sprout")}
            >
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
        const markerState = personalMapMarkerState(restaurant);
        const visited = markerState === "visited";
        const savedOnly = markerState === "saved";
        const marker = visited ? "var(--map-marker-visited)" : "var(--map-marker)";
        const label = resolveNames(restaurant).primary?.text ?? "Unnamed restaurant";
        const appearing = appearingPlaceIds.has(restaurant.place_id);

        return (
          <g
            key={cluster.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            data-marker-kind="restaurant"
            data-place-id={restaurant.place_id}
            data-selected={selected ? "true" : "false"}
            data-visited={visited ? "true" : "false"}
            data-discovered={restaurant.is_discovered ? "true" : "false"}
            data-saved={restaurant.is_saved ? "true" : "false"}
            data-marker-state={markerState}
            data-newly-revealed={newlyRevealed ? "true" : undefined}
            data-cluster-appearing={appearing ? "true" : undefined}
            className={cn(
              "cursor-pointer focus:outline-none",
              "[&:focus-visible>circle:first-child]:opacity-100",
              "[&:hover>circle:first-child]:opacity-60",
              appearing ? "fiyu-map-pin-fade" : newlyRevealed && "fiyu-map-pin-sprout",
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
              fill={marker}
              opacity={selected ? 0.28 : 0}
              className="transition-opacity duration-[180ms] ease-(--ease-fiyu)"
            />
            <circle cx={x} cy={y} r={size(HIT_RADIUS)} fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={size(selected ? MARKER_RADIUS + 1.5 : MARKER_RADIUS)}
              fill={savedOnly ? "var(--map-bg)" : marker}
              stroke={savedOnly ? "var(--map-marker)" : "var(--map-marker-center)"}
              strokeWidth={size(selected ? 3 : savedOnly ? 3 : 2.5)}
              className="transition-[fill,stroke,stroke-width] duration-[180ms] ease-(--ease-fiyu)"
            />
            <title>{label}</title>
          </g>
        );
      })}
    </g>
  );
}
