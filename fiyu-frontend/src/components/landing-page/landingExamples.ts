import type { PlateId } from "@/components/landing-page/EditorialPlate";

/**
 * Real published Fiyu discoveries, used as the landing page's examples.
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
  neighborhood: string;
  /** Fiyu's published 0-100 score. Formatted for display by `ScoreMark`. */
  score: number;
  tags: readonly string[];
  /** One signature dish, verbatim. Empty where the record has none. */
  signature: string | null;
  plate: PlateId;
}

const EXAMPLES = {
  umi: {
    id: "ChIJt2QEWDmNGGARvJ5tMBSBCqI",
    nameJa: "江戸酒場 海",
    nameEn: "Edo Sakaba Umi",
    category: "Izakaya / standing bar",
    neighborhood: "2 Chome Jingumae",
    score: 87.44,
    tags: ["居酒屋", "立ち飲み", "日本酒"],
    signature: null,
    plate: "doorway",
  },
  chokotto: {
    id: "ChIJgcDV1tSPGGAReF32uFUaCb4",
    nameJa: "沖縄そば屋 ちょこっと",
    nameEn: "Okinawa Sobaya Chokotto",
    category: "Okinawa cuisine / Okinawa soba",
    neighborhood: "3 Chome Sendagi",
    score: 86.7,
    tags: ["Okinawa soba", "Okinawa cuisine", "lunch"],
    signature: "沖縄そば",
    plate: "bowl",
  },
  taguchi: {
    id: "ChIJQQNFIyCSGGAR3TBCyeHPLzc",
    nameJa: "ピザハウスタグチ",
    nameEn: "Pizza House Taguchi",
    category: "Pizza",
    neighborhood: "7 Chome Nishiarai",
    score: 86.12,
    tags: ["pizza", "Italian-style", "takeout"],
    signature: "タグチスペシャルピザ",
    plate: "hearth",
  },
  yuima: {
    id: "ChIJ6d8N8dntGGARoNUj9Kt2QcI",
    nameJa: "維摩（ユイマ）",
    nameEn: "Yuima",
    category: "Chinese restaurant",
    neighborhood: "3 Chome Igusa",
    score: 83.29,
    tags: ["dumplings", "small independent restaurant", "fried rice"],
    signature: "一口焼き餃子",
    plate: "counter",
  },
  zururi: {
    id: "ChIJB9egl6mNGGARkyq7OUFAfrA",
    nameJa: "ずるり 谷中総本店",
    nameEn: "Zururi Yanaka Sohonten",
    category: "Ramen restaurant",
    neighborhood: "3 Chome Yanaka",
    score: 81.16,
    tags: ["ramen", "chicken paitan ramen", "izakaya"],
    signature: "淡麗醤油ラーメン",
    plate: "bowl",
  },
  nishi: {
    id: "ChIJc3EHNxXzGGAR6IBc9qsLC-g",
    nameJa: "串焼 西（くしやきにし）",
    nameEn: "Kushiyaki Nishi",
    category: "Yakitori restaurant",
    neighborhood: "3 Chome Setagaya",
    score: 80.53,
    tags: ["焼き鳥", "串焼き", "日本酒"],
    signature: "焼鳥丼",
    plate: "hearth",
  },
  sitara: {
    id: "ChIJxVBbAoKLGGARUxJedeLj1L4",
    nameJa: "ローカルスパイシー シタラ 築地店",
    nameEn: "Local Spicy SITARA Tsukiji",
    category: "Indian restaurant",
    neighborhood: "6 Chome Tsukiji",
    score: 78.53,
    tags: ["Indian curry", "Nepalese cuisine", "naan"],
    signature: "Butter chicken curry",
    plate: "counter",
  },
  onder: {
    id: "ChIJWeI_aACNGGAR4Fn0N-p0Xnk",
    nameJa: "ONDER（オンデル）",
    nameEn: "ONDER Restaurant & Bar",
    category: "Turkish restaurant",
    neighborhood: "1 Chome Takadanobaba",
    score: 76.11,
    tags: ["Turkish cuisine", "kebab", "halal"],
    signature: "Lamb skewers",
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

/** The single discovery that the underexposure signals resolve into. */
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
  picks: readonly LandingExample[];
}[] = [
  {
    label: "Someone near Yanaka",
    picks: [EXAMPLES.zururi, EXAMPLES.chokotto, EXAMPLES.umi],
  },
  {
    label: "Someone near Setagaya",
    picks: [EXAMPLES.nishi, EXAMPLES.yuima, EXAMPLES.taguchi],
  },
  {
    label: "Someone near Tsukiji",
    picks: [EXAMPLES.sitara, EXAMPLES.onder, EXAMPLES.zururi],
  },
];

/** The place shared between the first and third column. */
export const SHARED_SELECTION_ID = EXAMPLES.zururi.id;
