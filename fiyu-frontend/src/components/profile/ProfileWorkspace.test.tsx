// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));
const pathname = vi.hoisted(() => ({ current: "/profile" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => navigation,
}));

import { ProfileWorkspace } from "@/components/profile/ProfileWorkspace";
import { ApplicationNavigation } from "@/components/layout/ApplicationNavigation";
import { authService, clearDeletedAccountBrowserState } from "@/lib/auth/authService";
import { dailyPicksStorageKey } from "@/lib/daily-picks/storage";
import {
  clearProfileIdentity,
  publishProfileIdentity,
} from "@/lib/profile/profileIdentity";
import { PROFILE_STORAGE_KEY } from "@/lib/profile/profileStorage";
import { resetProfileSubpageHistory } from "@/lib/navigation/profileSubpage";

vi.mock("@/lib/profile/avatarImage", () => ({
  prepareAvatarImage: vi.fn(async () => new Blob(["avatar"], { type: "image/webp" })),
}));

let desktopViewport = false;

beforeEach(() => {
  desktopViewport = false;
  pathname.current = "/profile";
  navigation.replace.mockReset();
  navigation.push.mockReset();
  navigation.back.mockReset();
  resetProfileSubpageHistory();
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearProfileIdentity();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: desktopViewport,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProfileWorkspace", () => {
  it("renders a route-based mobile settings home with account controls", () => {
    render(
      <>
        <ApplicationNavigation />
        <ProfileWorkspace mobileHome />
      </>,
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit profile" }).getAttribute("href")).toBe(
      "/profile/edit",
    );
    expect(screen.getByRole("link", { name: "Notifications" }).getAttribute("href")).toBe(
      "/profile/notifications",
    );
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/profile/account");
    // Edit profile is a settings row now, not a duplicate hero button above them.
    expect(screen.getByRole("link", { name: "Edit profile" }).className).toContain(
      "hover:bg-lavender-50/55",
    );
    expect(screen.getByRole("heading", { name: "Account settings" }).className).toContain(
      "text-lavender-700",
    );
    expect(screen.getByRole("link", { name: "Notifications" }).className).toContain(
      "hover:bg-lavender-50/55",
    );
    const identity = screen.getByTestId("mobile-profile-identity");
    expect(identity.className).not.toContain("rounded-2xl");
    expect(identity.className).not.toContain("border-lavender");
    expect(identity.className).not.toContain("bg-lavender");
    // A compact ruled row rather than a centred block, so settings start sooner.
    expect(identity.className).toContain("flex items-center");
    expect(identity.className).not.toContain("text-center");
    expect(screen.getByLabelText("Default profile avatar").parentElement?.className).toContain(
      "size-12",
    );
    expect(screen.getByRole("navigation", { name: "Mobile primary" }).className).toContain(
      "fixed",
    );
    expect(screen.queryByText(/Account features are intentionally absent/)).toBeNull();
  });

  it("offers a labelled way back to Your Fiyu from Settings and Edit profile", () => {
    pathname.current = "/profile/settings";
    const settings = render(<ProfileWorkspace mobileHome />);
    const settingsBack = screen.getByRole("link", { name: "Back to Your Fiyu" });
    expect(settingsBack.getAttribute("href")).toBe("/profile");
    expect(settingsBack.textContent).toContain("Your Fiyu");
    expect(settingsBack.className).toContain("min-h-11");
    settings.unmount();

    pathname.current = "/profile/edit";
    render(<ProfileWorkspace section="profile" mobileTitle="Edit profile" />);
    const editBack = screen.getByRole("link", { name: "Back to Your Fiyu" });
    expect(editBack.getAttribute("href")).toBe("/profile");
    expect(screen.getByRole("heading", { name: "Edit profile" })).toBeTruthy();

    // No provable Your Fiyu entry behind this one, so Back pushes the reliable
    // destination rather than popping into whatever preceded it.
    fireEvent.click(editBack);
    expect(navigation.push).toHaveBeenCalledWith("/profile");
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it("returns the deeper settings screens to Settings rather than skipping a level", () => {
    for (const [section, title, standfirst] of [
      ["account", "Account", "Manage your Fiyu account session."],
      ["notifications", "Notifications", "Choose how Fiyu keeps you updated."],
      ["privacy", "Privacy", "How Fiyu handles your location and private Log."],
      ["help", "Help & support", "Support options for using Fiyu."],
      ["about", "About Fiyu", "Product and legal information."],
    ] as const) {
      pathname.current = `/profile/${section}`;
      const rendered = render(<ProfileWorkspace section={section} mobileTitle={title} />);

      const back = screen.getByRole("link", { name: "Back to Settings" });
      expect(back.getAttribute("href")).toBe("/profile/settings");
      expect(back.textContent).toContain("Settings");
      expect(back.className).toContain("min-h-11");

      // Exactly one visible page title, and it is the subpage header's h1.
      const titles = screen.getAllByRole("heading", { name: title });
      expect(titles).toHaveLength(1);
      expect(titles[0].tagName).toBe("H1");
      expect(titles[0]).toBe(screen.getByRole("heading", { name: title, level: 1 }));
      // The section's standfirst is copy, not a repeat of the title, so it stays.
      expect(screen.getByText(standfirst)).toBeTruthy();

      fireEvent.click(back);
      expect(navigation.push).toHaveBeenLastCalledWith("/profile/settings");
      rendered.unmount();
    }

    expect(screen.queryByRole("link", { name: "Back to Your Fiyu" })).toBeNull();
  });

  it("pops history only where Your Fiyu is provably the entry behind the subpage", () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { name: "http://localhost:3000/profile" } as unknown as PerformanceEntry,
    ]);

    pathname.current = "/profile/settings";
    const settings = render(<ProfileWorkspace mobileHome />);
    fireEvent.click(screen.getByRole("link", { name: "Back to Your Fiyu" }));
    expect(navigation.back).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalled();
    settings.unmount();

    // A second subpage in the same document has Settings behind it, not Your
    // Fiyu, so Back pushes the destination its label promises.
    pathname.current = "/profile/edit";
    render(<ProfileWorkspace section="profile" mobileTitle="Edit profile" />);
    fireEvent.click(screen.getByRole("link", { name: "Back to Your Fiyu" }));
    expect(navigation.push).toHaveBeenCalledWith("/profile");
    expect(navigation.back).toHaveBeenCalledOnce();
  });

  it("shows neutral loading instead of a default identity while profile state hydrates", async () => {
    let resolveSession: ((value: null) => void) | undefined;
    vi.spyOn(authService, "getSession").mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const rendered = render(<ProfileWorkspace mobileHome />);

    fireEvent(window, new Event("fiyu:account-changed"));

    expect(screen.getByRole("status", { name: "Loading Fiyu" })).toBeTruthy();
    expect(screen.queryByText("Your profile")).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit profile" })).toBeNull();

    resolveSession?.(null);
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading Fiyu" })).toBeNull());
    expect(rendered.getByRole("heading", { name: "Settings" })).toBeTruthy();
  });

  it("loads authenticated fields and propagates saved identity to the header", async () => {
    desktopViewport = true;
    const profile = {
      user_id: "user-1",
      username: "etahm",
      display_name: "Ethan Bell",
      bio: "Tokyo notes.",
      avatar_url: null,
      created_at: "2026-08-08T00:00:00Z",
      updated_at: "2026-08-08T00:00:00Z",
    };
    publishProfileIdentity(profile);
    vi.spyOn(authService, "updateProfile").mockResolvedValue({
      ...profile,
      display_name: null,
      updated_at: "2026-08-08T01:00:00Z",
    });

    render(
      <>
        <ApplicationNavigation />
        <ProfileWorkspace section="profile" />
      </>,
    );

    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("etahm");
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Ethan Bell");
    expect((screen.getByLabelText("Bio") as HTMLTextAreaElement).value).toBe("Tokyo notes.");
    expect(screen.getByRole("link", { name: "Profile: Ethan Bell" }).textContent).toContain("E");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Profile: etahm" }).textContent).toContain("E");
    });
  });

  it("validates and saves profile fields to device storage", () => {
    render(<ProfileWorkspace section="profile" />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " Ethan Bell " } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bad name" } });
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "Tokyo notes." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert").textContent).toContain("letters, numbers");

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ethan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByRole("status").textContent).toBe("Changes saved");
    expect(JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? "null")).toMatchObject({
      display_name: "Ethan Bell",
      username: "ethan",
      bio: "Tokyo notes.",
    });
  });

  it("removes a custom photo immediately and persists the initial avatar fallback", () => {
    window.localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        display_name: "Ethan Bell",
        username: "ethan",
        bio: "",
        profile_image: "data:image/png;base64,avatar",
      }),
    );

    render(<ProfileWorkspace section="profile" />);

    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    expect(screen.queryByText("Stored only on this device.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
    expect(screen.getByLabelText("Default profile avatar").textContent).toBe("E");
    expect(JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? "null")).toMatchObject({
      profile_image: null,
    });
  });

  it("uses and removes the authenticated server avatar without local photo state", async () => {
    const profile = {
      user_id: "user-1",
      username: "etahm",
      display_name: "Ethan Bell",
      bio: null,
      avatar_url: "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.webp?v=1",
      created_at: "2026-08-08T00:00:00Z",
      updated_at: "2026-08-08T00:00:00Z",
    };
    publishProfileIdentity(profile);
    vi.spyOn(authService, "removeProfileAvatar").mockResolvedValue({
      ...profile,
      avatar_url: null,
      updated_at: "2026-08-08T01:00:00Z",
    });

    render(
      <>
        <ApplicationNavigation />
        <ProfileWorkspace section="profile" />
      </>,
    );

    expect(screen.getByAltText("Profile").getAttribute("src")).toContain("avatar.webp?v=1");
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
      expect(screen.getByLabelText("Default profile avatar").textContent).toBe("E");
      expect(screen.getByRole("link", { name: "Profile: Ethan Bell" }).textContent).toContain("E");
    });
    expect(authService.removeProfileAvatar).toHaveBeenCalledWith(profile.avatar_url);
    expect(window.localStorage.getItem(PROFILE_STORAGE_KEY)).toContain('"profile_image":null');
  });

  it("uploads an authenticated avatar immediately without Save changes", async () => {
    const profile = {
      user_id: "user-1",
      username: "etahm",
      display_name: "Ethan Bell",
      bio: null,
      avatar_url: null,
      created_at: "2026-08-08T00:00:00Z",
      updated_at: "2026-08-08T00:00:00Z",
    };
    const uploaded = {
      ...profile,
      avatar_url: "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.webp?v=2",
    };
    publishProfileIdentity(profile);
    vi.spyOn(authService, "uploadProfileAvatar").mockResolvedValue(uploaded);
    render(<ProfileWorkspace section="profile" />);

    fireEvent.change(screen.getByLabelText("Choose profile photo"), {
      target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      expect(authService.uploadProfileAvatar).toHaveBeenCalledOnce();
      expect(screen.getByAltText("Profile").getAttribute("src")).toContain("avatar.webp?v=2");
    });
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeTruthy();
  });

  it("uses the two-column settings application on desktop", () => {
    desktopViewport = true;
    render(<ProfileWorkspace section="privacy" mobileHome />);

    expect(screen.getByRole("navigation", { name: "Profile settings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(screen.queryByText("Tokyo edition")).toBeNull();
  });

  it("requires the current password before deleting an authenticated account", async () => {
    desktopViewport = true;
    vi.spyOn(authService, "getSession").mockResolvedValue({
      userId: "user-1",
      email: "ethan@example.com",
      accessToken: "token",
    });
    vi.spyOn(authService, "deleteAccount").mockResolvedValue();

    render(<ProfileWorkspace section="account" />);

    const openButton = await screen.findByRole("button", { name: "Delete account" });
    fireEvent.click(openButton);
    const finalButton = screen.getByRole("button", { name: "Permanently delete account" });
    expect((finalButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), {
      target: { value: "current-password" },
    });
    expect((finalButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(finalButton);

    await waitFor(() => {
      expect(authService.deleteAccount).toHaveBeenCalledWith("current-password");
      expect(navigation.replace).toHaveBeenCalledWith("/");
    });
  });

  it("clears deleted-account browser state without removing anonymous ownership", () => {
    window.localStorage.setItem(dailyPicksStorageKey("user-1"), "account picks");
    window.localStorage.setItem(PROFILE_STORAGE_KEY, "profile cache");
    window.localStorage.setItem("fiyu.lists.owner-key.v1", "anonymous-owner");
    window.sessionStorage.setItem("fiyu.picks-detail-return.v1", "return state");

    clearDeletedAccountBrowserState("user-1");

    expect(window.localStorage.getItem(dailyPicksStorageKey("user-1"))).toBeNull();
    expect(window.localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem("fiyu.picks-detail-return.v1")).toBeNull();
    expect(window.localStorage.getItem("fiyu.lists.owner-key.v1")).toBe("anonymous-owner");
  });

  it("describes persisted account location and cross-device private Logs accurately", () => {
    desktopViewport = true;
    render(<ProfileWorkspace section="privacy" />);

    expect(screen.getByText(/does not continuously track your location in the background/i)).toBeTruthy();
    expect(screen.getByText(/active Tokyo discovery location may be saved to your account/i)).toBeTruthy();
    expect(screen.getByText(/visit history, reactions, and private notes are saved to your account/i)).toBeTruthy();
    expect(screen.queryByText(/kept for the current visit/i)).toBeNull();
    expect(screen.queryByText(/private to your device identity/i)).toBeNull();
  });
});
