import { describe, expect, it } from "vitest";

import { detectTextLang, localize, resolveNames } from "@/lib/format/language";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

describe("detectTextLang", () => {
  it("detects Japanese across kanji, kana and mixed strings", () => {
    expect(detectTextLang("浜田山叙々苑")).toBe("ja");
    expect(detectTextLang("ラーメン")).toBe("ja");
    expect(detectTextLang("あたらよ 秋葉原店")).toBe("ja");
  });

  it("detects English", () => {
    expect(detectTextLang("Hamadayama Jojoen")).toBe("en");
    expect(detectTextLang("Izakaya / standing bar")).toBe("en");
  });

  it("tags a Latin string containing a Japanese term as Japanese", () => {
    // Deliberate: the run still needs Japanese line-breaking rules.
    expect(detectTextLang("A5ランク和牛")).toBe("ja");
  });

  it("treats empty and whitespace-only strings as English rather than throwing", () => {
    expect(detectTextLang("")).toBe("en");
    expect(detectTextLang("   ")).toBe("en");
  });
});

describe("localize", () => {
  it("trims and tags", () => {
    expect(localize("  寿司  ")).toEqual({ text: "寿司", lang: "ja" });
  });

  it("returns null for absent or blank text", () => {
    expect(localize(null)).toBeNull();
    expect(localize("")).toBeNull();
    expect(localize("   ")).toBeNull();
  });
});

describe("resolveNames", () => {
  it("leads with the Japanese name and keeps English as the secondary line", () => {
    const names = resolveNames({ name_ja: "浜田山叙々苑", name_en: "Hamadayama Jojoen" });
    expect(names.primary).toEqual({ text: "浜田山叙々苑", lang: "ja" });
    expect(names.secondary).toEqual({ text: "Hamadayama Jojoen", lang: "en" });
  });

  it("falls back to whichever name exists", () => {
    expect(resolveNames({ name_ja: null, name_en: "Pizza Place" }).primary?.text).toBe(
      "Pizza Place",
    );
    expect(resolveNames({ name_ja: "居酒屋", name_en: null }).primary?.text).toBe("居酒屋");
  });

  it("does not repeat an identical name on both lines", () => {
    const names = resolveNames({ name_ja: "Bar Kudan", name_en: "Bar Kudan" });
    expect(names.secondary).toBeNull();
  });

  it("returns a null primary when both names are missing", () => {
    expect(resolveNames({ name_ja: null, name_en: null }).primary).toBeNull();
  });

  it("produces a primary name for every restaurant in the real catalog", () => {
    for (const row of restaurantsFixture) {
      expect(resolveNames(row).primary).not.toBeNull();
    }
  });
});
