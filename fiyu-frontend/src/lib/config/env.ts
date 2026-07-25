/**
 * Frontend environment access.
 *
 * Every value here is a NEXT_PUBLIC_ variable, meaning it is inlined into the
 * browser bundle at build time. No secret may ever be read through this module.
 *
 * In particular, GOOGLE_PLACES_SERVER_KEY is a backend-only secret and is
 * deliberately absent: the frontend never talks to the Google Places Web
 * Service. Live Google data is proxied by the backend's
 * /public/restaurants/{place_id}/live-details endpoint.
 *
 * References to process.env.NEXT_PUBLIC_* must be written as full static
 * member expressions so that Next.js can statically replace them.
 */

/**
 * Documented local backend URL (CLAUDE.md). Used only when the env var is
 * absent, so that a fresh clone runs against a local backend without setup.
 */
const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function readPublic(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Base URL of the Fiyu backend, without a trailing slash. */
export function getApiBaseUrl(): string {
  const configured = readPublic(process.env.NEXT_PUBLIC_FIYU_API_URL);
  return (configured ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

/** True when NEXT_PUBLIC_FIYU_API_URL was set explicitly rather than defaulted. */
export function isApiBaseUrlConfigured(): boolean {
  return readPublic(process.env.NEXT_PUBLIC_FIYU_API_URL) !== null;
}

/**
 * Browser-restricted Google Maps JavaScript API key.
 * Returns null when unset, which is a supported state: the UI renders a
 * placeholder instead of a map and remains fully usable.
 */
export function getMapsBrowserKey(): string | null {
  return readPublic(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY);
}

/** Optional Map ID for cloud styling and Advanced Markers. */
export function getMapsMapId(): string | null {
  return readPublic(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID);
}

/** Whether an interactive map can be rendered at all. */
export function isMapConfigured(): boolean {
  return getMapsBrowserKey() !== null;
}
