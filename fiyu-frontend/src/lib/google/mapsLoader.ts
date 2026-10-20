export type GoogleFormattableText = { text: string };

export type GooglePlacePrediction = {
  placeId: string;
  mainText?: GoogleFormattableText;
  secondaryText?: GoogleFormattableText;
  text: GoogleFormattableText;
};

export type GoogleAutocompleteSessionToken = object;

export type GoogleAutocompleteRequest = {
  input: string;
  includedRegionCodes: string[];
  locationRestriction: { west: number; east: number; south: number; north: number };
  sessionToken: GoogleAutocompleteSessionToken;
};

export type GoogleAutocompleteSuggestion = {
  placePrediction?: GooglePlacePrediction;
};

export type GooglePlacesLibrary = {
  AutocompleteSessionToken: new () => GoogleAutocompleteSessionToken;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(
      request: GoogleAutocompleteRequest,
    ): Promise<{ suggestions: GoogleAutocompleteSuggestion[] }>;
  };
};

type GoogleMaps = {
  importLibrary?: (name: "places") => Promise<GooglePlacesLibrary>;
};

type GoogleMapsWindow = Window & {
  google?: { maps?: GoogleMaps };
  __fiyuGoogleMapsReady?: () => void;
};

const CALLBACK_NAME = "__fiyuGoogleMapsReady";
const SCRIPT_ATTRIBUTE = "data-fiyu-google-maps";
const READINESS_TIMEOUT_MS = 10_000;
let placesPromise: Promise<GooglePlacesLibrary> | null = null;

function mapsWindow(): GoogleMapsWindow {
  return window as GoogleMapsWindow;
}

function hasImporter(): boolean {
  return typeof mapsWindow().google?.maps?.importLibrary === "function";
}

async function importPlaces(): Promise<GooglePlacesLibrary> {
  const importLibrary = mapsWindow().google?.maps?.importLibrary;
  if (typeof importLibrary !== "function") {
    throw new Error("Restaurant search could not finish loading.");
  }
  const library = await importLibrary.call(mapsWindow().google?.maps, "places");
  if (
    typeof library.AutocompleteSessionToken !== "function"
    || typeof library.AutocompleteSuggestion?.fetchAutocompleteSuggestions !== "function"
  ) {
    throw new Error("Restaurant search is unavailable in this browser.");
  }
  return library;
}

function waitForImporter(): Promise<void> {
  if (hasImporter()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (hasImporter()) {
        resolve();
      } else if (Date.now() - startedAt >= READINESS_TIMEOUT_MS) {
        reject(new Error("Restaurant search took too long to load. Please try again."));
      } else {
        window.setTimeout(check, 25);
      }
    };
    check();
  });
}

/**
 * Load one shared Places library instance. A script `load` event is not enough:
 * the callback (or an already-loaded importer) is the readiness boundary.
 */
export function loadGooglePlaces(key: string): Promise<GooglePlacesLibrary> {
  if (placesPromise) return placesPromise;
  if (hasImporter()) {
    placesPromise = importPlaces().catch((error) => {
      placesPromise = null;
      throw error;
    });
    return placesPromise;
  }

  placesPromise = new Promise<void>((resolve, reject) => {
    const googleWindow = mapsWindow();
    let settled = false;
    let ownedScript: HTMLScriptElement | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      void waitForImporter().then(resolve, reject);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      ownedScript?.remove();
      reject(new Error("Restaurant search could not load."));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[${SCRIPT_ATTRIBUTE}], script[src^="https://maps.googleapis.com/maps/api/js"]`,
    );
    if (existing) {
      googleWindow.__fiyuGoogleMapsReady = finish;
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", fail, { once: true });
      void waitForImporter().then(finish, fail);
      return;
    }

    googleWindow.__fiyuGoogleMapsReady = finish;
    const script = document.createElement("script");
    ownedScript = script;
    script.setAttribute(SCRIPT_ATTRIBUTE, "true");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  })
    .then(importPlaces)
    .catch((error) => {
      placesPromise = null;
      throw error;
    });
  return placesPromise;
}

export function resetGoogleMapsLoaderForTests(): void {
  placesPromise = null;
  delete mapsWindow().__fiyuGoogleMapsReady;
}
