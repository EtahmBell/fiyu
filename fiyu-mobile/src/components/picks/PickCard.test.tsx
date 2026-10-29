import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, View } from "react-native";

import { restaurantDetailFixture, restaurantFixture } from "@/test/restaurantFixture";
import { ConcealedPickCard, PhotoDisplay, RevealedPickCard } from "./PickCard";

jest.mock("expo-image", () => {
  const { View: MockView } = jest.requireActual("react-native");
  return { Image: (props: object) => <MockView {...props} /> };
});

describe("native revealed Pick presentation", () => {
  it("keeps concealed cards compact and exposes both native map destinations after reveal", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const onSave = jest.fn();
    const onOpen = jest.fn();
    const photo = { media_url: "https://api.example/photo", width: 800, height: 600, author_attributions: [{ display_name: "Photographer", uri: null, photo_uri: null, flag_content_uri: null }], google_maps_uri: null, flag_content_uri: null };
    const view = await render(
      <QueryClientProvider client={client}>
        <View>
          <ConcealedPickCard index={0} />
          <PhotoDisplay restaurant={restaurantFixture} photo={photo} />
          <PhotoDisplay restaurant={restaurantFixture} />
          <RevealedPickCard restaurant={restaurantDetailFixture} saved={false} visited={false} photoEnabled={false} onOpen={jest.fn()} onSave={jest.fn()} onLog={jest.fn()} />
          <RevealedPickCard restaurant={restaurantFixture} saved visited photoEnabled={false} onOpen={onOpen} onSave={onSave} onLog={jest.fn()} />
        </View>
      </QueryClientProvider>,
    );
    expect(view.getByTestId("concealed-pick-0")).toBeTruthy();
    expect(view.queryByText("A place worth knowing")).toBeNull();
    expect(screen.getByText("Photo: Photographer")).toBeTruthy();
    expect(screen.getAllByText("Photo unavailable")).toHaveLength(3);
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByText("Visited")).toBeTruthy();
    fireEvent.press(view.getByText("Google Maps ↗"));
    fireEvent.press(view.getByText("Apple Maps ↗"));
    fireEvent.press(screen.getByText("Saved"));
    fireEvent.press(screen.getAllByText("View restaurant →")[1]);
    expect(open).toHaveBeenNthCalledWith(1, expect.stringContaining("google.com/maps"));
    expect(open).toHaveBeenNthCalledWith(2, expect.stringContaining("maps.apple.com"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    open.mockRestore();
    view.unmount();
    client.clear();
  });
});
