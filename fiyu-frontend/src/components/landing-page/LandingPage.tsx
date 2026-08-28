import "@/components/landing-page/landing.css";

import { CityEditionSection } from "@/components/landing-page/CityEditionSection";
import { DifferentDiscoveries } from "@/components/landing-page/DifferentDiscoveries";
import { FinalCta } from "@/components/landing-page/FinalCta";
import { HeroSection } from "@/components/landing-page/HeroSection";
import { HowFiyuWorks } from "@/components/landing-page/HowFiyuWorks";
import { LocationsSection } from "@/components/landing-page/LocationsSection";
import { LookBeyondSection } from "@/components/landing-page/LookBeyondSection";
import { OnlyAFewSection } from "@/components/landing-page/OnlyAFewSection";
import { RestaurantMoment } from "@/components/landing-page/RestaurantMoment";

/**
 * The public landing page, as a sequence rather than a stack.
 *
 * Nine movements, and no two of them are composed the same way: a hero with a
 * live product composition, a full-bleed restaurant cropping into a record, a
 * pinned Fiyu surface beside scrolling steps, three cards accumulating on an
 * empty field, three ruled indexes of type, an asymmetric grid a card crosses,
 * a world plate panning out beside a rollout, a dark city edition at full
 * bleed, and the hero composition returning mirrored.
 *
 * Read top to bottom the order is: what Fiyu is, a restaurant, how it works,
 * why so few, why not the same few for everyone, how the places are found,
 * where Fiyu is, the current edition, and a way in.
 *
 * Three of the nine are scroll-linked -- the restaurant crop, the accumulation,
 * the rollout. The rest use entrance motion or none at all, so ordinary
 * scrolling stays ordinary.
 */
export function LandingPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <HeroSection />
      <RestaurantMoment />
      <HowFiyuWorks />
      <OnlyAFewSection />
      <DifferentDiscoveries />
      <LookBeyondSection />
      <LocationsSection />
      <CityEditionSection />
      <FinalCta />
    </main>
  );
}
