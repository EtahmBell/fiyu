import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { fetchMyPickPlaceSuggestions, submitMyPick } from "@/api/client";
import { MyPickComposerContent } from "./MyPickComposer";

jest.mock("@/api/client", () => ({
  fetchMyPickPlaceSuggestions: jest.fn(),
  submitMyPick: jest.fn(),
}));

const suggestion = { external_place_id: "ChIJnative", primary_text: "Google display", secondary_text: "Tokyo" };
const quota = { limit: 3 as const, used: 1, remaining: 2, window_hours: 24 as const, next_available_at: null };

async function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return await render(<QueryClientProvider client={client}><MyPickComposerContent quota={quota} onClose={jest.fn()} /></QueryClientProvider>);
}

describe("MyPickComposer", () => {
  beforeEach(() => jest.clearAllMocks());

  it("looks up only on Find, invalidates selection on edit, and submits original hints", async () => {
    jest.mocked(fetchMyPickPlaceSuggestions).mockResolvedValue([suggestion]);
    jest.mocked(submitMyPick).mockResolvedValue({ my_pick_id: "0d196bd8-2d5f-4be9-a0b5-4bd247188526" } as never);
    const rendered = await view();
    await act(() => { fireEvent.changeText(rendered.getByTestId("my-pick-name"), "My authored name"); });
    await act(() => { fireEvent.changeText(rendered.getByTestId("my-pick-address"), "My authored address"); });
    expect(fetchMyPickPlaceSuggestions).not.toHaveBeenCalled();

    await act(() => { fireEvent.press(rendered.getByTestId("my-pick-find")); });
    await waitFor(() => expect(fetchMyPickPlaceSuggestions).toHaveBeenCalledTimes(1));
    await act(() => { fireEvent.press(rendered.getByText("Google display")); });
    await act(() => { fireEvent.changeText(rendered.getByTestId("my-pick-address"), "Edited address"); });
    fireEvent.press(rendered.getByTestId("my-pick-submit"));
    expect(submitMyPick).not.toHaveBeenCalled();

    await act(() => { fireEvent.press(rendered.getByTestId("my-pick-find")); });
    await rendered.findByText("Google display");
    await act(() => { fireEvent.press(rendered.getByText("Google display")); });
    await act(() => { fireEvent.press(rendered.getByTestId("my-pick-submit")); });
    await waitFor(() => expect(submitMyPick).toHaveBeenCalledWith({ externalPlaceId: "ChIJnative", userNameHint: "My authored name", userAddressHint: "Edited address" }));
    const firstToken = jest.mocked(fetchMyPickPlaceSuggestions).mock.calls[0][0].session_token;
    const secondToken = jest.mocked(fetchMyPickPlaceSuggestions).mock.calls[1][0].session_token;
    expect(firstToken).not.toBe(secondToken);
    expect(firstToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("requires both fields and clears a selected place when the name changes", async () => {
    jest.mocked(fetchMyPickPlaceSuggestions).mockResolvedValue([suggestion]);
    const rendered = await view();
    fireEvent.press(rendered.getByTestId("my-pick-find"));
    expect(fetchMyPickPlaceSuggestions).not.toHaveBeenCalled();
    await act(() => { fireEvent.changeText(rendered.getByTestId("my-pick-name"), "Name"); });
    fireEvent.press(rendered.getByTestId("my-pick-find"));
    expect(fetchMyPickPlaceSuggestions).not.toHaveBeenCalled();
    await act(() => { fireEvent.changeText(rendered.getByTestId("my-pick-address"), "Address"); });
    await act(() => { fireEvent.press(rendered.getByTestId("my-pick-find")); });
    await rendered.findByText("Google display");
    await act(() => { fireEvent.press(rendered.getByText("Google display")); });
    await act(() => { fireEvent.changeText(rendered.getByTestId("my-pick-name"), "Changed name"); });
    fireEvent.press(rendered.getByTestId("my-pick-submit"));
    expect(submitMyPick).not.toHaveBeenCalled();
  });

  it("shows rolling quota exhaustion without offering search", async () => {
    const rendered = await render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } })}><MyPickComposerContent quota={{ ...quota, used: 3, remaining: 0, next_available_at: "2026-10-26T12:00:00Z" }} onClose={jest.fn()} /></QueryClientProvider>);
    expect(rendered.getByText("You’ve used your 3 My Picks for now.")).toBeTruthy();
    expect(rendered.queryByTestId("my-pick-find")).toBeNull();
  });
});
