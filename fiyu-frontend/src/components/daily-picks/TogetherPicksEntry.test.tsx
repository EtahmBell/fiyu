// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherPicksEntry } from "@/components/daily-picks/TogetherPicksEntry";
import type { TogetherSession, TogetherState } from "@/lib/api/schemas";

const api = vi.hoisted(() => ({ createTogetherInvite: vi.fn() }));
vi.mock("@/lib/api/client", () => api);

const base: TogetherState = {
  rated_visit_count: 8,
  ratings_required: 5,
  premium: true,
  trial_consumed: true,
  can_initiate: true,
  block_reason: null,
  session: null,
  current_sessions: [],
  generated_session_count: 0,
  cycle_limit: 3,
};

const session = (id: string, partner: string, revealPending = false): TogetherSession => ({
  session_id: id,
  status: "generated",
  role: "initiator",
  expires_at: "2026-09-12T00:00:00Z",
  cycle_expires_at: "2026-09-12T00:00:00Z",
  partner: { display_name: partner, username: null, avatar_url: null },
  restaurants: [],
  consumed_trial: false,
  invite_url: null,
  revealed_at: revealPending ? null : "2026-09-11T00:00:00Z",
  reveal_pending: revealPending,
  pick_count: 3,
});

describe("TogetherPicksEntry", () => {
  beforeEach(() => {
    api.createTogetherInvite.mockReset().mockResolvedValue({
      session: { ...session("pending", "Nobody"), status: "pending", partner: null, pick_count: 0 },
      invite_url: "https://fiyu.example/together/invite-token",
    });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });
  afterEach(() => cleanup());

  it("creates the canonical invitation and copies its share link", async () => {
    render(<TogetherPicksEntry state={{ ...base, premium: false, trial_consumed: false }} />);
    expect(screen.getByText("Find three Picks with someone.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Invite someone/ }));
    await waitFor(() => expect(api.createTogetherInvite).toHaveBeenCalledTimes(1));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://fiyu.example/together/invite-token");
    expect(await screen.findByText("Invite link copied.")).toBeTruthy();
  });

  it("uses Web Share when the browser supports it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<TogetherPicksEntry state={base} />);
    fireEvent.click(screen.getByRole("button", { name: /Invite someone/ }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({
      title: "Fiyu Together",
      text: "Find three Fiyu Picks with me.",
      url: "https://fiyu.example/together/invite-token",
    }));
    expect(screen.getByText("Invite ready to share.")).toBeTruthy();
  });

  it("summarises one partner without listing the shared Picks", () => {
    render(<TogetherPicksEntry state={{ ...base, current_sessions: [session("a", "Lianne")] }} />);
    expect(screen.getByText("Lianne")).toBeTruthy();
    expect(screen.getByText("3 Picks together")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View/ }).getAttribute("href")).toBe("/together");
  });

  it("keeps several partners on one line rather than one entry each", () => {
    render(
      <TogetherPicksEntry
        state={{
          ...base,
          current_sessions: [session("a", "Lianne"), session("b", "Val"), session("c", "Miku")],
          can_initiate: false,
          block_reason: "cycle_limit_reached",
        }}
      />,
    );
    expect(screen.getByText("Lianne · Val · Miku")).toBeTruthy();
    expect(screen.getByText("3 Togethers")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    // Picks is not where a countdown is acted on; expiry stays in the hub.
    expect(screen.queryByText(/[Ee]xpir/)).toBeNull();
  });

  it("groups two active rounds with the same partner into one concise summary", () => {
    render(
      <TogetherPicksEntry
        state={{ ...base, current_sessions: [session("new", "Lianne"), session("old", "Lianne")] }}
      />,
    );
    expect(screen.getByText("Lianne")).toBeTruthy();
    expect(screen.getByText("6 active Picks")).toBeTruthy();
  });

  it("sends an unopened set straight to its one-time reveal", () => {
    render(
      <TogetherPicksEntry
        state={{ ...base, current_sessions: [session("ready", "Lianne", true)] }}
      />,
    );
    expect(screen.getByText("Your Together with Lianne is ready")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Reveal/ }).getAttribute("href"))
      .toBe("/together/session/ready");
  });

  it("states a pending invitation as waiting rather than loading", () => {
    render(
      <TogetherPicksEntry
        state={{
          ...base,
          can_initiate: false,
          session: { ...session("pending", "Nobody"), status: "pending", partner: null, pick_count: 0 },
        }}
      />,
    );
    expect(screen.getByText("Waiting for someone to join")).toBeTruthy();
  });

  it("reports an honest lock without offering a dead action", () => {
    render(
      <TogetherPicksEntry
        state={{
          ...base,
          rated_visit_count: 3,
          premium: false,
          can_initiate: false,
          block_reason: "ratings_required",
        }}
      />,
    );
    expect(screen.getByText("Review 2 more restaurants to unlock.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not surface premature Premium copy once the trial is spent", () => {
    render(
      <TogetherPicksEntry
        state={{
          ...base,
          premium: false,
          trial_consumed: true,
          can_initiate: false,
          block_reason: "premium_required",
        }}
      />,
    );
    expect(screen.queryByText("Available with Fiyu Premium.")).toBeNull();
    expect(screen.getByText("Find three Picks with someone.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Invite someone/ })).toBeTruthy();
  });
});
