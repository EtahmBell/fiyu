export type ClientLogEvent =
  | "auth.signup.failed"
  | "auth.signin.failed"
  | "auth.callback.failed"
  | "auth.session.failed"
  | "api.request.network_error"
  | "api.request.timeout"
  | "health.api.failed"
  | "health.supabase.failed";

interface SafeClientLogFields {
  operation?: string;
  errorCode?: string;
  status?: number;
  route?: string;
  durationBucket?: "under_1s" | "1_to_5s" | "5_to_15s" | "over_15s";
}

/** Deliberately accepts only allow-listed metadata: never payloads, credentials, tokens, or user data. */
export function logClientEvent(event: ClientLogEvent, fields: SafeClientLogFields = {}): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "test") return;
  const record = {
    event,
    timestamp: new Date().toISOString(),
    hostname: window.location.hostname,
    onlineHint: typeof navigator === "undefined" ? undefined : navigator.onLine,
    ...fields,
  };
  if (process.env.NODE_ENV === "development") console.warn("[fiyu]", record);
  else console.error("[fiyu]", record);
}
