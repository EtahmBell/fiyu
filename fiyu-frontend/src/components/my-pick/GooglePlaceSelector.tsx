"use client";

import { useEffect, useRef, useState } from "react";
import { getGooglePlacesUiKitKey } from "@/lib/config/env";
import {
  loadGooglePlaces,
  type GooglePlaceAutocompleteElement,
  type GooglePlaceSelectEvent,
} from "@/lib/google/mapsLoader";
import { TOKYO_BOUNDS } from "@/lib/map/projection";

export function GooglePlaceSelector({ disabled, onSelect }: { disabled?: boolean; onSelect: (placeId: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const key = getGooglePlacesUiKitKey();
  const [error, setError] = useState<string | null>(() => key ? null : "Restaurant search is not configured in this environment.");
  useEffect(() => {
    if (!key) return;
    let active = true;
    let element: GooglePlaceAutocompleteElement | null = null;
    const selected = (event: Event) => {
      const placeId = (event as GooglePlaceSelectEvent).placePrediction.placeId;
      if (placeId) onSelect(placeId);
    };
    void loadGooglePlaces(key).then(({ PlaceAutocompleteElement }) => {
      if (!active || !host.current) return;
      element = new PlaceAutocompleteElement();
      element.includedRegionCodes = ["jp"];
      element.includedPrimaryTypes = ["restaurant", "cafe", "bar"];
      element.locationRestriction = TOKYO_BOUNDS;
      element.placeholder = "Search for a restaurant";
      element.style.display = "block";
      element.style.width = "100%";
      element.style.maxWidth = "100%";
      element.style.boxSizing = "border-box";
      element.style.colorScheme = "light";
      // `toggleAttribute(name, undefined)` toggles instead of forcing false,
      // which made the freshly-created Google field disabled by default.
      element.toggleAttribute("disabled", Boolean(disabled));
      element.addEventListener("gmp-select", selected);
      host.current.replaceChildren(element);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "Restaurant search could not load."));
    return () => { active = false; element?.removeEventListener("gmp-select", selected); element?.remove(); };
  }, [disabled, key, onSelect]);
  return <div className="min-w-0 max-w-full overflow-visible"><div ref={host} className="min-h-12 min-w-0 max-w-full overflow-visible" aria-label="Restaurant search" />{error ? <p role="alert" className="mt-2 text-sm text-dusty-rose">{error}</p> : null}</div>;
}
