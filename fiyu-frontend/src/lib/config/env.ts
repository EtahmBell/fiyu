/**
 * Frontend environment access.
 *
 * Every value here is a NEXT_PUBLIC_ variable, inlined into the browser bundle
 * at build time. No secret may ever be read through this module.
 *
 * There are no Google Maps variables: the discovery map is Fiyu's own SVG map,
 * and all Google data (photos) is proxied by the backend. The browser never
 * calls a Google API and never holds a Google key.
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
