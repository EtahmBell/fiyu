import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type EyebrowTone = "lavender" | "champagne";

const TONES: Record<EyebrowTone, { text: string; rule: string }> = {
  lavender: { text: "text-lavender-800", rule: "bg-lavender-500" },
  champagne: { text: "text-gold-700", rule: "bg-gold" },
};

export interface EyebrowProps {
  children: ReactNode;
  tone?: EyebrowTone;
  as?: ElementType;
  id?: string;
  className?: string;
}

/**
 * The Fiyu masthead motif: a short violet rule, then tracked deep-plum caps.
 *
 * It sits above a serif headline or numeral and marks the start of an
 * editorial section, the way a printed guide flags a chapter. Spend it on
 * section openings only -- an eyebrow over every minor control stops reading
 * as a signature and starts reading as noise.
 *
 * The rule is a graphic (lavender-500), never text; the words carry the
 * meaning in lavender-800, which clears AA at this size on paper and on the
 * pale lavender wash.
 */
export function Eyebrow({ children, tone = "lavender", as: Tag = "p", id, className }: EyebrowProps) {
  const { text, rule } = TONES[tone];
  return (
    <Tag
      id={id}
      className={cn(
        "flex items-center gap-2.5 text-[0.6875rem] leading-4 font-semibold tracking-[0.16em] uppercase",
        text,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-0.5 w-5 shrink-0 rounded-full", rule)} />
      {children}
    </Tag>
  );
}
