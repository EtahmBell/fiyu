import { detectTextLang } from "@/lib/format/language";

const LOWERCASE_TITLE_WORDS = new Set(["and", "at", "for", "in", "of", "on", "or", "the", "to", "with"]);

/**
 * Presentation-only title casing for structured restaurant tags.
 *
 * Japanese text is returned byte-for-byte, while acronyms and words that
 * already carry intentional capitalization are preserved. The stored value is
 * never changed.
 */
export function formatTagForDisplay(tag: string): string {
  if (detectTextLang(tag) === "ja") return tag;

  const words = [...tag.matchAll(/\p{L}[\p{L}'\u2019]*/gu)];
  const lastWordIndex = words.length - 1;
  let wordIndex = 0;
  return tag.replace(/\p{L}[\p{L}'\u2019]*/gu, (word) => {
    const currentIndex = wordIndex;
    wordIndex += 1;
    const lower = word.toLocaleLowerCase("en-US");
    if (word !== lower) return word;
    if (
      currentIndex > 0 &&
      currentIndex < lastWordIndex &&
      LOWERCASE_TITLE_WORDS.has(lower)
    ) {
      return lower;
    }
    return `${lower.charAt(0).toLocaleUpperCase("en-US")}${lower.slice(1)}`;
  });
}
