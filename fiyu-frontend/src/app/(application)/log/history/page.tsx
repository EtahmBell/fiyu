import type { Metadata } from "next";

import { DestinationPage } from "@/components/destinations/DestinationPage";
import { LogWorkspace } from "@/components/log/LogWorkspace";

export const metadata: Metadata = {
  title: "Visit history",
};

export default function LogHistoryPage() {
  return (
    <DestinationPage
      title="Log a visit"
      description="A private record of every restaurant you’ve visited."
      hideHeaderOnMobile
    >
      <LogWorkspace mobileMode="history" />
    </DestinationPage>
  );
}
