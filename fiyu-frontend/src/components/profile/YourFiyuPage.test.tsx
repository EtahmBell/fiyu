// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YourFiyuPage } from "@/components/profile/YourFiyuPage";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import type { UserFiyuSummary } from "@/lib/api/schemas";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

const api = vi.hoisted(() => ({ fetchUserFiyuSummary: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  fetchUserFiyuSummary: api.fetchUserFiyuSummary,
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
    taste_unlock_threshold: 5,
    taste_unlocked: false,
    top_cuisines: [],
    usual_budget: null,
    top_areas: [],
    top_traits: [],
    recent_visits: [],
    ...overrides,
  };
}

beforeEach(() => {
  clearAccountQueries();
  clearProfileIdentity();
  api.fetchUserFiyuSummary.mockReset();
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
    expect(screen.getByText("Rate your first 5 visits to unlock personalized insights.")).toBeTruthy();
    expect(screen.getByText("Rate your first 5 visits to unlock Fiyu Together.")).toBeTruthy();
    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.getByText("No visits logged yet")).toBeTruthy();
    expect(screen.queryByText("Developer tools")).toBeNull();
    expect(api.fetchUserFiyuSummary).toHaveBeenCalledTimes(1);
  });

  it("shows exact progress while four rated visits remain locked", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      visited_count: 4,
      area_count: 2,
      rated_visit_count: 4,
    }));

    render(<YourFiyuPage />);

    expect(await screen.findByText("Rate 1 more visit to unlock your first taste insights.")).toBeTruthy();
    expect(screen.getByText("Rate 1 more visit to unlock Fiyu Together.")).toBeTruthy();
    expect(screen.getAllByText("4/5")).toHaveLength(2);
    expect(screen.queryByText("You rate highest")).toBeNull();
  });

  it("unlocks only evidence-backed insights and renders private recent-visit context", async () => {
    api.fetchUserFiyuSummary.mockResolvedValue(summary({
      visited_count: 7,
      saved_count: 3,
      area_count: 3,
      rated_visit_count: 5,
      taste_unlocked: true,
      top_cuisines: ["Sushi", "French"],
      usual_budget: "¥5,000–¥10,000",
      top_areas: ["Ginza", "Ueno"],
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

    expect(await screen.findByText("Sushi · French")).toBeTruthy();
    expect(screen.getByText("¥5,000–¥10,000")).toBeTruthy();
    expect(screen.getByText("Ginza · Ueno")).toBeTruthy();
    expect(screen.getByRole("link", { name: "鮨 海" }).getAttribute("href")).toBe("/restaurants/place-1");
    expect(screen.getByLabelText("5 out of 5 stars")).toBeTruthy();
    expect(screen.getByText("Order the seasonal nigiri again.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all →" }).getAttribute("href")).toBe("/log/history");
    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.queryByText("Locked")).toBeNull();
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
