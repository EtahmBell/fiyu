import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react-native";

import { eligibleTogetherState, pendingTogetherSession } from "@/test/togetherFixture";
import { restaurantFixture } from "@/test/restaurantFixture";
import { TogetherHub } from "./TogetherHub";

const mockRefetch = jest.fn();
const mockToggleSaved = jest.fn();
const restaurants = [0, 1, 2].map((index) => ({ ...restaurantFixture, place_id: `place-${index}`, name_ja: `レストラン${index + 1}` }));
const mockTogetherState = {
  ...eligibleTogetherState,
  current_sessions: [{
    ...pendingTogetherSession,
    status: "generated" as const,
    partner: { display_name: "Aki", username: null, avatar_url: null },
    restaurants,
    revealed_at: "2026-10-26T00:00:00Z",
    active_for_current_user: true,
    reveal_pending: false,
    pick_count: 3,
  }],
};

jest.mock("@/api/queries", () => ({
  picksKeys: { together: ["together"], recent: ["picks", "recent"], map: ["map-restaurants"] },
  useTogetherState: () => ({ data: mockTogetherState, isLoading: false, isError: false, refetch: mockRefetch }),
}));
jest.mock("@/components/restaurant/useRestaurantRelationships", () => ({
  useRestaurantRelationships: () => ({ savedIds: new Set(), visitsByPlace: new Map(), loading: false, savePendingPlaceId: null, visitPendingPlaceId: null, saveError: null, visitError: null, refetch: jest.fn(), toggleSaved: mockToggleSaved, logVisit: jest.fn() }),
}));
jest.mock("@/api/client", () => ({
  createTogetherInvite: jest.fn(), rotateTogetherInvite: jest.fn(), cancelTogetherInvite: jest.fn(), fetchPhotoPreview: jest.fn(),
}));
jest.mock("@/lib/nativeShare", () => ({ shareTogetherInvite: jest.fn(), copyTogetherInvite: jest.fn() }));

describe("TogetherHub result", () => {
  it("renders all three server-owned results with ScoreMark, Save, and restaurant navigation only", async () => {
    const onOpenRestaurant = jest.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(<QueryClientProvider client={client}><TogetherHub onBack={jest.fn()} onOpenSession={jest.fn()} onOpenRestaurant={onOpenRestaurant} /></QueryClientProvider>);
    expect(view.getAllByText("View restaurant →")).toHaveLength(3);
    expect(view.getAllByLabelText("Fiyu score 8.4 out of 10")).toHaveLength(3);
    expect(view.queryByText("Log")).toBeNull();
    fireEvent.press(view.getAllByText("View restaurant →")[1]);
    expect(onOpenRestaurant).toHaveBeenCalledWith("place-1");
    expect(mockTogetherState.current_sessions[0].restaurants).toHaveLength(3);
  });
});
