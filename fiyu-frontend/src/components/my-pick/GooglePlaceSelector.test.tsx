// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ getGooglePlacesUiKitKey: () => "public-test-key" }));
import { GooglePlaceSelector } from "@/components/my-pick/GooglePlaceSelector";
import { resetGoogleMapsLoaderForTests } from "@/lib/google/mapsLoader";

describe("GooglePlaceSelector", () => {
  afterEach(() => {
    cleanup();
    resetGoogleMapsLoaderForTests();
    delete (window as Window & { google?: unknown }).google;
    document.querySelectorAll('script[data-fiyu-google-maps]').forEach((script) => script.remove());
  });

  it("isolates Google UI Kit, restricts suggestions, and emits only the selected Place ID", async () => {
    class MockAutocomplete extends HTMLElement {
      readonly input: HTMLInputElement;
      constructor() {
        super();
        this.input = document.createElement("input");
        this.attachShadow({ mode: "open" }).append(this.input);
        this.addEventListener("click", () => this.input.focus());
      }
    }
    customElements.define("mock-place-autocomplete", MockAutocomplete);
    (window as Window & { google?: unknown }).google = {
      maps: { importLibrary: vi.fn(async () => ({ PlaceAutocompleteElement: MockAutocomplete })) },
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
    fireEvent.click(autocomplete);
    const input = autocomplete.shadowRoot?.querySelector("input") as HTMLInputElement;
    expect(autocomplete.matches(":disabled")).toBe(false);
    expect(autocomplete.hasAttribute("disabled")).toBe(false);
    expect(autocomplete).toBe(document.activeElement);
    expect(autocomplete.shadowRoot?.activeElement).toBe(input);
    fireEvent.input(input, { target: { value: "Kichijoji" } });
    expect(input.value).toBe("Kichijoji");
    const event = new Event("gmp-select") as Event & { placePrediction?: unknown };
    event.placePrediction = { placeId: "google-place-id" };
    autocomplete.dispatchEvent(event);
    expect(onSelect).toHaveBeenCalledWith("google-place-id");
  });

  it("shares one lazy Google loader across simultaneous selectors", async () => {
    class MockAutocomplete extends HTMLElement {}
    customElements.define("mock-place-autocomplete-shared", MockAutocomplete);
    const importLibrary = vi.fn(async () => ({ PlaceAutocompleteElement: MockAutocomplete }));
    render(<><GooglePlaceSelector onSelect={vi.fn()} /><GooglePlaceSelector onSelect={vi.fn()} /></>);
    const scripts = document.querySelectorAll('script[data-fiyu-google-maps="true"]');
    expect(scripts).toHaveLength(1);
    (window as Window & { google?: unknown }).google = { maps: { importLibrary } };
    (window as Window & { __fiyuGoogleMapsReady?: () => void }).__fiyuGoogleMapsReady?.();
    await waitFor(() => expect(document.querySelectorAll("mock-place-autocomplete-shared")).toHaveLength(2));
    expect(importLibrary).toHaveBeenCalledTimes(1);
  });

  it("shows calm Fiyu error UI after a failed first load", async () => {
    render(<GooglePlaceSelector onSelect={vi.fn()} />);
    document.querySelector<HTMLScriptElement>('script[data-fiyu-google-maps]')?.dispatchEvent(new Event("error"));
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toBe("Restaurant search could not load."));
    expect(document.body.textContent).not.toContain("importLibrary is not a function");
  });

  it("is safe to unmount and reopen after Places is ready", async () => {
    class ReopenAutocomplete extends HTMLElement {}
    customElements.define("mock-place-autocomplete-reopen", ReopenAutocomplete);
    const importLibrary = vi.fn(async () => ({ PlaceAutocompleteElement: ReopenAutocomplete }));
    (window as Window & { google?: unknown }).google = { maps: { importLibrary } };
    const first = render(<GooglePlaceSelector onSelect={vi.fn()} />);
    await waitFor(() => expect(document.querySelector("mock-place-autocomplete-reopen")).not.toBeNull());
    first.unmount();
    render(<GooglePlaceSelector onSelect={vi.fn()} />);
    await waitFor(() => expect(document.querySelector("mock-place-autocomplete-reopen")).not.toBeNull());
    expect(importLibrary).toHaveBeenCalledTimes(1);
  });
});
