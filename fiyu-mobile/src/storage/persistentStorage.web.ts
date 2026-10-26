function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Browser persistence that remains safe during Expo Router server rendering. */
export const persistentStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return browserStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      browserStorage()?.setItem(key, value);
    } catch {
      // Storage may be unavailable in SSR, privacy modes, or restricted embeds.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      browserStorage()?.removeItem(key);
    } catch {
      // Match an absent store: removal is already effectively complete.
    }
  },
};
