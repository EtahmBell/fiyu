import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "expo-router";

import { removeFromDefaultList } from "@/api/client";
import { useListsResources } from "@/api/queries";
import ListsScreen from "@/app/(tabs)/lists";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: View };
});
jest.mock("@/api/client", () => ({ removeFromDefaultList: jest.fn() }));
jest.mock("@/api/queries", () => ({
  PICKS_CITY_ID: "tokyo",
  picksKeys: { saved: ["lists", "default", "tokyo"], smartViews: ["lists", "smart", "tokyo"], map: ["map-restaurants"] },
  useListsResources: jest.fn(),
}));

const restaurant = { place_id: "saved-1", name_ja: "保存食堂", name_en: "Saved Shokudo", primary_category: "Japanese", neighborhood: "Koenji", display_area: "Koenji", fiyu_score: 86, score_band: "strong" };
const listMeta = { list_id: 1, city_id: "tokyo", name: "Saved", list_kind: "default", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-25T00:00:00Z" };
const savedList = { ...listMeta, item_count: 1, items: [{ place_id: restaurant.place_id, added_at: "2026-10-25T00:00:00Z", restaurant }] };
const smartViews = { city_id: "tokyo", generated_at: "2026-10-25T00:00:00Z", views: [{ key: "recently_saved", label: "Recently saved", description: "Your newest saves.", tier: "free", locked: false, available: true, item_count: 1, required_capability: null, unavailable_reason: null, collection_type: null }] };

function query(data: unknown, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn(), ...overrides };
}

function setResources({ saved = savedList, mine = [], smart = smartViews, savedOverrides = {} }: { saved?: unknown; mine?: unknown; smart?: unknown; savedOverrides?: Record<string, unknown> } = {}) {
  jest.mocked(useListsResources).mockReturnValue({ saved: query(saved, savedOverrides), mine: query(mine), smart: query(smart) } as never);
}

function wrapper(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("Lists screen", () => {
  afterEach(cleanup);
  beforeEach(() => { jest.clearAllMocks(); setResources(); });

  it("shows server-owned Smart views and opens their native detail route", async () => {
    const view = await render(wrapper(<ListsScreen initialTab="smart" photoEnabled={false} />));
    expect(await view.findByText("Recently saved")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Open Recently saved"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/lists/smart/[viewKey]", params: { viewKey: "recently_saved" } });
  }, 15_000);

  it("shows completed My Picks in Mine newest first and never opens private results publicly", async () => {
    const basePick = { my_pick_id: "10000000-0000-4000-8000-000000000001", provider: "google", external_place_id: "one", display_name_hint: null, user_query_hint: null, user_name_hint: null, user_address_hint: null, status: "ready", status_message: "Ready", failure_code: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T01:00:00Z", resolved_at: "2026-10-01T01:00:00Z", featured_until: "2026-10-04T01:00:00Z", place_id: "public-one", name_ja: null, name_en: "Older Public", primary_category: "Izakaya", display_area: "Koenji", fiyu_score: 80, score_version: "quality-v4-production-1", result_ready: true, map_ready: true, latitude: 35.7, longitude: 139.6, location_precision: "poi", is_public: true, recommendation_review_status: "approved" } as const;
    setResources({ mine: [basePick, { ...basePick, my_pick_id: "10000000-0000-4000-8000-000000000002", place_id: "private-two", name_en: "Newest Private", is_public: false, featured_until: "2026-10-05T01:00:00Z" }] });
    const view = await render(wrapper(<ListsScreen initialTab="mine" photoEnabled={false} />));
    expect(await view.findByText("Newest Private")).toBeTruthy();
    expect(view.getByText("Older Public")).toBeTruthy();
    expect(view.queryByLabelText("Open Newest Private")).toBeNull();
    fireEvent.press(view.getByLabelText("Open Older Public"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/restaurants/[placeId]", params: { placeId: "public-one" } });
  });

  it("shows a distinct empty state", async () => {
    setResources({ saved: { ...listMeta, item_count: 0, items: [] } });
    const empty = await render(wrapper(<ListsScreen photoEnabled={false} />));
    expect(empty.getByText("No saved places yet")).toBeTruthy();
  });

  it("shows a distinct network state", async () => {
    setResources({ saved: null, savedOverrides: { isError: true } });
    const error = await render(wrapper(<ListsScreen photoEnabled={false} />));
    expect(error.getByText("We couldn’t load your lists.")).toBeTruthy();
  });

  it("matches the Saved hierarchy, navigates by place id, and removes through the canonical mutation", async () => {
    jest.mocked(removeFromDefaultList).mockResolvedValue({ changed: true, list: { ...listMeta, item_count: 0, items: [] } } as never);
    const view = await render(wrapper(<ListsScreen photoEnabled={false} />));
    expect(view.getByText("Your Tokyo collection")).toBeTruthy();
    expect(view.getByText("1 saved place")).toBeTruthy();
    expect(view.getByLabelText("Photo unavailable for 保存食堂")).toBeTruthy();
    expect(view.getByText(/View restaurant/)).toBeTruthy();
    fireEvent.press(view.getByLabelText("Open 保存食堂"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/restaurants/[placeId]", params: { placeId: "saved-1" } });
    fireEvent.press(view.getByLabelText("Remove 保存食堂 from Saved"));
    await waitFor(() => expect(removeFromDefaultList).toHaveBeenCalledWith("tokyo", "saved-1"));
  });
});
