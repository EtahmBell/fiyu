import type { Metadata } from "next";
import Link from "next/link";

import { DestinationPage } from "@/components/destinations/DestinationPage";
import { ACTIVE_FIYU_CITY, FIYU_CITIES } from "@/lib/city/editions";

export const metadata: Metadata = { title: "City Editions" };

export default function CitiesPage() {
  return (
    <DestinationPage
      eyebrow="Fiyu editions"
      title="Choose a city"
      description="Each Fiyu edition has its own restaurant catalog and editorial context. Your discovery origin is chosen separately inside the active edition."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {FIYU_CITIES.map((city) => (
          <article key={city.id} className="rounded-card border border-line bg-surface p-5">
            <p className="text-xs font-medium text-ink-faint">{city.country}</p>
            <h2 className="mt-1 font-display text-2xl text-ink">{city.name}</h2>
            {city.status === "available" ? (
              <Link href="/" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-lavender-700 underline decoration-lavender-100 decoration-2 underline-offset-4">
                {city.id === ACTIVE_FIYU_CITY.id ? "Open active edition" : "Open edition"}
              </Link>
            ) : (
              <p className="mt-5 text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">
                Coming soon
              </p>
            )}
          </article>
        ))}
      </div>
    </DestinationPage>
  );
}
