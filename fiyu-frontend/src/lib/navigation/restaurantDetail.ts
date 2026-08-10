const PICKS_RETURN_STATE_KEY = "fiyu.picks-detail-return.v1";

export interface PicksReturnState {
  placeId: string;
  scrollTop: number;
  createdAt: number;
}

function isPicksReturnState(value: unknown): value is PicksReturnState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PicksReturnState>;
  return (
    typeof state.placeId === "string" &&
    state.placeId.length > 0 &&
    typeof state.scrollTop === "number" &&
    Number.isFinite(state.scrollTop) &&
    state.scrollTop >= 0 &&
    typeof state.createdAt === "number" &&
    Number.isFinite(state.createdAt)
  );
}

/** Session-only UI restoration state. Restaurant and Picks data stay elsewhere. */
export function savePicksReturnState(state: PicksReturnState): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PICKS_RETURN_STATE_KEY, JSON.stringify(state));
}

export function readPicksReturnState(): PicksReturnState | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(PICKS_RETURN_STATE_KEY) ?? "null");
    return isPicksReturnState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read detail-return UI state exactly once.
 *
 * A detail Back restores the selected card and list position, but a later trip
 * through another primary application route must not replay that old highlight.
 */
export function consumePicksReturnState(): PicksReturnState | null {
  if (typeof window === "undefined") return null;
  const state = readPicksReturnState();
  window.sessionStorage.removeItem(PICKS_RETURN_STATE_KEY);
  return state;
}

/** Prevent one account's selected card/scroll position restoring for another. */
export function clearPicksReturnState(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PICKS_RETURN_STATE_KEY);
}

export function restaurantDetailHref(placeId: string): string {
  return `/restaurants/${encodeURIComponent(placeId)}`;
}
