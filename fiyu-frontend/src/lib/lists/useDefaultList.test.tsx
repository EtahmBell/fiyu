// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authService } from "@/lib/auth/authService";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

function profile(userId: string) {
  return {
    user_id: userId,
    username: userId,
    display_name: userId,
    bio: null,
    avatar_url: null,
    created_at: "2026-08-11T00:00:00Z",
    updated_at: "2026-08-11T00:00:00Z",
  };
}

function listBody(placeIds: string[]) {
  return {
    list_id: 7,
    city_id: "tokyo",
    name: "Tokyo",
    list_kind: "default",
    item_count: placeIds.length,
    items: placeIds.map((placeId) => ({
      place_id: placeId,
      added_at: "2026-08-11T00:00:00Z",
      restaurant: {
        place_id: placeId,
        name_ja: null,
        name_en: `Restaurant ${placeId}`,
        primary_category: "sushi",
        neighborhood: "Shibuya",
        fiyu_score: 90,
        score_band: "excellent",
      },
    })),
    created_at: "2026-08-11T00:00:00Z",
    updated_at: "2026-08-11T00:00:00Z",
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function ListProbe({ label }: { label: string }) {
  const list = useDefaultList("tokyo");
  const saved = list.isSaved("restaurant-x");
  return (
    <button type="button" onClick={() => void list.toggle("restaurant-x")}>
      {label}: {saved ? "Saved" : list.status}
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  clearProfileIdentity();
  vi.restoreAllMocks();
  vi.spyOn(authService, "getAccessToken").mockResolvedValue("account-token");
});

afterEach(() => {
  cleanup();
  clearProfileIdentity();
  vi.restoreAllMocks();
});

describe("authenticated default-list identity", () => {
  it("shares Save state with the Saved page and isolates account switches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(json(listBody([])))
      .mockResolvedValueOnce(
        json({ list: listBody(["restaurant-x"]), changed: true }),
      )
      .mockResolvedValueOnce(json(listBody([])));

    publishProfileIdentity(profile("account-save-a"));
    const detail = render(<ListProbe label="Detail" />);
    const save = await screen.findByRole("button", { name: "Detail: ready" });
    fireEvent.click(save);
    await screen.findByRole("button", { name: "Detail: Saved" });

    detail.unmount();
    render(<ListProbe label="Saved page" />);
    expect(screen.getByRole("button", { name: "Saved page: Saved" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    publishProfileIdentity(profile("account-save-b"));
    await screen.findByRole("button", { name: "Saved page: ready" });
    expect(screen.queryByRole("button", { name: "Saved page: Saved" })).toBeNull();

    publishProfileIdentity(profile("account-save-a"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Saved page: Saved" })).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const mutation = fetchMock.mock.calls[1];
    const headers = new Headers((mutation[1] as RequestInit | undefined)?.headers);
    expect(headers.get("Authorization")).toBe("Bearer account-token");
  });
});
