/**
 * The landing page's three photography slots.
 *
 * Fiyu owns no photographic library of its own. Card photos in the application
 * come from Google Maps at request time, one billed call each, which is not a
 * cost a public page hit by anonymous traffic can carry -- and stock photography
 * of a restaurant Fiyu did not choose is worse than no photograph at all.
 *
 * So the three image moments are declared slots rather than inline paths. Each
 * names its file, the shape it is cropped to, where in the frame the crop is
 * anchored, and what stands in if the file goes missing. All three are now filled
 * from `public/landing/`.
 *
 * `objectPosition` is per-slot and deliberate, because every one of these is a
 * photograph with a subject and every container crops on one axis. Centre would
 * have been wrong for two of the three.
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
  /** The committed asset, under `public/landing/`. */
  path: string;
  /** False falls back to a drawing rather than a broken image. */
  available: boolean;
  /**
   * Where the crop is anchored, chosen against the actual photograph. Passed
   * straight to `object-position`.
   */
  objectPosition: string;
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
    path: "/landing/korea_fiyu.jpg",
    available: true,
    /*
     * A 6000x4000 straight-on frame of a Seoul mandu shop: sky above, storefront
     * across the middle, road below. Both containers crop horizontally only and
     * the composition is centred, so centre is genuinely right here -- the
     * shopfront runs the full width and neither edge holds anything the other
     * does not.
     */
    objectPosition: "50% 50%",
    alt: "A small independent mandu and naengmyeon shop on a quiet Seoul street, its counter visible through the window",
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
    path: "/landing/france_fiyu_2.jpg",
    available: true,
    /*
     * A 6896x6663 corner frame of a Paris café at dusk, near square, so a 4:3 box
     * crops vertically only and by about a fifth.
     *
     * Anchored hard to the top, and for one reason: the blue enamel street plate
     * reading RUE JEAN DU BELLAY / 4e ARR sits in the top few percent of the
     * frame, and it is the single most Paris-identifying thing in the photograph.
     * Any other anchor trims it off. Everything else the section needs comes with
     * it -- the lit street lamp, both awnings, the painted café panels, the bistro
     * chairs and the checkerboard floor -- and what gets dropped is the bare
     * pavement along the bottom, which is the emptiest part of the frame.
     */
    objectPosition: "50% 0%",
    alt: "A corner café in Paris at dusk, its awnings and pavement tables lit by a street lamp",
    aspect: "4:3",
    minWidth: 1200,
    brief:
      "A small neighbourhood restaurant or café: an exterior, a doorway, an intimate dining room, or a counter and table detail. Quiet and residential rather than grand. Renders at roughly a third of the width of its row, so it must survive being small -- one clear subject, no fine detail, no crowd. Signage in frame should not place the photograph in a city other than the one the section names.",
    // A tonal plate rather than a drawing: this slot renders about 160px wide on
    // a phone, where a 1px line illustration is a smudge, and the page's other
    // drawing is already spoken for by the section above.
    fallback: { kind: "plate", label: "Paris" },
  },
  current_edition_tokyo: {
    id: "current_edition_tokyo",
    path: "/landing/japan_fiyu.jpg",
    available: true,
    /*
     * A 7008x4672 night frame of a lantern-lit oden shop in a back alley, cropped
     * into a band around three to one, which discards more than half its height.
     * 65% is measured: it centres the window on the lantern and the warm doorway
     * rather than on the middle of the photograph, which would have kept ducting
     * above and traffic cones below and lost the only thing the band is for.
     */
    objectPosition: "50% 65%",
    alt: "A lantern-lit oden shop on a narrow Tokyo street at night",
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
