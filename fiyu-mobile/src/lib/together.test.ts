import { togetherPollingInterval, togetherSessionPollingInterval } from "@/api/queries";
import { eligibleTogetherState, pendingTogetherSession } from "@/test/togetherFixture";
import { safeTogetherReturnTo, togetherEntryState } from "./together";

describe("Together native lifecycle helpers", () => {
  it("uses server eligibility without adding a Premium gate", () => {
    expect(togetherEntryState(eligibleTogetherState).kind).toBe("eligible");
    expect(togetherEntryState({ ...eligibleTogetherState, rated_visit_count: 4, can_initiate: false, block_reason: "ratings_required" })).toMatchObject({ kind: "ratings_required", remaining: 1 });
  });

  it("polls only waiting state and stops after completion", () => {
    expect(togetherPollingInterval({ ...eligibleTogetherState, session: pendingTogetherSession })).toBe(5_000);
    expect(togetherSessionPollingInterval(pendingTogetherSession)).toBe(5_000);
    expect(togetherPollingInterval(eligibleTogetherState)).toBe(false);
    expect(togetherSessionPollingInterval({ ...pendingTogetherSession, status: "generated" })).toBe(false);
  });

  it("only accepts Together routes as authentication continuations", () => {
    expect(safeTogetherReturnTo("/together/token?join=1")).toBe("/together/token?join=1");
    expect(safeTogetherReturnTo("https://bad.example/together/token")).toBeNull();
    expect(safeTogetherReturnTo("/profile")).toBeNull();
  });
});
