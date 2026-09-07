/** Your Fiyu: the one reliable destination for a Profile subpage's Back. */
export const PROFILE_HOME = "/profile";

/**
 * Back navigation for the Profile subpages.
 *
 * `/profile` is always where Back lands, so the control can be a real link and
 * its label is always honest. History is popped instead of pushed *only* when
 * popping provably lands there, because that restores the reader's scroll
 * position on a page that runs a couple of screens long.
 *
 * The proof is cheap. If the document was opened on Your Fiyu, and the subpage
 * asking is the first Profile subpage this document rendered, then the entry
 * behind the current one is Your Fiyu itself. Everything else -- a deep link, a
 * refresh, an arrival from elsewhere in the app, a second subpage in the same
 * session -- falls back to pushing `/profile`, which is never the wrong place to
 * land, only a less delightful way to get there.
 *
 * Recorded per document rather than per mount, and idempotent, so a remount
 * (React's development double-invoke, a route the reader returns to) cannot
 * turn a correct answer into a wrong one.
 */
let firstSubpagePath: string | null = null;

export function noteProfileSubpage(pathname: string): void {
  firstSubpagePath ??= pathname;
}

/** Module state outlives a render tree, so tests need a way to clear it. */
export function resetProfileSubpageHistory(): void {
  firstSubpagePath = null;
}

/**
 * The path this document was requested with.
 *
 * `pushState` never changes it, which is the whole point: it identifies the
 * history entry the client-side router started from.
 */
function documentEntryPath(): string | null {
  if (typeof window === "undefined") return null;
  if (typeof window.performance?.getEntriesByType !== "function") return null;
  const [entry] = window.performance.getEntriesByType("navigation");
  if (!entry) return null;
  try {
    return new URL(entry.name, window.location.origin).pathname;
  } catch {
    return null;
  }
}

export function canPopToProfileHome(pathname: string): boolean {
  return documentEntryPath() === PROFILE_HOME && firstSubpagePath === pathname;
}
