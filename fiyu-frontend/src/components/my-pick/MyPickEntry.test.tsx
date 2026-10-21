// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/my-pick/MyPickComposer", () => ({
  MyPickComposer: ({ open, onClose, onSubmitted }: { open: boolean; onClose(): void; onSubmitted(item: { my_pick_id: string }): void }) => open ? <div role="dialog" aria-label="My Pick"><button onClick={() => onSubmitted({ my_pick_id: "pick-1" })}>Submit</button><button onClick={onClose}>Done</button></div> : null,
}));

import { MyPickEntry } from "@/components/my-pick/MyPickEntry";

afterEach(cleanup);

describe("MyPickEntry", () => {
  it("opens over Picks without route navigation and restores trigger focus on close", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    render(<MyPickEntry signedIn />);
    const trigger = screen.getByRole("button", { name: /Try My Pick/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "My Pick" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the revised entry copy and defers the section update until the composer closes", () => {
    const onSubmitted = vi.fn();
    render(<MyPickEntry signedIn onSubmitted={onSubmitted} />);
    expect(screen.getByText("Give Fiyu a restaurant and we'll score it.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Try My Pick/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmitted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ my_pick_id: "pick-1" }));
  });

  it("uses the same calm grey-blue surface family as a pending My Pick", () => {
    render(<MyPickEntry signedIn />);
    const trigger = screen.getByRole("button", { name: /Try My Pick/ });
    expect(trigger.className).toContain("bg-[#EEF2F6]");
    expect(trigger.className).toContain("border-[#D2DAE5]");
    expect(screen.getByRole("heading", { name: "Try My Pick" }).className).toContain("text-[#3F4A59]");
    expect(screen.getByText("Submit a restaurant →").className).toContain("text-[#66788F]");
  });

  it("renders the single restrained utility action for an existing Pick", () => {
    render(<MyPickEntry signedIn variant="utility" />);
    expect(screen.getByRole("button", { name: "Submit another →" })).toBeTruthy();
    expect(screen.queryByText("Try My Pick")).toBeNull();
  });

  it("keeps unauthenticated submission behind the existing sign-in flow", () => {
    render(<MyPickEntry signedIn={false} />);
    expect(screen.getByRole("link", { name: /Try My Pick/ }).getAttribute("href")).toBe("/signin?next=%2Fpicks");
  });
});
