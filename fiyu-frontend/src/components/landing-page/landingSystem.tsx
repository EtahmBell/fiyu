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

/**
 * Section padding, and the page's mobile rhythm in one place.
 *
 * Mobile was inheriting the desktop figure: 80px top and bottom on every section
 * meant 160px of padding between two blocks of copy on a 390px screen, which is a
 * quarter of the viewport spent on nothing. 56px is still generous at that width
 * -- the page should read as editorial rather than as endless -- and desktop is
 * untouched at 112px.
 *
 * Used only by landing-page sections, so changing the mobile step here is the
 * consistent fix rather than nine one-off overrides.
 */
export const LANDING_RHYTHM = "py-14 sm:py-20 lg:py-28";

/**
 * Every section heading below the hero. Colour is left to the caller.
 *
 * The lower bound is 2.25rem rather than 2.5rem, which is not a general shrink:
 * at 40px on a 350px measure "How Fiyu works" broke to two lines with one word on
 * the second, and every other heading on the page picked up a similar orphan. At
 * 36px they all set in one or two full lines. Desktop is unchanged, since the
 * viewport term takes over well before `sm`.
 */
export const LANDING_HEADING =
  "font-display text-[clamp(2.25rem,4.4vw,4.25rem)] leading-[0.95] tracking-[-0.02em]";

/**
 * A tracked label with a short rule leading into it: the recurring mark that
 * opens each section and ties them to one another.
 */
const EYEBROW_TONES = {
  /** The default: lavender is the brand, and this is the recurring mark. */
  ink: { text: "text-lavender-700", rule: "bg-rose-dust" },
  /** On plum. */
  inverse: { text: "text-lavender-100", rule: "bg-lavender-100/45" },
  /**
   * Champagne, for the one section whose identity is context rather than
   * discovery. `gold-700` is the text step (5.04:1 on white); `gold` is a
   * graphics-only tone and is used here for a hairline, never for type.
   */
  champagne: { text: "text-gold-700", rule: "bg-gold" },
} as const;

export type EyebrowTone = keyof typeof EYEBROW_TONES;

export function SectionEyebrow({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: EyebrowTone;
  className?: string;
}) {
  const { text, rule } = EYEBROW_TONES[tone];
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.2em] uppercase",
        text,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-px w-7 shrink-0", rule)} />
      {children}
    </p>
  );
}
