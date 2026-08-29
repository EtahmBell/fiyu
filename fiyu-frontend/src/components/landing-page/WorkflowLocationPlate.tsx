import { cn } from "@/lib/utils/cn";

/**
 * Where a selection starts.
 *
 * The first state of the product demonstration. Fiyu's Picks flow begins with a
 * reader's location, so state 01 has to be a place rather than a preferences
 * form -- this is the graphic that says "start near me" without saying anything
 * a map would have to be accurate about.
 *
 * Three things changed from the first version, all of them about restraint.
 *
 * The faint lines running from the centre out to each candidate are gone. They
 * were meant to read as relationship and read as a network diagram, which is one
 * of the few things this drawing must not look like. The marks now simply sit
 * near each other, which is the whole claim.
 *
 * It sits on its own pale ground with a soft corner radius, so it reads as a
 * contained plate on the cream panel rather than as a drawing dissolving into it.
 * The caller caps its width and centres it; it no longer stretches to whatever
 * space the panel happens to offer.
 *
 * And the grid is lighter and deliberately unaligned to the marks, so it reads as
 * a fragment of somewhere rather than as a chart. The `YOU` marker carries a
 * ground-coloured disc under it, which lets the grid pass beneath without being
 * erased -- the same trick the hero plate uses, and the reason a pin on a map
 * looks like a pin.
 *
 * Two deliberate absences: no coordinates, because the geometry is drawn to look
 * right rather than to be right, and no stroke or figure on the lavender field,
 * so it cannot be read as a search radius Fiyu has promised. The areas are real;
 * the two candidate marks stay anonymous, because naming invented restaurants
 * here would compete with the Picks state that follows.
 */
export function WorkflowLocationPlate({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 240"
      preserveAspectRatio="xMidYMid meet"
      className={cn("block size-full", className)}
    >
      {/* Its own ground, so the plate is contained without being boxed. */}
      <rect width="320" height="240" rx="10" fill="var(--color-surface)" />

      <g fill="none" stroke="var(--color-line)" strokeWidth="1">
        <path d="M0 50H320M0 112H320M0 178H320" />
        <path d="M68 0V240M152 0V240M238 0V240" />
      </g>
      {/* One soft line for organic relief. A street, not a route. */}
      <path
        d="M0 198C42 184 94 204 150 192S252 162 320 174"
        fill="none"
        stroke="var(--color-line-strong)"
        strokeWidth="1.2"
        opacity=".55"
      />

      {/* The reach. No stroke and no figure: this is "nearby", not a radius. */}
      <ellipse cx="160" cy="120" rx="88" ry="62" fill="var(--color-lavender-100)" opacity=".6" />

      {/* Two anonymous candidates. No lines drawn to them. */}
      {[
        [200, 82],
        [118, 162],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="7" fill="var(--color-surface)" />
          <circle cx={cx} cy={cy} r="4" fill="var(--color-rose-dust)" />
        </g>
      ))}

      {/* You. The only plum mark, and the only one with a ring. */}
      <circle cx="160" cy="120" r="13" fill="none" stroke="var(--color-plum)" strokeWidth="1" opacity=".3" />
      <circle cx="160" cy="120" r="9.5" fill="var(--color-surface)" />
      <circle cx="160" cy="120" r="5" fill="var(--color-plum)" />
      <text
        x="160"
        y="144"
        fill="var(--color-plum)"
        fontSize="9"
        fontWeight="600"
        letterSpacing="1.5"
        textAnchor="middle"
      >
        YOU
      </text>

      {/* Real areas, one to a side, set as the page sets every micro-caps label. */}
      <g
        fill="var(--color-ink-muted)"
        fontSize="10"
        fontWeight="600"
        letterSpacing="1.4"
        textAnchor="middle"
      >
        <text x="150" y="30">NOLITA</text>
        <text x="84" y="216">LOWER EAST SIDE</text>
        <text x="250" y="200">CHINATOWN</text>
      </g>
    </svg>
  );
}
