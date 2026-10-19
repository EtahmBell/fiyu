/**
 * Frontend environment access.
 *
 * Every value here is a NEXT_PUBLIC_ variable, inlined into the browser bundle
 * at build time. No secret may ever be read through this module.
 *
 * The only browser-side Google integration is the restricted Places
 * autocomplete selector on /picks. Its public, HTTP-referrer-restricted key is not a
 * secret. The Fiyu map remains our own SVG map and canonical place data still
 * comes exclusively from the backend.
 */

/** Documented local backend URL (CLAUDE.md), used when the env var is absent. */
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

/** Public browser key for the lazy-loaded Google Places autocomplete widget. */
export function getGooglePlacesUiKitKey(): string | null {
  return readPublic(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}
