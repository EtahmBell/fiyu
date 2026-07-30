// @vitest-environment jsdom
import { act } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationNavigation } from "@/components/layout/ApplicationNavigation";

const route = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  route.pathname = "/";
  vi.restoreAllMocks();
});

describe("application navigation", () => {
  it("renders the five mobile destinations in product order from shared configuration", () => {
    render(<ApplicationNavigation />);

    const mobile = screen.getByRole("navigation", { name: "Mobile primary" });
    const links = within(mobile).getAllByRole("link");
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Picks",
      "Lists",
      "Log",
      "Map",
      "Profile",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/lists",
      "/log",
      "/map",
      "/profile",
    ]);
    const log = within(mobile).getByRole("link", { name: "Log a visit" });
    expect(log.textContent).toContain("Log");
    const logIcon = log.querySelector("svg");
    expect(logIcon?.classList.contains("size-6")).toBe(true);
    expect(logIcon?.querySelectorAll("path")).toHaveLength(1);
    expect(logIcon?.querySelector('[data-log-plus="true"]')?.getAttribute("d")).toBe(
      "M12 4v16M4 12h16",
    );
    expect(logIcon?.querySelector('path[d="m7 19 2 2 4-4"]')).toBeNull();
    expect(within(mobile).getByRole("link", { name: "Picks" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("renders the desktop destinations and active state without account fiction", () => {
    route.pathname = "/map";
    render(<ApplicationNavigation />);

    const desktop = screen.getByRole("navigation", { name: "Primary" });
    expect(within(desktop).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual([
      "Picks",
      "Map",
      "Lists",
      "Log a Visit",
    ]);
    expect(within(desktop).getByRole("link", { name: "Map" }).getAttribute("aria-current")).toBe(
      "page",
    );
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Profile" }).getAttribute("href")).toBe(
      "/profile",
    );
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("provides city, notification, and meaningful menu surfaces", () => {
    render(<ApplicationNavigation />);

    expect(screen.getByRole("link", { name: "Fiyu city editions" }).getAttribute("href")).toBe(
      "/cities",
    );
    expect(screen.getAllByText("Tokyo").length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-city-signature-mark="tokyo"]')).toHaveLength(2);
    for (const cityEntry of screen.getAllByRole("link", { name: /TokyoJapanAvailable/ })) {
      expect(cityEntry.querySelector("[data-city-signature-mark]")).toBeNull();
    }
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.getByLabelText("Open menu")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/profile#settings",
    );
    expect(screen.getByText("Nothing new right now.")).toBeTruthy();
    expect(screen.queryByText(/\d+ notifications?/i)).toBeNull();
  });

  it("hydrates with the same route-derived active destination", async () => {
    const element = <ApplicationNavigation />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    const messages: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) =>
      messages.push(args.map(String).join(" ")),
    );
    vi.spyOn(console, "warn").mockImplementation((...args) =>
      messages.push(args.map(String).join(" ")),
    );

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(messages).toEqual([]);
  });
});
