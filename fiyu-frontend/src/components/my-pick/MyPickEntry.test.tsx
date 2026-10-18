// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/my-pick/MyPickComposer", () => ({ MyPickComposer: ({ open, onClose }: { open: boolean; onClose(): void }) => open ? <div role="dialog" aria-label="My Pick"><button onClick={onClose}>Done</button></div> : null }));

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

  it("keeps unauthenticated submission behind the existing sign-in flow", () => {
    render(<MyPickEntry signedIn={false} />);
    expect(screen.getByRole("link", { name: /Try My Pick/ }).getAttribute("href")).toBe("/signin?next=%2Fpicks");
  });
});
