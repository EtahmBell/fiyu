"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  GooglePlaceSelector,
  type GooglePlaceSelection,
} from "@/components/my-pick/GooglePlaceSelector";
import { Button } from "@/components/ui/Button";
import { fetchMyPickQuota, submitMyPick } from "@/lib/api/client";
import { FiyuApiError } from "@/lib/api/errors";
import { type MyPick, type MyPickQuota, myPickQuotaErrorSchema } from "@/lib/api/schemas";

type ComposerState = "search" | "submitting" | "submitted";

function nextAvailability(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return `Another My Pick becomes available ${date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  })}.`;
}

function quotaSummary(quota: MyPickQuota): string {
  if (quota.remaining === quota.limit) return `${quota.limit} My Picks available now`;
  return `${quota.remaining} of ${quota.limit} My Picks remaining`;
}

export function MyPickComposer({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (myPick: MyPick) => void;
}) {
  const [state, setState] = useState<ComposerState>("search");
  const [selection, setSelection] = useState<GooglePlaceSelection | null>(null);
  const [selectorKey, setSelectorKey] = useState(0);
  const [quota, setQuota] = useState<MyPickQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const resetComposer = useCallback(() => {
    setState("search");
    setSelection(null);
    setError(null);
    setSelectorKey((value) => value + 1);
  }, []);

  const refreshQuota = useCallback(async (signal?: AbortSignal) => {
    try {
      setQuota(await fetchMyPickQuota({ signal }));
    } catch {
      // The POST remains authoritative if this non-blocking summary cannot load.
    } finally {
      if (!signal?.aborted) setQuotaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchMyPickQuota({ signal: controller.signal })
      .then((current) => {
        if (!controller.signal.aborted) setQuota(current);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setQuotaLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const search = panelRef.current?.querySelector<HTMLInputElement>("[data-my-pick-search-input]");
      (search ?? panelRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state !== "submitting") {
        if (state === "submitted") resetComposer();
        onClose();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose, open, resetComposer, state]);

  const close = () => {
    if (state === "submitting") return;
    if (state === "submitted") resetComposer();
    onClose();
  };
  const choose = useCallback((selected: GooglePlaceSelection | null) => {
    setSelection(selected);
    setError(null);
  }, []);
  const submit = async () => {
    if (!selection) return;
    setError(null);
    setState("submitting");
    try {
      const result = await submitMyPick(selection.placeId, selection.userNameHint, selection.userAddressHint);
      onSubmitted?.(result);
      setState("submitted");
      void refreshQuota();
    } catch (cause) {
      const exhausted = cause instanceof FiyuApiError
        ? myPickQuotaErrorSchema.safeParse(cause.responseBody)
        : null;
      if (exhausted?.success) {
        setQuota(exhausted.data.detail.quota);
        setError(null);
        setSelection(null);
        setState("search");
      } else {
        setError("My Pick could not be submitted right now. Please try again.");
        setState("search");
      }
    }
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute("hidden"));
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open || typeof document === "undefined") return null;
  const exhausted = quota?.remaining === 0;
  const availability = exhausted ? nextAvailability(quota.next_available_at) : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" data-testid="my-pick-modal-backdrop">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={trapFocus}
        data-testid="my-pick-modal"
        className="w-full max-w-[28rem] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:px-7 sm:py-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-lavender-700 uppercase">My Pick</p>
            <h2 id={titleId} className="mt-2 font-display text-2xl text-ink">Have somewhere in mind?</h2>
          </div>
          <button type="button" onClick={close} disabled={state === "submitting"} aria-label="Close My Pick" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl leading-none text-ink-muted hover:bg-subtle hover:text-ink disabled:opacity-40">×</button>
        </div>

        <div className="min-w-0 pt-2">
          {state === "search" || state === "submitting" ? (
            <>
              <p id={descriptionId} className="text-sm leading-6 text-ink-muted">Give Fiyu a restaurant and we&apos;ll score it.</p>
              {exhausted ? (
                <div className="mt-5 rounded-xl border border-line bg-subtle px-4 py-4" aria-live="polite">
                  <p className="text-sm font-medium text-ink">You&apos;ve used your 3 My Picks for now.</p>
                  {availability ? <p className="mt-1 text-sm leading-6 text-ink-muted">{availability}</p> : null}
                </div>
              ) : (
                <div className="relative isolate mt-5 min-w-0 max-w-full overflow-visible">
                  <GooglePlaceSelector key={selectorKey} disabled={state === "submitting"} onSelect={choose} />
                  <Button className="mt-4 w-full" variant="primary" disabled={!selection || state === "submitting"} onClick={() => void submit()}>{state === "submitting" ? "Submitting…" : "Submit to Fiyu →"}</Button>
                </div>
              )}
              {quota ? <p className="mt-4 text-xs text-ink-muted" aria-live="polite">{quotaSummary(quota)}</p> : quotaLoading ? <p className="mt-4 text-xs text-ink-muted">Checking availability…</p> : null}
              {error ? <p role="alert" className="mt-3 text-sm text-dusty-rose">{error}</p> : null}
            </>
          ) : null}

          {state === "submitted" ? (
            <div className="py-3 text-center" aria-live="polite">
              <h3 id={descriptionId} className="font-display text-2xl text-ink">Submitted to Fiyu</h3>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ink-muted">We&apos;ll look into it and let you know when your Pick is ready.</p>
              <Button className="mt-6 w-full" variant="primary" onClick={close}>Done</Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
