import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { FiyuApiError } from "@fiyu/contracts";

import { AuthProvider } from "@/auth/AuthProvider";
import type { AuthService, AuthSession } from "@/auth/service";
import { AuthScreen } from "@/components/AuthScreen";

jest.mock("expo-router", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const native = jest.requireActual<typeof import("react-native")>("react-native");
  return { Link: ({ children }: { children: React.ReactNode }) => react.createElement(native.Text, null, children) };
});

const session: AuthSession = { userId: "user-1", email: "dev@example.com", accessToken: "token" };

function mockService(signIn: AuthService["signIn"]): AuthService {
  return {
    isConfigured: () => true,
    getSession: jest.fn(async () => null),
    signIn,
    signUp: jest.fn(async () => ({ email: session.email, emailVerificationRequired: false })),
    signOut: jest.fn(async () => undefined),
    subscribe: jest.fn(() => () => undefined),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };
}

describe("AuthScreen", () => {
  it("submits the existing identifier/password contract", async () => {
    const signIn = jest.fn(async () => session);
    await render(<AuthProvider service={mockService(signIn)}><AuthScreen mode="signin" /></AuthProvider>);
    await fireEvent.changeText(screen.getByLabelText("Email or username"), "dev@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.press(screen.getByText("Sign in"));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ identifier: "dev@example.com", password: "password" }));
  });

  it("shows a normalized connection error", async () => {
    const signIn = jest.fn(async () => { throw new FiyuApiError({ kind: "network", endpoint: "/auth/signin" }); });
    await render(<AuthProvider service={mockService(signIn)}><AuthScreen mode="signin" /></AuthProvider>);
    await fireEvent.changeText(screen.getByLabelText("Email or username"), "dev@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.press(screen.getByText("Sign in"));
    await waitFor(() => expect(screen.getByText("Fiyu could not connect right now. Please try again.")).toBeTruthy());
  });
});
