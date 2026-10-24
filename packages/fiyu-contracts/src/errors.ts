export type FiyuErrorKind =
  | "not-found"
  | "invalid-request"
  | "backend-unavailable"
  | "provider-unconfigured"
  | "provider-failed"
  | "provider-timeout"
  | "offline"
  | "timeout"
  | "network"
  | "rate-limited"
  | "unauthorized"
  | "forbidden"
  | "server-error"
  | "invalid-response"
  | "unknown";

export interface FiyuApiErrorOptions {
  kind: FiyuErrorKind;
  endpoint: string;
  status?: number;
  detail?: string;
  responseBody?: unknown;
  cause?: unknown;
}

export class FiyuApiError extends Error {
  readonly kind: FiyuErrorKind;
  readonly endpoint: string;
  readonly status?: number;
  readonly detail?: string;
  readonly responseBody?: unknown;

  constructor({ kind, endpoint, status, detail, responseBody, cause }: FiyuApiErrorOptions) {
    super(detail ? `${kind} (${endpoint}): ${detail}` : `${kind} (${endpoint})`);
    this.name = "FiyuApiError";
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = status;
    this.detail = detail;
    this.responseBody = responseBody;
    if (cause !== undefined) this.cause = cause;
  }

  get isRetryable(): boolean {
    return [
      "network",
      "offline",
      "timeout",
      "provider-failed",
      "provider-timeout",
      "backend-unavailable",
      "server-error",
    ].includes(this.kind);
  }
}

export function isFiyuApiError(error: unknown): error is FiyuApiError {
  return error instanceof FiyuApiError;
}

export function extractDetail(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const { msg, loc } = item as { msg?: unknown; loc?: unknown };
      if (typeof msg !== "string") return [];
      const path = Array.isArray(loc) ? loc.join(".") : null;
      return [path ? `${path}: ${msg}` : msg];
    });
    return messages.length > 0 ? messages.join("; ") : undefined;
  }
  if (typeof detail === "object" && detail !== null) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return undefined;
}

function isProviderEndpoint(endpoint: string): boolean {
  return endpoint.includes("/photo");
}

export function kindForStatus(status: number, endpoint: string): FiyuErrorKind {
  switch (status) {
    case 401: return "unauthorized";
    case 403: return "forbidden";
    case 404: return "not-found";
    case 422: return "invalid-request";
    case 429: return "rate-limited";
    case 502: return "provider-failed";
    case 503: return isProviderEndpoint(endpoint) ? "provider-unconfigured" : "backend-unavailable";
    case 504: return isProviderEndpoint(endpoint) ? "provider-timeout" : "timeout";
    default: return status >= 500 ? "server-error" : "unknown";
  }
}
