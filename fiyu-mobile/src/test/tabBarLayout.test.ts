import { bottomTabMetrics } from "@/lib/tabBarMetrics";

describe("bottom tab bar layout", () => {
  it("reserves a comfortable minimum inset on web and non-home-indicator devices", () => {
    expect(bottomTabMetrics(0)).toEqual({ height: 72, paddingTop: 7, paddingBottom: 8 });
  });

  it("adds the full device bottom inset without clipping the navigation", () => {
    expect(bottomTabMetrics(34)).toEqual({ height: 98, paddingTop: 7, paddingBottom: 34 });
  });
});
