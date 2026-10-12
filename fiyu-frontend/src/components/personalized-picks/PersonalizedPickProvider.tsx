"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { PersonalizedPickModal } from "@/components/personalized-picks/PersonalizedPickModal";
import {
  createPersonalizedPickEvent,
  dismissPersonalizedPickEvent,
  fetchPersonalizedPickState,
  selectPersonalizedPick,
} from "@/lib/api/client";
import type { MapRestaurant, PersonalizedPickState, PublicRestaurant } from "@/lib/api/schemas";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

export type PersonalizedPickPreviewMode =
  | "locked_zero"
  | "locked_nine"
  | "unlocked"
  | "event_available"
  | "selected"
  | "expired";

interface PersonalizedPickContextValue {
  state: PersonalizedPickState | null;
  previewMode: PersonalizedPickPreviewMode | null;
  refresh(options?: { ensureEvent?: boolean }): Promise<void>;
  setDeveloperPreview(
    mode: PersonalizedPickPreviewMode | null,
    restaurant?: PublicRestaurant | null,
  ): void;
}

const PersonalizedPickContext = createContext<PersonalizedPickContextValue>({
  state: null,
  previewMode: null,
  refresh: async () => undefined,
  setDeveloperPreview: () => undefined,
});

export function usePersonalizedPick() {
  return useContext(PersonalizedPickContext);
}

export function activePersonalizedMapRestaurant(
  state: PersonalizedPickState | null,
): MapRestaurant | null {
  if (state?.status !== "selected" || !state.selected_restaurant) return null;
  return {
    ...state.selected_restaurant,
    is_discovered: true,
    discovery_expires_at: state.active_until,
    is_saved: false,
    is_visited: false,
    user_rating: null,
    is_personalized_pick: true,
  };
}

function mayPresent(state: PersonalizedPickState): boolean {
  if (state.status !== "event_available") return false;
  const dismissedUntil = Date.parse(state.dismissed_until ?? "");
  return !Number.isFinite(dismissedUntil) || dismissedUntil <= Date.now();
}

function previewState(
  mode: PersonalizedPickPreviewMode,
  restaurant: PublicRestaurant | null,
): PersonalizedPickState {
  const now = new Date();
  const future = new Date(now.getTime() + 72 * 60 * 60 * 1_000).toISOString();
  const base: PersonalizedPickState = {
    status: "unlocked_idle",
    qualifying_rating_count: 10,
    unlock_threshold: 10,
    event_eligible: true,
    event_id: null,
    card_count: null,
    created_at: null,
    expires_at: null,
    dismissed_until: null,
    dismissal_count: 0,
    selected_position: null,
    selected_at: null,
    active_until: null,
    selected_restaurant: null,
  };
  if (mode === "locked_zero" || mode === "locked_nine") {
    return {
      ...base,
      status: "locked",
      qualifying_rating_count: mode === "locked_zero" ? 0 : 9,
      event_eligible: false,
    };
  }
  if (mode === "unlocked") return base;
  if (mode === "event_available") {
    return {
      ...base,
      status: "event_available",
      event_id: "developer-preview-event",
      card_count: 3,
      created_at: now.toISOString(),
      expires_at: future,
    };
  }
  if (mode === "selected" && restaurant) {
    return {
      ...base,
      status: "selected",
      event_id: "developer-preview-event",
      created_at: now.toISOString(),
      expires_at: future,
      selected_position: 0,
      selected_at: now.toISOString(),
      active_until: future,
      selected_restaurant: restaurant,
    };
  }
  return {
    ...base,
    status: "expired",
    event_id: "developer-preview-event",
    created_at: now.toISOString(),
    expires_at: now.toISOString(),
  };
}

export function PersonalizedPickProvider({ children }: { children: React.ReactNode }) {
  const identity = useProfileIdentity();
  const accountId = identity.profile?.user_id ?? null;
  const [state, setState] = useState<PersonalizedPickState | null>(null);
  const [loadedForAccount, setLoadedForAccount] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    accountId: string;
    mode: PersonalizedPickPreviewMode;
    restaurant: PublicRestaurant | null;
  } | null>(null);
  const ensuredForAccount = useRef<string | null>(null);

  const refresh = useCallback(async (options: { ensureEvent?: boolean } = {}) => {
    if (!accountId) {
      return;
    }
    let next = await fetchPersonalizedPickState();
    if (
      next.status === "unlocked_idle" &&
      next.event_eligible &&
      options.ensureEvent !== false &&
      ensuredForAccount.current !== accountId
    ) {
      ensuredForAccount.current = accountId;
      next = await createPersonalizedPickEvent();
    }
    setState(next);
    setLoadedForAccount(accountId);
    setShowReveal(false);
    setOpen(mayPresent(next));
  }, [accountId]);

  useEffect(() => {
    ensuredForAccount.current = null;
    if (!accountId) return;
    void refresh().catch(() => {
      setState(null);
      setOpen(false);
    });
  }, [accountId, refresh]);

  const liveState = loadedForAccount === accountId ? state : null;
  const activePreview = preview?.accountId === accountId ? preview : null;
  const visibleState = activePreview
    ? previewState(activePreview.mode, activePreview.restaurant)
    : liveState;

  useEffect(() => {
    if (visibleState?.status !== "selected" || !visibleState.active_until) return;
    const delay = Math.max(Date.parse(visibleState.active_until) - Date.now(), 0);
    const timer = window.setTimeout(
      () => { void refresh().catch(() => undefined); },
      Math.min(delay + 25, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [refresh, visibleState]);

  const dismiss = useCallback(async () => {
    if (!visibleState?.event_id || visibleState.status !== "event_available") return;
    if (activePreview) {
      setOpen(false);
      return;
    }
    const next = await dismissPersonalizedPickEvent(visibleState.event_id);
    setState(next);
    setOpen(false);
  }, [activePreview, visibleState]);

  const select = useCallback(async (position: number) => {
    if (!visibleState?.event_id || visibleState.status !== "event_available" || pendingPosition !== null) return;
    if (activePreview) {
      if (!activePreview.restaurant) return;
      setPreview({
        accountId: activePreview.accountId,
        mode: "selected",
        restaurant: activePreview.restaurant,
      });
      setShowReveal(true);
      return;
    }
    setPendingPosition(position);
    try {
      const next = await selectPersonalizedPick(visibleState.event_id, position);
      setState(next);
      setShowReveal(next.status === "selected");
    } finally {
      setPendingPosition(null);
    }
  }, [activePreview, pendingPosition, visibleState]);

  const setDeveloperPreview = useCallback((
    mode: PersonalizedPickPreviewMode | null,
    restaurant: PublicRestaurant | null = null,
  ) => {
    setPreview(mode && accountId ? { accountId, mode, restaurant } : null);
    setShowReveal(false);
    setOpen(mode === "event_available" || (!mode && liveState ? mayPresent(liveState) : false));
  }, [accountId, liveState]);

  const value = useMemo(() => ({
    state: visibleState,
    previewMode: activePreview?.mode ?? null,
    refresh,
    setDeveloperPreview,
  }), [activePreview?.mode, refresh, setDeveloperPreview, visibleState]);
  return (
    <PersonalizedPickContext.Provider value={value}>
      {children}
      {open && visibleState ? (
        <PersonalizedPickModal
          state={visibleState}
          reveal={showReveal}
          pendingPosition={pendingPosition}
          onDismiss={() => { void dismiss(); }}
          onSelect={(position) => { void select(position); }}
          onCloseReveal={() => setOpen(false)}
        />
      ) : null}
    </PersonalizedPickContext.Provider>
  );
}
