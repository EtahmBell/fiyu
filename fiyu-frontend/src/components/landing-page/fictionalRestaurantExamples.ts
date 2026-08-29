import type { PlateId } from "@/components/landing-page/EditorialPlate";

/**
 * INVENTED RESTAURANTS. Marketing illustration only.
 *
 * Nothing in this file is a real business, and nothing in it came from Fiyu's
 * catalog. That is the point, and it is a product decision rather than a
 * convenience: Fiyu exists to find underexposed restaurants, and printing the
 * real ones on a public marketing page is the fastest way to overexpose the
 * places it is meant to protect. A visitor should meet an actual discovery
 * through Fiyu, not through an advert for Fiyu.
 *
 * This file replaced `landingExamples.ts`, which held real published catalog
 * rows. That file is deleted rather than left unused, so there is no path by
 * which landing-page code can reach a real restaurant again.
 *
 * Deliberate absences, each one a guard:
 *
 *   no `place_id` and no `id`   nothing here can be looked up, linked, or
 *                              mistaken for a catalog entity. `key` is a slug,
 *                              and no slug can pass for a Google place id.
 *   no latitude / longitude    nothing can be mapped or measured.
 *   no photo url               imagery comes from declared slots in
 *                              `imageSlots.ts`, never from a restaurant record.
 *   no `fiyu_score`            the score field is `displayScore`, on the public
 *                              0-10 scale, so it cannot be confused with the
 *                              backend's 0-100 `fiyu_score` and no code path
 *                              can treat it as one.
 *
 * Every surface that renders these carries a quiet `ILLUSTRATIVE EXAMPLES` or
 * `SAMPLE FIYU DISCOVERY` mark. Fiyu has not evaluated a restaurant that does
 * not exist, and the page should not imply it has.
 *
 * The cities are chosen to tell one quiet story as a reader scrolls -- Tokyo,
 * Seoul, New York, Paris, Los Angeles -- so the product reads as global while
 * the rollout section stays the only authority on where Fiyu actually operates.
 */
export interface FictionalRestaurant {
  /** Marketing slug. Never an identifier for anything. */
  key: string;
  /** Primary display name, in local script where the type stack supports it. */
  name: string;
  /**
   * The secondary line. A romanisation for Tokyo, and null elsewhere, where the
   * primary name is already Latin and a second line would just repeat it.
   */
  romanized: string | null;
  area: string;
  city: string;
  category: string;
  /**
   * Invented, on Fiyu's public 0-10 scale. Not a `fiyu_score`, not a backend
   * value, and never an evaluation of a real business.
   */
  displayScore: number;
  tags: readonly string[];
  plate: PlateId;
}

/**
 * `ScoreMark` formats the backend's 0-100 scale, so an invented display score
 * has to be scaled up to be rendered by it. Kept as a named function so the
 * conversion is never mistaken for the score itself.
 */
export function scoreMarkValue(displayScore: number): number {
  return displayScore * 10;
}

const TOKYO_HERO = [
  {
    key: "tokyo-kogane-shokudo",
    name: "黄金食堂",
    romanized: "Kogane Shokudō",
    area: "Koenji",
    city: "Tokyo",
    category: "Teishoku",
    displayScore: 8.6,
    tags: ["定食", "煮魚", "小鉢"],
    plate: "bowl",
  },
  {
    key: "tokyo-tsuki-no-soba",
    name: "月のそば",
    romanized: "Tsuki no Soba",
    area: "Kagurazaka",
    city: "Tokyo",
    category: "Soba",
    displayScore: 8.4,
    tags: ["手打ち蕎麦", "天種", "日本酒"],
    plate: "counter",
  },
  {
    key: "tokyo-toriya-nagi",
    name: "鳥屋 なぎ",
    romanized: "Toriya Nagi",
    area: "Ebisu",
    city: "Tokyo",
    category: "Yakitori",
    displayScore: 8.2,
    tags: ["焼き鳥", "炭火", "つくね"],
    plate: "hearth",
  },
] as const satisfies readonly FictionalRestaurant[];

/** Seoul. One featured discovery for the photographic moment. */
const SEOUL_STORY = {
  key: "seoul-yeonhwa-gukbap",
  name: "Yeonhwa Gukbap",
  romanized: null,
  area: "Euljiro",
  city: "Seoul",
  category: "Gukbap / Korean comfort food",
  displayScore: 8.7,
  tags: ["gukbap", "slow-simmered broth", "banchan"],
  plate: "bowl",
} as const satisfies FictionalRestaurant;

/** New York. The three picks inside the product demonstration. */
const NEW_YORK_WORKFLOW = [
  {
    key: "ny-canal-claypot",
    name: "Canal Claypot",
    romanized: null,
    area: "Chinatown",
    city: "New York",
    category: "Cantonese claypot",
    displayScore: 8.5,
    tags: ["claypot rice", "cha siu", "greens"],
    plate: "hearth",
  },
  {
    key: "ny-dalias-counter",
    name: "Dalia’s Counter",
    romanized: null,
    area: "East Village",
    city: "New York",
    category: "Puerto Rican lunch counter",
    displayScore: 8.3,
    tags: ["mofongo", "pernil", "counter seating"],
    plate: "counter",
  },
  {
    key: "ny-night-heron-noodles",
    name: "Night Heron Noodles",
    romanized: null,
    area: "Lower East Side",
    city: "New York",
    category: "Hand-pulled noodles",
    displayScore: 8.1,
    tags: ["hand-pulled noodles", "chilli oil", "late hours"],
    plate: "bowl",
  },
] as const satisfies readonly FictionalRestaurant[];

/** Paris. The one place the underexposure signals resolve into. */
const PARIS_UNDEREXPOSED = {
  key: "paris-le-zinc-des-lilas",
  name: "Le Zinc des Lilas",
  romanized: null,
  area: "Belleville",
  city: "Paris",
  category: "Bistro / seasonal French",
  displayScore: 8.6,
  tags: ["ardoise du jour", "natural wine", "twelve covers"],
  plate: "doorway",
} as const satisfies FictionalRestaurant;

/**
 * Los Angeles. Three deliberately unrelated kitchens in one city, because the
 * point of "Only a few." is breadth narrowed down rather than a single cuisine.
 */
const LOS_ANGELES_FEW = [
  {
    key: "la-jangdok-alley",
    name: "Jangdok Alley",
    romanized: null,
    area: "Koreatown",
    city: "Los Angeles",
    category: "Korean soups / grill",
    displayScore: 8.5,
    tags: ["seolleongtang", "banchan", "charcoal grill"],
    plate: "hearth",
  },
  {
    key: "la-mesa-de-nopal",
    name: "Mesa de Nopal",
    romanized: null,
    area: "Boyle Heights",
    city: "Los Angeles",
    category: "Oaxacan / Mexican",
    displayScore: 8.4,
    tags: ["mole negro", "tlayuda", "masa ground daily"],
    plate: "counter",
  },
  {
    key: "la-soi-43",
    name: "Soi 43",
    romanized: null,
    area: "Thai Town",
    city: "Los Angeles",
    category: "Northern Thai",
    displayScore: 8.2,
    tags: ["khao soi", "sai ua", "som tam"],
    plate: "bowl",
  },
] as const satisfies readonly FictionalRestaurant[];

/**
 * Tokyo, by starting point.
 *
 * Three recognisable areas, and for each of them three invented places in
 * genuinely adjacent neighbourhoods -- Shinjuku reaches Yotsuya and Okubo,
 * Shibuya reaches Tomigaya and Nakameguro, Ginza reaches Shimbashi and Tsukiji.
 * The areas being real is what makes the demonstration legible; the restaurants
 * being invented is what keeps it honest.
 */
export interface LocationSet {
  id: string;
  /** The area a reader picks. Recognisable to someone who has never been. */
  area: string;
  picks: readonly FictionalRestaurant[];
}

export const LOCATION_SETS: readonly LocationSet[] = [
  {
    id: "shinjuku",
    area: "Shinjuku",
    picks: [
      {
        key: "tokyo-akaritei",
        name: "灯り亭",
        romanized: "Akaritei",
        area: "Yotsuya",
        city: "Tokyo",
        category: "Washoku",
        displayScore: 8.4,
        tags: ["和食", "旬の魚", "土鍋ご飯"],
        plate: "counter",
      },
      {
        key: "tokyo-rikka",
        name: "とんかつ 六花",
        romanized: "Tonkatsu Rikka",
        area: "Kagurazaka",
        city: "Tokyo",
        category: "Tonkatsu",
        displayScore: 8.2,
        tags: ["とんかつ", "熟成豚", "定食"],
        plate: "hearth",
      },
      {
        key: "tokyo-yagura",
        name: "中華 やぐら",
        romanized: "Chūka Yagura",
        area: "Okubo",
        city: "Tokyo",
        category: "Chūka soba",
        displayScore: 8.0,
        tags: ["中華そば", "餃子", "町中華"],
        plate: "bowl",
      },
    ],
  },
  {
    id: "shibuya",
    area: "Shibuya",
    picks: [
      {
        key: "tokyo-kamado",
        name: "竈 かまど",
        romanized: "Kamado",
        area: "Tomigaya",
        city: "Tokyo",
        category: "Charcoal grill",
        displayScore: 8.5,
        tags: ["炭火焼", "野菜", "自然派ワイン"],
        plate: "hearth",
      },
      {
        key: "tokyo-utsuwa",
        name: "器 うつわ",
        romanized: "Utsuwa",
        area: "Nakameguro",
        city: "Tokyo",
        category: "Small kappō",
        displayScore: 8.3,
        tags: ["割烹", "八寸", "日本酒"],
        plate: "counter",
      },
      {
        key: "tokyo-minamo",
        name: "水面 みなも",
        romanized: "Minamo",
        area: "Sasazuka",
        city: "Tokyo",
        category: "Teishoku",
        displayScore: 8.1,
        tags: ["定食", "焼魚", "味噌汁"],
        plate: "bowl",
      },
    ],
  },
  {
    id: "ginza",
    area: "Ginza",
    picks: [
      {
        key: "tokyo-shiomi",
        name: "汐見",
        romanized: "Shiomi",
        area: "Shimbashi",
        city: "Tokyo",
        category: "Sushi counter",
        displayScore: 8.6,
        tags: ["江戸前寿司", "おまかせ", "カウンター"],
        plate: "counter",
      },
      {
        key: "tokyo-hatoba",
        name: "波止場",
        romanized: "Hatoba",
        area: "Tsukiji",
        city: "Tokyo",
        category: "Seafood donburi",
        displayScore: 8.4,
        tags: ["海鮮丼", "朝営業", "青魚"],
        plate: "bowl",
      },
      {
        key: "tokyo-garasudo",
        name: "硝子戸",
        romanized: "Garasudo",
        area: "Hatchobori",
        city: "Tokyo",
        category: "Kissa / yōshoku",
        displayScore: 8.0,
        tags: ["洋食", "ナポリタン", "喫茶"],
        plate: "doorway",
      },
    ],
  },
];

/** The hero composition. Tokyo, because Tokyo is the live edition. */
export const HERO_EXAMPLES: readonly FictionalRestaurant[] = TOKYO_HERO;

/** The photographic moment. Seoul. */
export const RESTAURANT_MOMENT_EXAMPLE: FictionalRestaurant = SEOUL_STORY;

/** The three picks inside the product demonstration. New York. */
export const WORKFLOW_EXAMPLES: readonly FictionalRestaurant[] = NEW_YORK_WORKFLOW;

/** The place the underexposure signals resolve into. Paris. */
export const LOOK_BEYOND_EXAMPLE: FictionalRestaurant = PARIS_UNDEREXPOSED;

/** The three that arrive under "Only a few." Los Angeles. */
export const ONLY_A_FEW_EXAMPLES: readonly FictionalRestaurant[] = LOS_ANGELES_FEW;

/** Every invented restaurant on the page, for the fixture-safety tests. */
export const ALL_FICTIONAL_EXAMPLES: readonly FictionalRestaurant[] = [
  ...TOKYO_HERO,
  SEOUL_STORY,
  ...NEW_YORK_WORKFLOW,
  PARIS_UNDEREXPOSED,
  ...LOS_ANGELES_FEW,
  ...LOCATION_SETS.flatMap((set) => set.picks),
];
