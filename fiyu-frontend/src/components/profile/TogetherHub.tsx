"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
import { TOGETHER_CAPS, TogetherAvatar, TogetherPairMark, usePrefersReducedMotion, type TogetherPerson } from "@/components/profile/TogetherIdentity";
import { TogetherPendingInvitation } from "@/components/profile/TogetherPendingInvitation";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { Button } from "@/components/ui/Button";
import { createTogetherInvite, fetchTogetherState } from "@/lib/api/client";
import type { TogetherInviteCreated, TogetherSession, TogetherState } from "@/lib/api/schemas";
import { useAccountQuery } from "@/lib/accountQueryCache";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { activeTogetherSessions, formatTogetherExpiry, togetherExpiryMs, togetherPartnerKey } from "@/lib/profile/togetherLifecycle";
import { useTogetherLifecycleClock } from "@/lib/profile/useTogetherLifecycleClock";
import { consumeTogetherRevealArrival } from "@/lib/profile/togetherRevealArrival";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";
import { cn } from "@/lib/utils/cn";

const MEASURE = "mx-auto w-full max-w-[64rem] px-5 sm:px-8 lg:px-12";
const STAGGER_MS = 150;

interface PartnerGroup {
  key: string;
  partner: TogetherPerson;
  sessions: TogetherSession[];
}

function partnerPerson(session: TogetherSession | null): TogetherPerson {
  return { displayName: session?.partner?.display_name ?? "Your partner", avatarUrl: session?.partner?.avatar_url ?? null };
}

function groupByPartner(sessions: TogetherSession[]): PartnerGroup[] {
  const groups = new Map<string, PartnerGroup>();
  for (const session of sessions) {
    const key = togetherPartnerKey(session);
    const group = groups.get(key) ?? { key, partner: partnerPerson(session), sessions: [] };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    sessions: [...group.sessions].sort((left, right) => {
      if (left.reveal_pending !== right.reveal_pending) return left.reveal_pending ? -1 : 1;
      return Date.parse(right.generated_at ?? "") - Date.parse(left.generated_at ?? "");
    }),
  })).sort((left, right) => {
    const newest = (group: PartnerGroup) => Math.max(...group.sessions.map((session) => Date.parse(session.generated_at ?? "") || 0));
    return newest(right) - newest(left);
  });
}

export function TogetherHub({ initialSessionId }: { initialSessionId?: string }) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const reducedMotion = usePrefersReducedMotion();
  const accountId = identity.profile?.user_id;
  const load = useCallback(() => fetchTogetherState(), []);
  const query = useAccountQuery<TogetherState>({ resource: "together-state", accountId, loader: load, enabled: identity.status === "ready" && Boolean(accountId), maxAgeMs: 30_000 });
  const list = useDefaultList("tokyo", { accountId });
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const rawSessions = useMemo(() => query.data?.current_sessions ?? [], [query.data?.current_sessions]);
  const expiries = useMemo(() => rawSessions.map(togetherExpiryMs).filter(Number.isFinite), [rawSessions]);
  const refreshTogether = query.refresh;
  const now = useTogetherLifecycleClock(expiries, () => void refreshTogether(true).catch(() => undefined));
  const sessions = useMemo(() => activeTogetherSessions(rawSessions, now), [now, rawSessions]);
  const groups = useMemo(() => groupByPartner(sessions), [sessions]);
  const selectedGroup = useMemo(() => {
    const explicit = selectedSessionId ? groups.find((group) => group.sessions.some((session) => session.session_id === selectedSessionId)) : null;
    return explicit ?? groups[0] ?? null;
  }, [groups, selectedSessionId]);
  const pending = query.data?.session?.status === "pending" ? query.data.session : null;
  const pendingStatus = query.data?.session?.status;
  const [staggeredSessionId] = useState(() => initialSessionId && consumeTogetherRevealArrival(initialSessionId) ? initialSessionId : null);

  useEffect(() => {
    if (identity.status === "ready" && !accountId) router.replace("/signin?next=%2Ftogether");
  }, [accountId, identity.status, router]);

  useEffect(() => {
    if (pendingStatus !== "pending") return;
    const refresh = () => void refreshTogether(true).catch(() => undefined);
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [pendingStatus, refreshTogether]);

  const share = async (created: TogetherInviteCreated) => {
    const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share;
    if (nativeShare) await nativeShare.call(navigator, { title: "Fiyu Together", text: "Find three Fiyu Picks with me.", url: created.invite_url });
    else await navigator.clipboard.writeText(created.invite_url);
    setMessage(nativeShare ? "Invite ready to share." : "Invite link copied.");
  };

  const start = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const created = await createTogetherInvite();
      if (query.data) query.setData({ ...query.data, can_initiate: false, session: created.session });
      await share(created);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Together is unavailable right now.");
    } finally { setBusy(false); }
  };

  if (identity.status === "loading" || !accountId || query.status === "loading") return <FiyuLoadingScreen />;

  const state = query.data;
  const atCycleCap = state?.block_reason === "cycle_limit_reached";
  const you: TogetherPerson = { displayName: identity.profile?.display_name ?? identity.profile?.username ?? "You", avatarUrl: identity.profileImage };

  return (
    <main className="flex-1 pb-[calc(var(--spacing-mobile-nav)+2rem)] lg:pb-20">
      <header className="bg-plum-900">
        <div className={cn(MEASURE, "py-7 sm:py-10 lg:py-12")}>
          <Link href="/picks" className="inline-flex min-h-11 items-center text-sm font-semibold text-plum-mist hover:text-white">← Picks</Link>
          <p className={cn(TOGETHER_CAPS, "mt-4 text-plum-mist")}>Fiyu Together</p>
          <h1 className="mt-3 max-w-[20ch] font-display text-[clamp(1.75rem,7.2vw,3rem)] leading-[1.12] text-balance text-white">Places chosen for you and the people you’re with.</h1>
          {groups.length > 0 ? <p className="mt-4 text-sm text-plum-mist">{groups.length === 1 ? "One active partner" : `${groups.length} active partners`}</p> : null}
        </div>
      </header>

      <div className={cn(MEASURE, "pt-7 sm:pt-9")}>
        {groups.length > 1 ? (
          <div role="group" aria-label="Together partners" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
            {groups.map((group) => {
              const active = selectedGroup?.key === group.key;
              const target = group.sessions[0].session_id;
              return <button key={group.key} type="button" aria-pressed={active} onClick={() => {
                if (active) return;
                setSelectedSessionId(target);
                router.replace(`/together?session=${encodeURIComponent(target)}`, { scroll: false });
              }} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip border py-1.5 pr-4 pl-1.5 text-sm", active ? "border-plum-500/45 bg-plum-100 font-semibold text-plum-700" : "border-line bg-surface text-ink-muted hover:border-plum-line hover:text-ink")}>
                <TogetherAvatar person={group.partner} size="sm" tone="light" className="size-8" />
                <span>{group.partner.displayName}</span>
                {group.sessions.some((session) => session.reveal_pending) ? <span className={cn(TOGETHER_CAPS, "text-plum-700")}>New</span> : null}
              </button>;
            })}
          </div>
        ) : null}

        {message ? <p role="status" className="mt-5 text-sm text-ink-muted">{message}</p> : null}
        {pending ? <TogetherPendingInvitation className="mt-7" sessionId={pending.session_id} accountId={accountId} onResolved={async (notice) => { setMessage(notice); await refreshTogether(true); }} /> : null}

        {selectedGroup ? (
          <section className="mt-7 sm:mt-9" aria-labelledby="selected-together-title">
            <div className="flex items-center gap-5 border-b border-plum-line pb-6">
              <TogetherPairMark people={[you, selectedGroup.partner]} size="md" />
              <div><h2 id="selected-together-title" className="font-display text-2xl text-ink sm:text-[1.75rem]">Together with {selectedGroup.partner.displayName}</h2><p className="mt-1 text-sm text-ink-muted">{selectedGroup.sessions.reduce((total, session) => total + session.pick_count, 0)} active Picks</p></div>
            </div>

            <div className="mt-6 space-y-8">
              {selectedGroup.sessions.map((session, roundIndex) => {
                const expiry = togetherExpiryMs(session);
                const expiryLabel = Number.isFinite(expiry) ? formatTogetherExpiry(expiry, now) : null;
                const staggering = !reducedMotion && session.session_id === staggeredSessionId;
                return (
                  <section key={session.session_id} aria-label={`Together round ${roundIndex + 1}`} className={roundIndex ? "border-t border-line pt-7" : undefined}>
                    <div className="mb-4 flex items-center justify-between gap-4 text-xs text-ink-muted"><span>{roundIndex === 0 ? "Newest" : session.generated_at ? new Date(session.generated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Earlier"}</span>{expiryLabel ? <span>{expiryLabel}</span> : null}</div>
                    {session.reveal_pending ? (
                      <div className="rounded-card border border-plum-line bg-plum-50 px-6 py-9 text-center">
                        <p className="font-display text-2xl text-ink">Your Picks are ready.</p><p className="mt-2 text-sm text-ink-body">{session.pick_count} places are waiting for the two of you.</p>
                        <Link href={`/together/session/${encodeURIComponent(session.session_id)}`} className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-plum-900 px-6 text-sm font-semibold text-white hover:bg-plum">Reveal our Picks →</Link>
                      </div>
                    ) : (
                      <div className="rounded-card border border-plum-line bg-plum-50/70 p-2 sm:p-4"><div className="space-y-3 sm:space-y-4">
                        {session.restaurants.map((restaurant, index) => <div key={restaurant.place_id} data-fiyu-stagger={staggering ? String(index * STAGGER_MS) : undefined} style={staggering ? { animation: "fiyu-reveal-in 360ms var(--ease-fiyu) both", animationDelay: `${index * STAGGER_MS}ms` } : undefined}><CompactRestaurantCard restaurant={restaurant} tone="together" saved={list.isSaved(restaurant.place_id)} savePending={list.pendingPlaceIds.includes(restaurant.place_id)} onToggleSaved={() => void list.toggle(restaurant.place_id)} onViewDetails={() => router.push(`/restaurants/${encodeURIComponent(restaurant.place_id)}`)} /></div>)}
                      </div></div>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        ) : query.status === "error" ? <p role="alert" className="mt-8 text-sm text-ink-muted">Together is unavailable right now.</p> : pending ? null : (
          <section className="mt-8 max-w-[34rem] sm:mt-10"><h2 className="font-display text-[clamp(1.625rem,6.5vw,2rem)] text-ink">Find somewhere that works for both of you.</h2><p className="mt-3 text-sm text-ink-body">Three Picks, chosen around your shared taste.</p><div className="mt-6"><TogetherInitiation state={state} busy={busy} onStart={() => void start()} /></div></section>
        )}

        {selectedGroup && state?.can_initiate && !pending ? <div className="mt-8 border-t border-line pt-6"><button type="button" disabled={busy} onClick={() => void start()} className="inline-flex min-h-11 items-center text-sm font-semibold text-plum-700 underline decoration-plum-line underline-offset-4 disabled:opacity-50">Start another Together →</button></div> : selectedGroup && atCycleCap ? <p className="mt-8 border-t border-line pt-6 text-xs text-ink-faint">That’s every Together for this cycle. New Picks bring new ones.</p> : null}
      </div>
    </main>
  );
}

function TogetherInitiation({ state, busy, onStart }: { state: TogetherState | undefined; busy: boolean; onStart: () => void }) {
  if (!state) return null;
  if (state.block_reason === "ratings_required") return <p className="text-sm text-ink-body">Rate {Math.max(state.ratings_required - state.rated_visit_count, 0)} more visits to unlock Fiyu Together.</p>;
  if (state.block_reason === "premium_required") return <p className="text-sm text-ink-body">Fiyu Together is available with Fiyu Premium.</p>;
  if (state.block_reason === "cycle_limit_reached") return <p className="text-sm text-ink-body">That’s every Together for this cycle. New Picks bring new ones.</p>;
  if (!state.can_initiate) return null;
  return <><Button variant="primary" disabled={busy} onClick={onStart}>Start Together</Button>{!state.premium ? <p className="mt-3 text-xs text-ink-muted">Your first Together is included.</p> : null}</>;
}
