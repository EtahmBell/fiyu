interface DailyPicksCountdownProps {
  expiresAt: string;
  now: number;
}

export function formatPicksCountdown(milliseconds: number): string {
  const wholeMinutes = Math.floor(milliseconds / 60_000);
  // The canonical cycle is exactly 24 hours. Around assignment, a client clock
  // may trail the server very slightly; keep that narrow skew window from
  // presenting a fresh daily round as 24h or 24h 1m. Longer durations remain
  // visible so a real backend eligibility error is never masked.
  const minutes = Math.max(
    1,
    wholeMinutes >= 24 * 60 && milliseconds <= 24 * 60 * 60_000 + 2 * 60_000
      ? 24 * 60 - 1
      : wholeMinutes,
  );
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
