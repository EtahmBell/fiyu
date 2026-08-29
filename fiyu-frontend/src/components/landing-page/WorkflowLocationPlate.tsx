import { cn } from "@/lib/utils/cn";

/**
 * Where a selection starts. State 01 of the product demonstration.
 *
 * Built in code rather than delivered as an image, and that is the point of this
 * version. The supplied PNG it replaces was a good drawing but it behaved like a
 * screenshot: it could not respond to the panel it sat in, nothing inside it
 * could move, and any life had to be faked by animating a ring on top of it. A
 * plate made of markup fills whatever space the panel gives it, breathes from the
 * inside, and is coloured by the same tokens as everything around it -- so it
 * reads as part of the product rather than as a picture of one.
 *
 * Composition, back to front: a street grid on a slow drift, two blocks of pale
 * lavender for depth, the local field, three candidate places noticing themselves
 * in turn, and the reader's own position with a ring pinging out of it. Three real
 * neighbourhood names for context -- the same New York areas the picks in states
 * 02 and 03 sit in, so all three states describe one place.
 *
 * Two deliberate absences. No coordinates: the geometry is drawn to look right
 * rather than to be right. And no lines from the centre out to the candidates --
 * they were in an earlier version, they read as a network diagram, and staggered
 * rings say "nearby" without the wiring.
 *
 * It fills its container with `slice` rather than `meet`, so it is cropped when
 * the panel's proportions differ from the artwork's and never stretched.
 * Everything that has to stay legible sits inside a safe band, x 34 to 326 and
 * y 10 to 230, which survives every ratio the panel takes between a phone and a
 * desktop.
 */

/** Three candidates, each noticing itself a beat after the last. */
const CANDIDATES = [
  { x: 248, y: 84, delay: 900 },
  { x: 114, y: 168, delay: 2300 },
  { x: 238, y: 170, delay: 3700 },
] as const;

const AREAS = [
  { label: "NOLITA", x: 150, y: 32 },
  { label: "LOWER EAST SIDE", x: 100, y: 222 },
  { label: "CHINATOWN", x: 272, y: 210 },
] as const;

export function WorkflowLocationPlate({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 240"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      {/* A fragment of somewhere, not a basemap: two families of slightly angled
          lines running past the frame, at the density of a street grid. */}
      <g className="fiyu-lp-plate-drift">
        <g fill="none" stroke="var(--color-line)" strokeWidth="1">
          <path d="M-20 54 380 46M-20 118 380 108M-20 182 380 174" />
          <path d="M74 -20 88 260M176 -20 188 260M276 -20 288 260" />
        </g>
        {/* One soft line for organic relief. A street, not a route. */}
        <path
          d="M-20 206C40 190 96 214 156 200S268 168 380 184"
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="1.2"
          opacity=".5"
        />
        {/* Two blocks, for depth without describing a city. */}
        <path d="M232 58h84v40h-84z" fill="var(--color-lavender-100)" opacity=".45" />
        <path
          d="M40 148c24-10 50-8 72 6l-10 34H36Z"
          fill="var(--color-lavender-100)"
          opacity=".38"
        />
      </g>

      {/* The local field. Soft, unmeasured, and breathing. */}
      <g className="fiyu-lp-field">
        <ellipse cx="176" cy="122" rx="104" ry="74" fill="var(--color-lavender-100)" opacity=".55" />
        <ellipse
          cx="176"
          cy="122"
          rx="104"
          ry="74"
          fill="none"
          stroke="var(--color-lavender-500)"
          strokeWidth="1"
          strokeDasharray="4 6"
          opacity=".22"
        />
      </g>

      {/* Nearby places, noticing themselves in turn. No lines drawn to them. */}
      {CANDIDATES.map(({ x, y, delay }) => (
        <g key={`${x}-${y}`}>
          <circle
            className="fiyu-lp-ping"
            cx={x}
            cy={y}
            r="12"
            fill="none"
            stroke="var(--color-rose-dust)"
            strokeWidth="1"
            style={
              { "--ping-duration": "6.2s", "--ping-delay": delay + "ms" } as React.CSSProperties
            }
          />
          <circle cx={x} cy={y} r="7.5" fill="var(--color-canvas)" />
          <circle cx={x} cy={y} r="4.5" fill="var(--color-rose-dust)" />
        </g>
      ))}

      {/* You. The only plum mark, the only ring, and the only label in plum. */}
      <circle
        className="fiyu-lp-ping"
        cx="176"
        cy="122"
        r="23"
        fill="none"
        stroke="var(--color-lavender-500)"
        strokeWidth="1.2"
      />
      <circle cx="176" cy="122" r="15" fill="none" stroke="var(--color-plum)" strokeWidth="1" opacity=".28" />
      <circle cx="176" cy="122" r="11" fill="var(--color-canvas)" />
      <circle cx="176" cy="122" r="5.5" fill="var(--color-plum)" />
      <text
        x="176"
        y="157"
        fill="var(--color-plum)"
        fontSize="9"
        fontWeight="600"
        letterSpacing="1.6"
        textAnchor="middle"
      >
        YOU
      </text>

      {/* Real areas, one to a side, set as the page sets every micro-caps label. */}
      <g
        fill="var(--color-ink-muted)"
        fontSize="10"
        fontWeight="600"
        letterSpacing="1.5"
        textAnchor="middle"
      >
        {AREAS.map(({ label, x, y }) => (
          <text key={label} x={x} y={y}>
            {label}
          </text>
        ))}
      </g>
    </svg>
  );
}
