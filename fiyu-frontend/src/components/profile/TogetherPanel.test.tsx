// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherPanel } from "@/components/profile/TogetherPanel";
import { cancelTogetherInvite, createTogetherInvite, fetchTogetherState } from "@/lib/api/client";
import { clearAccountQueries } from "@/lib/accountQueryCache";

vi.mock("@/lib/api/client", () => ({
  fetchTogetherState: vi.fn(), createTogetherInvite: vi.fn(),
  rotateTogetherInvite: vi.fn(), cancelTogetherInvite: vi.fn(),
}));

const base = {
  rated_visit_count: 5, ratings_required: 5, premium: false,
  trial_consumed: false, can_initiate: true, block_reason: null, session: null,
} as const;

describe("TogetherPanel", () => {
  beforeEach(() => {
    clearAccountQueries();
    vi.clearAllMocks();
    vi.mocked(fetchTogetherState).mockResolvedValue(base);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => cleanup());

  it("shows rating progress while initiation is locked", async () => {
    vi.mocked(fetchTogetherState).mockResolvedValue({ ...base, rated_visit_count: 3, can_initiate: false, block_reason: "ratings_required" });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByText("Rate 2 more visits to unlock Fiyu Together.")).toBeTruthy();
  });

  it("shows the honest Premium lock after the lifetime trial is used", async () => {
    vi.mocked(fetchTogetherState).mockResolvedValue({
      ...base,
      trial_consumed: true,
      can_initiate: false,
      block_reason: "premium_required",
    });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByText("Available with Fiyu Premium")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start/ })).toBeNull();
  });

  it("allows a Premium member to initiate without trial copy", async () => {
    vi.mocked(fetchTogetherState).mockResolvedValue({ ...base, premium: true });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByRole("button", { name: "Start a Together" })).toBeTruthy();
    expect(screen.queryByText("Your first completed Together is included.")).toBeNull();
  });

  it("links an active session to its separate Picks section", async () => {
    vi.mocked(fetchTogetherState).mockResolvedValue({ ...base, can_initiate: false, block_reason: "cycle_quota_used", session: {
      session_id: "session-1", status: "generated", role: "initiator",
      expires_at: "2026-09-10T00:00:00Z", cycle_expires_at: "2026-09-10T00:00:00Z",
      partner: { display_name: "Lianne", username: "lianne", avatar_url: null },
      restaurants: [], consumed_trial: true, invite_url: null,
    } });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByText("Together with Lianne")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View Together Picks →" }).getAttribute("href"))
      .toBe("/picks#together-picks");
  });

  it("creates one pending invite without presenting it as consumed", async () => {
    vi.mocked(createTogetherInvite).mockResolvedValue({
      invite_url: "https://fiyu.app/together/secure-token",
      session: {
        session_id: "session-1", status: "pending", role: "initiator",
        expires_at: "2026-09-10T00:00:00Z", cycle_expires_at: "2026-09-10T00:00:00Z",
        partner: null, restaurants: [], consumed_trial: false,
        invite_url: "https://fiyu.app/together/secure-token",
      },
    });
    render(<TogetherPanel accountId="account-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Start your first Together" }));
    expect(await screen.findByText("Waiting for someone to join")).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://fiyu.app/together/secure-token");
  });

  it("cancels a pending invite without claiming trial use", async () => {
    vi.mocked(fetchTogetherState)
      .mockResolvedValueOnce({ ...base, can_initiate: false, session: {
        session_id: "session-1", status: "pending", role: "initiator",
        expires_at: "2026-09-10T00:00:00Z", cycle_expires_at: "2026-09-10T00:00:00Z",
        partner: null, restaurants: [], consumed_trial: false, invite_url: null,
      } })
      .mockResolvedValueOnce(base);
    vi.mocked(cancelTogetherInvite).mockResolvedValue(undefined);
    render(<TogetherPanel accountId="account-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelTogetherInvite).toHaveBeenCalledWith("session-1"));
    expect(await screen.findByText("Invitation cancelled. Your trial was not used.")).toBeTruthy();
  });
});
// @vitest-environment jsdom
