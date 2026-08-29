"use client";

import { IllustrativeNote } from "@/components/landing-page/ExamplePickCard";
import {
  LOOK_BEYOND_EXAMPLE,
  scoreMarkValue,
} from "@/components/landing-page/fictionalRestaurantExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { cn } from "@/lib/utils/cn";

/**
 * Look beyond what rises to the top.
 *
 * Why Fiyu can see places other platforms cannot, without a node, an edge or a
 * glow anywhere. Four things Fiyu reads, set as an editorial index, each opened
 * by a hairline that draws itself in.
 *
 * The previous version had a real bug and a real excess. The pick card was placed
 * at `col-start-4 span-5` with a negative top margin to pull it back up into the
 * first grid row, which put it straight through the paragraph in the left column
 * at some widths -- it read as a rendering fault, because it was one. And the
 * section carried a five-line paragraph plus four two-line explanations, which is
 * more prose than any single claim on this page has earned.
 *
 * Rebuilt with no overlap at all: heading and three lines of standfirst, then the
 * four signals on their own row, then one ruled line naming the place they
 * resolve into. Nothing is positioned against anything else, so there is no
 * width at which two things can collide, and nothing is clipped because nothing
 * leaves its own box.
 *
 * The card became a line. A full card here was the fourth appearance of the same
 * object within three screens, and it only needed to say "and here is one".
 *
 * Entrance motion only. This is a claim about judgement; scrubbing it against a
 * scrollbar would make it feel like a machine demonstrating itself.
 *
 * The one section on the page that is champagne rather than lavender. It sat on
 * `bg-subtle`, a cool lavender-grey, directly above "Only a few." on
 * `bg-lavender-50` -- two pale lavenders in a row, and in a browser recording they
 * ran together into one long section. Champagne already means secondary and
 * editorial context in this system, which is exactly what this section is:
 * lavender stays with discovery, and the parchment wash, the brass eyebrow and the
 * warm hairlines give this one an identity of its own. It is spent here and
 * nowhere else.
 */

const SIGNALS = [
  {
    label: "Local-language context",
    copy: "What people say about a place in the language they live in.",
  },
  {
    label: "Independent",
    copy: "Small, owner-run kitchens rather than groups with reach to spend.",
  },
  {
    label: "Strong local signals",
    copy: "Consistent quality without needing mass visibility.",
  },
  {
    label: "Underexposed",
    copy: "Better than its digital footprint suggests.",
  },
] as const;

export function LookBeyondSection() {
  const { ref, entered } = useEntered<HTMLDivElement>();
  const flag = entered ? "true" : "false";
  const example = LOOK_BEYOND_EXAMPLE;

  return (
    <section id="look-beyond" className="scroll-mt-24 border-b border-gold-line bg-gold-soft/30">
      <div ref={ref} className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <SectionEyebrow tone="champagne">Underexposure</SectionEyebrow>
        <div className="mt-5 grid gap-x-16 gap-y-6 sm:mt-6 sm:gap-y-8 lg:grid-cols-[minmax(0,0.52fr)_minmax(0,0.48fr)] lg:items-end">
          <h2 className={cn(LANDING_HEADING, "max-w-[18ch] text-ink")}>
            Look beyond what rises to the top.
          </h2>
          <p className="max-w-[30rem] text-base leading-7 text-ink-muted sm:leading-8 lg:pb-2">
            Discovery platforms reinforce whatever is already easiest to find. Fiyu reads the
            context those platforms never index, and weighs quality against how widely a place
            is already known.
          </p>
        </div>

        {/* The four signals, on one row. Nothing overlaps anything. */}
        <ol className="mt-10 grid gap-x-10 gap-y-7 sm:mt-14 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-4 lg:gap-x-12">
          {SIGNALS.map((signal, index) => (
            <li key={signal.label} className="min-w-0">
              <span
                aria-hidden="true"
                className="fiyu-lp-rule block h-px w-full origin-left bg-gold-line"
                data-in={flag}
                style={{ "--rule-delay": index * 140 + 100 + "ms" } as React.CSSProperties}
              />
              <div
                className="fiyu-lp-rise pt-4"
                data-in={flag}
                style={
                  {
                    "--rise-delay": index * 140 + 240 + "ms",
                    "--rise-from": "10px",
                  } as React.CSSProperties
                }
              >
                <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-gold-700 uppercase">
                  {signal.label}
                </p>
                <p className="mt-2.5 max-w-[22rem] text-[0.9375rem] leading-6 text-ink-muted">
                  {signal.copy}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/*
         * And one place. A single ruled line rather than a card: the last word of
         * the section, in the same measure as everything above it.
         */}
        <div
          className="fiyu-lp-rise mt-10 border-t border-gold-line pt-6 sm:mt-14"
          data-in={flag}
          style={{ "--rise-delay": "760ms", "--rise-from": "12px" } as React.CSSProperties}
        >
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
                Then one place worth going
              </p>
              <p className="mt-3 font-display text-[clamp(1.5rem,3vw,2.5rem)] leading-tight text-ink">
                {example.name}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {example.area}, {example.city} · {example.category}
              </p>
              <IllustrativeNote className="mt-4">Illustrative example</IllustrativeNote>
            </div>
            <ScoreMark score={scoreMarkValue(example.displayScore)} size="lg" className="shrink-0" />
          </div>
        </div>
      </div>
    </section>
  );
}
