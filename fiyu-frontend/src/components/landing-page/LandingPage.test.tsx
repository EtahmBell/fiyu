// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MarketingLayout from "@/app/(marketing)/layout";
import { LandingPage } from "@/components/landing-page/LandingPage";

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

afterEach(cleanup);

describe("public landing experience", () => {
  it("uses dedicated landing chrome and never renders application navigation", () => {
    render(
      <MarketingLayout>
        <LandingPage />
      </MarketingLayout>,
    );

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Fiyu home" }).getAttribute("href")).toBe(
      "/",
    );
    expect(within(header).getByRole("link", { name: "Open Fiyu" }).getAttribute("href")).toBe(
      "/picks",
    );
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Mobile primary" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });

  it("renders the complete editorial hierarchy with responsive layout contracts", () => {
    render(<LandingPage />);

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Find the Tokyo you can taste.",
    });
    expect(heading.className).toContain("text-[clamp(3.65rem,10vw,9rem)]");
    expect(screen.getByRole("heading", { name: "A deliberate alternative to searching everything." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tokyo, beyond the obvious." })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /picks|Tokyo edition/i })).toHaveLength(2);

    const heroGrid = heading.closest("div.max-w-5xl")?.parentElement;
    expect(heroGrid?.className).toContain(
      "lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]",
    );
    expect(heroGrid?.className).toContain("px-5");
    expect(heroGrid?.className).toContain("sm:px-8");
    expect(document.querySelector("[lang='ja']")?.textContent).toContain("東京");
  });
});
