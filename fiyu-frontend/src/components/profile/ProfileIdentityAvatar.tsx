import Image from "next/image";

import type { ProfileIdentitySnapshot } from "@/lib/profile/profileIdentity";
import { cn } from "@/lib/utils/cn";

export function profileIdentityPresentation(identity: ProfileIdentitySnapshot) {
  const displayName = identity.profile?.display_name?.trim() || "";
  const username = identity.profile?.username?.trim() || "";

  return {
    label: displayName || username || "Profile",
    initial: (
      username[0] || displayName[0] || identity.email?.trim()[0] || "F"
    ).toUpperCase(),
  };
}

export function ProfileIdentityAvatar({
  identity,
  className,
}: {
  identity: ProfileIdentitySnapshot;
  className?: string;
}) {
  const { initial } = profileIdentityPresentation(identity);

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-lavender-50 font-display text-lavender-700",
        className,
      )}
    >
      {identity.profileImage ? (
        <Image src={identity.profileImage} alt="" fill unoptimized className="object-cover" />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}
