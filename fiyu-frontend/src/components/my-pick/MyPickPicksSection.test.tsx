// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyPick } from "@/lib/api/schemas";
import { FiyuApiError } from "@/lib/api/errors";

const api = vi.hoisted(() => ({
  fetchDeveloperStatus: vi.fn(),
  fetchMyPicks: vi.fn(),
  fetchMyPickQuota: vi.fn(),
  hardResetDeveloperMyPick: vi.fn(),
  processDeveloperMyPick: vi.fn(),
}));
const list = vi.hoisted(() => ({ isSaved: vi.fn(() => false), toggle: vi.fn() }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));
vi.mock("@/lib/lists/useDefaultList", () => ({
  useDefaultList: () => ({ isSaved: list.isSaved, toggle: list.toggle, pendingPlaceIds: [] }),
}));
vi.mock("@/components/my-pick/MyPickEntry", () => ({
  MyPickEntry: ({ onSubmitted, variant = "card" }: { onSubmitted?: (item: MyPick) => void; variant?: "card" | "utility" }) => (
    <button type="button" onClick={() => onSubmitted?.(pending)}>{variant === "utility" ? "Submit another →" : "Submit a restaurant →"}</button>
  ),
}));

import { MyPickPicksSection } from "@/components/my-pick/MyPickPicksSection";

const base: MyPick = {
  my_pick_id: "10000000-0000-4000-8000-000000000001",
  provider: "google",
  external_place_id: "google-1",
  display_name_hint: null,
  user_query_hint: null,
  user_name_hint: null,
  user_address_hint: null,
  status: "ready",
  status_message: "ready",
  failure_code: null,
  created_at: "2026-10-19T10:00:00Z",
  updated_at: "2026-10-19T10:05:00Z",
  resolved_at: "2026-10-19T10:05:00Z",
  place_id: "place-1",
  name_ja: "テスト食堂",
  name_en: "Test Shokudo",
  primary_category: "Izakaya",
  display_area: "Kichijoji",
  fiyu_score: 84,
  score_version: "quality-v4-production-1",
  map_ready: true,
  latitude: 35.7,
  longitude: 139.58,
  location_precision: "poi",
  is_public: true,
  recommendation_review_status: "approved",
};
const pending: MyPick = {
  ...base,
  my_pick_id: "10000000-0000-4000-8000-000000000002",
  status: "researching",
  status_message: "researching",
  place_id: null,
  name_ja: null,
  name_en: null,
  primary_category: null,
  display_area: null,
  fiyu_score: null,
  score_version: null,
  resolved_at: null,
  map_ready: false,
  latitude: null,
  longitude: null,
  location_precision: null,
  is_public: false,
  recommendation_review_status: "not_eligible",
};
const queued: MyPick = { ...pending, status: "pending", status_message: "pending" };
const retryable: MyPick = {
  ...pending,
  external_place_id: "ChIJ-provider-RUyUK4yYI8QE",
  place_id: "ChIJ-provider-RUyUK4yYI8QE",
  name_en: "My Pick RUyUK4yYI8QE",
  status: "failed_retryable",
  status_message: "retryable",
  failure_code: "canonical_research_incomplete",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  api.fetchMyPicks.mockReset().mockResolvedValue([]);
  api.fetchMyPickQuota.mockReset().mockResolvedValue({ limit: 3, used: 1, remaining: 2, window_hours: 24, next_available_at: null });
  api.fetchDeveloperStatus.mockReset().mockRejectedValue(new Error("Not found"));
  api.hardResetDeveloperMyPick.mockReset();
  api.processDeveloperMyPick.mockReset();
  list.isSaved.mockReset().mockReturnValue(false);
  list.toggle.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MyPickPicksSection", () => {
  it("shows pending work as a calm inline card without exposing internal states", async () => {
    api.fetchMyPicks.mockResolvedValue([pending]);
    render(<MyPickPicksSection accountId="account-1" />);
    expect(await screen.findByText("Your Pick is under review")).toBeTruthy();
    expect(screen.getByText("Fiyu is looking into it. We'll let you know when it's ready.")).toBeTruthy();
    expect(screen.queryByText("researching")).toBeNull();
    expect(screen.queryByText(/Fiyu Score/i)).toBeNull();
    expect(screen.queryByText("Your My Picks")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit a restaurant →" })).toBeNull();
    const quota = await screen.findByText("2 of 3 Picks left");
    expect(quota.closest("[data-my-pick-id]")?.getAttribute("data-my-pick-id")).toBe(pending.my_pick_id);
    expect(document.querySelectorAll("[data-my-pick-footer]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Submit another →" })).toBeTruthy();
  });

  it("keeps a ready score out of the DOM until the user reveals the cool-blue card", async () => {
    api.fetchMyPicks.mockResolvedValue([base]);
    render(<MyPickPicksSection accountId="account-1" />);
    const reveal = await screen.findByRole("button", { name: "Reveal your Pick" });
    expect(reveal.className).toContain("bg-[#E6EDF5]");
    expect(screen.queryByLabelText("Fiyu Score 8.4 out of 10")).toBeNull();
    expect(screen.queryByText("Test Shokudo")).toBeNull();

    fireEvent.click(reveal);
    expect(await screen.findByText("Test Shokudo")).toBeTruthy();
    expect(screen.getByLabelText(/Fiyu score 8\.4 out of 10/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View restaurant →" }).getAttribute("href")).toBe("/restaurants/place-1");
    expect(screen.getByRole("link", { name: "Log visit" }).getAttribute("href")).toBe("/log?placeId=place-1");
    await waitFor(() => expect(document.querySelector('[data-reveal-phase="revealed"]')).not.toBeNull());
  });

  it("never creates broken public actions for a private result", async () => {
    api.fetchMyPicks.mockResolvedValue([{ ...base, is_public: false }]);
    render(<MyPickPicksSection accountId="account-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal your Pick" }));
    expect(await screen.findByText(/private result/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View restaurant →" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Log visit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("polls pending work modestly and refreshes when the page regains focus", async () => {
    const timeout = vi.spyOn(window, "setTimeout");
    api.fetchMyPicks.mockResolvedValue([pending]);
    render(<MyPickPicksSection accountId="account-1" />);
    await screen.findByText(/Fiyu is looking into it/);
    await waitFor(() => {
      expect(timeout.mock.calls.some((call) => call[1] === 30_000)).toBe(true);
    });
    const calls = api.fetchMyPicks.mock.calls.length;
    fireEvent.focus(window);
    await waitFor(() => expect(api.fetchMyPicks.mock.calls.length).toBeGreaterThan(calls));
  });

  it("does not run the pending poll when recent items are complete", async () => {
    const timeout = vi.spyOn(window, "setTimeout");
    api.fetchMyPicks.mockResolvedValue([base]);
    render(<MyPickPicksSection accountId="account-1" />);
    await screen.findByRole("button", { name: "Reveal your Pick" });
    expect(timeout.mock.calls.some((call) => call[1] === 30_000)).toBe(false);
  });

  it("inserts a newly submitted request inline without navigating to history", async () => {
    render(<MyPickPicksSection accountId="account-1" />);
    await waitFor(() => expect(api.fetchMyPicks).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Submit a restaurant →" }));
    expect(await screen.findByText(/Fiyu is looking into it/)).toBeTruthy();
  });

  it("shows the entry card only when there are no current My Picks", async () => {
    render(<MyPickPicksSection accountId="account-1" />);
    expect(await screen.findByRole("button", { name: "Submit a restaurant →" })).toBeTruthy();
    expect(screen.queryByText(/Picks left/)).toBeNull();
  });

  it("shows no submission action when the real quota is exhausted", async () => {
    api.fetchMyPicks.mockResolvedValue([pending]);
    api.fetchMyPickQuota.mockResolvedValue({ limit: 3, used: 3, remaining: 0, window_hours: 24, next_available_at: "2026-10-20T10:00:00Z" });
    render(<MyPickPicksSection accountId="account-1" />);
    expect(await screen.findByText("0 of 3 Picks left")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit another →" })).toBeNull();
  });

  it("never renders provider, place, or work identifiers as restaurant titles", async () => {
    const canonicalWorkId = "48e12be2-6c8c-4eb0-a9ba-0fda848d37ef";
    api.fetchMyPicks.mockResolvedValue([
      retryable,
      { ...retryable, my_pick_id: "10000000-0000-4000-8000-000000000003", name_en: canonicalWorkId },
    ]);
    render(<MyPickPicksSection accountId="account-1" />);

    expect(await screen.findAllByText("Your Pick is still under review")).toHaveLength(2);
    expect(screen.queryByText("My Pick RUyUK4yYI8QE")).toBeNull();
    expect(screen.queryByText("ChIJ-provider-RUyUK4yYI8QE")).toBeNull();
    expect(screen.queryByText(canonicalWorkId)).toBeNull();
    expect(screen.getAllByText("Your Pick").length).toBeGreaterThan(0);
  });

  it("uses the grey-blue retryable treatment without exposing diagnostics to a normal user", async () => {
    api.fetchMyPicks.mockResolvedValue([retryable]);
    render(<MyPickPicksSection accountId="account-1" />);

    const title = await screen.findByText("Your Pick is still under review");
    expect(title.closest("article")?.className).toContain("bg-[#EEF2F6]");
    expect(title.closest("article")?.className).toContain("border-[#D2DAE5]");
    expect(screen.getByText("Fiyu couldn't finish checking this one yet. Your request is saved and can be retried.")).toBeTruthy();
    expect(screen.queryByText(/canonical_research_incomplete/)).toBeNull();
    expect(screen.queryByRole("button", { name: "DEV: Retry now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "DEV: Hard reset this Pick" })).toBeNull();
    expect(screen.getByText("2 of 3 Picks left").closest("article")).toBe(title.closest("article"));
  });

  it("never exposes manual processing to a normal user or on a ready card", async () => {
    api.fetchMyPicks.mockResolvedValue([queued]);
    const view = render(<MyPickPicksSection accountId="account-1" />);
    await screen.findByText("Your Pick is under review");
    await waitFor(() => expect(api.fetchDeveloperStatus).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "DEV: Process now" })).toBeNull();

    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValue([base]);
    view.unmount();
    render(<MyPickPicksSection accountId="account-1" />);
    await screen.findByRole("button", { name: "Reveal your Pick" });
    expect(screen.queryByRole("button", { name: "DEV: Process now" })).toBeNull();
  });

  it("lets an authorized developer process the exact pending Pick once and refetches durable state", async () => {
    const processing = deferred<{ my_pick: MyPick; worker_summary: Record<string, number> }>();
    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValueOnce([queued]).mockResolvedValueOnce([base]);
    api.processDeveloperMyPick.mockReturnValue(processing.promise);
    render(<MyPickPicksSection accountId="account-1" />);

    const button = await screen.findByRole("button", { name: "DEV: Process now" });
    expect(button.closest("[data-my-pick-id]")?.getAttribute("data-my-pick-id")).toBe(queued.my_pick_id);
    await waitFor(() => expect(api.fetchMyPickQuota).toHaveBeenCalledTimes(1));
    const quotaCalls = api.fetchMyPickQuota.mock.calls.length;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.processDeveloperMyPick).toHaveBeenCalledOnce();
    expect(api.processDeveloperMyPick).toHaveBeenCalledWith(queued.my_pick_id);
    expect(screen.getByRole("button", { name: "Processing…" })).toHaveProperty("disabled", true);

    await act(async () => processing.resolve({ my_pick: base, worker_summary: { jobs_claimed: 1, ready: 1 } }));
    expect(await screen.findByRole("button", { name: "Reveal your Pick" })).toBeTruthy();
    expect(screen.queryByText("Test Shokudo")).toBeNull();
    expect(screen.queryByRole("button", { name: "DEV: Process now" })).toBeNull();
    expect(api.fetchMyPicks).toHaveBeenCalledTimes(2);
    expect(api.fetchMyPickQuota).toHaveBeenCalledTimes(quotaCalls);
  });

  it("shows Process now for every processable in-flight developer state", async () => {
    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValue([pending]);
    render(<MyPickPicksSection accountId="account-1" />);

    expect(await screen.findByRole("button", { name: "DEV: Process now" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "DEV: Hard reset this Pick" })).toBeTruthy();
  });

  it("shows a safe developer error when the canonical worker index is not configured", async () => {
    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValue([queued]);
    api.processDeveloperMyPick.mockRejectedValue(new FiyuApiError({
      kind: "backend-unavailable",
      endpoint: "/developer/my-picks/process",
      status: 503,
      detail: "FIYU_MY_PICK_OSM_INDEX is required for My Pick processing",
    }));
    render(<MyPickPicksSection accountId="account-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "DEV: Process now" }));
    expect((await screen.findByRole("alert")).textContent).toBe("My Pick worker is not configured on this backend.");
    expect(screen.getByRole("button", { name: "DEV: Process now" })).toBeTruthy();
  });

  it("shows an authorized developer a safe diagnostic and retries the same durable Pick without touching quota", async () => {
    const retry = deferred<{ my_pick: MyPick; worker_summary: Record<string, number> }>();
    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValueOnce([retryable]).mockResolvedValueOnce([base]);
    api.processDeveloperMyPick.mockReturnValue(retry.promise);
    render(<MyPickPicksSection accountId="account-1" />);

    const button = await screen.findByRole("button", { name: "DEV: Retry now" });
    expect(screen.getByText(/canonical_research_incomplete/)).toBeTruthy();
    expect(button.closest("article")).toBe(screen.getByText("2 of 3 Picks left").closest("article"));
    await waitFor(() => expect(api.fetchMyPickQuota).toHaveBeenCalledTimes(1));
    const quotaCalls = api.fetchMyPickQuota.mock.calls.length;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.processDeveloperMyPick).toHaveBeenCalledOnce();
    expect(api.processDeveloperMyPick).toHaveBeenCalledWith(retryable.my_pick_id);

    await act(async () => retry.resolve({ my_pick: base, worker_summary: { jobs_claimed: 1, ready: 1 } }));
    expect(await screen.findByRole("button", { name: "Reveal your Pick" })).toBeTruthy();
    expect(api.fetchMyPickQuota).toHaveBeenCalledTimes(quotaCalls);
  });

  it("offers only Hard reset for an authorized needs-review Pick", async () => {
    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValue([{ ...retryable, status: "needs_review" }]);
    render(<MyPickPicksSection accountId="account-1" />);

    expect(await screen.findByRole("button", { name: "DEV: Hard reset this Pick" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "DEV: Retry now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "DEV: Process now" })).toBeNull();
  });

  it("confirms a developer hard reset, removes the card, and refreshes restored quota", async () => {
    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValueOnce([retryable]).mockResolvedValueOnce([]);
    api.fetchMyPickQuota
      .mockResolvedValueOnce({ limit: 3, used: 1, remaining: 2, window_hours: 24, next_available_at: null })
      .mockResolvedValueOnce({ limit: 3, used: 0, remaining: 3, window_hours: 24, next_available_at: null });
    api.hardResetDeveloperMyPick.mockResolvedValue({
      reset: true,
      deleted_my_picks: 1,
      deleted_canonical_work: 1,
      deleted_transient_placeholder: true,
      preserved_canonical_restaurant: false,
    });
    render(<MyPickPicksSection accountId="account-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "DEV: Hard reset this Pick" }));
    expect(screen.getByRole("dialog", { name: "Confirm My Pick hard reset" })).toBeTruthy();
    expect(screen.getByText("Reset this My Pick test and its unshared canonical work?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hard reset" }));

    await waitFor(() => expect(api.hardResetDeveloperMyPick).toHaveBeenCalledWith(retryable.my_pick_id));
    await waitFor(() => expect(document.querySelector(`[data-my-pick-id="${retryable.my_pick_id}"]`)).toBeNull());
    expect(api.fetchMyPickQuota).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "Submit a restaurant →" })).toBeTruthy();
  });

  it("normalizes an unstructured failure reason before showing it to a developer", async () => {
    api.fetchDeveloperStatus.mockResolvedValue({ enabled: true, authorized: true, location_mode: "real", area_name: null, location_options: [] });
    api.fetchMyPicks.mockResolvedValue([{ ...retryable, failure_code: "provider payload contained private detail" }]);
    render(<MyPickPicksSection accountId="account-1" />);
    expect(await screen.findByText(/processing_error/)).toBeTruthy();
    expect(screen.queryByText(/private detail/)).toBeNull();
  });

  it("focuses a deep-linked inline result and keeps the section to three recent cards", async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const items = [0, 1, 2, 3, 4].map((index) => ({
      ...base,
      my_pick_id: `10000000-0000-4000-8000-00000000000${index + 1}`,
      name_en: `Restaurant ${index + 1}`,
    }));
    api.fetchMyPicks.mockResolvedValue(items);
    render(<MyPickPicksSection accountId="account-1" initialMyPickId={items[4].my_pick_id} />);
    let linked: HTMLElement | null = null;
    await waitFor(() => {
      linked = document.querySelector<HTMLElement>(`[data-my-pick-id="${items[4].my_pick_id}"]`);
      expect(linked).not.toBeNull();
    });
    expect(linked).toBe(document.activeElement);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.querySelectorAll("[data-my-pick-id]")).toHaveLength(3);
    expect(document.querySelectorAll("[data-my-pick-footer]")).toHaveLength(1);
    expect(document.querySelector("[data-my-pick-footer]")?.closest("[data-my-pick-id]")).toBe(linked);
  });
});
