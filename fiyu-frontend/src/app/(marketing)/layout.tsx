import { LandingFooter } from "@/components/landing-page/LandingFooter";
import { LandingHeader } from "@/components/landing-page/LandingHeader";

/** Public-site chrome, intentionally independent from the application shell. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas text-ink">
      <LandingHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <LandingFooter />
    </div>
  );
}
