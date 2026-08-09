import type { Metadata } from "next";

import { PublicEditorialPage } from "@/components/public-site/PublicEditorialPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <PublicEditorialPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="Fiyu’s formal Privacy Policy has not been published yet. This page reserves the public route without presenting provisional text as legal policy."
      narrow
    >
      <div className="mt-14 max-w-3xl border-t border-line pt-8 text-sm leading-7 text-ink-muted">
        Policy content must be reviewed and supplied before public launch.
      </div>
    </PublicEditorialPage>
  );
}
