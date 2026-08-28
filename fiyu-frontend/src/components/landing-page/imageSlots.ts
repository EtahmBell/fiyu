/**
 * The landing page's photography slots.
 *
 * Fiyu owns no photographic library. Card photos in the application come from
 * Google Maps at request time, one billed call each, which is not a cost a
 * public page hit by anonymous traffic can carry -- and stock photography of a
 * restaurant Fiyu did not choose is worse than no photograph at all.
 *
 * So the four image moments on this page are declared slots rather than
 * hardcoded files. Each names what belongs there, at what shape, and what stands
 * in until it exists. Dropping a file into `public/images/landing/` and setting
 * `src` on one entry is the whole change; nothing else needs editing, and no
 * layout moves, because every slot renders inside a fixed aspect box.
 *
 * `brief` is for whoever sources the asset. It is never rendered.
 */

export type ImageSlotId =
  | "restaurant_story_01"
  | "current_city_01"
  | "selection_01"
  | "selection_02"
  | "selection_03";

/** What renders while `src` is null. */
export type SlotFallback =
  | {
      kind: "illustration";
      src: string;
      width: number;
      height: number;
      alt: string;
    }
  /**
   * A typographic tile: the area name in the display face on one of three warm
   * or cool grounds. Deliberately not another line drawing -- six repeats of the
   * same illustration set was what made the page look like it had two pictures
   * in it.
   *
   * Only ever used at thumbnail scale now. At 4:5 hero size it read as an empty
   * coloured panel, which a browser recording showed as three blank tiles
   * apparently waiting to load. A 56px tinted square with a hairline is a mark;
   * a 300px one is a void.
   */
  | { kind: "nameplate"; label: string; tone: "lavender" | "champagne" | "cool" };

export interface ImageSlot {
  id: ImageSlotId;
  /** Set this to a path under `/images/landing/` once the asset exists. */
  src: string | null;
  /** Used only when `src` is set. The fallback carries its own description. */
  alt: string;
  aspect: string;
  brief: string;
  fallback: SlotFallback;
}

export const IMAGE_SLOTS: Record<ImageSlotId, ImageSlot> = {
  restaurant_story_01: {
    id: "restaurant_story_01",
    src: null,
    alt: "The counter of a small independent restaurant",
    aspect: "16:9",
    brief:
      "Landscape 16:9, at least 2400px wide. An intimate independent restaurant interior or counter, warm and low-lit, no identifiable faces. Should read as somewhere you would only find by being told about it. City-neutral: this slot travels to New York unchanged.",
    fallback: {
      kind: "illustration",
      src: "/images/about-storefront.png",
      width: 1434,
      height: 1080,
      alt: "A line illustration of a small independent restaurant counter, drawn for Fiyu",
    },
  },
  current_city_01: {
    id: "current_city_01",
    src: null,
    alt: "A quiet Tokyo street of small restaurants",
    aspect: "3:2",
    brief:
      "Landscape 3:2, at least 2400px wide. A real Tokyo neighbourhood at dusk -- a lane of small restaurants, signage lit, no identifiable faces. Replaced per city edition, so New York gets its own file rather than a re-crop of this one.",
    fallback: {
      kind: "illustration",
      src: "/images/log-empty-table.png",
      width: 2172,
      height: 724,
      alt: "A line illustration looking out from a restaurant table onto a quiet Tokyo street",
    },
  },
  selection_01: {
    id: "selection_01",
    src: null,
    alt: "A bowl of Okinawa soba on a counter",
    aspect: "1:1",
    brief:
      "Square, at least 800px. A single plated dish, cropped close. Read at 56px beside a label, so it needs one clear subject and no fine detail.",
    fallback: { kind: "nameplate", label: "Sendagi", tone: "lavender" },
  },
  selection_02: {
    id: "selection_02",
    src: null,
    alt: "Skewers over coals at a small yakitori counter",
    aspect: "1:1",
    brief:
      "Square, at least 800px. A cooking surface or a hand at work. Must not match the other two selection thumbnails in colour or subject.",
    fallback: { kind: "nameplate", label: "Setagaya", tone: "champagne" },
  },
  selection_03: {
    id: "selection_03",
    src: null,
    alt: "The lit doorway of a small restaurant at night",
    aspect: "1:1",
    brief:
      "Square, at least 800px. A storefront, doorway or curtain from the street, so the three thumbnails together read as street, counter and plate.",
    fallback: { kind: "nameplate", label: "Tsukiji", tone: "cool" },
  },
};
