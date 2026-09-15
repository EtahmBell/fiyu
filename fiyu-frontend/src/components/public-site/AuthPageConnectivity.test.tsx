// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthRequestError } from "@/lib/auth/authErrors";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getSession: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/auth/authService", () => ({
  authService: {
    isConfigured: () => true,
    getSession: mocks.getSession,
    signUp: mocks.signUp,
    signIn: mocks.signIn,
    requestPasswordReset: vi.fn(),
    onPasswordRecovery: () => () => undefined,
    updatePassword: vi.fn(),
  },
}));

import { AuthPage } from "@/components/public-site/AuthPage";

function fillSignup() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-password" } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "person" } });
}

function fillSignin() {
  fireEvent.change(screen.getByLabelText("Email or username"), { target: { value: "@person" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-password" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(null);
});
afterEach(() => cleanup());

describe("AuthPage connectivity failures", () => {
  it.each([
    ["network_unreachable", "We couldn’t connect to Fiyu"],
    ["request_timeout", "taking longer than expected"],
    ["rate_limited", "Too many attempts"],
    ["service_unavailable", "temporarily unavailable"],
  ] as const)("shows classified signup %s copy and preserves the form", async (code, copy) => {
    mocks.signUp.mockRejectedValue(new AuthRequestError(code));
    render(<AuthPage mode="signup" />);
    fillSignup();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect((await screen.findByRole("alert")).textContent).toContain(copy);
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("person@example.com");
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("person");
    expect(screen.queryByRole("button", { name: "Try again" }) !== null).toBe(
      code === "network_unreachable" || code === "request_timeout" || code === "service_unavailable",
    );
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
  });

  it("offers sign-in when the account already exists", async () => {
    mocks.signUp.mockRejectedValue(new AuthRequestError("user_already_exists"));
    render(<AuthPage mode="signup" />);
    fillSignup();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("link", { name: "Sign in instead" })).toBeTruthy();
  });

  it.each([
    ["invalid_credentials", "Email/username or password is incorrect."],
    ["email_not_confirmed", "Check your email to verify your account"],
    ["network_unreachable", "We couldn’t connect to Fiyu"],
  ] as const)("does not collapse signin %s into a generic credential error", async (code, copy) => {
    mocks.signIn.mockRejectedValue(new AuthRequestError(code));
    render(<AuthPage mode="signin" />);
    fillSignin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain(copy);
  });

  it("blocks double submission and retries only after an explicit action", async () => {
    let reject!: (error: Error) => void;
    mocks.signUp.mockImplementation(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    render(<AuthPage mode="signup" />);
    fillSignup();
    const form = screen.getByRole("button", { name: "Create account" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    reject(new AuthRequestError("network_unreachable"));
    await screen.findByRole("button", { name: "Try again" });
    mocks.signUp.mockResolvedValue({ email: "person@example.com", emailVerificationRequired: true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(2));
  });
});
