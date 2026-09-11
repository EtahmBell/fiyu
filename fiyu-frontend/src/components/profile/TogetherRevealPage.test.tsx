// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherRevealPage } from "@/components/profile/TogetherRevealPage";
import {
  clearTogetherRevealArrival,
  consumeTogetherRevealArrival,
} from "@/lib/profile/togetherRevealArrival";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), reveal: vi.fn(), replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/profile/profileIdentity", () => ({
  useProfileIdentity: () => ({ status: "ready", profile: { user_id: "user-a", username: "ethan", display_name: "Ethan" }, profileImage: null }),
}));
vi.mock("@/lib/api/client", () => ({
  fetchTogetherSession: mocks.fetch,
  revealTogetherSession: mocks.reveal,
}));

const pending = {
  session_id: "session-1", status: "generated", role: "initiator",
  expires_at: "2026-09-11T00:00:00Z", cycle_expires_at: "2026-09-11T00:00:00Z",
  partner: { display_name: "Lianne", username: "lianne", avatar_url: null },
  restaurants: [{ place_id: "one" }, { place_id: "two" }, { place_id: "three" }],
  consumed_trial: true, invite_url: null, revealed_at: null, reveal_pending: true, pick_count: 3,
};

describe("TogetherRevealPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTogetherRevealArrival();
    mocks.fetch.mockResolvedValue(pending);
    mocks.reveal.mockResolvedValue({ ...pending, reveal_pending: false, revealed_at: "2026-09-10T00:00:00Z" });
  });
  afterEach(() => cleanup());

  it("reveals the persisted set once and opens normal Picks", async () => {
    render(<TogetherRevealPage sessionId="session-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal our Picks" }));
    await waitFor(() => expect(mocks.reveal).toHaveBeenCalledWith("session-1"));
    expect(mocks.replace).toHaveBeenCalledWith("/together?session=session-1");
  });

  it("does not replay an already revealed session", async () => {
    mocks.fetch.mockResolvedValue({ ...pending, reveal_pending: false, revealed_at: "2026-09-10T00:00:00Z" });
    render(<TogetherRevealPage sessionId="session-1" />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/together?session=session-1"));
    expect(screen.queryByRole("button", { name: "Reveal our Picks" })).toBeNull();
  });

  it("presents both participants and one action, and no restaurant", async () => {
    render(<TogetherRevealPage sessionId="session-1" />);
    expect(await screen.findByRole("heading", { name: "Ethan × Lianne" })).toBeTruthy();
    expect(screen.getByText("Three places chosen for both of you.")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByTestId("compact-restaurant-card")).toBeNull();
  });

  it("hands the stagger to the hub for this session only", async () => {
    render(<TogetherRevealPage sessionId="session-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal our Picks" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(consumeTogetherRevealArrival("another-session")).toBe(false);
    expect(consumeTogetherRevealArrival("session-1")).toBe(true);
  });

  it("does not pretend a failed reveal succeeded", async () => {
    mocks.reveal.mockRejectedValue(new Error("Together could not be revealed."));
    render(<TogetherRevealPage sessionId="session-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal our Picks" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(consumeTogetherRevealArrival("session-1")).toBe(false);
    expect(screen.getByRole("button", { name: "Reveal our Picks" })).toBeTruthy();
  });
});
