const OWNER_KEY_STORAGE = "fiyu.lists.owner-key.v1";

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getOrCreateAnonymousOwnerKey(): string {
  if (typeof window === "undefined") {
    throw new Error("Owner key is browser-only");
  }
  const existing = window.localStorage.getItem(OWNER_KEY_STORAGE)?.trim() ?? "";
  if (existing && validUuid(existing)) return existing;
  const next = createUuid();
  window.localStorage.setItem(OWNER_KEY_STORAGE, next);
  return next;
}

export function ownerKeyStorageKey(): string {
  return OWNER_KEY_STORAGE;
}
