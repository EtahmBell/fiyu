import { memo } from "react";

import { type DetailLevel, isVisibleAt } from "@/lib/map/detail";
import {
  PARK_PATH,
  RAIL_SUBWAY_PATH,
  RAIL_SURFACE_PATH,
  ROAD_MAJOR_PATH,
  ROAD_SECONDARY_PATH,
  WARD_PATH,
  WATER_PATH,
  WATERWAY_PATH,
} from "@/lib/map/geography";
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH, toPath } from "@/lib/map/projection";
import { TOKYO_BAY } from "@/lib/map/basemap";

/**
 * The illustrated base map: water, green space, ward context, roads and rail.
 *
 * Every path comes from lib/map/geography, which projects the OpenStreetMap
 * layers in lib/map/generated once at module scope. Nothing is projected during
 * render, and nothing is authored in pixel coordinates.
 *
 * TWO THINGS MAKE THIS PERFORM
 *
 * 1. It depends on `detail` -- an integer 1-3 -- and not on the raw map scale.
 *    Panning cannot change it and zooming changes it at most twice across the
 *    whole range, so React reconciles these thousands of paths a handful of times
 *    per session instead of every frame.
 *
 * 2. Stroke widths use `vector-effect="non-scaling-stroke"`. The browser keeps
 *    them visually constant under the parent transform, so there is no
 *    scale-derived arithmetic anywhere in this file. Widths below are therefore
 *    in CSS pixels, not viewBox units.
 *
 * Together with the memo() wrapper, that is what keeps restaurant-pin
 * interaction smooth while the geography sits underneath it.
 *
 * VISUAL INTENT. This is a boutique food-map illustration, not a GIS product.
 * Roads are close to the land tone -- present enough to orient by, quiet enough
 * that a lavender restaurant pin is always the most salient thing on screen.
 * Nothing here is a navigation aid.
 */

export interface MapBaseProps {
  /** Current detail level. See lib/map/detail.ts. */
  detail: DetailLevel;
}

/**
 * Hand-authored bay fill, kept from the original illustration.
 *
 * The generated water layer covers rivers, docks and inland water accurately, but
 * OSM models the open bay as coastline rather than as a polygon, so a filled bay
 * has to be closed off against the map edge by hand. This is the one piece of
 * geography Fiyu draws itself, and it is a stylised fill rather than a shoreline
 * survey.
 */
const BAY_PATH = toPath(TOKYO_BAY.coordinates, true);

function MapBaseComponent({ detail }: MapBaseProps) {
  return (
    <g aria-hidden="true" className="pointer-events-none">
      {/* Land. Everything else sits on top. */}
      <rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="var(--map-land)" />

      {/* Ward outlines, as a soft wash so the city reads as districts. */}
      <path
        d={WARD_PATH}
        data-layer="wards"
        fill="none"
        stroke="var(--map-boundary)"
        strokeWidth={0.75}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.55}
      />

      {/* Green space, beneath the water so riverside parks read correctly. */}
      <path d={PARK_PATH} data-layer="parks" fill="var(--map-park)" fillRule="evenodd" />

      {/* Open bay, then accurate inland water on top of it. */}
      <path d={BAY_PATH} data-layer="bay" fill="var(--map-water)" />
      <path d={WATER_PATH} data-layer="water" fill="var(--map-water)" fillRule="evenodd" />

      {/* Rivers and canals as lines: the Sumida is a major orientation cue. */}
      <path
        d={WATERWAY_PATH}
        data-layer="waterways"
        fill="none"
        stroke="var(--map-water)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/*
        Roads. Secondary appears only once the map is zoomed, and is drawn first
        so major roads sit on top of it at every level.
      */}
      {isVisibleAt(2, detail) && (
        <path
          d={ROAD_SECONDARY_PATH}
          data-layer="roads-secondary"
          fill="none"
          stroke="var(--map-road-minor)"
          strokeWidth={0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <path
        d={ROAD_MAJOR_PATH}
        data-layer="roads-major"
        fill="none"
        stroke="var(--map-road-major)"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/*
        Rail. Dashed so it never reads as a road, and in the lavender family so it
        ties to the brand rather than to a transit-map convention.
      */}
      <path
        d={RAIL_SURFACE_PATH}
        data-layer="rail-surface"
        fill="none"
        stroke="var(--map-rail)"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />

      {isVisibleAt(2, detail) && (
        <path
          d={RAIL_SUBWAY_PATH}
          data-layer="rail-subway"
          fill="none"
          stroke="var(--map-rail-subway)"
          strokeWidth={1}
          strokeLinejoin="round"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
          opacity={0.8}
        />
      )}

      {/*
        Text lives in MapLabels, not here.

        `vector-effect` keeps a STROKE visually constant under the transform but
        does nothing for `font-size`, so text has to divide by the scale to stay
        readable. Keeping it out of this file is what lets the geography memoise on
        `detail` alone -- and there are only a few dozen labels, so a
        scale-dependent layer for them is cheap.
      */}
    </g>
  );
}

/**
 * Memoised on `detail` alone.
 *
 * The props are a single integer, so the default shallow comparison is exactly
 * right: pan and zoom churn cannot reach this subtree, and a selection change on
 * a restaurant pin cannot either.
 */
export const MapBase = memo(MapBaseComponent);
