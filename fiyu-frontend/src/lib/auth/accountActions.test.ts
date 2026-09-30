// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: sdk }) }));
import { authService, DeletedAccountSessionError } from "@/lib/auth/authService";
import { dailyPicksStorageKey } from "@/lib/daily-picks/storage";
import { PROFILE_STORAGE_KEY } from "@/lib/profile/profileStorage";
import { readAccountQuery, writeAccountQuery } from "@/lib/accountQueryCache";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://qa.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-qa-key");
  sdk.getSession.mockResolvedValue({ data: { session: { user: { id: "qa-a", email: "qa@example.com" }, access_token: "qa-token" } }, error: null });
  sdk.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "fresh-qa-token" } }, error: null });
  sdk.signOut.mockResolvedValue({ error: null });
  localStorage.setItem(PROFILE_STORAGE_KEY, "private profile");
  localStorage.setItem(dailyPicksStorageKey("qa-a"), "private picks");
  localStorage.setItem(dailyPicksStorageKey("qa-b"), "other account picks");
  localStorage.setItem("public-catalog", "public data");
  writeAccountQuery("map-restaurants:qa-a", ["private map state"]);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); localStorage.clear(); });

describe("canonical account actions", () => {
  it("clears personal browser and in-memory state only after canonical logout succeeds", async () => {
    sdk.signOut.mockResolvedValueOnce({ error: { status: 503 } });
    await expect(authService.signOut()).rejects.toMatchObject({ code: "service_unavailable" });
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe("private profile");
    expect(readAccountQuery("map-restaurants:qa-a")).toEqual(["private map state"]);
    await authService.signOut();
    expect(sdk.signOut).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(dailyPicksStorageKey("qa-a"))).toBeNull();
    expect(readAccountQuery("map-restaurants:qa-a")).toBeUndefined();
    expect(localStorage.getItem(dailyPicksStorageKey("qa-b"))).toBe("other account picks");
    expect(localStorage.getItem("public-catalog")).toBe("public data");
  });

  it("classifies thrown logout transport errors and allows retry", async () => {
    sdk.signOut.mockRejectedValueOnce(new TypeError("network failed"));
    await expect(authService.signOut()).rejects.toMatchObject({ code: "network_unreachable" });
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe("private profile");
    await expect(authService.signOut()).resolves.toBeUndefined();
  });

  it("reauthenticates, sends no caller-controlled identity, and clears the local session after server success", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"deleted":true}'));
    await authService.deleteAccount("qa-password");
    expect(sdk.signInWithPassword).toHaveBeenCalledWith({ email: "qa@example.com", password: "qa-password" });
    expect(request.mock.calls[0][0]).toMatch(/\/profiles\/me\/account$/);
    expect(request.mock.calls[0][1]).toMatchObject({ method: "DELETE", headers: { Authorization: "Bearer fresh-qa-token" } });
    expect(request.mock.calls[0][1]?.body).toBeUndefined();
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it("never signs out or reports completion on partial server failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"detail":"Account could not be deleted"}', { status: 503 }));
    await expect(authService.deleteAccount("qa-password")).rejects.toThrow("Account could not be deleted");
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe("private profile");
  });

  it("distinguishes reauthentication outages from incorrect passwords", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    sdk.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 503 } });
    await expect(authService.deleteAccount("qa-password")).rejects.toMatchObject({ code: "service_unavailable" });
    sdk.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: "invalid_credentials" } });
    await expect(authService.deleteAccount("wrong-password")).rejects.toThrow("Current password is incorrect.");
    expect(request).not.toHaveBeenCalled();
  });

  it("clears sensitive caches and retries only local auth cleanup after an already completed delete", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"deleted":true}'));
    sdk.signOut.mockRejectedValueOnce(new TypeError("local failure"));
    await expect(authService.deleteAccount("qa-password")).rejects.toBeInstanceOf(DeletedAccountSessionError);
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
    expect(readAccountQuery("map-restaurants:qa-a")).toBeUndefined();
    await authService.finishDeletedAccountSession();
    expect(request).toHaveBeenCalledOnce();
    expect(sdk.signOut).toHaveBeenCalledTimes(2);
  });
});
