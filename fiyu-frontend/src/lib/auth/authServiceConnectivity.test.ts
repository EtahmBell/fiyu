// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ setSession: vi.fn(), getSession: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { setSession: sdk.setSession, getSession: sdk.getSession } }),
}));

import { authService } from "@/lib/auth/authService";

const signupInput = { email: "person@example.com", username: "person", password: "private-password" };
const signinInput = { identifier: "@person", password: "private-password" };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
  sdk.setSession.mockResolvedValue({
    data: { session: { access_token: "private-access" }, user: { email: "person@example.com" } },
    error: null,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("authService transport failures", () => {
  it("successfully handles verification-required signup without creating a local session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      email: "person@example.com", email_verification_required: true, session: null,
    }), { status: 201 }));
    await expect(authService.signUp(signupInput)).resolves.toEqual({
      email: "person@example.com", emailVerificationRequired: true,
    });
    expect(sdk.setSession).not.toHaveBeenCalled();
  });

  it("does not turn username lookup transport failure into wrong credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("private transport detail"));
    await expect(authService.signIn(signinInput)).rejects.toMatchObject({ code: "network_unreachable" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves the distinction when auth succeeds but session setup fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      email: "person@example.com", email_verification_required: false,
      session: { access_token: "private-access", refresh_token: "private-refresh" },
    }), { status: 201 }));
    sdk.setSession.mockResolvedValueOnce({ error: { status: 503, code: "service_unavailable" } });
    await expect(authService.signUp(signupInput)).rejects.toMatchObject({ code: "account_setup_incomplete" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies signup deadline and never submits a second request automatically", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      queueMicrotask(() => controller.abort(new DOMException("deadline", "TimeoutError")));
      return controller.signal;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((_, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason));
    }));
    await expect(authService.signUp(signupInput)).rejects.toMatchObject({ code: "request_timeout" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("ends a stalled session-restore UI wait without aborting SDK hydration", async () => {
    sdk.getSession.mockImplementation(() => new Promise(() => undefined));
    vi.useFakeTimers();
    const lookup = expect(authService.getSession()).rejects.toMatchObject({ code: "request_timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await lookup;
    expect(sdk.getSession).toHaveBeenCalledTimes(1);
  });
});
