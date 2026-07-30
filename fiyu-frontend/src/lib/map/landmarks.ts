import type { LatLng } from "@/lib/map/projection";

/**
 * Editorial landmark and station-prominence data.
 *
 * HAND-AUTHORED, and deliberately separate from src/lib/map/generated/, which is
 * machine-generated from OpenStreetMap and must never be edited by hand. This
 * file is the opposite: every entry is a judgement call about what helps someone
 * orient themselves on a food map.
 *
 * Coordinates here are real positions, taken from OpenStreetMap. What is
 * editorial is the *selection* -- which handful of landmarks earn a symbol, and
 * which stations earn a label at which zoom -- not the geography.
 *
 * Landmarks are drawn as small glyphs, not illustrations. They exist to answer
 * "roughly where am I", and a landmark that competes with a restaurant pin for
 * attention is a bug.
 */

/** Which detail level a feature first appears at. See lib/map/detail.ts. */
export type DetailLevel = 1 | 2 | 3;

export interface StationTier {
  /**
   * OSM station name, matched exactly against the generated stations layer.
   * Matching by name rather than by OSM id keeps this readable and survives a
   * node being replaced upstream.
   */
  name: string;
  /** English label to render. Japanese names come from the OSM data. */
  label: string;
  /** 1 = major interchange, 2 = well-known, 3 = local. */
  prominence: DetailLevel;
}

/**
 * Stations worth labelling, most prominent first.
 *
 * Tier 1 is the set someone can navigate the whole city by. Everything else in
 * the generated layer still renders as an unlabelled node at closer zoom, so
 * this list controls labels, never whether a station exists.
 */
export const STATION_TIERS: StationTier[] = [
  // Tier 1 -- the Yamanote anchors, visible at default zoom.
  { name: "東京", label: "Tokyo", prominence: 1 },
  { name: "新宿", label: "Shinjuku", prominence: 1 },
  { name: "渋谷", label: "Shibuya", prominence: 1 },
  { name: "池袋", label: "Ikebukuro", prominence: 1 },
  { name: "上野", label: "Ueno", prominence: 1 },
  { name: "品川", label: "Shinagawa", prominence: 1 },
  { name: "秋葉原", label: "Akihabara", prominence: 1 },

  // Tier 2 -- recognisable, and useful once the map is zoomed a little.
  { name: "原宿", label: "Harajuku", prominence: 2 },
  { name: "恵比寿", label: "Ebisu", prominence: 2 },
  { name: "吉祥寺", label: "Kichijoji", prominence: 2 },
  { name: "新橋", label: "Shimbashi", prominence: 2 },
  { name: "有楽町", label: "Yurakucho", prominence: 2 },
  { name: "目黒", label: "Meguro", prominence: 2 },
  { name: "中野", label: "Nakano", prominence: 2 },
  { name: "浅草", label: "Asakusa", prominence: 2 },
  { name: "六本木", label: "Roppongi", prominence: 2 },
  { name: "銀座", label: "Ginza", prominence: 2 },
  { name: "高田馬場", label: "Takadanobaba", prominence: 2 },

  // Tier 3 -- context at close zoom only.
  { name: "神田", label: "Kanda", prominence: 3 },
  { name: "五反田", label: "Gotanda", prominence: 3 },
  { name: "代々木", label: "Yoyogi", prominence: 3 },
  { name: "日暮里", label: "Nippori", prominence: 3 },
  { name: "田端", label: "Tabata", prominence: 3 },
  { name: "駒込", label: "Komagome", prominence: 3 },
  { name: "巣鴨", label: "Sugamo", prominence: 3 },
  { name: "大塚", label: "Otsuka", prominence: 3 },
  { name: "浜松町", label: "Hamamatsucho", prominence: 3 },
  { name: "御徒町", label: "Okachimachi", prominence: 3 },
  { name: "水道橋", label: "Suidobashi", prominence: 3 },
  { name: "四ツ谷", label: "Yotsuya", prominence: 3 },
  { name: "下北沢", label: "Shimokitazawa", prominence: 3 },
  { name: "三軒茶屋", label: "Sangenjaya", prominence: 3 },
  { name: "自由が丘", label: "Jiyugaoka", prominence: 3 },
  { name: "門前仲町", label: "Monzen-nakacho", prominence: 3 },
  { name: "北千住", label: "Kita-senju", prominence: 3 },
  { name: "荻窪", label: "Ogikubo", prominence: 3 },
  // OSM spells this with katakana ケ, not hiragana ヶ. Matching is exact, so the
  // wrong character silently demotes the station to level 3 rather than erroring.
  // The tier-coverage test in geography.test.ts is what catches that.
  { name: "阿佐ケ谷", label: "Asagaya", prominence: 3 },
  { name: "高円寺", label: "Koenji", prominence: 3 },
  { name: "浜田山", label: "Hamadayama", prominence: 3 },
];

/** Lookup by OSM name, built once. */
export const STATION_TIER_BY_NAME: ReadonlyMap<string, StationTier> = new Map(
  STATION_TIERS.map((tier) => [tier.name, tier]),
);

/**
 * The pictogram drawn for a landmark.
 *
 * A small closed vocabulary rather than per-landmark artwork: bespoke
 * illustrations at 20px would read as clutter and would not survive scaling. Each
 * is a recognisable silhouette cue on a 24x24 grid, not a picture. Drawn in
 * components/map/MapLandmarks.tsx.
 */
export type LandmarkGlyph =
  | "palace" // walled gate above a moat
  | "tower" // lattice tower
  | "skytree" // tall spire with collars
  | "shrine" // torii
  | "temple" // pagoda eaves
  | "crossing" // crossing stripes between kerbs
  | "station" // pediment over columns
  | "civic"; // domed hall with wings

export interface Landmark {
  id: string;
  /** English label. */
  label: string;
  /** Japanese name, shown in the tooltip alongside the label. */
  labelJa: string;
  at: LatLng;
  glyph: LandmarkGlyph;
  minDetail: DetailLevel;
  /** Which side of the glyph the label sits on, to avoid known collisions. */
  labelSide?: "above" | "below";
}

/**
 * The orientation set. Kept to eight: past that they stop being landmarks and
 * become decoration, and they start colliding with restaurant pins.
 *
 * Positions are real OSM coordinates for each site.
 */
export const LANDMARKS: Landmark[] = [
  {
    id: "imperial-palace",
    label: "Imperial Palace",
    labelJa: "皇居",
    at: { lat: 35.6852, lng: 139.7528 },
    glyph: "palace",
    minDetail: 1,
    labelSide: "below",
  },
  {
    id: "tokyo-station",
    label: "Tokyo Station",
    labelJa: "東京駅",
    at: { lat: 35.6812, lng: 139.7671 },
    glyph: "station",
    minDetail: 2,
  },
  {
    id: "tokyo-tower",
    label: "Tokyo Tower",
    labelJa: "東京タワー",
    at: { lat: 35.6586, lng: 139.7454 },
    glyph: "tower",
    minDetail: 1,
  },
  {
    id: "tokyo-skytree",
    label: "Tokyo Skytree",
    labelJa: "東京スカイツリー",
    at: { lat: 35.7101, lng: 139.8107 },
    glyph: "skytree",
    minDetail: 1,
  },
  {
    id: "senso-ji",
    label: "Senso-ji",
    labelJa: "浅草寺",
    at: { lat: 35.7148, lng: 139.7967 },
    glyph: "temple",
    minDetail: 1,
  },
  {
    id: "meiji-shrine",
    label: "Meiji Shrine",
    labelJa: "明治神宮",
    at: { lat: 35.6764, lng: 139.6993 },
    glyph: "shrine",
    minDetail: 1,
  },
  {
    id: "shibuya-crossing",
    label: "Shibuya Crossing",
    labelJa: "渋谷スクランブル交差点",
    at: { lat: 35.6595, lng: 139.7005 },
    glyph: "crossing",
    minDetail: 2,
    labelSide: "below",
  },
  {
    id: "national-diet",
    label: "National Diet",
    labelJa: "国会議事堂",
    at: { lat: 35.6758, lng: 139.7449 },
    // Its own pictogram: sharing the station facade made two different landmarks
    // draw identically.
    glyph: "civic",
    minDetail: 3,
  },
];

/**
 * Named green spaces worth a label. The polygons themselves come from the
 * generated parks layer; this only decides which get named, and where the name
 * sits when the polygon centroid would be a poor anchor.
 */
export interface ParkLabel {
  id: string;
  label: string;
  at: LatLng;
  minDetail: DetailLevel;
}

export const PARK_LABELS: ParkLabel[] = [
  { id: "ueno-park", label: "Ueno Park", at: { lat: 35.7156, lng: 139.7745 }, minDetail: 2 },
  { id: "yoyogi-park", label: "Yoyogi Park", at: { lat: 35.6714, lng: 139.6949 }, minDetail: 2 },
  { id: "shinjuku-gyoen", label: "Shinjuku Gyoen", at: { lat: 35.6852, lng: 139.71 }, minDetail: 2 },
  { id: "hamarikyu", label: "Hamarikyu", at: { lat: 35.6598, lng: 139.7635 }, minDetail: 3 },
  { id: "koishikawa", label: "Koishikawa Korakuen", at: { lat: 35.7056, lng: 139.7494 }, minDetail: 3 },
  { id: "rikugien", label: "Rikugien", at: { lat: 35.7327, lng: 139.7462 }, minDetail: 3 },
];
