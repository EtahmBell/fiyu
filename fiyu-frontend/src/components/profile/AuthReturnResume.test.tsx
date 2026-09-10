// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthReturnResume } from "@/components/profile/AuthReturnResume";
import { rememberAuthReturnPath } from "@/lib/navigation/safeRedirect";

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
});
