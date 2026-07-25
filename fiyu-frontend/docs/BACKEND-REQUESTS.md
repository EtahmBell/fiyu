# Proposed backend change: a truthful popularity axis

**Status:** proposal only. No backend code has been written or modified.
`CLAUDE.md` requires approval before backend changes, and this needs a schema
change, which requires explicit sign-off.

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
