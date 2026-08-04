/**
 * Typed error model for the Fiyu backend.
 *
 * The backend emits 200 / 404 / 422 / 502 / 503 / 504, but its OpenAPI schema
 * only documents 200 and 422 (verified against src/fiyu/api.py). These mappings
 * are therefore derived from the route handlers, not from generated types.
 *
 * 503 is overloaded on the backend: it means "database file missing" on the
 * catalog routes, and "Google Places key not configured" on the photo routes. The
 * two are distinguished here by which endpoint was called, because the response
 * body differs only in free-text `detail`.
 */

export type FiyuErrorKind =
  /** 404 - place_id is unknown or not published. */
  | "not-found"
  /** 422 - we sent an invalid request (a bug on our side). */
  | "invalid-request"
  /** 503 on a catalog route - backend database is missing. */
  | "backend-unavailable"
  /** 503 on a photo route - Google Places is not configured server-side. */
  | "provider-unconfigured"
  /** 502 on a photo route - the Google Places call failed. */
  | "provider-failed"
  /** 504 on a photo route - Google Places timed out. */
  | "provider-timeout"
  /** The browser reports no network connection. */
  | "offline"
  /** fetch() rejected: backend down, DNS, CORS, aborted connection. */
  | "network"
  /** Response did not match the expected schema. */
  | "invalid-response"
  /** Anything unmapped, including unexpected status codes. */
  | "unknown";

export interface FiyuApiErrorOptions {
  kind: FiyuErrorKind;
  endpoint: string;
  status?: number;
  detail?: string;
  cause?: unknown;
}

export class FiyuApiError extends Error {
  readonly kind: FiyuErrorKind;
  readonly endpoint: string;
  readonly status?: number;
  /** Backend-provided `detail`, flattened to a string. Never rendered raw as HTML. */
  readonly detail?: string;

  constructor({ kind, endpoint, status, detail, cause }: FiyuApiErrorOptions) {
    super(detail ? `${kind} (${endpoint}): ${detail}` : `${kind} (${endpoint})`);
    this.name = "FiyuApiError";
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = status;
    this.detail = detail;
    if (cause !== undefined) this.cause = cause;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.kind === "network" ||
      this.kind === "offline" ||
      this.kind === "provider-failed" ||
      this.kind === "provider-timeout" ||
      this.kind === "backend-unavailable"
    );
  }
}

export function isFiyuApiError(error: unknown): error is FiyuApiError {
  return error instanceof FiyuApiError;
}

/**
 * Flatten a FastAPI error body into a single string.
 * `detail` is a string for HTTPException and an array of validation objects
 * for 422 responses.
 */
export function extractDetail(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const { msg, loc } = item as { msg?: unknown; loc?: unknown };
        if (typeof msg !== "string") return null;
        const path = Array.isArray(loc) ? loc.join(".") : null;
        return path ? `${path}: ${msg}` : msg;
      })
      .filter((value): value is string => value !== null);
    return messages.length > 0 ? messages.join("; ") : undefined;
  }

  if (typeof detail === "object" && detail !== null) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }

  return undefined;
}

/**
 * Whether this endpoint proxies Google (affects what 502/503/504 mean).
 *
 * The photo routes are the only remaining Google-backed endpoints; the
 * /live-details route was removed from the backend, and the frontend no longer
 * fetches ratings, hours, price or review counts.
 */
function isProviderEndpoint(endpoint: string): boolean {
  return endpoint.includes("/photo");
}

export function kindForStatus(status: number, endpoint: string): FiyuErrorKind {
  switch (status) {
    case 404:
      return "not-found";
    case 422:
      return "invalid-request";
    case 502:
      return "provider-failed";
    case 503:
      return isProviderEndpoint(endpoint) ? "provider-unconfigured" : "backend-unavailable";
    case 504:
      return "provider-timeout";
    default:
      return "unknown";
  }
}

/**
 * Classify a thrown fetch() rejection. AbortError is re-thrown by the caller
 * rather than classified, since an aborted request is not a failure.
 */
export function kindForNetworkFailure(): FiyuErrorKind {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  return "network";
}
