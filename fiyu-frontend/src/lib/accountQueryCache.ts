import { useCallback, useEffect, useMemo, useState } from "react";

type CacheEntry<T> = {
  value: T | undefined;
  updatedAt: number;
  loading: Promise<T> | null;
};

const entries = new Map<string, CacheEntry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

export function subscribeAccountQuery(key: string, listener: () => void): () => void {
  const subscribers = listeners.get(key) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(key);
  };
}

function entryFor<T>(key: string): CacheEntry<T> {
  const existing = entries.get(key) as CacheEntry<T> | undefined;
  if (existing) return existing;
  const created: CacheEntry<T> = { value: undefined, updatedAt: 0, loading: null };
  entries.set(key, created);
  return created;
}

export function accountQueryKey(resource: string, accountId: string | null): string {
  return `${resource}:${accountId ?? "anonymous"}`;
}

export function readAccountQuery<T>(key: string): T | undefined {
  return entryFor<T>(key).value;
}

export function writeAccountQuery<T>(key: string, value: T): void {
  const entry = entryFor<T>(key);
  entry.value = value;
  entry.updatedAt = Date.now();
  notify(key);
}

export function loadAccountQuery<T>(
  key: string,
  loader: () => Promise<T>,
  options: { maxAgeMs?: number; force?: boolean } = {},
): Promise<T> {
  const entry = entryFor<T>(key);
  const maxAgeMs = options.maxAgeMs ?? 60_000;
  if (!options.force && entry.value !== undefined && Date.now() - entry.updatedAt < maxAgeMs) {
    return Promise.resolve(entry.value);
  }
  if (entry.loading) return entry.loading;
  entry.loading = loader()
    .then((value) => {
      entry.value = value;
      entry.updatedAt = Date.now();
      notify(key);
      return value;
    })
    .finally(() => {
      entry.loading = null;
    });
  return entry.loading;
}

export function clearAccountQueries(): void {
  entries.clear();
}

export function clearAccountQuery(key: string): void {
  entries.delete(key);
  notify(key);
}

type AccountQueryState<T> =
  | { key: string; status: "loading"; data: undefined }
  | { key: string; status: "ready"; data: T }
  | { key: string; status: "error"; data: undefined };

export function useAccountQuery<T>({
  resource,
  accountId,
  loader,
  enabled = true,
  maxAgeMs = 60_000,
}: {
  resource: string;
  /** `undefined` means account hydration is unresolved; `null` is anonymous. */
  accountId: string | null | undefined;
  loader: () => Promise<T>;
  enabled?: boolean;
  maxAgeMs?: number;
}) {
  const key = useMemo(
    () => (accountId === undefined ? null : accountQueryKey(resource, accountId)),
    [accountId, resource],
  );
  const [state, setState] = useState<AccountQueryState<T> | null>(null);
  const cached = key ? readAccountQuery<T>(key) : undefined;
  const current: AccountQueryState<T> =
    key && state?.key === key
      ? state
      : key && cached !== undefined
        ? ({ key, status: "ready", data: cached } as const)
        : key
          ? ({ key, status: "loading", data: undefined } as const)
          : { key: "unresolved", status: "loading", data: undefined };

  const refresh = useCallback(
    (force = true) => {
      if (!key || !enabled) return Promise.resolve(undefined);
      return loadAccountQuery(key, loader, { force, maxAgeMs })
        .then((data) => {
          setState({ key, status: "ready", data });
          return data;
        })
        .catch((error) => {
          const fallback = readAccountQuery<T>(key);
          setState(
            fallback === undefined
              ? { key, status: "error", data: undefined }
              : { key, status: "ready", data: fallback },
          );
          throw error;
        });
    },
    [enabled, key, loader, maxAgeMs],
  );

  useEffect(() => {
    if (!key || !enabled) return;
    void refresh(false).catch(() => undefined);
  }, [enabled, key, refresh]);

  useEffect(() => {
    if (!key || !enabled) return;
    return subscribeAccountQuery(key, () => {
      const value = readAccountQuery<T>(key);
      setState(
        value === undefined
          ? { key, status: "loading", data: undefined }
          : { key, status: "ready", data: value },
      );
    });
  }, [enabled, key]);

  const setData = useCallback(
    (next: T | ((current: T | undefined) => T)) => {
      if (!key) return;
      const value = typeof next === "function"
        ? (next as (current: T | undefined) => T)(readAccountQuery<T>(key))
        : next;
      writeAccountQuery(key, value);
      setState({ key, status: "ready", data: value });
    },
    [key],
  );

  return { ...current, refresh, setData };
}

if (typeof window !== "undefined") {
  window.addEventListener("fiyu:account-changed", clearAccountQueries);
}
