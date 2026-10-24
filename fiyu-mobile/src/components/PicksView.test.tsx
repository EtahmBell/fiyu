import { fireEvent, render, screen } from "@testing-library/react-native";
import { FiyuApiError } from "@fiyu/contracts";

import { PicksView } from "@/components/PicksView";
import { restaurantFixture } from "@/test/restaurantFixture";

const base = { onRetry: jest.fn(), onOpenRestaurant: jest.fn() };

describe("PicksView", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders loading, empty, network, and malformed states", async () => {
    const { rerender } = await render(<PicksView {...base} isLoading error={null} />);
    expect(screen.getByText("Finding Tokyo restaurants…")).toBeTruthy();
    await rerender(<PicksView {...base} isLoading={false} error={null} data={{ restaurants: [], rejected: [] }} />);
    expect(screen.getByText("No Picks are available yet.")).toBeTruthy();
    await rerender(<PicksView {...base} isLoading={false} error={new FiyuApiError({ kind: "network", endpoint: "/public/restaurants" })} />);
    expect(screen.getByText("Picks could not connect.")).toBeTruthy();
    await rerender(<PicksView {...base} isLoading={false} error={new FiyuApiError({ kind: "invalid-response", endpoint: "/public/restaurants" })} />);
    expect(screen.getByText("Fiyu received restaurant data it could not read.")).toBeTruthy();
  });

  it("renders typed restaurant data and navigates by canonical place id", async () => {
    await render(<PicksView {...base} isLoading={false} error={null} data={{ restaurants: [restaurantFixture], rejected: [] }} />);
    expect(screen.getByText("フィーユ食堂")).toBeTruthy();
    expect(screen.getByText("8.4")).toBeTruthy();
    fireEvent.press(screen.getByTestId("restaurant-ChIJnativeproof"));
    expect(base.onOpenRestaurant).toHaveBeenCalledWith("ChIJnativeproof");
  });

  it("offers retry after an error", async () => {
    await render(<PicksView {...base} isLoading={false} error={new Error("offline")} />);
    fireEvent.press(screen.getByText("Try again"));
    expect(base.onRetry).toHaveBeenCalledTimes(1);
  });
});
