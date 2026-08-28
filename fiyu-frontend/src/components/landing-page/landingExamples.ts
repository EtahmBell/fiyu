import type { PlateId } from "@/components/landing-page/EditorialPlate";
import type { ImageSlotId } from "@/components/landing-page/imageSlots";

/**
 * Real published Fiyu discoveries, used as the landing page's examples.
 *
 * `plate` is assigned so that the four cards which actually show one -- the
 * hero's front pick and the three under "Only a few." -- never repeat a drawing.
 * There are only four drawings, and two of the same on one screen is what makes
 * an illustration set look like a placeholder.
 *
 * Every field below is copied verbatim from Fiyu's own public restaurant data:
 * the names, the category, the neighbourhood, the Fiyu Score and the food tags
 * are what the application shows for these places. Nothing here is invented,
 * rounded up, or written for marketing -- a landing page that shows a made-up
 * score is the fastest way to make a real one untrustworthy.
 *
 * Static rather than fetched, deliberately. The list endpoint would add a
 * network dependency and latency to the one page that must never fail or feel
 * slow, and the photo endpoint bills a Google call per card. So these are a
 * frozen editorial selection, kept in one file so an operator can swap them.
 * The trade-off is that a place unpublished later would linger here; the set is
 * small and reviewable for exactly that reason.
 *
 * Tokyo only, because Tokyo is the only live city. The shape is city-agnostic:
 * a New York edition adds rows, it does not change this type.
 */
export interface LandingExample {
  /** The real place_id, used only as a stable React key. Never linked. */
  id: string;
  nameJa: string;
  nameEn: string;
  category: string;
  /**
   * The human area name, not the catalog's chome-level string.
   *
   * The application shows `neighborhood` verbatim because a reader standing in
   * the city needs the precise block. A marketing page does not: "3 Chome
   * Sendagi" reads as a geocoder field escaping onto a landing page, so these
   * are the recognisable area names for the same places -- the ward-level or
   * district-level label a person would actually say out loud.
   */
  area: string;
  /** Fiyu's published 0-100 score. Formatted for display by `ScoreMark`. */
  score: number;
  tags: readonly string[];
  /** One signature dish, verbatim. Empty where the record has none. */
  signature: string | null;
  /**
   * Card photograph, once one exists. Null falls back to `plate`, which is what
   * the application itself does when Google returns no photo for a place.
   */
  photo: string | null;
  plate: PlateId;
}

const EXAMPLES = {
  umi: {
    id: "ChIJt2QEWDmNGGARvJ5tMBSBCqI",
    nameJa: "江戸酒場 海",
    nameEn: "Edo Sakaba Umi",
    category: "Izakaya / standing bar",
    area: "Jingumae",
    score: 87.44,
    tags: ["居酒屋", "立ち飲み", "日本酒"],
    signature: null,
    photo: null,
    plate: "doorway",
  },
  chokotto: {
    id: "ChIJgcDV1tSPGGAReF32uFUaCb4",
    nameJa: "沖縄そば屋 ちょこっと",
    nameEn: "Okinawa Sobaya Chokotto",
    category: "Okinawa cuisine / Okinawa soba",
    area: "Sendagi",
    score: 86.7,
    tags: ["Okinawa soba", "Okinawa cuisine", "lunch"],
    signature: "沖縄そば",
    photo: null,
    plate: "bowl",
  },
  taguchi: {
    id: "ChIJQQNFIyCSGGAR3TBCyeHPLzc",
    nameJa: "ピザハウスタグチ",
    nameEn: "Pizza House Taguchi",
    category: "Pizza",
    area: "Nishiarai",
    score: 86.12,
    tags: ["pizza", "Italian-style", "takeout"],
    signature: "タグチスペシャルピザ",
    photo: null,
    plate: "hearth",
  },
  yuima: {
    id: "ChIJ6d8N8dntGGARoNUj9Kt2QcI",
    nameJa: "維摩（ユイマ）",
    nameEn: "Yuima",
    category: "Chinese restaurant",
    area: "Igusa",
    score: 83.29,
    tags: ["dumplings", "small independent restaurant", "fried rice"],
    signature: "一口焼き餃子",
    photo: null,
    plate: "counter",
  },
  zururi: {
    id: "ChIJB9egl6mNGGARkyq7OUFAfrA",
    nameJa: "ずるり 谷中総本店",
    nameEn: "Zururi Yanaka Sohonten",
    category: "Ramen restaurant",
    area: "Yanaka",
    score: 81.16,
    tags: ["ramen", "chicken paitan ramen", "izakaya"],
    signature: "淡麗醤油ラーメン",
    photo: null,
    plate: "doorway",
  },
  nishi: {
    id: "ChIJc3EHNxXzGGAR6IBc9qsLC-g",
    nameJa: "串焼 西（くしやきにし）",
    nameEn: "Kushiyaki Nishi",
    category: "Yakitori restaurant",
    area: "Setagaya",
    score: 80.53,
    tags: ["焼き鳥", "串焼き", "日本酒"],
    signature: "焼鳥丼",
    photo: null,
    plate: "hearth",
  },
  sitara: {
    id: "ChIJxVBbAoKLGGARUxJedeLj1L4",
    nameJa: "ローカルスパイシー シタラ 築地店",
    nameEn: "Local Spicy SITARA Tsukiji",
    category: "Indian restaurant",
    area: "Tsukiji",
    score: 78.53,
    tags: ["Indian curry", "Nepalese cuisine", "naan"],
    signature: "Butter chicken curry",
    photo: null,
    plate: "counter",
  },
  onder: {
    id: "ChIJWeI_aACNGGAR4Fn0N-p0Xnk",
    nameJa: "ONDER（オンデル）",
    nameEn: "ONDER Restaurant & Bar",
    category: "Turkish restaurant",
    area: "Takadanobaba",
    score: 76.11,
    tags: ["Turkish cuisine", "kebab", "halal"],
    signature: "Lamb skewers",
    photo: null,
    plate: "doorway",
  },
} as const satisfies Record<string, LandingExample>;

/** The hero composition, and the closing one that answers it. */
export const HERO_EXAMPLES: readonly LandingExample[] = [
  EXAMPLES.chokotto,
  EXAMPLES.yuima,
  EXAMPLES.nishi,
];

/** The three that accumulate under "Only a few." */
export const ONLY_A_FEW_EXAMPLES: readonly LandingExample[] = [
  EXAMPLES.zururi,
  EXAMPLES.sitara,
  EXAMPLES.taguchi,
];

/** The set that resolves as "How Fiyu works" reaches step 02. */
export const WORKFLOW_EXAMPLES: readonly LandingExample[] = [
  EXAMPLES.nishi,
  EXAMPLES.chokotto,
  EXAMPLES.onder,
];

/**
 * The single place the underexposure signals resolve into.
 *
 * Shown as one ruled line rather than as a card. The card version had to be
 * floated across two grid columns to avoid looking marooned, which is how it
 * ended up colliding with the paragraph beside it.
 */
export const LOOK_BEYOND_EXAMPLE: LandingExample = EXAMPLES.yuima;

/**
 * The restaurant-first moment.
 *
 * A standing bar, chosen to match the counter in `about-storefront.png`. The
 * illustration is captioned as an illustration on the page, so the pairing
 * reads as an editorial plate beside a real record rather than as a photograph
 * of this restaurant.
 */
export const RESTAURANT_MOMENT_EXAMPLE: LandingExample = EXAMPLES.umi;

/**
 * Three selections for three different readers.
 *
 * The overlap is the whole point and is exact: Zururi appears for the first and
 * third reader and nowhere else, so eight distinct places cover nine slots.
 * Change these and the caption below the columns stops being true.
 */
export const SELECTION_COLUMNS: readonly {
  label: string;
  slot: ImageSlotId;
  picks: readonly LandingExample[];
}[] = [
  {
    label: "Someone near Yanaka",
    slot: "selection_01",
    picks: [EXAMPLES.zururi, EXAMPLES.chokotto, EXAMPLES.umi],
  },
  {
    label: "Someone near Setagaya",
    slot: "selection_02",
    picks: [EXAMPLES.nishi, EXAMPLES.yuima, EXAMPLES.taguchi],
  },
  {
    label: "Someone near Tsukiji",
    slot: "selection_03",
    picks: [EXAMPLES.sitara, EXAMPLES.onder, EXAMPLES.zururi],
  },
];

/** The place shared between the first and third column. */
export const SHARED_SELECTION_ID = EXAMPLES.zururi.id;

/**
 * Every example, in published-score order, for the closing colophon.
 *
 * The final section lists them as plain type rather than as another stack of
 * cards. Eight real places, named, is a stronger last word than a fourth
 * appearance of the hero composition -- and it is the only place on the page
 * where a reader sees the whole set at once.
 */
export const ALL_EXAMPLES: readonly LandingExample[] = [
  EXAMPLES.umi,
  EXAMPLES.chokotto,
  EXAMPLES.taguchi,
  EXAMPLES.yuima,
  EXAMPLES.zururi,
  EXAMPLES.nishi,
  EXAMPLES.sitara,
  EXAMPLES.onder,
];
