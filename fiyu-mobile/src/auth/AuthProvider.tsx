import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";

import {
  authService,
  type AuthService,
  type AuthSession,
  type SignUpResult,
} from "@/auth/service";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  signIn(input: { identifier: string; password: string }): Promise<void>;
  signUp(input: { email: string; password: string; username: string }): Promise<SignUpResult>;
  signOut(): Promise<void>;
  deleteAccount(password: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  service = authService,
}: PropsWithChildren<{ service?: AuthService }>) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let active = true;
    service.getSession()
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setStatus(nextSession ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setStatus("unauthenticated");
      });
    const unsubscribe = service.subscribe((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");
    });
    const appState = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") service.startAutoRefresh();
      else service.stopAutoRefresh();
    });
    service.startAutoRefresh();
    return () => {
      active = false;
      service.stopAutoRefresh();
      unsubscribe();
      appState.remove();
    };
  }, [service]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    async signIn(input) {
      const nextSession = await service.signIn(input);
      setSession(nextSession);
      setStatus("authenticated");
    },
    async signUp(input) {
      const result = await service.signUp(input);
      const nextSession = await service.getSession();
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");
      return result;
    },
    async signOut() {
      await service.signOut();
      setSession(null);
      setStatus("unauthenticated");
    },
    async deleteAccount(password) {
      await service.deleteAccount(password);
      setSession(null);
      setStatus("unauthenticated");
    },
  }), [service, session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

export function protectedRouteGroups(status: AuthStatus): {
  auth: boolean;
  application: boolean;
} {
  return { auth: status === "unauthenticated", application: status === "authenticated" };
}
