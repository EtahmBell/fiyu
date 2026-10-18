// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ getGooglePlacesUiKitKey: () => "public-test-key" }));
import { GooglePlaceSelector } from "@/components/my-pick/GooglePlaceSelector";

describe("GooglePlaceSelector", () => {
  afterEach(() => { cleanup(); delete (window as Window & { google?: unknown }).google; });

  it("isolates Google UI Kit, restricts suggestions, and emits only the selected Place ID", async () => {
    class MockAutocomplete extends HTMLElement {}
    customElements.define("mock-place-autocomplete", MockAutocomplete);
    (window as Window & { google?: unknown }).google = {
      maps: { importLibrary: vi.fn(async () => ({ BasicPlaceAutocompleteElement: MockAutocomplete })) },
    };
    const onSelect = vi.fn();
    render(<GooglePlaceSelector onSelect={onSelect} />);
    let element: Element | null = null;
    await waitFor(() => {
      element = document.querySelector("mock-place-autocomplete");
      expect(element).not.toBeNull();
    });
    const autocomplete = element as unknown as HTMLElement & {
      includedRegionCodes: string[];
      locationRestriction: { west: number; east: number; south: number; north: number };
    };
    expect(autocomplete.includedRegionCodes).toEqual(["jp"]);
    expect(autocomplete.locationRestriction).toEqual({ west: 139.56, east: 139.92, south: 35.52, north: 35.82 });
    const event = new Event("gmp-select") as Event & { placePrediction?: unknown };
    event.placePrediction = { toPlace: () => ({ id: "google-place-id", location: { lat: 1, lng: 2 } }) };
    autocomplete.dispatchEvent(event);
    expect(onSelect).toHaveBeenCalledWith("google-place-id");
  });

  it("shares one lazy Google loader across simultaneous selectors", async () => {
    class MockAutocomplete extends HTMLElement {}
    customElements.define("mock-place-autocomplete-shared", MockAutocomplete);
    const importLibrary = vi.fn(async () => ({ BasicPlaceAutocompleteElement: MockAutocomplete }));
    render(<><GooglePlaceSelector onSelect={vi.fn()} /><GooglePlaceSelector onSelect={vi.fn()} /></>);
    const scripts = document.querySelectorAll('script[data-fiyu-google-places="true"]');
    expect(scripts).toHaveLength(1);
    (window as Window & { google?: unknown }).google = { maps: { importLibrary } };
    scripts[0].dispatchEvent(new Event("load"));
    await waitFor(() => expect(document.querySelectorAll("mock-place-autocomplete-shared")).toHaveLength(2));
  });
});
