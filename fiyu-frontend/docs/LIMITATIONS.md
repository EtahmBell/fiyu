# Backend limitations affecting the Fiyu frontend

Verified against `fiyu-backend` at commit `7547615` (API version `0.1.0`) by
reading `src/fiyu/api.py`, `src/fiyu/public_catalog.py`,
`src/fiyu/public_score.py`, `src/fiyu/address_geocoding.py` and
`src/fiyu/google_places.py`, and by probing the running backend on
`http://127.0.0.1:8000`.

No backend file was modified.

## 1. There is no popularity data in the catalog

The list and detail payloads contain no rating, review count, popularity rank,
price level or view count.

- `PublicRestaurantSummary` (`api.py:56-95`) has 39 fields, none of them a
  popularity signal.
- The internal `restaurants` table *does* hold `rating` and `review_count`, but
  `_safe_public_rows` (`public_catalog.py:813-855`) selects a fixed column
  whitelist that excludes them, and `tests/test_public_api.py` asserts that
  internal fields stay out.

**Consequence.** The "Hidden Gems → Popular Favorites" control described in
`CLAUDE.md` cannot be backed by real popularity data, and no popularity metric is
invented.

The two-pole slider that once stood in for it has been **removed**, not merely
relabelled. It ranked on `local_language_web_signal`, which the backend no longer
returns; with no second axis there is nothing to interpolate between. The shipped
control is a two-mode switch (Local / Trending), where Trending is marked
unavailable rather than approximated from `fiyu_score`. Ranking sits behind an
adapter whose `popularity()` returns `null`, so a real signal is a one-file swap.
See `src/lib/discovery/ranking.ts` and
[BACKEND-REQUESTS.md](./BACKEND-REQUESTS.md).

## 2. The clean area name is not publicly reachable

`neighborhood` is a chōme address fragment ("3 Chome Hamadayama", "1 Chome Kanda
Sakumacho") — roughly one distinct value per restaurant, which makes a poor
facet.

The usable ward name lives in `restaurants.search_area`, but the only endpoint
exposing it (`GET /areas`) also returns `internal_fiyu_score` averages, so it is
an internal endpoint and off-limits per `CLAUDE.md`.

**Consequence.** There is currently **no area or ward facet**, and no
client-side ward derivation. An earlier revision of this document described a
static bounding-box table at `src/lib/geo/wards.ts`; that file was never built.
The raw `neighborhood` string is displayed verbatim and nothing is faceted on it.

The payload does now carry `discovery_area` and `discovery_area_type` (usually a
ward name, from the editorial source CSV), which is a better basis for a facet
than a bounding box would have been. It is validated and available but not yet
surfaced in the UI.

## 3. `primary_category` is unnormalised free text

16 distinct values across 22 published rows, including slash-composites
(`Izakaya / standing bar`, `Cafe / Japanese restaurant`), near-duplicates
(`Izakaya restaurant` vs `居酒屋`) and one Japanese-only value.

**Consequence.** No hardcoded cuisine enum. Facets are derived and normalised at
runtime, and unrecognised values pass through verbatim rather than being
dropped.

## 4. No caching and no rate limiting anywhere in the backend

Every list request re-opens SQLite. There is no server-side cache and no rate
limiting.

**Consequence.** Caching is the frontend's responsibility, and for the catalog the
right amount is **none**: `CATALOG_REVALIDATE_SECONDS` is `0`.

Publishing and geocoding are manual operator actions, so any fixed window is a
guess against an unpredictable human-triggered write — and the cost of guessing
wrong is an operator staring at a page that does not yet show the change they just
made. This previously sat at 300 s, which is exactly how long a newly published
restaurant could stay invisible. Photos (900 s) and location anchors (3600 s) are
still cached; neither is publish-sensitive.

Consequently `/` renders dynamically, reported as `ƒ` rather than `○` by
`next build`. That does not weaken the "build succeeds with the backend offline"
property — it removes the build-time fetch that could fail.

The right end state is caching indefinitely and invalidating precisely on
publish. `next: { tags: ["catalog"] }` is already attached to the catalog and
detail fetches as groundwork; what remains is a `revalidateTag("catalog")` route
and a call to it from `python -m fiyu.public_cli publish`. That spans both repos,
so it is tracked separately.

Note for local verification: Next's `serverComponentsHmrCache` caches fetches
across hot reloads even with caching disabled. Navigate or hard-reload before
concluding that a change has not taken effect.

## 5. No pagination

`GET /public/restaurants` accepts only `limit` (`ge=1, le=200`, default 100).
There is no `offset`, no server-side filter, and no sort parameter — results are
always `ORDER BY fiyu_score DESC`.

**Consequence.** Fine at today's 22 published rows: one fetch, then all
filtering and ranking client-side. This design breaks above 200 rows and will
need backend pagination before then.

## 6. The detail endpoint returns nothing extra

`PublicRestaurantDetail` is `pass` over `PublicRestaurantSummary` — the same 39
fields. Prefer reusing already-fetched list data.

There is **no** `live-details` route. The backend removed it, and
`tests/test_public_api.py` asserts it returns 404. Google ratings, review counts,
opening hours and price level are therefore not available anywhere, and are not
shown. Earlier revisions of this document described caching and error-handling
behaviour for that route; it is gone.

## 7. Published does not imply a good score band

Three of 22 published restaurants are in the `not_recommended` band, pinned to
54.99 by the chain and low-evidence caps in `public_score.py`. Publication is a
manual operator action (`python -m fiyu.public_cli publish`).

**Consequence, in two parts.**

The band chip is suppressed for `not_recommended` rather than rendering "Not
recommended" over a restaurant the operator deliberately featured. The numeric
score and confidence are still shown in full. See `src/lib/format/score.ts`.

Separately, `src/lib/discovery/filters.ts` withholds the band from the browsable
catalog entirely (`WITHHELD_SCORE_BANDS`). This is an explicit editorial decision,
retained after review. It has a visible cost worth stating plainly: one of the
five restaurants the backend has cleared for the map —
`牛たんの檸檬 秋葉原店` — is map-eligible with verified chōme coordinates but is
withheld, so the map shows **four** pins rather than five. Removing the filter is
a one-line change and no other code assumes the exclusion.

## 8. Mixed ja/en content with no language marker

`description_en`, `food_tags`, `signature_dishes` and `category` are Japanese for
some rows and English for others, within the same response. No per-field language
field exists. (`why_fiyu` was renamed `description_en` in the public payload; the
field is still frequently Japanese despite the name.)

Measured against the live catalog (19 browsable restaurants):

| Field | Japanese |
| --- | --- |
| `description_en` | 13 of 19 |
| `signature_dishes` | 47 of 70 distinct |
| `food_tags` | 27 of 80 distinct |
| `primary_category` | 1 of 14 distinct |
| `name_en` | 0 missing |

**Consequence. Localization is owned by the backend.** The frontend performs no
translation, romanization, glossing or relabelling of restaurant content. Every
API string — `food_tags`, `signature_dishes`, `primary_category`,
`neighborhood`, `why_fiyu`, both name fields — is rendered exactly as returned.
`江戸前寿司`, `おまかせ`, `鮑` and `沖縄そば` display verbatim.

A client-side glossary was tried and removed. It has not been kept as a
fallback, because a partial local translation layer competing with backend
localization produces inconsistent output and hides gaps in the source data.
`src/test/removals.test.ts` is a structural guard against it returning;
`src/components/restaurant/RestaurantCard.test.tsx` asserts byte-for-byte
rendering.

Two things are deliberately retained, neither of which alters content:

- **Script detection** (`detectTextLang` in `src/lib/format/language.ts`) picks
  a `lang` attribute so Japanese gets correct font selection, kinsoku line
  breaking and screen-reader voice. It returns only `"ja"` or `"en"` and never
  touches the string.
- **Name pairing** (`resolveNames`) chooses which name is the heading —
  `name_ja` when present, otherwise `name_en` — and suppresses the second line
  when both values are identical. It selects between API values; it does not
  generate one.

A user-facing language toggle remains impossible from this data: there is no
per-field language marker to switch on.

## 8a. Location precision and approximate coordinates

The most consequential section in this document. A frontend allow-list over
`location_precision` once silently hid three of five verified pins.

**Today's data.** 5 of 22 published restaurants are map-eligible. Of those, 2 are
precisely located and 3 are chōme anchors. 4 are rendered — see §7 for the fifth.

| Restaurant | `location_precision` | `map_location_approximate` |
| --- | --- | --- |
| 金すし | `exact` | false |
| あたらよ 秋葉原店 | `parcel_or_street_number` | false |
| 浜田山叙々苑 | `chome` | true |
| 江戸酒場 海 | `chome` | true |
| 牛たんの檸檬 秋葉原店 | `chome` | true |

**`map_display_eligible` is the only plotting contract.** The backend nulls
`latitude` and `longitude` whenever it is false (`public_catalog.py:903-911`), so
an unverified restaurant cannot carry a plottable position. `isMappable()` gates
on that plus finite, in-range coordinates, and nothing else.

**`location_precision` is not enumerable from the frontend, and must never gate
rendering.** The backend serves `COALESCE(map_location_precision,
location_precision)` over a vocabulary of at least nine values maintained across
three modules: `address_geocoding.py:23-40` (`exact_entrance`, `building`,
`parcel_or_street_number`, `block`, `chome`, `neighborhood`, `ward`, `unknown`), a
separate legacy `ACCEPTED_PRECISIONS` at `address_geocoding.py:22`, and a third
`Literal` list at `address_research.py:198-201`. The column's own `CHECK`
constraint (`public_catalog.py:68-69`) lists only three values and is already out
of step with what is served. Treat the field as an informational label.

**The four fields to gate on instead**, all derived by the backend at
`public_catalog.py:866-882`:

| Field | Meaning |
| --- | --- |
| `map_location_approximate` | The coordinate is an area anchor, not a door. |
| `location_label` | Disclosure wording, currently `"Approximate area"`. |
| `distance_sort_eligible` | Safe to measure and rank by distance. |
| `directions_coordinates_eligible` | Safe to hand to a maps app as a point. |

The last two are both `eligible && !map_location_approximate`.

**Rules the frontend follows.**

- `location_label` is rendered **verbatim** and never paraphrased — the same rule
  as `LocationAnchor.qualifier`.
- Approximate pins differ in **form**, not only colour: a dashed ring with a
  translucent wash and no solid centre, since the solid centre is what makes an
  exact pin read as "the door is here".
- Distance to an approximate coordinate is bucketed to 100 m and hedged. A chōme
  anchor is nominal to roughly 100–400 m, so "About 340 m" would overclaim by an
  order of magnitude on exactly the quantity the hedge discloses.
- Directions for an approximate restaurant are built from
  `external_map_search_query` (the verified written address) and **never** from
  its coordinates. There is no coordinate fallback: with neither a cleared point
  nor an address, no link is offered.
- `isApproximateLocation()` is an OR of three independent signals
  (`map_location_approximate`, `location_label`, `map_anchor_type`) so a partial
  response errs toward more disclosure, never less.

See `src/lib/geo/precision.ts`, `src/lib/geo/mappable.ts` and
`src/lib/outbound/mapLinks.ts`.

## 8b. Rendered SVG geometry must be rounded

Not a backend limitation, but a cross-cutting constraint that is easy to violate.

`Math.log` and `Math.tan` are implementation-defined in ECMAScript (§21.3.2), so
Node and the browser can differ by about 1 ULP. `project()` amplifies that roughly
209× through catastrophic cancellation in `NORTH_Y - mercatorY(lat)`. React
compares attributes as strings, so a raw projected float is a hydration mismatch:

```
server (Node)    y = 511.42999798943185
client (browser) y = 511.4299979894495
```

Every number written into an SVG attribute goes through `svgNumber` (2 dp) or
`roundScale` (6 dp, for the scale factor). `project()` and `unproject()` stay
bit-exact, because pin placement round-trips through them. Structural guards in
`src/test/removals.test.ts` and a rendered-attribute test in
`src/lib/map/determinism.test.tsx` keep this from regressing.

## 8d. The base map is generated OSM data, not a tile service

The illustrated geography — roads, rail, stations, parks, water, ward outlines — is
extracted offline from a Kanto OpenStreetMap extract and committed as static JSON
under `src/lib/map/generated/`. See the README there for the regeneration command
and the per-layer OSM selectors.

**What this deliberately is not.** No Google tiles, no Google-derived geometry, no
runtime third-party tile requests, and no network fetch for base-map data at all.
The browser never parses a PBF.

**Consequences worth knowing.**

- The geography is **simplified**, per-layer, with Ramer–Douglas–Peucker. It is an
  orientation aid and is stated as such in the map key. It must not be used to
  judge whether a restaurant is on a particular side of a street.
- The base map is a **client-side payload**, because `FiyuMap` is a client
  component. That is the binding constraint on how much detail can be added: every
  new layer is bytes shipped to every visitor. Sizes are reported in the README.
- Coverage is **only the Fiyu extent** (139.56–139.92 E, 35.52–35.82 N). Anything
  beyond it is clipped at generation time and cannot be shown, which is also why
  §8c exists.
- Detail is **bucketed into three levels**, not continuous. Secondary roads and
  subway lines appear at level 2. This is a performance requirement, not a styling
  choice — see `src/lib/map/detail.ts`.
- The one hand-drawn shape is the **Tokyo Bay fill** in `basemap.ts`. OSM models the
  open bay as coastline rather than a closed polygon, so a filled bay has to be
  closed against the map edge by hand. It is stylised, and labelled as such.
- Station **positions and names** are OSM's. Which stations get a label, and at what
  zoom, is editorial (`src/lib/map/landmarks.ts`). Landmark positions are OSM
  coordinates; the selection of eight and their glyphs are editorial.

**ODbL attribution is a licence obligation.** It is rendered in the map key from
`OSM_ATTRIBUTION`. Do not remove it from the UI.

## 8c. Coordinates outside the illustrated area

`TOKYO_BOUNDS` covers the 23 special wards. All five current coordinates are
inside it.

A coordinate outside it does not merely clip: it widens `fitToPoints`' bounding
box, dragging the scale toward `MIN_SCALE` and pushing every legitimate pin into a
corner, while `clampTranslate` makes the offender unreachable at `k = 1`. One bad
row would degrade the map for the whole catalog.

**Consequence.** `FiyuMap` filters with `isWithinBounds` before projecting, and
`DiscoveryShell` discloses the count ("N outside the mapped area"). Such rows are
not hidden from the list — they have verified coordinates and belong there; only
the illustration cannot show them.

## 9. Missing Google values are coerced to zero, not null

`google_places.py` normalises absent Google fields to `""`, `0.0` and `0`, so
`rating: 0` and `rating_count: 0` mean *unknown*, not *zero reviews*.

**Consequence: none, currently.** No Google rating, review count, price level or
opening hours reaches the frontend at all, because the `live-details` route that
carried them no longer exists (§6). There is no `src/lib/format/google.ts` — an
earlier revision of this document described an `isRatingKnown()` helper there, and
neither the file nor the need for it survived. Recorded because the coercion is a
live trap for anyone who re-exposes those fields later: guard on explicit
presence, never on truthiness.

## 10. The OpenAPI document is incomplete

The spec documents only `200` and `422`, but the handlers also emit `404`, `502`,
`503` and `504`. Client generation from the spec would silently miss every error
path.

**Consequence.** Schemas and error mapping are hand-written
(`src/lib/api/schemas.ts`, `src/lib/api/errors.ts`) and validated against
captured real responses in `src/test/fixtures/`.

## 11. `503` means two different things

On catalog routes it means the SQLite file is missing; on the photo routes it
means `GOOGLE_PLACES_SERVER_KEY` is unset. The bodies differ only in free-text
`detail`.

**Consequence.** The error mapper disambiguates by which endpoint was called
(`backend-unavailable` vs `provider-unconfigured`), because the two need very
different user-facing copy — one is retryable, the other is not.

## 12. CORS is restricted to port 3000

`allow_origins` defaults to `http://localhost:3000` and `http://127.0.0.1:3000`,
`allow_methods=["GET"]`, `allow_credentials=False`.

**Consequence.** The dev server must run on port 3000. The catalog fetch happens
in a Server Component so it bypasses CORS entirely, but any future browser-side
call to the backend will depend on this origin allowance.
