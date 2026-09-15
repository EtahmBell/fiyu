// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "unavailable", refresh: vi.fn() }));
vi.mock("@/lib/profile/profileIdentity", () => ({
  useProfileIdentity: () => ({ status: mocks.status }),
  refreshProfileIdentity: mocks.refresh,
}));

import { AuthHydrationGate } from "@/components/profile/AuthHydrationGate";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AuthHydrationGate", () => {
  it("does not render the signed-out application on transient hydration failure", () => {
    render(<AuthHydrationGate><p>Signed-out application</p></AuthHydrationGate>);
    expect(screen.queryByText("Signed-out application")).toBeNull();
    expect(screen.getByText(/couldn’t check your account/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refresh).toHaveBeenCalledWith(true);
  });
});
