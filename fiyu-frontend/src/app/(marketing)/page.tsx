import type { Metadata } from "next";

import { LandingPage } from "@/components/landing-page/LandingPage";

export const metadata: Metadata = {
  title: { absolute: "Fiyu — Thoughtful restaurant discovery" },
  description:
    "Discover independent restaurants through a considered daily selection, beginning in Tokyo.",
};

export default function PublicLandingPage() {
  return <LandingPage />;
}
