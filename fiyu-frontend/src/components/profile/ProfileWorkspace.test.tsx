// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({ replace: vi.fn() }),
}));

import { ProfileWorkspace } from "@/components/profile/ProfileWorkspace";
import { ApplicationNavigation } from "@/components/layout/ApplicationNavigation";
import { authService } from "@/lib/auth/authService";
import {
  clearProfileIdentity,
  publishProfileIdentity,
} from "@/lib/profile/profileIdentity";
import { PROFILE_STORAGE_KEY } from "@/lib/profile/profileStorage";

let desktopViewport = false;

beforeEach(() => {
  desktopViewport = false;
  window.localStorage.clear();
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
    render(<ProfileWorkspace mobileHome />);

    expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit profile" }).getAttribute("href")).toBe(
      "/profile/edit",
    );
    expect(screen.getByRole("link", { name: "Notifications" }).getAttribute("href")).toBe(
      "/profile/notifications",
    );
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/profile/account");
    expect(screen.queryByText(/Account features are intentionally absent/)).toBeNull();
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
});
