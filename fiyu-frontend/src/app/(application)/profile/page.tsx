import type { Metadata } from "next";

import { DestinationPage } from "@/components/destinations/DestinationPage";

export const metadata: Metadata = {
  title: "Profile",
};

const sections = [
  {
    id: "settings",
    title: "Settings",
    text: "Daily-pick preferences and your discovery origin stay on this device for now.",
  },
  {
    id: "help",
    title: "Help",
    text: "Fiyu offers a small daily set of independent restaurant discoveries—not a complete directory.",
  },
  {
    id: "privacy",
    title: "Privacy",
    text: "Location is used to shape discovery when you allow it. Fiyu does not need continuous location access.",
  },
] as const;

export default function ProfilePage() {
  return (
    <DestinationPage
      title="Profile"
      description="Account features are intentionally absent from this first application shell. Device-local settings remain available without sign-in."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-24 rounded-card border border-line bg-surface p-5"
          >
            <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{section.text}</p>
          </section>
        ))}
      </div>
    </DestinationPage>
  );
}
