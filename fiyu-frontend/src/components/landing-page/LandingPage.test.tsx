// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MarketingLayout from "@/app/(marketing)/layout";
import PublicLandingPage from "@/app/(marketing)/page";
import { LandingPage } from "@/components/landing-page/LandingPage";
import { WORLD_LAND_PATH } from "@/components/landing-page/worldLandPath";

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

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    // The test covers the image contract rather than Next.js optimization internals.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} {...props} />
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function landingRoute() {
  return (
    <MarketingLayout>
      <PublicLandingPage />
    </MarketingLayout>
  );
}

describe("public landing experience", () => {
  it("renders dedicated landing chrome at / without application navigation", () => {
    render(landingRoute());

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Fiyu home" }).getAttribute("href")).toBe(
      "/",
    );
    expect(within(header).getAllByRole("link", { name: "Explore Tokyo" })).not.toHaveLength(0);
    for (const action of screen.getAllByRole("link", { name: "Explore Tokyo" })) {
      expect(action.getAttribute("href")).toBe("/picks");
    }
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Mobile primary" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });

  it("keeps the footer to real destinations, with attribution split from navigation", () => {
    render(landingRoute());

    const footer = within(screen.getByRole("contentinfo"));
    const links = footer.getAllByRole("navigation", { name: "Landing footer" });
    expect(links).toHaveLength(1);
    expect(
      within(links[0]).getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/picks", "/profile#privacy"]);

    // Same-page section anchors belong in the header, not the footer.
    expect(footer.queryByRole("link", { name: "How Fiyu works" })).toBeNull();
    expect(footer.queryByRole("link", { name: "Why only a few?" })).toBeNull();

    expect(footer.getByText("© 2026 Fiyu.")).toBeTruthy();
    expect(footer.getByRole("link", { name: "Natural Earth" }).getAttribute("href")).toBe(
      "https://www.naturalearthdata.com/",
    );
  });

  it("shares one measure across the header, every section, and the footer", () => {
    const { container } = render(landingRoute());

    const measured = [...container.querySelectorAll(".max-w-\\[90rem\\]")];
    expect(measured.length).toBeGreaterThanOrEqual(7);
    for (const element of measured) {
      expect(element.className).toContain("px-5");
      expect(element.className).toContain("lg:px-12");
    }
  });

  it("renders the approved hero copy and responsive wordmark treatment", () => {
    render(<LandingPage />);

    const wordmark = screen.getByTestId("landing-wordmark");
    expect(wordmark.textContent).toBe("Fiyu");
    expect(wordmark.className).toContain("text-[clamp(4.5rem,13vw,10rem)]");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Hidden places. Carefully uncovered.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Fiyu combines local-language research, machine learning, and your feedback to uncover independent, underexposed restaurants suited to your tastes.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "See how Fiyu works" }).getAttribute("href")).toBe(
      "#how-it-works",
    );
  });

  it("pairs the hero with a captioned, city-neutral nearby-discovery plate", () => {
    const { container } = render(<LandingPage />);

    expect(screen.queryByText("A quiet way in")).toBeNull();
    expect(screen.getByText("Selected around you.")).toBeTruthy();
    expect(
      screen.getByText(
        /Independent restaurants matched to your tastes and nearby area—whether you’re exploring a new city or rediscovering your everyday one\./,
      ),
    ).toBeTruthy();

    // The hero keeps a single heading; the plate is captioned, not sectioned.
    const hero = screen.getByTestId("hero-nearby-figure").closest("section");
    expect(hero?.querySelectorAll("h1, h2, h3")).toHaveLength(1);

    // Decorative to assistive tech, and no place is named or plotted.
    const plate = screen.getByTestId("hero-nearby-figure").querySelector("svg");
    expect(plate?.getAttribute("aria-hidden")).toBe("true");
    expect(plate?.querySelector("text")).toBeNull();
    expect(plate?.querySelector("image")).toBeNull();
    // One origin plus three nearby picks.
    expect(plate?.querySelectorAll('circle[fill="var(--color-rose-dust)"]')).toHaveLength(3);
    expect(plate?.querySelectorAll('circle[fill="var(--color-plum)"]')).toHaveLength(1);

    // Stacks on narrow screens rather than crowding the primary copy.
    expect(container.querySelector('[data-testid="hero-nearby-figure"]')?.className).toContain(
      "border-t",
    );
  });

  it("renders one keyboard-accessible available city on the deterministic world map", () => {
    render(<LandingPage />);

    const map = screen.getByTestId("world-locations-map");
    expect(map.getAttribute("role")).toBe("img");
    expect(map.getAttribute("viewBox")).toBe("0 0 900 450");
    expect(map.getAttribute("class")).toContain("max-w-full");
    const available = map.querySelectorAll('[data-location-status="available"]');
    expect(available).toHaveLength(1);
    const tokyo = within(map).getByRole("link", { name: "Tokyo — Available" });
    expect(tokyo.getAttribute("href")).toBe("/picks");
    tokyo.focus();
    expect(document.activeElement).toBe(tokyo);
    expect(screen.queryByRole("link", { name: /New York|Rome/i })).toBeNull();
    expect(WORLD_LAND_PATH.length).toBeGreaterThan(10_000);
    expect(WORLD_LAND_PATH.length).toBeLessThan(30_000);
  });

  it("renders the workflow before the gradual-reveal philosophy", () => {
    render(<LandingPage />);

    const workflow = screen.getByRole("heading", { name: "How Fiyu works" }).closest("section");
    const philosophy = screen
      .getByRole("heading", { name: "Why only a few restaurants at a time?" })
      .closest("section");
    expect(workflow).toBeTruthy();
    expect(philosophy).toBeTruthy();
    if (!workflow || !philosophy) throw new Error("Expected ordered landing sections");
    expect(
      Boolean(workflow.compareDocumentPosition(philosophy) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      screen.getByText(
        /Great small restaurants can be overwhelmed by sudden attention\. Fiyu reveals discoveries gradually through small, personalized selections/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/By varying recommendations across users instead of directing everyone/),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tell us what you like" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Receive a few considered picks" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reveal, save, and visit" })).toBeTruthy();
  });

  it("uses the existing sharing artwork as the accessible Tokyo edition poster", () => {
    render(<LandingPage />);

    expect(screen.queryByText("Three doors into the city.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Fiyu has arrived in Tokyo." })).toBeTruthy();
    expect(
      screen.getByText(
        "Explore Tokyo’s independent and underexposed restaurants, selected around your tastes—from local izakayas to tucked-away ramen counters you might otherwise miss.",
      ),
    ).toBeTruthy();
    const poster = screen.getByRole("img", {
      name: "Fiyu Tokyo edition artwork with a map marker over Japan.",
    });
    expect(poster.getAttribute("src")).toBe("/og.png");
    expect(poster.getAttribute("width")).toBe("1200");
    expect(poster.getAttribute("height")).toBe("630");
    expect(poster.getAttribute("loading")).toBe("lazy");
    expect(poster.getAttribute("sizes")).toContain("100vw");
    expect(screen.queryByLabelText("Simplified illustrated preview of Tokyo neighborhoods")).toBeNull();
    expect(screen.queryByLabelText("Three concealed Tokyo restaurant previews")).toBeNull();
  });

  it("supports a focus-managed mobile menu that closes with Escape", () => {
    render(landingRoute());

    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    const menu = screen.getByRole("navigation", { name: "Landing page mobile" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getByRole("link", { name: "Explore" })).toBe(document.activeElement);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(menu.hidden).toBe(true);
  });

  it("keeps the mobile surface width-safe and disables entrance motion when requested", () => {
    const { container } = render(<LandingPage />);

    const main = container.querySelector("main");
    expect(main?.className).toContain("min-w-0");
    expect(main?.className).toContain("overflow-x-clip");
    expect(screen.getByTestId("world-locations-map").getAttribute("class")).toContain("w-full");
    const styles = [...container.querySelectorAll("style")].map((style) => style.textContent).join("\n");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("animation: none");
  });

  it("hydrates the server-rendered landing route without a warning", async () => {
    const element = landingRoute();
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
