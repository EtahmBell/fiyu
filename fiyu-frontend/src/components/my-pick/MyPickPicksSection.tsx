"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MyPickEntry } from "@/components/my-pick/MyPickEntry";
import revealStyles from "@/components/pick-reveal/PickReveal.module.css";
import { usePickRevealTransition } from "@/components/pick-reveal/usePickRevealTransition";
import { Button } from "@/components/ui/Button";
import { ScoreMark } from "@/components/ui/ScoreMark";
import {
  fetchDeveloperStatus,
  fetchMyPickQuota,
  fetchMyPicks,
  processDeveloperMyPick,
} from "@/lib/api/client";
import { isFiyuApiError } from "@/lib/api/errors";
import type { MyPick, MyPickQuota } from "@/lib/api/schemas";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { cn } from "@/lib/utils/cn";

const PENDING_STATUSES = new Set<MyPick["status"]>(["pending", "resolving_identity", "researching"]);
const POLL_DELAYS_MS = [30_000, 60_000, 180_000] as const;

function itemName(item: MyPick): string {
  return item.name_en || item.name_ja || "Your Pick";
}

function revealStorageKey(accountId: string, itemId: string): string {
  return `fiyu:my-pick-revealed:${accountId}:${itemId}`;
}

function PendingMyPickCard({
  item,
  developerAction,
}: {
  item: MyPick;
  developerAction?: {
    busy: boolean;
    error: string | null;
    process(): void;
  };
}) {
  const canonicalName = item.name_en || item.name_ja;
  const name = canonicalName ? `${canonicalName} is under review` : "Your Pick is under review";
  return (
    <article className="rounded-card border border-[#D8D3CA] bg-[#F4F1EC] px-5 py-5" aria-live="polite">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#756E65] uppercase">Your Pick</p>
      <h3 className="mt-2 font-display text-xl text-[#3F3A35]">{name}</h3>
      <p className="mt-2 text-sm leading-6 text-[#6F6860]">Fiyu is looking into it. We&apos;ll let you know when it&apos;s ready.</p>
      {developerAction ? (
        <div className="mt-4 border-t border-[#D8D3CA] pt-3">
          <button
            type="button"
            disabled={developerAction.busy}
            onClick={developerAction.process}
            className="min-h-9 text-xs font-semibold tracking-wide text-gold-700 disabled:cursor-wait disabled:opacity-60"
          >
            {developerAction.busy ? "Processing…" : "DEV: Process now"}
          </button>
          {developerAction.error ? <p role="alert" className="mt-1 text-xs leading-5 text-rose-dust">{developerAction.error}</p> : null}
        </div>
      ) : null}
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
        aria-label="Reveal your Pick"
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
              <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#6479B8] uppercase">Your Pick</p>
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
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#756E65] uppercase">Your Pick</p>
      {(item.name_en || item.name_ja) ? <h3 className="mt-2 font-display text-xl text-ink">{itemName(item)}</h3> : null}
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        {outside
          ? "This restaurant is outside Fiyu's current Tokyo coverage."
          : "Fiyu couldn't complete this Pick yet. Your request is still saved."}
      </p>
    </article>
  );
}

function MyPickCard({
  item,
  accountId,
  developerAction,
}: {
  item: MyPick;
  accountId: string;
  developerAction?: {
    busy: boolean;
    error: string | null;
    process(): void;
  };
}) {
  if (PENDING_STATUSES.has(item.status)) return <PendingMyPickCard item={item} developerAction={developerAction} />;
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
  const [quota, setQuota] = useState<MyPickQuota | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [developerAccountId, setDeveloperAccountId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processError, setProcessError] = useState<{ id: string; message: string } | null>(null);
  const pollAttempt = useRef(0);
  const focusRef = useRef<HTMLElement | null>(null);
  const processingRef = useRef<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!accountId) return [];
    const next = await fetchMyPicks({ signal });
    setItems(next);
    setLoaded(true);
    return next;
  }, [accountId]);

  const refreshQuota = useCallback(async (signal?: AbortSignal) => {
    if (!accountId) return null;
    const next = await fetchMyPickQuota({ signal });
    setQuota(next);
    return next;
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void Promise.allSettled([refresh(controller.signal), refreshQuota(controller.signal)]).then(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    });
    return () => controller.abort();
  }, [accountId, refresh, refreshQuota]);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    void fetchDeveloperStatus({ signal: controller.signal })
      .then(() => setDeveloperAccountId(accountId))
      .catch(() => undefined);
    return () => controller.abort();
  }, [accountId]);

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
      if (document.visibilityState === "visible") {
        void refresh().catch(() => undefined);
        void refreshQuota().catch(() => undefined);
      }
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
  }, [accountId, hasPending, refresh, refreshQuota]);

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
    void refreshQuota().catch(() => undefined);
  };

  const processNow = async (item: MyPick) => {
    if (processingRef.current !== null) return;
    processingRef.current = item.my_pick_id;
    setProcessingId(item.my_pick_id);
    setProcessError(null);
    try {
      await processDeveloperMyPick(item.my_pick_id);
      await refresh();
    } catch (cause) {
      const missingConfiguration = isFiyuApiError(cause)
        && cause.status === 503
        && cause.detail?.includes("FIYU_MY_PICK_OSM_INDEX");
      setProcessError({
        id: item.my_pick_id,
        message: missingConfiguration
          ? "My Pick worker is not configured on this backend."
          : "My Pick could not be processed right now.",
      });
    } finally {
      processingRef.current = null;
      setProcessingId(null);
    }
  };

  if (!accountId) return <MyPickEntry signedIn={false} />;
  if (!loaded) return <div className="mt-6 min-h-20" aria-hidden="true" />;
  if (visibleItems.length === 0) return <MyPickEntry signedIn onSubmitted={submitted} />;

  return (
        <section className="mt-6" aria-label="Your Picks">
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <div
                key={item.my_pick_id}
                ref={item.my_pick_id === initialMyPickId ? (node) => { focusRef.current = node; } : undefined}
                tabIndex={item.my_pick_id === initialMyPickId ? -1 : undefined}
                data-my-pick-id={item.my_pick_id}
                className="outline-none focus-visible:ring-2 focus-visible:ring-[#6479B8] focus-visible:ring-offset-2"
              >
                <MyPickCard
                  item={item}
                  accountId={accountId}
                  developerAction={
                    developerAccountId === accountId && item.status === "pending"
                      ? {
                          busy: processingId === item.my_pick_id,
                          error: processError?.id === item.my_pick_id ? processError.message : null,
                          process: () => void processNow(item),
                        }
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex min-h-12 items-center justify-between gap-4 border-t border-line px-1 pt-3">
            <p className="text-sm text-ink-muted">
              {quota ? `${quota.remaining} of ${quota.limit} Picks left` : "Checking Picks availability…"}
            </p>
            {quota && quota.remaining > 0 ? <MyPickEntry signedIn variant="utility" onSubmitted={submitted} /> : null}
          </div>
        </section>
  );
}
