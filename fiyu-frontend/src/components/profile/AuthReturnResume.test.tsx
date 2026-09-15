// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthReturnResume } from "@/components/profile/AuthReturnResume";
import { rememberAuthReturnPath } from "@/lib/navigation/safeRedirect";
import { AuthRequestError } from "@/lib/auth/authErrors";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), getSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/auth/authService", () => ({ authService: { getSession: mocks.getSession } }));

describe("AuthReturnResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });
  afterEach(() => cleanup());

  it("resumes an explicit Together Join after an email callback", async () => {
    rememberAuthReturnPath("/together/secure-token?join=1");
    mocks.getSession.mockResolvedValue({ userId: "invitee" });
    render(<AuthReturnResume />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/together/secure-token?join=1"));
  });

  it("never stores an external return destination", async () => {
    rememberAuthReturnPath("https://evil.example/steal");
    mocks.getSession.mockResolvedValue({ userId: "invitee" });
    render(<AuthReturnResume />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/picks"));
  });

  it("offers an explicit retry after callback connectivity fails", async () => {
    rememberAuthReturnPath("/together/secure-token?join=1");
    mocks.getSession.mockRejectedValueOnce(new AuthRequestError("network_unreachable"))
      .mockResolvedValueOnce({ userId: "invitee" });
    render(<AuthReturnResume />);
    expect(await screen.findByText(/couldn’t finish signing you in/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/together/secure-token?join=1"));
  });

  it("identifies expired callback parameters without consuming the safe return path", async () => {
    window.history.replaceState({}, "", "/?error_code=otp_expired");
    rememberAuthReturnPath("/together/secure-token?join=1");
    render(<AuthReturnResume />);
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
