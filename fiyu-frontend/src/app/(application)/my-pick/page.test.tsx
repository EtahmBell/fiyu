import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => navigation);

import MyPickPage from "@/app/(application)/my-pick/page";

beforeEach(() => navigation.redirect.mockReset());

describe("legacy My Pick route", () => {
  it("redirects history links into the inline Picks section", async () => {
    await MyPickPage({ searchParams: Promise.resolve({ id: "pick/a" }) });
    expect(navigation.redirect).toHaveBeenCalledWith("/picks?myPick=pick%2Fa");
  });

  it("redirects the route without an id to Picks", async () => {
    await MyPickPage({ searchParams: Promise.resolve({}) });
    expect(navigation.redirect).toHaveBeenCalledWith("/picks");
  });
});
