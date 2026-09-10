const FIYU_INTERNAL_ORIGIN = "https://internal.fiyu";
const AUTH_RETURN_KEY = "fiyu:auth-return";
const AUTH_RETURN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function safeInternalPath(value: string | null | undefined, fallback = "/picks"): string {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  try {
    const parsed = new URL(candidate, FIYU_INTERNAL_ORIGIN);
    if (parsed.origin !== FIYU_INTERNAL_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function currentSafeNextPath(fallback = "/picks"): string {
  if (typeof window === "undefined") return fallback;
  const requested = new URLSearchParams(window.location.search).get("next");
  if (requested) return safeInternalPath(requested, fallback);
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUTH_RETURN_KEY) ?? "null") as { path?: unknown; createdAt?: unknown } | null;
    if (stored && typeof stored.path === "string" && typeof stored.createdAt === "number" && Date.now() - stored.createdAt <= AUTH_RETURN_MAX_AGE_MS) {
      return safeInternalPath(stored.path, fallback);
    }
  } catch {
    window.localStorage.removeItem(AUTH_RETURN_KEY);
  }
  return fallback;
}

export function rememberAuthReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_RETURN_KEY, JSON.stringify({ path: safeInternalPath(path), createdAt: Date.now() }));
}

export function pendingAuthReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUTH_RETURN_KEY) ?? "null") as { path?: unknown; createdAt?: unknown } | null;
    if (!stored || typeof stored.path !== "string" || typeof stored.createdAt !== "number" || Date.now() - stored.createdAt > AUTH_RETURN_MAX_AGE_MS) return null;
    return safeInternalPath(stored.path, "") || null;
  } catch {
    return null;
  }
}

export function clearAuthReturnPath(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(AUTH_RETURN_KEY);
}
