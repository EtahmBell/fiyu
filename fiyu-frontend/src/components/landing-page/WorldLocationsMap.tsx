import { WORLD_LAND_PATH } from "@/components/landing-page/worldLandPath";

export function WorldLocationsMap() {
  return (
    <section id="explore" className="scroll-mt-20 bg-surface">
      <div className="mx-auto w-full max-w-[90rem] px-5 py-16 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
        <div className="grid gap-5 md:grid-cols-[0.7fr_1.3fr] md:items-end">
          <p className="text-xs font-semibold tracking-[0.18em] text-lavender-700 uppercase">
            Locations
          </p>
          <div>
            <h2 className="font-display text-5xl leading-none text-ink sm:text-7xl">Explore Fiyu</h2>
            <p className="mt-5 text-base leading-7 text-ink-muted">
              Begin in Tokyo. More cities will follow.
            </p>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-card border border-line bg-canvas p-2 sm:mt-14 sm:p-5">
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
            <g aria-hidden="true" fill="none" stroke="var(--color-line)" strokeWidth="1">
              <path d="M0 112.5H900M0 225H900M0 337.5H900" />
              <path d="M225 0V450M450 0V450M675 0V450" />
              <ellipse cx="450" cy="225" rx="449" ry="190" />
            </g>
            <path
              aria-hidden="true"
              d={WORLD_LAND_PATH}
              fill="var(--color-lavender-100)"
              fillRule="evenodd"
              stroke="var(--color-line-strong)"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />

            <a
              href="/picks"
              tabIndex={0}
              aria-label="Tokyo — Available"
              className="group outline-none"
              data-location-status="available"
            >
              <g className="landing-tokyo-marker">
                <circle cx="799.2" cy="135.8" r="24" fill="transparent" />
                <circle
                  cx="799.2"
                  cy="135.8"
                  r="15"
                  fill="none"
                  stroke="var(--color-rose-dust)"
                  strokeWidth="2"
                  opacity="0.28"
                  className="transition-[opacity,stroke-width] group-hover:opacity-70 group-hover:stroke-[3px] group-focus:opacity-100 group-focus:stroke-[3px]"
                />
                <circle cx="799.2" cy="135.8" r="6" fill="var(--color-rose-dust)" />
                <path d="M785 123 758 102" stroke="var(--color-rose-dust)" strokeWidth="1.5" />
                <rect
                  x="642"
                  y="72"
                  width="120"
                  height="42"
                  rx="8"
                  fill="var(--color-surface)"
                  stroke="var(--color-line-strong)"
                  className="transition-[stroke-width] group-hover:stroke-[2px] group-focus:stroke-[2px]"
                />
                <text x="656" y="90" fill="var(--color-ink)" fontSize="13" fontWeight="600">
                  Tokyo
                </text>
                <text x="656" y="105" fill="var(--color-ink-muted)" fontSize="10.5">
                  Available
                </text>
              </g>
            </a>
          </svg>
        </div>

        <p className="mt-5 text-sm text-ink-muted">Tokyo — Available · More cities coming</p>
      </div>
      <style>{`
        @keyframes fiyu-tokyo-arrive {
          0% { opacity: 0; transform: scale(.7); }
          60% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        .landing-tokyo-marker {
          transform-box: fill-box;
          transform-origin: center;
          animation: fiyu-tokyo-arrive 900ms var(--ease-fiyu) 240ms both;
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-tokyo-marker { animation: none; }
        }
      `}</style>
    </section>
  );
}
