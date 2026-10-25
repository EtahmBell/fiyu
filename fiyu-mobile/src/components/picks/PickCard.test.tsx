import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { restaurantFixture } from "@/test/restaurantFixture";
import { PhotoDisplay, RevealedPickCard } from "./PickCard";

describe("native revealed Pick presentation", () => {
  it("covers fresh attributed media, a safe fallback, and independent Saved/Visited actions", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const onSave = jest.fn();
    const onOpen = jest.fn();
    const photo = { media_url: "https://api.example/photo", width: 800, height: 600, author_attributions: [{ display_name: "Photographer", uri: null, photo_uri: null, flag_content_uri: null }], google_maps_uri: null, flag_content_uri: null };
    const view = await render(
      <QueryClientProvider client={client}>
        <View>
          <PhotoDisplay restaurant={restaurantFixture} photo={photo} />
          <PhotoDisplay restaurant={restaurantFixture} />
          <RevealedPickCard restaurant={restaurantFixture} saved visited photoEnabled={false} onOpen={onOpen} onSave={onSave} onLog={jest.fn()} />
        </View>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Photo: Photographer")).toBeTruthy();
    expect(screen.getAllByText("Photo unavailable")).toHaveLength(2);
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByText("Visited")).toBeTruthy();
    fireEvent.press(screen.getByText("Saved"));
    fireEvent.press(screen.getByText("View restaurant →"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    view.unmount();
    client.clear();
  });
});
