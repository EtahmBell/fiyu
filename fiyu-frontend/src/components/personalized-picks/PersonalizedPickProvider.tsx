"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { PersonalizedPickModal } from "@/components/personalized-picks/PersonalizedPickModal";
import {
  createPersonalizedPickEvent,
  dismissPersonalizedPickEvent,
  fetchPersonalizedPickState,
  selectPersonalizedPick,
} from "@/lib/api/client";
import type { MapRestaurant, PersonalizedPickState } from "@/lib/api/schemas";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

interface PersonalizedPickContextValue {
  state: PersonalizedPickState | null;
  refresh(): Promise<void>;
}

const PersonalizedPickContext = createContext<PersonalizedPickContextValue>({
  state: null,
  refresh: async () => undefined,
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

export function PersonalizedPickProvider({ children }: { children: React.ReactNode }) {
  const identity = useProfileIdentity();
  const accountId = identity.profile?.user_id ?? null;
  const [state, setState] = useState<PersonalizedPickState | null>(null);
  const [loadedForAccount, setLoadedForAccount] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<number | null>(null);
  const ensuredForAccount = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accountId) {
      return;
    }
    let next = await fetchPersonalizedPickState();
    if (
      next.status === "unlocked_idle" &&
      next.event_eligible &&
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

  const visibleState = loadedForAccount === accountId ? state : null;

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
    const next = await dismissPersonalizedPickEvent(visibleState.event_id);
    setState(next);
    setOpen(false);
  }, [visibleState]);

  const select = useCallback(async (position: number) => {
    if (!visibleState?.event_id || visibleState.status !== "event_available" || pendingPosition !== null) return;
    setPendingPosition(position);
    try {
      const next = await selectPersonalizedPick(visibleState.event_id, position);
      setState(next);
      setShowReveal(next.status === "selected");
    } finally {
      setPendingPosition(null);
    }
  }, [pendingPosition, visibleState]);

  const value = useMemo(() => ({ state: visibleState, refresh }), [refresh, visibleState]);
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
