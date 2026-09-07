/** The two parents in the Profile tree. Edit profile and Settings hang off Your
 * Fiyu; the deeper settings screens hang off Settings. */
export const PROFILE_HOME = "/profile";
export const PROFILE_SETTINGS = "/profile/settings";

/**
 * Back navigation for the Profile subpages.
 *
 * A subpage's parent is always where Back lands, so the control can be a real
 * link and its label is always honest. History is popped instead of pushed
 * *only* when popping provably lands on that parent, because that restores the
 * reader's scroll position.
 *
 * The proof is cheap. If the document was opened on the parent, and the subpage
 * asking is the first Profile subpage this document rendered, then the entry
 * behind the current one is the parent itself. Everything else -- a deep link, a
 * refresh, an arrival from elsewhere in the app, a second subpage in the same
 * session -- falls back to pushing the parent, which is never the wrong place to
 * land, only a less delightful way to get there.
 *
 * That predicate is deliberately left as it was when there was one parent. For a
 * child of Settings it can effectively only answer false, because reaching such
 * a child means Settings was already the first subpage this document rendered --
 * so those screens always push. That is the right trade rather than a gap:
 * Settings is one screen tall, so restoring its scroll position is worth
 * nothing, while Your Fiyu runs several screens and is where the pop pays.
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

export function canPopToProfileParent(pathname: string, parent: string): boolean {
  return documentEntryPath() === parent && firstSubpagePath === pathname;
}
