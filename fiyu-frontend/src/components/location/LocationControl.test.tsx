// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocationControl } from "@/components/location/LocationControl";
import type { LocationAnchor } from "@/lib/api/schemas";
import type { GeolocationState } from "@/lib/hooks/useGeolocation";
import type { DiscoveryAnchor } from "@/lib/location/anchor";

const SHIBUYA_ANCHOR: LocationAnchor = {
  id: "shibuya-station",
  display_name: "Shibuya Station",
  area_name: "Shibuya",
  latitude: 35.658,
  longitude: 139.7016,
  precision: "area_anchor",
  qualifier: "Approximate center of Shibuya",
};

function setup(overrides: Partial<React.ComponentProps<typeof LocationControl>> = {}) {
  const props = {
    anchor: null as DiscoveryAnchor | null,
    geolocation: { status: "idle" } as GeolocationState,
    areaAnchors: [] as LocationAnchor[],
    placingPin: false,
    onUseCurrentLocation: vi.fn(),
    onChooseArea: vi.fn(),
    onTogglePlacePin: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<LocationControl {...props} />);
  return props;
}

afterEach(cleanup);

describe("permission is only ever requested on purpose", () => {
  it("explains why location is wanted before asking", () => {
    setup();
    expect(screen.getByText(/never saved or sent to Fiyu/i)).toBeTruthy();
  });

  it("requests location only when the button is pressed", () => {
    const props = setup();
    expect(props.onUseCurrentLocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(props.onUseCurrentLocation).toHaveBeenCalledTimes(1);
  });

  it("shows progress while the browser prompt is open", () => {
    setup({ geolocation: { status: "requesting" } });
    expect(screen.getByRole("button", { name: /Locating/ })).toHaveProperty("disabled", true);
  });
});

describe("geolocation failure states", () => {
  it("explains a denial and points at the alternatives", () => {
    setup({ geolocation: { status: "denied" } });
    const message = screen.getByRole("status").textContent ?? "";
    expect(message).toMatch(/declined/i);
    expect(message).toMatch(/pick an area or place a pin/i);
  });

  it("distinguishes unavailable from denied", () => {
    setup({ geolocation: { status: "unavailable" } });
    expect(screen.getByRole("status").textContent).toMatch(/couldn't provide a location/i);
  });

  it("distinguishes a timeout and invites a retry", () => {
    setup({ geolocation: { status: "timeout" } });
    expect(screen.getByRole("status").textContent).toMatch(/too long/i);
  });

  it("shows no error message in the idle state", () => {
    setup();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("area anchors are labelled as approximate", () => {
  it("offers each reviewed anchor with its qualifier", () => {
    setup({ areaAnchors: [SHIBUYA_ANCHOR] });
    const button = screen.getByRole("button", { name: "Shibuya Station" });
    expect(button.getAttribute("title")).toBe("Approximate center of Shibuya");
  });

  it("states plainly that areas are not exact addresses", () => {
    setup({ areaAnchors: [SHIBUYA_ANCHOR] });
    expect(screen.getByText(/approximate centres, not exact addresses/i)).toBeTruthy();
  });

  it("reports the anchor when chosen", () => {
    const props = setup({ areaAnchors: [SHIBUYA_ANCHOR] });
    fireEvent.click(screen.getByRole("button", { name: "Shibuya Station" }));
    expect(props.onChooseArea).toHaveBeenCalledWith(SHIBUYA_ANCHOR);
  });

  it("says so when no anchors are available, rather than showing an empty list", () => {
    setup({ areaAnchors: [] });
    expect(screen.getByText(/Area shortcuts aren't available yet/i)).toBeTruthy();
  });
});

describe("manual pin", () => {
  it("toggles placement mode and reflects it to assistive tech", () => {
    const props = setup();
    const button = screen.getByRole("button", { name: "Place a pin" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(props.onTogglePlacePin).toHaveBeenCalledTimes(1);
  });

  it("prompts for the tap once placement mode is on", () => {
    setup({ placingPin: true });
    expect(screen.getByRole("button", { name: /Tap the map/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("an active anchor", () => {
  const current: DiscoveryAnchor = {
    kind: "current-location",
    point: { lat: 35.68, lng: 139.76 },
    accuracyMeters: 25,
  };

  it("names the anchor and its accuracy", () => {
    setup({ anchor: current });
    expect(screen.getByText("You are here")).toBeTruthy();
    expect(screen.getByText("Accurate to about 25 m")).toBeTruthy();
  });

  it("labels an area anchor with the backend's wording, never as the user", () => {
    setup({
      anchor: {
        kind: "area-anchor",
        point: { lat: 35.658, lng: 139.7016 },
        id: "shibuya-station",
        displayName: "Shibuya Station",
        areaName: "Shibuya",
        qualifier: "Approximate center of Shibuya",
      },
    });
    expect(screen.getByText("Shibuya Station")).toBeTruthy();
    expect(screen.getByText("Approximate center of Shibuya")).toBeTruthy();
    expect(screen.queryByText("You are here")).toBeNull();
  });

  it("warns that distances are straight-line, not walking routes", () => {
    setup({ anchor: current });
    expect(screen.getByText(/straight-line, not walking routes/i)).toBeTruthy();
  });

  it("can be cleared", () => {
    const props = setup({ anchor: current });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });
});

describe("touch targets", () => {
  it("gives every control at least a 44px target", () => {
    setup({ areaAnchors: [SHIBUYA_ANCHOR] });
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/min-h-11|min-h-12/);
    }
  });
});
