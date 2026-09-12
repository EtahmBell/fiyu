import type { TogetherSession } from "@/lib/api/schemas";

export function togetherExpiryMs(session: TogetherSession): number {
  return Date.parse(session.expires_at_for_current_user ?? "");
}

export function activeTogetherSessions(
  sessions: readonly TogetherSession[],
  now: number,
): TogetherSession[] {
  return sessions.filter((session) => {
    const expiry = togetherExpiryMs(session);
    return Number.isFinite(expiry) ? expiry > now : session.active_for_current_user !== false;
  });
}

export function formatTogetherExpiry(expiresAt: number, now: number): string {
  const remaining = expiresAt - now;
  if (remaining <= 0) return "Expired";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.ceil(remaining / 3_600_000);
  if (hours < 24) return `Expires in ${hours}h`;
  const days = Math.ceil(remaining / 86_400_000);
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export function togetherPartnerKey(session: TogetherSession): string {
  return session.partner_key
    ?? session.partner?.username
    ?? `${session.partner?.display_name ?? "partner"}:${session.partner?.avatar_url ?? ""}`;
}
