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
import { SlotImage } from "@/components/landing-page/SlotImage";
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

/**
 * How far apart the four signals arrive.
 *
 * Raised from 110ms, and the rules and copy lengthened with it, because the
 * sequence was finishing in a little over a second -- fast enough to register as
 * a flicker rather than as four things being read. At 190ms it runs for about
 * 1.7 seconds end to end, which is roughly the pacing of the card arrivals under
 * "Only a few." and the point at which a reader can follow it.
 *
 * There is room for it now: the entrance no longer fires until a quarter of the
 * section is on screen, so a slower sequence does not go back to finishing below
 * the fold.
 */
const SIGNAL_STAGGER_MS = 190;

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
  /*
   * Observed on the section, and gated on a quarter of it having arrived.
   *
   * This was the bug. The observer had no threshold, so it reported intersecting
   * the instant the element's top edge crossed the root -- and the element was
   * the whole section, eight hundred pixels of it. The sequence therefore started
   * while only the eyebrow had appeared, and finished about a second and a half
   * later, by which time a reader scrolling normally had carried the signals and
   * the closing line past the fold. Nothing was broken; the entrance simply ran
   * off screen, which is why it appeared to work only when the page was reloaded
   * with the section already in view.
   *
   * A quarter of the section is roughly its heading plus the top of the signal
   * row: enough on screen that the sequence is watched rather than merely
   * completed. Expressed against the section's own height, it scales by itself
   * from a 700px desktop section to an 1100px one on a phone.
   *
   * This is also what affords the slower pacing above: the sequence starts with
   * the signal row arriving rather than with the eyebrow, so 1.7 seconds of it
   * happens on screen.
   */
  const { ref, entered } = useEntered<HTMLElement>({
    rootMargin: "0px",
    threshold: 0.25,
  });
  const flag = entered ? "true" : "false";
  const example = LOOK_BEYOND_EXAMPLE;

  return (
    <section
      id="look-beyond"
      ref={ref}
      className="scroll-mt-24 border-b border-gold-line bg-gold-soft/30"
    >
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
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
                style={
                  {
                    "--rule-delay": index * SIGNAL_STAGGER_MS + 60 + "ms",
                    "--rule-duration": "850ms",
                  } as React.CSSProperties
                }
              />
              <div
                className="fiyu-lp-rise pt-4"
                data-in={flag}
                style={
                  {
                    "--rise-delay": index * SIGNAL_STAGGER_MS + 240 + "ms",
                    "--rise-duration": "700ms",
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
         * And one place, with a picture of the kind of street it is on.
         *
         * The photograph is about a third of this row and the last thing in the
         * section, which is the right weight: Underexposure is an argument, and an
         * argument should not be illustrated more than it is made. It also stays
         * intentional while the slot is empty, because the row is a grid with a
         * fixed aspect box in it rather than a layout that depends on an image.
         */}
        <div
          className="fiyu-lp-rise mt-10 grid grid-cols-[9rem_minmax(0,1fr)] items-end gap-5 border-t border-gold-line pt-6 sm:mt-14 sm:grid-cols-[minmax(0,0.3fr)_minmax(0,0.7fr)] sm:gap-8"
          data-in={flag}
          style={{ "--rise-delay": "960ms", "--rise-from": "12px" } as React.CSSProperties}
        >
          <div className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-card border border-gold-line">
            <SlotImage
              slot="underexposure_paris"
              sizes="(max-width: 639px) 9rem, 30vw"
            />
          </div>

          <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <IllustrativeNote>Illustrative discovery</IllustrativeNote>
              <p className="mt-3 font-display text-[clamp(1.375rem,3vw,2.5rem)] leading-tight text-ink">
                {example.name}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {example.area}, {example.city} · {example.category}
              </p>
            </div>
            <ScoreMark score={scoreMarkValue(example.displayScore)} size="lg" className="shrink-0" />
          </div>
        </div>
      </div>
    </section>
  );
}
