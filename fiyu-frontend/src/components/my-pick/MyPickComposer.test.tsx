// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FiyuApiError } from "@/lib/api/errors";

const api = vi.hoisted(() => ({ fetchMyPickQuota: vi.fn(), submitMyPick: vi.fn() }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/components/my-pick/GooglePlaceSelector", () => ({
  GooglePlaceSelector: ({ onSelect }: { onSelect(id: string): void }) => (
    <button onClick={() => onSelect("google-place-1")}>Mock Google suggestion</button>
  ),
}));

import { MyPickComposer } from "@/components/my-pick/MyPickComposer";

const response = { my_pick_id: "pick-1" };
const fullQuota = { limit: 3, used: 0, remaining: 3, window_hours: 24, next_available_at: null } as const;

beforeEach(() => {
  api.submitMyPick.mockReset().mockResolvedValue(response);
  api.fetchMyPickQuota.mockReset().mockResolvedValue(fullQuota);
});
afterEach(() => { cleanup(); document.body.style.overflow = ""; });

describe("MyPickComposer", () => {
  it("uses one centered portal dialog rather than bottom-sheet anchoring", async () => {
    render(<MyPickComposer open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Have somewhere in mind?" });
    expect(dialog.parentElement?.className).toContain("items-center");
    expect(dialog.parentElement?.className).toContain("justify-center");
    expect(dialog.className).toContain("max-w-[28rem]");
    expect(dialog.className).not.toContain("mt-auto");
    expect(await screen.findByText("3 My Picks available now")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mock Google suggestion" }));
    expect(screen.getByText("Restaurant selected and ready to send to Fiyu.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose another" }));
    expect(screen.getByRole("button", { name: "Mock Google suggestion" })).toBeTruthy();
  });

  it("submits only the selected Place ID and refreshes quota without blocking completion", async () => {
    api.fetchMyPickQuota
      .mockResolvedValueOnce(fullQuota)
      .mockResolvedValueOnce({ ...fullQuota, used: 1, remaining: 2 });
    const onClose = vi.fn();
    render(<MyPickComposer open onClose={onClose} />);
    await screen.findByText("3 My Picks available now");
    fireEvent.click(screen.getByRole("button", { name: "Mock Google suggestion" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask Fiyu about this place" }));
    expect(api.submitMyPick).toHaveBeenCalledWith("google-place-1");
    expect(await screen.findByText("Submitted to Fiyu")).toBeTruthy();
    expect(await screen.findByText("2 of 3 My Picks remaining")).toBeTruthy();
    expect(screen.queryByText(/researching|progress/i)).toBeNull();
    expect(screen.getByRole("link", { name: "View My Picks" }).getAttribute("href")).toBe("/my-pick?id=pick-1");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("prevents a new request when exhausted while keeping history available", async () => {
    api.fetchMyPickQuota.mockResolvedValue({
      ...fullQuota,
      used: 3,
      remaining: 0,
      next_available_at: "2026-10-19T21:15:00Z",
    });
    render(<MyPickComposer open onClose={vi.fn()} />);
    expect(await screen.findByText("You've used your 3 My Picks for now.")).toBeTruthy();
    expect(screen.getByText(/Another My Pick becomes available/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mock Google suggestion" })).toBeNull();
    expect(screen.getByRole("link", { name: "View My Picks" }).getAttribute("href")).toBe("/my-pick");
    expect(api.submitMyPick).not.toHaveBeenCalled();
  });

  it("uses structured server quota after a stale-client submission race", async () => {
    const exhaustedQuota = {
      ...fullQuota,
      used: 3,
      remaining: 0,
      next_available_at: "2026-10-19T21:15:00Z",
    };
    api.submitMyPick.mockRejectedValue(new FiyuApiError({
      kind: "rate-limited",
      endpoint: "/my-picks",
      status: 429,
      responseBody: {
        detail: {
          code: "my_pick_quota_exhausted",
          message: "You've used your 3 My Picks for now.",
          quota: exhaustedQuota,
        },
      },
    }));
    render(<MyPickComposer open onClose={vi.fn()} />);
    await screen.findByText("3 My Picks available now");
    fireEvent.click(screen.getByRole("button", { name: "Mock Google suggestion" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask Fiyu about this place" }));
    expect(await screen.findByText("0 of 3 My Picks remaining")).toBeTruthy();
    expect(screen.getByText("You've used your 3 My Picks for now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mock Google suggestion" })).toBeNull();
  });

  it("contains focus, closes with Escape, restores focus, and does not close from the backdrop", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = render(<MyPickComposer open onClose={onClose} />);
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("dialog")));
    fireEvent.click(screen.getByTestId("my-pick-modal-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
