"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import packageJson from "../../../package.json";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { Button } from "@/components/ui/Button";
import { authService } from "@/lib/auth/authService";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import {
  browserProfileStorage,
  type FiyuProfile,
} from "@/lib/profile/profileStorage";
import {
  clearProfileIdentity,
  publishProfileIdentity,
  useProfileIdentity,
} from "@/lib/profile/profileIdentity";
import { prepareAvatarImage } from "@/lib/profile/avatarImage";
import { cn } from "@/lib/utils/cn";

export type ProfileSection = "profile" | "account" | "notifications" | "privacy" | "help" | "about";

const SECTIONS: { id: ProfileSection; label: string; href: string }[] = [
  { id: "profile", label: "Profile", href: "/profile" },
  { id: "account", label: "Account", href: "/profile/account" },
  { id: "notifications", label: "Notifications", href: "/profile/notifications" },
  { id: "privacy", label: "Privacy", href: "/profile/privacy" },
  { id: "help", label: "Help & support", href: "/profile/help" },
  { id: "about", label: "About Fiyu", href: "/profile/about" },
];

const INPUT_CLASS =
  "mt-2 min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-faint focus:border-lavender-500";
const LABEL_CLASS =
  "text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-faint uppercase";

export function ProfileWorkspace({
  section = "profile",
  mobileHome = false,
  mobileTitle,
}: {
  section?: ProfileSection;
  mobileHome?: boolean;
  mobileTitle?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) return <DesktopProfile section={section} />;
  if (mobileHome) return <MobileProfileHome />;
  return <MobileProfileDetail section={section} title={mobileTitle} />;
}

function DesktopProfile({ section }: { section: ProfileSection }) {
  return (
    <main className="flex-1 px-6 py-10 pb-14 sm:px-8 lg:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="font-display text-4xl leading-none text-ink">Profile</h1>
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label="Profile settings" className="space-y-1">
            {SECTIONS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                aria-current={item.id === section ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-lg border-l-2 px-3 text-sm font-medium transition-colors",
                  item.id === section
                    ? "border-lavender-600 bg-lavender-50 text-lavender-700"
                    : "border-transparent text-ink-muted hover:bg-subtle hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <section className="min-h-[32rem] rounded-card border border-line bg-surface px-7 py-7 lg:px-9 lg:py-8">
            <SectionContent section={section} />
          </section>
        </div>
      </div>
    </main>
  );
}

function MobileProfileHome() {
  const storage = useMemo(() => browserProfileStorage(), []);
  const profile = useSyncExternalStore(
    storage.subscribe,
    storage.getSnapshot,
    storage.getServerSnapshot,
  );
  const identity = useProfileIdentity();
  const accountProfile = identity.profile;
  const displayedProfile: FiyuProfile = accountProfile
    ? {
        display_name: accountProfile.display_name ?? "",
        username: accountProfile.username,
        bio: accountProfile.bio ?? "",
        profile_image: accountProfile.avatar_url,
      }
    : profile;

  if (identity.status === "loading") {
    return (
      <main className="flex-1 px-5 pb-[calc(var(--spacing-mobile-nav)+2rem)]">
        <FiyuLoadingScreen contained className="min-h-[60dvh]" />
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 pt-8 pb-[calc(var(--spacing-mobile-nav)+2rem)]">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-xl font-semibold text-ink">Profile</h1>
        <div className="mt-6 flex min-h-60 flex-col items-center rounded-2xl border border-lavender-100/70 bg-lavender-50/35 px-4 pt-7 pb-8 text-center">
          <>
          <ProfileAvatar profile={displayedProfile} size="large" branded />
          <p className="mt-4 font-display text-2xl leading-tight text-ink">
            {displayedProfile.display_name || displayedProfile.username || "Your profile"}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {displayedProfile.username ? `@${displayedProfile.username}` : "Add a username"}
          </p>
          <Link
            href="/profile/edit"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-lavender-200 bg-white/60 px-4 text-sm font-medium text-plum transition-colors hover:bg-lavender-100/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
          >
            Edit profile
          </Link>
          </>
        </div>

        <MobileGroup title="Settings">
          <MobileNavigationRow href="/profile/edit" label="Profile" />
          <MobileNavigationRow href="/profile/account" label="Account" />
          <MobileNavigationRow href="/profile/notifications" label="Notifications" />
          <MobileNavigationRow href="/profile/privacy" label="Privacy" id="privacy" />
        </MobileGroup>
        <MobileGroup title="Support" className="mt-8">
          <MobileNavigationRow href="/profile/help" label="Help & support" />
          <MobileNavigationRow href="/profile/about" label="About Fiyu" />
        </MobileGroup>
      </div>
    </main>
  );
}

function MobileProfileDetail({ section, title }: { section: ProfileSection; title?: string }) {
  const heading = title ?? SECTIONS.find((item) => item.id === section)?.label ?? "Profile";
  return (
    <main className="flex-1 px-5 pt-5 pb-[calc(var(--spacing-mobile-nav)+2rem)]">
      <div className="mx-auto w-full max-w-xl">
        <Link
          href="/profile"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-plum"
        >
          <span aria-hidden="true">←</span>
          <span>Profile</span>
        </Link>
        <h1 className="mt-3 font-display text-3xl leading-tight text-ink">{heading}</h1>
        <div className="mt-7">
          <SectionContent section={section} mobile />
        </div>
      </div>
    </main>
  );
}

function SectionContent({ section, mobile = false }: { section: ProfileSection; mobile?: boolean }) {
  switch (section) {
    case "profile":
      return <ProfileForm mobile={mobile} />;
    case "account":
      return <AccountSection />;
    case "notifications":
      return <NotificationsSection />;
    case "privacy":
      return <PrivacySection />;
    case "help":
      return <HelpSection />;
    case "about":
      return <AboutSection />;
  }
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h2 className="font-display text-3xl leading-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">{description}</p>
    </header>
  );
}

function ProfileForm({ mobile }: { mobile: boolean }) {
  const storage = useMemo(() => browserProfileStorage(), []);
  const savedProfile = useSyncExternalStore(
    storage.subscribe,
    storage.getSnapshot,
    storage.getServerSnapshot,
  );
  const [draftOverride, setDraft] = useState<FiyuProfile | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const identity = useProfileIdentity();
  const accountProfile = identity.profile;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const persistedProfile: FiyuProfile = accountProfile
    ? {
        display_name: accountProfile.display_name ?? "",
        username: accountProfile.username,
        bio: accountProfile.bio ?? "",
        profile_image: accountProfile.avatar_url,
      }
    : savedProfile;
  const draft = draftOverride ?? persistedProfile;

  const normalizedDraft: FiyuProfile = {
    ...draft,
    display_name: draft.display_name.trim(),
    username: draft.username.trim().replace(/^@+/, ""),
    bio: draft.bio.trim(),
  };
  const changed = JSON.stringify(normalizedDraft) !== JSON.stringify(persistedProfile);

  const update = (field: keyof FiyuProfile, value: string | null) => {
    setSaved(false);
    setDraft((current) => ({ ...(current ?? persistedProfile), [field]: value }));
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = normalizedDraft.username;
    if (username && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setUsernameError("Use 3–30 letters, numbers, or underscores.");
      return;
    }
    setUsernameError(null);
    setSaveError(null);
    setSaving(true);
    try {
      if (accountProfile) {
        const updated = await authService.updateProfile({
          username,
          display_name: normalizedDraft.display_name || null,
          bio: normalizedDraft.bio || null,
        });
        storage.save({ ...savedProfile, profile_image: null });
        publishProfileIdentity(updated);
      } else {
        storage.save(normalizedDraft);
      }
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Unable to save your profile.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setDraft(normalizedDraft);
    setSaved(true);
  };

  if (identity.status === "loading") {
    return <FiyuLoadingScreen contained />;
  }

  const selectImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const sizeLimit = accountProfile ? 10_000_000 : 500_000;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > sizeLimit) {
      setImageError(
        accountProfile
          ? "Choose a JPG, PNG, or WebP image under 10 MB."
          : "Choose a JPG, PNG, or WebP image under 500 KB.",
      );
      return;
    }
    if (accountProfile) {
      setUploadingImage(true);
      setImageError(null);
      try {
        const image = await prepareAvatarImage(file);
        const updated = await authService.uploadProfileAvatar(image);
        storage.save({ ...savedProfile, profile_image: null });
        publishProfileIdentity(updated);
        setDraft((current) => ({
          ...(current ?? persistedProfile),
          profile_image: updated.avatar_url,
        }));
      } catch (cause) {
        setImageError(cause instanceof Error ? cause.message : "Unable to upload your photo.");
      } finally {
        setUploadingImage(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setImageError(null);
      update("profile_image", reader.result);
    };
    reader.onerror = () => setImageError("We couldn’t read that image.");
    reader.readAsDataURL(file);
  };

  const removeImage = async () => {
    setImageError(null);
    setSaved(false);
    if (accountProfile) {
      const previousImage = draft.profile_image;
      setUploadingImage(true);
      setDraft((current) => ({ ...(current ?? persistedProfile), profile_image: null }));
      publishProfileIdentity({ ...accountProfile, avatar_url: null });
      try {
        const updated = await authService.removeProfileAvatar(previousImage);
        storage.save({ ...savedProfile, profile_image: null });
        publishProfileIdentity(updated);
      } catch (cause) {
        setDraft((current) => ({ ...(current ?? persistedProfile), profile_image: previousImage }));
        publishProfileIdentity(accountProfile);
        setImageError(cause instanceof Error ? cause.message : "Unable to remove your photo.");
      } finally {
        setUploadingImage(false);
      }
      return;
    }
    storage.save({ ...savedProfile, profile_image: null });
    setDraft((current) => ({ ...(current ?? persistedProfile), profile_image: null }));
  };

  return (
    <div className="max-w-xl">
      {!mobile && (
        <SectionHeading title="Profile" description={accountProfile ? "Manage your Fiyu profile." : "Manage your Fiyu profile on this device."} />
      )}
      <form onSubmit={save} className={cn(!mobile && "mt-8")}>
        <div className="flex items-center gap-4 border-b border-line pb-7">
          <ProfileAvatar profile={draft} />
          <div className="flex flex-col items-start gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectImage}
              className="sr-only"
              aria-label="Choose profile photo"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 disabled:cursor-wait disabled:opacity-60"
            >
              {uploadingImage ? "Uploading…" : "Change photo"}
            </button>
            {draft.profile_image && (
              <button
                type="button"
                onClick={() => void removeImage()}
                disabled={uploadingImage}
                className="rounded-sm px-1 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 disabled:cursor-wait disabled:opacity-60"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
        {imageError && <p role="alert" className="mt-2 text-xs text-rose-dust">{imageError}</p>}

        <div className="mt-7 space-y-6">
          <div>
            <label htmlFor="profile-display-name" className={LABEL_CLASS}>Display name</label>
            <input
              id="profile-display-name"
              value={draft.display_name}
              onChange={(event) => update("display_name", event.target.value)}
              maxLength={50}
              autoComplete="name"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="profile-username" className={LABEL_CLASS}>Username</label>
            <div className="relative mt-2">
              <span aria-hidden="true" className="absolute inset-y-0 left-3 flex items-center text-sm text-ink-faint">@</span>
              <input
                id="profile-username"
                value={draft.username}
                onChange={(event) => update("username", event.target.value.replace(/^@+/, ""))}
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                aria-describedby={usernameError ? "profile-username-error" : "profile-username-hint"}
                aria-invalid={Boolean(usernameError)}
                className="min-h-11 w-full rounded-lg border border-line bg-canvas pr-3 pl-7 text-sm text-ink focus:border-lavender-500"
              />
            </div>
            {usernameError ? (
              <p id="profile-username-error" role="alert" className="mt-2 text-xs text-rose-dust">{usernameError}</p>
            ) : (
              <p id="profile-username-hint" className="mt-2 text-xs text-ink-faint">Letters, numbers, and underscores.</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="profile-bio" className={LABEL_CLASS}>Bio</label>
              <span className="text-xs text-ink-faint">{draft.bio.length}/160</span>
            </div>
            <textarea
              id="profile-bio"
              value={draft.bio}
              onChange={(event) => update("bio", event.target.value)}
              maxLength={160}
              rows={4}
              className="mt-2 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-3 text-sm leading-6 text-ink focus:border-lavender-500"
            />
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-end gap-4 border-t border-line pt-5">
          {saveError && <p role="alert" className="mr-auto text-sm text-rose-dust">{saveError}</p>}
          {saved && <p role="status" className="text-sm text-ink-muted">Changes saved</p>}
          <Button type="submit" variant="primary" disabled={!changed || saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </div>
  );
}

function AccountSection() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authService.getSession().then((session) => {
      if (active) setEmail(session?.email ?? null);
    }).catch(() => undefined).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const signOut = async () => {
    setError(null);
    try {
      await authService.signOut();
      clearProfileIdentity();
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign out.");
    }
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setDeleteDialogOpen(false);
    setDeletePassword("");
    setDeleteError(null);
  };

  const deleteAccount = async () => {
    if (!deletePassword || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await authService.deleteAccount(deletePassword);
      clearProfileIdentity();
      setDeleteDialogOpen(false);
      router.replace("/");
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Unable to delete your account.");
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <SectionHeading title="Account" description="Manage your Fiyu account session." />
      <div className="mt-8 border-y border-line py-5">
        {loading ? (
          <p className="text-sm text-ink-muted">Loading account…</p>
        ) : email ? (
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm font-semibold text-ink">Signed in as</p>
              <p className="mt-1 text-sm text-ink-muted">{email}</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void signOut()}>Sign out</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-5">
            <p className="text-sm text-ink-muted">You’re using Fiyu without an account.</p>
            <Link href="/signin" className="inline-flex min-h-11 items-center font-semibold text-plum underline underline-offset-4">Sign in</Link>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-dust">{error}</p>}
      {email && (
        <section className="mt-10 border-t border-line pt-7" aria-labelledby="delete-account-title">
          <h3 id="delete-account-title" className="text-sm font-semibold text-ink">Delete account</h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-ink-muted">
            Permanently delete your Fiyu account and associated account data.
          </p>
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-rose-dust/60 bg-surface px-4 text-sm font-semibold text-rose-dust transition-colors hover:border-rose-dust hover:bg-rose-dust/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-dust"
          >
            Delete account
          </button>
        </section>
      )}

      {deleteDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-plum/25 px-4 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-dialog-title"
            aria-describedby="delete-account-dialog-description"
            className="w-full max-w-md rounded-card border border-line bg-surface px-6 py-7 shadow-[0_12px_36px_-28px_rgba(49,40,61,0.45)] sm:px-8"
          >
            <h2 id="delete-account-dialog-title" className="font-display text-2xl leading-tight text-ink">
              Delete your account?
            </h2>
            <p id="delete-account-dialog-description" className="mt-3 text-sm leading-6 text-ink-muted">
              This permanently deletes your Fiyu account, profile, saved restaurants, Lists,
              visit history, reactions, notes, discovery location, and recommendation history.
            </p>
            <p className="mt-3 text-sm font-semibold text-ink">This cannot be undone.</p>
            <label htmlFor="delete-account-password" className="mt-6 block text-xs font-semibold tracking-wide text-ink">
              CURRENT PASSWORD
            </label>
            <input
              id="delete-account-password"
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              disabled={deleting}
              className="mt-2 min-h-11 w-full rounded-lg border border-line-strong bg-canvas px-3 text-sm text-ink focus:border-rose-dust"
            />
            {deleteError && <p role="alert" className="mt-3 text-sm text-rose-dust">{deleteError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" disabled={deleting} onClick={closeDeleteDialog}>
                Cancel
              </Button>
              <button
                type="button"
                disabled={!deletePassword || deleting}
                onClick={() => void deleteAccount()}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-dust px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Permanently delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="max-w-xl">
      <SectionHeading title="Notifications" description="Choose how Fiyu keeps you updated." />
      <div className="mt-8 border-y border-line py-5">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-ink">Daily Picks</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              In-app notifications appear in the bell when there is something new. Email and push notifications are not available.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-ink-muted">In app</span>
        </div>
      </div>
    </div>
  );
}

type LocationPermission = "allowed" | "blocked" | "ask" | "unavailable";

function useLocationPermission(): LocationPermission {
  const [permission, setPermission] = useState<LocationPermission>("unavailable");
  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return;
    let active = true;
    let status: PermissionStatus | null = null;
    const update = () => {
      if (!active || !status) return;
      setPermission(status.state === "granted" ? "allowed" : status.state === "denied" ? "blocked" : "ask");
    };
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (!active) return;
      status = result;
      update();
      status.addEventListener("change", update);
    }).catch(() => setPermission("unavailable"));
    return () => {
      active = false;
      status?.removeEventListener("change", update);
    };
  }, []);
  return permission;
}

function PrivacySection() {
  const permission = useLocationPermission();
  const permissionLabel = {
    allowed: "Allowed",
    blocked: "Blocked",
    ask: "Ask next time",
    unavailable: "Unavailable",
  }[permission];
  return (
    <div className="max-w-xl">
      <SectionHeading title="Privacy" description="How Fiyu handles your location and private Log." />
      <div className="mt-8 divide-y divide-line border-y border-line">
        <SettingBlock title="Location" value={permissionLabel}>
          Fiyu uses your location only when you ask it to help find restaurants nearby. Fiyu does not continuously track your location in the background. For signed-in users, your active Tokyo discovery location may be saved to your account so your Picks work across devices.
        </SettingBlock>
        <SettingBlock title="Private Logs">
          Your visit history, reactions, and private notes are saved to your account so they are available across devices. Private notes are not shown to other users.
        </SettingBlock>
      </div>
      <LegalAvailability />
    </div>
  );
}

function HelpSection() {
  return (
    <div className="max-w-xl">
      <SectionHeading title="Help & support" description="Support options for using Fiyu." />
      <div className="mt-8 divide-y divide-line border-y border-line">
        <UnavailableRow label="Help / FAQ" />
        <UnavailableRow label="Contact support" />
        <UnavailableRow label="Report a problem" />
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="max-w-xl">
      <SectionHeading title="About Fiyu" description="Product and legal information." />
      <div className="mt-8 divide-y divide-line border-y border-line">
        <div className="py-5">
          <p className="text-sm font-semibold text-ink">About Fiyu</p>
          <p className="mt-1 text-sm leading-6 text-ink-muted">A focused way to discover independent restaurants in Tokyo.</p>
        </div>
        <UnavailableRow label="Privacy Policy" href="/privacy" />
        <UnavailableRow label="Terms of Service" href="/terms" />
        <div className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm">
          <span className="text-ink">Version</span>
          <span className="text-ink-muted">{packageJson.version}</span>
        </div>
      </div>
    </div>
  );
}

function LegalAvailability() {
  return (
    <div className="mt-9">
      <h3 className={LABEL_CLASS}>Legal</h3>
      <div className="mt-3 divide-y divide-line border-y border-line">
        <UnavailableRow label="Privacy Policy" href="/privacy" />
        <UnavailableRow label="Terms of Service" href="/terms" />
      </div>
    </div>
  );
}

function SettingBlock({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="py-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {value && <span className="text-xs font-medium text-ink-muted">{value}</span>}
      </div>
      <p className="mt-1.5 text-sm leading-6 text-ink-muted">{children}</p>
    </div>
  );
}

function UnavailableRow({ label, status = "Not available", href }: { label: string; status?: string; href?: string }) {
  if (href) {
    return (
      <Link href={href} className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm text-ink">
        <span>{label}</span>
        <span aria-hidden="true" className="text-lg text-ink-faint">›</span>
      </Link>
    );
  }
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm">
      <span className="text-ink">{label}</span>
      <span className="text-xs text-ink-faint">{status}</span>
    </div>
  );
}

function ProfileAvatar({
  profile,
  size = "default",
  branded = false,
}: {
  profile: FiyuProfile;
  size?: "default" | "large";
  branded?: boolean;
}) {
  const initials = (profile.username.trim()[0] || profile.display_name.trim()[0] || "F").toUpperCase();
  const sizeClass = size === "large" ? "size-24 text-2xl" : "size-20 text-xl";
  return (
    <div className={cn(
      "relative shrink-0 overflow-hidden rounded-full border border-line bg-lavender-50 text-lavender-700",
      branded && "border-lavender-200 bg-lavender-100/70 text-plum shadow-[0_0_0_4px_rgba(226,218,239,0.55)]",
      sizeClass,
    )}>
      {profile.profile_image ? (
        <Image src={profile.profile_image} alt="Profile" fill unoptimized className="object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center font-display" aria-label="Default profile avatar">{initials}</span>
      )}
    </div>
  );
}

function MobileGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className={cn(LABEL_CLASS, "px-1 text-lavender-700")}>{title}</h2>
      <div className="mt-2 divide-y divide-line border-y border-line">{children}</div>
    </section>
  );
}

function MobileNavigationRow({ href, label, id }: { href: string; label: string; id?: string }) {
  return (
    <Link id={id} href={href} className="flex min-h-14 items-center justify-between gap-4 rounded-lg px-2 text-sm font-medium text-ink transition-colors hover:bg-lavender-50/55 active:bg-lavender-100/60">
      <span>{label}</span>
      <span aria-hidden="true" className="text-lg text-lavender-500">›</span>
    </Link>
  );
}
