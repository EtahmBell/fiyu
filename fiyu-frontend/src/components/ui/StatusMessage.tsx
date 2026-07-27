import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type StatusTone = "info" | "error" | "warning" | "empty";

/**
 * Tones are distinguished by a left rule and a light wash rather than by a full
 * outlined box. Boxed alerts are the most dashboard-looking element in a UI.
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  info: "border-l-2 border-l-line-strong bg-surface",
  error: "border-l-2 border-l-lavender-600 bg-lavender-50",
  warning: "border-l-2 border-l-status-closed bg-status-closed/5",
  empty: "border-l-2 border-l-line bg-transparent",
};

export interface StatusMessageProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: StatusTone;
  /** Announce when this replaces content after an action. */
  live?: boolean;
  className?: string;
}

/**
 * The single surface for loading failures, empty results and provider errors,
 * so copy, spacing and announcement behaviour stay consistent.
 */
export function StatusMessage({
  title,
  description,
  action,
  tone = "info",
  live = false,
  className,
}: StatusMessageProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={live ? "polite" : undefined}
      className={cn(
        "flex flex-col items-start gap-4 rounded-r-card py-5 pr-5 pl-5",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <div className="space-y-2">
        <p className="font-display text-xl leading-tight text-ink">{title}</p>
        {description && (
          <div className="max-w-prose text-sm leading-relaxed text-ink-muted">{description}</div>
        )}
      </div>
      {action}
    </div>
  );
}
