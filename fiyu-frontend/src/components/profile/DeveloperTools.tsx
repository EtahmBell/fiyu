"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/Button";
import {
  type PersonalizedPickPreviewMode,
  usePersonalizedPick,
} from "@/components/personalized-picks/PersonalizedPickProvider";
import {
  clearDeveloperPersonalizedPickDismissal,
  expireDeveloperPersonalizedPick,
  fetchDeveloperStatus,
  fetchDeveloperPersonalizedPick,
  fetchAuthenticatedMapRestaurants,
  fetchRestaurants,
  fetchUserFiyuSummary,
  forceDeveloperPersonalizedPick,
  generateDeveloperDailyPicks,
  resetDeveloperPersonalizedPick,
  resetDeveloperDailyPicks,
  resetDeveloperVisitTaste,
  updateDeveloperLocation,
  fetchMyPicks,
  hardResetDeveloperMyPick,
  processDeveloperMyPick,
  previewDeveloperMyPick,
} from "@/lib/api/client";
import type {
  DeveloperGeneratePicksResponse,
  DeveloperPersonalizedPickResponse,
  DeveloperStatus,
  MapRestaurant,
  RestaurantVisit,
  UserFiyuSummary,
  MyPick,
} from "@/lib/api/schemas";
import {
  accountQueryKey,
  clearAccountQuery,
  clearAccountQueries,
  writeAccountQuery,
} from "@/lib/accountQueryCache";
import { authService } from "@/lib/auth/authService";
import { isDeveloperAuthorized } from "@/lib/developerAuthorization";
import { dailyPicksStorageKey } from "@/lib/daily-picks/storage";

function MyPickDeveloperTools() {
  const [items, setItems] = useState<MyPick[]>([]);
  const [preview, setPreview] = useState<MyPick | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setItems((await fetchMyPicks()).slice(0, 5)), []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchMyPicks({ signal: controller.signal })
      .then((recent) => setItems(recent.slice(0, 5)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await action(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "My Pick dev action failed."); }
    finally { setBusy(false); }
  };
  const process = (item: MyPick) => void run(async () => {
    await processDeveloperMyPick(item.my_pick_id);
    await load();
    setMessage(item.status === "needs_location" ? "Location retry completed." : "Canonical My Pick worker completed.");
  });
  const hardReset = (item: MyPick) => void run(async () => {
    if (!window.confirm("Hard reset this My Pick and its unshared canonical work?")) return;
    await hardResetDeveloperMyPick(item.my_pick_id);
    await load();
    setMessage("My Pick hard-reset completed.");
  });
  return <div className="mt-8 border-t border-line pt-7" aria-labelledby="developer-my-pick-title">
    <h4 id="developer-my-pick-title" className="text-sm font-semibold text-ink">My Pick Developer Tools</h4>
    <p className="mt-2 text-sm leading-6 text-ink-muted">Inspect and operate this developer account&apos;s recent requests through the canonical backend path.</p>
    <div className="mt-4 flex flex-wrap gap-2">{(["below_70", "review_eligible", "needs_location", "outside_coverage", "failed_retryable"] as const).map((scenario) => <Button key={scenario} size="sm" variant="secondary" disabled={busy} onClick={() => void run(async () => setPreview((await previewDeveloperMyPick(scenario)).my_pick))}>{scenario.replaceAll("_", " ")}</Button>)}</div>
    <div className="mt-5 space-y-3" aria-label="Recent My Picks">
      {items.length === 0 ? <p className="text-sm text-ink-muted">No recent My Picks.</p> : items.map((item) => {
        const canProcess = item.status === "pending" || item.status === "resolving_identity" || item.status === "researching";
        const canRetry = item.status === "failed_retryable";
        const canRetryLocation = item.status === "needs_location" && item.result_ready;
        const canHardReset = canProcess || canRetry || item.status === "needs_review";
        return <article key={item.my_pick_id} className="rounded-lg border border-my-pick-line bg-my-pick-soft px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-my-pick-ink">{item.name_en || item.name_ja || "Your Pick"}</p>
              <p className="mt-1 text-xs text-my-pick-700">{item.status} · {new Date(item.created_at).toLocaleString()}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(canProcess || canRetry || canRetryLocation) ? <Button size="sm" variant="primary" disabled={busy} onClick={() => process(item)}>{canRetryLocation ? "Retry location" : canRetry ? "Retry" : "Process now"}</Button> : null}
              {canHardReset ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => hardReset(item)}>Hard reset</Button> : null}
            </div>
          </div>
          <dl className="mt-3 grid gap-x-3 gap-y-1 text-xs leading-5 text-ink-muted sm:grid-cols-[7rem_1fr]">
            <dt>Failure</dt><dd className="break-all text-ink">{item.failure_code ?? "—"}</dd>
            <dt>Result / map</dt><dd className="text-ink">{item.result_ready ? "ready" : "not ready"} / {item.map_ready ? "map-ready" : "no map location"}</dd>
            <dt>Score</dt><dd className="text-ink">{item.fiyu_score ?? "—"}</dd>
          </dl>
        </article>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(load)}>Refresh requests</Button><Link href="/picks" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-plum underline underline-offset-4">Open Picks →</Link></div>
    {message ? <p role="status" className="mt-3 text-sm text-ink-muted">{message}</p> : null}
    {preview ? <dl className="mt-4 grid gap-x-4 gap-y-1 rounded-lg border border-line bg-subtle px-4 py-3 text-xs leading-5 text-ink-muted sm:grid-cols-[8rem_1fr]"><dt>Status</dt><dd className="text-ink">{preview.status}</dd><dt>Score</dt><dd className="text-ink">{preview.fiyu_score ?? "—"}</dd><dt>Public</dt><dd className="text-ink">{preview.is_public ? "yes" : "no"}</dd><dt>Review</dt><dd className="text-ink">{preview.recommendation_review_status}</dd></dl> : null}
  </div>;
}
function currentCoordinates(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is unavailable in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => reject(new Error("Allow location access to test real device location.")),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}

async function clearPicksBrowserState(): Promise<void> {
  clearAccountQueries();
  const session = await authService.getSession();
  if (session) window.localStorage.removeItem(dailyPicksStorageKey(session.userId));
}

const PERSONALIZED_PREVIEWS: Array<{
  mode: PersonalizedPickPreviewMode;
  label: string;
}> = [
  { mode: "locked_zero", label: "Locked 0/10" },
  { mode: "locked_nine", label: "Locked 9/10" },
  { mode: "unlocked", label: "Unlocked 10/10" },
  { mode: "event_available", label: "Event available" },
  { mode: "selected", label: "Selected / active" },
  { mode: "expired", label: "Expired / no active" },
];

function PersonalizedPickDeveloperTools({
  status,
  previewArea,
}: {
  status: DeveloperStatus;
  previewArea: string;
}) {
  const personalizedPick = usePersonalizedPick();
  const [debug, setDebug] = useState<DeveloperPersonalizedPickResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDebug = async () => {
    const value = await fetchDeveloperPersonalizedPick();
    setDebug(value);
    return value;
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchDeveloperPersonalizedPick({ signal: controller.signal })
      .then(setDebug)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const preview = async (mode: PersonalizedPickPreviewMode | null) => {
    setBusy(true);
    setError(null);
    try {
      let restaurant = null;
      if (mode === "event_available" || mode === "selected") {
        const catalog = await fetchRestaurants(1);
        restaurant = catalog.restaurants[0] ?? null;
        if (!restaurant) throw new Error("No published restaurant is available for preview.");
      }
      personalizedPick.setDeveloperPreview(mode, restaurant);
      setMessage(mode ? "Visual preview applied without changing user data." : "Visual preview cleared.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to apply preview.");
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (
    action: () => Promise<DeveloperPersonalizedPickResponse>,
    success: (result: DeveloperPersonalizedPickResponse) => string,
  ) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      personalizedPick.setDeveloperPreview(null);
      const result = await action();
      setDebug(result);
      await personalizedPick.refresh({ ensureEvent: false });
      setMessage(success(result));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the test event.");
    } finally {
      setBusy(false);
    }
  };

  const force = async () => {
    let coordinates: { latitude: number; longitude: number } | null = null;
    if (status.location_mode === "real") coordinates = await currentCoordinates();
    return forceDeveloperPersonalizedPick({
      current_latitude: coordinates?.latitude,
      current_longitude: coordinates?.longitude,
      preview_area: status.location_mode === "outside_tokyo" ? previewArea || null : null,
    });
  };

  return (
    <div className="mt-8 border-t border-line pt-7" aria-labelledby="developer-pp-title">
      <h4 id="developer-pp-title" className="text-sm font-semibold text-ink">Personalized Picks</h4>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        Preview UI locally, or exercise the real account-owned event lifecycle through the production planner.
      </p>

      <p className="mt-5 text-xs font-semibold tracking-wide text-ink">UI PREVIEW — NO DATA WRITES</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PERSONALIZED_PREVIEWS.map((item) => (
          <Button
            key={item.mode}
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void preview(item.mode)}
          >
            {item.label}
          </Button>
        ))}
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void preview(null)}>
          Clear preview
        </Button>
      </div>

      <p className="mt-6 text-xs font-semibold tracking-wide text-ink">REAL DEV EVENT</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={busy} onClick={() => void mutate(force, () => "Real Personalized Pick event created with canonical candidates.")}>
          Force event now
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void mutate(clearDeveloperPersonalizedPickDismissal, () => "24-hour dismissal cleared.")}>
          Clear dismissal
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void mutate(expireDeveloperPersonalizedPick, () => "Current event expired.")}>
          Expire event
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void mutate(resetDeveloperPersonalizedPick, (result) => `Event reset (${result.deleted_events} deleted).`)}>
          Reset event
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadDebug()}>
          Refresh metadata
        </Button>
      </div>

      {error ? <p role="alert" className="mt-4 text-sm text-rose-dust">{error}</p> : null}
      {message ? <p role="status" className="mt-4 text-sm text-ink-muted">{message}</p> : null}
      {debug ? (
        <dl className="mt-4 grid gap-x-4 gap-y-1 rounded-lg border border-line bg-subtle px-4 py-3 text-xs leading-5 text-ink-muted sm:grid-cols-[8rem_1fr]">
          <dt>Status</dt><dd className="break-all text-ink">{debug.state.status}</dd>
          <dt>Event ID</dt><dd className="break-all text-ink">{debug.state.event_id ?? "—"}</dd>
          <dt>Ratings</dt><dd className="text-ink">{debug.state.qualifying_rating_count} / {debug.state.unlock_threshold}</dd>
          <dt>Dismissed until</dt><dd className="break-all text-ink">{debug.state.dismissed_until ?? "—"}</dd>
          <dt>Selected slot</dt><dd className="text-ink">{debug.state.selected_position ?? "—"}</dd>
          <dt>Candidates</dt><dd className="break-all text-ink">{debug.candidate_place_ids.join(", ") || "—"}</dd>
          <dt>Planner</dt><dd className="break-all text-ink">{String(debug.selection_metadata.algorithm ?? "—")}</dd>
        </dl>
      ) : null}
    </div>
  );
}

function ResetVisitTasteDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose, open]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-ink/25 p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-visit-taste-title"
        aria-describedby="reset-visit-taste-description"
        className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-sm sm:p-7"
      >
        <h4 id="reset-visit-taste-title" className="font-display text-2xl text-ink">
          Reset visit &amp; Taste test data?
        </h4>
        <p id="reset-visit-taste-description" className="mt-3 text-sm leading-6 text-ink-muted">
          This removes your developer account&apos;s logged visits, ratings, private notes, and Taste snapshots. Saves and Picks will remain.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Resetting…" : "Reset test data"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DeveloperTools() {
  const [status, setStatus] = useState<DeveloperStatus | null>(null);
  const [previewArea, setPreviewArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<DeveloperGeneratePicksResponse | null>(null);
  const [visitTasteResetOpen, setVisitTasteResetOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchDeveloperStatus({ signal: controller.signal })
      .then((value) => {
        setStatus(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const selection = useMemo(() => {
    if (!status) return "real";
    return status.location_mode === "area"
      ? `area:${status.area_name ?? ""}`
      : status.location_mode;
  }, [status]);

  if (!isDeveloperAuthorized(status)) return null;

  const updateLocation = async (value: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    setGeneration(null);
    try {
      const area = value.startsWith("area:") ? value.slice(5) : null;
      const next = await updateDeveloperLocation({
        location_mode: area ? "area" : value as "real" | "outside_tokyo",
        area_name: area,
      });
      setStatus(next);
      setPreviewArea("");
      setMessage("Developer location updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update developer location.");
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    setGeneration(null);
    try {
      const coordinates = status.location_mode === "real" ? await currentCoordinates() : null;
      const result = await generateDeveloperDailyPicks({
        current_latitude: coordinates?.latitude,
        current_longitude: coordinates?.longitude,
        preview_area: status.location_mode === "outside_tokyo" ? previewArea || null : null,
      });
      await clearPicksBrowserState();
      setGeneration(result);
      setMessage("Test Picks generated and persisted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate test Picks.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset only your Daily Picks rounds and seen history?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setGeneration(null);
    try {
      const result = await resetDeveloperDailyPicks();
      await clearPicksBrowserState();
      setMessage(`Picks test state reset (${result.deleted_rounds} rounds, ${result.deleted_seen} seen rows).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset Picks test state.");
    } finally {
      setBusy(false);
    }
  };

  const resetVisitTaste = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    setGeneration(null);
    try {
      const result = await resetDeveloperVisitTaste();
      const session = await authService.getSession();
      if (session) {
        const logKey = accountQueryKey("restaurant-log", session.userId);
        const summaryKey = accountQueryKey("user-fiyu-summary", session.userId);
        const mapKey = accountQueryKey("map-restaurants", session.userId);
        clearAccountQuery(logKey);
        clearAccountQuery(summaryKey);
        clearAccountQuery(mapKey);
        writeAccountQuery<RestaurantVisit[]>(logKey, []);
        const [summary, mapRestaurants] = await Promise.all([
          fetchUserFiyuSummary(),
          fetchAuthenticatedMapRestaurants(),
        ]);
        writeAccountQuery<UserFiyuSummary>(summaryKey, summary);
        writeAccountQuery<MapRestaurant[]>(mapKey, mapRestaurants);
      }
      setVisitTasteResetOpen(false);
      setMessage(
        `Visit & Taste test data reset (${result.deleted_visits} visits, ${result.deleted_taste_snapshots} Taste snapshots).`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset visit and Taste test data.");
    } finally {
      setBusy(false);
    }
  };

  const activeLabel = status.location_mode === "area"
    ? status.area_name
    : status.location_mode === "outside_tokyo" ? "Outside Tokyo" : "Real device location";

  return (
    <section className="mt-10 border-t border-line pt-7" aria-labelledby="developer-tools-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 id="developer-tools-title" className="text-sm font-semibold text-ink">Developer Tools</h3>
          <p className="mt-1 text-xs font-semibold tracking-[0.08em] text-gold-700 uppercase">
            Dev location: {activeLabel}
          </p>
        </div>
        <span className="rounded-full border border-gold-line px-2 py-1 text-[0.625rem] font-semibold tracking-wide text-gold-700 uppercase">QA only</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-muted">
        Generate persisted rounds through the real production Picks pipeline.
      </p>

      <label className="mt-5 block text-xs font-semibold tracking-wide text-ink" htmlFor="developer-location">
        SIMULATED LOCATION
      </label>
      <select
        id="developer-location"
        value={selection}
        disabled={busy}
        onChange={(event) => void updateLocation(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
      >
        <option value="real">Real device location</option>
        {status.location_options.map((option) => (
          <option key={option.area_name} value={`area:${option.area_name}`}>{option.area_name}</option>
        ))}
        <option value="outside_tokyo">Outside Tokyo</option>
      </select>

      {status.location_mode === "outside_tokyo" && (
        <label className="mt-4 block text-xs font-semibold tracking-wide text-ink" htmlFor="developer-preview-area">
          TOKYO PREVIEW AREA
          <select
            id="developer-preview-area"
            value={previewArea}
            disabled={busy}
            onChange={(event) => setPreviewArea(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm font-normal tracking-normal text-ink normal-case"
          >
            <option value="">Choose on generation</option>
            {status.location_options.map((option) => (
              <option key={option.area_name} value={option.area_name}>{option.area_name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" variant="primary" disabled={busy} onClick={() => void generate()}>
          {busy ? "Working…" : "Generate test Picks"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void reset()}>
          Reset Picks test state
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setVisitTasteResetOpen(true)}>
          Reset visit &amp; Taste test data
        </Button>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-rose-dust">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-ink-muted">{message}</p>}
      {generation && (
        <div className="mt-5 rounded-lg border border-line bg-subtle px-4 py-3 text-xs leading-5 text-ink-muted">
          <p className="font-semibold text-ink">Round {generation.assignment.round_id}</p>
          <p>{generation.diagnostics.effective_location_source} · {generation.diagnostics.effective_area}</p>
          <p>
            Radius {generation.diagnostics.final_radius_km ?? "—"} km · {generation.diagnostics.selectable_candidate_count} eligible · {generation.diagnostics.affordable_eligible_count} affordable
          </p>
          <p>Affordable slot {generation.diagnostics.affordable_slot_satisfied ? "satisfied" : "not available"}</p>
          <Link href="/picks" className="mt-2 inline-flex min-h-9 items-center font-semibold text-plum underline underline-offset-4">
            Open Picks →
          </Link>
        </div>
      )}
      <PersonalizedPickDeveloperTools status={status} previewArea={previewArea} />
      <MyPickDeveloperTools />
      <ResetVisitTasteDialog
        open={visitTasteResetOpen}
        busy={busy}
        onClose={() => setVisitTasteResetOpen(false)}
        onConfirm={() => void resetVisitTaste()}
      />
    </section>
  );
}
