# Proposed backend changes

Two proposals. Both are **proposal only** — no backend code has been written or
modified. `CLAUDE.md` requires approval before backend changes, and both need a
schema change.

---

# 1. English `why_fiyu` for an English-speaking audience

> **Superseded — the backend now owns localization.** The frontend renders all
> restaurant content verbatim and no longer translates anything client-side.
> Retained for the measurements and the prompt guidance, which still apply to
> whatever the backend generates.

## Problem

Fiyu's users are primarily English-speaking, but **13 of 19 browsable
restaurants have a Japanese `why_fiyu`** (~1,660 characters in total). That
field is the editorial explanation — the thing that makes a card worth reading —
so for most restaurants the most valuable content is unreadable to the target
audience.

The research worker (`src/fiyu/research_worker.py`) already generates this field
with an LLM. `RestaurantResearch` places no language constraint on `why_fiyu`,
`food_tags` or `signature_dishes`, so the model emits whatever language its
sources were in. Hence the mix.

## What ships today

Nothing is translated in the frontend. All restaurant content — tags, signature
dishes, categories and `why_fiyu` — renders exactly as the API returns it, in
whatever language the backend supplies.

An earlier curated glossary covering tags and dishes was removed so that
localization has a single owner. Any English the user sees must therefore come
from the backend.

## Proposed change

Have the research worker emit English alongside the original:

```python
class RestaurantResearch(BaseModel):
    ...
    why_fiyu: str = Field(min_length=1, max_length=600)
    why_fiyu_en: str = Field(min_length=1, max_length=600)
```

with a matching `why_fiyu_en` column on `public_restaurants` and on
`PublicRestaurantSummary`.

### Why at research time rather than at request time

- **Generated once, cached forever.** One extra field on a call the worker
  already makes, versus a translation API call on every page view.
- **Reviewable.** The English is stored, so an operator can read and correct it,
  exactly as they can today with the Japanese.
- **Higher quality than machine translation.** The model already holds the
  source evidence, so it writes English prose rather than translating Japanese
  word-by-word. General-purpose MT is measurably poor on this vocabulary —
  `おまかせ` becomes "leave it to you", `鳥割烹` becomes "bird cooking".
- **No new provider, no new key, no per-view cost.**

### Prompt guidance to match the shipped frontend style

Keep Japanese culinary terms romanized rather than translated, since these are
the words an English-speaking diner recognises and searches for: *omakase*, not
"chef's selection"; *izakaya*, not "Japanese pub"; *yakitori*, not "grilled
chicken skewers". Add a short parenthetical gloss on first use for terms outside
common English usage.

### Scope

- Nullable, so rows researched before the change keep working; the frontend
  falls back to the Japanese `why_fiyu` when `why_fiyu_en` is absent.
- Re-running research on the 22 published rows is one batch job.
- No change to the three endpoints the frontend already calls.

### Tags and dishes

With the glossary removed, `food_tags`, `signature_dishes` and
`primary_category` display in whatever language the backend stores. If those
should read as English, they need the same treatment as `why_fiyu` — the
frontend will not substitute anything.

---

# 2. A truthful popularity axis

## Problem

`CLAUDE.md` specifies a "Hidden Gems to Popular Favorites" discovery control.
The public catalog exposes no popularity signal of any kind — no rating, no
review count, no rank. See [LIMITATIONS.md §1](./LIMITATIONS.md).

The only popularity data reachable over HTTP is Google `rating` /
`rating_count` on `/public/restaurants/{place_id}/live-details`, which is one
billed, uncached Google Places call per restaurant. Using it for the catalog
would mean 22 calls today and N calls at any future scale, on every page load —
exactly what `CLAUDE.md` prohibits ("Do not call Google live details for every
card during initial page load").

## What ships today instead

The control is labelled **Hidden Gems → Broadly Visible** and ranks on
`local_language_web_signal`, with `fiyu_score` as a tiebreaker. The UI discloses
that popularity data is unavailable. Nothing is invented.

The ranking sits behind an adapter (`src/lib/discovery/ranking.ts`):

```ts
interface DiscoveryRankingAdapter {
  readonly popularityAvailable: boolean   // false today
  hiddenness(r: Restaurant): number | null
  popularity(r: Restaurant): number | null  // returns null today
  rank(rs: Restaurant[], t: number): Restaurant[]
}
```

Once the fields below exist, enabling a real popularity axis is a single new
adapter implementation. No component changes.

## Proposed change

Add three cached columns to the public catalog payload:

```python
class PublicRestaurantSummary(BaseModel):
    ...
    google_rating: float | None = None
    google_rating_count: int | None = None
    google_refreshed_at: datetime | None = None
```

Backed by columns on `public_restaurants`, populated by a **scheduled CLI
refresh**, not by a per-request call:

```bash
python -m fiyu.public_cli --db PATH refresh-google --max-age-days 7
```

### Why this shape

- **One Google call per restaurant per refresh window**, not per page view.
  At 22 published rows on a weekly cadence that is ~22 calls/week.
- **`google_refreshed_at` keeps it honest.** The frontend can label the data
  "as of 3 days ago" rather than implying it is live. Fresh, live values remain
  available on the detail view via the existing live-details endpoint.
- **Nullable.** A restaurant that has never been refreshed simply has no
  popularity value, and the adapter falls back to the hiddenness-only ranking
  for it.
- **No new endpoint,** no change to the three routes the frontend already uses,
  and no change to the internal/public separation — these are Google's public
  numbers, not internal Fiyu scoring.

### Google Terms of Service

Caching Places data is subject to Google's caching and attribution rules, which
generally permit limited caching of place data alongside required attribution.
This needs confirming against Google's current Places API terms before
implementation. That check is a prerequisite, not an afterthought.

## Smaller alternative

If caching is unacceptable, expose the **internal** `restaurants.review_count`
that already exists in the database. It is stale Apify scrape data rather than
live Google data, so it would need to be labelled as an approximate exposure
level rather than a live review count — but it requires no new Google calls and
no new refresh job.

## Not recommended

Fanning out live-details across the catalog from the client, even behind an
explicit "load popularity" button. It contradicts `CLAUDE.md`, scales linearly
with catalog size, and puts uncached billed calls behind a UI affordance users
can repeat at will.
