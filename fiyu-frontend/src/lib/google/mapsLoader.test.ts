// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadGooglePlaces, resetGoogleMapsLoaderForTests } from "@/lib/google/mapsLoader";

type TestWindow = Window & {
  google?: { maps?: { importLibrary?: ReturnType<typeof vi.fn> } };
  __fiyuGoogleMapsReady?: () => void;
};

class MockToken {}
const mockLibrary = {
  AutocompleteSessionToken: MockToken,
  AutocompleteSuggestion: { fetchAutocompleteSuggestions: vi.fn(async () => ({ suggestions: [] })) },
};

afterEach(() => {
  resetGoogleMapsLoaderForTests();
  delete (window as TestWindow).google;
  document.querySelectorAll('script[data-fiyu-google-maps]').forEach((script) => script.remove());
});

describe("loadGooglePlaces", () => {
  it("waits for the Maps callback and importLibrary instead of resolving from a partial google global", async () => {
    (window as TestWindow).google = { maps: {} };
    const pending = loadGooglePlaces("test-key");
    let settled = false;
    void pending.finally(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(document.querySelectorAll('script[data-fiyu-google-maps="true"]')).toHaveLength(1);

    const importLibrary = vi.fn(async () => mockLibrary);
    (window as TestWindow).google = { maps: { importLibrary } };
    (window as TestWindow).__fiyuGoogleMapsReady?.();

    await expect(pending).resolves.toEqual(mockLibrary);
    expect(importLibrary).toHaveBeenCalledWith("places");
  });

  it("returns one shared promise and imports Places once for simultaneous consumers", async () => {
    const importLibrary = vi.fn(async () => mockLibrary);
    (window as TestWindow).google = { maps: { importLibrary } };
    const first = loadGooglePlaces("test-key");
    const second = loadGooglePlaces("test-key");
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(importLibrary).toHaveBeenCalledTimes(1);
    expect(document.querySelector('script[data-fiyu-google-maps]')).toBeNull();
  });

  it("resets a failed load so reopening can retry", async () => {
    const first = loadGooglePlaces("test-key");
    document.querySelector<HTMLScriptElement>('script[data-fiyu-google-maps]')?.dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow("Restaurant search could not load.");
    expect(document.querySelector('script[data-fiyu-google-maps]')).toBeNull();

    const importLibrary = vi.fn(async () => mockLibrary);
    (window as TestWindow).google = { maps: { importLibrary } };
    await expect(loadGooglePlaces("test-key")).resolves.toEqual(mockLibrary);
  });
});
