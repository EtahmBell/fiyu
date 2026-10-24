import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1_800;

function manifestKey(key: string): string {
  return `${key}.fiyu_chunks`;
}

function chunkKey(key: string, index: number): string {
  return `${key}.fiyu_${index}`;
}

async function storedChunkCount(key: string): Promise<number> {
  const value = await SecureStore.getItemAsync(manifestKey(key));
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/** Supabase-compatible encrypted storage with bounded SecureStore values. */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await storedChunkCount(key);
    if (count === 0) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
    );
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = await storedChunkCount(key);
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "gs")) ?? [""];
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
    );
    await SecureStore.setItemAsync(manifestKey(key), String(chunks.length));
    await Promise.all(
      Array.from(
        { length: Math.max(0, previousCount - chunks.length) },
        (_, offset) => SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset)),
      ),
    );
  },

  async removeItem(key: string): Promise<void> {
    const count = await storedChunkCount(key);
    await Promise.all([
      ...Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))),
      SecureStore.deleteItemAsync(manifestKey(key)),
    ]);
  },
};
