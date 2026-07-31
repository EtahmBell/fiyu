import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * The landing page's editorial system.
 *
 * One measure, one set of gutters, one vertical rhythm and one display scale,
 * shared by every section so the page reads as a single composition rather than
 * a stack of independently styled blocks. These are class strings assembled from
 * the existing tokens, not a second design system.
 */
export const LANDING_MEASURE = "mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-12";

/** Section padding. The hero sets its own, because it also carries a min height. */
export const LANDING_RHYTHM = "py-20 sm:py-24 lg:py-28";

/** Every section heading below the hero. Colour is left to the caller. */
export const LANDING_HEADING =
  "font-display text-[clamp(2.5rem,4.4vw,4.25rem)] leading-[0.95] tracking-[-0.02em]";

/**
 * A tracked label with a short rule leading into it: the recurring mark that
 * opens each section and ties them to one another.
 */
export function SectionEyebrow({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: "ink" | "inverse";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.2em] uppercase",
        tone === "inverse" ? "text-lavender-100" : "text-lavender-700",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-px w-7 shrink-0", tone === "inverse" ? "bg-lavender-100/45" : "bg-rose-dust")}
      />
      {children}
    </p>
  );
}
