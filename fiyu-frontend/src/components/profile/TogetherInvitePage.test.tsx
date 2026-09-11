// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherInvitePage } from "@/components/profile/TogetherInvitePage";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  fetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  identity: { status: "ready", profile: null } as { status: string; profile: null | { user_id: string } },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/lib/profile/profileIdentity", () => ({ useProfileIdentity: () => mocks.identity }));
vi.mock("@/lib/api/client", () => ({
  acceptTogetherInvite: mocks.accept,
  fetchTogetherInvite: mocks.fetch,
}));

describe("TogetherInvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identity = { status: "ready", profile: null };
    mocks.fetch.mockResolvedValue({
      status: "pending",
      initiator: { display_name: "Ethan", username: "ethan", avatar_url: null },
      expires_at: "2026-09-11T00:00:00Z",
      is_own_invite: false,
    });
  });

  afterEach(() => cleanup());

  it("preserves the invitation route through signed-out authentication", async () => {
    render(<TogetherInvitePage token="secure-token" />);
    expect(await screen.findByText("Ethan wants to find somewhere with you.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in to join" }).getAttribute("href"))
      .toBe("/signin?next=%2Ftogether%2Fsecure-token%3Fjoin%3D1");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href"))
      .toBe("/signup?next=%2Ftogether%2Fsecure-token%3Fjoin%3D1");
    expect(screen.getByRole("link", { name: "Sign in without joining yet" }).getAttribute("href"))
      .toBe("/signin?next=%2Ftogether%2Fsecure-token");
  });

  it("accepts for an authenticated invitee and opens the shared Picks", async () => {
    mocks.identity = { status: "ready", profile: { user_id: "invitee" } };
    mocks.accept.mockResolvedValue({ session_id: "generated-session" });
    render(<TogetherInvitePage token="secure-token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Join Ethan" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith("secure-token"));
    expect(mocks.replace).toHaveBeenCalledWith("/together/session/generated-session");
  });

  it("resumes an explicit Join after authentication", async () => {
    mocks.identity = { status: "ready", profile: { user_id: "invitee" } };
    mocks.accept.mockResolvedValue({ session_id: "generated-session" });
    render(<TogetherInvitePage token="secure-token" autoJoin />);
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith("/together/session/generated-session");
  });

  it("does not offer Join for the initiator's own invitation", async () => {
    mocks.identity = { status: "ready", profile: { user_id: "initiator" } };
    mocks.fetch.mockResolvedValue({
      status: "pending",
      initiator: { display_name: "Ethan", username: "ethan", avatar_url: null },
      expires_at: "2026-09-11T00:00:00Z",
      is_own_invite: true,
    });
    render(<TogetherInvitePage token="secure-token" autoJoin />);
    expect(await screen.findByText("This is your own Fiyu Together invite.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Join/ })).toBeNull();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("turns the initiator's own invite into a way to pass it on", async () => {
    mocks.identity = { status: "ready", profile: { user_id: "initiator" } };
    mocks.fetch.mockResolvedValue({
      status: "pending",
      initiator: { display_name: "Ethan", username: "ethan", avatar_url: null },
      expires_at: "2026-09-11T00:00:00Z",
      is_own_invite: true,
    });
    render(<TogetherInvitePage token="secure-token" />);
    expect(await screen.findByText("Send it to someone else to get started.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share invite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Return to Fiyu" }).getAttribute("href")).toBe("/profile");
    // Not an error: nothing failed, so nothing is announced as a failure.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders invalid invitations without exposing account actions", async () => {
    mocks.fetch.mockResolvedValue({ status: "invalid", initiator: null, expires_at: null });
    render(<TogetherInvitePage token="invalid-token" />);
    expect(await screen.findByText("This invitation is no longer available.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in to join" })).toBeNull();
  });
});
