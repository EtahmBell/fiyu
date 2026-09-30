// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { authService, type FiyuAccountProfile } from "@/lib/auth/authService";
import { clearProfileIdentity, refreshProfileIdentity, useProfileIdentity } from "@/lib/profile/profileIdentity";

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearProfileIdentity(); });

it("does not let an old profile request repopulate identity after an account switch", async () => {
  vi.spyOn(authService, "getSession")
    .mockResolvedValueOnce({ userId: "a", email: "a@example.com", accessToken: "test" })
    .mockResolvedValue({ userId: "b", email: "b@example.com", accessToken: "test-b" });
  let finishOld: (value: FiyuAccountProfile) => void = () => undefined;
  const profile = vi.spyOn(authService, "getProfile")
    .mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValue({ user_id: "b", username: "new-account", display_name: null, avatar_url: null, bio: null, created_at: "now", updated_at: "now" });
  const { result } = renderHook(() => useProfileIdentity());
  await waitFor(() => expect(profile).toHaveBeenCalledOnce());
  const oldRequest = refreshProfileIdentity();
  act(() => window.dispatchEvent(new Event("fiyu:account-changed")));
  expect(result.current.profile).toBeNull();
  expect(result.current.email).toBeNull();
  await act(async () => {
    finishOld({ user_id: "a", username: "old-account", display_name: "Private name", avatar_url: "private-avatar", bio: null, created_at: "now", updated_at: "now" });
    await oldRequest;
  });
  await waitFor(() => expect(result.current.profile?.user_id).toBe("b"));
  expect(result.current.profileImage).toBeNull();
  expect(result.current.email).toBe("b@example.com");
});
