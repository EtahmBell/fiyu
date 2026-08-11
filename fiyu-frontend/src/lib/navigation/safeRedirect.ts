const FIYU_INTERNAL_ORIGIN = "https://internal.fiyu";

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
  return safeInternalPath(new URLSearchParams(window.location.search).get("next"), fallback);
}
