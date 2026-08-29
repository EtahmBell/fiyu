// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MarketingLayout from "@/app/(marketing)/layout";
import PublicLandingPage from "@/app/(marketing)/page";
import { LandingPage } from "@/components/landing-page/LandingPage";
import {
  ALL_FICTIONAL_EXAMPLES,
  LOCATION_SETS,
} from "@/components/landing-page/fictionalRestaurantExamples";
import { TOKYO_AREAS } from "@/components/landing-page/landingAreas";
import { IMAGE_SLOTS } from "@/components/landing-page/imageSlots";
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
  // The test covers the image contract rather than Next.js optimization
  // internals. `fill` and `priority` are dropped rather than forwarded: React
  // warns about them on a plain <img>, and the hydration test below asserts a
  // silent console, which a noisy mock would quietly weaken.
  default: (
    all: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean },
  ) => {
    const { alt, fill, priority, ...props } = all;
    void fill;
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ""} {...props} />;
  },
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

/**
 * Count descendants carrying a class, matched on the class list.
 *
 * Not an attribute selector: jsdom's selector engine rejects escaped arbitrary
 * Tailwind values like `.aspect-\[3\/2\]`.
 */
function countWithClass(root: Element, className: string): number {
  return [...root.querySelectorAll("[class]")].filter((element) =>
    (element.getAttribute("class") ?? "").split(" ").includes(className),
  ).length;
}

function landingRoute() {
  return (
    <MarketingLayout>
      <PublicLandingPage />
    </MarketingLayout>
  );
}

/** Section order, top to bottom, keyed by a heading only that section has. */
const STEP_TITLES = [
  "Tell us what you like",
  "Receive a few considered picks",
  "Reveal, save, and visit",
];

const NARRATIVE = [
  "Hidden places. Carefully uncovered.",
  "Worth finding isn’t always easy to find.",
  "How Fiyu works",
  "Look beyond what rises to the top.",
  "Only a few.",
  "Picked around where you are.",
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
    expect(footer.getByText("© 2026 Fiyu.")).toBeTruthy();
    expect(footer.getByRole("link", { name: "Natural Earth" }).getAttribute("href")).toBe(
      "https://www.naturalearthdata.com/",
    );
  });

  it("shares one measure across the header, every section, and the footer", () => {
    const { container } = render(landingRoute());

    const measured = [...container.querySelectorAll("[class]")].filter((element) =>
      (element.getAttribute("class") ?? "").split(" ").includes(MEASURE_CLASS),
    );
    expect(measured.length).toBeGreaterThanOrEqual(9);
    for (const element of measured) {
      const className = element.getAttribute("class") ?? "";
      expect(className).toContain("px-5");
      expect(className).toContain("lg:px-12");
    }
  });

  it("composes the nine movements in narrative order", () => {
    render(<LandingPage />);

    const positions = NARRATIVE.map((name) => {
      const section = screen.getByRole("heading", { name }).closest("section");
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

describe("landing choreography", () => {
  it("has no scroll-position machinery left anywhere on the page", () => {
    const { container } = render(<LandingPage />);

    // Three passes of scroll-linked transforms produced dead viewports and
    // half-played compositions in a real browser while passing every geometry
    // test written against them. The approach is gone, not tuned again.
    for (const dead of [
      ".fiyu-lp-scene",
      ".fiyu-lp-runway",
      ".fiyu-lp-stage",
      ".fiyu-lp-stage-item",
      ".fiyu-lp-stage-exit",
      ".fiyu-lp-stage-fade",
    ]) {
      expect(container.querySelector(dead), `${dead} should no longer exist`).toBeNull();
    }
    for (const element of container.querySelectorAll("[class]")) {
      const className = element.getAttribute("class") ?? "";
      expect(className, `runway declaration left on ${className}`).not.toContain("--runway");
    }
  });

  it("gives every entrance a single destination it settles at", () => {
    const { container } = render(<LandingPage />);

    // No `--from` / `--span` windows any more: an entrance either has not played
    // or has finished. There is no third state to be caught in, and nothing
    // un-plays when a reader scrolls back up.
    const animated = [...container.querySelectorAll("[data-in]")];
    expect(animated.length).toBeGreaterThan(20);
    for (const element of animated) {
      const inline = element.getAttribute("style") ?? "";
      expect(inline).not.toContain("--from");
      expect(inline).not.toContain("--span");
    }
  });

  it("measures nothing in raw vh", () => {
    const { container } = render(<LandingPage />);

    // vh changes as a mobile toolbar hides, which would resize a section
    // mid-scroll. svh does not; nothing on the page needs either any more.
    for (const element of container.querySelectorAll("[class]")) {
      const className = element.getAttribute("class") ?? "";
      expect(className, `raw vh unit on ${className}`).not.toMatch(/[\s[:(][\d.]+vh[\])\s]/);
    }
  });

  it("never asks the network for anything while the page renders", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(<LandingPage />);

    // Card photos cost a billed Google call each. This page draws or declares
    // its imagery instead, so a visit must be free.
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByTestId("restaurant-photo-region")).toBeNull();
  });

  it("shows no implementation notes to visitors", () => {
    const { container } = render(<LandingPage />);

    // "Illustration. In the application, cards carry photographs from Google
    // Maps." was true, and none of a visitor's business.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/In the application/i);
    expect(text).not.toMatch(/Illustration\./);
    expect(text).not.toMatch(/placeholder|TODO|fallback/i);
  });
});

describe("landing hero", () => {
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

  it("states above the fold that Fiyu is more than its first city", () => {
    render(<LandingPage />);

    const hero = screen.getByTestId("landing-wordmark").closest("section");
    if (!hero) throw new Error("Expected a hero section");
    const rail = within(hero);
    expect(rail.getByText("Tokyo")).toBeTruthy();
    expect(rail.getByText("New York")).toBeTruthy();
    expect(rail.getByText("More cities")).toBeTruthy();
    expect(hero.querySelectorAll("h1, h2, h3")).toHaveLength(1);
  });

  it("owns the overlapping card composition, and does not repeat it later", () => {
    render(<LandingPage />);

    // Opening and closing on the same object is most of why the imagery read as
    // thin. The composition now appears exactly once, in the hero.
    const compositions = screen.getAllByTestId("pick-composition");
    expect(compositions).toHaveLength(1);
    expect(compositions[0].closest("section")).toBe(
      screen.getByTestId("landing-wordmark").closest("section"),
    );

    const composition = within(compositions[0]);
    expect(composition.getAllByTestId("example-pick-card")).toHaveLength(1);
    expect(composition.getAllByTestId("example-pick-card-brief")).toHaveLength(1);
    // The concealed layer never hides content from the document: the middle
    // card's restaurant is rendered underneath its veil, not swapped in later.
    expect(composition.getByText("月のそば")).toBeTruthy();
    expect(composition.getByText("黄金食堂")).toBeTruthy();
    expect(compositions[0].querySelector(".fiyu-lp-veil")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("marks every scored composition as illustrative", () => {
    render(<LandingPage />);

    // The score mark is the product and stays, but a card that looks like the
    // app and carries a number has to say whose number it is.
    expect(screen.getAllByLabelText("Fiyu score 8.6 out of 10").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Fiyu score unavailable")).toBeNull();
    expect(screen.getAllByTestId("illustrative-note").length).toBeGreaterThanOrEqual(4);
  });
});

describe("landing narrative sections", () => {
  it("leads on the photograph and annotates one sample discovery", () => {
    render(<LandingPage />);

    const plate = screen.getByRole("img", {
      name: "A line illustration of a small independent restaurant counter, drawn for Fiyu",
    });
    const moment = plate.closest("section");
    if (!moment) throw new Error("Expected the restaurant moment section");
    const scene = within(moment);

    // A fixed aspect box, so the real photograph drops in with no layout shift.
    expect(countWithClass(moment, "aspect-[4/3]")).toBe(1);

    // "Sample", not "A": the restaurant is invented, and Fiyu has not evaluated
    // a business that does not exist, so the recorded band is gone too.
    expect(scene.getByText("Sample Fiyu discovery")).toBeTruthy();
    expect(scene.queryByText("A Fiyu discovery")).toBeNull();
    expect(scene.queryByText("Exceptional")).toBeNull();

    // Seoul: the first quiet signal that the system is not Tokyo-shaped.
    expect(scene.getByText("Yeonhwa Gukbap")).toBeTruthy();
    expect(scene.getByText("Euljiro, Seoul")).toBeTruthy();
    expect(scene.getByText("Gukbap / Korean comfort food")).toBeTruthy();
    expect(scene.getByLabelText("Fiyu score 8.7 out of 10")).toBeTruthy();
  });

  it("drives three product states from position, reversibly, and by click", async () => {
    const { container } = render(<LandingPage />);

    const workflow = screen.getByRole("heading", { name: "How Fiyu works" }).closest("section");
    if (!workflow) throw new Error("Expected the workflow section");

    // No runway. Sticky only up to `lg`, where the columns stack; above that the
    // two columns are the same height and nothing needs to stick.
    expect(workflow.querySelector(".fiyu-lp-scene")).toBeNull();
    const surfaceWrapper = workflow.querySelector(".sticky");
    expect(surfaceWrapper?.getAttribute("class")).toContain("lg:static");

    const steps = [...workflow.querySelectorAll("li[data-active]")];
    expect(steps).toHaveLength(3);
    expect(steps.filter((step) => step.getAttribute("data-active") === "true")).toHaveLength(1);

    const surface = screen.getByTestId("workflow-surface");
    expect(surface.getAttribute("data-step")).toBe("0");
    expect(surface.getAttribute("aria-hidden")).toBe("true");
    // Label, the two cross-fading layers in one bordered well, and the credit.
    expect(surface.children).toHaveLength(3);
    expect(surface.querySelectorAll(".absolute.inset-0")).toHaveLength(2);
    // One label above the panel that names the current state, and no outer card:
    // two hairlines and the picks' own white define the surface.
    expect(within(surface).getByText("Your tastes")).toBeTruthy();
    expect(surface.getAttribute("class")).not.toContain("rounded-card");
    expect(within(surface).getAllByTestId("example-pick-card-brief")).toHaveLength(3);

    // The demonstration is New York, so the product does not read as Tokyo-shaped.
    expect(within(surface).getByText("Canal Claypot")).toBeTruthy();
    expect(within(surface).getAllByText("Lower East Side").length).toBeGreaterThan(0);

    // Every step heading is a control, and the copy is visible either way, so
    // nothing is gated behind the interaction.
    const controls = STEP_TITLES.map((title) => screen.getByRole("button", { name: new RegExp(title) }));
    expect(controls).toHaveLength(3);
    for (const entry of STEP_TITLES) expect(screen.getByRole("heading", { name: entry })).toBeTruthy();

    // Forward, and then back: the state follows the request in both directions,
    // and a click never moves the document -- the whole band already fits a
    // screen, so scrolling it could only make the framing worse.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    for (const index of [1, 2, 1, 0]) {
      fireEvent.click(controls[index]);
      expect(surface.getAttribute("data-step")).toBe(String(index));
      expect(steps[index].getAttribute("data-active")).toBe("true");
      expect(steps[index].getAttribute("aria-current")).toBe("step");
    }
    expect(scrollIntoView).not.toHaveBeenCalled();

    // Keyboard reaches the same control, since it is a real button.
    controls[2].focus();
    expect(document.activeElement).toBe(controls[2]);
    fireEvent.click(controls[2]);
    expect(surface.getAttribute("data-step")).toBe("2");
    expect(surface.querySelector('[data-tone="saved"]')).toBeTruthy();

    // No popularity control is drawn: the product has no popularity data yet.
    expect(container.textContent).not.toMatch(/Popular favourites|Hidden gems/i);
  });

  it("explains underexposure compactly, with nothing overlapping anything", () => {
    render(<LandingPage />);

    const section = screen
      .getByRole("heading", { name: "Look beyond what rises to the top." })
      .closest("section");
    if (!section) throw new Error("Expected the Look beyond section");
    const scene = within(section);
    for (const label of [
      "Local-language context",
      "Independent",
      "Strong local signals",
      "Underexposed",
    ]) {
      expect(scene.getByText(label)).toBeTruthy();
    }

    // The floated card that used to cut through the paragraph is gone; the
    // section resolves into one ruled line instead.
    expect(scene.queryAllByTestId("example-pick-card")).toHaveLength(0);
    expect(scene.getByText("Then one place worth going")).toBeTruthy();
    expect(section.querySelector('[class*="-mt-2"]')).toBeNull();
  });

  it("reveals exactly three discoveries in ordinary document flow", () => {
    render(<LandingPage />);

    const philosophy = screen.getByRole("heading", { name: "Only a few." }).closest("section");
    if (!philosophy) throw new Error("Expected the Only a few section");

    // The runway is gone. It survived three timing passes and a browser
    // recording still showed an empty viewport inside it, so the wrapper itself
    // was the defect.
    expect(philosophy.querySelector(".fiyu-lp-scene")).toBeNull();
    expect(philosophy.querySelector(".fiyu-lp-runway")).toBeNull();
    expect(countWithClass(philosophy, "sticky")).toBe(0);

    // Three shelves ruled from the first paint, three cards that only change
    // opacity: the final layout exists before any card does, so an arrival
    // cannot move anything.
    const arrivals = [...philosophy.querySelectorAll("[data-arrival]")];
    expect(arrivals).toHaveLength(3);
    expect(philosophy.querySelector('[data-arrival="4"]')).toBeNull();
    for (const arrival of arrivals) {
      expect(arrival.getAttribute("class")).toContain("fiyu-lp-settle");
      // A delay, never a scroll window: it plays once and stays.
      expect(arrival.getAttribute("style")).toContain("--settle-delay");
    }
    expect(within(philosophy).getByText("A slower reveal")).toBeTruthy();
    expect(
      within(philosophy).getByText(
        /A small, personal selection from a much broader pool of strong restaurants/,
      ),
    ).toBeTruthy();
  });
});

describe("landing rollout, edition and close", () => {
  it("explains that Picks start from where you are, and lets a reader switch", () => {
    const { container } = render(<LandingPage />);

    expect(screen.getByText("Local by design")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Picked around where you are." })).toBeTruthy();
    expect(
      screen.getByText(
        "When you ask for new Picks, Fiyu starts with where you are and surfaces a few nearby places worth finding.",
      ),
    ).toBeTruthy();

    // The overlap arithmetic is gone: it asked a visitor to compare nine names
    // to feel something, and it was never the behaviour worth a whole section.
    expect(container.textContent).not.toMatch(/appears in two of these three/i);
    expect(container.textContent).not.toMatch(/Someone near/i);
    expect(screen.queryByText("Also another selection")).toBeNull();

    // Two starting points, and the Picks visibly change between them.
    const surface = screen.getByTestId("location-surface");
    expect(surface.getAttribute("data-location")).toBe(LOCATION_SETS[0].id);
    const [first, second] = LOCATION_SETS;
    expect(within(surface).getByText(first.picks[0].name)).toBeTruthy();

    // Three recognisable areas, as restrained text tabs rather than pills.
    expect(LOCATION_SETS.map((entry) => entry.area)).toEqual(["Shinjuku", "Shibuya", "Ginza"]);
    for (const entry of LOCATION_SETS) {
      const tab = within(surface).getByRole("button", { name: entry.area });
      expect(tab.getAttribute("class")).toContain("min-h-11");
      expect(tab.getAttribute("class")).not.toContain("rounded-chip");
    }

    const control = within(surface).getByRole("button", { name: second.area });
    expect(control.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(control);
    expect(surface.getAttribute("data-location")).toBe(second.id);
    expect(control.getAttribute("aria-pressed")).toBe("true");
    expect(within(surface).getByText(second.picks[0].name)).toBeTruthy();
    expect(within(surface).queryByText(first.picks[0].name)).toBeNull();

    // And the third state works too.
    fireEvent.click(within(surface).getByRole("button", { name: LOCATION_SETS[2].area }));
    expect(surface.getAttribute("data-location")).toBe(LOCATION_SETS[2].id);
    expect(within(surface).getByText(LOCATION_SETS[2].picks[0].name)).toBeTruthy();

    // And it does not claim Picks follow a reader around.
    expect(
      screen.getByText(/Your location is used at the moment a selection is made/),
    ).toBeTruthy();
  });

  it("gives every city an explicit state on one keyboard-accessible plate", () => {
    render(<LandingPage />);

    const map = screen.getByTestId("world-locations-map");
    expect(map.getAttribute("role")).toBe("img");
    expect(map.getAttribute("viewBox")).toBe("0 0 900 450");
    expect(map.getAttribute("class")).toContain("w-full");
    expect(map.getAttribute("class")).toContain("max-w-full");

    // No scroll-linked transform survives on the plate: the pan-and-zoom that
    // was always mid-flight is replaced by one entrance and an ambient drift.
    const rollout = screen.getByRole("heading", { name: "Fiyu opens city by city." }).closest("section");
    if (!rollout) throw new Error("Expected the locations section");
    expect(rollout.querySelector(".fiyu-lp-scene")).toBeNull();
    expect(rollout.querySelector(".fiyu-lp-map-drift")).toBeTruthy();

    // NOW / NEXT / THEN are stated, not implied by an interpolated opacity.
    expect([...rollout.querySelectorAll("[data-rollout]")].map((row) => row.getAttribute("data-rollout")))
      .toEqual(["Tokyo", "New York", "Where next?"]);
    for (const state of ["Now", "Next", "Then"]) {
      expect(within(rollout).getByText(state)).toBeTruthy();
    }
    // Once in the rollout row, once on the plate label.
    expect(within(rollout).getAllByText("October 2026")).toHaveLength(2);

    expect(map.querySelectorAll('[data-location-status="available"]')).toHaveLength(1);
    const tokyo = within(map).getByRole("link", { name: "Tokyo — Available now" });
    expect(tokyo.getAttribute("href")).toBe("/signin?next=/picks");
    tokyo.focus();
    expect(document.activeElement).toBe(tokyo);
    expect(screen.queryByRole("link", { name: /New York|Rome/i })).toBeNull();
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
    expect(dialog.className).toContain("overflow-y-auto");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Where should Fiyu go next?" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("frames Tokyo as one concise edition of a series", () => {
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

    // The plate is bounded rather than full bleed at its natural ratio, which is
    // what let this section grow past a viewport and a quarter.
    // A short wide crop at a bounded height. An aspect box takes its height from
    // the column, which is how this section twice ended up the tallest one.
    const figure = screen.getByTestId("city-edition-plate");
    expect(figure.getAttribute("class")).toContain("h-[9rem]");
    expect(countWithClass(figure, "aspect-[3/2]")).toBe(0);

    // Three short columns under one hairline and above another: a band, not a
    // feature block. The row is only as tall as its tallest column.
    expect(countWithClass(edition, "lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.05fr)_minmax(0,1.05fr)]")).toBe(1);
    const plate = within(figure).getByRole("img", {
      name: "A line illustration looking out from a restaurant table onto a quiet Tokyo street",
    });
    expect(plate.getAttribute("src")).toBe("/images/log-empty-table.png");
    expect(plate.getAttribute("loading")).toBe("lazy");
    expect(edition.querySelector('img[src="/og.png"]')).toBeNull();
  });

  it("closes on Tokyo coverage rather than on a sample of restaurants", () => {
    render(<LandingPage />);

    const closing = screen.getByRole("heading", { name: "Your next few are waiting." }).closest("section");
    if (!closing) throw new Error("Expected the closing section");
    expect(closing.querySelector('[data-testid="pick-composition"]')).toBeNull();

    // Areas, not restaurants. Eight restaurant names were an arbitrary sample
    // that said nothing about how much of the city Fiyu knows.
    const colophon = screen.getByTestId("coverage-areas");
    const listed = [...colophon.querySelectorAll("li")].map((item) => item.textContent);
    expect(listed).toEqual([...TOKYO_AREAS]);
    expect(listed.length).toBeGreaterThanOrEqual(30);
    expect(within(closing).getByText("In Tokyo now")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read about Fiyu" }).getAttribute("href")).toBe("/about");

    // The two the brief named explicitly, plus the recognisable openers.
    for (const area of ["Shinjuku", "Kichijoji", "Shibuya", "Ginza", "Asakusa"]) {
      expect(listed, `${area} should be listed`).toContain(area);
    }
    // No restaurant names, and nothing administrative.
    for (const name of ["すし善", "江戸酒場 海", "ずるり 谷中総本店"]) {
      expect(listed).not.toContain(name);
    }
    for (const area of listed) {
      expect(area).not.toMatch(/Chome|\d|,/);
    }
  });

  it("keeps raw geocoder labels off the public page", () => {
    const { container } = render(<LandingPage />);

    // "3 Chome Sendagi" is a field, not a place a person would name.
    expect(container.textContent).not.toContain("Chome");
    expect(screen.getAllByText("Shinjuku").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Koenji").length).toBeGreaterThan(0);
  });

  it("shows no real catalog restaurant anywhere on the page", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";

    // Every restaurant that used to appear here was a real published discovery.
    // Printing those on a public page overexposes the places Fiyu exists to
    // protect, so all of them are gone and the fixture that held them is deleted.
    for (const real of [
      "江戸酒場 海",
      "Edo Sakaba Umi",
      "すし善",
      "Sushizen",
      "沖縄そば屋 ちょこっと",
      "さるり 谷中総本店",
      "ONDER",
      "維摩",
      "Yuima",
    ]) {
      expect(text, `${real} must not appear`).not.toContain(real);
    }

    // Nothing rendered here can be resolved to an entity.
    for (const example of ALL_FICTIONAL_EXAMPLES) {
      expect(example.key).not.toMatch(/^ChIJ/);
    }
    expect(screen.getAllByTestId("illustrative-note").length).toBeGreaterThanOrEqual(4);
  });

  it("declares the photography it is still waiting on", () => {
    // Slots, not hardcoded files: an operator sets one `src` and the layout does
    // not move, because every slot renders inside a fixed aspect box.
    for (const slot of Object.values(IMAGE_SLOTS)) {
      expect(slot.brief.length).toBeGreaterThan(40);
      expect(slot.aspect).toMatch(/^\d+:\d+$/);
      if (slot.src === null) expect(slot.fallback).toBeTruthy();
    }
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
  it("settles every scene and every entrance when motion is not wanted", () => {
    stubReducedMotion();
    const { container } = render(<LandingPage />);

    for (const scene of container.querySelectorAll(".fiyu-lp-scene")) {
      expect((scene as HTMLElement).style.getPropertyValue("--scene-progress")).toBe("");
    }

    // The stepped surface needs no special case: it is driven by position and by
    // clicks, neither of which is motion, so it behaves identically and starts
    // on its first state with all three steps readable and operable.
    const surface = screen.getByTestId("workflow-surface");
    expect(surface.getAttribute("data-step")).toBe("0");
    for (const title of STEP_TITLES) {
      expect(screen.getByRole("button", { name: new RegExp(title) })).toBeTruthy();
    }

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

    // Every motion-preference guard also asks whether scripting can release what
    // it hides. Without both, JavaScript off means content off.
    const guards = stylesheet.split("@media (prefers-reduced-motion: no-preference)");
    expect(guards.length).toBeGreaterThanOrEqual(3);
    for (const block of guards.slice(1)) {
      expect(block).toContain("@media (scripting: enabled)");
    }

    // Nothing that hides an element may exist outside those guards.
    const unguarded = stylesheet.split("@media (scripting: enabled)")[0];
    for (const rule of [".fiyu-lp-rise,", ".fiyu-lp-rule {", ".fiyu-lp-path {"]) {
      expect(unguarded).not.toContain(rule);
    }

    // No scroll-progress arithmetic survives in the stylesheet either.
    expect(stylesheet).not.toContain("--scene-progress");
    expect(stylesheet).not.toContain("--from");
    expect(stylesheet).not.toContain("clamp(0, calc(");
  });

  it("keeps the mobile surface width-safe", () => {
    const { container } = render(<LandingPage />);

    const main = container.querySelector("main");
    expect(main?.className).toContain("min-w-0");
    expect(main?.className).toContain("overflow-x-clip");
    expect(screen.getByTestId("world-locations-map").getAttribute("class")).toContain("w-full");
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
