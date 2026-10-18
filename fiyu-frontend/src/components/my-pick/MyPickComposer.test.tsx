// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ submitMyPick: vi.fn() }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/components/ui/Sheet", () => ({ Sheet: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null }));
vi.mock("@/components/my-pick/GooglePlaceSelector", () => ({ GooglePlaceSelector: ({ onSelect }: { onSelect(id: string): void }) => <button onClick={() => onSelect("google-place-1")}>Mock Google suggestion</button> }));

import { MyPickComposer } from "@/components/my-pick/MyPickComposer";

const response = { my_pick_id: "pick-1" };

beforeEach(() => api.submitMyPick.mockReset().mockResolvedValue(response));
afterEach(() => { cleanup(); document.body.style.overflow = ""; });

describe("MyPickComposer", () => {
  it("stays in one modal from search through explicit confirmation", () => {
    render(<MyPickComposer open onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "My Pick" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mock Google suggestion" }));
    expect(screen.getByText("Restaurant selected and ready to send to Fiyu.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mock Google suggestion" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose another" }));
    expect(screen.getByRole("button", { name: "Mock Google suggestion" })).toBeTruthy();
  });

  it("submits only the selected Place ID and shows the asynchronous completion state", async () => {
    const onClose = vi.fn();
    render(<MyPickComposer open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Mock Google suggestion" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask Fiyu about this place" }));
    expect(api.submitMyPick).toHaveBeenCalledWith("google-place-1");
    expect(await screen.findByText("Submitted to Fiyu")).toBeTruthy();
    expect(screen.queryByText(/researching|progress/i)).toBeNull();
    expect(screen.getByRole("link", { name: "View My Picks" }).getAttribute("href")).toBe("/my-pick?id=pick-1");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("locks background scrolling while open and restores it when closed", () => {
    const view = render(<MyPickComposer open onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
