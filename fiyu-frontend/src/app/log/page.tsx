import type { Metadata } from "next";

import { CityEmptyState } from "@/components/city-signature/CitySignature";
import { DestinationPage } from "@/components/destinations/DestinationPage";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";

export const metadata: Metadata = { title: "Log a Visit" };

export default function LogPage() {
  return (
    <DestinationPage
      title="Log a Visit"
      description="A personal restaurant log is planned here. This first shell does not publish reviews or share activity."
    >
      <CityEmptyState
        cityId={ACTIVE_FIYU_CITY.id}
        kind="visits"
        title="No visits logged"
        description="Visit logging is not available yet. Future entries will begin as private records."
      />
    </DestinationPage>
  );
}
