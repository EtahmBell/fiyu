import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { AuthProvider, protectedRouteGroups, useAuth } from "@/auth/AuthProvider";
import type { AuthService, AuthSession } from "@/auth/service";

const session: AuthSession = { userId: "user-1", email: "dev@example.com", accessToken: "token" };

function Consumer() {
  const auth = useAuth();
  return <Text>{auth.status}</Text>;
}

function serviceWith(initial: AuthSession | null): AuthService {
  return {
    isConfigured: () => true,
    getSession: jest.fn(async () => initial),
    signIn: jest.fn(async () => session),
    signUp: jest.fn(async () => ({ email: session.email, emailVerificationRequired: false })),
    signOut: jest.fn(async () => undefined),
    deleteAccount: jest.fn(async () => undefined),
    subscribe: jest.fn(() => () => undefined),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };
}

describe("AuthProvider", () => {
  it("holds a bootstrap state before resolving unauthenticated", async () => {
    let resolveSession: ((value: AuthSession | null) => void) | undefined;
    const service = serviceWith(null);
    service.getSession = jest.fn(() => new Promise((resolve) => { resolveSession = resolve; }));
    await render(<AuthProvider service={service}><Consumer /></AuthProvider>);
    expect(screen.getByText("loading")).toBeTruthy();
    await act(async () => resolveSession?.(null));
    await waitFor(() => expect(screen.getByText("unauthenticated")).toBeTruthy());
  });

  it("restores an authenticated session", async () => {
    await render(<AuthProvider service={serviceWith(session)}><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("authenticated")).toBeTruthy());
  });

  it("finishes bootstrap without crashing when persisted storage is unavailable", async () => {
    const service = serviceWith(null);
    service.getSession = jest.fn(async () => { throw new Error("storage unavailable"); });

    await render(<AuthProvider service={service}><Consumer /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("unauthenticated")).toBeTruthy());
  });

  it("drives mutually exclusive protected route groups", () => {
    expect(protectedRouteGroups("unauthenticated")).toEqual({ auth: true, application: false });
    expect(protectedRouteGroups("authenticated")).toEqual({ auth: false, application: true });
  });
});
