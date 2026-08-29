/**
 * The landing page's three photography slots.
 *
 * Fiyu owns no photographic library. Card photos in the application come from
 * Google Maps at request time, one billed call each, which is not a cost a public
 * page hit by anonymous traffic can carry -- and stock photography of a
 * restaurant Fiyu did not choose is worse than no photograph at all.
 *
 * So the three image moments are declared slots. Each names the file it expects,
 * the shape it will be cropped to, what belongs in it, and what stands in until
 * it exists. Installing an asset is two edits in one place: drop the file at
 * `path` and flip `available` to true. Nothing else changes, and no layout moves,
 * because every slot renders inside a fixed aspect or fixed-height box.
 *
 * Exactly three, and deliberately not more. The hero, the product demonstration,
 * "Only a few.", the location surface, the world map and the closing colophon all
 * stay product, typographic or cartographic. The alternating rhythm between
 * photography and drawn Fiyu surfaces is the point; a photograph in every section
 * would flatten it.
 *
 * Imagery should represent the CITY and the food experience, not the invented
 * restaurant named beside it. No legible signage that identifies a real business,
 * and never a photograph of a place in Fiyu's own catalog.
 *
 * `brief`, `minWidth` and `aspect` are for whoever sources the asset. None of
 * them is rendered.
 */

export type ImageSlotId = "worth_finding_seoul" | "underexposure_paris" | "current_edition_tokyo";

/**
 * What renders while a slot is unavailable.
 *
 * `illustration` is one of the two line drawings Fiyu owns, and each is used by
 * exactly one slot -- the same drawing standing in twice on one page is what made
 * the imagery look thin in an earlier pass.
 *
 * `plate` is a tonal field with the city set in the display face, for a slot that
 * renders too small for a drawing to read at all.
 */
export type SlotFallback =
  | { kind: "illustration"; src: string; width: number; height: number; alt: string }
  | { kind: "plate"; label: string };

export interface ImageSlot {
  id: ImageSlotId;
  /** Where the asset goes. Committed here so the filename is not guesswork. */
  path: string;
  /** Flip to true once the file exists at `path`. */
  available: boolean;
  /** Used only once the asset is available; the fallback carries its own. */
  alt: string;
  /** The shape the slot crops to. */
  aspect: string;
  /** Shortest acceptable source width, in pixels. */
  minWidth: number;
  brief: string;
  fallback: SlotFallback;
}

export const IMAGE_SLOTS: Record<ImageSlotId, ImageSlot> = {
  worth_finding_seoul: {
    id: "worth_finding_seoul",
    path: "/images/landing/worth-finding-seoul.jpg",
    available: false,
    alt: "The counter of a small independent restaurant in Seoul",
    aspect: "4:3",
    minWidth: 1600,
    brief:
      "An intimate independent Korean restaurant -- a counter or a small dining room, warm practical lighting, lived-in and neighbourhood rather than luxury or touristic. No identifiable faces and no legible signage naming a real business. This is the emotional focus of the page, so it should read as somewhere you would only find by being told about it.",
    fallback: {
      kind: "illustration",
      src: "/images/about-storefront.png",
      width: 1434,
      height: 1080,
      alt: "A line illustration of a small independent restaurant counter, drawn for Fiyu",
    },
  },
  underexposure_paris: {
    id: "underexposure_paris",
    path: "/images/landing/underexposure-paris.jpg",
    available: false,
    alt: "A small neighbourhood bistro in Paris",
    aspect: "4:3",
    minWidth: 1200,
    brief:
      "A small Paris neighbourhood restaurant: a bistro exterior, a doorway, an intimate dining room, or a counter and table detail. Quiet and residential rather than grand. Renders at roughly a third of the width of its row, so it must survive being small -- one clear subject, no fine detail, no crowd.",
    // A tonal plate rather than a drawing: this slot renders about 120px wide on
    // a phone, where a 1px line illustration is a smudge, and the page's other
    // drawing is already spoken for by the section above.
    fallback: { kind: "plate", label: "Paris" },
  },
  current_edition_tokyo: {
    id: "current_edition_tokyo",
    path: "/images/landing/current-edition-tokyo.jpg",
    available: false,
    alt: "A street of small restaurants in Tokyo at dusk",
    aspect: "16:5",
    minWidth: 2200,
    brief:
      "A street of small Tokyo restaurants and storefronts at dusk or in the evening: warm doorways, lit signage, neighbourhood atmosphere. Not Shibuya Crossing, not Tokyo Tower, not a skyline. Cropped into a very wide band inside a compact section, so the subject must survive a letterbox and must not depend on sky or foreground. Replaced per city edition: New York gets its own file rather than a re-crop of this one.",
    fallback: {
      kind: "illustration",
      src: "/images/log-empty-table.png",
      width: 2172,
      height: 724,
      alt: "A line illustration looking out from a restaurant table onto a quiet Tokyo street",
    },
  },
};
