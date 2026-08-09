"use client";

import { useEffect, useSyncExternalStore } from "react";

import { authService, type FiyuAccountProfile } from "@/lib/auth/authService";
import { browserProfileStorage } from "@/lib/profile/profileStorage";

export interface ProfileIdentitySnapshot {
  status: "loading" | "ready";
  profile: FiyuAccountProfile | null;
  email: string | null;
  profileImage: string | null;
}

const SERVER_SNAPSHOT: ProfileIdentitySnapshot = {
  status: "loading",
  profile: null,
  email: null,
  profileImage: null,
};

let snapshot = SERVER_SNAPSHOT;
let loading: Promise<void> | null = null;
let storageUnsubscribe: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(next: ProfileIdentitySnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function ensureImageSubscription() {
  if (storageUnsubscribe || typeof window === "undefined") return;
  const storage = browserProfileStorage();
  storageUnsubscribe = storage.subscribe(() => {
    const profileImage = storage.getSnapshot().profile_image;
    if (profileImage !== snapshot.profileImage) emit({ ...snapshot, profileImage });
  });
}

export function refreshProfileIdentity(force = false): Promise<void> {
  ensureImageSubscription();
  if (loading) return loading;
  if (!force && snapshot.status === "ready") return Promise.resolve();
  const profileImage = browserProfileStorage().getSnapshot().profile_image;
  loading = (async () => {
    try {
      const session = await authService.getSession();
      if (!session) {
        emit({ status: "ready", profile: null, email: null, profileImage });
        return;
      }
      const profile = await authService.getProfile();
      emit({ status: "ready", profile, email: session.email || null, profileImage });
    } catch {
      emit({ status: "ready", profile: null, email: null, profileImage });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function publishProfileIdentity(
  profile: FiyuAccountProfile,
  profileImage: string | null = snapshot.profileImage,
) {
  emit({ ...snapshot, status: "ready", profile, profileImage });
}

export function clearProfileIdentity() {
  emit({ status: "ready", profile: null, email: null, profileImage: null });
}

export function useProfileIdentity(): ProfileIdentitySnapshot {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
  useEffect(() => {
    void refreshProfileIdentity();
  }, []);
  return current;
}
