// @vitest-environment jsdom
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api/client";
import { dailyPickAssignmentResponseSchema, publicRestaurantSchema } from "@/lib/api/schemas";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import { browserDailyPicksStorage } from "@/lib/daily-picks/storage";
import { DailyPicksPanel } from "./DailyPicksPanel";

vi.mock("@/lib/lists/useDefaultList", () => ({ useDefaultList: () => ({
  status: "ready", savedPlaceIds: [], pendingPlaceIds: [], toggle: vi.fn(), operationError: null,
}) }));
vi.mock("@/components/restaurant/RestaurantPhoto", () => ({ RestaurantPhoto: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const catalog = [89, 90, 95].map((score, index) => publicRestaurantSchema.parse({
  place_id: String(index + 1), name_en: `Restaurant ${index + 1}`, fiyu_score: score,
}));
let ids: string[];
const assignment = () => dailyPickAssignmentResponseSchema.parse({
  round_id: "round", city_id: "tokyo", place_ids: ["1", "2", "3"],
  assigned_at: new Date(Date.now() - 1000).toISOString(),
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  revealed_place_ids: ids, restaurants: catalog,
});
const result = (id: string) => {
  ids = [...new Set([...ids, id])];
  return { round_id: "round", place_id: id, pick_revealed_at: new Date().toISOString(),
    revealed_place_ids: ids, revealed_at: ids.length === 3 ? new Date().toISOString() : null };
};
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const clickAll = async () => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reveal all Fiyu Picks" })); });
};
beforeEach(() => {
  vi.useFakeTimers(); ids = []; window.localStorage.clear(); clearAccountQueries();
  vi.spyOn(api, "fetchActiveDailyPicks").mockImplementation(async () => assignment());
  vi.spyOn(api, "fetchRecentDailyPicks").mockResolvedValue([]);
  vi.spyOn(api, "fetchTogetherState").mockImplementation(() => new Promise(() => {}));
  vi.spyOn(api, "revealDailyPicks").mockImplementation(async (_round, id) => result(id));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = async () => {
  const view = render(<DailyPicksPanel restaurants={catalog} accountId="reveal-test" />);
  await flush(); return view;
};

describe("canonical Pick reveals", () => {
  it("does not show a front until persistence succeeds; duplicate clicks send one request", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    vi.mocked(api.revealDailyPicks).mockReturnValue(new Promise((done) => { resolve = done; }));
    await mount();
    const button = screen.getByRole("button", { name: "Reveal Fiyu Pick 1" });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.revealDailyPicks).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("revealed-restaurant-card")).toBeNull();
    expect(browserDailyPicksStorage("reveal-test").getSnapshot()?.discoveries).toEqual([]);
    await act(async () => resolve(result("1")));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("flipping");
    expect(browserDailyPicksStorage("reveal-test").getSnapshot()?.selection?.revealedIds).toEqual(["1"]);
  });

  it("uses the same requests with a 150ms stagger and preserves round timing", async () => {
    await mount();
    const before = browserDailyPicksStorage("reveal-test").getSnapshot()?.selection;
    await clickAll();
    expect(api.revealDailyPicks).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(149); });
    expect(api.revealDailyPicks).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    expect(vi.mocked(api.revealDailyPicks).mock.calls.map((call) => call.slice(0, 2)))
      .toEqual([["round", "1"], ["round", "2"], ["round", "3"]]);
    expect(screen.queryByRole("button", { name: "Reveal all Fiyu Picks" })).toBeNull();
    const after = browserDailyPicksStorage("reveal-test").getSnapshot();
    expect(after?.selection?.generatedAt).toBe(before?.generatedAt);
    expect(after?.selection?.expiresAt).toBe(before?.expiresAt);
    expect(after?.discoveries).toHaveLength(3);
  });

  it("reveals only remaining cards and restores persisted fronts without replay", async () => {
    ids = ["1"];
    const view = await mount();
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("resting");
    await clickAll();
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(vi.mocked(api.revealDailyPicks).mock.calls.map((call) => call[1])).toEqual(["2", "3"]);
    view.unmount(); await mount();
    expect(screen.getAllByTestId("revealed-restaurant-card").every((card) => card.dataset.revealMotion === "resting")).toBe(true);
  });

  it("keeps partial successes, stops on failure and allows retry without duplicate success", async () => {
    vi.mocked(api.revealDailyPicks).mockImplementation(async (_round, id) => {
      if (id === "2") throw new Error("offline");
      return result(id);
    });
    await mount(); await clickAll();
    fireEvent.click(screen.getByRole("button", { name: "Reveal all Fiyu Picks" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(api.revealDailyPicks).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(1);
    expect(screen.getByText("We couldn’t save the reveal. Try again.")).toBeTruthy();
    vi.mocked(api.revealDailyPicks).mockImplementation(async (_round, id) => result(id));
    await clickAll(); await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(vi.mocked(api.revealDailyPicks).mock.calls.map((call) => call[1])).toEqual(["1", "2", "2", "3"]);
    expect(browserDailyPicksStorage("reveal-test").getSnapshot()?.discoveries).toHaveLength(3);
  });

  it("has no stagger or flip for reduced motion, with identical persistence", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"),
      addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    await mount(); await clickAll();
    expect(api.revealDailyPicks).toHaveBeenCalledTimes(3);
    expect(screen.getAllByTestId("revealed-restaurant-card").every((card) => card.dataset.revealMotion === "resting")).toBe(true);
    expect(ids).toEqual(["1", "2", "3"]);
  });

  it("does not reveal more cards after navigation unmounts the panel", async () => {
    const view = await mount(); await clickAll(); view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.revealDailyPicks).toHaveBeenCalledTimes(1);
  });
});
