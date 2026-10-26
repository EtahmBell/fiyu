import type { MyPick } from "@fiyu/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useMyPickResources } from "@/api/queries";
import { MyPickSection, isMyPickResultReady } from "./MyPickSection";

jest.mock("@/api/queries", () => ({
  picksKeys: { myPicks: ["my-picks"], myPickQuota: ["my-picks", "quota"] },
  useMyPickResources: jest.fn(),
}));
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/components/restaurant/useRestaurantRelationships", () => ({
  useRestaurantRelationships: () => ({
    savedIds: new Set<string>(), visitsByPlace: new Map(), visitPendingPlaceId: null,
    visitError: null, toggleSaved: jest.fn(), logVisit: jest.fn(),
  }),
}));

const base: MyPick = {
  my_pick_id: "0d196bd8-2d5f-4be9-a0b5-4bd247188526", provider: "google", external_place_id: "ChIJnative", display_name_hint: null, user_query_hint: null, user_name_hint: "Authored", user_address_hint: "Tokyo", status: "needs_location", status_message: "Scored", failure_code: null, created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z", resolved_at: null, place_id: "private-native", name_ja: "ネイティブ", name_en: "Native Pick", primary_category: "Izakaya", display_area: "Koenji", fiyu_score: 76.2, score_version: "quality-v4-production-1", result_ready: true, map_ready: false, latitude: null, longitude: null, location_precision: null, is_public: false, recommendation_review_status: "not_eligible",
};

function resources(items: MyPick[]) {
  jest.mocked(useMyPickResources).mockReturnValue({ picks: { data: items, isLoading: false, error: null }, quota: { data: { limit: 3, used: 1, remaining: 2, window_hours: 24, next_available_at: null } } } as never);
}

describe("MyPickSection", () => {
  beforeEach(() => jest.clearAllMocks());

  it("treats a scored needs_location result as revealable and keeps it private", async () => {
    resources([base]);
    expect(isMyPickResultReady(base)).toBe(true);
    await render(<QueryClientProvider client={new QueryClient()}><MyPickSection onOpenRestaurant={jest.fn()} /></QueryClientProvider>);
    expect(screen.queryByText("Native Pick")).toBeNull();
    expect(screen.queryByText("ネイティブ")).toBeNull();
    expect(screen.queryByLabelText(/Fiyu score/i)).toBeNull();
    fireEvent.press(screen.getByLabelText("Reveal your Pick"));
    await waitFor(() => expect(screen.getByText("Native Pick")).toBeTruthy());
    expect(screen.getByText("ネイティブ")).toBeTruthy();
    expect(screen.getByLabelText("Fiyu score 7.6 out of 10")).toBeTruthy();
    expect(screen.getByText("This is your private result. It is not currently part of the public Fiyu catalog.")).toBeTruthy();
    expect(screen.getByText("2 of 3 Picks left")).toBeTruthy();
    expect(screen.queryByText("View restaurant →")).toBeNull();
    expect(screen.getAllByTestId("my-pick-ready-card")).toHaveLength(1);
    expect(screen.getAllByTestId("my-pick-footer")).toHaveLength(1);
  });

  it("renders one footer on the current pending card", async () => {
    resources([{ ...base, result_ready: false, fiyu_score: null, score_version: null, status: "pending" }, { ...base, my_pick_id: "771df96c-29d9-4b48-a40f-f5166a82b9ca", result_ready: false, fiyu_score: null, score_version: null, status: "researching" }]);
    await render(<QueryClientProvider client={new QueryClient()}><MyPickSection onOpenRestaurant={jest.fn()} /></QueryClientProvider>);
    expect(screen.getAllByText("2 of 3 Picks left")).toHaveLength(1);
    expect(screen.getAllByText("Submit another →")).toHaveLength(1);
  });

  it.each([
    ["resolving_identity", "Authored is under review"],
    ["researching", "Authored is under review"],
    ["outside_coverage", "This restaurant is outside Fiyu’s current Tokyo coverage."],
    ["failed_retryable", "Fiyu couldn’t finish checking this one yet. Your request is saved and can be retried."],
    ["failed_terminal", "Fiyu couldn’t complete this Pick yet. Your request is still saved."],
    ["needs_review", "Fiyu couldn’t complete this Pick yet. Your request is still saved."],
  ] as const)("renders %s with consumer-safe copy", async (status, expected) => {
    resources([{ ...base, status, result_ready: false, fiyu_score: null, score_version: null }]);
    const rendered = await render(<QueryClientProvider client={new QueryClient()}><MyPickSection onOpenRestaurant={jest.fn()} /></QueryClientProvider>);
    expect(rendered.getByText(expected)).toBeTruthy();
    expect(rendered.queryByText(status)).toBeNull();
  });
});
