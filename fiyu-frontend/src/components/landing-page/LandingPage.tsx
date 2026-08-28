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
 * Read top to bottom: what Fiyu is, a restaurant, how it works, how the places
 * are found, why so few, why not the same few for everyone, where Fiyu is, the
 * current edition, and a way in.
 *
 * Nine movements, no two composed the same way -- a hero with a live product
 * composition, a photographic band resolving into a record, a pinned Fiyu
 * surface beside three steps, a typographic index of signals, three cards
 * arriving on ruled shelves, three photographic selections, a world plate
 * lighting city by city, a dark edition at one viewport, and a closing colophon.
 *
 * Motion is deliberately unevenly distributed. Exactly two sections are
 * scroll-scrubbed, and both are pinned stages that hold a composed state at each
 * end -- pinning is the only honest way to scrub, because it guarantees both
 * endpoints are fully on screen. Everything else triggers once on entry and then
 * stops. The two pinned stages are separated by a compact typographic section on
 * purpose: four consecutive viewports of pinned scrolling reads as a slideshow
 * however good each stage is.
 *
 * Pacing is by density, not by giving every section a viewport. Hero spacious,
 * restaurant photographic, product demonstration long because it is the section
 * with the most to show, signals compact, the reveal short and dramatic,
 * selections structured, locations visual, the edition concise, the close simple.
 */
export function LandingPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <HeroSection />
      <RestaurantMoment />
      <HowFiyuWorks />
      <LookBeyondSection />
      <OnlyAFewSection />
      <DifferentDiscoveries />
      <LocationsSection />
      <CityEditionSection />
      <FinalCta />
    </main>
  );
}
