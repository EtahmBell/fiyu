"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { MyPickEntry } from "@/components/my-pick/MyPickEntry";
import revealStyles from "@/components/pick-reveal/PickReveal.module.css";
import { usePickRevealTransition } from "@/components/pick-reveal/usePickRevealTransition";
import { Button } from "@/components/ui/Button";
import { ScoreMark } from "@/components/ui/ScoreMark";
import {
  fetchMyPickQuota,
  fetchMyPicks,
} from "@/lib/api/client";
import type { MyPick, MyPickQuota } from "@/lib/api/schemas";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { cn } from "@/lib/utils/cn";

const PENDING_STATUSES = new Set<MyPick["status"]>(["pending", "resolving_identity", "researching"]);
const POLL_DELAYS_MS = [30_000, 60_000, 180_000] as const;

function safeItemName(item: MyPick): string | null {
  const identifiers = [item.external_place_id, item.place_id, item.my_pick_id]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLocaleLowerCase());
  for (const candidate of [item.name_en, item.name_ja]) {
    const name = candidate?.trim();
    if (!name) continue;
    const normalized = name.toLocaleLowerCase();
    if (identifiers.includes(normalized)) continue;
    if (identifiers.some((identifier) => normalized === `my pick ${identifier.slice(-12)}`)) continue;
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(name)) continue;
    return name;
  }
  return null;
}

function itemName(item: MyPick): string {
  return safeItemName(item) ?? "Your Pick";
}

function isResultReady(item: MyPick): boolean {
  // Score fields are a safe rolling-deploy fallback for an older successful API.
  return item.result_ready || (item.fiyu_score !== null && item.score_version !== null);
}

function revealStorageKey(accountId: string, itemId: string): string {
  return `fiyu:my-pick-revealed:${accountId}:${itemId}`;
}

function MyPickQuotaFooter({
  quota,
  onSubmitted,
  className,
}: {
  quota: MyPickQuota | null;
  onSubmitted(item: MyPick): void;
  className?: string;
}) {
  return (
    <div data-my-pick-footer className={cn("mt-4 border-t border-my-pick-line pt-2", className)}>
      <div className="flex min-h-10 items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {quota ? `${quota.remaining} of ${quota.limit} Picks left` : "Checking Picks availability…"}
        </p>
        {quota && quota.remaining > 0 ? <MyPickEntry signedIn variant="utility" onSubmitted={onSubmitted} /> : null}
      </div>
    </div>
  );
}

function PendingMyPickCard({
  item,
  footer,
}: {
  item: MyPick;
  footer?: ReactNode;
}) {
  const canonicalName = safeItemName(item);
  const name = canonicalName ? `${canonicalName} is under review` : "Your Pick is under review";
  return (
    <article className="rounded-card border border-my-pick-line bg-my-pick-soft px-5 py-5" aria-live="polite">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-my-pick-700 uppercase">Your Pick</p>
      <h3 className="mt-2 font-display text-xl text-my-pick-ink">{name}</h3>
      <p className="mt-2 text-sm leading-6 text-my-pick-700">Fiyu is looking into it. We&apos;ll let you know when it&apos;s ready.</p>
      {footer}
    </article>
  );
}

function MyPickReadyCard({ item, accountId, footer }: { item: MyPick; accountId: string; footer?: ReactNode }) {
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
      className={cn(
        revealStyles.stage,
        revealStyles.motionTarget,
        "min-h-[13rem] grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-card border border-my-pick-line",
        revealed ? "bg-my-pick-soft" : "bg-my-pick-concealed",
      )}
      data-reveal-phase={transition.phase}
      data-reveal-active={transition.active}
      data-my-pick-card="ready"
    >
      <button
        type="button"
        className={cn(
          revealStyles.hiddenFace,
          "w-full bg-my-pick-concealed px-4 py-4 text-my-pick-ink sm:px-5",
        )}
        onClick={reveal}
        aria-label="Reveal your Pick"
      >
        <span className="flex h-full min-h-[7.5rem] flex-col items-center justify-center text-center">
          <span className="text-[0.6875rem] font-semibold tracking-[0.18em] text-my-pick-700 uppercase">Your Pick is ready</span>
          <span className="mt-4 font-display text-[2rem] leading-none">Fiyu</span>
          <span className="mt-6 text-sm font-semibold text-my-pick-700">Reveal your Pick →</span>
        </span>
      </button>

      {revealed ? (
        <div className={cn(revealStyles.restaurantFace, "bg-my-pick-soft px-4 pt-4 sm:px-5")}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-my-pick-700 uppercase">Your Pick</p>
              <h3 className="mt-1.5 line-clamp-2 font-display text-xl leading-tight text-ink">{itemName(item)}</h3>
              {item.name_ja && item.name_ja !== itemName(item) ? <p className="mt-0.5 line-clamp-1 text-[0.8125rem] leading-5 text-ink-muted">{item.name_ja}</p> : null}
              {(item.primary_category || item.display_area) ? <p className="mt-1 line-clamp-1 text-[0.8125rem] leading-5 text-ink-muted">{[item.primary_category, item.display_area].filter(Boolean).join(" · ")}</p> : null}
            </div>
            {item.fiyu_score !== null ? <ScoreMark score={item.fiyu_score} size="reveal" tone="my-pick" /> : null}
          </div>
          {!item.is_public ? <p className="mt-2.5 max-w-[34rem] text-sm leading-5 text-ink-muted">This is your private result. It is not currently part of the public Fiyu catalog.</p> : null}
          {publicPlaceId ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-my-pick-700" href={`/restaurants/${publicPlaceId}`}>View restaurant →</Link>
              <Button variant="secondary" disabled={list.pendingPlaceIds.includes(publicPlaceId)} onClick={() => void list.toggle(publicPlaceId)}>{saved ? "Saved" : "Save"}</Button>
              <Link className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted" href={`/log?placeId=${encodeURIComponent(publicPlaceId)}`}>Log visit</Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {footer ? (
        <div className={cn("relative z-[4] col-start-1 row-start-2 px-4 pb-2 sm:px-5", revealed ? "bg-my-pick-soft" : "bg-my-pick-concealed")}>{footer}</div>
      ) : null}
      <span className={revealStyles.shineOverlay} data-reveal-active={transition.active} aria-hidden="true" />
    </article>
  );
}

function ResolvedMyPickNotice({ item, footer }: { item: MyPick; footer?: ReactNode }) {
  const outside = item.status === "outside_coverage";
  const name = safeItemName(item);
  return (
    <article className="rounded-card border border-my-pick-line bg-my-pick-soft px-5 py-5">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-my-pick-700 uppercase">Your Pick</p>
      <h3 className="mt-2 font-display text-xl text-my-pick-ink">{name ?? "Your Pick"}</h3>
      <p className="mt-2 text-sm leading-6 text-my-pick-700">
        {outside
          ? "This restaurant is outside Fiyu's current Tokyo coverage."
          : "Fiyu couldn't complete this Pick yet. Your request is still saved."}
      </p>
      {footer}
    </article>
  );
}

function RetryableMyPickCard({
  footer,
}: {
  footer?: ReactNode;
}) {
  return (
    <article className="rounded-card border border-my-pick-line bg-my-pick-soft px-5 py-5">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-my-pick-700 uppercase">Your Pick</p>
      <h3 className="mt-2 font-display text-xl text-my-pick-ink">Your Pick is still under review</h3>
      <p className="mt-2 text-sm leading-6 text-my-pick-700">Fiyu couldn&apos;t finish checking this one yet. Your request is saved and can be retried.</p>
      {footer}
    </article>
  );
}

function MyPickCard({
  item,
  accountId,
  footer,
}: {
  item: MyPick;
  accountId: string;
  footer?: ReactNode;
}) {
  if (PENDING_STATUSES.has(item.status)) return <PendingMyPickCard item={item} footer={footer} />;
  if (isResultReady(item)) return <MyPickReadyCard item={item} accountId={accountId} footer={footer} />;
  if (item.status === "failed_retryable") return <RetryableMyPickCard footer={footer} />;
  return <ResolvedMyPickNotice item={item} footer={footer} />;
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
  const pollAttempt = useRef(0);
  const focusRef = useRef<HTMLElement | null>(null);

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

  if (!accountId) return <MyPickEntry signedIn={false} />;
  if (!loaded) return <div className="mt-6 min-h-20" aria-hidden="true" />;
  if (visibleItems.length === 0) return <MyPickEntry signedIn onSubmitted={submitted} />;

  return (
        <section className="mt-6" aria-label="Your Picks">
          <div className="space-y-3">
            {visibleItems.map((item, index) => {
              const footer = index === 0
                ? <MyPickQuotaFooter quota={quota} onSubmitted={submitted} className={isResultReady(item) ? "mt-0 border-my-pick-line" : undefined} />
                : undefined;
              return (
              <div
                key={item.my_pick_id}
                ref={item.my_pick_id === initialMyPickId ? (node) => { focusRef.current = node; } : undefined}
                tabIndex={item.my_pick_id === initialMyPickId ? -1 : undefined}
                data-my-pick-id={item.my_pick_id}
                className="outline-none focus-visible:ring-2 focus-visible:ring-my-pick focus-visible:ring-offset-2"
              >
                <MyPickCard
                  item={item}
                  accountId={accountId}
                  footer={footer}
                />
              </div>
              );
            })}
          </div>
        </section>
  );
}
