export function FiyuLoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Loading Fiyu"
      data-testid="fiyu-loading-screen"
      className="flex min-h-[calc(100dvh-var(--spacing-header))] items-center justify-center bg-canvas px-5"
    >
      <span className="font-display text-3xl tracking-[-0.02em] text-ink">Fiyu</span>
    </div>
  );
}
