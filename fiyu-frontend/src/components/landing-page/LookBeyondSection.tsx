"use client";

import { ExamplePickCard } from "@/components/landing-page/ExamplePickCard";
import { LOOK_BEYOND_EXAMPLE } from "@/components/landing-page/landingExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Look beyond what rises to the top.
 *
 * The section that has to explain why Fiyu can see places other platforms
 * cannot, without drawing a single node, edge or glow. Four things Fiyu reads,
 * set as an editorial index, each opened by a hairline that draws itself in --
 * a signal arriving, which is the honest visual for this and also the quietest.
 *
 * Then one card, placed to cross from the index column back under the heading.
 * That overlap is the argument: four signals, one place worth going.
 *
 * Entrance motion only. This is a claim about judgement, and scrubbing it
 * against a scrollbar would make it feel like a machine demonstrating itself.
 */

const SIGNALS = [
  {
    label: "Local-language context",
    copy: "What people write about a place in the language they live in.",
  },
  {
    label: "Independent and owner-run",
    copy: "Small operations, rather than groups and chains with reach to spend.",
  },
  {
    label: "Strong local reception",
    copy: "Well regarded by the people who actually eat there.",
  },
  {
    label: "Less visible than it deserves",
    copy: "Little carry beyond its own few streets.",
  },
] as const;

export function LookBeyondSection() {
  const { ref, entered } = useEntered<HTMLDivElement>();
  const flag = entered ? "true" : "false";

  return (
    <section id="look-beyond" className="scroll-mt-24 border-b border-line bg-subtle">
      <div ref={ref} className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-12">
          <div className="min-w-0 lg:col-span-6 lg:col-start-1">
            <SectionEyebrow>Underexposure</SectionEyebrow>
            <h2 className={cn(LANDING_HEADING, "mt-6 max-w-[18ch] text-ink")}>
              Look beyond what rises to the top.
            </h2>
            <p className="mt-7 max-w-[34rem] text-base leading-8 text-ink-muted sm:text-[1.0625rem] sm:leading-9">
              Discovery platforms tend to reinforce the restaurants that are already easiest to
              find. Excellent independent places can be far less visible—especially when their
              strongest context was never written in English. Fiyu reads that context, weighs
              quality against how widely a place is already known, and learns from what you save.
            </p>
          </div>

          <ol className="mt-14 min-w-0 lg:col-span-5 lg:col-start-8 lg:mt-2">
            {SIGNALS.map((signal, index) => (
              <li key={signal.label} className="min-w-0 pb-7 last:pb-0">
                <span
                  aria-hidden="true"
                  className="fiyu-lp-rule block h-px w-full origin-left bg-line-strong"
                  data-in={flag}
                  style={{ "--rule-delay": index * 150 + 120 + "ms" } as React.CSSProperties}
                />
                <div
                  className="fiyu-lp-rise pt-4"
                  data-in={flag}
                  style={
                    {
                      "--rise-delay": index * 150 + 260 + "ms",
                      "--rise-from": "10px",
                    } as React.CSSProperties
                  }
                >
                  <p className="text-[0.8125rem] font-semibold tracking-[0.02em] text-ink">
                    {signal.label}
                  </p>
                  <p className="mt-1.5 max-w-[24rem] text-[0.8125rem] leading-6 text-ink-muted">
                    {signal.copy}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/*
           * The card crosses the column boundary rather than sitting inside
           * either one. Nothing else on the page does this, which is what makes
           * the overlap read as a conclusion.
           */}
          <div className="relative z-10 mt-12 min-w-0 lg:col-span-5 lg:col-start-4 lg:-mt-24">
            <div
              className="fiyu-lp-settle mx-auto w-full max-w-[22rem] lg:mx-0"
              data-in={flag}
              style={
                {
                  "--settle-delay": "760ms",
                  "--settle-x": "-12px",
                  "--settle-y": "20px",
                } as React.CSSProperties
              }
            >
              <p className="mb-4 font-display text-[1.375rem] leading-tight text-ink">
                Then one place worth going.
              </p>
              <div className="-rotate-[0.8deg]">
                <ExamplePickCard example={LOOK_BEYOND_EXAMPLE} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
