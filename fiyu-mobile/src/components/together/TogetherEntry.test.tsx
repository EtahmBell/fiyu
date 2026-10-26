import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { eligibleTogetherState, pendingTogetherSession } from "@/test/togetherFixture";
import { TogetherEntry } from "./TogetherEntry";

jest.mock("@/api/client", () => ({ createTogetherInvite: jest.fn(async () => ({ session: {}, invite_url: "https://fiyu.app/together/token" })) }));
jest.mock("@/lib/nativeShare", () => ({ shareTogetherInvite: jest.fn() }));

async function show(state = eligibleTogetherState, props = { onOpenSession: jest.fn(), onOpenHub: jest.fn() }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return await render(<QueryClientProvider client={client}><TogetherEntry state={state} {...props} /></QueryClientProvider>);
}

describe("TogetherEntry", () => {
  beforeEach(() => jest.clearAllMocks());
  it("shows restrained rating progress and no Premium gate", async () => {
    const view = await show({ ...eligibleTogetherState, rated_visit_count: 3, can_initiate: false, block_reason: "ratings_required" });
    expect(view.getByText("Review 2 more restaurants to unlock.")).toBeTruthy();
    expect(view.queryByText(/Premium/i)).toBeNull();
  });

  it("routes an unrevealed session without rendering restaurant identity", async () => {
    const onOpenSession = jest.fn();
    const session = { ...pendingTogetherSession, status: "generated" as const, partner: { display_name: "Aki", username: null, avatar_url: null }, active_for_current_user: true, reveal_pending: true, pick_count: 3 };
    const view = await show({ ...eligibleTogetherState, can_initiate: false, current_sessions: [session] }, { onOpenSession, onOpenHub: jest.fn() });
    expect(view.getByText("3 Picks are waiting")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Fiyu Together"));
    expect(onOpenSession).toHaveBeenCalledWith("session-1");
  });

  it("guards repeated invitation taps", async () => {
    const view = await show();
    const entry = view.getByLabelText("Fiyu Together");
    await act(() => {
      fireEvent.press(entry);
      fireEvent.press(entry);
    });
    const { createTogetherInvite } = jest.requireMock("@/api/client");
    await waitFor(() => expect(createTogetherInvite).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.getByText("Invite someone →")).toBeTruthy());
  });
});
