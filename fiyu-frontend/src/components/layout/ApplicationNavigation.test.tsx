// @vitest-environment jsdom
import { act, useState } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationNavigation } from "@/components/layout/ApplicationNavigation";

const route = vi.hoisted(() => ({ pathname: "/picks" }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => navigation,
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
  route.pathname = "/picks";
  navigation.push.mockReset();
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
      "/picks",
      "/lists",
      "/log",
      "/map",
      "/profile",
    ]);
    const log = within(mobile).getByRole("link", { name: "Log a visit" });
    expect(log.textContent).toContain("Log");
    expect(mobile.className).toContain("h-mobile-nav");
    for (const link of links) {
      expect(link.className).toContain("gap-1.5");
      expect(link.className).toContain("text-[0.8125rem]");
      expect(link.querySelector("svg")?.classList.contains("size-6")).toBe(true);
      const label = link.querySelector("span.whitespace-nowrap");
      expect(label?.classList.contains("leading-4")).toBe(true);
      expect(label?.classList.contains("truncate")).toBe(false);
    }
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

    expect(screen.getByRole("link", { name: "Fiyu Picks" }).getAttribute("href")).toBe("/picks");
    expect(screen.getByRole("link", { name: "Fiyu" }).getAttribute("href")).toBe("/");
    expect(screen.getAllByText("Tokyo").length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-city-signature-mark="tokyo"]')).toHaveLength(2);
    for (const cityEntry of screen.getAllByRole("button", { name: /TokyoJapanAvailable/ })) {
      expect(cityEntry.querySelector("[data-city-signature-mark]")).toBeNull();
      expect(cityEntry.getAttribute("aria-current")).toBe("true");
    }
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.getByLabelText("Open menu")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/profile#settings",
    );
    expect(screen.getByText("Nothing new right now.")).toBeTruthy();
    expect(screen.queryByText(/\d+ notifications?/i)).toBeNull();
  });

  it("selects the active Tokyo edition in place without resetting the current app route or state", () => {
    route.pathname = "/lists";

    function StateProbe() {
      const [savedCount, setSavedCount] = useState(0);
      return (
        <button type="button" onClick={() => setSavedCount((count) => count + 1)}>
          Saved state {savedCount}
        </button>
      );
    }

    render(
      <>
        <ApplicationNavigation />
        <StateProbe />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Saved state 0" }));

    const mobileCityTrigger = screen.getAllByLabelText(
      "Choose Fiyu city edition. Current city: Tokyo",
    )[0];
    const mobileSelector = mobileCityTrigger.closest("details");
    expect(mobileSelector).toBeTruthy();
    fireEvent.click(mobileCityTrigger);
    expect(mobileSelector?.open).toBe(true);

    const tokyo = within(mobileSelector as HTMLDetailsElement).getByRole("button", {
      name: /TokyoJapanAvailable/,
    });
    expect(tokyo.closest("a")).toBeNull();
    fireEvent.click(tokyo);

    expect(mobileSelector?.open).toBe(false);
    expect(document.activeElement).toBe(mobileCityTrigger);
    expect(route.pathname).toBe("/lists");
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Saved state 1" })).toBeTruthy();
    expect(
      within(screen.getByRole("navigation", { name: "Mobile primary" }))
        .getByRole("link", { name: "Lists" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps coming-soon editions disabled and dismisses the selector accessibly", () => {
    render(<ApplicationNavigation />);

    const mobileCityTrigger = screen.getAllByLabelText(
      "Choose Fiyu city edition. Current city: Tokyo",
    )[0];
    const mobileSelector = mobileCityTrigger.closest("details") as HTMLDetailsElement;
    fireEvent.click(mobileCityTrigger);

    const newYork = within(mobileSelector).getByRole("button", { name: /New YorkUnited StatesComing soon/ });
    const rome = within(mobileSelector).getByRole("button", { name: /RomeItalyComing soon/ });
    expect(newYork.hasAttribute("disabled")).toBe(true);
    expect(rome.hasAttribute("disabled")).toBe(true);
    expect(within(mobileSelector).queryByRole("link", { name: /Tokyo|New York|Rome/ })).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mobileSelector.open).toBe(false);
    expect(document.activeElement).toBe(mobileCityTrigger);

    fireEvent.click(mobileCityTrigger);
    fireEvent.pointerDown(document.body);
    expect(mobileSelector.open).toBe(false);
  });

  it("gives a restaurant detail route its compact mobile header instead of app chrome", () => {
    route.pathname = "/restaurants/place-123";
    render(<ApplicationNavigation />);

    expect(screen.queryByRole("navigation", { name: "Mobile primary" })).toBeNull();
    expect(screen.getByRole("banner").className).toContain("hidden");
    expect(screen.getByRole("banner").className).toContain("lg:block");
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
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
