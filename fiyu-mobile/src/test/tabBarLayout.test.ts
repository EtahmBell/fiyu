import { bottomTabMetrics, LOG_TAB_BUTTON_GEOMETRY } from "@/lib/tabBarMetrics";

describe("bottom tab bar layout", () => {
  it("reserves a comfortable minimum inset on web and non-home-indicator devices", () => {
    expect(bottomTabMetrics(0)).toEqual({ height: 80, paddingTop: 6, paddingBottom: 6 });
  });

  it("adds the full device bottom inset without clipping the navigation", () => {
    expect(bottomTabMetrics(34)).toEqual({ height: 108, paddingTop: 6, paddingBottom: 34 });
  });

  it("centers the selected Log item without consuming its vertical label space", () => {
    expect(LOG_TAB_BUTTON_GEOMETRY).toEqual({
      marginHorizontal: 10,
      borderRadius: 12,
      justifyContent: "center",
    });
    expect(LOG_TAB_BUTTON_GEOMETRY).not.toHaveProperty("marginVertical");
  });
});
