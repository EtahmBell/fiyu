import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import { formatDistance } from "@/lib/geo/distance";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";
import {
  type DiscoveryAnchor,
  anchorDescription,
  anchorDistanceSuffix,
  anchorLabel,
  distanceToRestaurant,
  isApproximateOrigin,
} from "@/lib/location/anchor";

const CURRENT: DiscoveryAnchor = {
  kind: "current-location",
  point: { lat: 35.6812, lng: 139.7671 },
  accuracyMeters: 25,
};

const AREA: DiscoveryAnchor = {
  kind: "area-anchor",
  point: { lat: 35.658, lng: 139.7016 },
  id: "shibuya-station",
  displayName: "Shibuya Station",
  areaName: "Shibuya",
  qualifier: "Approximate center of Shibuya",
};

const PIN: DiscoveryAnchor = { kind: "manual-pin", point: { lat: 35.69, lng: 139.7 } };

function restaurant(lat: number, lng: number): MappableRestaurant {
  const [only] = mappableRestaurants([
    publicRestaurantSchema.parse({
      place_id: "r",
      latitude: lat,
      longitude: lng,
      location_precision: "exact",
      map_display_eligible: true,
    }),
  ]);
  return only;
}

describe("anchorLabel", () => {
  it("names each kind distinctly", () => {
    expect(anchorLabel(CURRENT)).toBe("You are here");
    expect(anchorLabel(AREA)).toBe("Shibuya Station");
    expect(anchorLabel(PIN)).toBe("Your starting point");
  });

  it("never labels an area anchor as the user's own position", () => {
    // The core distinction: an area centre is a landmark, not a person.
    expect(anchorLabel(AREA)).not.toMatch(/you|your/i);
  });
});

describe("anchorDescription", () => {
  it("uses the backend's own qualifier for an area anchor", () => {
    expect(anchorDescription(AREA)).toBe("Approximate center of Shibuya");
  });

  it("reports GPS accuracy when the browser supplies it", () => {
    expect(anchorDescription(CURRENT)).toBe("Accurate to about 25 m");
  });

  it("omits accuracy when the browser does not supply it", () => {
    expect(
      anchorDescription({ kind: "current-location", point: CURRENT.point, accuracyMeters: null }),
    ).toBeNull();
  });
});

describe("anchorDistanceSuffix", () => {
  it("names what the distance is measured from", () => {
    expect(anchorDistanceSuffix(CURRENT)).toBe("from your location");
    expect(anchorDistanceSuffix(AREA)).toBe("from Shibuya");
    expect(anchorDistanceSuffix(PIN)).toBe("from your starting point");
  });
});

describe("isApproximateOrigin", () => {
  it("always treats an area anchor as approximate", () => {
    expect(isApproximateOrigin(AREA)).toBe(true);
  });

  it("treats a good GPS fix as precise and a poor one as approximate", () => {
    expect(isApproximateOrigin(CURRENT)).toBe(false);
    expect(
      isApproximateOrigin({ kind: "current-location", point: CURRENT.point, accuracyMeters: 400 }),
    ).toBe(true);
  });

  it("treats a hand-placed pin as precise, since the user chose the point", () => {
    expect(isApproximateOrigin(PIN)).toBe(false);
  });
});

describe("distanceToRestaurant", () => {
  it("returns null when no anchor is set", () => {
    expect(distanceToRestaurant(null, restaurant(35.658, 139.7016))).toBeNull();
  });

  it("measures from the anchor to the restaurant", () => {
    const meters = distanceToRestaurant(CURRENT, restaurant(35.658, 139.7016));
    expect(meters).toBeGreaterThan(6300);
    expect(meters).toBeLessThan(6700);
  });

  it("is zero when the restaurant sits on the anchor", () => {
    expect(distanceToRestaurant(AREA, restaurant(AREA.point.lat, AREA.point.lng))).toBe(0);
  });
});

describe("end-to-end phrasing", () => {
  it("produces the documented area-anchor wording", () => {
    const meters = distanceToRestaurant(AREA, restaurant(35.6675, 139.7100));
    expect(
      formatDistance(meters, {
        suffix: anchorDistanceSuffix(AREA),
        approximateOrigin: isApproximateOrigin(AREA),
      }),
    ).toMatch(/^About \d+(\.\d)? (m|km) from Shibuya$/);
  });

  it("produces the documented current-location wording", () => {
    const meters = distanceToRestaurant(CURRENT, restaurant(35.6819, 139.7680));
    expect(
      formatDistance(meters, {
        suffix: anchorDistanceSuffix(CURRENT),
        approximateOrigin: isApproximateOrigin(CURRENT),
      }),
    ).toMatch(/^\d+0 m from your location$/);
  });
});
