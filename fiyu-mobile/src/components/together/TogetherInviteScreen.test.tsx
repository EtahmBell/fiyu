import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { pendingTogetherSession } from "@/test/togetherFixture";
import { TogetherInviteScreen } from "./TogetherInviteScreen";

const mockFetchInvite = jest.fn();
const mockAcceptInvite = jest.fn();
let mockAuthStatus: "authenticated" | "unauthenticated" = "unauthenticated";
jest.mock("@/api/client", () => ({
  fetchTogetherInvite: (...args: unknown[]) => mockFetchInvite(...args),
  acceptTogetherInvite: (...args: unknown[]) => mockAcceptInvite(...args),
}));
jest.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ status: mockAuthStatus, session: null }) }));

function show(autoJoin = false) {
  const props = { token: "t".repeat(32), autoJoin, onSignIn: jest.fn(), onSignUp: jest.fn(), onJoined: jest.fn(), onGoToFiyu: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><TogetherInviteScreen {...props} /></QueryClientProvider>);
  return props;
}

describe("TogetherInviteScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthStatus = "unauthenticated";
    mockFetchInvite.mockResolvedValue({ status: "pending", initiator: { display_name: "Aki", username: null, avatar_url: null }, expires_at: "2099-01-01T00:00:00Z", is_own_invite: false });
    mockAcceptInvite.mockResolvedValue({ ...pendingTogetherSession, status: "generated", role: "invitee", reveal_pending: true, active_for_current_user: true, pick_count: 3 });
  });

  it("preserves the invitation through sign in", async () => {
    const props = show();
    await waitFor(() => expect(screen.getByText("Sign in to join")).toBeTruthy());
    fireEvent.press(screen.getByText("Sign in to join"));
    expect(props.onSignIn).toHaveBeenCalledWith(`/together/${"t".repeat(32)}?join=1`);
  });

  it("auto-accepts once after authenticated continuation", async () => {
    mockAuthStatus = "authenticated";
    const props = show(true);
    await waitFor(() => expect(mockAcceptInvite).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(props.onJoined).toHaveBeenCalledWith("session-1"));
  });

  it("renders expired and invalid invitations without leaking session data", async () => {
    mockFetchInvite.mockResolvedValueOnce({ status: "expired", initiator: { display_name: "Aki", username: null, avatar_url: null }, expires_at: null, is_own_invite: false });
    show();
    await waitFor(() => expect(screen.getByText("This invitation is no longer available.")).toBeTruthy());
    expect(screen.queryByText("session-1")).toBeNull();
  });
});
