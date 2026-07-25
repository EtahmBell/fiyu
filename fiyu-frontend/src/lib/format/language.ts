/**
 * Bilingual text handling.
 *
 * The backend carries no per-field language marker, and content is genuinely
 * mixed: `why_fiyu` is Japanese for some restaurants and English for others,
 * and `food_tags` / `primary_category` vary the same way within one payload
 * (e.g. "居酒屋" alongside "Izakaya restaurant"). A real language toggle is
 * therefore not possible from this data -- see docs/LIMITATIONS.md.
 *
 * What we can do correctly is tag each string with the right `lang` attribute
 * so the browser applies Japanese font selection, line breaking and
 * hyphenation rules, and so screen readers switch voice.
 */

export type TextLang = "ja" | "en";

/** Hiragana, Katakana, CJK ideographs (incl. extension A), halfwidth katakana. */
const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/u;
const CJK_PATTERN_GLOBAL = new RegExp(CJK_PATTERN.source, "gu");

/**
 * Heuristic language detection for a single string.
 *
 * A low threshold is intentional: a mostly-Latin string containing a Japanese
 * dish name still needs `lang="ja"` on the whole run to break correctly, and
 * mis-tagging Japanese as English causes visibly wrong line breaks, whereas the
 * reverse is nearly invisible.
 */
export function detectTextLang(text: string): TextLang {
  if (!CJK_PATTERN.test(text)) return "en";
  const cjkCount = text.match(CJK_PATTERN_GLOBAL)?.length ?? 0;
  const meaningful = text.replace(/\s/gu, "").length;
  if (meaningful === 0) return "en";
  return cjkCount / meaningful >= 0.15 ? "ja" : "en";
}

export interface LocalizedText {
  text: string;
  lang: TextLang;
}

/** Tag a string with its detected language, or null when there is nothing to show. */
export function localize(text: string | null): LocalizedText | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return { text: trimmed, lang: detectTextLang(trimmed) };
}

export interface RestaurantNames {
  /** Main heading. Japanese is preferred: it is the name on the door. */
  primary: LocalizedText | null;
  /** Secondary line, omitted when it would duplicate the primary. */
  secondary: LocalizedText | null;
}

/**
 * Resolve the display name pair for a restaurant.
 *
 * Japanese leads because Fiyu is a Tokyo product and the Japanese name is what
 * a user will see on the storefront; the English name supports non-readers.
 * Either field may be null in the API, and both being null is handled by the
 * caller rendering a fallback rather than an empty heading.
 */
export function resolveNames(input: {
  name_ja: string | null;
  name_en: string | null;
}): RestaurantNames {
  const ja = localize(input.name_ja);
  const en = localize(input.name_en);

  if (ja && en) {
    return ja.text === en.text ? { primary: ja, secondary: null } : { primary: ja, secondary: en };
  }
  return { primary: ja ?? en, secondary: null };
}
