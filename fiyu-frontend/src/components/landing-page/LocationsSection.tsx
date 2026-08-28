"use client";

import { usePicksEntryHref } from "@/components/landing-page/AuthAwarePicksLink";
import {
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { NextCityPoll } from "@/components/landing-page/NextCityPoll";
import { WORLD_LAND_PATH } from "@/components/landing-page/worldLandPath";
import { cn } from "@/lib/utils/cn";

/**
 * The rollout, city by city.
 *
 * Tokyo is where Fiyu is, New York is where it goes, and the question after that
 * is open. Read in that order the section says Fiyu is a global product on its
 * first city -- the one thing a static list of two rows could not say.
 *
 * This section previously scrubbed a scale from 1.9 to 1.0 across a pass through
 * the viewport, which is a ninety percent zoom, in "through" progress space: the
 * plate was therefore always mid-zoom on arrival and only reached the full world
 * after the section had left. Worse, the city rows were staged on the same
 * progress, which is why their labels sat at accidental intermediate opacities
 * instead of being either present or not.
 *
 * All of it is gone. There is no scroll-linked transform here at all now. The
 * plate sits at one fixed framing, and the sequence is an entrance: Tokyo lights,
 * a hairline draws toward New York, New York lights, the cities on the ballot
 * appear. Roughly two seconds, once, triggered on arrival. Every city row has an
 * explicit state -- NOW, NEXT, THEN -- and every state is either fully present or
 * has not started.
 *
 * What is left moving is deliberately below notice: a sub-one-percent positional
 * drift over forty-six seconds, and a halo breathing on the one city that is
 * live. The plate should feel alive without asking for attention.
 */

/** Equirectangular: x = (lon + 180) * 2.5, y = (90 - lat) * 2.5. */
const TOKYO = { x: 799.2, y: 135.8 };
const NEW_YORK = { x: 265, y: 123.2 };

const CANDIDATES = [
  { name: "Rome", x: 481.2, y: 120.2 },
  { name: "Paris", x: 455.9, y: 102.9 },
  { name: "Hong Kong", x: 735.4, y: 169.2 },
  { name: "Sydney", x: 828, y: 309.7 },
  { name: "Los Angeles", x: 154.4, y: 139.9 },
] as const;

/**
 * The three rows, each with the state it is in. The delays are the sequence: a
 * city lights, the link draws, the next city lights, the ballot opens.
 */
const ROLLOUT = [
  { state: "Now", city: "Tokyo", status: "Available now", delay: 120, live: true },
  { state: "Next", city: "New York", status: "October 2026", delay: 1000, live: false },
  { state: "Then", city: "Where next?", status: "In research", delay: 1600, live: false },
] as const;

function Rollout({ flag }: { flag: string }) {
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
            className="fiyu-lp-rise flex min-w-0 items-baseline gap-4 border-t border-line py-4 sm:gap-6"
            data-in={flag}
            style={
              { "--rise-delay": entry.delay + "ms", "--rise-from": "12px" } as React.CSSProperties
            }
          >
            <dt className="flex w-[3.25rem] shrink-0 items-center gap-2 text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase sm:w-[3.75rem]">
              {entry.live && (
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-lavender-500" />
              )}
              {entry.state}
            </dt>
            <dd className="min-w-0 flex-1 truncate font-display text-[clamp(1.5rem,3.2vw,2.5rem)] leading-none tracking-[-0.02em] text-ink">
              {entry.city}
            </dd>
            <dd className="shrink-0 text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
              {entry.status}
            </dd>
          </div>
        ))}
      </dl>

      <div
        className="fiyu-lp-rise"
        data-in={flag}
        style={{ "--rise-delay": "1900ms" } as React.CSSProperties}
      >
        <NextCityPoll />
      </div>
    </div>
  );
}

/** The two cities that are real, five a reader can vote for, and the link between. */
function Atlas({ picksHref, flag }: { picksHref: string; flag: string }) {
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

      {/* Tokyo to New York: the expansion cue, drawn once. */}
      <path
        aria-hidden="true"
        className="fiyu-lp-path"
        data-in={flag}
        d="M781 132 Q532 58 283 120"
        fill="none"
        stroke="var(--color-lavender-500)"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.5"
        style={
          // 504.3 is the measured arc length of the quadratic above. The dash
          // has to match it: shorter and the pattern repeats, leaving a gap at
          // the far end; much longer and the line finishes drawing before the
          // animation does, which reads as a stall.
          { "--path-length": "506", "--path-delay": "620ms" } as React.CSSProperties
        }
      />

      {/* Cities on the ballot. Marks without names: labelling six places would
          out-shout the two that are real. */}
      <g
        aria-hidden="true"
        className="fiyu-lp-rise"
        data-in={flag}
        style={{ "--rise-delay": "1700ms", "--rise-from": "0px" } as React.CSSProperties}
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
            opacity="0.75"
          />
        ))}
      </g>

      <g
        aria-hidden="true"
        className="fiyu-lp-rise"
        data-in={flag}
        style={{ "--rise-delay": "1080ms", "--rise-from": "0px" } as React.CSSProperties}
      >
        <circle cx={NEW_YORK.x} cy={NEW_YORK.y} r="6" fill="var(--color-lavender-500)" />
        <path
          className="fiyu-lp-map-label"
          d="M272 114 292 98"
          stroke="var(--color-lavender-500)"
          strokeWidth="1.2"
          opacity="0.75"
        />
        <g className="fiyu-lp-map-label">
          <rect
            x="292"
            y="75"
            width="142"
            height="46"
            rx="6"
            fill="var(--color-surface)"
            stroke="var(--color-line-strong)"
            strokeWidth="0.9"
          />
          <text x="308" y="96" fill="var(--color-ink)" fontSize="15" fontWeight="600">
            New York
          </text>
          <text x="308" y="112" fill="var(--color-ink-muted)" fontSize="11.5">
            October 2026
          </text>
        </g>
      </g>

      <a
        href={picksHref}
        tabIndex={0}
        aria-label="Tokyo — Available now"
        className="group"
        data-location-status="available"
      >
        <g
          className="fiyu-lp-rise"
          data-in={flag}
          style={{ "--rise-delay": "160ms", "--rise-from": "0px" } as React.CSSProperties}
        >
          {/*
            The hit area, sized for the smallest screen. The label beside the pin
            is hidden below `sm`, so the pin is the whole target there: 40 user
            units is about 35 device pixels across at phone scale, which clears
            the 24px minimum. Nothing else on the plate is within 70 units.
          */}
          <circle cx={TOKYO.x} cy={TOKYO.y} r="40" fill="transparent" />
          {/* The one live city breathes. A halo ring, never a glow. */}
          <circle
            className="fiyu-lp-halo"
            data-in={flag}
            cx={TOKYO.x}
            cy={TOKYO.y}
            r="16"
            fill="none"
            stroke="var(--color-rose-dust)"
            strokeWidth="1.5"
            opacity="0.35"
            style={{ "--halo-delay": "1200ms" } as React.CSSProperties}
          />
          <circle cx={TOKYO.x} cy={TOKYO.y} r="6.5" fill="var(--color-rose-dust)" />
            <path
            className="fiyu-lp-map-label"
            d="M786 124 767 109"
            stroke="var(--color-rose-dust)"
            strokeWidth="1.2"
            opacity="0.75"
          />
          <g className="fiyu-lp-map-label">
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
        </g>
      </a>
    </svg>
  );
}

export function LocationsSection() {
  const picksHref = usePicksEntryHref();
  const { ref, entered } = useEntered<HTMLDivElement>("0px 0px -20% 0px");
  const flag = entered ? "true" : "false";

  return (
    <section id="explore" className="scroll-mt-24 border-b border-line bg-surface">
      <div
        ref={ref}
        className={cn(
          LANDING_MEASURE,
          LANDING_RHYTHM,
          "grid gap-x-12 gap-y-12",
          "lg:grid-cols-[minmax(0,0.44fr)_minmax(0,0.56fr)] lg:items-center",
        )}
      >
        <Rollout flag={flag} />

        {/*
         * A fixed framing in a fixed aspect box, cropped past the poles so the
         * plate reads as an editorial world rather than as a projection. It
         * bleeds past the measure instead of sitting in a bordered box: a framed
         * world map inside a column was the most brochure-like object here.
         */}
        <div className="relative min-w-0 overflow-hidden aspect-[16/9] sm:aspect-[2.4/1] lg:-mr-[7%]">
          <div className="fiyu-lp-map-drift absolute inset-0">
            <Atlas picksHref={picksHref} flag={flag} />
          </div>
        </div>
      </div>
    </section>
  );
}
