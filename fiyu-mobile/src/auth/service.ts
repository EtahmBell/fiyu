import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createFetchTransport, FiyuApiError, paths } from "@fiyu/contracts";

import { getApiBaseUrl } from "@/config/env";
import { getSupabaseClient, isSupabaseConfigured } from "@/auth/supabase";

const signInResponseSchema = z.object({
  user_id: z.string().min(1),
  session: z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) }),
});

const signUpResponseSchema = z.object({
  email: z.string().email(),
  email_verification_required: z.boolean(),
  session: z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) }).nullable(),
});

export interface AuthSession {
  userId: string;
  email: string;
  accessToken: string;
}

export interface SignUpResult {
  email: string;
  emailVerificationRequired: boolean;
}

export interface AuthService {
  isConfigured(): boolean;
  getSession(): Promise<AuthSession | null>;
  signIn(input: { identifier: string; password: string }): Promise<AuthSession>;
  signUp(input: { email: string; password: string; username: string }): Promise<SignUpResult>;
  signOut(): Promise<void>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
}

function authSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    accessToken: session.access_token,
  };
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof FiyuApiError) {
    if (error.kind === "unauthorized") return "Email, username, or password was not accepted.";
    if (error.kind === "rate-limited") return "Too many attempts. Please wait and try again.";
    if (error.kind === "invalid-request" && error.detail) return error.detail;
    if (error.isRetryable) return "Fiyu could not connect right now. Please try again.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Account access is unavailable right now.";
}

export function createAuthService(
  getClient: () => SupabaseClient = getSupabaseClient,
): AuthService {
  const transport = createFetchTransport({ baseUrl: getApiBaseUrl() });
  return {
    isConfigured: isSupabaseConfigured,
    async getSession() {
      if (!this.isConfigured()) return null;
      const { data, error } = await getClient().auth.getSession();
      if (error) throw error;
      return authSession(data.session);
    },
    async signIn(input) {
      if (!this.isConfigured()) throw new Error("Account access is not configured.");
      const payload = await transport.requestJson(paths.authSignIn, signInResponseSchema, {
        method: "POST",
        body: input,
      });
      const { data, error } = await getClient().auth.setSession(payload.session);
      if (error || !data.session) throw error ?? new Error("Account session could not be restored.");
      return authSession(data.session) as AuthSession;
    },
    async signUp(input) {
      if (!this.isConfigured()) throw new Error("Account access is not configured.");
      const payload = await transport.requestJson(paths.authSignUp, signUpResponseSchema, {
        method: "POST",
        body: input,
      });
      if (payload.session) {
        const { error } = await getClient().auth.setSession(payload.session);
        if (error) throw error;
      }
      return {
        email: payload.email,
        emailVerificationRequired: payload.email_verification_required,
      };
    },
    async signOut() {
      if (!this.isConfigured()) return;
      const { error } = await getClient().auth.signOut();
      if (error) throw error;
    },
    subscribe(listener) {
      if (!this.isConfigured()) return () => undefined;
      const { data } = getClient().auth.onAuthStateChange((_event, session) => listener(authSession(session)));
      return () => data.subscription.unsubscribe();
    },
    startAutoRefresh() {
      if (this.isConfigured()) getClient().auth.startAutoRefresh();
    },
    stopAutoRefresh() {
      if (this.isConfigured()) getClient().auth.stopAutoRefresh();
    },
  };
}

export const authService = createAuthService();
