import { render } from "@testing-library/react-native";

import { decorativeSvgAccessibilityProps, RecentDiscoveriesEmptyState } from "./PicksExperience";

describe("Picks home presentation", () => {
  it("keeps the Recent Discoveries empty state visible with its editorial illustration and copy", async () => {
    const view = await render(<RecentDiscoveriesEmptyState />);
    expect(view.getByText("No recent discoveries")).toBeTruthy();
    expect(view.getByText("Revealed restaurants remain here for 72 hours.")).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain("RNSVGSvgView");
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
