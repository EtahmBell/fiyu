import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { restaurantFixture } from "@/test/restaurantFixture";
import { pendingTogetherSession } from "@/test/togetherFixture";
import { TogetherSessionScreen } from "./TogetherSessionScreen";

const mockFetchSession = jest.fn();
const mockRevealSession = jest.fn();
jest.mock("@/api/client", () => ({
  fetchTogetherSession: (...args: unknown[]) => mockFetchSession(...args),
  revealTogetherSession: (...args: unknown[]) => mockRevealSession(...args),
}));

const hiddenSession = { ...pendingTogetherSession, status: "generated" as const, partner: { display_name: "Aki", username: null, avatar_url: null }, restaurants: [restaurantFixture], active_for_current_user: true, reveal_pending: true, pick_count: 3 };

describe("TogetherSessionScreen", () => {
  beforeAll(() => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchSession.mockResolvedValue(hiddenSession);
    mockRevealSession.mockResolvedValue({ ...hiddenSession, reveal_pending: false, revealed_at: "2026-10-26T00:00:00Z" });
  });

  it("does not render hidden restaurant identity in text, labels, or test ids", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    await render(<QueryClientProvider client={client}><TogetherSessionScreen sessionId="session-1" onRevealed={jest.fn()} onBack={jest.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByLabelText("Reveal our Picks")).toBeTruthy());
    expect(screen.queryByText(restaurantFixture.name_ja!)).toBeNull();
    expect(screen.queryByTestId(`revealed-pick-${restaurantFixture.place_id}`)).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toContain(restaurantFixture.place_id);
  });

  it("submits one server reveal and opens the stable result", async () => {
    const onRevealed = jest.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    await render(<QueryClientProvider client={client}><TogetherSessionScreen sessionId="session-1" onRevealed={onRevealed} onBack={jest.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByLabelText("Reveal our Picks")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Reveal our Picks"));
    fireEvent.press(screen.getByLabelText("Reveal our Picks"));
    await waitFor(() => expect(mockRevealSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onRevealed).toHaveBeenCalledWith("session-1"));
  });
});
