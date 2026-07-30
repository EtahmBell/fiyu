export type CityId = "tokyo" | "new-york" | "rome";

export interface FiyuCity {
  id: CityId;
  name: string;
  country: string;
  status: "available" | "coming_soon";
  defaultCenter?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * The edition selects Fiyu's catalog and editorial context. It is deliberately
 * separate from DiscoveryOrigin, which only affects where discovery starts.
 */
export const FIYU_CITIES = [
  {
    id: "tokyo",
    name: "Tokyo",
    country: "Japan",
    status: "available",
    defaultCenter: { latitude: 35.6762, longitude: 139.6503 },
  },
  {
    id: "new-york",
    name: "New York",
    country: "United States",
    status: "coming_soon",
  },
  {
    id: "rome",
    name: "Rome",
    country: "Italy",
    status: "coming_soon",
  },
] as const satisfies readonly FiyuCity[];

export const ACTIVE_FIYU_CITY: FiyuCity = FIYU_CITIES[0];

export type DiscoveryOrigin =
  | {
      type: "current_location";
      latitude?: number;
      longitude?: number;
    }
  | {
      type: "home_area";
      areaId: string;
      label: string;
    }
  | {
      type: "selected_area";
      areaId: string;
      label: string;
    };
