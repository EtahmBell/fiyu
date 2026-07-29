import { describe, expect, it } from "vitest";

import { distanceAccessibleLabel, formatDistance, haversineMeters } from "@/lib/geo/distance";

const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };
const SHIBUYA_STATION = { lat: 35.658, lng: 139.7016 };
const UENO_STATION = { lat: 35.7141, lng: 139.7774 };

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters(TOKYO_STATION, TOKYO_STATION)).toBe(0);
  });

  it("matches the known Tokyo-to-Shibuya distance", () => {
    // Roughly 6.5 km great-circle; allow 200 m for the spherical model.
    const meters = haversineMeters(TOKYO_STATION, SHIBUYA_STATION);
    expect(meters).toBeGreaterThan(6300);
    expect(meters).toBeLessThan(6700);
  });

  it("matches the known Tokyo-to-Ueno distance", () => {
    // Roughly 3.7 km.
    const meters = haversineMeters(TOKYO_STATION, UENO_STATION);
    expect(meters).toBeGreaterThan(3500);
    expect(meters).toBeLessThan(3900);
  });

  it("is symmetric", () => {
    expect(haversineMeters(TOKYO_STATION, UENO_STATION)).toBeCloseTo(
      haversineMeters(UENO_STATION, TOKYO_STATION),
      9,
    );
  });

  it("resolves short distances accurately", () => {
    // 0.001 degrees of latitude is about 111 m anywhere on Earth.
    const meters = haversineMeters(TOKYO_STATION, {
      lat: TOKYO_STATION.lat + 0.001,
      lng: TOKYO_STATION.lng,
    });
    expect(meters).toBeGreaterThan(105);
    expect(meters).toBeLessThan(117);
  });

  it("handles antipodal-scale input without NaN", () => {
    // The sqrt clamp guards floating-point overshoot past 1.
    const meters = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(meters)).toBe(true);
    expect(meters).toBeGreaterThan(20_000_000);
  });
});

describe("formatDistance", () => {
  const precise = { suffix: "from your location", approximate: false };
  const approximate = { suffix: "from Shibuya", approximate: true };

  it("reports metres below a kilometre from a precise origin", () => {
    expect(formatDistance(850, precise)).toBe("850 m from your location");
  });

  it("rounds metres to the nearest 10 rather than implying GPS precision", () => {
    expect(formatDistance(847, precise)).toBe("850 m from your location");
    expect(formatDistance(843, precise)).toBe("840 m from your location");
  });

  it("hedges short distances when the origin is itself approximate", () => {
    expect(formatDistance(620, approximate)).toBe("About 620 m from Shibuya");
  });

  it("switches to kilometres at a kilometre and always hedges", () => {
    expect(formatDistance(1400, approximate)).toBe("About 1.4 km from Shibuya");
    expect(formatDistance(1400, precise)).toBe("About 1.4 km from your location");
  });

  it("rounds kilometres to one decimal", () => {
    expect(formatDistance(6449, precise)).toBe("About 6.4 km from your location");
    expect(formatDistance(6460, precise)).toBe("About 6.5 km from your location");
  });

  it("never reports a distance below 10 m", () => {
    // Sub-10 m precision is meaningless from any anchor Fiyu has.
    expect(formatDistance(0, precise)).toBe("10 m from your location");
    expect(formatDistance(3, precise)).toBe("10 m from your location");
  });

  it("says so plainly when there is no distance", () => {
    expect(formatDistance(null, precise)).toBe("Distance unavailable");
    expect(formatDistance(Number.NaN, precise)).toBe("Distance unavailable");
    expect(formatDistance(-5, precise)).toBe("Distance unavailable");
  });

  it("never claims walking distance or a travel time", () => {
    const samples = [50, 850, 1400, 12000].map((m) => formatDistance(m, precise));
    for (const sample of samples) {
      expect(sample).not.toMatch(/walk|min|hour|drive|transit|away/i);
    }
  });

  /*
   * A chome anchor is nominal to roughly 100-400 m, so 10 m buckets would
   * overclaim by an order of magnitude on exactly the quantity being hedged.
   */
  it("buckets a coarse measurement to 100 m, not 10 m", () => {
    const coarse = { suffix: "from your location", approximate: true, coarse: true };
    expect(formatDistance(343, coarse)).toBe("About 300 m from your location");
    expect(formatDistance(371, coarse)).toBe("About 400 m from your location");
  });

  it("never reports a coarse distance below its own bucket", () => {
    const coarse = { suffix: "from your location", approximate: true, coarse: true };
    expect(formatDistance(12, coarse)).toBe("About 100 m from your location");
  });

  it("leaves precise measurements at 10 m when coarse is not set", () => {
    expect(formatDistance(343, precise)).toBe("340 m from your location");
  });
});

describe("distanceAccessibleLabel", () => {
  it("spells out that the measurement is a straight line", () => {
    expect(distanceAccessibleLabel("850 m from your location")).toBe(
      "850 m from your location, straight-line distance",
    );
  });

  it("discloses an approximate endpoint when the measurement is coarse", () => {
    expect(distanceAccessibleLabel("About 300 m from your location", true)).toBe(
      "About 300 m from your location, straight-line distance, from an approximate location",
    );
  });

  it("leaves the unavailable case alone", () => {
    expect(distanceAccessibleLabel("Distance unavailable")).toBe("Distance unavailable");
    expect(distanceAccessibleLabel("Distance unavailable", true)).toBe("Distance unavailable");
  });
});
