import { describe, expect, it } from "vitest";

import { restaurantDisplayArea, restaurantMetadataParts } from "@/lib/restaurant/displayArea";

describe("restaurantDisplayArea", () => {
  it.each([
    ["Ikebukuro", "2 Chome Ikebukurohoncho"],
    ["Ikebukuro", "2 Chome Takamatsu"],
    ["Ueno", "3 Chome Sendagi"],
    ["Ginza", "2 Chome Ginza"],
  ])("prefers canonical %s over raw locality %s", (displayArea, neighborhood) => {
    expect(restaurantDisplayArea({ display_area: displayArea, neighborhood })).toBe(displayArea);
  });

  it("uses a broad discovery area during a rolling backend deploy", () => {
    expect(restaurantDisplayArea({
      neighborhood: "3 Chome Sendagi",
      discovery_area: "Ueno",
    })).toBe("Ueno");
  });

  it("does not expose Japanese chome or unknown placeholder values", () => {
    expect(restaurantDisplayArea({ neighborhood: "池袋本町二丁目" })).toBeNull();
    expect(restaurantDisplayArea({ neighborhood: "Unknown neighborhood" })).toBeNull();
  });

  it("keeps a clean recognizable locality when no canonical value is available", () => {
    expect(restaurantDisplayArea({ neighborhood: "Kameari" })).toBe("Kameari");
  });

  it("deduplicates matching category and area labels", () => {
    expect(restaurantMetadataParts("Ginza", { display_area: "Ginza" })).toEqual(["Ginza"]);
  });
});
