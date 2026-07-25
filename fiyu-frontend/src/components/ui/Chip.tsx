"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface ChipProps {
  children: ReactNode;
  /** Toggle state. Exposed to assistive tech via aria-pressed. */
  selected?: boolean;
  onClick?: () => void;
  /** Result count rendered as a subdued suffix. */
  count?: number;
  disabled?: boolean;
  lang?: string;
  className?: string;
}

/**
 * Interactive filter chip.
 *
 * Uses aria-pressed rather than a checkbox role because filters are toggles
 * within a group, not form inputs, and the pressed state is what a screen
 * reader should announce.
 */
export function Chip({
  children,
  selected = false,
  onClick,
  count,
  disabled = false,
  lang,
  className,
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-chip border px-3 py-1.5 text-sm",
        "transition-colors duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-accent bg-accent text-white"
          : "border-hairline bg-surface text-ink-muted hover:border-ink-faint hover:text-ink",
        className,
      )}
    >
      <span lang={lang}>{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            "text-xs tabular-nums",
            selected ? "text-white/70" : "text-ink-faint",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
