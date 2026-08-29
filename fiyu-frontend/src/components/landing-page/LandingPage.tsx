import "@/components/landing-page/landing.css";

import { CityEditionSection } from "@/components/landing-page/CityEditionSection";
import { FinalCta } from "@/components/landing-page/FinalCta";
import { HeroSection } from "@/components/landing-page/HeroSection";
import { HowFiyuWorks } from "@/components/landing-page/HowFiyuWorks";
import { LocationsSection } from "@/components/landing-page/LocationsSection";
import { LookBeyondSection } from "@/components/landing-page/LookBeyondSection";
import { OnlyAFewSection } from "@/components/landing-page/OnlyAFewSection";
import { PickedNearbySection } from "@/components/landing-page/PickedNearbySection";
import { RestaurantMoment } from "@/components/landing-page/RestaurantMoment";

/**
 * The public landing page, as a sequence rather than a stack.
 *
 * Read top to bottom: what Fiyu is, a restaurant, how it works, how the places
 * are found, why so few, where the few come from, where Fiyu is, the current
 * edition, and a way in.
 *
 * Nine movements, no two composed the same way -- a hero with a live product
 * composition, a photographic plate beside a discovery record, a sticky product
 * surface driven by three step positions, a typographic index of signals, three
 * cards arriving on ruled shelves, a switchable location surface, a world plate
 * lighting city by city, a dark edition band, and a closing coverage colophon.
 *
 * There is no scroll-position arithmetic left anywhere on this page. Three
 * iterations of it produced dead viewports and half-played animations in a real
 * browser while passing every geometry test written against it, so the whole
 * approach is gone. What remains is:
 *
 *   position   which step block is crossing the middle of the viewport
 *   intent     a click on a step, a click on a location
 *   arrival    one-shot entrance reveals that settle and stay
 *   ambient    slow loops that never stop and never matter
 *
 * Nothing on the page reverses itself when a reader scrolls back up, except the
 * one thing that should: which of three product states is showing.
 */
export function LandingPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <HeroSection />
      <RestaurantMoment />
      <HowFiyuWorks />
      <LookBeyondSection />
      <OnlyAFewSection />
      <PickedNearbySection />
      <LocationsSection />
      <CityEditionSection />
      <FinalCta />
    </main>
  );
}
