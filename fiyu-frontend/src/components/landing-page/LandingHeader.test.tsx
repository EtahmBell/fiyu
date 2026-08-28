// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingHeader } from "@/components/landing-page/LandingHeader";
import { authService, type AuthSession, type FiyuAccountProfile } from "@/lib/auth/authService";
import {
  clearProfileIdentity,
  publishProfileIdentity,
} from "@/lib/profile/profileIdentity";

const ethanProfile: FiyuAccountProfile = {
  user_id: "user-1",
  username: "ethan",
  display_name: "Ethan Bell",
  bio: null,
  avatar_url: null,
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
};

afterEach(() => {
  cleanup();
  clearProfileIdentity();
  vi.restoreAllMocks();
});

describe("marketing header identity", () => {
  it("shows the public auth actions while signed out", () => {
    clearProfileIdentity();
    render(<LandingHeader />);

    expect(screen.getByRole("link", { name: "About" }).getAttribute("href")).toBe("/about");
    expect(screen.getByRole("link", { name: "Contact" }).getAttribute("href")).toBe("/contact");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/signin");
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/signup");
  });

  it("uses the shared identity presentation and reacts to profile, avatar, account, and sign-out changes", () => {
    publishProfileIdentity(ethanProfile);
    render(<LandingHeader />);

    const ethan = screen.getByRole("link", { name: "Profile: Ethan Bell" });
    expect(ethan.getAttribute("href")).toBe("/picks");
    expect(ethan.textContent).toContain("Ethan Bell");
    expect(ethan.textContent).toContain("E");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign up" })).toBeNull();

    act(() => {
      publishProfileIdentity(
        { ...ethanProfile, display_name: "Ethan B.", updated_at: "2026-08-10T01:00:00Z" },
        "data:image/png;base64,aGVsbG8=",
      );
    });
    const updated = screen.getByRole("link", { name: "Profile: Ethan B." });
    expect(updated.querySelector("img")).toBeTruthy();

    act(() => {
      publishProfileIdentity({
        ...ethanProfile,
        user_id: "user-2",
        username: "mika",
        display_name: null,
        updated_at: "2026-08-10T02:00:00Z",
      });
    });
    const switched = screen.getByRole("link", { name: "Profile: mika" });
    expect(switched.textContent).toContain("mika");
    expect(switched.textContent).toContain("M");
    expect(switched.textContent).not.toContain("Ethan");

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const mobile = screen.getByRole("navigation", { name: "Landing page mobile" });
    expect(within(mobile).getByRole("link", { name: "Profile: mika" }).getAttribute("href")).toBe(
      "/picks",
    );

    act(() => clearProfileIdentity());
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Sign up" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Profile: mika" })).toBeNull();
  });

  it("keeps auth actions neutral during hydration and follows account-change events", async () => {
    clearProfileIdentity();
    render(<LandingHeader />);

    let resolveSession: ((session: AuthSession | null) => void) | undefined;
    vi.spyOn(authService, "getSession").mockImplementationOnce(
      () => new Promise((resolve) => { resolveSession = resolve; }),
    );
    vi.spyOn(authService, "getProfile").mockResolvedValueOnce(ethanProfile);

    act(() => window.dispatchEvent(new Event("fiyu:account-changed")));
    await waitFor(() => expect(resolveSession).toBeTypeOf("function"));

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign up" })).toBeNull();
    expect(screen.getAllByLabelText("Loading profile").length).toBeGreaterThan(0);

    await act(async () => {
      resolveSession?.({
        userId: "user-1",
        email: "ethan@example.com",
        accessToken: "token-1",
      });
    });
    expect(await screen.findByRole("link", { name: "Profile: Ethan Bell" })).toBeTruthy();

    vi.spyOn(authService, "getSession").mockResolvedValueOnce(null);
    act(() => window.dispatchEvent(new Event("fiyu:account-changed")));
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeTruthy();
  });
});
