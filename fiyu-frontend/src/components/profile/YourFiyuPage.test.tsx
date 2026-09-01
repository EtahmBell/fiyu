// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YourFiyuPage } from "@/components/profile/YourFiyuPage";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import type { UserFiyuSummary } from "@/lib/api/schemas";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

const api = vi.hoisted(() => ({
  fetchUserFiyuSummary: vi.fn(),
  acknowledgeTasteUpdate: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  fetchUserFiyuSummary: api.fetchUserFiyuSummary,
  acknowledgeTasteUpdate: api.acknowledgeTasteUpdate,
}));

const profile = {
  user_id: "account-a",
  username: "ethan",
  display_name: "Ethan Bell",
  bio: "Quiet Tokyo tables and late dinners.",
  avatar_url: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

function summary(overrides: Partial<UserFiyuSummary> = {}): UserFiyuSummary {
  return {
    visited_count: 0,
    saved_count: 0,
    area_count: 0,
    rated_visit_count: 0,
    together_unlock_threshold: 5,
    together_unlocked: false,
    taste_unlock_threshold: 10,
    taste_unlocked: false,
    taste_current_milestone: null,
    taste_previous_milestone: null,
    taste_next_milestone: 10,
    ratings_until_next_taste_update: 10,
    taste_insights: [],
    taste_tags: [],
    taste_has_unseen_update: false,
    taste_uniqueness: null,
    recent_visits: [],
    ...overrides,
  };
}

beforeEach(() => {
  clearAccountQueries();
  clearProfileIdentity();
  api.fetchUserFiyuSummary.mockReset();
  api.acknowledgeTasteUpdate.mockReset();
  api.acknowledgeTasteUpdate.mockResolvedValue(10);
  publishProfileIdentity(profile);
});

afterEach(() => {
  cleanup();
  clearAccountQueries();
  clearProfileIdentity();
  vi.restoreAllMocks();
});

describe("YourFiyuPage", () => {
  it("renders a real zero-state hub without fake taste insights", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary());

    render(<YourFiyuPage />);

    expect(await screen.findByRole("heading", { name: "Ethan Bell" })).toBeTruthy();
    expect(screen.getByText("Quiet Tokyo tables and late dinners.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit profile" }).getAttribute("href")).toBe("/profile/edit");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/profile/settings");
    expect(screen.getAllByText("0")).toHaveLength(3);
    expect(screen.getByText("Rate your first 10 visits to unlock your first taste insights.")).toBeTruthy();
    expect(screen.getByText("Rate your first 5 visits to unlock Fiyu Together.")).toBeTruthy();
    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.getByText("No visits logged yet")).toBeTruthy();
    expect(screen.queryByText("Developer tools")).toBeNull();
    expect(api.fetchUserFiyuSummary).toHaveBeenCalledTimes(1);
  });

  it("keeps Together at five while Taste shows progress toward ten", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      visited_count: 4,
      area_count: 2,
      rated_visit_count: 4,
    }));

    render(<YourFiyuPage />);

    expect(await screen.findByText("Rate 6 more visits to unlock your first taste insights.")).toBeTruthy();
    expect(screen.getByText("Rate 1 more visit to unlock Fiyu Together.")).toBeTruthy();
    expect(screen.getByText("4/10")).toBeTruthy();
    expect(screen.getByText("4/5")).toBeTruthy();
  });

  it("unlocks only evidence-backed insights and renders private recent-visit context", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      visited_count: 7,
      saved_count: 3,
      area_count: 3,
      rated_visit_count: 12,
      together_unlocked: true,
      taste_unlocked: true,
      taste_current_milestone: 10,
      taste_next_milestone: 15,
      ratings_until_next_taste_update: 3,
      taste_tags: [{ key: "counter_seating", label: "Counter spots" }],
      taste_insights: [{
        id: "strong_signal:counter_seating",
        type: "strong_signal",
        facet_key: "counter_seating",
        headline: "Counter spots keep landing well",
        supporting_text: "You rate these 0.6★ above your 4.0★ average.",
        support_count: 4,
        average_rating: 4.6,
        delta_from_user_average: 0.6,
        change_status: null,
      }],
      recent_visits: [{
        id: "visit-1",
        place_id: "place-1",
        name_ja: "鮨 海",
        name_en: "Sushi Umi",
        area: "Ginza",
        visited_at: "2026-08-20T12:00:00Z",
        rating: 5,
        private_note_excerpt: "Order the seasonal nigiri again.",
      }],
    }));

    render(<YourFiyuPage />);

    expect(await screen.findByText("Counter spots keep landing well")).toBeTruthy();
    expect(screen.getByText("Counter spots")).toBeTruthy();
    expect(screen.getByText("3 more ratings until your next Taste update.")).toBeTruthy();
    expect(screen.getByText("12/15")).toBeTruthy();
    expect(screen.getByRole("link", { name: "鮨 海" }).getAttribute("href")).toBe("/restaurants/place-1");
    expect(screen.getByLabelText("5 out of 5 stars")).toBeTruthy();
    expect(screen.getByText("Order the seasonal nigiri again.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all →" }).getAttribute("href")).toBe("/log/history");
    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.queryByText("Locked")).toBeNull();
  });

  it("acknowledges a new milestone once and presents change labels", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      rated_visit_count: 15,
      together_unlocked: true,
      taste_unlocked: true,
      taste_current_milestone: 15,
      taste_previous_milestone: 10,
      taste_next_milestone: 20,
      ratings_until_next_taste_update: 5,
      taste_has_unseen_update: true,
      taste_tags: [{ key: "seasonal", label: "Seasonal cooking" }],
      taste_insights: [{
        id: "strong_signal:seasonal",
        type: "strong_signal",
        facet_key: "seasonal",
        headline: "Seasonal cooking keeps landing well",
        supporting_text: "You rate these 0.5★ above your 4.0★ average.",
        support_count: 4,
        average_rating: 4.5,
        delta_from_user_average: 0.5,
        change_status: "new",
      }],
    }));

    render(<YourFiyuPage />);

    expect(await screen.findByText("Seasonal cooking keeps landing well")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    await waitFor(() => expect(api.acknowledgeTasteUpdate).toHaveBeenCalledWith(15));
    expect(api.acknowledgeTasteUpdate).toHaveBeenCalledTimes(1);
  });

  it("replaces one account summary with another without exposing cached private data", async () => {
    api.fetchUserFiyuSummary
      .mockResolvedValueOnce(summary({ visited_count: 2, recent_visits: [{
        id: "private-a",
        place_id: "place-a",
        name_ja: null,
        name_en: "Account A Place",
        area: "Ginza",
        visited_at: "2026-08-20T12:00:00Z",
        rating: 4,
        private_note_excerpt: "Account A note",
      }] }))
      .mockResolvedValueOnce(summary());
    const rendered = render(<YourFiyuPage />);
    expect(await screen.findByText("Account A note")).toBeTruthy();

    act(() => publishProfileIdentity({ ...profile, user_id: "account-b", username: "other", display_name: "Other User" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Other User" })).toBeTruthy());
    await waitFor(() => expect(api.fetchUserFiyuSummary).toHaveBeenCalledTimes(2));
    expect(rendered.queryByText("Account A note")).toBeNull();
    expect(screen.getByText("No visits logged yet")).toBeTruthy();
  });
});
