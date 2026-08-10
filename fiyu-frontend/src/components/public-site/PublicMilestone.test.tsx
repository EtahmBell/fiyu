// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
  signUp: vi.fn(),
  signIn: vi.fn(),
  requestPasswordReset: vi.fn(),
  onPasswordRecovery: vi.fn(() => () => undefined),
  updatePassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/auth/authService", () => ({
  authService: {
    isConfigured: () => true,
    getSession: mocks.getSession,
    signUp: mocks.signUp,
    signIn: mocks.signIn,
    requestPasswordReset: mocks.requestPasswordReset,
    onPasswordRecovery: mocks.onPasswordRecovery,
    updatePassword: mocks.updatePassword,
  },
}));

import AboutPage from "@/app/(marketing)/about/page";
import ContactPage from "@/app/(marketing)/contact/page";
import PrivacyPage from "@/app/(marketing)/privacy/page";
import TermsPage from "@/app/(marketing)/terms/page";
import { LandingFooter } from "@/components/landing-page/LandingFooter";
import { AuthPage } from "@/components/public-site/AuthPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.getSession.mockResolvedValue(null);
  window.localStorage.clear();
});

describe("public account milestone", () => {
  it("presents a distinct editorial About narrative", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "Finding the places worth knowing." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Why Fiyu" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Why only a few" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How Fiyu gets better" })).toBeTruthy();
    expect(screen.getByText(/local-language research, machine learning/i)).toBeTruthy();
    expect(screen.getByTestId("about-tabletop")).toBeTruthy();
  });

  it("submits the Contact form and shows an inline success state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "new" }), { status: 201 }),
    );
    render(<ContactPage />);

    expect(screen.getByRole("heading", { name: "We’d love to hear from you." })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ethan" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ethan@example.com" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "A restaurant suggestion." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect((await screen.findByRole("status")).textContent).toBe("Thanks — your message has been sent.");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("publishes the legal documents with reciprocal links", () => {
    const { unmount } = render(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Account Deletion" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms of Service →" }).getAttribute("href")).toBe("/terms");
    expect(screen.queryByText(/have not been published yet/i)).toBeNull();

    unmount();
    const terms = render(<TermsPage />);

    expect(screen.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "15. Limitation of Liability" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy Policy →" }).getAttribute("href")).toBe("/privacy");
    expect(screen.queryByText(/have not been published yet/i)).toBeNull();

    terms.unmount();
    render(<LandingFooter />);

    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  });

  it("creates an account and handles provider email verification", async () => {
    mocks.signUp.mockResolvedValue({
      email: "person@example.com",
      emailVerificationRequired: true,
    });
    render(<AuthPage mode="signup" />);

    expect(screen.getByText(/By creating an account, you agree to the/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "provider-password" } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "person" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(screen.getByText(/Verify your email to finish creating your Fiyu account/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Return to sign in" }).getAttribute("href")).toBe("/signin");
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "provider-password",
      username: "person",
    });
  });

  it("signs in with an email or username identifier and routes into Picks", async () => {
    mocks.signIn.mockResolvedValue({
      userId: "user",
      email: "person@example.com",
      accessToken: "token",
    });
    render(<AuthPage mode="signin" />);

    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByPlaceholderText("Email or username")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email or username"), { target: { value: "@person" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "provider-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/picks"));
    expect(mocks.signIn).toHaveBeenCalledWith({
      identifier: "@person",
      password: "provider-password",
    });
  });
});
