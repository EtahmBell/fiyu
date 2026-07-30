import type { Metadata } from "next";
import Link from "next/link";

import { CityEmptyState } from "@/components/city-signature/CitySignature";
import { DestinationPage } from "@/components/destinations/DestinationPage";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";

export const metadata: Metadata = { title: "Lists" };

export default function ListsPage() {
  return (
    <DestinationPage
      title="Lists"
      description="A quiet place for restaurants you want to remember. Your saves remain part of the Picks experience while this first list view takes shape."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CityEmptyState
          cityId={ACTIVE_FIYU_CITY.id}
          kind="saved"
          title="No saved places in Tokyo yet"
          description="Restaurants you save will appear here."
          action={
            <Link href="/" className="inline-flex min-h-11 items-center text-sm font-medium text-lavender-700 underline decoration-lavender-100 decoration-2 underline-offset-4">
              Explore today&apos;s Picks
            </Link>
          }
        />
        <CityEmptyState
          cityId={ACTIVE_FIYU_CITY.id}
          kind="lists"
          title="No custom lists yet"
          description="List creation is not available in this first version."
        />
      </div>
    </DestinationPage>
  );
}
