// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchMyPick: vi.fn(), fetchMyPicks: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const identity = vi.hoisted(() => ({ current: { status: "ready" as const, profile: { user_id: "user-a" } as { user_id: string } | null } }));
vi.mock("@/lib/api/client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/profile/profileIdentity", () => ({ useProfileIdentity: () => identity.current }));
vi.mock("@/lib/lists/useDefaultList", () => ({ useDefaultList: () => ({ isSaved: () => false, pendingPlaceIds: [], toggle: vi.fn() }) }));
vi.mock("@/components/my-pick/MyPickComposer", () => ({ MyPickComposer: ({ open }: { open: boolean }) => open ? <div role="dialog">Shared My Pick composer</div> : null }));

import { MyPickFlow } from "@/components/my-pick/MyPickFlow";

const ready = {
  my_pick_id: "00000000-0000-4000-8000-000000000123", provider: "google", external_place_id: "google-place-1",
  display_name_hint: null, status: "ready", status_message: "ready", failure_code: null,
  created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:01Z", resolved_at: "2026-10-15T00:00:01Z",
  place_id: "canonical-1", name_ja: null, name_en: "Small Tokyo Restaurant", primary_category: "Izakaya", display_area: "Koenji",
  fiyu_score: 42, score_version: "quality-v4", map_ready: true, latitude: 35.7, longitude: 139.65,
  location_precision: "area", is_public: false, recommendation_review_status: "not_eligible",
} as const;

beforeEach(() => { api.fetchMyPicks.mockReset().mockResolvedValue([ready]); api.fetchMyPick.mockReset().mockResolvedValue(ready); router.replace.mockReset(); identity.current = { status: "ready", profile: { user_id: "user-a" } }; });
afterEach(cleanup);

describe("MyPickFlow", () => {
  it("is a history/results route without a duplicate search experience", async () => {
    render(<MyPickFlow />);
    expect(screen.getByRole("heading", { name: "My Picks" })).toBeTruthy();
    expect(screen.queryByLabelText("Restaurant search")).toBeNull();
    expect(await screen.findByText("Small Tokyo Restaurant")).toBeTruthy();
  });

  it("recovers a completed result from a durable id deep link", async () => {
    render(<MyPickFlow initialMyPickId={ready.my_pick_id} />);
    expect(await screen.findByRole("heading", { name: "Your Pick is ready" })).toBeTruthy();
    expect(api.fetchMyPick).toHaveBeenCalledWith(ready.my_pick_id, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByLabelText("Fiyu score 4.2 out of 10")).toBeTruthy();
    expect(screen.getByText(/private result/)).toBeTruthy();
  });

  it("recovers a pending request from a durable id deep link", async () => {
    const pending = { ...ready, status: "pending" as const, place_id: null, name_en: null, fiyu_score: null };
    api.fetchMyPick.mockResolvedValue(pending);
    render(<MyPickFlow initialMyPickId={pending.my_pick_id} />);
    expect(await screen.findByRole("heading", { name: "Your Pick is queued" })).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
  });

  it("opens the one shared composer from its small new-request control", () => {
    render(<MyPickFlow />);
    fireEvent.click(screen.getByRole("button", { name: "New My Pick" }));
    expect(screen.getByRole("dialog").textContent).toBe("Shared My Pick composer");
  });

  it("redirects unauthenticated users through the existing next-path sign-in flow", async () => {
    identity.current = { status: "ready", profile: null };
    render(<MyPickFlow />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/signin?next=%2Fmy-pick"));
  });
});
