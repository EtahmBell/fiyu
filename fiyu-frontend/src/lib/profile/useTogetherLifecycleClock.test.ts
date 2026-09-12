// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTogetherLifecycleClock } from "@/lib/profile/useTogetherLifecycleClock";

describe("useTogetherLifecycleClock", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("advances at a countdown label boundary without network revalidation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const refresh = vi.fn();
    const expiry = 90 * 60_000;
    const { result } = renderHook(() => useTogetherLifecycleClock([expiry], refresh));
    act(() => vi.advanceTimersByTime(30 * 60_000));
    expect(result.current).toBe(30 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("revalidates at expiry and when focus returns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const refresh = vi.fn();
    renderHook(() => useTogetherLifecycleClock([2_000], refresh));
    act(() => vi.advanceTimersByTime(1_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
