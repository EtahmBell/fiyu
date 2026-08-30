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

/** Committed project assets only: no remote sources on this page. */
const LOCAL_ASSET = /^\/landing\/[a-z0-9_]+\.(jpg|png)$/;
const CROP_ANCHOR = /^\d+% \d+%$/;

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
  "Start with where you are",
  "Receive a few considered picks",
  "Reveal, save, and visit",
];

/** Reports a desktop viewport, so the scroll-driven split view is exercised. */
function stubDesktopViewport() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 64rem"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

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
  it("leads on the Seoul photograph and annotates one sample discovery", () => {
    render(<LandingPage />);

    const photo = screen.getByRole("img", {
      name: "A small independent mandu and naengmyeon shop on a quiet Seoul street, its counter visible through the window",
    });
    expect(photo.getAttribute("src")).toContain("korea_fiyu.jpg");
    const moment = photo.closest("section");
    if (!moment) throw new Error("Expected the restaurant moment section");
    const scene = within(moment);

    // Native 3:2 on a phone, so nothing is cropped and the frame stays short;
    // 4:3 from `sm`, the intended large presentation, cropping only horizontally.
    const frame = photo.parentElement?.parentElement;
    expect(frame?.getAttribute("class")).toContain("aspect-[3/2]");
    expect(frame?.getAttribute("class")).toContain("sm:aspect-[4/3]");
    expect(frame?.getAttribute("class")).toContain("overflow-hidden");
    expect(photo.getAttribute("class")).toContain("object-cover");
    expect(photo.getAttribute("style")).toContain("object-position: 50% 50%");
    expect(photo.getAttribute("loading")).toBe("lazy");
    expect(photo.getAttribute("sizes")).toContain("55vw");

    // One marker, not two. The eyebrow does the work.
    expect(scene.getByText("Illustrative discovery")).toBeTruthy();
    expect(scene.queryByText("A Fiyu discovery")).toBeNull();
    expect(scene.queryAllByTestId("illustrative-note")).toHaveLength(0);

    // Seoul: the first quiet signal that the system is not Tokyo-shaped.
    expect(scene.getByText("Yeonhwa Gukbap")).toBeTruthy();
    expect(scene.getByText("Euljiro, Seoul")).toBeTruthy();
    expect(scene.getByLabelText("Fiyu score 8.7 out of 10")).toBeTruthy();
  });

  it("starts the product story at location, not at food preferences", () => {
    const { container } = render(<LandingPage />);
    expect(container.textContent ?? "").not.toContain("Tell us what you like");

    // Fiyu's Picks flow begins with where a reader is. The old step 01 described
    // taste and adventurousness controls the product does not have. Scoped to this
    // section: the hero legitimately says a selection is matched to your tastes,
    // which is personalisation rather than a screen with preference controls on it.
    const section = screen.getByRole("heading", { name: "How Fiyu works" }).closest("section");
    if (!section) throw new Error("Expected the workflow section");
    const sectionText = section.textContent ?? "";
    expect(sectionText).not.toMatch(/adventurous/i);
    expect(sectionText).not.toMatch(/food interests/i);
    expect(sectionText).not.toMatch(/tastes/i);

    expect(screen.getByRole("heading", { name: "Start with where you are" })).toBeTruthy();
    expect(
      screen.getByText("When you ask for new Picks, Fiyu starts with your current location."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Fiyu surfaces a small selection nearby instead of giving you an endless feed.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Explore each place, keep the ones you love, and experience the city thoughtfully.",
      ),
    ).toBeTruthy();

    // State 01 is a place, and the panel header ties the picks to that place
    // through all three states.
    const surface = screen.getByTestId("workflow-surface");
    expect(surface.getAttribute("data-step")).toBe("0");
    expect(within(surface).getByText("Near Lower East Side")).toBeTruthy();
    expect(surface.querySelector("svg")).toBeTruthy();
    // Four cards across two states, not three across one: state 02 offers three
    // equal candidates, and state 03 keeps exactly one of them and opens it.
    expect(within(surface).getAllByTestId("example-pick-card-brief")).toHaveLength(4);
    const detail = within(surface).getByTestId("workflow-saved-detail");
    expect(within(detail).getAllByTestId("example-pick-card-brief")).toHaveLength(1);
  });

  it("drives the phone workflow by tap, never by scroll position", () => {
    render(<LandingPage />);

    // `useIsDesktop` is false on the server and on the first client render, so
    // this is the default path: a phone is never waiting on a media query.
    const tabs = screen.getByTestId("workflow-tabs");
    const controls = STEP_TITLES.map((title) =>
      within(tabs).getByRole("button", { name: new RegExp(title) }),
    );
    expect(controls).toHaveLength(3);
    for (const control of controls) {
      expect(control.getAttribute("class")).toContain("min-h-11");
      expect(control.getAttribute("class")).not.toContain("rounded-chip");
    }

    // The numbered headings are not controls here; the strip is.
    const workflow = tabs.closest("section");
    if (!workflow) throw new Error("Expected the workflow section");
    expect(workflow.querySelectorAll("h3 button")).toHaveLength(0);

    // Nothing sticky, and no page movement when a state changes.
    expect(countWithClass(workflow, "sticky")).toBe(0);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const surface = screen.getByTestId("workflow-surface");
    const steps = [...workflow.querySelectorAll("li[data-active]")];
    for (const index of [1, 2, 1, 0]) {
      fireEvent.click(controls[index]);
      expect(surface.getAttribute("data-step")).toBe(String(index));
      expect(steps[index].getAttribute("data-active")).toBe("true");
      expect(steps[index].getAttribute("aria-current")).toBe("step");
      expect(controls[index].getAttribute("aria-pressed")).toBe("true");
    }
    expect(scrollIntoView).not.toHaveBeenCalled();

    // A compact panel, not the desktop one forced into a phone.
    expect(surface.getAttribute("class")).toContain("h-[22.5rem]");
    expect(surface.getAttribute("class")).toContain("lg:h-[28rem]");
    expect(surface.getAttribute("class")).not.toContain("rounded-card");
  });

  it("changes state only when asked, at every width", () => {
    stubDesktopViewport();
    const { container } = render(<LandingPage />);

    const workflow = screen.getByRole("heading", { name: "How Fiyu works" }).closest("section");
    if (!workflow) throw new Error("Expected the workflow section");

    // Two matched columns, side by side, neither sticky and neither clipped.
    const grid = workflow.querySelector("ol")?.parentElement;
    expect(grid?.getAttribute("class")).toContain("lg:grid-cols-");
    expect(countWithClass(workflow, "sticky")).toBe(0);
    expect(countWithClass(workflow, "lg:h-[28rem]")).toBe(1);

    // Here the numbered headings are the controls, and the button sits inside the
    // heading rather than wrapping it: a button may only contain phrasing content.
    const rowButtons = [...workflow.querySelectorAll("h3 button")];
    expect(rowButtons).toHaveLength(3);

    const surface = screen.getByTestId("workflow-surface");
    const steps = [...workflow.querySelectorAll("li[data-active]")];
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    // Forward and then back, by click, and nothing moves the document.
    for (const index of [1, 2, 1, 0]) {
      fireEvent.click(rowButtons[index]);
      expect(surface.getAttribute("data-step")).toBe(String(index));
      expect(steps[index].getAttribute("data-active")).toBe("true");
      expect(rowButtons[index].getAttribute("aria-pressed")).toBe("true");
    }
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-tabs").getAttribute("class")).toContain("lg:hidden");

    // Nothing observes scroll for this section any more. Two passes of
    // scroll-derived steps never felt deliberate: one wheel gesture could cross
    // all three states before a reader had read one.
    expect(container.querySelectorAll("li[data-active][data-observed]")).toHaveLength(0);
  });

  it("builds the step-01 plate in code rather than depending on an image", () => {
    render(<LandingPage />);

    const surface = screen.getByTestId("workflow-surface");

    const plate = surface.querySelector("svg");
    if (!plate) throw new Error("Expected the step-01 plate");
    // No image dependency in step 01 at all: the plate is markup, so it fills
    // whatever the panel gives it, breathes from the inside, and is coloured by
    // the same tokens as the rest of the page. Scoped to the plate's own layer,
    // because step 03 does legitimately carry photographs on this surface.
    expect(plate.parentElement?.querySelector("img")).toBeNull();
    expect(plate.querySelectorAll("image")).toHaveLength(0);
    // A mild 4:3 holding a square composition, so the subject reads square at
    // every panel width and only the grid runs off the edge.
    expect(plate.getAttribute("viewBox")).toBe("0 0 400 300");
    expect(plate.getAttribute("class")).toContain("size-full");
    // `slice`, never `meet`: a panel of any proportion crops the artwork rather
    // than stretching it.
    expect(plate.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(plate.getAttribute("aria-hidden")).toBe("true");

    // The ingredients: a drifting grid, a breathing local field, three candidates
    // each pinging on its own delay, and the reader's own position.
    expect(plate.querySelector(".fiyu-lp-plate-drift")).toBeTruthy();
    const field = plate.querySelector(".fiyu-lp-field");
    if (!field) throw new Error("Expected the local field");
    // The radius is a circle with one radius, never an ellipse with two: under a
    // uniform scale a circle survives the panel's whole aspect range, and an
    // ellipse read as a squashed oval however the container behaved.
    expect(field.querySelectorAll("ellipse")).toHaveLength(0);
    const fieldCircles = [...field.querySelectorAll("circle")];
    expect(fieldCircles.length).toBeGreaterThan(0);
    expect(new Set(fieldCircles.map((circle) => circle.getAttribute("r"))).size).toBe(1);
    expect(plate.querySelectorAll("ellipse")).toHaveLength(0);
    const pings = [...plate.querySelectorAll(".fiyu-lp-ping")];
    expect(pings).toHaveLength(4);
    const delays = pings
      .map((ping) => ping.getAttribute("style") ?? "")
      .filter((style) => style.includes("--ping-delay"));
    expect(delays).toHaveLength(3);
    expect(new Set(delays).size).toBe(3);

    // Context, and no invented restaurant names in the picture.
    for (const area of ["NOLITA", "LOWER EAST SIDE", "CHINATOWN", "YOU"]) {
      expect(within(surface).getByText(area)).toBeTruthy();
    }
    // No lines drawn from the centre out: that read as a network diagram.
    expect(plate.querySelectorAll("path[stroke*='plum']")).toHaveLength(0);
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
    expect(scene.getByText(/Discovery platforms reinforce/).className).toContain("text-ink/80");
    expect(scene.getByText("Better than its digital footprint suggests.").className).toContain(
      "text-ink/80",
    );

    // The floated card that used to cut through the paragraph is gone; the
    // section resolves into one ruled row with a photograph slot beside it.
    expect(scene.queryAllByTestId("example-pick-card")).toHaveLength(0);
    expect(scene.getByText("Illustrative discovery")).toBeTruthy();
    expect(scene.getByText("Le Zinc des Lilas")).toBeTruthy();
    expect(countWithClass(section, "aspect-[4/3]")).toBe(1);

    // The café photograph. A near-square source in a 4:3 box crops vertically
    // only, and it is anchored hard to the top because the blue enamel street
    // plate reading RUE JEAN DU BELLAY / 4e ARR lives in the first few percent of
    // the frame -- it is the one element that unmistakably says Paris, and any
    // other anchor trims it off. What is dropped instead is the bare pavement
    // along the bottom, which is the emptiest part of the photograph.
    const photo = within(section).getByRole("img", {
      name: "A corner café in Paris at dusk, its awnings and pavement tables lit by a street lamp",
    });
    expect(photo.getAttribute("src")).toContain("france_fiyu_2.jpg");
    expect(photo.getAttribute("class")).toContain("object-cover");
    expect(photo.getAttribute("style")).toContain("object-position: 50% 0%");
    expect(photo.getAttribute("loading")).toBe("lazy");
    expect(photo.getAttribute("sizes")).toContain("10rem");
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
    // A night frame of a lantern-lit oden shop, cropped into the band that
    // already existed. The section is not enlarged to fit it.
    const photo = within(figure).getByRole("img", {
      name: "A lantern-lit oden shop on a narrow Tokyo street at night",
    });
    expect(photo.getAttribute("src")).toContain("japan_fiyu.jpg");
    expect(photo.getAttribute("class")).toContain("object-cover");
    // 65% centres the window on the lantern rather than on the middle of the
    // photograph, which would have kept ducting above and cones below.
    expect(photo.getAttribute("style")).toContain("object-position: 50% 65%");
    expect(photo.getAttribute("loading")).toBe("lazy");
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

  it("serves all three photography slots from committed local assets", () => {
    // Exactly three, each pointing at a file under `public/landing/`, each with a
    // crop anchor chosen against the actual photograph rather than defaulted.
    const slots = Object.values(IMAGE_SLOTS);
    expect(slots.map((slot) => slot.id)).toEqual([
      "worth_finding_seoul",
      "underexposure_paris",
      "current_edition_tokyo",
    ]);
    for (const slot of slots) {
      expect(slot.available).toBe(true);
      expect(slot.path).toMatch(LOCAL_ASSET);
      expect(slot.objectPosition).toMatch(CROP_ANCHOR);
      expect(slot.alt.length).toBeGreaterThan(20);
      expect(slot.brief.length).toBeGreaterThan(40);
      expect(slot.minWidth).toBeGreaterThanOrEqual(1200);
      // The fallback stays wired in case a file goes missing.
      expect(["illustration", "plate"]).toContain(slot.fallback.kind);
    }

    // Each drawing Fiyu owns stands in for at most one slot.
    const drawings = slots
      .map((slot) => (slot.fallback.kind === "illustration" ? slot.fallback.src : null))
      .filter((src): src is string => src !== null);
    expect(new Set(drawings).size).toBe(drawings.length);
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

    // Every rule that hides something must sit inside a `scripting: enabled`
    // block, or JavaScript off means content off. Checked by selector rather than
    // by declaration, because `opacity: 0` also appears in `@keyframes`, where it
    // is the start of an animation and hides nothing on its own.
    //
    // Rules that only add a transition or a hover lift need no such gate: nothing
    // in them is waiting on JavaScript to become visible.
    const guards = stylesheet.split("@media (scripting: enabled)");
    expect(guards.length).toBeGreaterThanOrEqual(3);
    for (const rule of [
      ".fiyu-lp-rise,",
      ".fiyu-lp-rule {",
      ".fiyu-lp-path {",
      ".fiyu-lp-step[",
    ]) {
      expect(guards[0], `${rule} hides content and must be gated`).not.toContain(rule);
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

  it("holds the underexposure entrance until enough of the section has arrived", async () => {
    const { LookBeyondSection } = await import("@/components/landing-page/LookBeyondSection");
    const observed: { root: Element | null; options: IntersectionObserverInit }[] = [];

    class Recording {
      constructor(
        _callback: IntersectionObserverCallback,
        public options: IntersectionObserverInit = {},
      ) {}
      observe(target: Element) {
        observed.push({ root: target, options: this.options });
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", Recording);

    render(<LookBeyondSection />);

    // The bug: with no threshold an observer reports intersecting the moment one
    // pixel of the target crosses the root. The target here is the whole section,
    // so the sequence began while only the eyebrow had appeared and finished about
    // a second and a half later, off screen. It looked like it had not run.
    expect(observed).toHaveLength(1);
    expect(observed[0].options.threshold).toBe(0.25);
    expect(observed[0].options.rootMargin).toBe("0px");
    expect(observed[0].root?.tagName).toBe("SECTION");
    expect(observed[0].root?.id).toBe("look-beyond");
  });

  it("names a Fiyu Score column on the location surface", () => {
    render(<LandingPage />);

    const surface = screen.getByTestId("location-surface");
    expect(within(surface).getByText("Place")).toBeTruthy();
    expect(within(surface).getByText("Fiyu Score")).toBeTruthy();

    // Every row carries a score, right-aligned, in tabular numerals, and the
    // area now sits beside the type so the middle column reads as one field.
    for (const set of LOCATION_SETS) {
      fireEvent.click(within(surface).getByRole("button", { name: set.area }));
      const scores = within(surface).getAllByRole("img", { name: /Fiyu score/ });
      expect(scores).toHaveLength(3);
      for (const score of scores) {
        expect(score.getAttribute("class")).toContain("tabular-nums");
        expect(score.getAttribute("class")).toContain("shrink-0");
      }
      for (const pick of set.picks) {
        expect(within(surface).getByText(`${pick.area} · ${pick.category}`)).toBeTruthy();
      }
    }

    // Marketing-only values, and the surface says so once.
    expect(within(surface.parentElement as HTMLElement).getByTestId("illustrative-note")).toBeTruthy();
  });

  it("separates the hero from Worth Finding on a phone", () => {
    render(<LandingPage />);

    // Below `sm` both sections are cream and read as one very long stretch, so the
    // boundary gets a lavender-tinted rule and the section beyond it goes
    // near-white. Desktop keeps the neutral hairline it already had.
    const hero = screen.getByTestId("landing-wordmark").closest("section");
    expect(hero?.getAttribute("class")).toContain("border-lavender-100");
    expect(hero?.getAttribute("class")).toContain("sm:border-line");

    const moment = screen
      .getByRole("heading", { name: "Worth finding isn’t always easy to find." })
      .closest("section");
    expect(moment?.getAttribute("class")).toContain("bg-surface");
    expect(moment?.getAttribute("class")).toContain("sm:bg-canvas");
    // Intentional top spacing before the headline, more than the shared rhythm.
    expect(moment?.querySelector(".pt-16")).toBeTruthy();
  });

  it("shows one trust marker per illustrative composition, never two", () => {
    render(<LandingPage />);

    // Six compositions carry invented restaurants; each names itself once.
    const markers = screen.getAllByTestId("illustrative-note");
    expect(markers.length).toBeGreaterThanOrEqual(4);
    for (const marker of markers) {
      expect(marker.textContent ?? "").toMatch(/^Illustrative discover(y|ies)/);
    }

    // No composition carries two of them.
    for (const marker of markers) {
      const section = marker.closest("section");
      if (!section) continue;
      const inSection = section.querySelectorAll('[data-testid="illustrative-note"]');
      expect(inSection.length, `${section.id} has ${inSection.length} markers`).toBe(1);
    }
  });

  it("gives the phone its own spacing rhythm, not the desktop one", async () => {
    const { container } = render(<LandingPage />);
    const { LANDING_RHYTHM } = await import("@/components/landing-page/landingSystem");

    // One mobile step, changed in one place, rather than nine overrides. 80px of
    // padding top and bottom on a 390px screen spent a quarter of the viewport
    // on nothing.
    expect(LANDING_RHYTHM).toBe("py-14 sm:py-20 lg:py-28");

    // No viewport-relative or minimum heights outside the desktop breakpoint.
    // Those are what clip a composition on a short phone.
    for (const element of container.querySelectorAll("[class]")) {
      for (const token of (element.getAttribute("class") ?? "").split(" ")) {
        if (token.startsWith("lg:") || token.startsWith("sm:")) continue;
        expect(token, `viewport height outside lg on ${token}`).not.toMatch(/^h-\[.*[sdl]?vh/);
        expect(token, `minimum height outside lg on ${token}`).not.toMatch(/^min-h-\[/);
      }
    }
  });

  it("keeps the coverage list efficient at phone width", () => {
    render(<LandingPage />);

    // Thirty-nine areas as thirty-nine full-width rows would be 600px of list on
    // a phone. Three columns of smaller type is a third of that, and every area
    // stays present rather than being truncated.
    const colophon = screen.getByTestId("coverage-areas");
    const classes = colophon.getAttribute("class") ?? "";
    expect(classes).toContain("grid-cols-3");
    expect(classes).toContain("sm:grid-cols-4");
    expect(classes).toContain("lg:grid-cols-6");
    expect(colophon.querySelectorAll("li")).toHaveLength(TOKYO_AREAS.length);
    for (const item of colophon.querySelectorAll("li")) {
      expect(item.getAttribute("class")).toContain("truncate");
    }
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
