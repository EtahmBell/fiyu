import { cn } from "@/lib/utils/cn";

export interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder.
 *
 * aria-hidden by design: the surrounding region should own the loading
 * announcement (aria-busy / a live region), so screen readers hear "loading
 * restaurants" once instead of a list of empty boxes.
 *
 * The pulse keyframe is disabled by the global prefers-reduced-motion rule.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded bg-sunken", className)}
      style={{ animation: "fiyu-pulse 1.6s ease-in-out infinite" }}
    />
  );
}
