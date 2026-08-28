// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationWarmup } from "@/components/layout/ApplicationWarmup";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

const navigation = vi.hoisted(() => ({ prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

afterEach(() => {
  cleanup();
  navigation.prefetch.mockReset();
  clearProfileIdentity();
});

describe("application warmup", () => {
  it("prefetches only the five primary destinations after authenticated boot", async () => {
    clearProfileIdentity();
    render(<ApplicationWarmup />);
    expect(navigation.prefetch).not.toHaveBeenCalled();

    act(() => publishProfileIdentity({
      user_id: "account-a",
      username: "accounta",
      display_name: "Account A",
      bio: null,
      avatar_url: null,
      created_at: "2026-08-27T00:00:00Z",
      updated_at: "2026-08-27T00:00:00Z",
    }));

    await waitFor(() => expect(navigation.prefetch).toHaveBeenCalledTimes(5));
    expect(navigation.prefetch.mock.calls.map(([href]) => href)).toEqual([
      "/picks",
      "/lists",
      "/log",
      "/map",
      "/profile",
    ]);
  });
});
