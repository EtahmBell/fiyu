import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";

import {
  fetchDeveloperStatus,
  fetchDiscoveryLocation,
  fetchLocationAnchors,
  fetchMyPickQuota,
  fetchMyPicks,
  fetchProfile,
  updateDiscoveryLocation,
  updateProfile,
} from "@/api/client";
import ProfileScreen from "@/app/(tabs)/profile";
import { useAuth } from "@/auth/AuthProvider";
import { chooseAndUploadAvatar } from "@/profile/avatar";

jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("@/profile/avatar", () => ({ chooseAndUploadAvatar: jest.fn(), removeAvatar: jest.fn() }));
jest.mock("@/api/client", () => ({
  fetchProfile: jest.fn(),
  updateProfile: jest.fn(),
  fetchDiscoveryLocation: jest.fn(),
  updateDiscoveryLocation: jest.fn(),
  fetchLocationAnchors: jest.fn(),
  fetchDeveloperStatus: jest.fn(),
  fetchMyPicks: jest.fn(),
  fetchMyPickQuota: jest.fn(),
  processDeveloperMyPick: jest.fn(),
  hardResetDeveloperMyPick: jest.fn(),
}));

const profile = { user_id: "user-1", username: "fiyu_user", display_name: "Fiyu User", bio: "Tokyo evenings.", avatar_url: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
const location = { configured: true, location_mode: "manual" as const, discovery_latitude: 35.703, discovery_longitude: 139.58, discovery_label: "Kichijoji", arrival_date: null, last_location_check_at: null, updated_at: "2026-10-01T00:00:00Z", can_change_location_freely: true };
const anchor = { id: "koenji", display_name: "Koenji, Tokyo", area_name: "Koenji", latitude: 35.705, longitude: 139.65, precision: "area", qualifier: "Approximate center of Koenji" };
const signOut = jest.fn();
const deleteAccount = jest.fn();

function wrapper(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } })}>{children}</QueryClientProvider>;
}

describe("Profile screen", () => {
  afterEach(cleanup);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue({ status: "authenticated", session: { userId: "user-1", email: "person@example.com", accessToken: "token" }, signIn: jest.fn(), signUp: jest.fn(), signOut, deleteAccount });
    jest.mocked(fetchProfile).mockResolvedValue(profile);
    jest.mocked(fetchDiscoveryLocation).mockResolvedValue(location);
    jest.mocked(fetchLocationAnchors).mockResolvedValue([anchor]);
    jest.mocked(fetchDeveloperStatus).mockRejectedValue(new Error("not authorized"));
    jest.mocked(fetchMyPicks).mockResolvedValue([]);
    jest.mocked(fetchMyPickQuota).mockResolvedValue({ limit: 3, used: 0, remaining: 3, window_hours: 24, next_available_at: null });
  });

  it("loads and edits canonical profile, avatar, location, links, and sign-out actions", async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ...profile, display_name: "Updated User", updated_at: "2026-10-26T00:00:00Z" });
    jest.mocked(updateDiscoveryLocation).mockResolvedValue({ ...location, discovery_label: "Koenji", discovery_latitude: anchor.latitude, discovery_longitude: anchor.longitude });
    jest.mocked(chooseAndUploadAvatar).mockResolvedValue({ ...profile, avatar_url: "https://images.example/avatar.webp", updated_at: "2026-10-26T00:00:00Z" });
    await render(wrapper(<ProfileScreen />));
    expect(await screen.findByDisplayValue("Fiyu User")).toBeTruthy();
    expect(screen.queryByText("Developer Tools")).toBeNull();

    await act(async () => fireEvent.changeText(screen.getByLabelText("Display name"), "Updated User"));
    expect(screen.getByLabelText("Display name")).toHaveDisplayValue("Updated User");
    await act(async () => fireEvent.press(screen.getByText("Save changes")));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ username: "fiyu_user", display_name: "Updated User", bio: "Tokyo evenings." }));

    await act(async () => fireEvent.press(screen.getByLabelText("Choose profile photo")));
    await waitFor(() => expect(chooseAndUploadAvatar).toHaveBeenCalledWith("user-1"));
    await act(async () => fireEvent.press(screen.getByText("Koenji")));
    await waitFor(() => expect(updateDiscoveryLocation).toHaveBeenCalledWith(anchor, expect.anything()));

    await act(async () => fireEvent.press(screen.getByLabelText("Privacy Policy")));
    expect(Linking.openURL).toHaveBeenCalledWith("https://fiyu.app/privacy");
    await act(async () => fireEvent.press(screen.getByText("Sign out")));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("requires password confirmation before invoking canonical account deletion", async () => {
    await render(wrapper(<ProfileScreen />));
    await screen.findByDisplayValue("Fiyu User");
    await act(async () => fireEvent.press(screen.getByLabelText("Delete account")));
    expect(await screen.findByText("Delete your account?")).toBeTruthy();
    expect(deleteAccount).not.toHaveBeenCalled();
    await act(async () => fireEvent.changeText(screen.getByLabelText("Current password"), "current-password"));
    await act(async () => fireEvent.press(screen.getByText("Permanently delete")));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("current-password"));
  });

  it("shows Profile-only developer tools only after explicit server authorization", async () => {
    jest.mocked(fetchDeveloperStatus).mockResolvedValue({ enabled: true, authorized: true, location_mode: "area", area_name: "Koenji", location_options: [] });
    await render(wrapper(<ProfileScreen />));
    expect(await screen.findByText("Developer Tools")).toBeTruthy();
    expect(screen.getByLabelText("Authorized developer tools")).toBeTruthy();
  });
});
