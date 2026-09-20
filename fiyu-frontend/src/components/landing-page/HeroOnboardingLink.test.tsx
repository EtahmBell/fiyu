// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { HeroOnboardingLink } from "./HeroOnboardingLink";
import { authService, type AuthSession } from "@/lib/auth/authService";
import { clearProfileIdentity } from "@/lib/profile/profileIdentity";

beforeEach(() => clearProfileIdentity());
afterEach(() => { cleanup(); clearProfileIdentity(); vi.restoreAllMocks(); });

it("renders neutral, non-interactive server markup even before session hydration", () => {
  const markup = renderToString(<HeroOnboardingLink />);
  expect(markup).toContain("disabled");
  expect(markup).toContain("Loading…");
  expect(markup).not.toContain("href=");
  expect(markup).not.toContain("Get your Fiyu Picks");
});

it("waits for session resolution and recognizes a session without a profile", async () => {
  render(<HeroOnboardingLink />);
  expect(screen.getByRole("link").getAttribute("href")).toBe("/signup?next=/picks");
  let resolveSession!: (session: AuthSession | null) => void;
  vi.spyOn(authService, "getSession").mockImplementationOnce(() => new Promise((resolve) => { resolveSession = resolve; }));
  vi.spyOn(authService, "getProfile").mockResolvedValueOnce(null);
  act(() => window.dispatchEvent(new Event("fiyu:account-changed")));
  await waitFor(() => expect(resolveSession).toBeTypeOf("function"));
  expect(screen.queryByRole("link")).toBeNull();
  expect((screen.getByRole("button", { name: "Loading…" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => resolveSession({ userId: "user-1", email: "test@example.com", accessToken: "test" }));
  expect(screen.getByRole("link", { name: "See today’s Picks" }).getAttribute("href")).toBe("/picks");
  act(() => clearProfileIdentity());
  expect(screen.getByRole("link", { name: "Get your Fiyu Picks" }).getAttribute("href")).toBe("/signup?next=/picks");
});

it("offers a neutral recovery destination if the session cannot be determined", async () => {
  render(<HeroOnboardingLink />);
  vi.spyOn(authService, "getSession").mockRejectedValueOnce(new Error("offline"));
  act(() => window.dispatchEvent(new Event("fiyu:account-changed")));
  expect((await screen.findByRole("link", { name: "Continue to Fiyu" })).getAttribute("href")).toBe("/signin?next=/picks");
  expect(screen.queryByText("Get your Fiyu Picks")).toBeNull();
});
