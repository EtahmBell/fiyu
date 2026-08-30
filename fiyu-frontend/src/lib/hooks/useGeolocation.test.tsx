// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useGeolocation } from "@/lib/hooks/useGeolocation";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGeolocation", () => {
  it("bypasses browser position caching for an explicit fresh request", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 35.658,
          longitude: 139.7016,
          accuracy: 20,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      await result.current.requestFresh();
    });

    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ maximumAge: 0 }),
    );
    expect(result.current.state).toMatchObject({
      status: "granted",
      point: { lat: 35.658, lng: 139.7016 },
    });
  });
});
