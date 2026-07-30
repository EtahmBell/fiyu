import type { Metadata } from "next";
import { headers } from "next/headers";

import { LandingPage } from "@/components/landing-page/LandingPage";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(requestHost) ? requestHost : "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" || safeHost.startsWith("localhost") ? "http" : "https";
  const imageUrl = new URL("/og.png", `${protocol}://${safeHost}`).toString();

  return {
    title: { absolute: "Fiyu — Hidden places. Carefully uncovered." },
    description:
      "Fiyu finds independent, underexposed restaurants worth knowing—then reveals them a few at a time.",
    openGraph: {
      title: "Fiyu — Hidden places. Carefully uncovered.",
      description:
        "Independent, underexposed restaurants worth knowing, revealed a few at a time.",
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Fiyu — Hidden places. Carefully uncovered." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Fiyu — Hidden places. Carefully uncovered.",
      description:
        "Independent, underexposed restaurants worth knowing, revealed a few at a time.",
      images: [imageUrl],
    },
  };
}

export default function PublicLandingPage() {
  return <LandingPage />;
}
