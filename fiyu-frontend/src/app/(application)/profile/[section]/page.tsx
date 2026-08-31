import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ProfileWorkspace,
  type ProfileSection,
} from "@/components/profile/ProfileWorkspace";

const PROFILE_ROUTES = {
  settings: { section: "profile", title: "Settings", mobileHome: true },
  edit: { section: "profile", title: "Edit profile" },
  account: { section: "account", title: "Account" },
  notifications: { section: "notifications", title: "Notifications" },
  privacy: { section: "privacy", title: "Privacy" },
  help: { section: "help", title: "Help & support" },
  about: { section: "about", title: "About Fiyu" },
} as const satisfies Record<string, { section: ProfileSection; title: string; mobileHome?: boolean }>;

type ProfileRoute = keyof typeof PROFILE_ROUTES;

function profileRoute(value: string) {
  return value in PROFILE_ROUTES ? PROFILE_ROUTES[value as ProfileRoute] : null;
}

export function generateStaticParams() {
  return Object.keys(PROFILE_ROUTES).map((section) => ({ section }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const route = profileRoute((await params).section);
  return { title: route?.title ?? "Profile" };
}

export default async function ProfileSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const route = profileRoute((await params).section);
  if (!route) notFound();
  return (
    <ProfileWorkspace
      section={route.section}
      mobileTitle={route.title}
      mobileHome={"mobileHome" in route && route.mobileHome}
    />
  );
}
