// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherHub } from "@/components/profile/TogetherHub";
import { clearAccountQueries } from "@/lib/accountQueryCache";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }));
vi.mock("@/lib/profile/profileIdentity", () => ({
  useProfileIdentity: () => ({ status: "ready", profile: { user_id: "user-a", display_name: "Ethan" } }),
}));
vi.mock("@/lib/lists/useDefaultList", () => ({
  useDefaultList: () => ({ isSaved: () => false, pendingPlaceIds: [], toggle: vi.fn() }),
}));
vi.mock("@/lib/api/client", () => ({
  fetchTogetherState: mocks.fetch,
  createTogetherInvite: vi.fn(),
}));

const restaurant = (placeId: string) => ({
  place_id: placeId,
  name_ja: `店 ${placeId}`,
  name_en: `Place ${placeId}`,
  category: "Sushi",
  fiyu_score: 8.2,
  food_tags: [],
  signature_dishes: [],
  card_description: null,
  description_en: "A concise restaurant description.",
  budget: null,
});

const session = (id: string, partner: string, revealPending = false) => ({
  session_id: id,
  status: "generated" as const,
  role: "initiator" as const,
  expires_at: "2026-09-12T00:00:00Z",
  cycle_expires_at: "2026-09-12T00:00:00Z",
  partner: { display_name: partner, username: null, avatar_url: null },
  restaurants: revealPending ? [] : [restaurant(`${id}-place`)],
  consumed_trial: false,
  invite_url: null,
  revealed_at: revealPending ? null : "2026-09-11T00:00:00Z",
  reveal_pending: revealPending,
  pick_count: revealPending ? 3 : 1,
});

describe("TogetherHub", () => {
  beforeEach(() => {
    clearAccountQueries();
    vi.clearAllMocks();
    const first = session("one", "Lianne");
    const second = session("two", "Mika");
    mocks.fetch.mockResolvedValue({
      rated_visit_count: 5,
      ratings_required: 5,
      premium: true,
      trial_consumed: true,
      can_initiate: true,
      block_reason: null,
      session: first,
      current_sessions: [first, second],
      generated_session_count: 2,
      cycle_limit: 3,
    });
  });
  afterEach(() => cleanup());

  it("switches between multiple partner-specific sets", async () => {
    render(<TogetherHub />);
    expect(await screen.findByText("Place one-place")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mika" }));
    expect(await screen.findByText("Place two-place")).toBeTruthy();
    expect(screen.queryByText("Place one-place")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/together?session=two", { scroll: false });
  });

  it("directs an unrevealed set to the existing reveal route", async () => {
    const hidden = session("hidden", "Aya", true);
    mocks.fetch.mockResolvedValue({
      rated_visit_count: 5, ratings_required: 5, premium: true, trial_consumed: true,
      can_initiate: true, block_reason: null, session: hidden,
      current_sessions: [hidden], generated_session_count: 1, cycle_limit: 3,
    });
    render(<TogetherHub />);
    const link = await screen.findByRole("link", { name: "Reveal our Picks →" });
    expect(link.getAttribute("href")).toBe("/together/session/hidden");
  });
});
