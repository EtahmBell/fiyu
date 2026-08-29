import { AuthAwarePicksLink } from "@/components/landing-page/AuthAwarePicksLink";
import { IllustrativeNote } from "@/components/landing-page/ExamplePickCard";
import { HERO_EXAMPLES } from "@/components/landing-page/fictionalRestaurantExamples";
import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { PickComposition } from "@/components/landing-page/PickComposition";
import { cn } from "@/lib/utils/cn";

/**
 * The city rail.
 *
 * Fiyu is global and Tokyo is chapter one, and the page has to say so before a
 * reader forms the opposite impression. One hairline row directly under the
 * hero does it in a glance, and it costs the composition nothing.
 *
 * Static type, not a marquee: the rollout gets its own scroll sequence further
 * down, and this is only the statement of fact that precedes it.
 */
const EDITIONS = [
  { city: "Tokyo", status: "Available now", live: true },
  { city: "New York", status: "October 2026", live: false },
  { city: "More cities", status: "In research", live: false },
] as const;

function CityRail() {
  return (
    <div className="border-t border-line">
      <div className={cn(LANDING_MEASURE, "py-5")}>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          {EDITIONS.map((edition) => (
            <div key={edition.city} className="flex min-w-0 items-baseline gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[0.4rem] size-1.5 shrink-0 rounded-full",
                  edition.live ? "bg-lavender-500" : "bg-line-strong",
                )}
              />
              <dt className="shrink-0 text-[0.6875rem] font-semibold tracking-[0.18em] text-ink uppercase">
                {edition.city}
              </dt>
              <dd className="min-w-0 truncate text-[0.6875rem] tracking-[0.12em] text-ink-faint uppercase">
                {edition.status}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative border-b border-line">
      {/*
       * A tall hero, but not a full viewport: at 1080 the restaurant moment
       * below stays just in view, so the page reads as a composition rather
       * than as a deck of slides.
       */}
      <div
        className={cn(
          LANDING_MEASURE,
          "grid items-center gap-12 py-14 sm:py-16",
          "lg:min-h-[38rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)] lg:gap-16 lg:py-20",
        )}
      >
        <div className="min-w-0">
          <p
            data-testid="landing-wordmark"
            className="fiyu-lp-rise font-display text-[clamp(4.5rem,13vw,10rem)] leading-[0.78] tracking-[-0.055em] text-ink"
            data-in="true"
            style={{ "--rise-from": "10px" } as React.CSSProperties}
          >
            Fiyu
          </p>
          {/*
           * The rule binds the masthead to the headline. Without it the two sat
           * as separate blocks and the wordmark simply out-shouted the sentence
           * that carries the product.
           */}
          <span
            aria-hidden="true"
            className="fiyu-lp-rule mt-8 block h-px w-16 origin-left bg-rose-dust sm:mt-10"
            data-in="true"
            style={{ "--rule-delay": "260ms" } as React.CSSProperties}
          />
          <h1
            className="fiyu-lp-rise mt-8 max-w-[46rem] font-display text-[clamp(2.5rem,5.2vw,5rem)] leading-[0.95] tracking-[-0.03em] text-ink sm:mt-10"
            data-in="true"
            style={{ "--rise-delay": "120ms" } as React.CSSProperties}
          >
            Hidden places. Carefully uncovered.
          </h1>
          <p
            className="fiyu-lp-rise mt-7 max-w-[34rem] text-base leading-8 text-ink-muted sm:text-[1.0625rem]"
            data-in="true"
            style={{ "--rise-delay": "220ms" } as React.CSSProperties}
          >
            Fiyu combines local-language research, machine learning, and your feedback to uncover
            independent, underexposed restaurants suited to your tastes.
          </p>
          <div
            className="fiyu-lp-rise mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7"
            data-in="true"
            style={{ "--rise-delay": "320ms" } as React.CSSProperties}
          >
            <AuthAwarePicksLink className="inline-flex min-h-12 items-center rounded-chip bg-plum px-7 text-sm font-medium text-white transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-700">
              Explore Tokyo
            </AuthAwarePicksLink>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-lavender-700 underline decoration-lavender-100 decoration-2 underline-offset-4 transition-colors duration-200 ease-(--ease-fiyu) hover:decoration-lavender-500"
            >
              See how Fiyu works
            </a>
          </div>
        </div>

        {/*
         * A figure rather than a section: the caption explains the composition,
         * so the hero keeps exactly one heading and the cards themselves stay
         * out of the document outline.
         */}
        <figure
          data-testid="hero-nearby-figure"
          className="min-w-0 border-t border-line pt-10 lg:border-t-0 lg:pt-0"
        >
          <div className="mx-auto w-full max-w-[25rem] lg:mr-0 lg:ml-auto lg:max-w-[28rem]">
            <PickComposition examples={HERO_EXAMPLES} />
            <figcaption className="mt-6 lg:mt-4">
              <p className="font-display text-[1.5rem] leading-tight text-ink">
                Selected around you.
              </p>
              <p className="mt-3 max-w-[26rem] text-sm leading-7 text-ink-muted">
                Independent restaurants matched to your tastes and nearby area—whether you’re
                exploring a new city or rediscovering your everyday one.
              </p>
              {/*
               * The cards are invented. Real underexposed restaurants are what
               * Fiyu exists to protect, so a public page shows the shape of a
               * discovery rather than giving one away.
               */}
              <IllustrativeNote className="mt-5">Illustrative examples</IllustrativeNote>
            </figcaption>
          </div>
        </figure>
      </div>

      <CityRail />
    </section>
  );
}
