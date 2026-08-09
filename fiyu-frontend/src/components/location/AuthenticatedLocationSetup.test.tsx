// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedLocationSetup } from "@/components/location/AuthenticatedLocationSetup";
import type { LocationAnchor } from "@/lib/api/schemas";
import type { UseGeolocation } from "@/lib/hooks/useGeolocation";

const api = vi.hoisted(() => ({ check: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  checkCurrentDiscoveryLocation: api.check,
  saveManualDiscoveryLocation: api.save,
}));

const anchors: LocationAnchor[] = [
  {
    id: "shibuya-station",
    display_name: "Shibuya Station",
    area_name: "Shibuya",
    latitude: 35.658,
    longitude: 139.7016,
    precision: "area_anchor",
    qualifier: "Approximate center of Shibuya",
  },
];

const idle = (request = vi.fn()): UseGeolocation => ({
  state: { status: "idle" },
  request,
  clear: vi.fn(),
});

afterEach(cleanup);
beforeEach(() => {
  api.check.mockReset();
  api.save.mockReset();
});

describe("AuthenticatedLocationSetup", () => {
  it("does not request browser location before the explicit click", () => {
    const request = vi.fn();
    render(
      <AuthenticatedLocationSetup anchors={anchors} geolocation={idle(request)} onConfigured={vi.fn()} />,
    );
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(request).toHaveBeenCalledOnce();
  });

  it("keeps manual area selection available when permission is denied", () => {
    render(
      <AuthenticatedLocationSetup
        anchors={anchors}
        geolocation={{ state: { status: "denied" }, request: vi.fn(), clear: vi.fn() }}
        onConfigured={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Search a Tokyo area or station")).toBeTruthy();
    expect(screen.getByText(/Location isn't available/)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "You're not in Tokyo right now" })).toBeNull();
  });

  it("shows the travel state outside Tokyo and saves a canonical preview area", async () => {
    api.check.mockResolvedValue({ inside_service_area: false, location: { configured: false } });
    api.save.mockResolvedValue({
      configured: true,
      location_mode: "preview",
      discovery_latitude: 35.658,
      discovery_longitude: 139.7016,
      discovery_label: "Shibuya",
      arrival_date: "2026-10-01",
      last_location_check_at: null,
      updated_at: "2026-08-09T00:00:00Z",
      can_change_location_freely: false,
    });
    const onConfigured = vi.fn();
    render(
      <AuthenticatedLocationSetup
        anchors={anchors}
        geolocation={{
          state: { status: "granted", point: { lat: 34.69, lng: 135.5 }, accuracyMeters: 20 },
          request: vi.fn(),
          clear: vi.fn(),
        }}
        onConfigured={onConfigured}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Heading to Tokyo?" })).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "You're not in Tokyo right now" });
    expect(dialog).toBeTruthy();
    expect(screen.queryByText(/couldn't check that location/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();
    const areaSearch = screen.getByPlaceholderText("Search a Tokyo area or station");
    fireEvent.click(screen.getByRole("button", { name: "Choose Tokyo area" }));
    expect(screen.queryByRole("dialog", { name: "You're not in Tokyo right now" })).toBeNull();
    expect(document.activeElement).toBe(areaSearch);
    fireEvent.click(screen.getByRole("option", { name: /Shibuya/ }));
    fireEvent.change(screen.getByLabelText(/ARRIVING/), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Explore this area" }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith({
        location_mode: "preview",
        discovery_label: "Shibuya",
        discovery_latitude: 35.658,
        discovery_longitude: 139.7016,
        arrival_date: "2026-10-01",
      }),
    );
    expect(onConfigured).toHaveBeenCalled();
  });

  it("dismisses area results on outside click without clearing typed text", () => {
    render(
      <AuthenticatedLocationSetup anchors={anchors} geolocation={idle()} onConfigured={vi.fn()} />,
    );
    const input = screen.getByRole("combobox", { name: "Choose a Tokyo area" });
    fireEvent.change(input, { target: { value: "Shib" } });
    expect(screen.getByRole("listbox", { name: "Tokyo area search results" })).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("listbox", { name: "Tokyo area search results" })).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Shib");
  });

  it("dismisses area results with Escape", () => {
    render(
      <AuthenticatedLocationSetup anchors={anchors} geolocation={idle()} onConfigured={vi.fn()} />,
    );
    const input = screen.getByRole("combobox", { name: "Choose a Tokyo area" });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox", { name: "Tokyo area search results" })).toBeTruthy();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Tokyo area search results" })).toBeNull();
  });

  it("closes results and keeps the selected canonical area", () => {
    render(
      <AuthenticatedLocationSetup anchors={anchors} geolocation={idle()} onConfigured={vi.fn()} />,
    );
    const input = screen.getByRole("combobox", { name: "Choose a Tokyo area" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /Shibuya/ }));

    expect(screen.queryByRole("listbox", { name: "Tokyo area search results" })).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Shibuya Station");
  });
});
