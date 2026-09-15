import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import { AuthRequestError, authCodeForResponse, classifyAuthFailure } from "@/lib/auth/authErrors";
import { logClientEvent } from "@/lib/clientLog";
import { getApiBaseUrl } from "@/lib/config/env";
import { dailyPicksStorageKey } from "@/lib/daily-picks/storage";
import { clearPicksReturnState } from "@/lib/navigation/restaurantDetail";
import { PROFILE_STORAGE_KEY } from "@/lib/profile/profileStorage";

export interface AuthSession {
  userId: string;
  email: string;
  accessToken: string;
}

export interface FiyuAccountProfile {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  username: string;
}

export interface SignUpResult {
  email: string;
  emailVerificationRequired: boolean;
}

export interface SignInInput {
  identifier: string;
  password: string;
}

export class AuthConfigurationError extends Error {
  constructor() {
    super("Account access is not configured.");
    this.name = "AuthConfigurationError";
  }
}

class ProfileRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileRequestError";
  }
}

let browserClient: SupabaseClient | null = null;
const AVATAR_BUCKET = "avatars";
export const AUTH_REQUEST_TIMEOUT_MS = 12_000;
const SESSION_RESTORE_DEADLINE_MS = 20_000;

function avatarPath(userId: string): string {
  return `${userId}/avatar.webp`;
}

function announceAccountChange(): void {
  if (typeof window !== "undefined") {
    clearPicksReturnState();
    window.dispatchEvent(new Event("fiyu:account-changed"));
  }
}

export function clearDeletedAccountBrowserState(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(dailyPicksStorageKey(userId));
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  clearPicksReturnState();
}

function supabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new AuthConfigurationError();
  browserClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return browserClient;
}

async function responseDetail(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    return typeof payload.detail === "string" ? payload.detail : fallback;
  } catch {
    return fallback;
  }
}

async function authApiRequest(path: string, input: unknown, operation: "signin" | "signup"): Promise<Response> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new AuthRequestError(authCodeForResponse(response.status, payload, operation), {
        status: response.status,
      });
    }
    return response;
  } catch (cause) {
    const error = classifyAuthFailure(cause);
    logClientEvent(operation === "signup" ? "auth.signup.failed" : "auth.signin.failed", {
      operation,
      errorCode: error.code,
      status: error.status,
      route: path,
    });
    throw error;
  }
}

async function authApiPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // A successful HTTP status with invalid JSON is still a service failure.
  }
  throw new AuthRequestError("service_unavailable", { status: response.status });
}

async function sessionWithDeadline<T>(lookup: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AuthRequestError("request_timeout")), SESSION_RESTORE_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sessionFromUser(user: User | null, accessToken: string | null): Promise<AuthSession | null> {
  if (!user || !accessToken) return null;
  return { userId: user.id, email: user.email ?? "", accessToken };
}

export const authService = {
  isConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    );
  },

  async getSession(): Promise<AuthSession | null> {
    if (!this.isConfigured()) return null;
    // Only bound the UI wait; do not abort Supabase's underlying hydration or token refresh.
    const { data, error } = await sessionWithDeadline(supabaseClient().auth.getSession());
    if (error) throw classifyAuthFailure(error);
    return sessionFromUser(data.session?.user ?? null, data.session?.access_token ?? null);
  },

  async getCurrentUser(): Promise<User | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await supabaseClient().auth.getUser();
    if (error) throw classifyAuthFailure(error);
    return data.user;
  },

  async getAccessToken(): Promise<string | null> {
    return (await this.getSession())?.accessToken ?? null;
  },

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    if (!this.isConfigured()) throw new AuthConfigurationError();
    const response = await authApiRequest("/auth/signup", input, "signup");
    const payload = (await authApiPayload(response)) as unknown as {
      email: string;
      email_verification_required: boolean;
      session: { access_token: string; refresh_token: string } | null;
    };
    if (typeof payload.email !== "string" || typeof payload.email_verification_required !== "boolean") {
      throw new AuthRequestError("service_unavailable", { status: response.status });
    }
    if (payload.session) {
      if (!payload.session.access_token || !payload.session.refresh_token) {
        throw new AuthRequestError("account_setup_incomplete");
      }
      const { error } = await supabaseClient().auth.setSession({
        access_token: payload.session.access_token,
        refresh_token: payload.session.refresh_token,
      });
      if (error) throw new AuthRequestError("account_setup_incomplete");
      announceAccountChange();
    }
    return {
      email: payload.email,
      emailVerificationRequired: payload.email_verification_required,
    };
  },

  async signIn(input: SignInInput): Promise<AuthSession> {
    if (!this.isConfigured()) throw new AuthConfigurationError();
    const response = await authApiRequest("/auth/signin", input, "signin");
    const payload = (await authApiPayload(response)) as unknown as {
      user_id: string;
      session: { access_token: string; refresh_token: string };
    };
    if (typeof payload.user_id !== "string" || !payload.session?.access_token || !payload.session?.refresh_token) {
      throw new AuthRequestError("service_unavailable", { status: response.status });
    }
    const { data, error } = await supabaseClient().auth.setSession({
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token,
    });
    if (error) throw classifyAuthFailure(error);
    if (!data.session) throw new AuthRequestError("service_unavailable");
    announceAccountChange();
    return {
      userId: payload.user_id,
      email: data.user?.email ?? "",
      accessToken: data.session.access_token,
    };
  },

  async signOut(): Promise<void> {
    if (!this.isConfigured()) return;
    const { error } = await supabaseClient().auth.signOut();
    if (error) throw classifyAuthFailure(error);
    announceAccountChange();
  },

  async deleteAccount(password: string): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new ProfileRequestError("Sign in to delete your account.");
    if (!session.email) throw new ProfileRequestError("This account cannot be reauthenticated with a password.");
    const { data: reauthenticated, error: reauthenticationError } =
      await supabaseClient().auth.signInWithPassword({ email: session.email, password });
    if (reauthenticationError || !reauthenticated.session) {
      throw new ProfileRequestError("Current password is incorrect.");
    }
    const response = await fetch(`${getApiBaseUrl()}/profiles/me/account`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${reauthenticated.session.access_token}` },
    });
    if (!response.ok) {
      throw new ProfileRequestError(await responseDetail(response, "Unable to delete your account."));
    }
    const { error } = await supabaseClient().auth.signOut({ scope: "local" });
    clearDeletedAccountBrowserState(session.userId);
    announceAccountChange();
    if (error) {
      throw new ProfileRequestError("Your account was deleted, but this browser session could not be cleared.");
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    if (!this.isConfigured()) throw new AuthConfigurationError();
    const redirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/signin`;
    const { error } = await supabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw classifyAuthFailure(error);
  },

  onPasswordRecovery(callback: () => void): () => void {
    if (!this.isConfigured()) return () => undefined;
    const { data } = supabaseClient().auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") callback();
    });
    return () => data.subscription.unsubscribe();
  },

  async updatePassword(password: string): Promise<void> {
    if (!this.isConfigured()) throw new AuthConfigurationError();
    const { error } = await supabaseClient().auth.updateUser({ password });
    if (error) throw classifyAuthFailure(error);
  },

  async getProfile(): Promise<FiyuAccountProfile | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    let response: Response;
    try {
      response = await fetch(`${getApiBaseUrl()}/profiles/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      throw classifyAuthFailure(cause);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new ProfileRequestError("Unable to load your profile.");
    return (await response.json()) as FiyuAccountProfile;
  },

  async updateProfile(input: {
    username: string;
    display_name: string | null;
    bio: string | null;
  }): Promise<FiyuAccountProfile> {
    const token = await this.getAccessToken();
    if (!token) throw new ProfileRequestError("Sign in to update your profile.");
    const response = await fetch(`${getApiBaseUrl()}/profiles/me`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new ProfileRequestError(await responseDetail(response, "Unable to save your profile."));
    }
    return (await response.json()) as FiyuAccountProfile;
  },

  async updateProfileAvatar(avatarUrl: string | null): Promise<FiyuAccountProfile> {
    const token = await this.getAccessToken();
    if (!token) throw new ProfileRequestError("Sign in to update your profile photo.");
    const response = await fetch(`${getApiBaseUrl()}/profiles/me/avatar`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });
    if (!response.ok) {
      throw new ProfileRequestError(await responseDetail(response, "Unable to update your profile photo."));
    }
    return (await response.json()) as FiyuAccountProfile;
  },

  async uploadProfileAvatar(image: Blob): Promise<FiyuAccountProfile> {
    const session = await this.getSession();
    if (!session) throw new ProfileRequestError("Sign in to update your profile photo.");
    const path = avatarPath(session.userId);
    const { error } = await supabaseClient().storage.from(AVATAR_BUCKET).upload(path, image, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: true,
    });
    if (error) throw new ProfileRequestError("Unable to upload your profile photo.");
    const { data } = supabaseClient().storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const versionedUrl = `${data.publicUrl}?v=${Date.now()}`;
    return this.updateProfileAvatar(versionedUrl);
  },

  async removeProfileAvatar(previousAvatarUrl: string | null): Promise<FiyuAccountProfile> {
    const session = await this.getSession();
    if (!session) throw new ProfileRequestError("Sign in to remove your profile photo.");
    const updated = await this.updateProfileAvatar(null);
    const { error } = await supabaseClient().storage
      .from(AVATAR_BUCKET)
      .remove([avatarPath(session.userId)]);
    if (error) {
      if (previousAvatarUrl) await this.updateProfileAvatar(previousAvatarUrl);
      throw new ProfileRequestError("Unable to remove your profile photo.");
    }
    return updated;
  },
};
