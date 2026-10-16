// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchMyPick: vi.fn(), fetchMyPicks: vi.fn(), submitMyPick: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const identity = vi.hoisted(() => ({ current: { status: "ready" as const, profile: { user_id: "user-a" } as { user_id: string } | null } }));
vi.mock("@/lib/api/client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/profile/profileIdentity", () => ({ useProfileIdentity: () => identity.current }));
vi.mock("@/lib/lists/useDefaultList", () => ({ useDefaultList: () => ({ isSaved: () => false, pendingPlaceIds: [], toggle: vi.fn() }) }));
vi.mock("@/components/my-pick/GooglePlaceSelector", () => ({ GooglePlaceSelector: ({ onSelect }: { onSelect(id: string): void }) => <button onClick={() => onSelect("google-place-1")}>Mock restaurant</button> }));

import { MyPickFlow } from "@/components/my-pick/MyPickFlow";

const ready = {
  my_pick_id: "00000000-0000-4000-8000-000000000123", provider: "google", external_place_id: "google-place-1",
  display_name_hint: null, status: "ready", status_message: "ready", failure_code: null,
  created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:01Z", resolved_at: "2026-10-15T00:00:01Z",
  place_id: "canonical-1", name_ja: null, name_en: "Small Tokyo Restaurant", primary_category: "Izakaya", display_area: "Koenji",
  fiyu_score: 42, score_version: "quality-v4", map_ready: true, latitude: 35.7, longitude: 139.65,
  location_precision: "area", is_public: false, recommendation_review_status: "not_eligible",
} as const;

beforeEach(() => { api.fetchMyPicks.mockReset().mockResolvedValue([]); api.fetchMyPick.mockReset(); api.submitMyPick.mockReset(); router.replace.mockReset(); identity.current = { status: "ready", profile: { user_id: "user-a" } }; });
afterEach(cleanup);

describe("MyPickFlow", () => {
  it("submits only the selected Place ID and immediately renders a low private result", async () => {
    api.submitMyPick.mockResolvedValue(ready);
    render(<MyPickFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Mock restaurant" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask Fiyu about this place" }));
    await screen.findByText("Your Pick is ready");
    expect(api.submitMyPick).toHaveBeenCalledWith("google-place-1");
    expect(screen.getByLabelText("Fiyu score 4.2 out of 10")).toBeTruthy();
    expect(screen.getByText(/private result/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View restaurant" })).toBeNull();
  });

  it("redirects unauthenticated users through the existing next-path sign-in flow", async () => {
    identity.current = { status: "ready", profile: null };
    render(<MyPickFlow />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/signin?next=%2Fmy-pick"));
  });
});
