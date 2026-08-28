// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MarketingLayout from "@/app/(marketing)/layout";
import PublicLandingPage from "@/app/(marketing)/page";
import { LandingPage } from "@/components/landing-page/LandingPage";
import { SELECTION_COLUMNS, SHARED_SELECTION_ID } from "@/components/landing-page/landingExamples";
import { WORLD_LAND_PATH } from "@/components/landing-page/worldLandPath";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

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

beforeEach(() => {
  clearProfileIdentity();
  window.localStorage.removeItem("fiyu:next-city-voter:v1");
});

afterEach(() => {
  cleanup();
  clearProfileIdentity();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The one measure every landing surface shares. */
const MEASURE_CLASS = "max-w-[90rem]";

function landingRoute() {
  return (
    <MarketingLayout>
      <PublicLandingPage />
    </MarketingLayout>
  );
}

/** Section order, top to bottom, keyed by a heading that only that section has. */
const NARRATIVE = [
  "Hidden places. Carefully uncovered.",
  "Worth finding isn’t always easy to find.",
  "How Fiyu works",
  "Only a few.",
  "A few for you.Different for someone else.",
  "Look beyond what rises to the top.",
  "Fiyu opens city by city.",
  "Fiyu has arrived in Tokyo.",
  "Your next few are waiting.",
];

describe("public landing experience", () => {
  it("renders dedicated landing chrome at / without application navigation", async () => {
    render(landingRoute());

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Fiyu home" }).getAttribute("href")).toBe("/");
    expect(within(header).getByRole("link", { name: "About" }).getAttribute("href")).toBe("/about");
    expect(within(header).getByRole("link", { name: "Contact" }).getAttribute("href")).toBe("/contact");
    expect((await within(header).findByRole("link", { name: "Sign in" })).getAttribute("href")).toBe("/signin");
    expect(within(header).getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/signup");
    const exploreActions = screen.getAllByRole("link", { name: "Explore Tokyo" });
    expect(exploreActions.length).toBeGreaterThanOrEqual(3);
    expect(exploreActions.map((action) => action.getAttribute("href"))).toEqual(
      exploreActions.map(() => "/signin?next=/picks"),
    );
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Mobile primary" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });

  it("sends an authenticated visitor directly to Picks from every entry point", () => {
    publishProfileIdentity({
      user_id: "user-1",
      username: "ethan",
      display_name: "Ethan",
      bio: null,
      avatar_url: null,
      created_at: "2026-08-10T00:00:00Z",
      updated_at: "2026-08-10T00:00:00Z",
    });
    render(<LandingPage />);

    for (const action of screen.getAllByRole("link", { name: "Explore Tokyo" })) {
      expect(action.getAttribute("href")).toBe("/picks");
    }
    expect(screen.getByRole("link", { name: "Tokyo — Available now" }).getAttribute("href")).toBe("/picks");
  });

  it("keeps the footer to real destinations, with attribution split from navigation", () => {
    render(landingRoute());

    const footer = within(screen.getByRole("contentinfo"));
    const links = footer.getAllByRole("navigation", { name: "Landing footer" });
    expect(links).toHaveLength(1);
    expect(
      within(links[0]).getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/about", "/contact", "/privacy", "/terms"]);

    // Same-page section anchors belong in the header, not the footer.
    expect(footer.queryByRole("link", { name: "How Fiyu works" })).toBeNull();
    expect(footer.queryByRole("link", { name: "Only a few." })).toBeNull();

    expect(footer.getByText("© 2026 Fiyu.")).toBeTruthy();
    expect(footer.getByRole("link", { name: "Natural Earth" }).getAttribute("href")).toBe(
      "https://www.naturalearthdata.com/",
    );
  });

  it("shares one measure across the header, every section, and the footer", () => {
    const { container } = render(landingRoute());

    // Matched on the class list rather than with an escaped attribute
    // selector, which jsdom’s selector engine rejects for arbitrary values.
    const measured = [...container.querySelectorAll("[class]")].filter((element) =>
      (element.getAttribute("class") ?? "").split(" ").includes(MEASURE_CLASS),
    );
    expect(measured.length).toBeGreaterThanOrEqual(9);
    for (const element of measured) {
      expect(element.className).toContain("px-5");
      expect(element.className).toContain("lg:px-12");
    }
  });

  it("composes the nine movements in narrative order", () => {
    render(<LandingPage />);

    const positions = NARRATIVE.map((name) => {
      const heading = screen.getByRole("heading", { name });
      const section = heading.closest("section");
      if (!section) throw new Error(`No section around: ${name}`);
      return section;
    });

    for (let index = 1; index < positions.length; index += 1) {
      const follows = Boolean(
        positions[index - 1].compareDocumentPosition(positions[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(follows, `${NARRATIVE[index]} should follow ${NARRATIVE[index - 1]}`).toBe(true);
    }
  });
});

describe("landing hero and product composition", () => {
  it("renders the approved hero copy and responsive wordmark treatment", () => {
    render(<LandingPage />);

    const wordmark = screen.getByTestId("landing-wordmark");
    expect(wordmark.textContent).toBe("Fiyu");
    expect(wordmark.className).toContain("text-[clamp(4.5rem,13vw,10rem)]");
    expect(
      screen.getByRole("heading", { level: 1, name: "Hidden places. Carefully uncovered." }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Fiyu combines local-language research, machine learning, and your feedback to uncover independent, underexposed restaurants suited to your tastes.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "See how Fiyu works" }).getAttribute("href")).toBe(
      "#how-it-works",
    );
    expect(screen.getByText("Selected around you.")).toBeTruthy();
  });

  it("states globally that Fiyu is more than its first city, above the fold", () => {
    render(<LandingPage />);

    const hero = screen.getByTestId("landing-wordmark").closest("section");
    if (!hero) throw new Error("Expected a hero section");
    const rail = within(hero);
    expect(rail.getByText("Tokyo")).toBeTruthy();
    expect(rail.getByText("New York")).toBeTruthy();
    expect(rail.getByText("More cities")).toBeTruthy();
    // One heading in the hero: the cards are a captioned figure, not a section.
    expect(hero.querySelectorAll("h1, h2, h3")).toHaveLength(1);
  });

  it("builds the hero from real published picks in both card states", () => {
    render(<LandingPage />);

    const hero = screen.getByTestId("hero-nearby-figure");
    const composition = within(hero).getByTestId("pick-composition");

    // A revealed pick, a brief pick under a lifted veil, and a concealed card.
    expect(within(composition).getAllByTestId("example-pick-card")).toHaveLength(1);
    expect(within(composition).getAllByTestId("example-pick-card-brief")).toHaveLength(1);
    expect(within(composition).getAllByTestId("example-concealed-card").length).toBeGreaterThanOrEqual(2);
    expect(within(composition).getAllByText("Not yet revealed").length).toBeGreaterThanOrEqual(2);

    // The concealed layer never hides content from the document: the middle
    // card's restaurant is rendered underneath its veil, not swapped in later.
    expect(within(composition).getByText("維摩（ユイマ）")).toBeTruthy();
    expect(within(composition).getByText("沖縄そば屋 ちょこっと")).toBeTruthy();
    expect(composition.querySelector(".fiyu-lp-veil")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(composition).getByText(/Published Fiyu discoveries in Tokyo/)).toBeTruthy();
  });

  it("publishes real Fiyu scores on the cards rather than invented ones", () => {
    render(<LandingPage />);

    // 86.7 out of 100 is what the catalog holds; 8.7 is Fiyu's public scale.
    expect(screen.getAllByLabelText("Fiyu score 8.7 out of 10").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Fiyu score unavailable")).toBeNull();
  });

  it("never asks the network for anything while the page renders", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(<LandingPage />);

    // Card photos cost a billed Google call each. The landing page draws its
    // plates instead, so a visit must be free.
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByTestId("restaurant-photo-region")).toBeNull();
  });

  it("closes on the composition it opened with", () => {
    render(<LandingPage />);

    expect(screen.getAllByTestId("pick-composition")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Your next few are waiting." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read about Fiyu" }).getAttribute("href")).toBe("/about");
  });
});

describe("landing narrative sections", () => {
  it("puts a restaurant on screen first, captioned as an illustration", () => {
    render(<LandingPage />);

    const plate = screen.getByRole("img", {
      name: "A line illustration of a small independent restaurant counter, drawn for Fiyu",
    });
    expect(plate.getAttribute("src")).toBe("/images/about-storefront.png");
    const moment = plate.closest("section");
    if (!moment) throw new Error("Expected the restaurant moment section");
    const scene = within(moment);
    expect(
      scene.getByText("Illustration. In the application, cards carry photographs from Google Maps."),
    ).toBeTruthy();
    expect(scene.getByText("A Fiyu discovery")).toBeTruthy();
    expect(scene.getByText("江戸酒場 海")).toBeTruthy();
    expect(scene.getByText("Izakaya / standing bar")).toBeTruthy();
    expect(scene.getByText("2 Chome Jingumae")).toBeTruthy();
    // Cropped with clip-path, so the section never reflows as it is scrubbed.
    expect(moment.querySelector(".fiyu-lp-crop")).toBeTruthy();
  });

  it("keeps the three workflow steps and shows them on a Fiyu surface", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "Tell us what you like" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Receive a few considered picks" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reveal, save, and visit" })).toBeTruthy();

    const surface = screen.getByTestId("workflow-surface");
    expect(surface.getAttribute("data-step")).toBe("0");
    expect(within(surface).getByText("Your tastes")).toBeTruthy();
    // No popularity control is drawn: the product has no popularity data yet.
    expect(screen.queryByText(/Popular favourites|Hidden gems/i)).toBeNull();

    // A fixed height, so swapping the three states cannot shift the page
    // beneath a reader who is scrolling it.
    const stateBox = surface.firstElementChild?.getAttribute("class") ?? "";
    expect(stateBox).toContain("h-[22rem]");
    expect(stateBox).not.toContain("min-h-");
  });

  it("accumulates exactly three discoveries under Only a few", () => {
    render(<LandingPage />);

    const philosophy = screen.getByRole("heading", { name: "Only a few." }).closest("section");
    if (!philosophy) throw new Error("Expected the Only a few section");
    expect(philosophy.querySelectorAll("[data-arrival]")).toHaveLength(3);
    expect(philosophy.querySelector('[data-arrival="4"]')).toBeNull();
    expect(within(philosophy).getByText("A slower reveal")).toBeTruthy();
    expect(
      within(philosophy).getByText(
        /Great small restaurants can struggle with sudden attention\. Fiyu reveals discoveries gradually through small, personalized selections/,
      ),
    ).toBeTruthy();
    expect(
      within(philosophy).getByText(/By varying recommendations across users instead of directing everyone/),
    ).toBeTruthy();
    expect(screen.queryByText(/Three, not three hundred/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /Why only a few restaurants at a time/ })).toBeNull();
  });

  it("shows three overlapping-but-different selections and states the overlap", () => {
    render(<LandingPage />);

    const slots = SELECTION_COLUMNS.flatMap((column) => column.picks);
    expect(slots).toHaveLength(9);
    expect(new Set(slots.map((pick) => pick.id)).size).toBe(8);
    expect(slots.filter((pick) => pick.id === SHARED_SELECTION_ID)).toHaveLength(2);

    expect(screen.getByText("Someone near Yanaka")).toBeTruthy();
    expect(screen.getByText("Someone near Setagaya")).toBeTruthy();
    expect(screen.getByText("Someone near Tsukiji")).toBeTruthy();
    // The overlap is named, not only tinted.
    expect(screen.getAllByText("Also another selection")).toHaveLength(2);
    expect(
      screen.getByText("One place appears in two of these three selections. The other seven appear once."),
    ).toBeTruthy();
  });

  it("explains underexposure with signals rather than an algorithm diagram", () => {
    render(<LandingPage />);

    const section = screen
      .getByRole("heading", { name: "Look beyond what rises to the top." })
      .closest("section");
    if (!section) throw new Error("Expected the Look beyond section");
    const scene = within(section);
    expect(scene.getByText("Local-language context")).toBeTruthy();
    expect(scene.getByText("Independent and owner-run")).toBeTruthy();
    expect(scene.getByText("Strong local reception")).toBeTruthy();
    expect(scene.getByText("Less visible than it deserves")).toBeTruthy();
    expect(scene.getByText("Then one place worth going.")).toBeTruthy();
    expect(scene.getAllByTestId("example-pick-card")).toHaveLength(1);
  });
});

describe("landing rollout, edition and safeguards", () => {
  it("rolls out city by city on one keyboard-accessible world plate", () => {
    render(<LandingPage />);

    const map = screen.getByTestId("world-locations-map");
    expect(map.getAttribute("role")).toBe("img");
    expect(map.getAttribute("viewBox")).toBe("0 0 900 450");
    expect(map.getAttribute("class")).toContain("max-w-full");
    expect(map.getAttribute("class")).toContain("w-full");

    // Exactly one city is available, and only that one is a link.
    expect(map.querySelectorAll('[data-location-status="available"]')).toHaveLength(1);
    const tokyo = within(map).getByRole("link", { name: "Tokyo — Available now" });
    expect(tokyo.getAttribute("href")).toBe("/signin?next=/picks");
    tokyo.focus();
    expect(document.activeElement).toBe(tokyo);
    expect(screen.queryByRole("link", { name: /New York|Rome/i })).toBeNull();

    // The rollout itself is text, present from the first paint.
    const rollout = screen.getByRole("heading", { name: "Fiyu opens city by city." }).closest("section");
    if (!rollout) throw new Error("Expected the locations section");
    expect([...rollout.querySelectorAll("[data-rollout]")].map((row) => row.getAttribute("data-rollout")))
      .toEqual(["Tokyo", "New York", "Where next?"]);
    // Once in the rollout row, once on the plate label.
    expect(within(rollout).getAllByText("October 2026")).toHaveLength(2);
    expect(WORLD_LAND_PATH.length).toBeGreaterThan(10_000);
    expect(WORLD_LAND_PATH.length).toBeLessThan(30_000);
  });

  it("records one lightweight next-city vote and shows the thank-you state", async () => {
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: "vote-1", status: "recorded", created_at: "2026-08-28T00:00:00Z" }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", request);
    render(<LandingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Vote on the next city" }));
    expect(screen.getByText("Where should Fiyu go next?")).toBeTruthy();
    const other = screen.getByRole("button", { name: "Other" });
    fireEvent.click(other);
    expect(other.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("City name"), { target: { value: "Seoul" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));

    expect(await screen.findByText("Thanks for helping choose where Fiyu goes next.")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      voter_id: expect.any(String), choice: "other", other_city: "Seoul",
    });
  });

  it("portals the vote modal to the viewport and restores page scrolling", () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Vote on the next city" }));
    const dialog = screen.getByRole("dialog", { name: "Where should Fiyu go next?" });
    const backdrop = screen.getByTestId("next-city-vote-backdrop");
    expect(backdrop.parentElement).toBe(document.body);
    expect(backdrop.className).toContain("fixed");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Where should Fiyu go next?" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("frames Tokyo as the current edition of a repeatable series", () => {
    render(<LandingPage />);

    const edition = screen.getByRole("heading", { name: "Fiyu has arrived in Tokyo." }).closest("section");
    if (!edition) throw new Error("Expected the city edition section");
    const scene = within(edition);
    expect(scene.getByText("Currently exploring")).toBeTruthy();
    expect(scene.getByText("Edition 01")).toBeTruthy();
    expect(scene.getByText("Next edition")).toBeTruthy();
    expect(
      scene.getByText(
        "Explore Tokyo’s independent and underexposed restaurants, selected around your tastes—from local izakayas to tucked-away ramen counters you might otherwise miss.",
      ),
    ).toBeTruthy();

    const plate = within(screen.getByTestId("city-edition-plate")).getByRole("img", {
      name: "A line illustration looking out from a restaurant table onto a quiet Tokyo street",
    });
    expect(plate.getAttribute("src")).toBe("/images/log-empty-table.png");
    expect(plate.getAttribute("loading")).toBe("lazy");
    expect(plate.getAttribute("width")).toBe("2172");
    expect(plate.getAttribute("height")).toBe("724");
    // The Open Graph artwork is no longer pressed into service as a poster.
    expect(edition.querySelector('img[src="/og.png"]')).toBeNull();
  });

  it("supports a focus-managed mobile menu that closes with Escape", () => {
    render(landingRoute());

    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    const menu = screen.getByRole("navigation", { name: "Landing page mobile" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getByRole("link", { name: "About" })).toBe(document.activeElement);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(menu.hidden).toBe(true);
  });
});

/** Reduced motion, reported the way the hooks read it. */
function stubReducedMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

describe("landing motion safeguards", () => {
  it("settles every scroll-led scene when motion is not wanted", () => {
    stubReducedMotion();
    const { container } = render(<LandingPage />);

    // A scene that is never scrubbed must not leave content behind a scroll.
    for (const scene of container.querySelectorAll(".fiyu-lp-scene")) {
      expect((scene as HTMLElement).style.getPropertyValue("--scene-progress")).toBe("");
    }

    // The stepped surface reports its last step rather than its first.
    const surface = screen.getByTestId("workflow-surface");
    expect(surface.getAttribute("data-step")).toBe("2");
    expect(within(surface).getByText("Discovered")).toBeTruthy();
    expect(surface.querySelector('[data-tone="saved"]')).toBeTruthy();

    // Entrance motion is released rather than waited on.
    for (const element of container.querySelectorAll("[data-in]")) {
      expect(element.getAttribute("data-in")).toBe("true");
    }
  });

  it("keeps the settled state the default state in CSS", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const stylesheet = readFileSync(
      join(process.cwd(), "src", "components", "landing-page", "landing.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    // Every motion-preference guard also asks whether scripting can release
    // what it hides. Without both, JavaScript off means content off.
    const guards = stylesheet.split("@media (prefers-reduced-motion: no-preference)");
    expect(guards.length).toBeGreaterThanOrEqual(3);
    for (const block of guards.slice(1)) {
      expect(block).toContain("@media (scripting: enabled)");
    }

    // Nothing that hides an element may exist outside those guards.
    const unguarded = stylesheet.split("@media (scripting: enabled)")[0];
    for (const rule of [".fiyu-lp-rise,", ".fiyu-lp-settle {", ".fiyu-lp-rule {"]) {
      expect(unguarded).not.toContain(rule);
    }

    // Progress defaults to finished, so `calc()` resolves to the settled frame.
    expect(stylesheet).toContain("--p: var(--scene-progress, 1);");
  });

  it("keeps the mobile surface width-safe and viewport-stable", () => {
    const { container } = render(<LandingPage />);

    const main = container.querySelector("main");
    expect(main?.className).toContain("min-w-0");
    expect(main?.className).toContain("overflow-x-clip");
    expect(screen.getByTestId("world-locations-map").getAttribute("class")).toContain("w-full");

    // Pinned runways are measured in svh, so an iOS toolbar cannot resize a
    // scene mid-scroll and jump the composition.
    const scenes = [...container.querySelectorAll(".fiyu-lp-scene")];
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    for (const scene of scenes) {
      if (!scene.className.includes("h-[")) continue;
      expect(scene.className).toMatch(/h-\[[\d.]+svh\]/);
      expect(scene.className).not.toMatch(/h-\[[\d.]+vh\]/);
    }

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
