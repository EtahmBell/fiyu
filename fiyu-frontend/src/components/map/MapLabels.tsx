import { memo } from "react";

import { AREA_LABELS } from "@/lib/map/basemap";
import { type DetailLevel, isVisibleAt } from "@/lib/map/detail";
import { STATIONS } from "@/lib/map/geography";
import { PARK_LABELS } from "@/lib/map/landmarks";
import { project, roundPoint, svgNumber } from "@/lib/map/projection";

/**
 * Place-name text: wards and named green space.
 *
 * Separate from MapBase because text cannot use `vector-effect` -- `font-size`
 * has to be divided by the current scale to stay readable, which makes this the
 * one geography layer that must depend on the exact zoom. It stays cheap because
 * there are only a few dozen labels; the thousands of paths live in MapBase and
 * memoise on the detail level instead.
 *
 * LABEL HIERARCHY, coarsest first:
 *
 *   detail 1  ward names only -- the calm overview
 *   detail 2  wards recede, major park names appear
 *   detail 3  ward names give way entirely; stations and parks carry orientation
 *
 * Station labels are deliberately NOT here: they are drawn in MapStations, after
 * this layer, so a station name always paints over a ward or park name rather
 * than under it. That is the stated priority order.
 *
 * Everything is `pointer-events: none`. A place name must never intercept a click
 * meant for a restaurant pin.
 */

export interface MapLabelsProps {
  scale: number;
  detail: DetailLevel;
}

/**
 * Ward names that a station label already covers.
 *
 * Several Tokyo wards share a name with their main station -- Shinjuku, Shibuya,
 * Minato/Shinagawa -- and the ward centroid sits only a few hundred metres from
 * the concourse. Drawing both puts the same word on the map twice, a centimetre
 * apart, which reads as a bug rather than as two different things.
 *
 * The station wins: it is the more precise anchor, and it is the label people
 * actually navigate by. Computed once at module scope from the station tier list.
 */
const WARD_NAMES_COVERED_BY_A_STATION: ReadonlySet<string> = new Set(
  STATIONS.filter((station) => station.labelled && station.label !== null).map(
    (station) => station.label as string,
  ),
);

function MapLabelsComponent({ scale, detail }: MapLabelsProps) {
  const size = (value: number) => svgNumber(value / scale);

  return (
    <g aria-hidden="true" className="pointer-events-none select-none">
      {/*
        Ward names fade out as the map zooms in: at street detail they are
        redundant against station names and only add clutter.
      */}
      {detail < 3 &&
        AREA_LABELS.filter(
          (label) =>
            // A station of the same name is drawn after this layer and would
            // otherwise duplicate the word a few units away.
            !(
              WARD_NAMES_COVERED_BY_A_STATION.has(label.text) &&
              STATIONS.some(
                (station) => station.label === label.text && isVisibleAt(station.minDetail, detail),
              )
            ),
        ).map((label) => {
          const { x, y } = roundPoint(project(label.at));
          const primary = label.emphasis === "primary";
          return (
            <text
              key={label.id}
              x={x}
              y={y}
              textAnchor="middle"
              fill={primary ? "var(--map-label)" : "var(--map-label-muted)"}
              fontSize={size(primary ? 15 : 13)}
              letterSpacing={size(1.2)}
              // Recede once districts and stations take over the orientation job.
              opacity={detail === 1 ? 0.9 : 0.5}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {label.text}
            </text>
          );
        })}

      {/* Named gardens and parks. The polygons come from the generated layer. */}
      {PARK_LABELS.filter((label) => isVisibleAt(label.minDetail, detail)).map((label) => {
        const { x, y } = roundPoint(project(label.at));
        return (
          <text
            key={label.id}
            x={x}
            y={y}
            textAnchor="middle"
            fill="var(--map-label-park)"
            fontSize={size(10)}
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {label.label}
          </text>
        );
      })}
    </g>
  );
}

export const MapLabels = memo(MapLabelsComponent);
