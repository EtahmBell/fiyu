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

/**
 * When the next round arrives, set as a dateline.
 *
 * Compact metadata in the right side of the Picks masthead. The caller owns
 * the shared divider; this component owns only the canonical expiry wording.
 *
 * The element keeps its own live region: the caller lays it out, but the
 * announcement belongs to the value.
 */
export function DailyPicksCountdown({ expiresAt, now }: DailyPicksCountdownProps) {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;

  const remaining = expiresAtMs - now;
  const ready = remaining <= 0;

  return (
    <p
      data-testid="daily-picks-countdown"
      aria-live="polite"
      aria-atomic="true"
      className="shrink-0 pb-0.5 text-right"
    >
      <span className="block text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-muted uppercase">
        Next Picks
      </span>
      {ready ? (
        <span className="mt-1 block text-sm font-semibold text-lavender-700">Ready</span>
      ) : (
        <time dateTime={expiresAt} className="mt-1 block text-sm font-semibold text-plum tabular-nums">
          {formatPicksCountdown(remaining)}
        </time>
      )}
    </p>
  );
}
