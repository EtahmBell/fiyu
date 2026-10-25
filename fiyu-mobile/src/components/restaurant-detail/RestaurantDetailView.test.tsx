import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { restaurantDetailFixture } from "@/test/restaurantFixture";
import { RestaurantDetailView } from "./RestaurantDetailView";

jest.mock("./RestaurantPhotoGallery", () => ({ RestaurantPhotoGallery: jest.fn(() => null) }));

describe("native restaurant detail", () => {
  it("renders the canonical hierarchy, unboxed score, and actionable controls", async () => {
    const onSave = jest.fn();
    const onLog = jest.fn();
    const view = await render(<RestaurantDetailView restaurant={restaurantDetailFixture} saved={false} visited={false} actionError="Saved places could not be updated." onBack={jest.fn()} onSave={onSave} onLog={onLog} />);

    expect(view.getByText("Overview")).toBeTruthy();
    expect(view.getByText("Why Fiyu found it")).toBeTruthy();
    expect(view.getByText("Practical info")).toBeTruthy();
    expect(view.getByText("Location")).toBeTruthy();
    const score = view.getByLabelText("Fiyu score 8.4 out of 10");
    const flattened = StyleSheet.flatten(score.props.style);
    expect(flattened.backgroundColor).toBeUndefined();
    expect(flattened.borderWidth).toBeUndefined();

    fireEvent.press(view.getByText("Save"));
    fireEvent.press(view.getByText("Log visit"));
    expect(view.getByText("Directions")).toBeTruthy();
    expect(view.getByText("Share")).toBeTruthy();
    expect(view.getByText("Saved places could not be updated.")).toBeTruthy();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.press(view.getByText("Signals behind the score")); });
    await waitFor(() => expect(view.getByText("Specialist focus")).toBeTruthy());
    view.unmount();
  });
});
