// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TogetherPicksEntry } from "@/components/daily-picks/TogetherPicksEntry";
import type { TogetherSession, TogetherState } from "@/lib/api/schemas";

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
  afterEach(() => cleanup());

  it("invites a first Together when none exists this cycle", () => {
    render(<TogetherPicksEntry state={{ ...base, premium: false, trial_consumed: false }} />);
    expect(screen.getByText("Find three Picks with someone.")).toBeTruthy();
    expect(screen.getByText("Your first Together is included.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start Together/ }).getAttribute("href")).toBe("/together");
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
    expect(screen.getByText("Rate 2 more visits to unlock.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("names Premium plainly once the trial is spent", () => {
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
    expect(screen.getByText("Available with Fiyu Premium.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
