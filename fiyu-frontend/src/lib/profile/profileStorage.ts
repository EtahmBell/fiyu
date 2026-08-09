export interface FiyuProfile {
  display_name: string;
  username: string;
  bio: string;
  profile_image: string | null;
}

export const EMPTY_PROFILE: FiyuProfile = {
  display_name: "",
  username: "",
  bio: "",
  profile_image: null,
};

export const PROFILE_STORAGE_KEY = "fiyu.profile.v1";
const PROFILE_CHANGED_EVENT = "fiyu:profile-changed";

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function parseProfile(value: string | null): FiyuProfile {
  if (!value) return EMPTY_PROFILE;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const profileImage = parsed.profile_image;
    return {
      display_name: cleanString(parsed.display_name, 50),
      username: cleanString(parsed.username, 30).replace(/^@+/, ""),
      bio: cleanString(parsed.bio, 160),
      profile_image:
        typeof profileImage === "string" && profileImage.startsWith("data:image/")
          ? profileImage
          : null,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export interface ProfileStorage {
  getSnapshot: () => FiyuProfile;
  getServerSnapshot: () => FiyuProfile;
  subscribe: (listener: () => void) => () => void;
  save: (profile: FiyuProfile) => void;
}

export function createProfileStorage(storage: Storage, eventTarget?: EventTarget): ProfileStorage {
  let cachedRaw: string | null | undefined;
  let cachedProfile = EMPTY_PROFILE;

  const getSnapshot = () => {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedProfile = parseProfile(raw);
    }
    return cachedProfile;
  };

  return {
    getSnapshot,
    getServerSnapshot: () => EMPTY_PROFILE,
    subscribe(listener) {
      if (!eventTarget) return () => undefined;
      eventTarget.addEventListener("storage", listener);
      eventTarget.addEventListener(PROFILE_CHANGED_EVENT, listener);
      return () => {
        eventTarget.removeEventListener("storage", listener);
        eventTarget.removeEventListener(PROFILE_CHANGED_EVENT, listener);
      };
    },
    save(profile) {
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      cachedRaw = undefined;
      eventTarget?.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
    },
  };
}

const INERT_PROFILE_STORAGE: ProfileStorage = {
  getSnapshot: () => EMPTY_PROFILE,
  getServerSnapshot: () => EMPTY_PROFILE,
  subscribe: () => () => undefined,
  save: () => undefined,
};

export function browserProfileStorage(): ProfileStorage {
  return typeof window === "undefined"
    ? INERT_PROFILE_STORAGE
    : createProfileStorage(window.localStorage, window);
}
