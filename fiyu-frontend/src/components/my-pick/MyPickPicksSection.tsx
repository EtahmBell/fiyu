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
  fetchDeveloperStatus,
  fetchMyPickQuota,
  fetchMyPicks,
  hardResetDeveloperMyPick,
  processDeveloperMyPick,
} from "@/lib/api/client";
import { isFiyuApiError } from "@/lib/api/errors";
import type { DeveloperStatus, MyPick, MyPickQuota } from "@/lib/api/schemas";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import { isDeveloperAuthorized } from "@/lib/developerAuthorization";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { cn } from "@/lib/utils/cn";

const PENDING_STATUSES = new Set<MyPick["status"]>(["pending", "resolving_identity", "researching"]);
const POLL_DELAYS_MS = [30_000, 60_000, 180_000] as const;

type DeveloperAction = {
  busy: boolean;
  hardResetBusy: boolean;
  canHardReset: boolean;
  label: "Process now" | "Retry now" | "Retry location" | null;
  diagnostic: string | null;
  error: string | null;
  hardResetError: string | null;
  process(): void;
  hardReset(): void;
};

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

function safeFailureDiagnostic(value: string | null): string | null {
  if (!value) return null;
  if (!/^[a-z][a-z0-9_.-]{0,119}$/i.test(value)) return "processing_error";
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return normalized || "processing_error";
}

function revealStorageKey(accountId: string, itemId: string): string {
  return `fiyu:my-pick-revealed:${accountId}:${itemId}`;
}

function DeveloperProcessAction({ action }: { action: DeveloperAction }) {
  const [confirmingHardReset, setConfirmingHardReset] = useState(false);
  return (
    <div className="mt-2">
      {action.diagnostic ? (
        <p className="mt-1 text-xs leading-5 text-[#66788F]">
          <span className="font-semibold">DEV · Last attempt:</span>{" "}
          <code className="font-mono">{action.diagnostic}</code>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {action.label ? <button
          type="button"
          disabled={action.busy || action.hardResetBusy}
          onClick={action.process}
          className="min-h-9 text-xs font-semibold tracking-wide text-gold-700 disabled:cursor-wait disabled:opacity-60"
        >
          {action.busy ? "Processing…" : `DEV: ${action.label}`}
        </button> : null}
        {action.canHardReset ? (
          <button
            type="button"
            disabled={action.busy || action.hardResetBusy}
            onClick={() => setConfirmingHardReset(true)}
            className="min-h-9 text-xs font-medium tracking-wide text-[#66788F] underline decoration-[#AAB6C5] underline-offset-4 disabled:cursor-wait disabled:opacity-60"
          >
            DEV: Hard reset this Pick
          </button>
        ) : null}
      </div>
      {confirmingHardReset ? (
        <div role="dialog" aria-label="Confirm My Pick hard reset" className="mt-2 rounded-lg border border-[#D2DAE5] bg-white/70 p-3">
          <p className="text-xs leading-5 text-[#3F4A59]">Reset this My Pick test and its unshared canonical work?</p>
          <div className="mt-2 flex gap-3">
            <button type="button" className="min-h-9 text-xs font-medium text-[#66788F]" onClick={() => setConfirmingHardReset(false)}>Cancel</button>
            <button type="button" disabled={action.hardResetBusy} className="min-h-9 text-xs font-semibold text-rose-dust disabled:cursor-wait disabled:opacity-60" onClick={action.hardReset}>
              {action.hardResetBusy ? "Resetting…" : "Hard reset"}
            </button>
          </div>
        </div>
      ) : null}
      {action.error ? <p role="alert" className="mt-1 text-xs leading-5 text-rose-dust">{action.error}</p> : null}
      {action.hardResetError ? <p role="alert" className="mt-1 text-xs leading-5 text-rose-dust">{action.hardResetError}</p> : null}
    </div>
  );
}

function MyPickQuotaFooter({
  quota,
  onSubmitted,
  developerAction,
  className,
}: {
  quota: MyPickQuota | null;
  onSubmitted(item: MyPick): void;
  developerAction?: DeveloperAction;
  className?: string;
}) {
  return (
    <div data-my-pick-footer className={cn("mt-5 border-t border-[#D2DAE5] pt-3", className)}>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {quota ? `${quota.remaining} of ${quota.limit} Picks left` : "Checking Picks availability…"}
        </p>
        {quota && quota.remaining > 0 ? <MyPickEntry signedIn variant="utility" onSubmitted={onSubmitted} /> : null}
      </div>
      {developerAction ? <DeveloperProcessAction action={developerAction} /> : null}
    </div>
  );
}

function PendingMyPickCard({
  item,
  developerAction,
  footer,
}: {
  item: MyPick;
  developerAction?: DeveloperAction;
  footer?: ReactNode;
}) {
  const canonicalName = safeItemName(item);
  const name = canonicalName ? `${canonicalName} is under review` : "Your Pick is under review";
  return (
    <article className="rounded-card border border-[#D2DAE5] bg-[#EEF2F6] px-5 py-5" aria-live="polite">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#66788F] uppercase">Your Pick</p>
      <h3 className="mt-2 font-display text-xl text-[#3F4A59]">{name}</h3>
      <p className="mt-2 text-sm leading-6 text-[#66788F]">Fiyu is looking into it. We&apos;ll let you know when it&apos;s ready.</p>
      {footer}
      {!footer && developerAction ? (
        <div className="mt-4 border-t border-[#D2DAE5] pt-3">
          <DeveloperProcessAction action={developerAction} />
        </div>
      ) : null}
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
      className={cn(revealStyles.stage, revealStyles.motionTarget, "min-h-[13rem] overflow-hidden rounded-card")}
      data-reveal-phase={transition.phase}
      data-reveal-active={transition.active}
    >
      <button
        type="button"
        className={cn(
          revealStyles.hiddenFace,
          "min-h-[13rem] w-full border border-[#C9D4E2] bg-[#E6EDF5] px-5 py-5 text-[#38485B]",
        )}
        onClick={reveal}
        aria-label="Reveal your Pick"
      >
        <span className="flex h-full min-h-[10.5rem] flex-col items-center justify-center text-center">
          <span className="text-[0.6875rem] font-semibold tracking-[0.18em] text-[#5F7590] uppercase">Your Pick is ready</span>
          <span className="mt-4 font-display text-[2rem] leading-none">Fiyu</span>
          <span className="mt-6 text-sm font-semibold text-[#5F7590]">Reveal your Pick →</span>
        </span>
      </button>

      {revealed ? (
        <div className={cn(revealStyles.restaurantFace, "min-h-[13rem] border border-[#C9D4E2] bg-white px-5 py-5")}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#5F7590] uppercase">Your Pick</p>
              <h3 className="mt-2 font-display text-2xl leading-tight text-ink">{itemName(item)}</h3>
              {item.name_ja && item.name_ja !== itemName(item) ? <p className="mt-1 text-sm text-ink-muted">{item.name_ja}</p> : null}
              {(item.primary_category || item.display_area) ? <p className="mt-2 text-sm text-ink-muted">{[item.primary_category, item.display_area].filter(Boolean).join(" · ")}</p> : null}
            </div>
            {item.fiyu_score !== null ? <ScoreMark score={item.fiyu_score} size="reveal" tone="my-pick" /> : null}
          </div>
          {!item.is_public ? <p className="mt-4 text-sm leading-6 text-ink-muted">This is your private result. It is not currently part of the public Fiyu catalog.</p> : null}
          {publicPlaceId ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#D8DEEA] pt-4">
              <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#5F7590]" href={`/restaurants/${publicPlaceId}`}>View restaurant →</Link>
              <Button variant="secondary" disabled={list.pendingPlaceIds.includes(publicPlaceId)} onClick={() => void list.toggle(publicPlaceId)}>{saved ? "Saved" : "Save"}</Button>
              <Link className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted" href={`/log?placeId=${encodeURIComponent(publicPlaceId)}`}>Log visit</Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {footer ? (
        <div className={cn("relative z-[4] -mt-px border border-[#C9D4E2] border-t-0 px-5 pb-5", revealed ? "bg-white" : "bg-[#E6EDF5]")}>{footer}</div>
      ) : null}
      <span className={revealStyles.shineOverlay} data-reveal-active={transition.active} aria-hidden="true" />
    </article>
  );
}

function ResolvedMyPickNotice({ item, footer, developerAction }: { item: MyPick; footer?: ReactNode; developerAction?: DeveloperAction }) {
  const outside = item.status === "outside_coverage";
  const name = safeItemName(item);
  return (
    <article className="rounded-card border border-[#D2DAE5] bg-[#EEF2F6] px-5 py-5">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#66788F] uppercase">Your Pick</p>
      <h3 className="mt-2 font-display text-xl text-[#3F4A59]">{name ?? "Your Pick"}</h3>
      <p className="mt-2 text-sm leading-6 text-[#66788F]">
        {outside
          ? "This restaurant is outside Fiyu's current Tokyo coverage."
          : "Fiyu couldn't complete this Pick yet. Your request is still saved."}
      </p>
      {footer}
      {!footer && developerAction ? <DeveloperProcessAction action={developerAction} /> : null}
    </article>
  );
}

function RetryableMyPickCard({
  footer,
  developerAction,
}: {
  footer?: ReactNode;
  developerAction?: DeveloperAction;
}) {
  return (
    <article className="rounded-card border border-[#D2DAE5] bg-[#EEF2F6] px-5 py-5">
      <p className="text-[0.6875rem] font-semibold tracking-[0.15em] text-[#66788F] uppercase">Your Pick</p>
      <h3 className="mt-2 font-display text-xl text-[#3F4A59]">Your Pick is still under review</h3>
      <p className="mt-2 text-sm leading-6 text-[#66788F]">Fiyu couldn&apos;t finish checking this one yet. Your request is saved and can be retried.</p>
      {footer}
      {!footer && developerAction ? (
        <div className="mt-4 border-t border-[#D2DAE5] pt-3">
          <DeveloperProcessAction action={developerAction} />
        </div>
      ) : null}
    </article>
  );
}

function MyPickCard({
  item,
  accountId,
  developerAction,
  footer,
}: {
  item: MyPick;
  accountId: string;
  developerAction?: DeveloperAction;
  footer?: ReactNode;
}) {
  if (PENDING_STATUSES.has(item.status)) return <PendingMyPickCard item={item} developerAction={developerAction} footer={footer} />;
  if (isResultReady(item)) return <MyPickReadyCard item={item} accountId={accountId} footer={footer} />;
  if (item.status === "failed_retryable") return <RetryableMyPickCard developerAction={developerAction} footer={footer} />;
  return <ResolvedMyPickNotice item={item} footer={footer} developerAction={developerAction} />;
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
  const [developerStatus, setDeveloperStatus] = useState<DeveloperStatus | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processError, setProcessError] = useState<{ id: string; message: string } | null>(null);
  const [hardResetId, setHardResetId] = useState<string | null>(null);
  const [hardResetError, setHardResetError] = useState<{ id: string; message: string } | null>(null);
  const pollAttempt = useRef(0);
  const focusRef = useRef<HTMLElement | null>(null);
  const processingRef = useRef<string | null>(null);
  const hardResetRef = useRef<string | null>(null);

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
      .then(setDeveloperStatus)
      .catch(() => setDeveloperStatus(null));
    return () => controller.abort();
  }, [accountId]);

  const developerAuthorized = isDeveloperAuthorized(developerStatus);

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

  const hardReset = async (item: MyPick) => {
    if (hardResetRef.current !== null) return;
    hardResetRef.current = item.my_pick_id;
    setHardResetId(item.my_pick_id);
    setHardResetError(null);
    try {
      await hardResetDeveloperMyPick(item.my_pick_id);
      setItems((current) => current.filter((candidate) => candidate.my_pick_id !== item.my_pick_id));
      await Promise.all([refresh(), refreshQuota()]);
    } catch (cause) {
      setHardResetError({
        id: item.my_pick_id,
        message: isFiyuApiError(cause) && cause.detail
          ? cause.detail
          : "This My Pick could not be hard-reset.",
      });
    } finally {
      hardResetRef.current = null;
      setHardResetId(null);
    }
  };

  if (!accountId) return <MyPickEntry signedIn={false} />;
  if (!loaded) return <div className="mt-6 min-h-20" aria-hidden="true" />;
  if (visibleItems.length === 0) return <MyPickEntry signedIn onSubmitted={submitted} />;

  return (
        <section className="mt-6" aria-label="Your Picks">
          <div className="space-y-3">
            {visibleItems.map((item, index) => {
              const canRetryLocation = item.status === "needs_location" && isResultReady(item);
              const canProcess = PENDING_STATUSES.has(item.status) || item.status === "failed_retryable" || canRetryLocation;
              const developerAction = developerAuthorized && (canProcess || item.status === "needs_review")
                ? {
                    busy: processingId === item.my_pick_id,
                    hardResetBusy: hardResetId === item.my_pick_id,
                    canHardReset: !canRetryLocation,
                    label: canProcess
                      ? item.status === "failed_retryable"
                        ? "Retry now" as const
                        : canRetryLocation
                          ? "Retry location" as const
                          : "Process now" as const
                      : null,
                    diagnostic: safeFailureDiagnostic(item.failure_code),
                    error: processError?.id === item.my_pick_id ? processError.message : null,
                    hardResetError: hardResetError?.id === item.my_pick_id ? hardResetError.message : null,
                    process: () => void processNow(item),
                    hardReset: () => void hardReset(item),
                  }
                : undefined;
              const footer = index === 0
                ? <MyPickQuotaFooter quota={quota} onSubmitted={submitted} developerAction={developerAction} className={isResultReady(item) ? "mt-0 border-[#C9D4E2]" : undefined} />
                : undefined;
              return (
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
                  developerAction={developerAction}
                  footer={footer}
                />
              </div>
              );
            })}
          </div>
        </section>
  );
}
