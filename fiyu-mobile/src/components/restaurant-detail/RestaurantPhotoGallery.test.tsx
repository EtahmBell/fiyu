import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import { useRestaurantPhotos } from "@/api/queries";
import { RestaurantPhotoGallery } from "./RestaurantPhotoGallery";

jest.mock("@/api/queries", () => ({ useRestaurantPhotos: jest.fn() }));
const mockedPhotos = jest.mocked(useRestaurantPhotos);

const photo = (suffix: string) => ({ media_url: `https://api.example/${suffix}`, width: 800, height: 600, author_attributions: [{ display_name: `Author ${suffix}`, uri: `https://authors.example/${suffix}`, photo_uri: null, flag_content_uri: null }], google_maps_uri: `https://maps.example/${suffix}`, flag_content_uri: `https://report.example/${suffix}` });

describe("native restaurant photo gallery", () => {
  afterEach(() => jest.restoreAllMocks());

  it("renders a bounded gallery with attribution and source links", async () => {
    mockedPhotos.mockReturnValue({ data: [photo("one"), photo("two")], isLoading: false, isError: false } as ReturnType<typeof useRestaurantPhotos>);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const view = await render(<RestaurantPhotoGallery placeId="place" restaurantName="Test Restaurant" />);
    expect(view.getByLabelText("Photo 1 of 2")).toBeTruthy();
    fireEvent.press(view.getByText("Photo by Author one"));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://authors.example/one"));
    fireEvent.press(view.getByText("Report photo"));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://report.example/one"));
    view.unmount();
  });

  it("uses a stable fallback when photos fail", async () => {
    mockedPhotos.mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useRestaurantPhotos>);
    const view = await render(<RestaurantPhotoGallery placeId="place" restaurantName="Test Restaurant" />);
    expect(view.getByText("Photos unavailable right now")).toBeTruthy();
    view.unmount();
  });

  it("contains image failures and falls back without breaking detail", async () => {
    mockedPhotos.mockReturnValue({ data: [photo("one")], isLoading: false, isError: false } as ReturnType<typeof useRestaurantPhotos>);
    const view = await render(<RestaurantPhotoGallery placeId="place" restaurantName="Test Restaurant" />);
    fireEvent(view.getByLabelText("Test Restaurant, photo 1 from Google"), "error", { nativeEvent: { error: "failed" } });
    await waitFor(() => expect(view.getByText("Photos unavailable right now")).toBeTruthy());
    view.unmount();
  });
});
