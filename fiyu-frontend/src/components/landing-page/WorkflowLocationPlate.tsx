import { cn } from "@/lib/utils/cn";

/**
 * Where a selection starts.
 *
 * The first state of the product demonstration. Fiyu's Picks flow begins with a
 * reader's location, so state 01 has to be a place rather than a preferences
 * form -- this is the graphic that says "Fiyu starts near you" without saying
 * anything a map would have to be accurate about.
 *
 * Deliberately not the hero's neighbourhood plate. That one is raked, unlabelled
 * and city-neutral, because the hero must travel to any city. This one is
 * orthogonal, landscape, and names three real New York areas, because the
 * demonstration around it is New York and the labels are the point: a reader
 * should recognise that these are places near each other.
 *
 * Two things it deliberately does not do. It carries no coordinates -- the
 * geometry is drawn to look right, not to be right -- and the lavender reach has
 * no stroke, no ring and no figure on it, so it cannot be read as a search
 * radius Fiyu has promised. It is a soft suggestion of "nearby" and nothing more.
 *
 * The areas are real; the two candidate marks are anonymous. Naming invented
 * restaurants here would compete with the Picks state that follows.
 */
export function WorkflowLocationPlate({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 240"
      preserveAspectRatio="xMidYMid meet"
      className={cn("block size-full", className)}
    >
      {/* A fragment of somewhere, not a basemap: two families of straight lines
          running past the frame, at the density of a street grid. */}
      <g fill="none" stroke="var(--color-line)" strokeWidth="1">
        <path d="M-10 58H330M-10 128H330M-10 196H330" />
        <path d="M74 -10V250M170 -10V250M258 -10V250" />
      </g>
      <path
        d="M-10 168C46 154 92 176 140 164S244 138 330 152"
        fill="none"
        stroke="var(--color-line-strong)"
        strokeWidth="1.2"
        opacity=".5"
      />

      {/* The reach. No stroke and no figure: this is "nearby", not a radius. */}
      <ellipse cx="150" cy="128" rx="92" ry="66" fill="var(--color-lavender-100)" opacity=".55" />

      {/* Two anonymous candidates, and the relationship to them. */}
      <g stroke="var(--color-plum)" strokeWidth="1" strokeLinecap="round" opacity=".22">
        <path d="M150 128 206 76M150 128 196 178" />
      </g>
      {[
        [206, 76],
        [196, 178],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="7" fill="var(--color-canvas)" />
          <circle cx={cx} cy={cy} r="4" fill="var(--color-rose-dust)" />
        </g>
      ))}

      {/* You. The only plum mark, and the only one with a ring. */}
      <circle cx="150" cy="128" r="12" fill="none" stroke="var(--color-plum)" strokeWidth="1" opacity=".3" />
      <circle cx="150" cy="128" r="9" fill="var(--color-canvas)" />
      <circle cx="150" cy="128" r="5" fill="var(--color-plum)" />

      {/* Real areas, set as the page sets every other micro-caps label. */}
      <g
        fill="var(--color-ink-muted)"
        fontSize="9"
        fontWeight="600"
        letterSpacing="1.6"
        textAnchor="middle"
      >
        <text x="120" y="34">NOLITA</text>
        <text x="66" y="120">LOWER EAST SIDE</text>
        <text x="196" y="222">CHINATOWN</text>
      </g>
      <text
        x="150"
        y="152"
        fill="var(--color-plum)"
        fontSize="8.5"
        fontWeight="600"
        letterSpacing="1.4"
        textAnchor="middle"
      >
        YOU
      </text>
    </svg>
  );
}
