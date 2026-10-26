import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "expo-router";

import { fetchDefaultList, fetchSmartViews, removeFromDefaultList } from "@/api/client";
import ListsScreen from "@/app/(tabs)/lists";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/api/client", () => ({
  fetchDefaultList: jest.fn(),
  fetchSmartViews: jest.fn(),
  removeFromDefaultList: jest.fn(),
}));

const restaurant = {
  place_id: "saved-1",
  name_ja: "保存食堂",
  name_en: "Saved Shokudo",
  primary_category: "Japanese",
  neighborhood: "Koenji",
  display_area: "Koenji",
  fiyu_score: 86,
  score_band: "strong",
};
const listMeta = { list_id: 1, city_id: "tokyo", name: "Saved", list_kind: "default", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-25T00:00:00Z" };

function wrapper(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("Lists screen", () => {
  afterEach(cleanup);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchDefaultList).mockResolvedValue({ ...listMeta, item_count: 1, items: [{ place_id: restaurant.place_id, added_at: "2026-10-25T00:00:00Z", restaurant }] });
    jest.mocked(fetchSmartViews).mockResolvedValue({ city_id: "tokyo", generated_at: "2026-10-25T00:00:00Z", views: [{ key: "recently_saved", label: "Recently saved", description: "Your newest saves.", tier: "free", locked: false, available: true, item_count: 1, required_capability: null, unavailable_reason: null, collection_type: null }] });
  });

  it("loads the canonical Saved list, navigates by place id, and removes through the shared mutation", async () => {
    jest.mocked(removeFromDefaultList).mockResolvedValue({ changed: true, list: { ...listMeta, item_count: 0, items: [] } });
    await render(wrapper(<ListsScreen />));
    expect(await screen.findByText("保存食堂")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText("Open 保存食堂")));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/restaurants/[placeId]", params: { placeId: "saved-1" } });
    await act(async () => fireEvent.press(screen.getByLabelText("Remove 保存食堂 from Saved")));
    await waitFor(() => expect(removeFromDefaultList).toHaveBeenCalledWith("tokyo", "saved-1"));
    await waitFor(() => expect(screen.getByText("No saved places yet")).toBeTruthy());
  });

  it("shows server-owned Smart Lists and opens their native detail route", async () => {
    await render(wrapper(<ListsScreen />));
    await act(async () => fireEvent.press(screen.getByText("Smart Lists")));
    expect(await screen.findByText("Recently saved")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText("Open Recently saved")));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/lists/smart/[viewKey]", params: { viewKey: "recently_saved" } });
  });

  it("keeps the empty and network states distinct", async () => {
    jest.mocked(fetchDefaultList).mockResolvedValueOnce({ ...listMeta, item_count: 0, items: [] });
    const first = await render(wrapper(<ListsScreen />));
    expect(await screen.findByText("No saved places yet")).toBeTruthy();
    first.unmount();
    jest.mocked(fetchDefaultList).mockRejectedValueOnce(new Error("offline"));
    await render(wrapper(<ListsScreen />));
    expect(await screen.findByText("We couldn’t load your lists.")).toBeTruthy();
  });
});
