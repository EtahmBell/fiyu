import { describe, expect, it } from "vitest";

import { ACTIVE_FIYU_CITY, FIYU_CITIES, type DiscoveryOrigin } from "@/lib/city/editions";

describe("city edition model", () => {
  it("keeps the active edition separate from discovery origin", () => {
    const origin: DiscoveryOrigin = {
      type: "home_area",
      areaId: "shibuya",
      label: "Shibuya",
    };

    expect(ACTIVE_FIYU_CITY).toMatchObject({ id: "tokyo", status: "available" });
    expect(origin).toEqual({ type: "home_area", areaId: "shibuya", label: "Shibuya" });
    expect(FIYU_CITIES.filter((city) => city.status === "coming_soon").map((city) => city.id)).toEqual([
      "new-york",
      "rome",
    ]);
  });
});
