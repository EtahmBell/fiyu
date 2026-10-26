import type { RestaurantVisit } from "@fiyu/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert } from "react-native";

import { deleteRestaurantVisit, fetchRestaurantLog, updateRestaurantVisit } from "@/api/client";
import LogScreen from "@/app/(tabs)/log";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/api/client", () => ({
  fetchRestaurantLog: jest.fn(),
  updateRestaurantVisit: jest.fn(),
  deleteRestaurantVisit: jest.fn(),
}));

const restaurant = { place_id: "visited-1", name_ja: "訪問食堂", name_en: "Visited Shokudo", primary_category: "Izakaya", neighborhood: "Ebisu", display_area: "Ebisu", fiyu_score: 82, score_band: "strong" };
const visit: RestaurantVisit = { id: "visit-1", place_id: restaurant.place_id, visited_at: "2026-10-25T18:00:00Z", reaction: null, rating: 4, private_note: "Quiet counter and careful cooking.", created_at: "2026-10-25T18:00:00Z", updated_at: "2026-10-25T18:00:00Z", restaurant };

function wrapper(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } })}>{children}</QueryClientProvider>;
}

describe("Log screen", () => {
  afterEach(cleanup);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchRestaurantLog).mockResolvedValue([visit]);
  });

  it("renders private visit history and navigates to restaurant detail", async () => {
    await render(wrapper(<LogScreen />));
    expect(await screen.findByText("訪問食堂")).toBeTruthy();
    expect(screen.getByLabelText("4 out of 5 stars")).toBeTruthy();
    expect(screen.getByText("Quiet counter and careful cooking.")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText("Open 訪問食堂")));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/restaurants/[placeId]", params: { placeId: "visited-1" } });
  });

  it("edits rating and private note through the shared Visit modal", async () => {
    jest.mocked(updateRestaurantVisit).mockResolvedValue({ ...visit, rating: 5, private_note: "Updated note." });
    await render(wrapper(<LogScreen />));
    await screen.findByText("訪問食堂");
    await act(async () => fireEvent.press(screen.getByLabelText("Edit visit to 訪問食堂")));
    await screen.findByText("5");
    await act(async () => fireEvent.press(screen.getByText("5")));
    await act(async () => fireEvent.changeText(screen.getByPlaceholderText("What should you remember?"), "Updated note."));
    await act(async () => fireEvent.press(screen.getByText("Save changes")));
    await waitFor(() => expect(updateRestaurantVisit).toHaveBeenCalledWith("visit-1", { rating: 5, private_note: "Updated note." }));
    expect(await screen.findByText("Updated note.")).toBeTruthy();
  });

  it("requires destructive confirmation before deleting a visit", async () => {
    jest.mocked(deleteRestaurantVisit).mockResolvedValue(true);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.style === "destructive")?.onPress?.());
    await render(wrapper(<LogScreen />));
    await screen.findByText("訪問食堂");
    await act(async () => fireEvent.press(screen.getByLabelText("Edit visit to 訪問食堂")));
    await screen.findByLabelText("Delete visit");
    await act(async () => fireEvent.press(screen.getByLabelText("Delete visit")));
    await waitFor(() => expect(deleteRestaurantVisit).toHaveBeenCalledWith("visit-1"));
    await waitFor(() => expect(screen.getByText("No visits logged yet")).toBeTruthy());
    expect(alert).toHaveBeenCalledWith("Delete this visit?", expect.any(String), expect.any(Array));
  });
});
