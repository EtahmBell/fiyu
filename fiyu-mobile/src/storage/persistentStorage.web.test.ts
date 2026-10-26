import * as SecureStore from "expo-secure-store";

import { persistentStorage } from "@/storage/persistentStorage.web";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

interface FakeStorage extends Storage {
  values: Map<string, string>;
}

function fakeStorage(): FakeStorage {
  const values = new Map<string, string>();
  return {
    values,
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("Expo web persistent storage", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    jest.clearAllMocks();
  });

  it("gets, sets, and removes raw Supabase strings through localStorage", async () => {
    const localStorage = fakeStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });

    const value = JSON.stringify({ access_token: "token" });
    await persistentStorage.setItem("session", value);
    await expect(persistentStorage.getItem("session")).resolves.toBe(value);
    await persistentStorage.removeItem("session");
    await expect(persistentStorage.getItem("session")).resolves.toBeNull();
  });

  it("is a safe no-op when window or localStorage is unavailable", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });
    await expect(persistentStorage.getItem("session")).resolves.toBeNull();
    await expect(persistentStorage.setItem("session", "value")).resolves.toBeUndefined();
    await expect(persistentStorage.removeItem("session")).resolves.toBeUndefined();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.defineProperty({}, "localStorage", {
        get() { throw new Error("blocked"); },
      }),
    });
    await expect(persistentStorage.getItem("session")).resolves.toBeNull();
  });

  it("never invokes expo-secure-store", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: fakeStorage() },
    });

    await persistentStorage.setItem("session", "value");
    await persistentStorage.getItem("session");
    await persistentStorage.removeItem("session");

    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
