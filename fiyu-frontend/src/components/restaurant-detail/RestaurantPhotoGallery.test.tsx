// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestaurantPhotoGallery } from "@/components/restaurant-detail/RestaurantPhotoGallery";
import type { GooglePhoto } from "@/lib/api/schemas";

const photoApi = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ fetchPhotos: photoApi.fetch }));

function photo(index: number): GooglePhoto {
  return {
    media_url: `https://photos.example/photo-${index}`,
    width: 1200,
    height: 800,
    author_attributions: [
      {
        display_name: `Photographer ${index}`,
        uri: `https://authors.example/${index}`,
        photo_uri: null,
        flag_content_uri: null,
      },
    ],
    google_maps_uri: `https://maps.google.com/photo-${index}`,
    flag_content_uri: null,
  };
}

beforeEach(() => {
  photoApi.fetch.mockReset();
  photoApi.fetch.mockResolvedValue([photo(1), photo(2), photo(3)]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("restaurant detail photo gallery", () => {
  it("derives segmented position indicators from the photo count", async () => {
    render(<RestaurantPhotoGallery placeId="gallery" restaurantName="Gallery restaurant" />);

    await screen.findAllByRole("img", { name: /photo 1 from Google/ });
    const indicators = screen.getAllByTestId("photo-position-indicator");

    expect(indicators).toHaveLength(2);
    for (const indicator of indicators) {
      expect(indicator.children).toHaveLength(3);
      expect(indicator.children[0].getAttribute("data-active")).toBe("true");
      expect(indicator.children[1].getAttribute("data-active")).toBe("false");
    }
  });

  it("does not render a position indicator for a single photo", async () => {
    photoApi.fetch.mockResolvedValueOnce([photo(1)]);
    render(<RestaurantPhotoGallery placeId="single" restaurantName="Single photo" />);

    await screen.findAllByRole("img", { name: /photo 1 from Google/ });
    expect(screen.queryByTestId("photo-position-indicator")).toBeNull();
  });

  it("keeps desktop controls visible and mobile controls screen-reader-only", async () => {
    render(<RestaurantPhotoGallery placeId="controls" restaurantName="Gallery controls" />);

    await screen.findAllByRole("img", { name: /photo 1 from Google/ });
    expect(document.querySelector('[data-gallery-control="desktop-previous"]')).not.toBeNull();
    expect(document.querySelector('[data-gallery-control="desktop-next"]')).not.toBeNull();

    const mobileControls = screen.getByTestId("mobile-accessible-gallery-controls");
    expect(mobileControls.className).toContain("sr-only");
    expect(within(mobileControls).getByRole("button", { name: "Previous photo" })).toBeTruthy();
    expect(within(mobileControls).getByRole("button", { name: "Next photo" })).toBeTruthy();
  });

  it("updates the image, active segment, count, and attribution after a native swipe", async () => {
    render(<RestaurantPhotoGallery placeId="swipe" restaurantName="Swipe gallery" />);

    await screen.findAllByRole("img", { name: /photo 1 from Google/ });
    const track = screen.getByRole("region", { name: "Restaurant photo gallery" });
    Object.defineProperty(track, "clientWidth", { configurable: true, value: 320 });
    Object.defineProperty(track, "scrollLeft", { configurable: true, value: 320, writable: true });
    fireEvent.scroll(track);

    await waitFor(() => {
      expect(screen.getAllByText("Photo 2 of 3").length).toBeGreaterThan(0);
    });
    for (const indicator of screen.getAllByTestId("photo-position-indicator")) {
      expect(indicator.children[1].getAttribute("data-active")).toBe("true");
    }
    expect(screen.getByTestId("desktop-active-gallery-photo").getAttribute("src")).toBe(
      "https://photos.example/photo-2",
    );
    expect(screen.getAllByRole("link", { name: "Photographer 2" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Photographer 1" })).toBeNull();
  });

  it("does not mistake a vertical touch gesture for a photo swipe", async () => {
    render(<RestaurantPhotoGallery placeId="vertical" restaurantName="Vertical scroll" />);

    await screen.findAllByRole("img", { name: /photo 1 from Google/ });
    const track = screen.getByRole("region", { name: "Restaurant photo gallery" });
    fireEvent.touchStart(track, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(track, { touches: [{ clientX: 104, clientY: 190 }] });
    fireEvent.touchEnd(track);

    expect(screen.getAllByText("Photo 1 of 3").length).toBeGreaterThan(0);
    for (const indicator of screen.getAllByTestId("photo-position-indicator")) {
      expect(indicator.children[0].getAttribute("data-active")).toBe("true");
    }
  });

  it("keeps the mobile track contained within the gallery width", async () => {
    render(<RestaurantPhotoGallery placeId="contained" restaurantName="Contained gallery" />);

    await screen.findAllByRole("img", { name: /photo 1 from Google/ });
    const track = screen.getByRole("region", { name: "Restaurant photo gallery" });
    expect(track.className).toContain("w-full");
    expect(track.className).toContain("max-w-full");
    expect(track.parentElement?.parentElement?.className).toContain("overflow-hidden");
  });
});
