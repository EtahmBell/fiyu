import type { Metadata } from "next";

import { DestinationPage } from "@/components/destinations/DestinationPage";
import { LogWorkspace } from "@/components/log/LogWorkspace";

export const metadata: Metadata = {
  title: "Log a visit",
};

/**
 * The Tokyo edition eyebrow, masthead type and header spacing come from
 * DestinationPage, shared with Picks and Lists, so Log only supplies its title
 * and one supporting line.
 */
export default function LogPage() {
  return (
    <DestinationPage
      title="Log a visit"
      description="A private record of every restaurant you’ve visited."
      hideHeaderOnMobile
    >
      <LogWorkspace mobileMode="form" />
    </DestinationPage>
  );
}
