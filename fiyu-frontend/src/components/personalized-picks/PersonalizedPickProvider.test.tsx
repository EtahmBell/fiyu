// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PersonalizedPickProvider,
  usePersonalizedPick,
} from "@/components/personalized-picks/PersonalizedPickProvider";
import { publicRestaurantSchema, type PersonalizedPickState } from "@/lib/api/schemas";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";
import restaurantFixture from "@/test/fixtures/restaurants.json";

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  create: vi.fn(),
  dismiss: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  fetchPersonalizedPickState: api.fetch,
  createPersonalizedPickEvent: api.create,
  dismissPersonalizedPickEvent: api.dismiss,
  selectPersonalizedPick: api.select,
}));
vi.mock("@/components/restaurant/RestaurantPhoto", () => ({
  RestaurantPhoto: () => <div data-testid="photo" />,
}));

const restaurant = publicRestaurantSchema.parse(restaurantFixture[0]);
const available: PersonalizedPickState = {
  status: "event_available",
  qualifying_rating_count: 10,
  unlock_threshold: 10,
  event_eligible: false,
  event_id: "event-a",
  card_count: 3,
  created_at: "2026-10-11T00:00:00Z",
  expires_at: "2026-10-18T00:00:00Z",
  dismissed_until: null,
  dismissal_count: 0,
  selected_position: null,
  selected_at: null,
  active_until: null,
  selected_restaurant: null,
};
const selected: PersonalizedPickState = {
  ...available,
  status: "selected",
  card_count: null,
  selected_position: 1,
  selected_at: "2026-10-11T00:01:00Z",
  active_until: "2099-10-14T00:01:00Z",
  selected_restaurant: restaurant,
};

function StateProbe() {
  const { state } = usePersonalizedPick();
  return <output>{state?.status ?? "none"}</output>;
}

beforeEach(() => {
  clearProfileIdentity();
  publishProfileIdentity({
    user_id: "account-a",
    username: "ethan",
    display_name: "Ethan",
    bio: null,
    avatar_url: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  });
  for (const mock of Object.values(api)) mock.mockReset();
});

afterEach(() => {
  cleanup();
  clearProfileIdentity();
});

describe("PersonalizedPickProvider", () => {
  it("creates the initial eligible event once and presents its stable hidden cards", async () => {
    api.fetch.mockResolvedValue({
      ...available,
      status: "unlocked_idle",
      event_id: null,
      card_count: null,
      event_eligible: true,
    });
    api.create.mockResolvedValue(available);
    render(<PersonalizedPickProvider><StateProbe /></PersonalizedPickProvider>);
    expect(await screen.findByRole("dialog", { name: "Something for you" })).toBeTruthy();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: /Choose hidden card/ })).toHaveLength(3);
  });

  it("dismisses without consuming and selection becomes the canonical active Pick", async () => {
    api.fetch.mockResolvedValue(available);
    api.dismiss.mockResolvedValue({
      ...available,
      dismissed_until: "2099-10-12T00:00:00Z",
      dismissal_count: 1,
    });
    let rendered = render(<PersonalizedPickProvider><StateProbe /></PersonalizedPickProvider>);
    await screen.findByRole("dialog", { name: "Something for you" });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.dismiss).toHaveBeenCalledWith("event-a");

    cleanup();
    api.fetch.mockResolvedValue(available);
    api.select.mockResolvedValue(selected);
    rendered = render(<PersonalizedPickProvider><StateProbe /></PersonalizedPickProvider>);
    await screen.findByRole("dialog", { name: "Something for you" });
    fireEvent.click(screen.getByRole("button", { name: "Choose hidden card 2" }));
    expect(await screen.findByRole("heading", { name: "浜田山叙々苑" })).toBeTruthy();
    expect(api.select).toHaveBeenCalledWith("event-a", 1);
    expect(screen.getByText("selected")).toBeTruthy();
    rendered.unmount();
  });

  it("restores a selected event on refresh without re-presenting the choice modal", async () => {
    api.fetch.mockResolvedValue(selected);
    render(<PersonalizedPickProvider><StateProbe /></PersonalizedPickProvider>);
    expect(await screen.findByText("selected")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
  });
});
