"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { FreeOriginSetup } from "@/lib/location/origin";

export function FreeOriginOnboarding({ setup }: { setup: FreeOriginSetup }) {
  const [explained, setExplained] = useState(false);
  const [areaId, setAreaId] = useState(setup.areaAnchors[0]?.id ?? "");
  const failed = ["denied", "unavailable", "timeout"].includes(setup.geolocation.status);

  if (setup.origin) return null;

  return (
    <div className="rounded-card border border-line bg-lavender-50/40 p-3.5 sm:p-4">
      <h3 className="text-sm font-medium text-ink">Choose your discovery origin</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Fiyu uses one nearby area to shape your first daily selection. Your precise location
        stays in this browser and is never saved or sent to Fiyu.
      </p>

      {!explained && setup.geolocation.status === "idle" && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setExplained(true)}>
          Set up location
        </Button>
      )}

      {explained && setup.geolocation.status === "idle" && (
        <div className="mt-2.5">
          <p className="text-xs text-ink-muted">
            Your browser will ask once for permission. Fiyu only keeps the result for this visit.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-1.5"
            onClick={setup.requestCurrentLocation}
          >
            Continue with current location
          </Button>
        </div>
      )}

      {setup.geolocation.status === "requesting" && (
        <p role="status" className="mt-3 text-xs text-ink-muted">
          Finding your location…
        </p>
      )}

      {failed && (
        <div className="mt-2.5 space-y-1.5">
          <p role="status" className="text-xs text-ink-muted">
            Location is unavailable. Choose one home area instead; Fiyu will not ask again.
          </p>
          {setup.areaAnchors.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="sr-only" htmlFor="free-home-area">
                Home area
              </label>
              <select
                id="free-home-area"
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
                className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
              >
                {setup.areaAnchors.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.display_name}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const area = setup.areaAnchors.find((candidate) => candidate.id === areaId);
                  if (area) setup.chooseHomeArea(area);
                }}
              >
                Use home area
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={setup.continueWithoutLocation}>
              Continue without location
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
