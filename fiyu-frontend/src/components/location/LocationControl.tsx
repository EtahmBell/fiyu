"use client";

import { Button } from "@/components/ui/Button";
import type { LocationAnchor } from "@/lib/api/schemas";
import { type GeolocationState, geolocationMessage } from "@/lib/hooks/useGeolocation";
import {
  type DiscoveryAnchor,
  anchorDescription,
  anchorLabel,
} from "@/lib/location/anchor";
import { cn } from "@/lib/utils/cn";

export interface LocationControlProps {
  anchor: DiscoveryAnchor | null;
  geolocation: GeolocationState;
  areaAnchors: LocationAnchor[];
  placingPin: boolean;
  onUseCurrentLocation: () => void;
  onChooseArea: (anchor: LocationAnchor) => void;
  onTogglePlacePin: () => void;
  onClear: () => void;
}

/**
 * The three ways to set a distance origin.
 *
 * Location is never requested on load. The button explains what it is for
 * before anything is asked, and the browser prompt only appears on press.
 *
 * Area anchors are labelled with the backend's own qualifier ("Approximate
 * center of Shibuya") so they can never read as the user's exact position.
 */
export function LocationControl({
  anchor,
  geolocation,
  areaAnchors,
  placingPin,
  onUseCurrentLocation,
  onChooseArea,
  onTogglePlacePin,
  onClear,
}: LocationControlProps) {
  const message = geolocationMessage(geolocation);
  const description = anchor ? anchorDescription(anchor) : null;

  if (anchor) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--map-user-marker)" }}
            />
            {anchorLabel(anchor)}
          </p>
          {description && <p className="mt-0.5 text-xs text-ink-faint">{description}</p>}
          <p className="mt-1 text-xs text-ink-faint">
            Distances are straight-line, not walking routes.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="shrink-0">
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-sm font-medium text-ink">Show distances from a starting point</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Pick a starting point to see roughly how far each restaurant is. Your location is used
        only in this browser — it is never saved or sent to Fiyu.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onUseCurrentLocation}
          disabled={geolocation.status === "requesting"}
        >
          {geolocation.status === "requesting" ? "Locating…" : "Use my location"}
        </Button>

        <Button
          variant={placingPin ? "primary" : "secondary"}
          size="sm"
          onClick={onTogglePlacePin}
          aria-pressed={placingPin}
        >
          {placingPin ? "Tap the map…" : "Place a pin"}
        </Button>
      </div>

      {message && (
        <p role="status" className="mt-2 text-xs leading-relaxed text-ink-muted">
          {message}
        </p>
      )}

      {areaAnchors.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-ink-faint">Or choose an area</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {areaAnchors.map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  onClick={() => onChooseArea(area)}
                  title={area.qualifier}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-chip border border-line px-3.5 text-sm",
                    "text-ink-muted transition-colors duration-200 ease-(--ease-fiyu)",
                    "hover:border-line-strong hover:text-ink active:bg-lavender-50",
                  )}
                >
                  {area.display_name}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            Areas are approximate centres, not exact addresses.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-faint">
          Area shortcuts aren&apos;t available yet.
        </p>
      )}
    </div>
  );
}
