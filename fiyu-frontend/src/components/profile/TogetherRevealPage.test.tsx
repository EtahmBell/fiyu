// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherRevealPage } from "@/components/profile/TogetherRevealPage";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), reveal: vi.fn(), replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/profile/profileIdentity", () => ({
  useProfileIdentity: () => ({ status: "ready", profile: { user_id: "user-a", username: "ethan", display_name: "Ethan" } }),
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
  consumed_trial: true, invite_url: null, revealed_at: null, reveal_pending: true,
};

describe("TogetherRevealPage", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.fetch.mockResolvedValue(pending); mocks.reveal.mockResolvedValue({ ...pending, reveal_pending: false, revealed_at: "2026-09-10T00:00:00Z" }); });
  afterEach(() => cleanup());

  it("reveals the persisted set once and opens normal Picks", async () => {
    render(<TogetherRevealPage sessionId="session-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal our Picks" }));
    await waitFor(() => expect(mocks.reveal).toHaveBeenCalledWith("session-1"));
    expect(mocks.replace).toHaveBeenCalledWith("/picks#together-picks");
  });

  it("does not replay an already revealed session", async () => {
    mocks.fetch.mockResolvedValue({ ...pending, reveal_pending: false, revealed_at: "2026-09-10T00:00:00Z" });
    render(<TogetherRevealPage sessionId="session-1" />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/picks#together-picks"));
    expect(screen.queryByRole("button", { name: "Reveal our Picks" })).toBeNull();
  });
});
