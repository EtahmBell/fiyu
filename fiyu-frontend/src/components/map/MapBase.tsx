import { AREA_LABELS, PARKS, RIVERS, TOKYO_BAY, YAMANOTE_LINE } from "@/lib/map/basemap";
import {
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  project,
  roundPoint,
  svgNumber,
  toPath,
} from "@/lib/map/projection";

/**
 * The illustrated base map.
 *
 * Water, rivers, parks, the Yamanote loop and a sparse set of ward labels --
 * nothing else. No roads, no business POIs, no tourist illustrations. Every
 * shape is projected from real coordinates by the same function that positions
 * the markers.
 *
 * Stroke widths are divided by the current scale so lines keep a constant
 * apparent weight as the map zooms; without that, the Yamanote line would grow
 * into a thick band at 4x.
 *
 * Every number here goes through svgNumber/roundPoint. The ward labels are where
 * the projection's cross-engine float divergence was first observed as a
 * hydration mismatch -- see svgNumber() in lib/map/projection.ts.
 */
export interface MapBaseProps {
  /** Current map scale, used to keep stroke weights visually constant. */
  scale: number;
}

export function MapBase({ scale }: MapBaseProps) {
  const stroke = (width: number) => svgNumber(width / scale);

  return (
    <g aria-hidden="true">
      {/* Land. Everything else is drawn on top of this. */}
      <rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="var(--map-land)" />

      <path d={toPath(TOKYO_BAY.coordinates, true)} fill="var(--map-water)" />

      {PARKS.map((park) => (
        <path key={park.id} d={toPath(park.coordinates, true)} fill="var(--map-park)" />
      ))}

      {RIVERS.map((river) => (
        <path
          key={river.id}
          d={toPath(river.coordinates)}
          fill="none"
          stroke="var(--map-water)"
          strokeWidth={stroke(7)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Yamanote loop: the primary orientation landmark. */}
      <path
        d={toPath(YAMANOTE_LINE.coordinates, true)}
        fill="none"
        stroke="var(--map-rail)"
        strokeWidth={stroke(2.5)}
        strokeLinejoin="round"
      />

      {AREA_LABELS.map((label) => {
        const { x, y } = roundPoint(project(label.at));
        const primary = label.emphasis === "primary";
        return (
          <text
            key={label.id}
            x={x}
            y={y}
            textAnchor="middle"
            className="select-none"
            fill={primary ? "var(--map-label)" : "var(--map-label-muted)"}
            fontSize={svgNumber((primary ? 15 : 13) / scale)}
            letterSpacing={svgNumber(1.2 / scale)}
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {label.text}
          </text>
        );
      })}
    </g>
  );
}
