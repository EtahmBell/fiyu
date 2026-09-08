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
 * One line rather than a row of its own. This used to be a full-width band with
 * a tracked label at one end, a bold figure at the other and its own rule
 * underneath -- roughly forty pixels of page telling the reader something they
 * are not waiting for, directly above the restaurants they are. It now sits on
 * the baseline of the section heading and shares that heading's rule, so the
 * information survives at a fraction of the weight.
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
      className="shrink-0 text-[0.8125rem] leading-5 text-ink-muted"
    >
      {ready ? (
        <span className="font-medium text-lavender-700">Your next Picks are ready</span>
      ) : (
        <>
          Next Picks in{" "}
          <time dateTime={expiresAt} className="font-semibold text-plum tabular-nums">
            {formatPicksCountdown(remaining)}
          </time>
        </>
      )}
    </p>
  );
}
