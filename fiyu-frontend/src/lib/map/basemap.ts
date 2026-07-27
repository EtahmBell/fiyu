import type { LatLng } from "@/lib/map/projection";

/**
 * Base geography for the Fiyu discovery map.
 *
 * Every feature is defined in latitude and longitude and projected through the
 * same function as the restaurant markers, so geography and pins can never
 * drift apart. Nothing here is authored in pixel coordinates.
 *
 * HONESTY NOTE. These outlines are coarse hand-approximations traced from real
 * positions -- a dozen points where the real coastline has thousands. Station
 * coordinates are accurate; the shapes between them are stylised. This is an
 * orientation aid, not survey data, and it deliberately carries no roads, no
 * business POIs and no building footprints.
 */

export interface MapFeature {
  id: string;
  coordinates: LatLng[];
}

export interface MapLabel {
  id: string;
  text: string;
  at: LatLng;
  /** Wards read larger than districts. */
  emphasis: "primary" | "muted";
}

/**
 * Tokyo Bay. Approximate western and northern shoreline, closed off to the
 * south-east corner of the bounds so it fills as a body of water.
 */
export const TOKYO_BAY: MapFeature = {
  id: "tokyo-bay",
  coordinates: [
    { lat: 35.52, lng: 139.74 },
    { lat: 35.5665, lng: 139.752 },
    { lat: 35.5905, lng: 139.7595 },
    { lat: 35.6105, lng: 139.7705 },
    { lat: 35.6205, lng: 139.784 },
    { lat: 35.6285, lng: 139.7965 },
    { lat: 35.6395, lng: 139.807 },
    { lat: 35.6525, lng: 139.8195 },
    { lat: 35.6635, lng: 139.8365 },
    { lat: 35.6725, lng: 139.8595 },
    { lat: 35.68, lng: 139.88 },
    { lat: 35.6845, lng: 139.92 },
    { lat: 35.52, lng: 139.92 },
  ],
};

/** Sumida River, from the north-east down through the eastern wards. */
export const SUMIDA_RIVER: MapFeature = {
  id: "sumida-river",
  coordinates: [
    { lat: 35.7925, lng: 139.7715 },
    { lat: 35.7715, lng: 139.7885 },
    { lat: 35.7495, lng: 139.7995 },
    { lat: 35.7285, lng: 139.8035 },
    { lat: 35.7135, lng: 139.7995 },
    { lat: 35.7005, lng: 139.7935 },
    { lat: 35.6865, lng: 139.7905 },
    { lat: 35.6725, lng: 139.7885 },
    { lat: 35.6585, lng: 139.7855 },
    { lat: 35.6465, lng: 139.7815 },
  ],
};

/** Arakawa River, running roughly parallel further east. */
export const ARAKAWA_RIVER: MapFeature = {
  id: "arakawa-river",
  coordinates: [
    { lat: 35.8, lng: 139.7885 },
    { lat: 35.7845, lng: 139.8095 },
    { lat: 35.7655, lng: 139.8285 },
    { lat: 35.7455, lng: 139.8435 },
    { lat: 35.7235, lng: 139.8515 },
    { lat: 35.7005, lng: 139.8565 },
    { lat: 35.6785, lng: 139.8605 },
    { lat: 35.6605, lng: 139.8645 },
  ],
};

/**
 * The Yamanote Line loop.
 *
 * The single most useful orientation landmark in Tokyo, and the reason the map
 * is legible without street labels. These are real station positions.
 */
export const YAMANOTE_LINE: MapFeature = {
  id: "yamanote-line",
  coordinates: [
    { lat: 35.6812, lng: 139.7671 }, // Tokyo
    { lat: 35.6918, lng: 139.771 }, // Kanda
    { lat: 35.6984, lng: 139.7731 }, // Akihabara
    { lat: 35.7141, lng: 139.7774 }, // Ueno
    { lat: 35.7281, lng: 139.7707 }, // Nippori
    { lat: 35.7381, lng: 139.7608 }, // Tabata
    { lat: 35.7333, lng: 139.7404 }, // Komagome
    { lat: 35.7295, lng: 139.7109 }, // Ikebukuro
    { lat: 35.7126, lng: 139.7038 }, // Takadanobaba
    { lat: 35.6896, lng: 139.7006 }, // Shinjuku
    { lat: 35.683, lng: 139.702 }, // Yoyogi
    { lat: 35.6702, lng: 139.7027 }, // Harajuku
    { lat: 35.658, lng: 139.7016 }, // Shibuya
    { lat: 35.6467, lng: 139.71 }, // Ebisu
    { lat: 35.6339, lng: 139.7157 }, // Meguro
    { lat: 35.6262, lng: 139.7233 }, // Gotanda
    { lat: 35.6285, lng: 139.7387 }, // Shinagawa
    { lat: 35.6455, lng: 139.7475 }, // Takanawa Gateway
    { lat: 35.6553, lng: 139.757 }, // Hamamatsucho
    { lat: 35.6664, lng: 139.7583 }, // Shimbashi
    { lat: 35.6751, lng: 139.7639 }, // Yurakucho
    { lat: 35.6812, lng: 139.7671 }, // back to Tokyo
  ],
};

/** Imperial Palace grounds -- the green void at the centre of the city. */
export const IMPERIAL_PALACE: MapFeature = {
  id: "imperial-palace",
  coordinates: [
    { lat: 35.6935, lng: 139.7495 },
    { lat: 35.6925, lng: 139.7595 },
    { lat: 35.6855, lng: 139.7625 },
    { lat: 35.6785, lng: 139.7595 },
    { lat: 35.6765, lng: 139.7505 },
    { lat: 35.6815, lng: 139.7435 },
    { lat: 35.6895, lng: 139.7445 },
  ],
};

export const PARKS: MapFeature[] = [
  IMPERIAL_PALACE,
  {
    id: "yoyogi-park",
    coordinates: [
      { lat: 35.6745, lng: 139.6925 },
      { lat: 35.6745, lng: 139.7025 },
      { lat: 35.6665, lng: 139.7035 },
      { lat: 35.6645, lng: 139.6945 },
    ],
  },
  {
    id: "ueno-park",
    coordinates: [
      { lat: 35.7195, lng: 139.7715 },
      { lat: 35.7185, lng: 139.7775 },
      { lat: 35.7115, lng: 139.7765 },
      { lat: 35.7125, lng: 139.7705 },
    ],
  },
];

export const RIVERS: MapFeature[] = [SUMIDA_RIVER, ARAKAWA_RIVER];

/**
 * Ward labels, positioned at approximate ward centres.
 *
 * Only wards Fiyu actually covers, kept sparse: the brief calls for selected
 * neighbourhood labels, not a dense gazetteer.
 */
export const AREA_LABELS: MapLabel[] = [
  { id: "shinjuku", text: "Shinjuku", at: { lat: 35.6938, lng: 139.7034 }, emphasis: "primary" },
  { id: "shibuya", text: "Shibuya", at: { lat: 35.6618, lng: 139.7041 }, emphasis: "primary" },
  { id: "chiyoda", text: "Chiyoda", at: { lat: 35.694, lng: 139.7536 }, emphasis: "primary" },
  { id: "chuo", text: "Chuo", at: { lat: 35.6706, lng: 139.772 }, emphasis: "primary" },
  { id: "minato", text: "Minato", at: { lat: 35.6581, lng: 139.7514 }, emphasis: "primary" },
  { id: "taito", text: "Taito", at: { lat: 35.7126, lng: 139.78 }, emphasis: "primary" },
  { id: "toshima", text: "Toshima", at: { lat: 35.7364, lng: 139.7159 }, emphasis: "muted" },
  { id: "suginami", text: "Suginami", at: { lat: 35.6994, lng: 139.6363 }, emphasis: "muted" },
  { id: "setagaya", text: "Setagaya", at: { lat: 35.6464, lng: 139.6532 }, emphasis: "muted" },
  { id: "koto", text: "Koto", at: { lat: 35.6729, lng: 139.8172 }, emphasis: "muted" },
  { id: "ota", text: "Ota", at: { lat: 35.5614, lng: 139.716 }, emphasis: "muted" },
  { id: "adachi", text: "Adachi", at: { lat: 35.7756, lng: 139.8044 }, emphasis: "muted" },
];
