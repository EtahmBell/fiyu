import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * Structural guard for things that must stay out of the frontend.
 *
 * Fiyu is a discovery product, not a navigation or reviews product. It does not
 * render Google ratings, review counts, opening hours or prices; it does not
 * render the internal why_fiyu field; and it never fabricates community
 * activity. Each of those has been removed at least once, so each is asserted
 * here rather than left to code review.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const files = sourceFiles(SRC);
const productionFiles = files.filter((path) => !/\.test\.tsx?$/.test(path));

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Ignore comments so prose explaining a removal does not trip the guard. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Google Maps JavaScript rendering is gone", () => {
  it("declares no Google Maps dependency", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /google-maps|googlemaps|@vis\.gl/i.test(n))).toEqual([]);
  });

  it("imports no Google Maps module anywhere", () => {
    const offenders = productionFiles.filter((path) =>
      /@vis\.gl|google\.maps|maps\.googleapis\.com/.test(stripComments(read(path))),
    );
    expect(offenders).toEqual([]);
  });

  it("reads no Google Maps browser key from the environment", () => {
    const offenders = productionFiles.filter((path) =>
      /NEXT_PUBLIC_GOOGLE_MAPS/.test(stripComments(read(path))),
    );
    expect(offenders).toEqual([]);
  });
});

describe("Google live details are gone", () => {
  it("has no live-details request code", () => {
    const offenders = productionFiles.filter((path) =>
      /live-details|fetchLiveDetails|liveDetailsUrl|GoogleLiveDetails/.test(
        stripComments(read(path)),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("has no formatter for ratings, hours or price level", () => {
    const offenders = productionFiles.filter((path) =>
      /isRatingKnown|formatRatingCount|formatPriceLevel|formatOpenStatus|parseWeekdayHours/.test(
        stripComments(read(path)),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("confirms the catalog carries no Google rating or hours data to render", () => {
    for (const row of restaurantsFixture as Record<string, unknown>[]) {
      for (const key of ["rating", "rating_count", "price_level", "open_now", "weekday_hours"]) {
        expect(row).not.toHaveProperty(key);
      }
    }
  });
});

describe("why_fiyu is never rendered", () => {
  it("is absent from the API payload", () => {
    for (const row of restaurantsFixture as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty("why_fiyu");
    }
  });

  it("is referenced nowhere in production code", () => {
    const offenders = productionFiles.filter((path) => /why_fiyu/.test(stripComments(read(path))));
    expect(offenders).toEqual([]);
  });
});

describe("no client-side translation of restaurant data", () => {
  it("has no i18n or glossary module", () => {
    expect(files.filter((p) => /[\\/](i18n|glossary|translations?)[\\/.]/i.test(p))).toEqual([]);
  });

  it("declares no translation or romanization dependency", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /translat|deepl|romaji|kuroshiro|wanakana/i.test(n))).toEqual([]);
  });

  it("contains no Japanese-to-Latin substitution table", () => {
    const japaneseKeyedMap = /["'\s][ぁ-んァ-ヴ一-鿿]+["']?\s*:\s*["'][A-Za-z]/u;
    const offenders = productionFiles.filter((path) => japaneseKeyedMap.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("no fabricated social proof", () => {
  it("ships no hard-coded engagement numbers in production components", () => {
    // Catches copy like "1,240 saves" or "3.2k views".
    const fabricated =
      /\b\d[\d,.]*\s*(saves?|visits?|views?|likes?|followers?|reviews?|people|users?)\b/i;
    const offenders = productionFiles.filter((path) => fabricated.test(stripComments(read(path))));
    expect(offenders).toEqual([]);
  });

  it("uses no popularity or trending claims about users", () => {
    const offenders = productionFiles.filter((path) =>
      /popular with users|trending now|most visited|everyone.s favou?rite/i.test(
        stripComments(read(path)),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("confirms the backend reports no community activity to display", () => {
    for (const row of restaurantsFixture) {
      expect(row.community_recommendation_count).toBe(0);
      expect(row.community_stats_visible).toBe(false);
    }
  });
});

describe("distance policy cannot be bypassed", () => {
  /**
   * haversineMeters measures; it does not decide whether the result may be
   * shown. That judgement lives in restaurantDistance (lib/location/anchor.ts),
   * which consults the backend's distance_sort_eligible so a chome anchor is
   * never presented as a door-to-door figure.
   *
   * A component calling haversineMeters directly would skip that check, so the
   * rule is enforced here rather than left to prose. If you need a distance,
   * call restaurantDistance.
   */
  it("computes haversine distance only in the two modules that own it", () => {
    const allowed = [join("lib", "geo", "distance.ts"), join("lib", "location", "anchor.ts")];
    const offenders = productionFiles.filter((path) => {
      if (allowed.some((suffix) => path.endsWith(suffix))) return false;
      return /haversineMeters/.test(stripComments(read(path)));
    });
    expect(offenders).toEqual([]);
  });

  /**
   * A future distance-ranking mode must filter on distance_sort_eligible. Until
   * one exists, this pins that no component sorts by distance behind the scenes.
   */
  it("ships no distance-based sort outside the ranking module", () => {
    const offenders = productionFiles.filter((path) => {
      if (path.endsWith(join("lib", "discovery", "ranking.ts"))) return false;
      return /\.sort\(\s*\([^)]*\)\s*=>[^;]*(distance|meters)/i.test(stripComments(read(path)));
    });
    expect(offenders).toEqual([]);
  });
});

describe("SVG geometry is deterministic across engines", () => {
  /**
   * Math.log and Math.tan are implementation-defined (ECMAScript §21.3.2), and
   * project() amplifies a 1-ULP difference ~209x through catastrophic
   * cancellation. A raw projected float written into an SVG attribute therefore
   * renders differently on the server and the client, which React reports as a
   * hydration mismatch.
   *
   * Every map component must route numbers through svgNumber/roundPoint, or
   * receive them already rounded. See svgNumber() in lib/map/projection.ts.
   */
  it("divides by scale only through a rounding helper in map components", () => {
    const mapFiles = productionFiles.filter((path) => {
      const unix = path.split(sep).join("/");
      return unix.includes("/components/map/") || unix.includes("/lib/map/");
    });
    expect(mapFiles.length).toBeGreaterThan(0);

    const offenders = mapFiles.filter((path) => {
      const source = stripComments(read(path));
      // An unwrapped `value / scale` arrow body, e.g. `(v) => v / scale`.
      return /=>\s*\w+\s*\/\s*scale\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("builds the content transform only through transformFor", () => {
    const offenders = productionFiles.filter((path) => {
      if (path.endsWith(join("lib", "map", "viewport.ts"))) return false;
      return /translate\(\$\{/.test(stripComments(read(path)));
    });
    expect(offenders).toEqual([]);
  });
});
