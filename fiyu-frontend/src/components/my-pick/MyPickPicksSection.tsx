"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MyPickEntry } from "@/components/my-pick/MyPickEntry";
import revealStyles from "@/components/pick-reveal/PickReveal.module.css";
import { usePickRevealTransition } from "@/components/pick-reveal/usePickRevealTransition";
import { Button } from "@/components/ui/Button";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { fetchMyPicks } from "@/lib/api/client";
import type { MyPick } from "@/lib/api/schemas";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { cn } from "@/lib/utils/cn";

const PENDING_STATUSES = new Set<MyPick["status"]>(["pending", "resolving_identity", "researching"]);
const POLL_DELAYS_MS = [30_000, 60_000, 180_000] as const;

function itemName(item: MyPick): string {
  return item.name_en || item.name_ja || item.display_name_hint || "Your restaurant";
}

function revealStorageKey(accountId: string, itemId: string): string {
  return `fiyu:my-pick-revealed:${accountId}:${itemId}`;
}

function PendingMyPickCard({ item }: { item: MyPick }) {
  const name = item.name_en || item.name_ja || item.display_name_hint || "Your My Pick is under review";
  return (
    <article className="rounded-card border border-[#D8D3CA] bg-[#F4F1EC] px-5 py-5" aria-live="polite">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#756E65] uppercase">My Pick</p>
      <h3 className="mt-2 font-display text-xl text-[#3F3A35]">{name}</h3>
      <p className="mt-2 text-sm leading-6 text-[#6F6860]">Fiyu is looking into it. We&apos;ll let you know when your Pick is ready.</p>
    </article>
  );
}

function MyPickReadyCard({ item, accountId }: { item: MyPick; accountId: string }) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [revealed, setRevealed] = useState(false);
  const list = useDefaultList(ACTIVE_FIYU_CITY.id, { accountId });
  const transition = usePickRevealTransition({
    ready: revealed,
    pending: false,
    reducedMotion,
    debugLabel: `my-pick-${item.my_pick_id}`,
  });

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setRevealed(window.localStorage.getItem(revealStorageKey(accountId, item.my_pick_id)) === "true");
    });
    return () => { active = false; };
  }, [accountId, item.my_pick_id]);

  const reveal = () => {
    if (!transition.begin()) return;
    window.localStorage.setItem(revealStorageKey(accountId, item.my_pick_id), "true");
    setRevealed(true);
  };
  const publicPlaceId = item.is_public ? item.place_id : null;
  const saved = publicPlaceId ? list.isSaved(publicPlaceId) : false;

  return (
    <article
      className={cn(revealStyles.stage, revealStyles.motionTarget, "min-h-[13rem] overflow-hidden rounded-card")}
      data-reveal-phase={transition.phase}
      data-reveal-active={transition.active}
    >
      <button
        type="button"
        className={cn(
          revealStyles.hiddenFace,
          "min-h-[13rem] w-full border border-[#CDD5EA] bg-[#EEF1FA] px-5 py-5 text-[#3E4866]",
        )}
        onClick={reveal}
        aria-label="Reveal your My Pick"
      >
        <span className="flex h-full min-h-[10.5rem] flex-col items-center justify-center text-center">
          <span className="text-[0.6875rem] font-semibold tracking-[0.18em] text-[#6479B8] uppercase">Your Pick is ready</span>
          <span className="mt-4 font-display text-[2rem] leading-none">Fiyu</span>
          <span className="mt-6 text-sm font-semibold text-[#52699F]">Reveal your Pick →</span>
        </span>
      </button>

      {revealed ? (
        <div className={cn(revealStyles.restaurantFace, "min-h-[13rem] border border-[#CDD5EA] bg-white px-5 py-5")}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#6479B8] uppercase">My Pick</p>
              <h3 className="mt-2 font-display text-2xl leading-tight text-ink">{itemName(item)}</h3>
              {item.name_ja && item.name_ja !== itemName(item) ? <p className="mt-1 text-sm text-ink-muted">{item.name_ja}</p> : null}
              {(item.primary_category || item.display_area) ? <p className="mt-2 text-sm text-ink-muted">{[item.primary_category, item.display_area].filter(Boolean).join(" · ")}</p> : null}
            </div>
            {item.fiyu_score !== null ? <ScoreMark score={item.fiyu_score} size="reveal" tone="my-pick" /> : null}
          </div>
          {!item.is_public ? <p className="mt-4 text-sm leading-6 text-ink-muted">This is your private result. It is not currently part of the public Fiyu catalog.</p> : null}
          {publicPlaceId ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#D8DEEA] pt-4">
              <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#52699F]" href={`/restaurants/${publicPlaceId}`}>View restaurant →</Link>
              <Button variant="secondary" disabled={list.pendingPlaceIds.includes(publicPlaceId)} onClick={() => void list.toggle(publicPlaceId)}>{saved ? "Saved" : "Save"}</Button>
              <Link className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted" href={`/log?placeId=${encodeURIComponent(publicPlaceId)}`}>Log visit</Link>
            </div>
          ) : null}
        </div>
      ) : null}
      <span className={revealStyles.shineOverlay} data-reveal-active={transition.active} aria-hidden="true" />
    </article>
  );
}

function ResolvedMyPickNotice({ item }: { item: MyPick }) {
  const outside = item.status === "outside_coverage";
  return (
    <article className="rounded-card border border-[#D8D3CA] bg-[#F7F5F2] px-5 py-5">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#756E65] uppercase">My Pick</p>
      {(item.name_en || item.name_ja || item.display_name_hint) ? <h3 className="mt-2 font-display text-xl text-ink">{itemName(item)}</h3> : null}
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        {outside
          ? "This restaurant is outside Fiyu's current Tokyo coverage."
          : "Fiyu couldn't complete this Pick yet. Your request is still saved."}
      </p>
    </article>
  );
}

function MyPickCard({ item, accountId }: { item: MyPick; accountId: string }) {
  if (PENDING_STATUSES.has(item.status)) return <PendingMyPickCard item={item} />;
  if (item.status === "ready") return <MyPickReadyCard item={item} accountId={accountId} />;
  return <ResolvedMyPickNotice item={item} />;
}

export function MyPickPicksSection({
  accountId,
  initialMyPickId = null,
}: {
  accountId: string | null;
  initialMyPickId?: string | null;
}) {
  const [items, setItems] = useState<MyPick[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pollAttempt = useRef(0);
  const focusRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!accountId) return [];
    const next = await fetchMyPicks({ signal });
    setItems(next);
    setLoaded(true);
    return next;
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    });
    return () => controller.abort();
  }, [accountId, refresh]);

  const hasPending = items.some((item) => PENDING_STATUSES.has(item.status));
  useEffect(() => {
    if (!accountId || !hasPending) {
      pollAttempt.current = 0;
      return;
    }
    let active = true;
    let timer: number | undefined;
    const schedule = () => {
      const delay = POLL_DELAYS_MS[Math.min(pollAttempt.current, POLL_DELAYS_MS.length - 1)];
      timer = window.setTimeout(async () => {
        if (!active) return;
        if (document.visibilityState === "visible") {
          pollAttempt.current += 1;
          try {
            const next = await refresh();
            if (!next.some((item) => PENDING_STATUSES.has(item.status))) return;
          } catch {
            // Keep the result quiet and retry on the next modest interval.
          }
        }
        if (active) schedule();
      }, delay);
    };
    const resume = () => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    schedule();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [accountId, hasPending, refresh]);

  const visibleItems = useMemo(() => {
    const recent = items.slice(0, 3);
    if (!initialMyPickId || recent.some((item) => item.my_pick_id === initialMyPickId)) return recent;
    const linked = items.find((item) => item.my_pick_id === initialMyPickId);
    return linked ? [linked, ...recent.slice(0, 2)] : recent;
  }, [initialMyPickId, items]);

  useEffect(() => {
    if (!initialMyPickId || !focusRef.current) return;
    focusRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    focusRef.current.focus({ preventScroll: true });
  }, [initialMyPickId, visibleItems]);

  const submitted = (item: MyPick) => {
    setItems((current) => [item, ...current.filter((existing) => existing.my_pick_id !== item.my_pick_id)]);
    setLoaded(true);
  };

  return (
    <>
      <MyPickEntry signedIn={Boolean(accountId)} onSubmitted={submitted} />
      {accountId && loaded && visibleItems.length > 0 ? (
        <section className="mt-5" aria-labelledby="my-picks-inline-title">
          <h2 id="my-picks-inline-title" className="mb-3 text-xs font-semibold tracking-[0.15em] text-ink-muted uppercase">Your My Picks</h2>
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <div
                key={item.my_pick_id}
                ref={item.my_pick_id === initialMyPickId ? (node) => { focusRef.current = node; } : undefined}
                tabIndex={item.my_pick_id === initialMyPickId ? -1 : undefined}
                data-my-pick-id={item.my_pick_id}
                className="outline-none focus-visible:ring-2 focus-visible:ring-[#6479B8] focus-visible:ring-offset-2"
              >
                <MyPickCard item={item} accountId={accountId} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
