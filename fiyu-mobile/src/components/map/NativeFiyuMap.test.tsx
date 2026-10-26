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
    expect(screen.getByLabelText("Reset map")).toBeTruthy();
  });

  it("clusters a realistic dense volume instead of mounting one control per restaurant", async () => {
    const rows = Array.from({ length: 1_430 }, (_, index) => restaurant(`place-${index}`, 35.55 + (index % 50) * 0.0048, 139.58 + (index % 37) * 0.008));
    const screen = await render(<NativeFiyuMap restaurants={rows} selectedPlaceId={null} onSelect={() => undefined} onBackgroundPress={() => undefined} />);
    expect(screen.getAllByLabelText(/restaurants in this area/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("place-1429")).toBeNull();
  });
});
