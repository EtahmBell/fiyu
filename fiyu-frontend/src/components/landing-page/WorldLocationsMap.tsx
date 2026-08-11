"use client";

import { usePicksEntryHref } from "@/components/landing-page/AuthAwarePicksLink";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { WORLD_LAND_PATH } from "@/components/landing-page/worldLandPath";
import { cn } from "@/lib/utils/cn";

export function WorldLocationsMap() {
  const picksHref = usePicksEntryHref();
  return (
    <section id="explore" className="scroll-mt-24 border-b border-line bg-surface">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        {/*
         * Copy beside the plate rather than stacked above it: at desktop widths
         * a full-measure map dominated the section, and the caption ended up
         * orphaned a long way from the marker it describes.
         */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.36fr)_minmax(0,0.64fr)] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <SectionEyebrow>Locations</SectionEyebrow>
            <h2 className={cn(LANDING_HEADING, "mt-6 text-ink")}>Explore Fiyu</h2>
            <p className="mt-6 max-w-sm text-base leading-8 text-ink-muted">
              Begin in Tokyo. More cities will follow.
            </p>
            {/* The legend carries the marker colour, and stays legible where the
                in-map label cannot at narrow widths. */}
            <p className="mt-8 flex items-center gap-2.5 text-sm text-ink-muted">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-rose-dust" />
              Tokyo — Available · More cities coming
            </p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-card border border-line">
            <svg
              data-testid="world-locations-map"
              role="img"
              aria-labelledby="fiyu-world-title fiyu-world-description"
              viewBox="0 0 900 450"
              className="block h-auto w-full max-w-full"
            >
              <title id="fiyu-world-title">Fiyu locations around the world</title>
              <desc id="fiyu-world-description">
                A world map showing Tokyo as Fiyu&apos;s only currently available city.
              </desc>
              <rect width="900" height="450" fill="var(--color-canvas)" />
              {/* Graticule only. The decorative ellipse that framed the plate
                  corresponded to nothing geographic and read as a dashboard. */}
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

              <a
                href={picksHref}
                tabIndex={0}
                aria-label="Tokyo — Available"
                className="group"
                data-location-status="available"
              >
                <g className="landing-tokyo-marker">
                  <circle cx="799.2" cy="135.8" r="26" fill="transparent" />
                  <circle
                    cx="799.2"
                    cy="135.8"
                    r="16"
                    fill="none"
                    stroke="var(--color-rose-dust)"
                    strokeWidth="1.5"
                    opacity="0.35"
                    className="transition-[opacity,stroke-width] group-hover:opacity-80 group-hover:stroke-[2.5px] group-focus:opacity-100 group-focus:stroke-[2.5px]"
                  />
                  <circle cx="799.2" cy="135.8" r="6.5" fill="var(--color-rose-dust)" />
                  <path
                    d="M786 124 767 109"
                    stroke="var(--color-rose-dust)"
                    strokeWidth="1.2"
                    opacity="0.75"
                  />
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
                    Available
                  </text>
                </g>
              </a>
            </svg>
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
