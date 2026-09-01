// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountQueryKey,
  clearAccountQuery,
  clearAccountQueries,
  loadAccountQuery,
  readAccountQuery,
  useAccountQuery,
  writeAccountQuery,
} from "@/lib/accountQueryCache";

describe("account query cache", () => {
  beforeEach(clearAccountQueries);

  it("deduplicates concurrent work and reuses a fresh successful value", async () => {
    let resolve: ((value: string[]) => void) | undefined;
    const loader = vi.fn(() => new Promise<string[]>((done) => { resolve = done; }));
    const key = accountQueryKey("map-restaurants", "account-a");

    const first = loadAccountQuery(key, loader);
    const concurrent = loadAccountQuery(key, loader);
    resolve?.(["one", "two"]);

    await expect(first).resolves.toEqual(["one", "two"]);
    await expect(concurrent).resolves.toEqual(["one", "two"]);
    await expect(loadAccountQuery(key, loader)).resolves.toEqual(["one", "two"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("isolates values by authenticated account", async () => {
    const accountA = accountQueryKey("restaurant-log", "account-a");
    const accountB = accountQueryKey("restaurant-log", "account-b");

    await loadAccountQuery(accountA, async () => ["visit-a"]);
    await loadAccountQuery(accountB, async () => ["visit-b"]);

    expect(readAccountQuery(accountA)).toEqual(["visit-a"]);
    expect(readAccountQuery(accountB)).toEqual(["visit-b"]);
  });

  it("invalidates one account resource without clearing unrelated cached data", () => {
    const log = accountQueryKey("restaurant-log", "account-a");
    const picks = accountQueryKey("daily-picks", "account-a");
    writeAccountQuery(log, ["visit"]);
    writeAccountQuery(picks, ["pick"]);

    clearAccountQuery(log);

    expect(readAccountQuery(log)).toBeUndefined();
    expect(readAccountQuery(picks)).toEqual(["pick"]);
  });

  it("keeps a cached value available while a forced revalidation is in flight", async () => {
    const key = accountQueryKey("daily-picks", "account-a");
    await loadAccountQuery(key, async () => "cached");
    let resolve: ((value: string) => void) | undefined;

    const refreshing = loadAccountQuery(
      key,
      () => new Promise<string>((done) => { resolve = done; }),
      { force: true },
    );

    expect(readAccountQuery(key)).toBe("cached");
    resolve?.("fresh");
    await expect(refreshing).resolves.toBe("fresh");
    expect(readAccountQuery(key)).toBe("fresh");
  });

  it("publishes incremental account cache writes to mounted consumers", async () => {
    const loader = vi.fn(async () => ["one"]);
    const { result } = renderHook(() => useAccountQuery({
      resource: "map-restaurants",
      accountId: "account-a",
      loader,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => writeAccountQuery(accountQueryKey("map-restaurants", "account-a"), ["one", "two"]));

    expect(result.current.status).toBe("ready");
    if (result.current.status === "ready") expect(result.current.data).toEqual(["one", "two"]);
  });
});
