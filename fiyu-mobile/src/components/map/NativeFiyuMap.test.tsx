import type { MapRestaurant } from "@fiyu/contracts";
import { fireEvent, render } from "@testing-library/react-native";

import { restaurantDetailFixture } from "@/test/restaurantFixture";
import { NativeFiyuMap } from "./NativeFiyuMap";

function restaurant(placeId: string, latitude: number, longitude: number, flags: Partial<MapRestaurant> = {}): MapRestaurant {
  return { ...restaurantDetailFixture, place_id: placeId, name_ja: placeId, latitude, longitude, is_discovered: false, is_saved: false, is_visited: false, user_rating: null, ...flags } as MapRestaurant;
}

describe("NativeFiyuMap", () => {
  it("renders real vector geography and exposes individual markers as accessible controls", async () => {
    const onSelect = jest.fn();
    const screen = await render(<NativeFiyuMap restaurants={[restaurant("Koenji", 35.705, 139.65)]} selectedPlaceId={null} onSelect={onSelect} onBackgroundPress={() => undefined} />);
    fireEvent.press(screen.getByLabelText("Koenji"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ place_id: "Koenji" }));
    expect(screen.getByLabelText("Zoom in")).toBeTruthy();
    expect(screen.getByLabelText("Recenter map")).toBeTruthy();
  });

  it("clusters a realistic dense volume instead of mounting one control per restaurant", async () => {
    const rows = Array.from({ length: 1_430 }, (_, index) => restaurant(`place-${index}`, 35.55 + (index % 50) * 0.0048, 139.58 + (index % 37) * 0.008));
    const screen = await render(<NativeFiyuMap restaurants={rows} selectedPlaceId={null} onSelect={() => undefined} onBackgroundPress={() => undefined} />);
    expect(screen.getAllByLabelText(/restaurants in this area/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("place-1429")).toBeNull();
  });

  it("auto-fits Tokyo results, renders every semantic marker color, and shows selection", async () => {
    const rows = [
      restaurant("Personalized", 35.79, 139.59, { is_personalized_pick: true }),
      restaurant("My Pick", 35.77, 139.88, { is_my_pick: true }),
      restaurant("Recent", 35.72, 139.62, { is_discovered: true }),
      restaurant("Visited", 35.66, 139.87, { is_visited: true }),
      restaurant("Saved", 35.57, 139.65, { is_saved: true }),
      restaurant("Default", 35.55, 139.89),
    ];
    const screen = await render(<NativeFiyuMap restaurants={rows} selectedPlaceId="Saved" onSelect={() => undefined} onBackgroundPress={() => undefined} />);
    expect(screen.getByTestId("map-svg").props.viewBox).not.toBe("0 0 1000 1026");
    for (const row of rows) expect(screen.getByLabelText(row.place_id)).toBeTruthy();
    const fills = rows.map((row) => screen.getByTestId(`map-marker-visual-${row.place_id}`).props.fill);
    expect(new Set(fills.map((fill) => JSON.stringify(fill))).size).toBe(6);
    expect(screen.getByTestId("map-marker-halo-Saved").props.opacity).toBe(0.28);
  });

  it("omits invalid and out-of-service coordinates before projection", async () => {
    const screen = await render(<NativeFiyuMap restaurants={[restaurant("No location", 0, 0), restaurant("Tokyo", 35.68, 139.76)]} selectedPlaceId={null} onSelect={() => undefined} onBackgroundPress={() => undefined} />);
    expect(screen.queryByLabelText("No location")).toBeNull();
    expect(screen.getByLabelText("Tokyo")).toBeTruthy();
  });
});
