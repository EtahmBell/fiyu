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
    taste_type: null,
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
    expect(screen.getByRole("heading", { name: "Your taste is taking shape." })).toBeTruthy();
    expect(screen.getByText("Rate your first 10 visits to unlock your first Taste.")).toBeTruthy();
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

    expect(await screen.findByText("Rate 6 more visits to unlock your first Taste.")).toBeTruthy();
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
        confidence: "strong",
        direction: "positive",
        headline: "Counter spots keep landing well",
        description: "Counter spots continue to turn up among your better restaurant experiences.",
        supporting_text: "You rate these 0.6★ above your 4.0★ average.",
        support_count: 4,
        average_rating: 4.6,
        delta_from_user_average: 0.6,
        save_affinity: 0.25,
        visit_affinity: 0.5,
        evidence_summary: "You rate these 0.6★ above your 4.0★ average.",
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
    expect(screen.getByText("Counter spots continue to turn up among your better restaurant experiences.")).toBeTruthy();
    expect(screen.queryByText("You rate these 0.6★ above your 4.0★ average.")).toBeNull();
    expect(screen.getByText("Strong signal")).toBeTruthy();
    expect(screen.getByText("Counter spots")).toBeTruthy();
    const insight = screen.getByText("Counter spots keep landing well");
    const tags = screen.getByLabelText("Your Taste right now");
    expect(insight.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("3 more ratings")).toBeTruthy();
    expect(screen.getByText("12 → 15")).toBeTruthy();
    expect(screen.queryByText("Your Fiyu type")).toBeNull();
    expect(screen.getByRole("link", { name: "鮨 海" }).getAttribute("href")).toBe("/restaurants/place-1");
    expect(screen.getByLabelText("5 out of 5 stars")).toBeTruthy();
    expect(screen.getByText("Order the seasonal nigiri again.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all →" }).getAttribute("href")).toBe("/log/history");
    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.queryByText("Locked")).toBeNull();
  });

  it("labels limited first-snapshot evidence as an early signal", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      rated_visit_count: 10,
      together_unlocked: true,
      taste_unlocked: true,
      taste_current_milestone: 10,
      taste_next_milestone: 15,
      ratings_until_next_taste_update: 5,
      taste_insights: [{
        id: "early_signal:rating_balance",
        type: "early_signal",
        facet_key: "rating_balance",
        confidence: "early",
        direction: "neutral",
        headline: "Your first ratings are balanced",
        description: "Positive, neutral, and lower reactions all appear in your first Taste snapshot.",
        supporting_text: "Your first 10 ratings mix positive, neutral, and lower reactions.",
        support_count: 10,
        average_rating: 3.2,
        delta_from_user_average: 0,
        save_affinity: 0,
        visit_affinity: 0,
        evidence_summary: "Your first 10 ratings mix positive, neutral, and lower reactions.",
        change_status: null,
      }],
    }));

    render(<YourFiyuPage />);

    expect(await screen.findByText("Early signal")).toBeTruthy();
    expect(screen.getByText("Based on 10 rated visits")).toBeTruthy();
    expect(screen.queryByText(/still taking shape/i)).toBeNull();
    expect(screen.getByText("Every rating helps Fiyu understand your taste.")).toBeTruthy();
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
        confidence: "strong",
        direction: "positive",
        headline: "Seasonal cooking keeps landing well",
        description: "Seasonal cooking continues to turn up among your better restaurant experiences.",
        supporting_text: "You rate these 0.5★ above your 4.0★ average.",
        support_count: 4,
        average_rating: 4.5,
        delta_from_user_average: 0.5,
        save_affinity: 0,
        visit_affinity: 0,
        evidence_summary: "You rate these 0.5★ above your 4.0★ average.",
        change_status: "new",
      }],
    }));

    render(<YourFiyuPage />);

    expect(await screen.findByText("Seasonal cooking keeps landing well")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    await waitFor(() => expect(api.acknowledgeTasteUpdate).toHaveBeenCalledWith(15));
    expect(api.acknowledgeTasteUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders an acknowledged Taste statically, without replaying the reveal", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      rated_visit_count: 15,
      together_unlocked: true,
      taste_unlocked: true,
      taste_current_milestone: 15,
      taste_previous_milestone: 10,
      taste_next_milestone: 20,
      ratings_until_next_taste_update: 5,
      taste_has_unseen_update: false,
      taste_tags: [{ key: "seasonal", label: "Seasonal cooking" }],
      taste_insights: [{
        id: "strong_signal:seasonal",
        type: "strong_signal",
        facet_key: "seasonal",
        confidence: "strong",
        direction: "positive",
        headline: "Seasonal cooking keeps landing well",
        description: "Seasonal cooking continues to turn up among your better restaurant experiences.",
        supporting_text: "You rate these 0.5★ above your 4.0★ average.",
        support_count: 4,
        average_rating: 4.5,
        delta_from_user_average: 0.5,
        save_affinity: 0,
        visit_affinity: 0,
        evidence_summary: "You rate these 0.5★ above your 4.0★ average.",
        change_status: "still_true",
      }],
    }));

    render(<YourFiyuPage />);

    const headline = await screen.findByText("Seasonal cooking keeps landing well");
    expect(headline.closest("li")?.className).toContain("opacity-100");
    expect(screen.queryByText("Your Taste just updated")).toBeNull();
    expect(api.acknowledgeTasteUpdate).not.toHaveBeenCalled();
  });

  it("shows a Fiyu type only once the API supplies one", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      rated_visit_count: 20,
      together_unlocked: true,
      taste_unlocked: true,
      taste_current_milestone: 20,
      taste_next_milestone: 25,
      ratings_until_next_taste_update: 5,
      taste_type: {
        name: "The Neighbourhood Explorer",
        description: "You keep finding the good table two streets off the main run.",
        unlocked_at_rating_count: 20,
        version: "v1",
      },
    }));

    render(<YourFiyuPage />);

    expect(await screen.findByText("Your Fiyu type")).toBeTruthy();
    expect(screen.getByText("The Neighbourhood Explorer")).toBeTruthy();
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
