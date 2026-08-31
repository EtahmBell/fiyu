interface DailyPicksCountdownProps {
  expiresAt: string;
  now: number;
}

export function formatPicksCountdown(milliseconds: number): string {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function DailyPicksCountdown({ expiresAt, now }: DailyPicksCountdownProps) {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;

  const remaining = expiresAtMs - now;
  const ready = remaining <= 0;

  return (
    <div
      data-testid="daily-picks-countdown"
      aria-live="polite"
      aria-atomic="true"
      className="flex min-h-10 items-baseline justify-between gap-3 border-b border-line pb-3"
    >
      {ready ? (
        <p className="text-sm font-medium text-lavender-700">Your next Picks are ready</p>
      ) : (
        <>
          <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted uppercase">
            Next Picks in
          </p>
          <time
            dateTime={expiresAt}
            className="shrink-0 text-base font-semibold text-plum tabular-nums"
          >
            {formatPicksCountdown(remaining)}
          </time>
        </>
      )}
    </div>
  );
}
