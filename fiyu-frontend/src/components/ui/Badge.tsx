import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "accent" | "outline" | "open" | "closed" | "quiet";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-muted",
  accent: "bg-accent-soft text-accent-strong",
  outline: "border border-hairline text-ink-muted",
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
  /** Screen-reader-only expansion when the visible text is abbreviated. */
  title?: string;
}

/** Small non-interactive label. For interactive filters use `Chip`. */
export function Badge({ children, tone = "neutral", lang, className, title }: BadgeProps) {
  return (
    <span
      lang={lang}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs leading-5 font-medium tracking-wide",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
