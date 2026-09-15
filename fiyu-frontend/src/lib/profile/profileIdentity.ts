"use client";

import { useEffect, useSyncExternalStore } from "react";

import { authService, type FiyuAccountProfile } from "@/lib/auth/authService";
import { logClientEvent } from "@/lib/clientLog";
import { browserProfileStorage } from "@/lib/profile/profileStorage";

export interface ProfileIdentitySnapshot {
  status: "loading" | "ready" | "unavailable";
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
let accountChangeSubscribed = false;
const listeners = new Set<() => void>();

function emit(next: ProfileIdentitySnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function ensureImageSubscription() {
  if (typeof window === "undefined") return;
  if (!storageUnsubscribe) {
    const storage = browserProfileStorage();
    storageUnsubscribe = storage.subscribe(() => {
      const profileImage = storage.getSnapshot().profile_image;
      if (
        snapshot.profile === null &&
        snapshot.email === null &&
        profileImage !== snapshot.profileImage
      ) {
        emit({ ...snapshot, profileImage });
      }
    });
  }
  if (!accountChangeSubscribed) {
    accountChangeSubscribed = true;
    window.addEventListener("fiyu:account-changed", () => {
      emit({ ...snapshot, status: "loading" });
      const pending = loading ?? Promise.resolve();
      void pending.finally(() => refreshProfileIdentity(true));
    });
    const recover = () => {
      if (snapshot.status === "unavailable") void refreshProfileIdentity(true);
    };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
  }
}

export function refreshProfileIdentity(force = false): Promise<void> {
  ensureImageSubscription();
  if (loading) return loading;
  if (!force && snapshot.status === "ready") return Promise.resolve();
  const profileImage = browserProfileStorage().getSnapshot().profile_image;
  loading = (async () => {
    let authenticated = false;
    let authenticatedEmail: string | null = null;
    try {
      const session = await authService.getSession();
      if (!session) {
        emit({ status: "ready", profile: null, email: null, profileImage });
        return;
      }
      authenticated = true;
      authenticatedEmail = session.email || "";
      const profile = await authService.getProfile();
      emit({
        status: "ready",
        profile,
        email: authenticatedEmail,
        profileImage: profile?.avatar_url ?? null,
      });
    } catch {
      logClientEvent("auth.session.failed", { operation: authenticated ? "profile" : "session", errorCode: "unavailable" });
      if (snapshot.profile || snapshot.email) {
        emit({ ...snapshot, status: "ready" });
      } else {
        emit({ status: "unavailable", profile: null, email: authenticatedEmail, profileImage });
      }
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function publishProfileIdentity(
  profile: FiyuAccountProfile,
  profileImage: string | null = profile.avatar_url,
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
