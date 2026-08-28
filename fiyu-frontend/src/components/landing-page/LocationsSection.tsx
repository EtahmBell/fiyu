"use client";

import { usePicksEntryHref } from "@/components/landing-page/AuthAwarePicksLink";
import { LANDING_MEASURE, SectionEyebrow } from "@/components/landing-page/landingSystem";
import { useScrollScene } from "@/components/landing-page/motion/scrollScene";
import { NextCityPoll } from "@/components/landing-page/NextCityPoll";
import { WORLD_LAND_PATH } from "@/components/landing-page/worldLandPath";
import { cn } from "@/lib/utils/cn";

/**
 * The rollout, city by city.
 *
 * Tokyo is where Fiyu is, New York is where it goes, and the question after that
 * is open -- the poll is how a reader answers it. Read in that order the section
 * says Fiyu is a global product on its first city, which is the one thing the
 * old static list of two rows could not say.
 *
 * The plate answers rather than leads. It opens close on Tokyo and pans out to
 * the whole world as the section passes: one slow continuous move, no fly-to, so
 * the widening is felt while the widening is being read. New York arrives on it
 * with its own row, and the five cities on the ballot appear last.
 *
 * Nothing is pinned. A pinned viewport stage would have to hold a heading, three
 * rows of large type, a poll and a world map inside one screen, which a 5.4-inch
 * phone does not have -- so the section scrolls normally and the pan is scrubbed
 * against its pass instead. The one pinned sequence on the page is the card
 * accumulation, which has almost nothing in it.
 *
 * Everything is in the DOM from the first paint: three rows of type, the Tokyo
 * link, the New York mark. With motion off the reader gets the finished list and
 * the fully zoomed-out world.
 */

/** Equirectangular: x = (lon + 180) * 2.5, y = (90 - lat) * 2.5. */
const CANDIDATES = [
  { name: "Rome", x: 481.2, y: 120.2 },
  { name: "Paris", x: 455.9, y: 102.9 },
  { name: "Hong Kong", x: 735.4, y: 169.2 },
  { name: "Sydney", x: 828, y: 309.7 },
  { name: "Los Angeles", x: 154.4, y: 139.9 },
] as const;

const TOKYO = { x: 799.2, y: 135.8 };
const NEW_YORK = { x: 265, y: 123.2 };

/**
 * Progress values are of the section's pass through the viewport, so the whole
 * sequence has to resolve while the section is actually on screen: it fills the
 * viewport at around 0.5, and has begun leaving by 0.75.
 */
const ROLLOUT = [
  { city: "Tokyo", status: "Available now", from: "0.16" },
  { city: "New York", status: "October 2026", from: "0.31" },
  { city: "Where next?", status: "In research", from: "0.46" },
] as const;

/**
 * Start close on Tokyo, end on the world. The translate percentages are of the
 * plate's own box, which is what keeps the framing correct at every width:
 * -73.7% is Tokyo's offset from centre multiplied by the opening scale.
 */
const ATLAS =
  "[--atlas-from:0.1] [--atlas-span:0.5] " +
  "[--atlas-scale:1.7] [--atlas-travel-scale:-0.7] [--atlas-travel-x:66%] " +
  "[--atlas-travel-y:-34%] [--atlas-x:-66%] [--atlas-y:34%] " +
  "lg:[--atlas-scale:1.9] lg:[--atlas-travel-scale:-0.9] lg:[--atlas-travel-x:73.7%] " +
  "lg:[--atlas-travel-y:-37.6%] lg:[--atlas-x:-73.7%] lg:[--atlas-y:37.6%]";

function Rollout() {
  return (
    <div className="min-w-0">
      <SectionEyebrow>Locations</SectionEyebrow>
      <h2 className="mt-5 max-w-[16ch] font-display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-[1.05] tracking-[-0.02em] text-ink">
        Fiyu opens city by city.
      </h2>

      <dl className="mt-8 min-w-0 lg:mt-10">
        {ROLLOUT.map((entry) => (
          <div
            key={entry.city}
            data-rollout={entry.city}
            className="fiyu-lp-stage-item flex min-w-0 items-baseline justify-between gap-5 border-t border-line py-3.5 [--span:0.16] [--stage-y:16px] lg:py-4"
            style={{ "--from": entry.from } as React.CSSProperties}
          >
            <dt className="min-w-0 truncate font-display text-[clamp(1.5rem,3.4vw,2.75rem)] leading-none tracking-[-0.02em] text-ink">
              {entry.city}
            </dt>
            <dd className="shrink-0 text-[0.6875rem] tracking-[0.14em] text-ink-faint uppercase">
              {entry.status}
            </dd>
          </div>
        ))}
      </dl>

      <div className="fiyu-lp-stage-item [--from:0.56] [--span:0.14] [--stage-y:12px]">
        <NextCityPoll />
      </div>
    </div>
  );
}

/** The two cities that are real, and five a reader can vote for. */
function Atlas({ picksHref }: { picksHref: string }) {
  return (
    <svg
      data-testid="world-locations-map"
      role="img"
      aria-labelledby="fiyu-world-title fiyu-world-description"
      viewBox="0 0 900 450"
      preserveAspectRatio="xMidYMid slice"
      className="block h-full w-full max-w-full"
    >
      <title id="fiyu-world-title">Fiyu locations around the world</title>
      <desc id="fiyu-world-description">
        A world map showing Tokyo as Fiyu&apos;s only currently available city, with New York
        marked for October 2026.
      </desc>
      <rect width="900" height="450" fill="var(--color-canvas)" />
      {/* Graticule only. A decorative frame here corresponded to nothing
          geographic and read as a dashboard. */}
      <g aria-hidden="true" fill="none" stroke="var(--color-line)" strokeWidth="0.75">
        <path d="M0 112.5H900M0 225H900M0 337.5H900" />
        <path d="M225 0V450M450 0V450M675 0V450" />
      </g>
      <path
        aria-hidden="true"
        d={WORLD_LAND_PATH}
        fill="var(--color-lavender-100)"
        fillRule="evenodd"
        stroke="var(--color-line-strong)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />

      {/* Cities on the ballot. Marks without names: labelling six places would
          out-shout the two that are real. */}
      <g
        aria-hidden="true"
        className="fiyu-lp-stage-fade [--enter-opacity:0.75] [--from:0.46] [--span:0.14]"
      >
        {CANDIDATES.map((candidate) => (
          <circle
            key={candidate.name}
            cx={candidate.x}
            cy={candidate.y}
            r="5"
            fill="none"
            stroke="var(--color-lavender-500)"
            strokeWidth="1.4"
            strokeDasharray="3 2.5"
          />
        ))}
      </g>

      <g aria-hidden="true" className="fiyu-lp-stage-fade [--from:0.33] [--span:0.14]">
        <circle cx={NEW_YORK.x} cy={NEW_YORK.y} r="6" fill="var(--color-lavender-500)" />
        <path
          d="M276 115 296 100"
          stroke="var(--color-lavender-500)"
          strokeWidth="1.2"
          opacity="0.75"
        />
        <rect
          x="296"
          y="77"
          width="142"
          height="46"
          rx="6"
          fill="var(--color-surface)"
          stroke="var(--color-line-strong)"
          strokeWidth="0.9"
        />
        <text x="312" y="98" fill="var(--color-ink)" fontSize="15" fontWeight="600">
          New York
        </text>
        <text x="312" y="114" fill="var(--color-ink-muted)" fontSize="11.5">
          October 2026
        </text>
      </g>

      <a
        href={picksHref}
        tabIndex={0}
        aria-label="Tokyo — Available now"
        className="group"
        data-location-status="available"
      >
        <g className="landing-tokyo-marker">
          <circle cx={TOKYO.x} cy={TOKYO.y} r="26" fill="transparent" />
          <circle
            cx={TOKYO.x}
            cy={TOKYO.y}
            r="16"
            fill="none"
            stroke="var(--color-rose-dust)"
            strokeWidth="1.5"
            opacity="0.35"
            className="transition-[opacity,stroke-width] group-hover:stroke-[2.5px] group-hover:opacity-80 group-focus:stroke-[2.5px] group-focus:opacity-100"
          />
          <circle cx={TOKYO.x} cy={TOKYO.y} r="6.5" fill="var(--color-rose-dust)" />
          <path d="M786 124 767 109" stroke="var(--color-rose-dust)" strokeWidth="1.2" opacity="0.75" />
          <rect
            x="636"
            y="70"
            width="130"
            height="46"
            rx="6"
            fill="var(--color-surface)"
            stroke="var(--color-line-strong)"
            strokeWidth="0.9"
            className="transition-[stroke-width] group-hover:stroke-[1.8px] group-focus:stroke-[1.8px]"
          />
          <text x="652" y="91" fill="var(--color-ink)" fontSize="15" fontWeight="600">
            Tokyo
          </text>
          <text x="652" y="107" fill="var(--color-ink-muted)" fontSize="11.5">
            Available now
          </text>
        </g>
      </a>
    </svg>
  );
}

export function LocationsSection() {
  const picksHref = usePicksEntryHref();
  const { ref } = useScrollScene<HTMLDivElement>({ mode: "through" });

  return (
    <section id="explore" className="scroll-mt-24 border-b border-line bg-surface">
      <div
        ref={ref}
        className={cn(
          LANDING_MEASURE,
          "fiyu-lp-scene grid gap-x-12 gap-y-12 py-24 sm:py-28",
          "lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:items-center lg:py-36",
        )}
      >
        <Rollout />

        {/*
         * The plate bleeds past the measure instead of sitting in a framed box:
         * a bordered world map inside a column was the single most brochure-like
         * object on the old page. The aspect box is fixed so the pan crops
         * rather than resizing anything.
         */}
        <div className="relative min-w-0 overflow-hidden aspect-[16/10] sm:aspect-[2/1] lg:-mr-[8%]">
          <div className={cn("fiyu-lp-atlas absolute inset-0", ATLAS)}>
            <Atlas picksHref={picksHref} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fiyu-tokyo-arrive {
          from { opacity: 0; transform: scale(.85); }
          to { opacity: 1; transform: scale(1); }
        }
        .landing-tokyo-marker {
          transform-box: fill-box;
          transform-origin: center;
          animation: fiyu-tokyo-arrive 700ms var(--ease-fiyu) 240ms both;
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-tokyo-marker { animation: none; }
        }
      `}</style>
    </section>
  );
}
