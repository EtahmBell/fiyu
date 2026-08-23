import { cn } from "@/lib/utils/cn";

export function FiyuLoadingScreen({
  contained = false,
  className,
}: {
  contained?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading Fiyu"
      aria-busy="true"
      data-testid="fiyu-loading-screen"
      className={cn(
        "flex items-center justify-center bg-canvas px-5",
        contained ? "min-h-48" : "min-h-[calc(100dvh-var(--spacing-header))]",
        className,
      )}
    >
      <span className="font-display text-3xl tracking-[-0.02em] text-ink">Fiyu</span>
    </div>
  );
}
