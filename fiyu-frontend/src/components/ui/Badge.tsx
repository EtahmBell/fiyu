import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type BadgeTone = "outline" | "lavender" | "open" | "closed" | "quiet";

const TONE_CLASSES: Record<BadgeTone, string> = {
  // Default tag treatment: a hairline outline, no fill. Filled chips en masse
  // are what makes a card look like a status dashboard.
  outline: "border border-line text-ink-muted",
  lavender: "bg-lavender-50 text-lavender-700",
  open: "bg-status-open/10 text-status-open",
  closed: "bg-status-closed/10 text-status-closed",
  quiet: "text-ink-faint",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Applied to the rendered element; use for language-tagged content. */
  lang?: string;
  className?: string;
  title?: string;
}

/** Small non-interactive label. For interactive filters use `Chip`. */
export function Badge({ children, tone = "outline", lang, className, title }: BadgeProps) {
  return (
    <span
      lang={lang}
      title={title}
      className={cn(
        "inline-flex items-center rounded-chip px-2.5 py-1 text-xs leading-4",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
