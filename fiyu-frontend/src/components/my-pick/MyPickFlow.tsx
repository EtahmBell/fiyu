"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GooglePlaceSelector } from "@/components/my-pick/GooglePlaceSelector";
import { Button } from "@/components/ui/Button";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { fetchMyPick, fetchMyPicks, submitMyPick } from "@/lib/api/client";
import type { MyPick } from "@/lib/api/schemas";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

const POLLING = new Set(["pending", "resolving_identity", "researching"]);
const COPY: Record<MyPick["status"], { title: string; body: string }> = {
  pending: { title: "Your Pick is queued", body: "We’ll begin by confirming the restaurant." },
  resolving_identity: { title: "Confirming the restaurant", body: "Fiyu is matching this place to a canonical restaurant identity." },
  researching: { title: "Researching your Pick", body: "We’re gathering evidence and applying the same deterministic score used by Fiyu." },
  ready: { title: "Your Pick is ready", body: "Here is Fiyu’s current research result." },
  needs_location: { title: "Scored, location still under review", body: "The score is ready, but there is not yet a trustworthy map position." },
  outside_coverage: { title: "Outside our current coverage", body: "My Pick currently covers restaurants within the Tokyo service area." },
  needs_review: { title: "A closer look is needed", body: "Fiyu could not resolve this restaurant confidently enough to publish an automatic result." },
  failed_retryable: { title: "We hit a temporary problem", body: "Your request is saved and can be retried without submitting the restaurant again." },
  failed_terminal: { title: "This request could not be completed", body: "Fiyu could not confirm this as a current restaurant." },
};
const label = (item: MyPick) => item.name_en || item.name_ja || item.display_name_hint || "Restaurant request";

export function MyPickFlow({ initialMyPickId = null }: { initialMyPickId?: string | null }) {
  const identity = useProfileIdentity();
  const router = useRouter();
  const accountId = identity.profile?.user_id ?? null;
  const list = useDefaultList("tokyo", { accountId, enabled: Boolean(accountId) });
  const [current, setCurrent] = useState<MyPick | null>(null);
  const [history, setHistory] = useState<MyPick[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);
  useEffect(() => { if (identity.status === "ready" && !identity.profile) router.replace("/signin?next=%2Fmy-pick"); }, [identity.profile, identity.status, router]);
  const refreshHistory = useCallback(() => fetchMyPicks().then(setHistory), []);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    void fetchMyPicks({ signal: controller.signal }).then(setHistory).catch(() => undefined);
    if (initialMyPickId) void fetchMyPick(initialMyPickId, { signal: controller.signal }).then(setCurrent).catch(() => undefined);
    return () => controller.abort();
  }, [accountId, initialMyPickId]);
  useEffect(() => {
    if (!current || !POLLING.has(current.status)) return;
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (document.visibilityState === "hidden") { schedule(); return; }
        try {
          const next = await fetchMyPick(current.my_pick_id);
          if (cancelled) return;
          pollCount.current += 1; setCurrent(next);
          if (!POLLING.has(next.status)) void refreshHistory();
        } catch { if (!cancelled) schedule(); }
      }, [2000, 3000, 5000][Math.min(pollCount.current, 2)]);
    };
    schedule();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [current, refreshHistory]);
  const submit = async () => {
    if (!selectedPlaceId) return;
    setSubmitting(true); setError(null);
    try {
      const result = await submitMyPick(selectedPlaceId);
      pollCount.current = 0; setCurrent(result); setSelectedPlaceId(null);
      router.replace(`/my-pick?id=${encodeURIComponent(result.my_pick_id)}`);
      void refreshHistory();
    } catch { setError("My Pick could not be submitted right now. Please try again."); }
    finally { setSubmitting(false); }
  };
  if (identity.status === "loading" || (identity.status === "ready" && !identity.profile)) return <main className="mx-auto max-w-3xl px-page py-12" role="status">Preparing My Pick…</main>;
  const saved = current?.place_id ? list.isSaved(current.place_id) : false;
  const publicPlaceId = current?.status === "ready" && current.is_public ? current.place_id : null;
  return <main className="mx-auto w-full max-w-3xl px-page pt-8 pb-[calc(var(--spacing-mobile-nav)+2rem)] lg:py-12">
    <p className="text-xs font-semibold tracking-[0.15em] text-lavender-700 uppercase">Your request</p><h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">My Pick</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">Choose a restaurant in Tokyo. Fiyu will confirm it, research it, and return our current score—even when that score is low.</p>
    <section className="mt-8 rounded-card border border-line bg-surface p-5 sm:p-7" aria-labelledby="choose-title"><h2 id="choose-title" className="font-display text-2xl text-ink">Choose a restaurant</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Search within Fiyu’s current Tokyo service area. Selecting a suggestion sends only its Google Place ID to Fiyu.</p><div className="mt-5"><GooglePlaceSelector disabled={submitting} onSelect={setSelectedPlaceId} /></div>{selectedPlaceId ? <p role="status" className="mt-3 text-sm font-medium text-plum">Restaurant selected. Ready to ask Fiyu.</p> : null}<Button className="mt-4 w-full sm:w-auto" variant="primary" disabled={!selectedPlaceId || submitting} onClick={() => void submit()}>{submitting ? "Submitting…" : "Ask Fiyu about this place"}</Button>{error ? <p role="alert" className="mt-3 text-sm text-dusty-rose">{error}</p> : null}</section>
    {current ? <section className="mt-6 rounded-card border border-line bg-surface p-5 sm:p-7" aria-live="polite" aria-labelledby="result-title"><div className="flex items-start justify-between gap-5"><div><p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{POLLING.has(current.status) ? "In progress" : "My Pick"}</p><h2 id="result-title" className="mt-2 font-display text-2xl text-ink">{COPY[current.status].title}</h2></div>{current.fiyu_score !== null ? <ScoreMark score={current.fiyu_score} size="md" /> : null}</div><p className="mt-3 text-sm leading-6 text-ink-muted">{COPY[current.status].body}</p>{(current.name_en || current.name_ja) ? <h3 className="mt-5 font-display text-xl text-ink">{label(current)}</h3> : null}{current.display_area || current.primary_category ? <p className="mt-1 text-sm text-ink-muted">{[current.primary_category, current.display_area].filter(Boolean).join(" · ")}</p> : null}{current.recommendation_review_status === "pending" && !current.is_public ? <p className="mt-4 rounded-lg bg-lavender-50 px-4 py-3 text-sm text-plum">This one caught our eye. We’ve sent it to Fiyu for a closer look.</p> : null}{current.status === "ready" && !current.is_public ? <p className="mt-4 text-sm text-ink-muted">This is your private result. It is not currently part of the public Fiyu catalog.</p> : null}{publicPlaceId ? <div className="mt-5 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-lg bg-lavender-600 px-5 text-sm font-medium text-white" href={`/restaurants/${publicPlaceId}`}>View restaurant</Link><Button variant="secondary" disabled={list.pendingPlaceIds.includes(publicPlaceId)} onClick={() => void list.toggle(publicPlaceId)}>{saved ? "Saved" : "Save"}</Button><Link className="inline-flex min-h-11 items-center rounded-lg border border-line px-5 text-sm font-medium text-ink" href={`/log?placeId=${encodeURIComponent(publicPlaceId)}`}>Log visit</Link></div> : null}</section> : null}
    {history.length ? <section className="mt-10" aria-labelledby="history-title"><h2 id="history-title" className="font-display text-2xl text-ink">Your My Picks</h2><ul className="mt-4 divide-y divide-line border-y border-line">{history.slice(0, 12).map((item) => <li key={item.my_pick_id}><button type="button" className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left" onClick={() => { setCurrent(item); router.replace(`/my-pick?id=${encodeURIComponent(item.my_pick_id)}`); }}><span><span className="block font-medium text-ink">{label(item)}</span><span className="mt-1 block text-xs text-ink-muted">{COPY[item.status].title}</span></span><span className="text-lavender-700">→</span></button></li>)}</ul></section> : null}
  </main>;
}
