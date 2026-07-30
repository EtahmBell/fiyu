"use client";

import { memo } from "react";

import { type DetailLevel, isVisibleAt } from "@/lib/map/detail";
import { type Landmark, type LandmarkGlyph, LANDMARKS } from "@/lib/map/landmarks";
import { project, roundPoint, svgNumber } from "@/lib/map/projection";

/**
 * Orientation landmarks.
 *
 * A small set of recognisable places, drawn as line pictograms. They answer
 * "roughly where am I" and nothing more.
 *
 * WHY PICTOGRAMS AND NOT ILLUSTRATIONS. A detailed Skytree drawing would need to
 * be large to read, and anything large enough to read competes with the restaurant
 * pins. These are ~20px stroke icons: legible at a glance, invisible the moment
 * you stop looking for them. Inline SVG rather than emoji or icon files, so they
 * inherit the palette and need no network request.
 *
 * NOT RESTAURANT MARKERS. A landmark carries no `data-place-id`, is not derived
 * from the catalog, and cannot be selected. The layer is `pointer-events: none`
 * with only the icon re-enabling them for its tooltip, so a landmark can never
 * intercept a click meant for a pin.
 *
 * Positions are real OpenStreetMap coordinates; the selection of which places earn
 * an icon is editorial. See lib/map/landmarks.ts.
 */

export interface MapLandmarksProps {
  scale: number;
  detail: DetailLevel;
}

/**
 * Rendered icon size in viewBox units at k = 1.
 *
 * Divided by the scale below so the apparent size stays constant as the map zooms
 * -- one viewBox unit is roughly one CSS pixel on a full-width map, so this is
 * about 20px, at the top of the 18-22px range these icons are drawn for.
 */
const ICON_SIZE = 20;

/**
 * The pictogram vocabulary, each drawn on a normalised 24x24 grid.
 *
 * RULES, and the reason for each:
 *  - Strokes only, no filled shapes. The predecessor of this file set
 *    `vector-effect="non-scaling-stroke"` on a wrapper `<g>` and a stroke width in
 *    parent units. `vector-effect` is NOT an inherited SVG property, so it never
 *    reached the `<path>`, which then scaled its 1.4-unit stroke by the group's
 *    ~11x transform -- a 15-unit stroke on a 21-unit glyph, i.e. a solid blob.
 *    Keeping the geometry inside a nested `<svg viewBox="0 0 24 24">` removes the
 *    problem at the root: stroke width is expressed in icon units and scales with
 *    the icon, so no vector-effect is needed at all.
 *  - `currentColor`, so one `color` on the wrapper themes every icon.
 *  - Recognisable silhouette cues, not likenesses.
 */
function GlyphPath({ glyph }: { glyph: LandmarkGlyph }) {
  switch (glyph) {
    case "palace":
      // Walled gate above a moat.
      return (
        <>
          <path d="M4 18.5V11.5h16v7" />
          <path d="M10.25 18.5V14.5h3.5v4" />
          <path d="M2.5 21.5h19" />
        </>
      );
    case "tower":
      // Lattice tower: splayed legs, cross-brace, mast.
      return (
        <>
          <path d="M12 2.5V6" />
          <path d="M6 19.5 12 6l6 13.5" />
          <path d="M8.7 13.5h6.6" />
          <path d="M4.5 19.5h15" />
        </>
      );
    case "skytree":
      // A single tall spire with two collars -- taller and thinner than the tower.
      return (
        <>
          <path d="M12 2v18" />
          <path d="M10 7.5h4" />
          <path d="M9 13h6" />
          <path d="M9.5 20h5" />
        </>
      );
    case "shrine":
      // Torii: two lintels over two posts.
      return (
        <>
          <path d="M3 7h18" />
          <path d="M5 10.5h14" />
          <path d="M7.5 7v13" />
          <path d="M16.5 7v13" />
        </>
      );
    case "temple":
      // Pagoda: two sweeping eaves over a body.
      return (
        <>
          <path d="M4 9.5q8-5 16 0" />
          <path d="M6.5 15q5.5-3.5 11 0" />
          <path d="M9.5 15v5" />
          <path d="M14.5 15v5" />
          <path d="M7 20h10" />
        </>
      );
    case "crossing":
      // Scramble crossing: stripes between two kerb lines.
      return (
        <>
          <path d="M4 10.5h16" />
          <path d="M4 20h16" />
          <path d="M7.5 20 10 10.5" />
          <path d="M12 20l2.5-9.5" />
          <path d="M16.5 20 19 10.5" />
        </>
      );
    case "station":
      // Civic facade: a pediment over columns.
      return (
        <>
          <path d="M3.5 10 12 5l8.5 5" />
          <path d="M7 10v9" />
          <path d="M12 10v9" />
          <path d="M17 10v9" />
          <path d="M4 19h16" />
        </>
      );
    case "civic":
      // Domed hall with wings -- distinct from the station facade.
      return (
        <>
          <path d="M12 3v3" />
          <path d="M8.5 11a3.5 3.5 0 0 1 7 0" />
          <path d="M5 19v-6h14v6" />
          <path d="M3.5 19h17" />
        </>
      );
  }
}

function LandmarkMark({ landmark, scale }: { landmark: Landmark; scale: number }) {
  const { x, y } = roundPoint(project(landmark.at));
  const size = svgNumber(ICON_SIZE / scale);
  const half = svgNumber(size / 2);
  const below = landmark.labelSide === "below";

  /*
   * A nested <svg> with its own viewBox is what normalises the icon grid: the
   * 24x24 drawing is mapped onto `size` units wherever the landmark sits, so the
   * paths never have to know about the map transform or the zoom.
   */
  return (
    <g>
      <svg
        x={svgNumber(x - half)}
        y={svgNumber(y - half)}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        overflow="visible"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        color="var(--map-landmark)"
        className="pointer-events-auto"
        tabIndex={0}
        role="img"
        aria-label={`${landmark.label} landmark`}
      >
        {/*
          One string, not `{a} — {b}`. React requires a single text child on
          <title>; three children are serialised differently on the server and
          during hydration, which is a hydration mismatch, not just a warning.
        */}
        <title>{`${landmark.label} — ${landmark.labelJa}`}</title>
        <GlyphPath glyph={landmark.glyph} />
      </svg>

      <text
        x={x}
        y={svgNumber(y + (below ? half + svgNumber(9 / scale) : -(half + svgNumber(4 / scale))))}
        textAnchor="middle"
        fill="var(--map-landmark)"
        fontSize={svgNumber(9.5 / scale)}
        letterSpacing={svgNumber(0.3 / scale)}
        className="pointer-events-none select-none"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {landmark.label}
      </text>
    </g>
  );
}

function MapLandmarksComponent({ scale, detail }: MapLandmarksProps) {
  const visible = LANDMARKS.filter((landmark) => isVisibleAt(landmark.minDetail, detail));

  return (
    <g className="pointer-events-none" data-layer="landmarks">
      {visible.map((landmark) => (
        <LandmarkMark key={landmark.id} landmark={landmark} scale={scale} />
      ))}
    </g>
  );
}

export const MapLandmarks = memo(MapLandmarksComponent);
