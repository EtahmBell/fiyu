// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherPanel } from "@/components/profile/TogetherPanel";
import { cancelTogetherInvite, createTogetherInvite, fetchTogetherState } from "@/lib/api/client";
import type { TogetherSession, TogetherState } from "@/lib/api/schemas";
import { clearAccountQueries } from "@/lib/accountQueryCache";

vi.mock("@/lib/api/client", () => ({
  fetchTogetherState: vi.fn(), createTogetherInvite: vi.fn(),
  rotateTogetherInvite: vi.fn(), cancelTogetherInvite: vi.fn(),
}));

const base: TogetherState = {
  rated_visit_count: 5, ratings_required: 5, premium: false,
  trial_consumed: false, can_initiate: true, block_reason: null, session: null,
  current_sessions: [], generated_session_count: 0, cycle_limit: 3,
};

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
    expect(screen.queryByText("Your first Together is included.")).toBeNull();
  });

  it("links an active session to its separate Picks section", async () => {
    const session: TogetherSession = {
      session_id: "session-1", status: "generated", role: "initiator",
      expires_at: "2026-09-10T00:00:00Z", cycle_expires_at: "2026-09-10T00:00:00Z",
      partner: { display_name: "Lianne", username: "lianne", avatar_url: null },
      restaurants: [], consumed_trial: true, invite_url: null, revealed_at: "2026-09-09T00:00:00Z", reveal_pending: false, pick_count: 3,
    };
    vi.mocked(fetchTogetherState).mockResolvedValue({ ...base, can_initiate: false, block_reason: "premium_required", session, current_sessions: [session], generated_session_count: 1 });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByText("Together with Lianne")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View Together →" }).getAttribute("href"))
      .toBe("/together");
  });

  it("routes an unrevealed generated session to its one-time reveal", async () => {
    const session: TogetherSession = {
      session_id: "session-1", status: "generated", role: "initiator",
      expires_at: "2026-09-11T00:00:00Z", cycle_expires_at: "2026-09-11T00:00:00Z",
      partner: { display_name: "Lianne", username: "lianne", avatar_url: null },
      restaurants: [], consumed_trial: true, invite_url: null, revealed_at: null, reveal_pending: true, pick_count: 3,
    };
    vi.mocked(fetchTogetherState).mockResolvedValue({ ...base, can_initiate: false, block_reason: "premium_required", session, current_sessions: [session], generated_session_count: 1 });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByText("Lianne joined.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reveal our Picks →" }).getAttribute("href"))
      .toBe("/together/session/session-1");
  });

  it("lets an eligible Premium member start another after a generated session", async () => {
    const session: TogetherSession = {
      session_id: "session-1", status: "generated", role: "initiator",
      expires_at: "2026-09-11T00:00:00Z", cycle_expires_at: "2026-09-11T00:00:00Z",
      partner: { display_name: "Lianne", username: "lianne", avatar_url: null },
      restaurants: [], consumed_trial: false, invite_url: null,
      revealed_at: "2026-09-10T00:00:00Z", reveal_pending: false, pick_count: 3,
    };
    vi.mocked(fetchTogetherState).mockResolvedValue({
      ...base, premium: true, can_initiate: true, session,
      current_sessions: [session], generated_session_count: 1,
    });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByRole("button", { name: "Start another" })).toBeTruthy();
  });

  it("summarizes multiple sessions and hides initiation at the cycle cap", async () => {
    const sessions: TogetherSession[] = ["Lianne", "Val", "Miku"].map((displayName, index) => ({
      session_id: `session-${index}`, status: "generated", role: "initiator",
      expires_at: "2026-09-11T00:00:00Z", cycle_expires_at: "2026-09-11T00:00:00Z",
      partner: { display_name: displayName, username: null, avatar_url: null },
      restaurants: [], consumed_trial: false, invite_url: null,
      revealed_at: "2026-09-10T00:00:00Z", reveal_pending: false, pick_count: 3,
    }));
    vi.mocked(fetchTogetherState).mockResolvedValue({
      ...base, premium: true, can_initiate: false, block_reason: "cycle_limit_reached",
      session: sessions[0], current_sessions: sessions, generated_session_count: 3,
    });
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByText("3 active Togethers")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start another" })).toBeNull();
  });

  it("creates one pending invite without presenting it as consumed", async () => {
    vi.mocked(createTogetherInvite).mockResolvedValue({
      invite_url: "https://fiyu.app/together/secure-token",
      session: {
        session_id: "session-1", status: "pending", role: "initiator",
        expires_at: "2026-09-10T00:00:00Z", cycle_expires_at: "2026-09-10T00:00:00Z",
        partner: null, restaurants: [], consumed_trial: false, revealed_at: null, reveal_pending: false, pick_count: 0,
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
        partner: null, restaurants: [], consumed_trial: false, invite_url: null, revealed_at: null, reveal_pending: false, pick_count: 0,
      } })
      .mockResolvedValueOnce(base);
    vi.mocked(cancelTogetherInvite).mockResolvedValue(undefined);
    render(<TogetherPanel accountId="account-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel invitation" }));
    await waitFor(() => expect(cancelTogetherInvite).toHaveBeenCalledWith("session-1"));
    expect(await screen.findByText("Invitation cancelled. Your trial was not used.")).toBeTruthy();
  });

  it("revalidates a pending invitation on focus without visiting Picks", async () => {
    const pending = { ...base, can_initiate: false, session: {
      session_id: "session-1", status: "pending" as const, role: "initiator" as const,
      expires_at: "2026-09-11T00:00:00Z", cycle_expires_at: "2026-09-11T00:00:00Z",
      partner: null, restaurants: [], consumed_trial: false, invite_url: null, revealed_at: null, reveal_pending: false, pick_count: 0,
    } };
    const generatedSession = {
      ...pending.session!, status: "generated" as const,
      partner: { display_name: "Lianne", username: "lianne", avatar_url: null },
      reveal_pending: true, revealed_at: null, pick_count: 3,
    };
    const generated = { ...pending, block_reason: "premium_required" as const, session: generatedSession, current_sessions: [generatedSession], generated_session_count: 1 };
    vi.mocked(fetchTogetherState).mockResolvedValueOnce(pending).mockResolvedValueOnce(generated);
    render(<TogetherPanel accountId="account-a" />);
    expect(await screen.findByText("Waiting for someone to join")).toBeTruthy();
    fireEvent.focus(window);
    expect(await screen.findByText("Lianne joined.")).toBeTruthy();
  });
});
// @vitest-environment jsdom
