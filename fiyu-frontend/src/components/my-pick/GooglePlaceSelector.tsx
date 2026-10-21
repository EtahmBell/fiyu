"use client";

import { useEffect, useId, useRef, useState } from "react";

import { getGoogleMapsBrowserKey } from "@/lib/config/env";
import { Button } from "@/components/ui/Button";
import {
  loadGooglePlaces,
  type GoogleAutocompleteSuggestion,
  type GooglePlacesLibrary,
} from "@/lib/google/mapsLoader";
import { TOKYO_BOUNDS } from "@/lib/map/projection";

export type GooglePlaceSelection = {
  placeId: string;
  userNameHint: string;
  userAddressHint: string;
  displayName: string;
  secondaryText: string | null;
};

const MIN_QUERY_LENGTH = 1;

function predictionFor(suggestion: GoogleAutocompleteSuggestion) {
  return suggestion.placePrediction ?? null;
}

export function GooglePlaceSelector({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (selection: GooglePlaceSelection | null) => void;
}) {
  const key = getGoogleMapsBrowserKey();
  const listboxId = useId();
  const [library, setLibrary] = useState<GooglePlacesLibrary | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GoogleAutocompleteSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => key ? null : "Restaurant search is not configured in this environment.");
  const tokenRef = useRef<object | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    if (!key) return;
    let active = true;
    void loadGooglePlaces(key)
      .then((places) => {
        if (!active) return;
        tokenRef.current = new places.AutocompleteSessionToken();
        setLibrary(places);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Restaurant search could not load.");
      });
    return () => {
      active = false;
      requestVersion.current += 1;
      tokenRef.current = null;
    };
  }, [key]);

  const search = () => {
    const input = `${name.trim()} ${address.trim()}`;
    const version = ++requestVersion.current;
    if (name.trim().length < MIN_QUERY_LENGTH || address.trim().length < MIN_QUERY_LENGTH) {
      setError("Enter both the restaurant name and address.");
      return;
    }
    if (!library || !tokenRef.current) return;
    setLoading(true);
    setError(null);
    setSuggestions([]);
    void library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ["jp"],
        locationRestriction: TOKYO_BOUNDS,
        sessionToken: tokenRef.current as object,
      })
        .then(({ suggestions: next }) => {
          if (requestVersion.current !== version) return;
          const matches = next.filter((suggestion) => Boolean(predictionFor(suggestion)?.placeId));
          setSuggestions(matches);
          if (matches.length === 0) setError("We couldn't find a matching restaurant. Check the name or address and try again.");
          setActiveIndex(-1);
        })
        .catch(() => {
          if (requestVersion.current !== version) return;
          setSuggestions([]);
          setError("We couldn't check restaurants right now. Try again.");
        })
        .finally(() => {
          if (requestVersion.current === version) setLoading(false);
        });
  };

  const choose = (suggestion: GoogleAutocompleteSuggestion) => {
    const prediction = predictionFor(suggestion);
    if (!prediction?.placeId) return;
    setSelectedPlaceId(prediction.placeId);
    onSelect({
      placeId: prediction.placeId,
      userNameHint: name.trim(),
      userAddressHint: address.trim(),
      displayName: prediction.mainText?.text || prediction.text.text,
      secondaryText: prediction.secondaryText?.text || null,
    });
  };

  const onChange = (field: "name" | "address", value: string) => {
    if (field === "name") setName(value); else setAddress(value);
    setSelectedPlaceId(null);
    onSelect(null);
    setActiveIndex(-1);
    requestVersion.current += 1;
    setSuggestions([]);
    setLoading(false);
    setError(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && suggestions.length === 0) {
      event.preventDefault();
      search();
      return;
    }
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  };

  const expanded = suggestions.length > 0;
  return (
    <div className="min-w-0 max-w-full">
      <label htmlFor={`${listboxId}-name`} className="mb-2 block text-sm font-medium text-ink">Restaurant name <span aria-hidden="true">*</span></label>
      <input
        id={`${listboxId}-name`}
        data-my-pick-search-input
        type="search"
        value={name}
        disabled={disabled || !key}
        placeholder=""
        autoComplete="off"
        maxLength={200}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        onChange={(event) => onChange("name", event.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-12 w-full rounded-xl border border-line bg-canvas px-4 text-base text-ink outline-none placeholder:text-ink-faint focus:border-lavender-400 focus:ring-2 focus:ring-lavender-100 disabled:opacity-50"
      />
      <p className="mt-2 text-xs leading-5 text-ink-muted">Enter the name as you know it.</p>
      <label htmlFor={`${listboxId}-address`} className="mt-4 mb-2 block text-sm font-medium text-ink">Restaurant address <span aria-hidden="true">*</span></label>
      <input
        id={`${listboxId}-address`}
        type="text"
        value={address}
        disabled={disabled || !key}
        autoComplete="street-address"
        maxLength={500}
        onChange={(event) => onChange("address", event.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-12 w-full rounded-xl border border-line bg-canvas px-4 text-base text-ink outline-none focus:border-lavender-400 focus:ring-2 focus:ring-lavender-100 disabled:opacity-50"
      />
      <p className="mt-2 text-xs leading-5 text-ink-muted">Enter or paste the restaurant&apos;s address.</p>
      <Button type="button" className="mt-4 w-full" variant="primary" disabled={disabled || !key || !library || loading || !name.trim() || !address.trim()} onClick={search}>
        {loading ? "Finding restaurants…" : "Find restaurant"}
      </Button>

      {(expanded || loading) ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg" data-testid="google-predictions">
          {loading && !expanded ? <p className="px-4 py-3 text-sm text-ink-muted">Finding restaurants…</p> : null}
          {expanded ? (
            <ul id={listboxId} role="listbox" className="max-h-56 overflow-y-auto overscroll-contain py-1">
              {suggestions.map((suggestion, index) => {
                const prediction = predictionFor(suggestion);
                if (!prediction) return null;
                const main = prediction.mainText?.text || prediction.text.text;
                const secondary = prediction.secondaryText?.text;
                return (
                  <li key={`${prediction.placeId}-${index}`} role="option" aria-selected={selectedPlaceId === prediction.placeId}>
                    <button
                      id={`${listboxId}-${index}`}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(suggestion)}
                      className={`block w-full px-4 py-3 text-left ${selectedPlaceId === prediction.placeId || activeIndex === index ? "bg-lavender-50" : "hover:bg-subtle"}`}
                    >
                      <span className="block text-sm font-medium text-ink">{selectedPlaceId === prediction.placeId ? "✓ " : ""}{main}</span>
                      {secondary ? <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{secondary}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {expanded ? (
            <div className="flex justify-end border-t border-line px-4 py-2">
              <span translate="no" aria-label="Google Maps" className="text-xs font-normal tracking-normal whitespace-nowrap text-[#5E5E5E]">Google Maps</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-dusty-rose">{error}</p> : null}
    </div>
  );
}
