// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  clearDeveloperPersonalizedPickDismissal: vi.fn(),
  expireDeveloperPersonalizedPick: vi.fn(),
  fetchAuthenticatedMapRestaurants: vi.fn(),
  fetchDeveloperPersonalizedPick: vi.fn(),
  fetchDeveloperStatus: vi.fn(),
  fetchMyPicks: vi.fn(),
  fetchRestaurants: vi.fn(),
  fetchUserFiyuSummary: vi.fn(),
  forceDeveloperPersonalizedPick: vi.fn(),
  generateDeveloperDailyPicks: vi.fn(),
  resetDeveloperDailyPicks: vi.fn(),
  resetDeveloperPersonalizedPick: vi.fn(),
  resetDeveloperVisitTaste: vi.fn(),
  updateDeveloperLocation: vi.fn(),
  processDeveloperMyPick: vi.fn(),
  hardResetDeveloperMyPick: vi.fn(),
  resetDeveloperMyPicks: vi.fn(),
  previewDeveloperMyPick: vi.fn(),
}));

const ppDebug = {
  state: {
    status: "unlocked_idle" as const,
    qualifying_rating_count: 10,
    unlock_threshold: 10,
    event_eligible: true,
    event_id: null,
    card_count: null,
    created_at: null,
    expires_at: null,
    dismissed_until: null,
    dismissal_count: 0,
    selected_position: null,
    selected_at: null,
    active_until: null,
    selected_restaurant: null,
  },
  candidate_place_ids: [],
  selection_metadata: {},
  developer_forced: false,
  deleted_events: 0,
};

const cache = vi.hoisted(() => ({
  accountQueryKey: vi.fn((resource: string, accountId: string) => `${resource}:${accountId}`),
  clearAccountQuery: vi.fn(),
  clearAccountQueries: vi.fn(),
  writeAccountQuery: vi.fn(),
}));

vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/accountQueryCache", () => cache);
vi.mock("@/lib/auth/authService", () => ({
  authService: {
    getSession: vi.fn(async () => ({ userId: "developer-user" })),
  },
}));

import { DeveloperTools } from "@/components/profile/DeveloperTools";

const status = {
  enabled: true as const,
  authorized: true as const,
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
  api.fetchMyPicks.mockReset().mockResolvedValue([]);
  api.fetchDeveloperPersonalizedPick.mockReset().mockResolvedValue(ppDebug);
  api.fetchRestaurants.mockReset();
  api.forceDeveloperPersonalizedPick.mockReset();
  api.resetDeveloperPersonalizedPick.mockReset();
  api.clearDeveloperPersonalizedPickDismissal.mockReset();
  api.expireDeveloperPersonalizedPick.mockReset();
  api.fetchAuthenticatedMapRestaurants.mockReset();
  api.fetchUserFiyuSummary.mockReset();
  api.generateDeveloperDailyPicks.mockReset();
  api.resetDeveloperDailyPicks.mockReset();
  api.resetDeveloperVisitTaste.mockReset();
  api.updateDeveloperLocation.mockReset();
  api.processDeveloperMyPick.mockReset();
  api.hardResetDeveloperMyPick.mockReset();
  api.resetDeveloperMyPicks.mockReset();
  api.previewDeveloperMyPick.mockReset();
  cache.accountQueryKey.mockClear();
  cache.clearAccountQuery.mockClear();
  cache.clearAccountQueries.mockClear();
  cache.writeAccountQuery.mockClear();
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

    fireEvent.click(screen.getByRole("button", { name: "Generate test Picks" }));
    await waitFor(() => expect(api.generateDeveloperDailyPicks).toHaveBeenCalledTimes(2));
    expect(api.generateDeveloperDailyPicks).toHaveBeenLastCalledWith({
      current_latitude: undefined,
      current_longitude: undefined,
      preview_area: "Ginza",
    });
  });

  it("requires a fresh preview after simulating entry into Tokyo and leaving again", async () => {
    api.fetchDeveloperStatus.mockResolvedValue({
      ...status,
      location_mode: "outside_tokyo",
      area_name: null,
    });
    api.updateDeveloperLocation
      .mockResolvedValueOnce({ ...status, location_mode: "real", area_name: null })
      .mockResolvedValueOnce({ ...status, location_mode: "outside_tokyo", area_name: null });

    render(<DeveloperTools />);
    const preview = await screen.findByLabelText("TOKYO PREVIEW AREA") as HTMLSelectElement;
    fireEvent.change(preview, { target: { value: "Ginza" } });
    fireEvent.change(screen.getByLabelText("SIMULATED LOCATION"), {
      target: { value: "real" },
    });
    await waitFor(() => expect(api.updateDeveloperLocation).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("SIMULATED LOCATION"), {
      target: { value: "outside_tokyo" },
    });
    await waitFor(() => expect(api.updateDeveloperLocation).toHaveBeenCalledTimes(2));

    expect((screen.getByLabelText("TOKYO PREVIEW AREA") as HTMLSelectElement).value).toBe("");
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

  it("confirms visit and Taste reset in an app dialog and refreshes account caches", async () => {
    const lockedSummary = {
      visited_count: 0,
      saved_count: 1,
      area_count: 0,
      rated_visit_count: 0,
      taste_unlocked: false,
    };
    api.fetchDeveloperStatus.mockResolvedValue(status);
    api.resetDeveloperVisitTaste.mockResolvedValue({
      reset: true,
      deleted_visits: 3,
      deleted_taste_snapshots: 1,
    });
    api.fetchUserFiyuSummary.mockResolvedValue(lockedSummary);
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([]);

    render(<DeveloperTools />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset visit & Taste test data" }));

    expect(screen.getByRole("dialog", { name: "Reset visit & Taste test data?" })).toBeTruthy();
    expect(api.resetDeveloperVisitTaste).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reset test data" }));

    await waitFor(() => expect(api.resetDeveloperVisitTaste).toHaveBeenCalledOnce());
    expect(cache.writeAccountQuery).toHaveBeenCalledWith("restaurant-log:developer-user", []);
    expect(cache.clearAccountQuery).toHaveBeenCalledWith("restaurant-log:developer-user");
    expect(cache.clearAccountQuery).toHaveBeenCalledWith("user-fiyu-summary:developer-user");
    expect(cache.clearAccountQuery).toHaveBeenCalledWith("map-restaurants:developer-user");
    expect(cache.writeAccountQuery).toHaveBeenCalledWith(
      "user-fiyu-summary:developer-user",
      lockedSummary,
    );
    expect(cache.writeAccountQuery).toHaveBeenCalledWith("map-restaurants:developer-user", []);
    expect(await screen.findByText(/3 visits, 1 Taste snapshots/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can cancel the visit and Taste reset without calling the API", async () => {
    api.fetchDeveloperStatus.mockResolvedValue(status);
    render(<DeveloperTools />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset visit & Taste test data" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.resetDeveloperVisitTaste).not.toHaveBeenCalled();
  });

  it("offers visual-only PP previews and account-scoped real event controls", async () => {
    const forced = {
      ...ppDebug,
      state: {
        ...ppDebug.state,
        status: "event_available" as const,
        event_id: "event-dev",
        card_count: 3 as const,
      },
      candidate_place_ids: ["one", "two", "three"],
      selection_metadata: { algorithm: "personalized-solo-v1" },
      developer_forced: true,
    };
    api.fetchDeveloperStatus.mockResolvedValue(status);
    api.forceDeveloperPersonalizedPick.mockResolvedValue(forced);
    api.clearDeveloperPersonalizedPickDismissal.mockResolvedValue(forced);
    api.expireDeveloperPersonalizedPick.mockResolvedValue({
      ...forced,
      state: { ...forced.state, status: "expired", card_count: null },
    });
    api.resetDeveloperPersonalizedPick.mockResolvedValue({
      ...ppDebug,
      deleted_events: 1,
    });

    render(<DeveloperTools />);
    expect(await screen.findByRole("heading", { name: "Personalized Picks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Locked 9/10" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlocked 10/10" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Force event now" }));
    await waitFor(() => expect(api.forceDeveloperPersonalizedPick).toHaveBeenCalledWith({
      current_latitude: undefined,
      current_longitude: undefined,
      preview_area: null,
    }));
    expect(await screen.findByText("event-dev")).toBeTruthy();
    expect(screen.getByText("personalized-solo-v1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear dismissal" }));
    await waitFor(() => expect(api.clearDeveloperPersonalizedPickDismissal).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Expire event" }));
    await waitFor(() => expect(api.expireDeveloperPersonalizedPick).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Reset event" }));
    await waitFor(() => expect(api.resetDeveloperPersonalizedPick).toHaveBeenCalledOnce());
  });

  it("shows lifecycle-appropriate My Pick controls only inside authorized Developer Tools", async () => {
    const pending = {
      my_pick_id: "pick-pending",
      status: "researching",
      name_en: "Pending Ramen",
      name_ja: null,
      failure_code: null,
      result_ready: false,
      map_ready: false,
      fiyu_score: null,
      created_at: "2026-10-23T10:00:00Z",
    };
    const retry = {
      ...pending,
      my_pick_id: "pick-retry",
      status: "failed_retryable",
      name_en: "Retry Ramen",
      failure_code: "provider_retryable",
    };
    const location = {
      ...pending,
      my_pick_id: "pick-location",
      status: "needs_location",
      name_en: "Located Ramen",
      result_ready: true,
      fiyu_score: 65,
    };
    api.fetchDeveloperStatus.mockResolvedValue(status);
    api.fetchMyPicks.mockResolvedValue([pending, retry, location]);
    api.processDeveloperMyPick.mockResolvedValue({});

    render(<DeveloperTools />);
    expect(await screen.findByRole("heading", { name: "My Pick Developer Tools" })).toBeTruthy();
    expect(await screen.findByText("provider_retryable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Process now" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry location" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Hard reset" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Retry location" }));
    await waitFor(() => expect(api.processDeveloperMyPick).toHaveBeenCalledWith("pick-location"));
  });
});
