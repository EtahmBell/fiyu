/**
 * The handoff between the Together reveal and the Together hub.
 *
 * The reveal route owns the moment before the Picks exist for this participant
 * -- the pair, the glyph, the one CTA -- and the hub owns the Picks themselves.
 * Splitting the sequence across a route change means the hub has to know
 * whether this arrival is the end of that sequence, so that the three cards
 * stagger in once and only once.
 *
 * Deliberately a module variable rather than a query parameter or storage:
 *
 *   - the URL contract stays exactly `/together?session=<id>`, which is also
 *     the link a user may bookmark or be sent;
 *   - a reload replays nothing, because a reload is not the reveal;
 *   - switching partners in the hub replays nothing, because the flag names
 *     one session and is consumed on read.
 *
 * It carries no restaurant data. Nothing here decides what is revealed; the
 * reveal API has already done that by the time this is set.
 */

let arrival: string | null = null;
let consumed: { sessionId: string; at: number } | null = null;

/**
 * How long a consumed arrival keeps answering yes.
 *
 * React may run a component body -- and with it a `useState` initializer --
 * more than once for a single mount, in StrictMode and whenever a render is
 * discarded. A one-shot flag would hand the stagger to a render that is thrown
 * away and leave the real one without it, so the answer is held briefly and
 * the same mount asking twice gets the same result. A second visit to the same
 * session inside a second is not reachable through the interface.
 */
const REPEAT_WINDOW_MS = 1_000;

/** Called by the reveal route immediately after a successful reveal call. */
export function markTogetherRevealArrival(sessionId: string): void {
  arrival = sessionId;
  consumed = null;
}

/** True for the session that was just revealed, on that arrival only. */
export function consumeTogetherRevealArrival(sessionId: string): boolean {
  if (arrival === sessionId) {
    arrival = null;
    consumed = { sessionId, at: Date.now() };
    return true;
  }
  return consumed?.sessionId === sessionId && Date.now() - consumed.at < REPEAT_WINDOW_MS;
}

/** Test helper: drop any pending or recently consumed arrival between cases. */
export function clearTogetherRevealArrival(): void {
  arrival = null;
  consumed = null;
}
