import { render } from "@testing-library/react-native";

import { decorativeSvgAccessibilityProps } from "@/lib/svgAccessibility";
import { RecentDiscoveriesEmptyState } from "./PicksExperience";

describe("Picks home presentation", () => {
  it("keeps the Recent Discoveries empty state visible with its editorial illustration and copy", async () => {
    const view = await render(<RecentDiscoveriesEmptyState />);
    expect(view.getByText("No recent discoveries")).toBeTruthy();
    expect(view.getByText("Revealed restaurants remain here for 72 hours.")).toBeTruthy();
    const tree = JSON.stringify(view.toJSON());
    expect(tree).toContain("RNSVGSvgView");
    expect(tree).toContain("M20 96h120");
    expect(tree).toContain("M74 78 69 94h10Z");
  });

  it("uses DOM-safe decorative SVG semantics on web", () => {
    expect(decorativeSvgAccessibilityProps("web")).toEqual({
      "aria-hidden": true,
      focusable: false,
    });
    expect(decorativeSvgAccessibilityProps("web")).not.toHaveProperty("importantForAccessibility");
  });

  it("retains native accessibility hiding without web ARIA props", () => {
    expect(decorativeSvgAccessibilityProps("ios")).toEqual({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      focusable: false,
    });
    expect(decorativeSvgAccessibilityProps("android")).not.toHaveProperty("aria-hidden");
  });
});
