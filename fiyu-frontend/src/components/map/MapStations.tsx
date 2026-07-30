"use client";

import { memo } from "react";

import { type DetailLevel, isVisibleAt } from "@/lib/map/detail";
import { STATIONS, type StationPoint } from "@/lib/map/geography";
import { svgNumber } from "@/lib/map/projection";

/**
 * Rail stations.
 *
 * Positions and names come from OpenStreetMap via lib/map/generated; which
 * stations carry a label, and at what zoom, is the editorial call in
 * lib/map/landmarks.ts.
 *
 * WHY THESE ARE NOT RESTAURANT MARKERS. A station is context, not a Fiyu record.
 * It carries no `data-place-id`, is not derived from the catalog, and cannot be
 * selected -- clicking one does nothing at all. Only the tooltip responds, on
 * hover and focus. That separation is asserted in the tests: a station must never
 * be mistakable for something you can eat at.
 *
 * POINTER EVENTS. The whole layer is `pointer-events: none` and only the small
 * focusable node re-enables them. A station therefore cannot swallow a click
 * aimed at a restaurant pin, and restaurant markers are rendered after this layer
 * so they always sit on top.
 *
 * A station node is a ring, not a disc: restaurant pins are filled discs, and the
 * two must never be confusable at a glance.
 *
 * DELIBERATELY NOT TAB STOPS. There are hundreds of stations at close zoom, and a
 * station has no action to perform. Making each one focusable would put hundreds
 * of inert stops between a keyboard user and the four restaurants they came for --
 * worse accessibility, not better, however it scores on a checklist. Named
 * stations are still announced (see StationMark) and every station has a hover
 * tooltip. Landmarks are few enough to be focusable, and are.
 */

export interface MapStationsProps {
  scale: number;
  detail: DetailLevel;
}

/** Visual radius in viewBox units at k = 1. Smaller than a restaurant pin. */
const NODE_RADIUS = 4.5;
const MAJOR_NODE_RADIUS = 5.5;

function StationMark({ station, scale }: { station: StationPoint; scale: number }) {
  const size = (value: number) => svgNumber(value / scale);
  const major = station.minDetail === 1;
  const radius = size(major ? MAJOR_NODE_RADIUS : NODE_RADIUS);

  /*
   * Only NAMED stations are exposed to assistive technology.
   *
   * At the closest zoom this layer draws over 700 stations. Announcing every one
   * as an image would bury the four restaurants in seven hundred pieces of
   * background furniture -- and it measurably slows any accessible-name query,
   * which is how this was noticed: a test that computes accessible names went from
   * milliseconds to seconds.
   *
   * So the rule follows the visual one. If a station is prominent enough to carry
   * a label on the map, it is prominent enough to announce. If it is unnamed
   * context, it is decorative, and it still gets a `<title>` for hover.
   */
  return (
    <g aria-hidden={station.labelled ? undefined : "true"}>
      <circle
        cx={station.x}
        cy={station.y}
        r={radius}
        fill="var(--map-station-fill)"
        stroke="var(--map-station-stroke)"
        strokeWidth={size(major ? 2 : 1.5)}
        // Re-enabled only here, so the tooltip works without the layer becoming
        // a click target across its whole bounding box.
        className="pointer-events-auto"
        role={station.labelled ? "img" : undefined}
        aria-label={station.labelled ? `${station.label ?? station.name} station` : undefined}
      >
        <title>{station.label ? `${station.label} — ${station.name}` : station.name}</title>
      </circle>

      {station.labelled && station.label !== null && (
        <text
          x={station.x}
          // Above the node, so a label never sits directly under its own mark.
          y={svgNumber(station.y - (major ? MAJOR_NODE_RADIUS + 5 : NODE_RADIUS + 4) / scale)}
          textAnchor="middle"
          fill="var(--map-label)"
          fontSize={size(major ? 11.5 : 10)}
          fontWeight={major ? 500 : 400}
          className="pointer-events-none select-none"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {station.label}
        </text>
      )}
    </g>
  );
}

function MapStationsComponent({ scale, detail }: MapStationsProps) {
  /*
   * STATIONS is pre-sorted by prominence in lib/map/geography, so this filter
   * keeps that order: major interchanges are emitted first and therefore paint
   * under nothing that matters. There is no label-collision solver -- the tiering
   * in landmarks.ts is the collision strategy, by keeping the labelled set small
   * enough at each level that overlap stays rare.
   */
  const visible = STATIONS.filter((station) => isVisibleAt(station.minDetail, detail));

  return (
    <g className="pointer-events-none" data-layer="stations">
      {visible.map((station) => (
        <StationMark key={station.id} station={station} scale={scale} />
      ))}
    </g>
  );
}

export const MapStations = memo(MapStationsComponent);
