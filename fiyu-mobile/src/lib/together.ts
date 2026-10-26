import type { TogetherSession, TogetherState } from "@fiyu/contracts";

export const TOGETHER_CANDIDATE_COUNT = 3;

export function activeTogetherSessions(sessions: TogetherSession[], now = Date.now()): TogetherSession[] {
  return sessions.filter((session) => {
    if (!session.active_for_current_user) return false;
    const expiry = session.expires_at_for_current_user ? Date.parse(session.expires_at_for_current_user) : Number.POSITIVE_INFINITY;
    return Number.isNaN(expiry) || expiry > now;
  });
}

export function togetherEntryState(state: TogetherState, now = Date.now()) {
  const sessions = activeTogetherSessions(state.current_sessions, now);
  const unrevealed = sessions.find((session) => session.reveal_pending);
  if (unrevealed) return { kind: "ready" as const, session: unrevealed, sessions };
  if (sessions.length > 0) return { kind: "active" as const, sessions };
  if (state.session?.status === "pending") return { kind: "pending" as const, session: state.session, sessions };
  if (state.can_initiate) return { kind: "eligible" as const, sessions };
  if (state.block_reason === "ratings_required") {
    return { kind: "ratings_required" as const, remaining: Math.max(state.ratings_required - state.rated_visit_count, 0), sessions };
  }
  if (state.block_reason === "cycle_limit_reached") return { kind: "cycle_limit" as const, sessions };
  return { kind: "unavailable" as const, sessions };
}

export function togetherPartnerName(session: TogetherSession | null | undefined): string {
  return session?.partner?.display_name ?? "your partner";
}

export function safeTogetherReturnTo(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\/together(?:\/|\?|$)/.test(candidate) ? candidate : null;
}
