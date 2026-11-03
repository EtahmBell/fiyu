import { render } from "@testing-library/react-native";

import { PicksTabIcon } from "./PicksTabIcon";

describe("PicksTabIcon", () => {
  it("uses the three exact sparkle paths from the web navigation", async () => {
    const view = await render(<PicksTabIcon color="#6256A8" focused size={24} />);
    const tree = JSON.stringify(view.toJSON());
    expect(tree).toContain("m12 2 1.35 4.15L17.5 7.5");
    expect(tree).toContain("m18.5 13 .8 2.2");
    expect(tree).toContain("m5 14 .65 1.85");
    expect(tree).toContain('"fillOpacity":0.16');
    expect(tree).toContain('"strokeWidth":2');
  });

  it("keeps the unselected icon outlined", async () => {
    const view = await render(<PicksTabIcon color="#706876" focused={false} size={24} />);
    const tree = JSON.stringify(view.toJSON());
    expect(tree).toContain('"fill":"none"');
    expect(tree).toContain('"strokeWidth":1.8');
  });
});
