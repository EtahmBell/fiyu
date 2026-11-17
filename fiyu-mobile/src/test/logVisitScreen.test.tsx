import type { PublicRestaurantDetail, RestaurantVisit } from "@fiyu/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "expo-router";

import { createRestaurantVisit, fetchDefaultList, fetchRestaurant, fetchRestaurantLog, fetchSeenRestaurantIds } from "@/api/client";
import LogVisitScreen from "@/app/(tabs)/log";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, Stack: () => null }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/api/client", () => ({
  createRestaurantVisit: jest.fn(), fetchDefaultList: jest.fn(), fetchRestaurant: jest.fn(), fetchRestaurantLog: jest.fn(), fetchSeenRestaurantIds: jest.fn(),
}));

const restaurant = { place_id: "seen-1", name_ja: "見た食堂", name_en: "Mita Shokudo", category: "Izakaya" } as PublicRestaurantDetail;
const visit = { id: "visit-1", place_id: "seen-1", visited_at: "2026-11-16T12:00:00.000Z", rating: 4, reaction: null, private_note: "Counter seat.", created_at: "2026-11-16T12:00:00.000Z", updated_at: "2026-11-16T12:00:00.000Z", restaurant: { place_id: "seen-1", name_ja: "見た食堂", name_en: "Mita Shokudo", primary_category: "Izakaya", neighborhood: null, display_area: null, fiyu_score: null, score_band: null } } as RestaurantVisit;

function wrapper(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } })}>{children}</QueryClientProvider>;
}

describe("Log a visit screen", () => {
  afterEach(cleanup);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchRestaurantLog).mockResolvedValue([]);
    jest.mocked(fetchSeenRestaurantIds).mockResolvedValue(["seen-1"]);
    jest.mocked(fetchDefaultList).mockResolvedValue({ items: [] } as never);
    jest.mocked(fetchRestaurant).mockResolvedValue(restaurant);
  });

  it("renders the private visit form and opens nested history", async () => {
    await render(wrapper(<LogVisitScreen />));
    expect(screen.getByText("Log a visit")).toBeTruthy();
    expect(screen.getByLabelText("Restaurant search")).toBeTruthy();
    expect(screen.getByLabelText("Visit date")).toBeTruthy();
    expect(screen.getByLabelText("Private note")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText("History")));
    expect(router.push).toHaveBeenCalledWith("/log/history");
  });

  it("saves a selected restaurant, date, rating, and private note", async () => {
    jest.mocked(createRestaurantVisit).mockResolvedValue(visit);
    await render(wrapper(<LogVisitScreen />));
    await act(async () => fireEvent(screen.getByLabelText("Restaurant search"), "focus"));
    await screen.findByText("見た食堂");
    await act(async () => fireEvent.press(screen.getByText("見た食堂")));
    await act(async () => fireEvent.changeText(screen.getByLabelText("Visit date"), "2026-11-16"));
    await act(async () => fireEvent.press(screen.getByLabelText("4 stars")));
    await act(async () => fireEvent.changeText(screen.getByLabelText("Private note"), "Counter seat."));
    await act(async () => fireEvent.press(screen.getByText("Save visit")));
    await waitFor(() => expect(createRestaurantVisit).toHaveBeenCalledWith({ place_id: "seen-1", visited_at: "2026-11-16T12:00:00.000Z", rating: 4, private_note: "Counter seat." }));
    expect(await screen.findByText("見た食堂 was added to your Log.")).toBeTruthy();
  }, 15_000);
});
