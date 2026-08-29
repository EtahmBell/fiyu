import { cn } from "@/lib/utils/cn";

/**
 * Step 01 of "How Fiyu works": the location the flow begins from.
 *
 * Drawn rather than photographed, so it is first-party site UI that inherits the
 * palette and never has to be re-exported when a token moves.
 *
 * GEOMETRY
 *
 * The panel this sits in is a wide rectangle -- roughly 1.25 on a phone and 1.57
 * at desktop -- but the composition inside it is deliberately square, because the
 * subject is a radius and a radius is round. So the viewBox is a mild 4:3 and the
 * meaningful content is confined to a 300x300 core centred in it, at x 50-350.
 * What spills into the leftover width is only grid: streets and blocks that are
 * supposed to run off the edge. `slice` then crops that spill rather than the
 * subject, and the square core reads square at every width.
 *
 * The radius is a `circle` with one radius, not an `ellipse` with two. Under
 * `slice` the viewBox scales uniformly, so a circle stays a circle at both ends
 * of the panel's aspect range; an ellipse would have read as a squashed oval no
 * matter what the container did.
 *
 * SAFE BAND
 *
 * `slice` crops width below 1.333 and height above it. At the two ends of the
 * panel's range that leaves x 13-387 and y 23-277 always visible, so every label
 * and marker sits inside that band. Anything placed outside it will be trimmed on
 * one screen size or the other.
 */

/** Nearby candidates, all inside the radius. Delays stagger the three pings. */
const CANDIDATES = [
  { x: 262, y: 108, delay: 900 },
  { x: 146, y: 196, delay: 2300 },
  { x: 256, y: 194, delay: 3700 },
] as const;

/** Areas, never restaurants. Kept inside the safe band. */
const AREAS = [
  { label: "NOLITA", x: 128, y: 40 },
  { label: "LOWER EAST SIDE", x: 96, y: 266 },
  { label: "CHINATOWN", x: 312, y: 262 },
] as const;

const CENTRE = { x: 200, y: 150 } as const;
/** One radius, so the local field reads as a true circle. */
const RADIUS = 96;

export function WorkflowLocationPlate({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      {/* Streets and blocks. Drawn past the viewBox so the crop never shows an end. */}
      <g className="fiyu-lp-plate-drift">
        <g fill="none" stroke="var(--color-line)" strokeWidth="1">
          <path d="M-20 66 420 56M-20 150 420 140M-20 234 420 224" />
          <path d="M92 -20 106 320M198 -20 212 320M300 -20 314 320" />
        </g>
        <path
          d="M-20 258C56 240 122 264 192 250S302 216 420 232"
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="1.2"
          opacity=".5"
        />
        <path d="M262 70h96v46h-96z" fill="var(--color-lavender-100)" opacity=".45" />
        <path
          d="M44 176c28-12 58-10 84 8l-12 40H40Z"
          fill="var(--color-lavender-100)"
          opacity=".38"
        />
      </g>

      {/* The local field: one circle, breathing slowly. */}
      <g className="fiyu-lp-field">
        <circle cx={CENTRE.x} cy={CENTRE.y} r={RADIUS} fill="var(--color-lavender-100)" opacity=".55" />
        <circle
          cx={CENTRE.x}
          cy={CENTRE.y}
          r={RADIUS}
          fill="none"
          stroke="var(--color-lavender-500)"
          strokeWidth="1"
          strokeDasharray="4 6"
          opacity=".22"
        />
      </g>

      {CANDIDATES.map((candidate) => (
        <g key={`${candidate.x}-${candidate.y}`}>
          <circle
            className="fiyu-lp-ping"
            style={{ "--ping-delay": `${candidate.delay}ms` } as React.CSSProperties}
            cx={candidate.x}
            cy={candidate.y}
            r="12"
            fill="none"
            stroke="var(--color-lavender-500)"
            strokeWidth="1"
          />
          <circle cx={candidate.x} cy={candidate.y} r="7.5" fill="var(--color-canvas)" />
          <circle cx={candidate.x} cy={candidate.y} r="4.5" fill="var(--color-rose-dust)" />
        </g>
      ))}

      {/* You: the centre the radius is measured from. */}
      <circle
        className="fiyu-lp-ping"
        cx={CENTRE.x}
        cy={CENTRE.y}
        r="23"
        fill="none"
        stroke="var(--color-lavender-500)"
        strokeWidth="1.2"
      />
      <circle
        cx={CENTRE.x}
        cy={CENTRE.y}
        r="15"
        fill="none"
        stroke="var(--color-plum)"
        strokeWidth="1"
        opacity=".28"
      />
      <circle cx={CENTRE.x} cy={CENTRE.y} r="11" fill="var(--color-canvas)" />
      <circle cx={CENTRE.x} cy={CENTRE.y} r="5.5" fill="var(--color-plum)" />
      <text
        x={CENTRE.x}
        y="190"
        fill="var(--color-plum)"
        fontSize="10"
        fontWeight="600"
        letterSpacing="1.6"
        textAnchor="middle"
      >
        YOU
      </text>

      {AREAS.map((area) => (
        <text
          key={area.label}
          x={area.x}
          y={area.y}
          fill="var(--color-ink-muted)"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.6"
          textAnchor="middle"
        >
          {area.label}
        </text>
      ))}
    </svg>
  );
}
