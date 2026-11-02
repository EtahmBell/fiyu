import { render } from "@testing-library/react-native";

import { RecentDiscoveriesEmptyState } from "./PicksExperience";

describe("Picks home presentation", () => {
  it("keeps the Recent Discoveries empty state visible with its editorial illustration and copy", async () => {
    const view = await render(<RecentDiscoveriesEmptyState />);
    expect(view.getByText("No recent discoveries")).toBeTruthy();
    expect(view.getByText("Revealed restaurants remain here for 72 hours.")).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain("RNSVGSvgView");
  });
});
