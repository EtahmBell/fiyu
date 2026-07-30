import { HeroSection } from "@/components/landing-page/HeroSection";
import { HowFiyuWorks } from "@/components/landing-page/HowFiyuWorks";
import { TokyoPreview } from "@/components/landing-page/TokyoPreview";
import { WhyFewSection } from "@/components/landing-page/WhyFewSection";
import { WorldLocationsMap } from "@/components/landing-page/WorldLocationsMap";

export function LandingPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <HeroSection />
      <WorldLocationsMap />
      <HowFiyuWorks />
      <WhyFewSection />
      <TokyoPreview />
    </main>
  );
}
