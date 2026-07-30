// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ListsPage from "@/app/lists/page";
import LogPage from "@/app/log/page";

afterEach(cleanup);

describe("Tokyo destination empty states", () => {
  it("uses distinct saved and custom-list variants with only a real Picks action", () => {
    const { container } = render(<ListsPage />);
    const saved = container.querySelector('[data-city-empty-state="saved"]') as HTMLElement;
    const lists = container.querySelector('[data-city-empty-state="lists"]') as HTMLElement;

    expect(within(saved).getByText("No saved places in Tokyo yet")).toBeTruthy();
    expect(within(saved).getByRole("link", { name: "Explore today's Picks" })).toBeTruthy();
    expect(within(lists).getByText("No custom lists yet")).toBeTruthy();
    expect(within(lists).queryByRole("link")).toBeNull();
    expect(within(lists).queryByRole("button")).toBeNull();
  });

  it("uses the visits variant without fabricating a logging action", () => {
    const { container } = render(<LogPage />);
    const visits = container.querySelector('[data-city-empty-state="visits"]') as HTMLElement;

    expect(screen.getByText("No visits logged")).toBeTruthy();
    expect(within(visits).queryByRole("link")).toBeNull();
    expect(within(visits).queryByRole("button")).toBeNull();
  });
});
