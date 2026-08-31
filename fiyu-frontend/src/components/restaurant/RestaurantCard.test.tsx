// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * These tests exist to prevent client-side localization from creeping back in.
 * Restaurant content must reach the DOM byte-for-byte as the API returned it;
 * localization is owned by the backend.
 *
 * Synthetic rows are used for the transformation assertions so they stay
 * meaningful regardless of what the live catalog happens to contain, with the
 * real fixture exercised separately at the end.
 */
function make(overrides: Partial<PublicRestaurant> & { place_id: string }) {
  return publicRestaurantSchema.parse(overrides);
}

afterEach(cleanup);

describe("restaurant names", () => {
  it("uses name_ja as the primary heading with name_en beneath it", () => {
    render(
      <RestaurantCard
        restaurant={make({
          place_id: "a",
          name_ja: "浜田山叙々苑",
          name_en: "Hamadayama Jojoen",
        })}
      />,
    );

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toBe("浜田山叙々苑");
    expect(heading).toHaveProperty("lang", "");
    expect(within(heading).getByText("浜田山叙々苑").getAttribute("lang")).toBe("ja");

    // The English name is present but is not the heading.
    const secondary = screen.getByText("Hamadayama Jojoen");
    expect(secondary.getAttribute("lang")).toBe("en");
    expect(secondary.tagName).toBe("P");
  });

  it("promotes name_en to the heading when name_ja is missing", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", name_en: "Pizza Place" })} />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Pizza Place");
  });

  it("keeps name_ja as the heading when name_en is missing", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", name_ja: "居酒屋" })} />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("居酒屋");
  });

  it("does not render the same value twice when both names are identical", () => {
    render(
      <RestaurantCard
        restaurant={make({ place_id: "a", name_ja: "Bar Kudan", name_en: "Bar Kudan" })}
      />,
    );
    expect(screen.getAllByText("Bar Kudan")).toHaveLength(1);
  });

  it("renders a fallback rather than an empty heading when both names are absent", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a" })} />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Unnamed restaurant");
  });

  it("does not transliterate or translate the Japanese name", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", name_ja: "鳥割烹" })} />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("鳥割烹");
    expect(screen.queryByText(/tori|kappo/i)).toBeNull();
  });
});

describe("food tags", () => {
  // The card shows at most three tags, so this list stays within that cap;
  // overflow behaviour is asserted separately below.
  const JAPANESE_TAGS = ["江戸前寿司", "おまかせ", "焼き鳥"];

  it("renders Japanese tags unchanged", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", food_tags: JAPANESE_TAGS })} />);
    for (const tag of JAPANESE_TAGS) {
      expect(screen.getByText(tag).textContent).toBe(tag);
    }
  });

  it("does not substitute romanized or English equivalents", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", food_tags: JAPANESE_TAGS })} />);
    for (const forbidden of [/edomae/i, /omakase/i, /yakitori/i]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });

  it("shows at most three tags and collapses the rest into a count", () => {
    render(
      <RestaurantCard
        restaurant={make({ place_id: "a", food_tags: [...JAPANESE_TAGS, "和牛", "立ち飲み"] })}
      />,
    );
    for (const tag of JAPANESE_TAGS) {
      expect(screen.getByText(tag)).toBeTruthy();
    }
    const overflow = screen.getByText("+2");
    expect(overflow.getAttribute("title")).toBe("和牛, 立ち飲み");
    // Hidden tags stay untranslated in the title too.
    expect(screen.queryByText(/wagyu|tachinomi/i)).toBeNull();
  });

  it("tags Japanese text with lang=ja for correct rendering, without altering it", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", food_tags: ["おまかせ"] })} />);
    const tag = screen.getByText("おまかせ");
    expect(tag.getAttribute("lang")).toBe("ja");
    expect(tag.textContent).toBe("おまかせ");
  });

  it("renders English tags unchanged too", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", food_tags: ["seafood"] })} />);
    expect(screen.getByText("seafood").getAttribute("lang")).toBe("en");
  });
});

describe("signature dishes", () => {
  it("renders Japanese dishes unchanged", () => {
    const dishes = ["鮑", "沖縄そば", "江戸前寿司"];
    render(<RestaurantCard restaurant={make({ place_id: "a", signature_dishes: dishes })} />);
    for (const dish of dishes) {
      expect(screen.getByText(dish).textContent).toBe(dish);
    }
  });

  it("does not translate dish names", () => {
    render(
      <RestaurantCard restaurant={make({ place_id: "a", signature_dishes: ["鮑", "沖縄そば"] })} />,
    );
    expect(screen.queryByText(/abalone|awabi/i)).toBeNull();
    expect(screen.queryByText(/okinawa soba/i)).toBeNull();
  });

  it("keeps the surrounding label in English as UI copy", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", signature_dishes: ["鮑"] })} />);
    expect(screen.getByText(/Signature/)).toBeTruthy();
  });

  it("preserves an embedded parenthetical instead of extracting it", () => {
    // Previously the parenthetical was pulled out as an English replacement.
    const dish = "チーズナン（cheese naan）";
    render(<RestaurantCard restaurant={make({ place_id: "a", signature_dishes: [dish] })} />);
    expect(screen.getByText(dish).textContent).toBe(dish);
  });
});

describe("category and neighborhood", () => {
  it("renders a Japanese category unchanged", () => {
    render(<RestaurantCard restaurant={make({ place_id: "a", category: "居酒屋" })} />);
    expect(screen.getByText("居酒屋").textContent).toBe("居酒屋");
    expect(screen.queryByText(/izakaya/i)).toBeNull();
  });

  it("renders the canonical display area instead of a raw chome locality", () => {
    render(
      <RestaurantCard
        restaurant={make({
          place_id: "a",
          neighborhood: "3 Chome Hamadayama",
          display_area: "Hamadayama",
        })}
      />,
    );
    expect(screen.getByText("Hamadayama")).toBeTruthy();
    expect(screen.queryByText("3 Chome Hamadayama")).toBeNull();
  });
});

describe("description_en", () => {
  it("renders Japanese prose exactly as provided", () => {
    const why =
      "浜田山駅前で営業する、叙々苑本店から暖簾分けされた独立系の焼肉店と確認できます。";
    render(<RestaurantCard restaurant={make({ place_id: "a", description_en: why })} />);
    expect(screen.getByText(why).textContent).toBe(why);
  });

  it("renders English prose exactly as provided", () => {
    const why = "A small Okinawa-soba specialist near Sendagi, documented mainly in Japanese.";
    render(<RestaurantCard restaurant={make({ place_id: "a", description_en: why })} />);
    expect(screen.getByText(why).textContent).toBe(why);
  });

  it("does not summarise or truncate the text in the DOM", () => {
    // Clamping is visual only (line-clamp-3); the full string must be present
    // so it is available to search, screen readers and the detail view.
    const why = "あ".repeat(600);
    render(<RestaurantCard restaurant={make({ place_id: "a", description_en: why })} />);
    expect(screen.getByText(why).textContent).toHaveLength(600);
  });

  it("keeps the line-clamp class so card layout is unchanged", () => {
    const why = "A description.";
    render(<RestaurantCard restaurant={make({ place_id: "a", description_en: why })} />);
    expect(screen.getByText(why).className).toContain("line-clamp-3");
  });
});

describe("no runtime translation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("performs no network request while rendering", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <RestaurantCard
        restaurant={make({
          place_id: "a",
          name_ja: "鳥割烹",
          food_tags: ["おまかせ", "江戸前寿司"],
          signature_dishes: ["鮑"],
          description_en: "説明文です。",
        })}
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("against the real catalog", () => {
  const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));

  it("renders every visible tag and dish byte-for-byte as the API returned it", () => {
    // The card caps both lists at three; anything beyond that is collapsed
    // into a "+N" summary and is asserted separately.
    for (const restaurant of catalog) {
      const { unmount } = render(<RestaurantCard restaurant={restaurant} />);
      for (const value of [
        ...restaurant.food_tags.slice(0, 3),
        ...restaurant.signature_dishes.slice(0, 3),
      ]) {
        expect(screen.getAllByText(value).length).toBeGreaterThan(0);
      }
      unmount();
    }
  });
});
