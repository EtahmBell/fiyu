// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchDeveloperStatus: vi.fn(),
  generateDeveloperDailyPicks: vi.fn(),
  resetDeveloperDailyPicks: vi.fn(),
  updateDeveloperLocation: vi.fn(),
}));

vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/accountQueryCache", () => ({ clearAccountQueries: vi.fn() }));
vi.mock("@/lib/auth/authService", () => ({
  authService: {
    getSession: vi.fn(async () => ({ userId: "developer-user" })),
  },
}));

import { DeveloperTools } from "@/components/profile/DeveloperTools";

const status = {
  enabled: true as const,
  location_mode: "area" as const,
  area_name: "Ginza",
  location_options: [
    { area_name: "Ginza", display_name: "Ginza" },
    { area_name: "Shinjuku", display_name: "Shinjuku" },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  api.fetchDeveloperStatus.mockReset();
  api.generateDeveloperDailyPicks.mockReset();
  api.resetDeveloperDailyPicks.mockReset();
  api.updateDeveloperLocation.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DeveloperTools", () => {
  it("stays hidden when the backend does not authorize the account", async () => {
    api.fetchDeveloperStatus.mockRejectedValue(new Error("Not found"));
    render(<DeveloperTools />);

    await waitFor(() => expect(api.fetchDeveloperStatus).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "Developer Tools" })).toBeNull();
  });

  it("updates a canonical override and generates a persisted test round", async () => {
    api.fetchDeveloperStatus.mockResolvedValue(status);
    api.updateDeveloperLocation.mockResolvedValue({
      ...status,
      area_name: "Shinjuku",
    });
    api.generateDeveloperDailyPicks.mockResolvedValue({
      assignment: {
        round_id: "round-1",
        city_id: "tokyo",
        assigned_at: "2026-08-29T00:00:00Z",
        expires_at: "2026-08-30T00:00:00Z",
        revealed_at: null,
        revealed_place_ids: [],
        discovery_mode: "current",
        discovery_label: "Shinjuku",
        restaurants: [],
      },
      diagnostics: {
        effective_location_source: "DEV_OVERRIDE",
        effective_area: "Shinjuku",
        final_radius_km: 3,
        selectable_candidate_count: 10,
        affordable_eligible_count: 2,
        affordable_slot_satisfied: true,
        expired_round_count: 1,
      },
    });

    render(<DeveloperTools />);
    const selector = await screen.findByLabelText("SIMULATED LOCATION");
    fireEvent.change(selector, { target: { value: "area:Shinjuku" } });
    await waitFor(() => expect(api.updateDeveloperLocation).toHaveBeenCalledWith({
      location_mode: "area",
      area_name: "Shinjuku",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Generate test Picks" }));
    await waitFor(() => expect(api.generateDeveloperDailyPicks).toHaveBeenCalledWith({
      current_latitude: undefined,
      current_longitude: undefined,
      preview_area: null,
    }));
    expect(await screen.findByText("Round round-1")).toBeTruthy();
    expect(screen.getByText(/10 eligible/)).toBeTruthy();
  });

  it("keeps outside-Tokyo generation behind an explicit preview area", async () => {
    api.fetchDeveloperStatus.mockResolvedValue({
      ...status,
      location_mode: "outside_tokyo",
      area_name: null,
    });
    api.generateDeveloperDailyPicks.mockResolvedValue({
      assignment: {
        round_id: "round-2",
        city_id: "tokyo",
        assigned_at: "2026-08-29T00:00:00Z",
        expires_at: "2026-08-30T00:00:00Z",
        revealed_at: null,
        revealed_place_ids: [],
        discovery_mode: "preview",
        discovery_label: "Ginza",
        restaurants: [],
      },
      diagnostics: {
        effective_location_source: "PREVIEW_AREA",
        effective_area: "Ginza",
        final_radius_km: 3,
        selectable_candidate_count: 10,
        affordable_eligible_count: 1,
        affordable_slot_satisfied: true,
        expired_round_count: 0,
      },
    });

    render(<DeveloperTools />);
    const preview = await screen.findByLabelText("TOKYO PREVIEW AREA");
    fireEvent.change(preview, { target: { value: "Ginza" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate test Picks" }));

    await waitFor(() => expect(api.generateDeveloperDailyPicks).toHaveBeenCalledWith({
      current_latitude: undefined,
      current_longitude: undefined,
      preview_area: "Ginza",
    }));
  });

  it("requires confirmation before resetting only Picks test state", async () => {
    api.fetchDeveloperStatus.mockResolvedValue(status);
    api.resetDeveloperDailyPicks.mockResolvedValue({
      reset: true,
      deleted_rounds: 2,
      deleted_seen: 6,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DeveloperTools />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset Picks test state" }));

    await waitFor(() => expect(api.resetDeveloperDailyPicks).toHaveBeenCalledOnce());
    expect(await screen.findByText(/2 rounds, 6 seen rows/)).toBeTruthy();
  });
});
