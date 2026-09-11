import { afterEach, describe, expect, it } from "vitest";

import {
  clearTogetherRevealArrival,
  consumeTogetherRevealArrival,
  markTogetherRevealArrival,
} from "@/lib/profile/togetherRevealArrival";

describe("togetherRevealArrival", () => {
  afterEach(() => clearTogetherRevealArrival());

  it("is false for a hub visit that did not follow a reveal", () => {
    expect(consumeTogetherRevealArrival("session-1")).toBe(false);
  });

  it("names only the session that was revealed", () => {
    markTogetherRevealArrival("session-1");
    expect(consumeTogetherRevealArrival("session-2")).toBe(false);
    expect(consumeTogetherRevealArrival("session-1")).toBe(true);
  });

  it("answers the same way when one mount asks twice", () => {
    markTogetherRevealArrival("session-1");
    expect(consumeTogetherRevealArrival("session-1")).toBe(true);
    // React may run a component body -- and its useState initialiser -- more
    // than once for a single mount; the stagger must not be lost to a
    // discarded render.
    expect(consumeTogetherRevealArrival("session-1")).toBe(true);
  });

  it("does not replay for a later visit to the same session", () => {
    markTogetherRevealArrival("session-1");
    expect(consumeTogetherRevealArrival("session-1")).toBe(true);
    clearTogetherRevealArrival();
    expect(consumeTogetherRevealArrival("session-1")).toBe(false);
  });

  it("drops a stale arrival when a different reveal happens", () => {
    markTogetherRevealArrival("session-1");
    markTogetherRevealArrival("session-2");
    expect(consumeTogetherRevealArrival("session-1")).toBe(false);
    expect(consumeTogetherRevealArrival("session-2")).toBe(true);
  });
});
