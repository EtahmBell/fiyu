"use client";

import { useEffect, useRef, useState } from "react";
import { getGooglePlacesUiKitKey } from "@/lib/config/env";
import { TOKYO_BOUNDS } from "@/lib/map/projection";

type SelectEvent = Event & { placePrediction: { toPlace(): { id: string } } };
type BasicAutocomplete = HTMLElement & {
  includedRegionCodes: string[];
  includedPrimaryTypes: string[];
  locationRestriction: { west: number; east: number; south: number; north: number };
  placeholder: string;
};
type GoogleWindow = Window & { google?: { maps: { importLibrary(name: "places"): Promise<{ BasicPlaceAutocompleteElement: new () => BasicAutocomplete }> } } };

let loader: Promise<void> | null = null;
function loadGoogle(key: string): Promise<void> {
  if ((window as GoogleWindow).google) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&loading=async`;
    script.async = true;
    script.dataset.fiyuGooglePlaces = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Restaurant search could not load."));
    document.head.append(script);
  });
  return loader;
}

export function GooglePlaceSelector({ disabled, onSelect }: { disabled?: boolean; onSelect: (placeId: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const key = getGooglePlacesUiKitKey();
  const [error, setError] = useState<string | null>(() => key ? null : "Restaurant search is not configured in this environment.");
  useEffect(() => {
    if (!key) return;
    let active = true;
    let element: BasicAutocomplete | null = null;
    const selected = (event: Event) => {
      const placeId = (event as SelectEvent).placePrediction.toPlace().id;
      if (placeId) onSelect(placeId);
    };
    void loadGoogle(key).then(async () => {
      const google = (window as GoogleWindow).google;
      if (!active || !google || !host.current) return;
      const { BasicPlaceAutocompleteElement } = await google.maps.importLibrary("places");
      if (!active || !host.current) return;
      element = new BasicPlaceAutocompleteElement();
      element.includedRegionCodes = ["jp"];
      element.includedPrimaryTypes = ["restaurant", "cafe", "bar"];
      element.locationRestriction = TOKYO_BOUNDS;
      element.placeholder = "Search for a restaurant";
      element.style.display = "block";
      element.style.width = "100%";
      element.toggleAttribute("disabled", disabled);
      element.addEventListener("gmp-select", selected);
      host.current.replaceChildren(element);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "Restaurant search could not load."));
    return () => { active = false; element?.removeEventListener("gmp-select", selected); element?.remove(); };
  }, [disabled, key, onSelect]);
  return <div><div ref={host} className="min-h-12 w-full" aria-label="Restaurant search" />{error ? <p role="alert" className="mt-2 text-sm text-dusty-rose">{error}</p> : null}</div>;
}
