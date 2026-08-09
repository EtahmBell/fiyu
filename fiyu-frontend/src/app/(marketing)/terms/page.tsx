import type { Metadata } from "next";

import { PublicEditorialPage } from "@/components/public-site/PublicEditorialPage";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <PublicEditorialPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="Fiyu’s formal Terms of Service have not been published yet. This page reserves the public route without presenting provisional text as legal terms."
      narrow
    >
      <div className="mt-14 max-w-3xl border-t border-line pt-8 text-sm leading-7 text-ink-muted">
        Terms must be reviewed and supplied before public launch.
      </div>
    </PublicEditorialPage>
  );
}
