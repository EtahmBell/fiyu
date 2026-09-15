// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusPage } from "@/components/public-site/StatusPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StatusPage", () => {
  it("hydrates without a server/client hostname or network-state mismatch", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const element = <StatusPage />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args.map(String).join(" ")));
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => { root = hydrateRoot(container, element); });
    expect(errors).toEqual([]);
    await act(async () => root?.unmount());
    container.remove();
  });

  it("checks each downstream service once and renders no credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    render(<StatusPage />);
    await waitFor(() => expect(screen.getAllByText("Online")).toHaveLength(3));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("apikey")).toBe("public-test-key");
    expect(document.body.textContent).not.toContain("anon");
    expect(document.body.textContent).not.toContain("token");
  });

  it("distinguishes API and account failures and reruns only on Retry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    render(<StatusPage />);
    await waitFor(() => expect(screen.getByText("Unable to connect")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByText("Online")).toHaveLength(3));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
