import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type StatusTone = "info" | "error" | "warning" | "empty";

const TONE_CLASSES: Record<StatusTone, string> = {
  info: "border-hairline bg-surface",
  error: "border-accent/30 bg-accent-soft/50",
  warning: "border-status-closed/30 bg-status-closed/5",
  empty: "border-hairline border-dashed bg-transparent",
};

export interface StatusMessageProps {
  title: string;
  description?: ReactNode;
  /** Retry button, link, or similar. */
  action?: ReactNode;
  tone?: StatusTone;
  /**
   * Announce to assistive tech when this replaces content after an action.
   * Leave false for states present on first render.
   */
  live?: boolean;
  className?: string;
}

/**
 * The single surface for loading failures, empty results and provider errors.
 *
 * Every state in the app routes through this component so that copy, spacing
 * and announcement behaviour stay consistent instead of drifting per feature.
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
        "flex flex-col items-start gap-3 rounded-card border p-5 text-left",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <div className="space-y-1.5">
        <p className="font-display text-lg leading-tight text-ink">{title}</p>
        {description && (
          <div className="text-sm leading-relaxed text-ink-muted">{description}</div>
        )}
      </div>
      {action}
    </div>
  );
}
