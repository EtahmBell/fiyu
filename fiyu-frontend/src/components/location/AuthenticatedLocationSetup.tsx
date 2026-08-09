"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  checkCurrentDiscoveryLocation,
  saveManualDiscoveryLocation,
} from "@/lib/api/client";
import type { DiscoveryLocation, LocationAnchor } from "@/lib/api/schemas";
import type { UseGeolocation } from "@/lib/hooks/useGeolocation";

interface Props {
  anchors: LocationAnchor[];
  geolocation: UseGeolocation;
  onConfigured(location: DiscoveryLocation): void;
}

type LocationCheckStatus =
  | "idle"
  | "checking"
  | "inside_tokyo"
  | "outside_tokyo"
  | "permission_denied"
  | "unavailable";

export function AuthenticatedLocationSetup({ anchors, geolocation, onConfigured }: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState<LocationAnchor | null>(null);
  const [arrivalDate, setArrivalDate] = useState("");
  const [serviceCheckStatus, setServiceCheckStatus] =
    useState<Exclude<LocationCheckStatus, "permission_denied">>("idle");
  const [outsideDialogOpen, setOutsideDialogOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedPoint = useRef<string | null>(null);
  const areaSearchRef = useRef<HTMLInputElement>(null);
  const areaComboboxRef = useRef<HTMLDivElement>(null);
  const outsideDialogRef = useRef<HTMLDialogElement>(null);
  const locationCheckStatus: LocationCheckStatus =
    geolocation.state.status === "denied"
      ? "permission_denied"
      : ["unavailable", "timeout"].includes(geolocation.state.status)
        ? "unavailable"
        : geolocation.state.status === "requesting" ||
            (geolocation.state.status === "granted" && serviceCheckStatus === "idle")
          ? "checking"
          : serviceCheckStatus;
  const outsideTokyo = locationCheckStatus === "outside_tokyo";

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return anchors
      .filter((anchor) =>
        !term
          ? true
          : `${anchor.display_name} ${anchor.area_name}`.toLocaleLowerCase().includes(term),
      )
      .slice(0, 7);
  }, [anchors, query]);

  useEffect(() => {
    if (geolocation.state.status !== "granted") return;
    const key = `${geolocation.state.point.lat}:${geolocation.state.point.lng}`;
    if (submittedPoint.current === key) return;
    submittedPoint.current = key;
    setServiceCheckStatus("checking");
    setSaving(true);
    setError(null);
    void checkCurrentDiscoveryLocation(
      geolocation.state.point.lat,
      geolocation.state.point.lng,
    )
      .then((result) => {
        if (result.inside_service_area) {
          setServiceCheckStatus("inside_tokyo");
          onConfigured(result.location);
        } else {
          setServiceCheckStatus("outside_tokyo");
          setError(null);
          setOutsideDialogOpen(true);
        }
      })
      .catch((failure: unknown) => {
        setServiceCheckStatus("unavailable");
        setError("We couldn't check that location. Choose a Tokyo area instead.");
        if (process.env.NODE_ENV !== "production") {
          console.error("Discovery location check failed", failure);
        }
      })
      .finally(() => setSaving(false));
  }, [geolocation.state, onConfigured]);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (!areaComboboxRef.current?.contains(event.target as Node)) {
        setFocused(false);
        setActiveResultIndex(-1);
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, []);

  useEffect(() => {
    const dialog = outsideDialogRef.current;
    if (!dialog) return;
    if (outsideDialogOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!outsideDialogOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [outsideDialogOpen]);

  function chooseTokyoArea() {
    const dialog = outsideDialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    setOutsideDialogOpen(false);
    setFocused(true);
    areaSearchRef.current?.focus();
  }

  const manualMode = outsideTokyo ? "preview" : "manual";
  const mayRequestLocation = ["idle", "permission_denied", "unavailable"].includes(
    locationCheckStatus,
  );

  function requestLocation() {
    submittedPoint.current = null;
    setServiceCheckStatus("idle");
    setError(null);
    geolocation.request();
  }

  async function saveArea() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const location = await saveManualDiscoveryLocation({
        location_mode: manualMode,
        discovery_label: selected.area_name,
        discovery_latitude: selected.latitude,
        discovery_longitude: selected.longitude,
        arrival_date: arrivalDate || null,
      });
      onConfigured(location);
    } catch (failure: unknown) {
      setError("That area couldn't be saved. Please try again.");
      if (process.env.NODE_ENV !== "production") {
        console.error("Discovery location save failed", failure);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-[calc(100dvh-var(--spacing-header))] bg-canvas px-5 py-10 sm:px-8 lg:py-16">
      <section className="mx-auto max-w-xl rounded-card border border-line bg-surface p-6 sm:p-9">
        <p className="text-[0.68rem] font-semibold tracking-[0.2em] text-plum">TOKYO EDITION</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink">
          {outsideTokyo ? "Heading to Tokyo?" : "Find places around you"}
        </h1>
        <p className="mt-3 max-w-[42ch] text-sm leading-6 text-ink-muted">
          {outsideTokyo
            ? "You're not in Tokyo right now. Choose one area to explore before you arrive."
            : "Fiyu uses your location to choose restaurants nearby."}
        </p>

        {mayRequestLocation && (
          <div className="mt-7">
            <Button
              variant="primary"
              onClick={requestLocation}
              disabled={saving}
            >
              {saving || geolocation.state.status === "requesting"
                ? "Finding your location…"
                : "Use my location"}
            </Button>
          </div>
        )}

        {locationCheckStatus === "checking" && (
          <p role="status" className="mt-7 text-sm text-ink-muted">
            Finding your location…
          </p>
        )}

        <div className="my-7 border-t border-line" />
        <div>
          <label htmlFor="tokyo-area-search" className="text-xs font-semibold tracking-wide text-ink">
            {outsideTokyo ? "AREA" : "Choose a Tokyo area"}
          </label>
          <div ref={areaComboboxRef} className="relative mt-2">
            <input
              ref={areaSearchRef}
              id="tokyo-area-search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={focused && !selected && results.length > 0}
              aria-controls="tokyo-area-results"
              aria-activedescendant={
                focused && activeResultIndex >= 0
                  ? `tokyo-area-option-${activeResultIndex}`
                  : undefined
              }
              value={selected ? selected.display_name : query}
              placeholder="Search a Tokyo area or station"
              autoComplete="off"
              onFocus={() => setFocused(true)}
              onChange={(event) => {
                setSelected(null);
                setQuery(event.target.value);
                setActiveResultIndex(-1);
                setFocused(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setFocused(false);
                  setActiveResultIndex(-1);
                  return;
                }
                if (results.length === 0) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setFocused(true);
                  setActiveResultIndex((index) => Math.min(index + 1, results.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setFocused(true);
                  setActiveResultIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter" && focused) {
                  event.preventDefault();
                  const area = results[activeResultIndex] ?? results[0];
                  if (area) {
                    setSelected(area);
                    setQuery("");
                    setFocused(false);
                    setActiveResultIndex(-1);
                  }
                }
              }}
              className="min-h-12 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-plum focus:ring-1 focus:ring-plum"
            />
            {focused && !selected && results.length > 0 && (
              <div
                id="tokyo-area-results"
                role="listbox"
                aria-label="Tokyo area search results"
                className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg"
              >
                {results.map((anchor, index) => (
                  <button
                    key={anchor.id}
                    id={`tokyo-area-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveResultIndex(index)}
                    onClick={() => {
                      setSelected(anchor);
                      setQuery("");
                      setFocused(false);
                      setActiveResultIndex(-1);
                    }}
                    className="block min-h-11 w-full px-3 py-2 text-left hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                  >
                    <span className="block text-sm font-medium text-ink">{anchor.area_name}</span>
                    <span className="block text-xs text-ink-muted">{anchor.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {outsideTokyo && (
          <div className="mt-5">
            <label htmlFor="arrival-date" className="text-xs font-semibold tracking-wide text-ink">
              ARRIVING <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id="arrival-date"
              type="date"
              value={arrivalDate}
              onChange={(event) => setArrivalDate(event.target.value)}
              className="mt-2 block min-h-12 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-plum focus:ring-1 focus:ring-plum"
            />
          </div>
        )}

        {["permission_denied", "unavailable"].includes(locationCheckStatus) && (
          <p role="status" className="mt-4 text-xs leading-5 text-ink-muted">
            {error ?? "Location isn't available. Choose a Tokyo area to continue."}
          </p>
        )}

        <Button
          variant="primary"
          className="mt-6 w-full sm:w-auto"
          disabled={!selected || saving}
          onClick={() => void saveArea()}
        >
          {outsideTokyo ? "Explore this area" : "Use this area"}
        </Button>
      </section>

      {outsideTokyo && (
        <dialog
          ref={outsideDialogRef}
          aria-labelledby="outside-tokyo-title"
          aria-describedby="outside-tokyo-description"
          onCancel={(event) => {
            event.preventDefault();
            setOutsideDialogOpen(false);
          }}
          onClose={() => setOutsideDialogOpen(false)}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-0 text-ink shadow-[0_12px_36px_-28px_rgba(49,40,61,0.45)] backdrop:bg-plum/25"
        >
          <div className="px-6 py-7 sm:px-8 sm:py-8">
            <h2 id="outside-tokyo-title" className="font-display text-2xl leading-tight text-ink">
              You&apos;re not in Tokyo right now
            </h2>
            <p
              id="outside-tokyo-description"
              className="mt-3 max-w-[34ch] text-sm leading-6 text-ink-muted"
            >
              Choose one Tokyo area to explore until you arrive.
            </p>
            <Button variant="primary" className="mt-6 w-full sm:w-auto" onClick={chooseTokyoArea}>
              Choose Tokyo area
            </Button>
            <p className="mt-3 text-xs leading-5 text-ink-faint">You can update this later.</p>
          </div>
        </dialog>
      )}
    </main>
  );
}
