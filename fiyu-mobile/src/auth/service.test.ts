import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthService } from "@/auth/service";

jest.mock("@/config/env", () => ({ getApiBaseUrl: () => "https://api.fiyu.test" }));
jest.mock("@/auth/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: jest.fn(),
}));

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockClient(options: { passwordError?: Error } = {}) {
  const auth = {
    getSession: jest.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: "user-1", email: "person@example.com" },
          access_token: "existing-token",
        },
      },
      error: null,
    }),
    signInWithPassword: jest.fn().mockResolvedValue(
      options.passwordError
        ? { data: { session: null }, error: options.passwordError }
        : {
            data: {
              session: {
                user: { id: "user-1", email: "person@example.com" },
                access_token: "verified-token",
              },
            },
            error: null,
          },
    ),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  };
  return { client: { auth } as unknown as SupabaseClient, auth };
}

describe("native account deletion", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("reauthenticates, deletes through the canonical backend, then clears the local session", async () => {
    const { client, auth } = mockClient();
    globalThis.fetch = jest.fn(async () => response({ deleted: true })) as typeof fetch;

    await createAuthService(() => client).deleteAccount("correct-password");

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "correct-password",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.fiyu.test/profiles/me/account",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ Authorization: "Bearer verified-token" }),
      }),
    );
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not call the deletion endpoint when password reauthentication fails", async () => {
    const { client, auth } = mockClient({ passwordError: new Error("bad password") });
    globalThis.fetch = jest.fn() as typeof fetch;

    await expect(createAuthService(() => client).deleteAccount("wrong-password")).rejects.toThrow(
      "Current password is incorrect.",
    );

    expect(auth.signInWithPassword).toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
