import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { cn } from "@/lib/utils/cn";

export function WhyFewSection() {
  return (
    <section id="why-few" className="scroll-mt-24 border-y border-line bg-lavender-50/50">
      <div
        className={cn(
          LANDING_MEASURE,
          LANDING_RHYTHM,
          "grid gap-10 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] md:gap-16",
        )}
      >
        <div className="min-w-0">
          <SectionEyebrow>A slower reveal</SectionEyebrow>
          <h2 className={cn(LANDING_HEADING, "mt-6 max-w-[14ch] text-ink")}>
            Why only a few restaurants at a time?
          </h2>
        </div>

        <div className="min-w-0">
          <p className="max-w-[38rem] text-base leading-8 text-ink-muted sm:text-[1.0625rem] sm:leading-9">
            Great small restaurants can struggle with sudden attention. Fiyu reveals
            discoveries gradually through small, personalized selections drawn from a broader
            pool of similarly strong places. By varying recommendations across users instead of
            directing everyone to the same restaurants, Fiyu helps keep discovery thoughtful while
            reducing pressure on the places and communities that make them special.
          </p>
          {/*
           * A noren hem closing the manifesto: one continuous rail with three
           * panels of uneven drop, leading the eye into the Tokyo edition.
           */}
          <div aria-hidden="true" className="mt-12 flex max-w-[38rem] items-start">
            <span className="mt-0 h-px flex-1 bg-line-strong" />
            <span className="h-7 w-11 border border-line-strong" />
            <span className="h-10 w-11 border-r border-t border-b border-line-strong" />
            <span className="h-7 w-11 border-r border-t border-b border-line-strong" />
            <span className="h-px flex-1 bg-line-strong" />
          </div>
        </div>
      </div>
    </section>
  );
}
