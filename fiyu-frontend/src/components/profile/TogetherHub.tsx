"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { Button } from "@/components/ui/Button";
import { createTogetherInvite, fetchTogetherState } from "@/lib/api/client";
import type { TogetherInviteCreated, TogetherState } from "@/lib/api/schemas";
import { useAccountQuery } from "@/lib/accountQueryCache";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

export function TogetherHub({ initialSessionId }: { initialSessionId?: string }) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const accountId = identity.profile?.user_id;
  const load = useCallback(() => fetchTogetherState(), []);
  const query = useAccountQuery<TogetherState>({
    resource: "together-state",
    accountId,
    loader: load,
    enabled: identity.status === "ready" && Boolean(accountId),
    maxAgeMs: 30_000,
  });
  const list = useDefaultList("tokyo", { accountId });
  const [selectedId, setSelectedId] = useState(initialSessionId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sessions = useMemo(() => query.data?.current_sessions ?? [], [query.data?.current_sessions]);
  const pendingStatus = query.data?.session?.status;
  const refreshTogether = query.refresh;
  const selected = useMemo(
    () => sessions.find((session) => session.session_id === selectedId) ?? sessions[0] ?? null,
    [selectedId, sessions],
  );

  useEffect(() => {
    if (identity.status === "ready" && !accountId) {
      router.replace("/signin?next=%2Ftogether");
    }
  }, [accountId, identity.status, router]);

  useEffect(() => {
    if (pendingStatus !== "pending") return;
    const refresh = () => void refreshTogether(true).catch(() => undefined);
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
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
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(error instanceof Error ? error.message : "Together is unavailable right now.");
      }
    } finally { setBusy(false); }
  };

  if (identity.status === "loading" || !accountId || query.status === "loading") return <FiyuLoadingScreen />;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-gold-700 uppercase">Fiyu Together</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-5 border-b border-gold-line pb-6">
        <div>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">Your shared Picks</h1>
          <p className="mt-2 text-sm text-ink-muted">A separate set for each person you discover with.</p>
        </div>
        {query.data?.can_initiate ? <Button variant="secondary" disabled={busy} onClick={() => void start()}>{sessions.length ? "Start another" : "Start Together"}</Button> : null}
      </div>

      {query.data?.session?.status === "pending" ? (
        <p className="mt-5 text-sm text-ink-muted">An invitation is waiting to be accepted.</p>
      ) : null}
      {message ? <p role="status" className="mt-4 text-sm text-ink-muted">{message}</p> : null}

      {sessions.length > 1 ? (
        <div className="mt-7 flex gap-2 overflow-x-auto pb-1" aria-label="Together partners">
          {sessions.map((session) => (
            <button
              key={session.session_id}
              type="button"
              aria-pressed={selected?.session_id === session.session_id}
              onClick={() => {
                setSelectedId(session.session_id);
                router.replace(`/together?session=${encodeURIComponent(session.session_id)}`, { scroll: false });
              }}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${selected?.session_id === session.session_id ? "border-gold-700 bg-gold-soft text-ink" : "border-line bg-white text-ink-muted"}`}
            >
              {session.partner?.display_name ?? "Together partner"}
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <section className="mt-8" aria-labelledby="selected-together-title">
          <h2 id="selected-together-title" className="font-display text-2xl text-ink">Together with {selected.partner?.display_name ?? "your partner"}</h2>
          {selected.reveal_pending ? (
            <div className="mt-5 border-y border-gold-line py-6">
              <p className="text-sm text-ink-body">This shared set is ready.</p>
              <Link href={`/together/session/${encodeURIComponent(selected.session_id)}`} className="mt-3 inline-flex min-h-11 items-center font-semibold text-gold-700">Reveal our Picks →</Link>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {selected.restaurants.map((restaurant) => (
                <CompactRestaurantCard
                  key={restaurant.place_id}
                  restaurant={restaurant}
                  tone="history"
                  saved={list.isSaved(restaurant.place_id)}
                  savePending={list.pendingPlaceIds.includes(restaurant.place_id)}
                  onToggleSaved={() => void list.toggle(restaurant.place_id)}
                  onViewDetails={() => router.push(`/restaurants/${encodeURIComponent(restaurant.place_id)}`)}
                />
              ))}
            </div>
          )}
        </section>
      ) : query.status === "error" ? (
        <p role="alert" className="mt-8 text-sm text-ink-muted">Together is unavailable right now.</p>
      ) : (
        <section className="mt-10 max-w-lg">
          <h2 className="font-display text-2xl text-ink">Discover with someone else</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Invite someone and reveal three extra restaurants chosen for both of you.</p>
        </section>
      )}
    </main>
  );
}
