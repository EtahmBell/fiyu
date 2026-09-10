// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useExpiryBoundaries } from "@/lib/hooks/useExpiryBoundaries";

describe("useExpiryBoundaries", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("updates at each independent expiry without polling", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const onBoundary = vi.fn();
    const { result } = renderHook(() => useExpiryBoundaries([3_000, 2_000], onBoundary));

    expect(result.current).toBe(1_000);
    act(() => vi.advanceTimersByTime(999));
    expect(onBoundary).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(2_000);
    expect(onBoundary).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(3_000);
    expect(onBoundary).toHaveBeenCalledTimes(2);
  });

  it("reconciles immediately when a backgrounded tab becomes visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const onBoundary = vi.fn();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    const { result } = renderHook(() => useExpiryBoundaries([2_000], onBoundary));

    vi.setSystemTime(4_000);
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(result.current).toBe(4_000);
    expect(onBoundary).toHaveBeenCalledTimes(1);
  });
});
