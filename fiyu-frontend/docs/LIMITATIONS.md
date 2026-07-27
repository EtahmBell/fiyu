# Backend limitations affecting the Fiyu frontend

Verified against `fiyu-backend` at commit `41e3863` (API version `0.1.0`) by
reading `src/fiyu/api.py`, `src/fiyu/public_catalog.py`,
`src/fiyu/public_score.py` and `src/fiyu/google_places.py`, and by probing the
running backend on `http://127.0.0.1:8000`.

No backend file was modified.

## 1. There is no popularity data in the catalog

The list and detail payloads contain no rating, review count, popularity rank,
price level or view count.

- `PublicRestaurantSummary` (`api.py:57-72`) has 15 fields, none of them a
  popularity signal.
- The internal `restaurants` table *does* hold `rating` and `review_count`, but
  `_safe_public_rows` (`public_catalog.py:392-423`) selects a fixed 15-column
  whitelist that excludes them, and `tests/test_public_api.py:63-67` asserts
  that internal fields stay out.
- Google `rating` / `rating_count` are available **only** from
  `/public/restaurants/{place_id}/live-details`, which costs one billed,
  uncached Google Places call per restaurant.

**Consequence.** The "Hidden Gems → Popular Favorites" control described in
`CLAUDE.md` cannot be backed by real popularity data. The shipped control is
therefore labelled **Hidden Gems → Broadly Visible** and ranks on
`local_language_web_signal` (Japanese-language web presence, a proxy for
under-exposure) with `fiyu_score` as a tiebreaker. The UI states this openly.

No popularity metric is invented, and live-details is never fanned out across
the list. The ranking sits behind an adapter interface whose `popularity()`
returns `null` today, so a real signal is a one-file swap. See
[BACKEND-REQUESTS.md](./BACKEND-REQUESTS.md).

## 2. The clean area name is not publicly reachable

`neighborhood` is a chōme address fragment ("3 Chome Hamadayama", "1 Chome Kanda
Sakumacho") — roughly one distinct value per restaurant, which makes a poor
facet.

The usable ward name lives in `restaurants.search_area`, but the only endpoint
exposing it (`GET /areas`) also returns `internal_fiyu_score` averages, so it is
an internal endpoint and off-limits per `CLAUDE.md`.

**Consequence.** Ward is derived client-side from `latitude`/`longitude` using a
documented static bounding-box table (Phase 6, `src/lib/geo/wards.ts`). Boxes are
rectangular approximations, not official polygons; restaurants outside every box
fall into "Other Tokyo". The raw `neighborhood` string is still displayed
verbatim.

## 3. `primary_category` is unnormalised free text

16 distinct values across 22 published rows, including slash-composites
(`Izakaya / standing bar`, `Cafe / Japanese restaurant`), near-duplicates
(`Izakaya restaurant` vs `居酒屋`) and one Japanese-only value.

**Consequence.** No hardcoded cuisine enum. Facets are derived and normalised at
runtime, and unrecognised values pass through verbatim rather than being
dropped.

## 4. No caching and no rate limiting anywhere in the backend

Every list request re-opens SQLite; every live-details request makes a fresh
outbound Google call with a 10-second upstream timeout and no server-side cache.

**Consequence.** Caching is the frontend's responsibility. The catalog is fetched
server-side with a 300-second revalidation window
(`CATALOG_REVALIDATE_SECONDS`). Live details are never cached server-side
(`revalidate: 0`) because `open_now` is point-in-time; client-side
deduplication and session caching are added with the detail sheet in Phase 5.

## 5. No pagination

`GET /public/restaurants` accepts only `limit` (`ge=1, le=200`, default 100).
There is no `offset`, no server-side filter, and no sort parameter — results are
always `ORDER BY fiyu_score DESC`.

**Consequence.** Fine at today's 22 published rows: one fetch, then all
filtering and ranking client-side. This design breaks above 200 rows and will
need backend pagination before then.

## 6. The detail endpoint returns nothing extra

`PublicRestaurantDetail` is `pass` over `PublicRestaurantSummary` — the same 15
fields. Only live-details adds new information.

## 7. Published does not imply a good score band

Three of 22 published restaurants are in the `not_recommended` band, pinned to
54.99 by the chain and low-evidence caps in `public_score.py`. Publication is a
manual operator action (`python -m fiyu.public_cli publish`).

**Consequence.** The band chip is suppressed for `not_recommended` rather than
rendering "Not recommended" over a restaurant the operator deliberately
featured. The numeric score and confidence are still shown in full. See
`src/lib/format/score.ts`.

## 8. Mixed ja/en content with no language marker

`why_fiyu`, `food_tags`, `signature_dishes` and `primary_category` are Japanese
for some rows and English for others, within the same response. No per-field
language field exists.

Measured against the live catalog (19 browsable restaurants):

| Field | Japanese |
| --- | --- |
| `why_fiyu` | 13 of 19 |
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
`src/test/no-client-translation.test.ts` is a structural guard against it
returning; `src/components/restaurant/RestaurantCard.test.tsx` asserts
byte-for-byte rendering.

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

## 9. Missing Google values are coerced to zero, not null

`google_places.py:101-113` normalises absent Google fields to `""`, `0.0` and
`0`. So `rating: 0` and `rating_count: 0` mean *unknown*, not *zero reviews*.

**Consequence.** `isRatingKnown()` in `src/lib/format/google.ts` must be used
instead of truthiness checks, or the UI would display a fabricated "0.0" rating.

## 10. The OpenAPI document is incomplete

The spec documents only `200` and `422` for all three routes, but the handlers
also emit `404`, `502`, `503` and `504`. Client generation from the spec would
silently miss every error path.

**Consequence.** Schemas and error mapping are hand-written
(`src/lib/api/schemas.ts`, `src/lib/api/errors.ts`) and validated against
captured real responses in `src/test/fixtures/`.

## 11. `503` means two different things

On catalog routes it means the SQLite file is missing; on live-details it means
`GOOGLE_PLACES_SERVER_KEY` is unset. The bodies differ only in free-text
`detail`.

**Consequence.** The error mapper disambiguates by which endpoint was called
(`backend-unavailable` vs `provider-unconfigured`), because the two need very
different user-facing copy — one is retryable, the other is not.

## 12. CORS is restricted to port 3000

`allow_origins` defaults to `http://localhost:3000` and `http://127.0.0.1:3000`,
`allow_methods=["GET"]`, `allow_credentials=False`.

**Consequence.** The dev server must run on port 3000. The catalog fetch happens
in a Server Component so it bypasses CORS entirely, but the browser-side
live-details call in Phase 5 will depend on this origin allowance.
