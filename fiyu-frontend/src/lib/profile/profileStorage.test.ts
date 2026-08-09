import { describe, expect, it } from "vitest";

import {
  createProfileStorage,
  EMPTY_PROFILE,
  parseProfile,
  PROFILE_STORAGE_KEY,
} from "@/lib/profile/profileStorage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("profile storage", () => {
  it("uses safe defaults for missing or malformed device data", () => {
    expect(parseProfile(null)).toEqual(EMPTY_PROFILE);
    expect(parseProfile("not-json")).toEqual(EMPTY_PROFILE);
  });

  it("persists the supported profile fields without account data", () => {
    const memory = new MemoryStorage();
    const profileStorage = createProfileStorage(memory);
    profileStorage.save({
      display_name: "Ethan Bell",
      username: "ethan",
      bio: "Tokyo notes.",
      profile_image: "data:image/png;base64,avatar",
    });

    expect(profileStorage.getSnapshot()).toMatchObject({
      display_name: "Ethan Bell",
      username: "ethan",
      bio: "Tokyo notes.",
    });
    expect(memory.getItem(PROFILE_STORAGE_KEY)).not.toContain("email");
  });
});
