import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchRestaurants } from "@/lib/api/client";
import { FiyuApiError } from "@/lib/api/errors";

afterEach(() => vi.restoreAllMocks());

describe("API connectivity classification", () => {
  it.each([
    [429, "rate-limited"],
    [500, "server-error"],
    [503, "backend-unavailable"],
    [401, "unauthorized"],
  ] as const)("maps HTTP %s to %s", async (status, kind) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status }));
    await expect(fetchRestaurants()).rejects.toMatchObject({ kind, status });
  });

  it("keeps a valid empty response distinct from connectivity failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    await expect(fetchRestaurants()).resolves.toEqual({ restaurants: [], rejected: [] });
  });

  it("classifies a fetch rejection as network failure without exposing nested details", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("private transport detail"));
    try {
      await fetchRestaurants();
      throw new Error("expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FiyuApiError);
      expect(error).toMatchObject({ kind: "network" });
    }
  });

  it("classifies malformed success responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(fetchRestaurants()).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("classifies a client deadline as timeout", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      queueMicrotask(() => controller.abort(new DOMException("deadline", "TimeoutError")));
      return controller.signal;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((_, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason));
    }));
    await expect(fetchRestaurants()).rejects.toMatchObject({ kind: "timeout" });
  });
});
