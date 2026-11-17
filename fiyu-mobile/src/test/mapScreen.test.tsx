import type { MapRestaurant } from "@fiyu/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react-native";

import MapScreen from "@/app/(tabs)/map";
import { restaurantDetailFixture } from "@/test/restaurantFixture";

const mockMapRefetch = jest.fn();
const mockPersonalizedRefetch = jest.fn();
const mockMyPicksRefetch = jest.fn();
const mockNativeMap = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => callback(),
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock("@/components/navigation/AppHeader", () => {
  const { View } = jest.requireActual("react-native");
  return { AppHeader: () => <View testID="app-header" /> };
});
jest.mock("@/components/map/NativeFiyuMap", () => {
  const { View } = jest.requireActual("react-native");
  return { NativeFiyuMap: (props: unknown) => { mockNativeMap(props); return <View testID="mock-native-map" />; } };
});
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], refetch: mockMyPicksRefetch }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/api/client", () => ({ fetchMyPicks: jest.fn() }));
jest.mock("@/api/queries", () => ({
  picksKeys: { map: ["map"], myPicks: ["my-picks"] },
  useMapRestaurants: () => ({ data: mockRows, isError: false, refetch: mockMapRefetch }),
  useMapSupplementalResources: () => ({
    location: { data: null },
    personalized: { data: null, refetch: mockPersonalizedRefetch },
  }),
}));

const mockRows: MapRestaurant[] = [
  { ...restaurantDetailFixture, place_id: "saved", name_ja: "保存食堂", name_en: "Saved Shokudo", latitude: 35.68, longitude: 139.76, map_display_eligible: true, is_discovered: false, is_saved: true, is_visited: false, user_rating: null, fiyu_score: 82 } as MapRestaurant,
  { ...restaurantDetailFixture, place_id: "recent", name_ja: "発見食堂", latitude: 35.7, longitude: 139.72, map_display_eligible: true, is_discovered: true, is_saved: false, is_visited: false, user_rating: null } as MapRestaurant,
];

describe("Map screen", () => {
  afterEach(cleanup);
  beforeEach(() => jest.clearAllMocks());

  it("keeps the map full-height with floating filters, controls data, and bottom legend", async () => {
    await render(<MapScreen />);
    expect(screen.getByTestId("app-header")).toBeTruthy();
    expect(screen.getByTestId("map-frame").props.style).toEqual(expect.objectContaining({ flex: 1, overflow: "hidden" }));
    expect(screen.getByTestId("map-filter-card")).toBeTruthy();
    expect(screen.getByText("Your map")).toBeTruthy();
    expect(screen.getByTestId("mock-native-map")).toBeTruthy();
    expect(screen.getByTestId("map-legend")).toBeTruthy();
    expect(mockMapRefetch).toHaveBeenCalled();
    expect(mockPersonalizedRefetch).toHaveBeenCalled();
    expect(mockMyPicksRefetch).toHaveBeenCalled();
  });

  it("preserves web filter semantics and shows the compact selected detail hierarchy", async () => {
    await render(<MapScreen />);
    await act(async () => fireEvent.press(screen.getByText("Saved")));
    expect((mockNativeMap.mock.calls.at(-1)?.[0] as { restaurants: MapRestaurant[] }).restaurants.map((row) => row.place_id)).toEqual(["saved"]);
    await act(async () => (mockNativeMap.mock.calls.at(-1)?.[0] as { onSelect(row: MapRestaurant): void }).onSelect(mockRows[0]));
    expect(screen.getByText("保存食堂")).toBeTruthy();
    expect(screen.getByText("Saved Shokudo")).toBeTruthy();
    expect(screen.getByText("8.2")).toBeTruthy();
    expect(screen.getByText("View restaurant →")).toBeTruthy();
  });
});
