"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  fetchDeveloperStatus,
  generateDeveloperDailyPicks,
  resetDeveloperDailyPicks,
  updateDeveloperLocation,
} from "@/lib/api/client";
import type {
  DeveloperGeneratePicksResponse,
  DeveloperStatus,
} from "@/lib/api/schemas";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import { authService } from "@/lib/auth/authService";
import { dailyPicksStorageKey } from "@/lib/daily-picks/storage";

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

export function DeveloperTools() {
  const [status, setStatus] = useState<DeveloperStatus | null>(null);
  const [previewArea, setPreviewArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<DeveloperGeneratePicksResponse | null>(null);

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

  if (!status) return null;

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
    </section>
  );
}
