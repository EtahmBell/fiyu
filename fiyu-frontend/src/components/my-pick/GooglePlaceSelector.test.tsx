// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ getGoogleMapsBrowserKey: () => "public-test-key" }));

import { GooglePlaceSelector } from "@/components/my-pick/GooglePlaceSelector";
import { resetGoogleMapsLoaderForTests } from "@/lib/google/mapsLoader";

type Suggestion = {
  placePrediction: {
    placeId: string;
    mainText: { text: string };
    secondaryText: { text: string };
    text: { text: string };
  };
};

type TestWindow = Window & {
  google?: { maps: { importLibrary: ReturnType<typeof vi.fn> } };
};

const suggestion = (placeId: string, main: string, secondary: string): Suggestion => ({
  placePrediction: {
    placeId,
    mainText: { text: main },
    secondaryText: { text: secondary },
    text: { text: `${main}, ${secondary}` },
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let fetchSuggestions: ReturnType<typeof vi.fn>;
let Token: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSuggestions = vi.fn(async () => ({ suggestions: [suggestion("place-1", "Toritsune", "Shibuya, Tokyo")] }));
  Token = vi.fn(function MockToken(this: { marker?: string }) { this.marker = "session"; });
  (window as TestWindow).google = {
    maps: {
      importLibrary: vi.fn(async () => ({
        AutocompleteSessionToken: Token,
        AutocompleteSuggestion: { fetchAutocompleteSuggestions: fetchSuggestions },
      })),
    },
  };
});

afterEach(() => {
  cleanup();
  resetGoogleMapsLoaderForTests();
  delete (window as TestWindow).google;
  document.querySelectorAll('script[data-fiyu-google-maps]').forEach((script) => script.remove());
});

describe("GooglePlaceSelector", () => {
  it("requires both fields and never searches while either field is being typed", async () => {
    render(<GooglePlaceSelector onSelect={vi.fn()} />);
    const find = screen.getByRole<HTMLButtonElement>("button", { name: "Find restaurant" });
    const name = screen.getByRole("combobox", { name: /Restaurant name/ });
    const address = screen.getByRole("textbox", { name: /Restaurant address/ });
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));
    expect(find.disabled).toBe(true);
    fireEvent.change(name, { target: { value: "澤田" } });
    expect(find.disabled).toBe(true);
    expect(fetchSuggestions).not.toHaveBeenCalled();
    fireEvent.change(address, { target: { value: "吉祥寺" } });
    expect(find.disabled).toBe(false);
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  it("waits for Find restaurant before using the Data API with Fiyu's constraints", async () => {
    render(<div role="dialog"><GooglePlaceSelector onSelect={vi.fn()} /></div>);
    const input = screen.getByRole("combobox", { name: /Restaurant name/ });
    const address = screen.getByRole("textbox", { name: /Restaurant address/ });
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: "Toritsune Shizendo" } });
    fireEvent.change(address, { target: { value: "1-2-3 Sotokanda, Tokyo" } });
    expect(fetchSuggestions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledTimes(1));
    const request = fetchSuggestions.mock.calls[0][0];
    expect(request).toMatchObject({
      input: "Toritsune Shizendo 1-2-3 Sotokanda, Tokyo",
      includedRegionCodes: ["jp"],
      locationRestriction: { west: 139.56, east: 139.92, south: 35.52, north: 35.82 },
    });
    expect(request.sessionToken).toBe(Token.mock.instances[0]);
    expect(document.querySelector("gmp-place-autocomplete")).toBeNull();
    expect(within(screen.getByRole("dialog")).getByTestId("google-predictions")).toBeTruthy();
  });

  it("renders prediction text and attribution, then selects transient UI text by mouse", async () => {
    const onSelect = vi.fn();
    render(<GooglePlaceSelector onSelect={onSelect} />);
    const input = screen.getByRole("combobox", { name: /Restaurant name/ });
    const address = screen.getByRole("textbox", { name: /Restaurant address/ });
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "Tor" } });
    fireEvent.change(address, { target: { value: "Shibuya, Tokyo" } });
    expect(fetchSuggestions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    expect(await screen.findByText("Toritsune")).toBeTruthy();
    expect(screen.getByText("Shibuya, Tokyo")).toBeTruthy();
    expect(screen.getByLabelText("Google Maps").getAttribute("translate")).toBe("no");
    fireEvent.click(screen.getByRole("button", { name: /Toritsune/ }));
    expect(onSelect).toHaveBeenCalledWith({
      placeId: "place-1",
      userNameHint: "Tor",
      userAddressHint: "Shibuya, Tokyo",
      displayName: "Toritsune",
      secondaryText: "Shibuya, Tokyo",
    });
  });

  it("supports keyboard selection", async () => {
    const onSelect = vi.fn();
    render(<GooglePlaceSelector onSelect={onSelect} />);
    const input = screen.getByRole("combobox", { name: /Restaurant name/ });
    fireEvent.change(screen.getByRole("textbox", { name: /Restaurant address/ }), { target: { value: "Tokyo" } });
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "Tor" } });
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    await screen.findByText("Toritsune");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ placeId: "place-1" }));
  });

  it("visibly selects a result and invalidates it when either user-owned field changes", async () => {
    const onSelect = vi.fn();
    render(<GooglePlaceSelector onSelect={onSelect} />);
    const name = screen.getByRole("combobox", { name: /Restaurant name/ });
    const address = screen.getByRole("textbox", { name: /Restaurant address/ });
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));
    fireEvent.change(name, { target: { value: "Ramen Sawada" } });
    fireEvent.change(address, { target: { value: "Kichijoji Minamicho, Musashino" } });
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    fireEvent.click(await screen.findByRole("button", { name: /Toritsune/ }));
    expect(screen.getByRole("option").getAttribute("aria-selected")).toBe("true");
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ placeId: "place-1" }));
    fireEvent.change(address, { target: { value: "Kichijoji, Tokyo" } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("keeps both inputs after an empty or failed search", async () => {
    fetchSuggestions.mockResolvedValueOnce({ suggestions: [] }).mockRejectedValueOnce(new Error("offline"));
    render(<GooglePlaceSelector onSelect={vi.fn()} />);
    const name = screen.getByRole<HTMLInputElement>("combobox", { name: /Restaurant name/ });
    const address = screen.getByRole<HTMLInputElement>("textbox", { name: /Restaurant address/ });
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));
    fireEvent.change(name, { target: { value: "Ramen Sawada" } });
    fireEvent.change(address, { target: { value: "Kichijoji" } });
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    expect(await screen.findByText(/couldn't find a matching restaurant/i)).toBeTruthy();
    expect(name.value).toBe("Ramen Sawada");
    expect(address.value).toBe("Kichijoji");
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    expect(await screen.findByText(/couldn't check restaurants right now/i)).toBeTruthy();
    expect(name.value).toBe("Ramen Sawada");
    expect(address.value).toBe("Kichijoji");
  });

  it("ignores a stale response and reuses its token for the current search interaction", async () => {
    const first = deferred<{ suggestions: Suggestion[] }>();
    const second = deferred<{ suggestions: Suggestion[] }>();
    fetchSuggestions
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(<GooglePlaceSelector onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: /Restaurant name/ });
    const address = screen.getByRole("textbox", { name: /Restaurant address/ });
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: "To" } });
    fireEvent.change(address, { target: { value: "Tokyo" } });
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "Tori" } });
    fireEvent.click(screen.getByRole("button", { name: "Find restaurant" }));
    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledTimes(2));
    const token = fetchSuggestions.mock.calls[0][0].sessionToken;
    expect(fetchSuggestions.mock.calls[1][0].sessionToken).toBe(token);

    second.resolve({ suggestions: [suggestion("new", "Toriyoshi", "Shinjuku, Tokyo")] });
    expect(await screen.findByText("Toriyoshi")).toBeTruthy();
    first.resolve({ suggestions: [suggestion("old", "Old result", "Tokyo")] });
    await act(async () => { await first.promise; });
    expect(screen.queryByText("Old result")).toBeNull();
  });

  it("creates a fresh token when a new selector session mounts", async () => {
    const first = render(<GooglePlaceSelector onSelect={vi.fn()} />);
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<GooglePlaceSelector onSelect={vi.fn()} />);
    await waitFor(() => expect(Token).toHaveBeenCalledTimes(2));
  });
});
