// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FreeOriginOnboarding } from "@/components/location/FreeOriginOnboarding";
import type { LocationAnchor } from "@/lib/api/schemas";
import type { FreeOriginSetup } from "@/lib/location/origin";

const area: LocationAnchor = {
  id: "shibuya",
  display_name: "Shibuya",
  area_name: "Shibuya",
  latitude: 35.658,
  longitude: 139.7016,
  precision: "neighborhood",
  qualifier: "Center of Shibuya",
};

function setup(overrides: Partial<FreeOriginSetup> = {}): FreeOriginSetup {
  return {
    origin: null,
    geolocation: { status: "idle" },
    areaAnchors: [area],
    requestCurrentLocation: vi.fn(),
    chooseHomeArea: vi.fn(),
    continueWithoutLocation: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("free discovery origin onboarding", () => {
  it("explains privacy before requesting browser permission", () => {
    const origin = setup();
    render(<FreeOriginOnboarding setup={origin} />);

    expect(screen.queryByText("Show distances from a starting point")).toBeNull();
    expect(screen.queryByRole("button", { name: "Place a pin" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Set up location" }));
    expect(origin.requestCurrentLocation).not.toHaveBeenCalled();
    expect(screen.getByText(/browser will ask once/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue with current location" }));
    expect(origin.requestCurrentLocation).toHaveBeenCalledOnce();
  });

  it("offers one home-area fallback and no repeat location request after denial", () => {
    const origin = setup({ geolocation: { status: "denied" } });
    render(<FreeOriginOnboarding setup={origin} />);

    expect(screen.queryByRole("button", { name: /current location/i })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Home area" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use home area" }));
    expect(origin.chooseHomeArea).toHaveBeenCalledWith(area);
    expect(origin.requestCurrentLocation).not.toHaveBeenCalled();
  });
});
