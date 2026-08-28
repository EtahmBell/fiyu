import { cn } from "@/lib/utils/cn";

/**
 * An invented neighbourhood, not a place.
 *
 * Abstract enough to stay true anywhere Fiyu opens: no real geography, no real
 * restaurants, no user position. The streets are two families of slightly
 * angled lines running past the frame, so it reads as a fragment of somewhere
 * rather than a diagram of everywhere.
 *
 * Kept from the previous hero, where it was the subject. It is now the ground
 * the pick cards sit on -- same drawing, one layer back -- so the hero gains a
 * product and keeps the plate that gave it its sense of place.
 */
export function NearbyDiscoveryPlate({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 280"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      <rect width="300" height="280" fill="var(--color-canvas)" />

      {/* Two blocks give the plate depth without asking it to describe a city. */}
      <path d="M196 36h74v58h-74z" fill="var(--color-lavender-100)" opacity=".5" />
      <path d="M28 188c26-10 52-8 74 6l-12 42H24Z" fill="var(--color-lavender-100)" opacity=".42" />

      <g fill="none" stroke="var(--color-line-strong)" strokeWidth="1" opacity=".7">
        <path d="M-10 66 310 52M-10 140 310 126M-10 214 310 200" />
        <path d="M62 -10 78 290M146 -10 162 290M230 -10 246 290" />
      </g>
      <path
        d="M-10 250C50 226 96 254 152 230S244 194 310 210"
        fill="none"
        stroke="var(--color-line-strong)"
        strokeWidth="1.4"
        opacity=".45"
      />

      {/* The nearby area: a soft reach, deliberately not a measured radius. */}
      <circle cx="150" cy="150" r="78" fill="var(--color-lavender-100)" opacity=".5" />
      <circle
        cx="150"
        cy="150"
        r="78"
        fill="none"
        stroke="var(--color-lavender-500)"
        strokeWidth="1"
        opacity=".3"
      />

      {/* Origin to each pick, faint enough to read as relationship not routing. */}
      <g stroke="var(--color-plum)" strokeWidth="1" strokeLinecap="round" opacity=".22">
        <path d="M150 150 96 108M150 150 206 128M150 150 168 214" />
      </g>

      <g>
        <circle
          cx="206"
          cy="128"
          r="12.5"
          fill="none"
          stroke="var(--color-rose-dust)"
          strokeWidth="1"
          opacity=".45"
        />
        {[
          [96, 108],
          [206, 128],
          [168, 214],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="7.5" fill="var(--color-canvas)" />
            <circle cx={cx} cy={cy} r="4.5" fill="var(--color-rose-dust)" />
          </g>
        ))}
      </g>

      <circle cx="150" cy="150" r="13" fill="none" stroke="var(--color-plum)" strokeWidth="1" opacity=".28" />
      <circle cx="150" cy="150" r="10" fill="var(--color-canvas)" />
      <circle cx="150" cy="150" r="5.5" fill="var(--color-plum)" />
    </svg>
  );
}
