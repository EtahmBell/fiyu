"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface ChipProps {
  children: ReactNode;
  /** Toggle state. Exposed to assistive tech via aria-pressed. */
  selected?: boolean;
  onClick?: () => void;
  count?: number;
  disabled?: boolean;
  lang?: string;
  className?: string;
}

/**
 * Interactive filter chip.
 *
 * aria-pressed rather than a checkbox role: these are toggles within a group,
 * not form inputs, and pressed state is what a screen reader should announce.
 *
 * min-h-11 guarantees the 44px touch target on mobile, where these sit in a
 * horizontally scrollable row.
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
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip border px-4 text-sm",
        "transition-[background-color,border-color,color,transform] duration-[180ms]",
        "ease-(--ease-fiyu) active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-lavender-600 bg-lavender-600 font-medium text-white"
          : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      <span lang={lang}>{children}</span>
      {count !== undefined && (
        <span
          className={cn("text-xs tabular-nums", selected ? "text-white/75" : "text-ink-faint")}
        >
          {count}
        </span>
      )}
    </button>
  );
}
