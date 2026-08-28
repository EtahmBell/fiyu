// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import type { UserNotification } from "@/lib/api/schemas";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  markOne: vi.fn(),
  markAll: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/api/client", () => ({
  fetchNotifications: api.fetch,
  markNotificationRead: api.markOne,
  markAllNotificationsRead: api.markAll,
}));

const profile = (userId: string) => ({
  user_id: userId,
  username: userId,
  display_name: userId,
  bio: null,
  avatar_url: null,
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
});

const notification = (id: string, title: string): UserNotification => ({
  id,
  type: "new_drop",
  title,
  body: "Fresh Tokyo discoveries are here.",
  target_url: "/picks",
  metadata: null,
  created_at: new Date().toISOString(),
  read_at: null,
});

beforeEach(() => {
  api.fetch.mockReset();
  api.markOne.mockReset();
  api.markAll.mockReset();
  navigation.push.mockReset();
  clearProfileIdentity();
  window.localStorage.setItem("fiyu:next-city-campaign:read:user-a", "1");
  window.localStorage.setItem("fiyu:next-city-campaign:read:user-b", "1");
});

afterEach(() => {
  cleanup();
  clearProfileIdentity();
  vi.restoreAllMocks();
});

describe("in-app notifications menu", () => {
  it("shows the active global city campaign without generating an account notification", async () => {
    window.localStorage.removeItem("fiyu:next-city-campaign:read:user-a");
    api.fetch.mockResolvedValue([]);
    publishProfileIdentity(profile("user-a"));
    render(<NotificationsMenu />);
    fireEvent.click(screen.getByLabelText("Notifications"));

    expect(await screen.findByText("Where should Fiyu go next?")).toBeTruthy();
    expect(screen.getByText("Help choose the next city.")).toBeTruthy();
    expect(screen.queryByText(/Your Picks are ready|New Tokyo Drop/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Where should Fiyu go next/ }));
    expect(screen.getByRole("dialog", { name: "Where should Fiyu go next?" })).toBeTruthy();
    expect(api.markOne).not.toHaveBeenCalled();
  });

  it("shows unread state, marks one read, and follows its safe target", async () => {
    const unread = notification("11111111-1111-4111-8111-111111111111", "New Tokyo Drop");
    api.fetch.mockResolvedValue([unread]);
    api.markOne.mockResolvedValue({ ...unread, read_at: new Date().toISOString() });
    publishProfileIdentity(profile("user-a"));
    render(<NotificationsMenu />);

    expect(await screen.findByText("1 unread notifications")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Notifications"));
    fireEvent.click(screen.getByRole("button", { name: /New Tokyo Drop/ }));

    await waitFor(() => expect(api.markOne).toHaveBeenCalledWith(unread.id));
    expect(navigation.push).toHaveBeenCalledWith("/picks");
    expect(screen.queryByText("1 unread notifications")).toBeNull();
  });

  it("marks all unread notifications read", async () => {
    api.fetch.mockResolvedValue([
      notification("11111111-1111-4111-8111-111111111111", "First"),
      notification("22222222-2222-4222-8222-222222222222", "Second"),
    ]);
    api.markAll.mockResolvedValue(2);
    publishProfileIdentity(profile("user-a"));
    render(<NotificationsMenu />);

    expect(await screen.findByText("2 unread notifications")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Notifications"));
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(api.markAll).toHaveBeenCalledOnce());
    expect(screen.queryByText("2 unread notifications")).toBeNull();
  });

  it("does not flash one account's notifications while another account hydrates", async () => {
    api.fetch.mockResolvedValueOnce([
      notification("11111111-1111-4111-8111-111111111111", "User A only"),
    ]);
    publishProfileIdentity(profile("user-a"));
    render(<NotificationsMenu />);
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(await screen.findByText("User A only")).toBeTruthy();

    let resolveUserB: ((items: UserNotification[]) => void) | undefined;
    api.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveUserB = resolve; }));
    act(() => publishProfileIdentity(profile("user-b")));

    expect(screen.queryByText("User A only")).toBeNull();
    expect(screen.getByText("Loading…")).toBeTruthy();
    await act(async () => resolveUserB?.([]));
    expect(await screen.findByText("Where should Fiyu go next?")).toBeTruthy();
  });
});
