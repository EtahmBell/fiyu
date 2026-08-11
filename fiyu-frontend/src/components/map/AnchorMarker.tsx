"use client";

import { type DiscoveryAnchor, anchorLabel } from "@/lib/location/anchor";
import { metersToViewBoxUnits, project, roundPoint, svgNumber } from "@/lib/map/projection";

export interface AnchorMarkerProps {
  anchor: DiscoveryAnchor;
  scale: number;
  /** Accuracy ring, drawn only for a current-location fix. */
  showAccuracy?: boolean;
}

/** Visual radius at k = 1, in viewBox units. */
const RADIUS = 9;

/**
 * The user's starting point on the map.
 *
 * Visually distinct from restaurant markers in both colour and shape: a deep
 * violet disc with a cream core, versus lavender restaurant pins. Someone
 * glancing at the map must never confuse where they are with somewhere to eat.
 *
 * A current-location fix also draws its accuracy radius to scale, so a poor fix
 * visibly looks poor rather than claiming a precision it does not have.
 */
export function AnchorMarker({ anchor, scale, showAccuracy = true }: AnchorMarkerProps) {
  const { x, y } = roundPoint(project(anchor.point));
  const size = (value: number) => svgNumber(value / scale);

  const accuracyRadius =
    showAccuracy && anchor.kind === "current-location" && anchor.accuracyMeters !== null
      ? svgNumber(metersToViewBoxUnits(anchor.accuracyMeters, anchor.point.lat))
      : null;

  return (
    <g
      aria-hidden="true"
      className="pointer-events-none"
      data-layer="discovery-location"
      data-location-kind={anchor.kind}
    >
      {accuracyRadius !== null && accuracyRadius > 1 && (
        <circle
          cx={x}
          cy={y}
          r={accuracyRadius}
          fill="var(--map-user-marker)"
          opacity={0.12}
          stroke="var(--map-user-marker)"
          strokeOpacity={0.3}
          strokeWidth={size(1)}
        />
      )}

      <circle
        cx={x}
        cy={y}
        r={size(RADIUS + 5)}
        fill="var(--map-user-marker)"
        opacity={0.2}
        className="transition-all duration-[180ms] ease-(--ease-fiyu)"
      />
      <circle
        cx={x}
        cy={y}
        r={size(RADIUS)}
        fill="var(--map-user-marker)"
        stroke="var(--map-marker-center)"
        strokeWidth={size(3)}
        className="transition-all duration-[180ms] ease-(--ease-fiyu)"
      />
      <title>{anchorLabel(anchor)}</title>
    </g>
  );
}
