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
  ALL_EXAMPLES,
  SELECTION_COLUMNS,
  SHARED_SELECTION_ID,
} from "@/components/landing-page/landingExamples";
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

/**
 * Text a reader can actually see in a pinned stage at a given progress.
 *
 * Staged elements are hidden by `--enter` reaching zero, so the visible copy is
 * the stage's text minus the text of every element that has faded out. Used to
 * assert the thing that was actually wrong before: that a stage is a composed
 * screen at both ends of its scrub rather than an empty one.
 */
function visibleTextAt(stage: Element, progress: number): string {
  const staged = [
    ...stage.querySelectorAll(".fiyu-lp-stage-item, .fiyu-lp-stage-fade"),
  ];
  let text = stage.textContent ?? "";
  for (const element of staged) {
    const className = element.getAttribute("class") ?? "";
    const inline = element.getAttribute("style") ?? "";
    const from = Number(
      /--from:\s*([\d.]+)/.exec(inline)?.[1] ?? /\[--from:([\d.]+)\]/.exec(className)?.[1] ?? "0",
    );
    const span = Number(
      /--span:\s*([\d.]+)/.exec(inline)?.[1] ?? /\[--span:([\d.]+)\]/.exec(className)?.[1] ?? "0.25",
    );
    const enter = Math.min(1, Math.max(0, (progress - from) / span));
    if (enter <= 0) text = text.replace(element.textContent ?? "", "");
  }
  return text.trim();
}

function landingRoute() {
  return (
    <MarketingLayout>
      <PublicLandingPage />
    </MarketingLayout>
  );
}

/** Section order, top to bottom, keyed by a heading only that section has. */
const NARRATIVE = [
  "Hidden places. Carefully uncovered.",
  "Worth finding isn’t always easy to find.",
  "How Fiyu works",
  "Look beyond what rises to the top.",
  "Only a few.",
  "A few for you.Different for someone else.",
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
  it("scrubs exactly two sections, and pins both of them", () => {
    const { container } = render(<LandingPage />);

    // Scrubbing is expensive to get right and cheap to overuse. Two, both
    // pinned, is the budget; everything else triggers once on entry.
    const scenes = [...container.querySelectorAll(".fiyu-lp-scene")];
    expect(scenes).toHaveLength(2);
    for (const scene of scenes) {
      const className = scene.getAttribute("class") ?? "";
      // A scrubbed section must be a runway, and must declare how long it is.
      expect(className).toContain("fiyu-lp-runway");
      expect(className).toMatch(/\[--runway:[\d.]+svh\]/);
      // Its stage is what pins, and pinning is gated in one place.
      expect(scene.querySelector(".fiyu-lp-stage")).toBeTruthy();
    }
  });

  it("gives every scrubbed element a composed end state inside the transition window", () => {
    const { container } = render(<LandingPage />);

    // An element whose --from + --span exceeds 1 never finishes: it is still
    // moving when the stage stops scrubbing, which is precisely the "caught
    // mid-animation" report. This asserts every one of them lands.
    const staged = [
      ...container.querySelectorAll(".fiyu-lp-stage-item, .fiyu-lp-stage-exit, .fiyu-lp-stage-fade"),
    ];
    expect(staged.length).toBeGreaterThan(0);
    for (const element of staged) {
      const className = element.getAttribute("class") ?? "";
      const inline = element.getAttribute("style") ?? "";
      const from = Number(
        /--from:\s*([\d.]+)/.exec(inline)?.[1] ?? /\[--from:([\d.]+)\]/.exec(className)?.[1] ?? "0",
      );
      const span = Number(
        /--span:\s*([\d.]+)/.exec(inline)?.[1] ?? /\[--span:([\d.]+)\]/.exec(className)?.[1] ?? "0.25",
      );
      expect(span, `span must be positive on ${className}`).toBeGreaterThan(0);
      expect(from + span, `${className} finishes after the window closes`).toBeLessThanOrEqual(1);
    }
  });

  it("holds a composed screen at both ends of every pinned stage", () => {
    const { container } = render(<LandingPage />);

    // The reported dead viewport was this: a stage whose every element began at
    // zero opacity, pinned, with nothing else in it. Both endpoints of a scrub
    // are fully on screen, so both have to be worth looking at.
    for (const scene of container.querySelectorAll(".fiyu-lp-scene")) {
      const stage = scene.querySelector(".fiyu-lp-stage");
      if (!stage) throw new Error("Every scene must have a stage");
      expect(visibleTextAt(stage, 0).length, "empty stage at the start of the pin").toBeGreaterThan(40);
      expect(visibleTextAt(stage, 1).length, "empty stage at the end of the pin").toBeGreaterThan(40);
    }
  });

  it("measures every pinned runway in svh, never vh", () => {
    const { container } = render(<LandingPage />);

    // vh changes as a mobile toolbar hides, which resizes a runway mid-scroll
    // and jumps the composition. svh does not.
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
    expect(composition.getByText("維摩（ユイマ）")).toBeTruthy();
    expect(composition.getByText("沖縄そば屋 ちょこっと")).toBeTruthy();
    expect(compositions[0].querySelector(".fiyu-lp-veil")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("publishes real Fiyu scores rather than invented ones", () => {
    render(<LandingPage />);

    // 86.7 out of 100 is what the catalog holds; 8.7 is Fiyu's public scale.
    expect(screen.getAllByLabelText("Fiyu score 8.7 out of 10").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Fiyu score unavailable")).toBeNull();
  });
});

describe("landing narrative sections", () => {
  it("opens on a restaurant, captioned as an illustration while it is one", () => {
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

    // An entrance, not a scrub: this section is no longer a scene at all.
    expect(moment.querySelector(".fiyu-lp-scene")).toBeNull();
    expect(moment.querySelector(".fiyu-lp-plate")).toBeTruthy();
  });

  it("keeps one product surface present through all three workflow steps", () => {
    const { container } = render(<LandingPage />);

    const workflow = screen.getByRole("heading", { name: "How Fiyu works" }).closest("section");
    if (!workflow) throw new Error("Expected the workflow section");

    // All three steps are on screen at once, so the column can never be a
    // single paragraph floating beside an empty half of the viewport.
    const steps = [...workflow.querySelectorAll("li[data-active]")];
    expect(steps).toHaveLength(3);
    expect(steps.filter((step) => step.getAttribute("data-active") === "true")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Tell us what you like" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Receive a few considered picks" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reveal, save, and visit" })).toBeTruthy();

    // Both surface layers are mounted at all times and cross-fade, so nothing
    // mounts or unmounts and the box cannot change height mid-scroll.
    const surface = screen.getByTestId("workflow-surface");
    expect(surface.getAttribute("data-step")).toBe("0");
    expect(surface.getAttribute("aria-hidden")).toBe("true");
    expect(surface.getAttribute("class")).toContain("h-[21.5rem]");
    expect(surface.getAttribute("class")).not.toContain("min-h-");
    expect(surface.children).toHaveLength(2);
    expect(within(surface).getByText("Your tastes")).toBeTruthy();
    expect(within(surface).getAllByTestId("example-pick-card-brief")).toHaveLength(3);

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

  it("accumulates exactly three discoveries onto ruled shelves, inside the stage", () => {
    render(<LandingPage />);

    const philosophy = screen.getByRole("heading", { name: "Only a few." }).closest("section");
    if (!philosophy) throw new Error("Expected the Only a few section");

    // The heading lives inside the pinned stage, so the first frame of the pin
    // is a composed screen rather than an empty one.
    const stage = philosophy.querySelector(".fiyu-lp-stage");
    expect(stage).toBeTruthy();
    expect(stage?.contains(screen.getByRole("heading", { name: "Only a few." }))).toBe(true);

    expect(philosophy.querySelectorAll("[data-arrival]")).toHaveLength(3);
    expect(philosophy.querySelector('[data-arrival="4"]')).toBeNull();
    expect(within(philosophy).getByText("A slower reveal")).toBeTruthy();
    expect(
      within(philosophy).getByText(
        /A small, personal selection from a much broader pool of strong restaurants/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Three, not three hundred/i)).toBeNull();
  });

  it("leads each selection with an image and states the overlap", () => {
    render(<LandingPage />);

    const slots = SELECTION_COLUMNS.flatMap((column) => column.picks);
    expect(slots).toHaveLength(9);
    expect(new Set(slots.map((pick) => pick.id)).size).toBe(8);
    expect(slots.filter((pick) => pick.id === SHARED_SELECTION_ID)).toHaveLength(2);

    const section = screen.getByText("Someone near Yanaka").closest("section");
    if (!section) throw new Error("Expected the selections section");
    // One image per column, so three selections read as three evenings before a
    // single name has to be compared.
    expect(countWithClass(section, "aspect-[16/10]")).toBe(3);
    expect(screen.getAllByText("Also another selection")).toHaveLength(2);
    expect(
      screen.getByText("One place appears in two of these three selections. The other seven appear once."),
    ).toBeTruthy();
  });
});

describe("landing rollout, edition and close", () => {
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
    const figure = screen.getByTestId("city-edition-plate");
    expect(countWithClass(figure, "aspect-[3/2]")).toBe(1);
    const plate = within(figure).getByRole("img", {
      name: "A line illustration looking out from a restaurant table onto a quiet Tokyo street",
    });
    expect(plate.getAttribute("src")).toBe("/images/log-empty-table.png");
    expect(plate.getAttribute("loading")).toBe("lazy");
    expect(edition.querySelector('img[src="/og.png"]')).toBeNull();
  });

  it("closes on a colophon rather than on the hero again", () => {
    render(<LandingPage />);

    const closing = screen.getByRole("heading", { name: "Your next few are waiting." }).closest("section");
    if (!closing) throw new Error("Expected the closing section");
    expect(closing.querySelector('[data-testid="pick-composition"]')).toBeNull();

    const colophon = screen.getByTestId("closing-colophon");
    expect(colophon.querySelectorAll("li")).toHaveLength(ALL_EXAMPLES.length);
    expect(within(closing).getByText("In Tokyo now")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read about Fiyu" }).getAttribute("href")).toBe("/about");
  });

  it("keeps raw geocoder labels off the public page", () => {
    const { container } = render(<LandingPage />);

    // "3 Chome Sendagi" is a field, not a place a person would name. Every
    // example carries the recognisable area instead.
    expect(container.textContent).not.toMatch(/\bChome\b/i);
    expect(screen.getAllByText("Sendagi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jingumae").length).toBeGreaterThan(0);
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

    // The stepped surface reports its last step rather than its first, so the
    // finished state of the demonstration is what a reader gets.
    const surface = screen.getByTestId("workflow-surface");
    expect(surface.getAttribute("data-step")).toBe("2");
    expect(surface.querySelector('[data-tone="saved"]')).toBeTruthy();
    expect(within(surface).getByText("Discovered")).toBeTruthy();

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

    // Progress defaults to finished, so `calc()` resolves to the settled frame.
    expect(stylesheet).toContain("--p: var(--scene-progress, 1);");

    // Pinning is a capability declared once, and the JS threshold matches it.
    expect(stylesheet).toContain("@media (min-height: 640px)");
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
