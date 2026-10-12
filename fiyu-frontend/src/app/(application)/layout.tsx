import { ApplicationWarmup } from "@/components/layout/ApplicationWarmup";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AuthHydrationGate } from "@/components/profile/AuthHydrationGate";
import { PersonalizedPickProvider } from "@/components/personalized-picks/PersonalizedPickProvider";

/** Application-only chrome. The public landing route never renders this shell. */
export default function ApplicationLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <ApplicationWarmup />
      <div className="flex flex-1 flex-col">
        <AuthHydrationGate>
          <PersonalizedPickProvider>{children}</PersonalizedPickProvider>
        </AuthHydrationGate>
      </div>
    </>
  );
}
