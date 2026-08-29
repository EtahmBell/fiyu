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
 *
 * Imagery should represent the CITY and the food experience, not the invented
 * restaurant named beside it. No legible signage that identifies a real business,
 * and never a photograph of a place in Fiyu's own catalog.
 */

export type ImageSlotId = "restaurant_story_01" | "current_city_01";

/** What renders while `src` is null. */
export interface SlotFallback {
  kind: "illustration";
  src: string;
  width: number;
  height: number;
  alt: string;
}

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
    alt: "A small independent restaurant counter",
    aspect: "4:3",
    brief:
      "Landscape 4:3, at least 2000px wide. An intimate Seoul counter or interior -- warm, low-lit, no identifiable faces, no legible signage naming a real business. This is the emotional focus of the page. It should represent the city and the experience rather than the invented restaurant named beside it, so nothing in frame should read as a specific establishment.",
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
    aspect: "3:1",
    brief:
      "A wide band, 3:1, at least 2400px across. A real Tokyo neighbourhood at dusk -- a lane of small restaurants, signage lit, no identifiable faces. The edition section is a short band, so the subject must survive a letterbox crop and should not rely on sky or foreground. Replaced per city edition: New York gets its own file rather than a re-crop of this one.",
    fallback: {
      kind: "illustration",
      src: "/images/log-empty-table.png",
      width: 2172,
      height: 724,
      alt: "A line illustration looking out from a restaurant table onto a quiet Tokyo street",
    },
  },
};
