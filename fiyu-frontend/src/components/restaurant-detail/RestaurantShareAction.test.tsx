// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RestaurantShareAction } from "@/components/restaurant-detail/RestaurantShareAction";

const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function setNavigatorProperty(name: "share" | "clipboard", value: unknown) {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

afterEach(() => {
  cleanup();
  if (shareDescriptor) Object.defineProperty(navigator, "share", shareDescriptor);
  else Reflect.deleteProperty(navigator, "share");
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

describe("restaurant sharing", () => {
  it("uses native sharing with only the canonical public restaurant payload", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty("share", share);
    render(<RestaurantShareAction placeId="place id" restaurantName="Sushi Saito" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Sushi Saito" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share).toHaveBeenCalledWith({
      title: "Sushi Saito on Fiyu",
      text: "Thought you might like this place on Fiyu.",
      url: `${window.location.origin}/restaurants/place%20id`,
    });
    const payload = share.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("private_note");
    expect(payload).not.toHaveProperty("rating");
  });

  it("copies the canonical URL when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty("share", undefined);
    setNavigatorProperty("clipboard", { writeText });
    render(<RestaurantShareAction placeId="detail-place" restaurantName="Sushi Saito" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Sushi Saito" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/restaurants/detail-place`,
    ));
    expect(screen.getByRole("status").textContent).toBe("Link copied");
  });

  it("offers a selectable link when clipboard access fails", async () => {
    setNavigatorProperty("share", undefined);
    setNavigatorProperty("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    render(<RestaurantShareAction placeId="detail-place" restaurantName="Sushi Saito" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Sushi Saito" }));

    const fallback = await screen.findByRole("textbox", { name: "Restaurant link to copy" });
    expect(fallback.getAttribute("readonly")).not.toBeNull();
    expect((fallback as HTMLInputElement).value).toBe(
      `${window.location.origin}/restaurants/detail-place`,
    );
  });
});
