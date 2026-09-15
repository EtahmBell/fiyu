export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "signup_disabled"
  | "rate_limited"
  | "network_unreachable"
  | "request_timeout"
  | "service_unavailable"
  | "account_setup_incomplete"
  | "bad_request"
  | "unknown_auth_error";

export const AUTH_ERROR_COPY: Record<AuthErrorCode, string> = {
  invalid_credentials: "Email/username or password is incorrect.",
  email_not_confirmed: "Check your email to verify your account before signing in.",
  user_already_exists: "An account already exists for this email. Try signing in instead.",
  signup_disabled: "Account creation is temporarily unavailable. Try again shortly.",
  rate_limited: "Too many attempts. Try again in a little while.",
  network_unreachable: "We couldn’t connect to Fiyu. Check your connection and try again.",
  request_timeout: "This is taking longer than expected. Try again.",
  service_unavailable: "Account services are temporarily unavailable. Try again shortly.",
  account_setup_incomplete: "Your account was created, but setup isn’t complete. Try signing in to finish.",
  bad_request: "Check the details you entered and try again.",
  unknown_auth_error: "Account access is unavailable. Try again.",
};

export class AuthRequestError extends Error {
  readonly code: AuthErrorCode;
  readonly status?: number;

  constructor(code: AuthErrorCode, options: { status?: number; cause?: unknown } = {}) {
    super(AUTH_ERROR_COPY[code]);
    this.name = "AuthRequestError";
    this.code = code;
    this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  get isTransient(): boolean {
    return ["network_unreachable", "request_timeout", "service_unavailable"].includes(this.code);
  }
}

function detailText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const detail = (payload as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail.toLowerCase() : "";
}

export function authCodeForResponse(status: number, payload: unknown, operation: "signin" | "signup"): AuthErrorCode {
  const detail = detailText(payload);
  if (operation === "signup" && detail.includes("account was created")) return "account_setup_incomplete";
  if (status === 429) return "rate_limited";
  if (status === 502 || status === 503) return "service_unavailable";
  if (status === 504) return "request_timeout";
  if (operation === "signin" && status === 401) return "invalid_credentials";
  if (operation === "signin" && status === 403 && (detail.includes("verify") || detail.includes("confirm"))) return "email_not_confirmed";
  if (operation === "signup" && status === 409 && detail.includes("account")) return "user_already_exists";
  if (operation === "signup" && status === 403) return "signup_disabled";
  if (status === 400 || status === 409 || status === 422) return "bad_request";
  return "unknown_auth_error";
}

export function classifyAuthFailure(cause: unknown): AuthRequestError {
  if (cause instanceof AuthRequestError) return cause;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new AuthRequestError("network_unreachable", { cause });
  }
  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return new AuthRequestError("request_timeout", { cause });
  }
  if (cause instanceof TypeError) return new AuthRequestError("network_unreachable", { cause });
  if (cause && typeof cause === "object") {
    const error = cause as { code?: unknown; status?: unknown };
    const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
    const status = typeof error.status === "number" ? error.status : undefined;
    if (code.includes("email_not_confirmed")) return new AuthRequestError("email_not_confirmed", { status, cause });
    if (code.includes("invalid_credentials")) return new AuthRequestError("invalid_credentials", { status, cause });
    if (code.includes("user_already_exists")) return new AuthRequestError("user_already_exists", { status, cause });
    if (code.includes("signup_disabled")) return new AuthRequestError("signup_disabled", { status, cause });
    if (code.includes("rate") || status === 429) return new AuthRequestError("rate_limited", { status, cause });
    if (status && status >= 500) return new AuthRequestError("service_unavailable", { status, cause });
  }
  return new AuthRequestError("unknown_auth_error", { cause });
}
