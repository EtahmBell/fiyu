import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
} from "@/components/landing-page/landingSystem";
import { cn } from "@/lib/utils/cn";

const steps = [
  {
    number: "01",
    title: "Tell us what you like",
    copy: "Choose your food interests and how adventurous you want to be.",
  },
  {
    number: "02",
    title: "Receive a few considered picks",
    copy: "Fiyu selects a small daily set instead of giving you an endless feed.",
  },
  {
    number: "03",
    title: "Reveal, save, and visit",
    copy: "Explore each restaurant, keep the ones you love, and experience the city thoughtfully.",
  },
] as const;

export function HowFiyuWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-canvas">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <div>
          <h2 className={cn(LANDING_HEADING, "text-ink")}>How Fiyu works</h2>
        </div>

        {/*
         * Ruled columns rather than cards: the numerals and the fine lines do
         * the structural work, which keeps the section composed without adding
         * three boxes to a page that is otherwise unboxed.
         */}
        <ol className="mt-14 grid border-t border-line md:mt-20 md:grid-cols-3 md:border-b">
          {steps.map((step, index) => (
            <li
              key={step.number}
              className={cn(
                "border-b border-line py-9 md:border-b-0 md:py-12",
                index > 0 && "md:border-l md:border-line md:pl-10",
                index < steps.length - 1 && "md:pr-10",
              )}
            >
              <p
                aria-hidden="true"
                className="font-display text-[2.5rem] leading-none text-rose-dust"
              >
                {step.number}
              </p>
              <h3 className="mt-7 max-w-[15rem] font-display text-[1.75rem] leading-[1.15] text-ink">
                {step.title}
              </h3>
              <p className="mt-4 max-w-[20rem] text-[0.9375rem] leading-7 text-ink-muted">
                {step.copy}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
