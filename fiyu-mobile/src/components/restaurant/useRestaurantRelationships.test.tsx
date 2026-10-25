import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";

import { addToDefaultList, createRestaurantVisit, fetchDefaultList, fetchRestaurantLog, removeFromDefaultList } from "@/api/client";
import { useRestaurantRelationships } from "./useRestaurantRelationships";

jest.mock("@/api/client", () => ({
  addToDefaultList: jest.fn(),
  createRestaurantVisit: jest.fn(),
  fetchDefaultList: jest.fn(),
  fetchRestaurantLog: jest.fn(),
  removeFromDefaultList: jest.fn(),
}));

const list = (placeIds: string[]) => ({
  list_id: 1, city_id: "tokyo", name: "Saved", list_kind: "default", item_count: placeIds.length,
  items: placeIds.map((placeId) => ({ place_id: placeId, added_at: "2026-10-25T00:00:00Z", restaurant: { place_id: placeId, name_ja: null, name_en: "Restaurant", primary_category: null, neighborhood: null, display_area: null, fiyu_score: 80, score_band: null } })),
  created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z",
});

function Harness() {
  const relationships = useRestaurantRelationships();
  return <View>
    <Text>{relationships.savedIds.has("place") ? "saved" : "not saved"}</Text>
    <Text>{relationships.visitsByPlace.has("place") ? "visited" : "not visited"}</Text>
    {relationships.saveError ? <Text>{relationships.saveError}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => relationships.toggleSaved("place")}><Text>Toggle save</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => relationships.logVisit("place", 5, "Great")}><Text>Log visit</Text></Pressable>
  </View>;
}

describe("shared native Save and Log relationships", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchDefaultList).mockResolvedValue(list([]));
    jest.mocked(fetchRestaurantLog).mockResolvedValue([]);
    jest.mocked(removeFromDefaultList).mockResolvedValue({ list: list([]), changed: true });
  });

  it("guards rapid Save taps and synchronizes Saved and Visited query state", async () => {
    let resolveSave: ((value: { list: ReturnType<typeof list>; changed: boolean }) => void) | undefined;
    jest.mocked(addToDefaultList).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    jest.mocked(createRestaurantVisit).mockResolvedValue({
      id: "visit", place_id: "place", visited_at: "2026-10-25T00:00:00Z", reaction: null, rating: 5, private_note: "Great", created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z",
      restaurant: { place_id: "place", name_ja: null, name_en: "Restaurant", primary_category: null, neighborhood: null, display_area: null, fiyu_score: 80, score_band: null },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = await render(<Harness />, { wrapper: Wrapper });
    await waitFor(() => expect(view.getByText("not saved")).toBeTruthy());
    fireEvent.press(view.getByText("Toggle save"));
    fireEvent.press(view.getByText("Toggle save"));
    await waitFor(() => expect(addToDefaultList).toHaveBeenCalledTimes(1));
    await act(async () => resolveSave?.({ list: list(["place"]), changed: true }));
    await waitFor(() => expect(view.getByText("saved")).toBeTruthy());
    fireEvent.press(view.getByText("Log visit"));
    await waitFor(() => expect(view.getByText("visited")).toBeTruthy());
    view.unmount();
    client.clear();
  });
});
