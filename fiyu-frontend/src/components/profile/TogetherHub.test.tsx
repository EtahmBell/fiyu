// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TogetherHub } from "@/components/profile/TogetherHub";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import {
  clearTogetherRevealArrival,
  markTogetherRevealArrival,
} from "@/lib/profile/togetherRevealArrival";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }));
vi.mock("@/lib/profile/profileIdentity", () => ({
  useProfileIdentity: () => ({ status: "ready", profile: { user_id: "user-a", display_name: "Ethan" }, profileImage: null }),
}));
vi.mock("@/lib/lists/useDefaultList", () => ({
  useDefaultList: () => ({ isSaved: () => false, pendingPlaceIds: [], toggle: vi.fn() }),
}));
vi.mock("@/lib/api/client", () => ({
  fetchTogetherState: mocks.fetch,
  createTogetherInvite: vi.fn(),
  rotateTogetherInvite: vi.fn(),
  cancelTogetherInvite: vi.fn(),
  // Reached through the restaurant card's photo; never resolves in these cases.
  fetchPhotoPreview: vi.fn().mockResolvedValue(null),
}));

/** jsdom has no media engine; the hub only ever asks about reduced motion. */
function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

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

const session = (id: string, partner: string, revealPending = false, places = 1) => ({
  session_id: id,
  status: "generated" as const,
  role: "initiator" as const,
  expires_at: "2026-09-12T00:00:00Z",
  cycle_expires_at: "2026-09-12T00:00:00Z",
  partner: { display_name: partner, username: null, avatar_url: null },
  restaurants: revealPending
    ? []
    : Array.from({ length: places }, (_, index) => restaurant(`${id}-${index}`)),
  consumed_trial: false,
  invite_url: null,
  revealed_at: revealPending ? null : "2026-09-11T00:00:00Z",
  reveal_pending: revealPending,
  pick_count: revealPending ? 3 : places,
});

const state = (sessions: ReturnType<typeof session>[], overrides = {}) => ({
  rated_visit_count: 5,
  ratings_required: 5,
  premium: true,
  trial_consumed: true,
  can_initiate: true,
  block_reason: null,
  session: sessions[0] ?? null,
  current_sessions: sessions,
  generated_session_count: sessions.length,
  cycle_limit: 3,
  ...overrides,
});

describe("TogetherHub", () => {
  beforeEach(() => {
    clearAccountQueries();
    clearTogetherRevealArrival();
    setReducedMotion(false);
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(state([session("one", "Lianne"), session("two", "Mika")]));
  });
  afterEach(() => cleanup());

  it("switches between multiple partner-specific sets", async () => {
    render(<TogetherHub />);
    expect(await screen.findByText("Place one-0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mika" }));
    expect(await screen.findByText("Place two-0")).toBeTruthy();
    expect(screen.queryByText("Place one-0")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/together?session=two", { scroll: false });
  });

  it("announces which partner is selected without relying on colour", async () => {
    render(<TogetherHub />);
    const lianne = await screen.findByRole("button", { name: "Lianne" });
    const mika = screen.getByRole("button", { name: "Mika" });
    expect(lianne.getAttribute("aria-pressed")).toBe("true");
    expect(mika.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(mika);
    expect(screen.getByRole("button", { name: "Lianne" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Mika" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("directs an unrevealed set to the existing reveal route", async () => {
    mocks.fetch.mockResolvedValue(state([session("hidden", "Aya", true)]));
    render(<TogetherHub />);
    const link = await screen.findByRole("link", { name: "Reveal our Picks →" });
    expect(link.getAttribute("href")).toBe("/together/session/hidden");
  });

  it("keeps every restaurant identity hidden until this participant reveals", async () => {
    mocks.fetch.mockResolvedValue(state([session("hidden", "Aya", true)]));
    render(<TogetherHub />);
    expect(await screen.findByText("Your Picks are ready.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Together with Aya" })).toBeTruthy();
    expect(screen.queryAllByTestId("compact-restaurant-card")).toHaveLength(0);
    expect(screen.queryByText(/^Place /)).toBeNull();
  });

  it("staggers the three Picks once, on the arrival that ends a reveal", async () => {
    mocks.fetch.mockResolvedValue(state([session("one", "Lianne", false, 3)]));
    markTogetherRevealArrival("one");
    const { container } = render(<TogetherHub initialSessionId="one" />);
    await screen.findByText("Place one-0");

    const staggered = [...container.querySelectorAll<HTMLElement>("[data-fiyu-stagger]")];
    expect(staggered).toHaveLength(3);
    expect(staggered.map((element) => element.getAttribute("data-fiyu-stagger")))
      .toEqual(["0", "150", "300"]);
  });

  it("does not replay the reveal for a set that is merely being viewed", async () => {
    mocks.fetch.mockResolvedValue(state([session("one", "Lianne", false, 3)]));
    const { container } = render(<TogetherHub initialSessionId="one" />);
    await screen.findByText("Place one-0");
    expect(container.querySelectorAll("[data-fiyu-stagger]")).toHaveLength(0);
  });

  it("shows all three Picks at once under reduced motion", async () => {
    setReducedMotion(true);
    mocks.fetch.mockResolvedValue(state([session("one", "Lianne", false, 3)]));
    markTogetherRevealArrival("one");
    const { container } = render(<TogetherHub initialSessionId="one" />);
    await screen.findByText("Place one-0");

    expect(screen.getAllByTestId("compact-restaurant-card")).toHaveLength(3);
    expect(container.querySelectorAll("[data-fiyu-stagger]")).toHaveLength(0);
  });

  it("offers the feature rather than a blank page when the cycle has no Together", async () => {
    mocks.fetch.mockResolvedValue(state([]));
    render(<TogetherHub />);
    expect(await screen.findByRole("button", { name: "Start Together" })).toBeTruthy();
    expect(screen.getByText("Three Picks, chosen around your shared taste.")).toBeTruthy();
  });

  it("states the cycle cap as a fact instead of offering another Together", async () => {
    mocks.fetch.mockResolvedValue(
      state([session("one", "Lianne"), session("two", "Mika"), session("three", "Val")], {
        can_initiate: false,
        block_reason: "cycle_limit_reached",
      }),
    );
    render(<TogetherHub />);
    expect(await screen.findByText("That’s every Together for this cycle. New Picks bring new ones."))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start another/ })).toBeNull();
  });
});
