import { cn } from "@/lib/utils/cn";

export interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder.
 *
 * aria-hidden by design: the surrounding region owns the loading announcement
 * (role="status" / aria-busy), so a screen reader hears "loading restaurants"
 * once rather than a list of empty boxes.
 *
 * A slow lateral sweep rather than an opacity pulse -- pulsing blocks read as a
 * generic template. The sweep is disabled by the global reduced-motion rule,
 * leaving a plain tinted block.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded bg-subtle", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "fiyu-shimmer 1.8s var(--ease-fiyu) infinite",
      }}
    />
  );
}
