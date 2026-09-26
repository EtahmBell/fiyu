# Pick reveal interaction pass

## Architecture and persistence

DailyPicksPanel owns persistent card-by-card reveal state. The existing
revealDailyPicks(roundId, placeId, identity) API persists revealed IDs and per-Pick
timestamps in round metadata; the aggregate round timestamp appears when all
Picks are revealed. Existing storage/cache hydration restores those IDs, and
Recent Discoveries uses the existing 72-hour lifecycle. No backend changes.

Previously the frontend revealed optimistically and rolled back an entire old
snapshot on error. It now waits for API success before committing the latest
storage snapshot and publishing the existing discovery/map event. This avoids a
failed request overwriting earlier successes. Local/injected storage retains its
existing synchronous persistence path. Selection, cooldown, discovery timestamp
inputs, rankings, budget slots, score values and all generation rules are unchanged.

Reveal all calls this same per-card function sequentially, adding 150ms between
successful reveals (not in reduced motion). It skips revealed/visited cards,
locks duplicate activation, stops on failure, retains successful cards and allows
retry of the remainder. Navigation/account-storage changes cancel subsequent
work. The header retains a disabled 'All Picks revealed' state to avoid moving
the cards when the action finishes.

## Presentation

ConcealedRestaurantCard owns only transient motion. A 500ms CSS rotateY flip uses
perspective, preserve-3d and hidden backfaces, with a 3px lift and brief lavender
edge/sheen. The concealed face uses existing paper/lavender tokens and Fiyu type;
it contains no restaurant identity or score-derived styling. Front content only
mounts after persistence succeeds. The front is inert during motion, preventing
accidental navigation. Keyboard activation moves focus to View restaurant on
settle. Already-revealed mounts/rerenders do not replay the flip or sheen.

The canonical final score helper uses raw score >=90, equivalent to >=9.0 on
the displayed scale; 89.99 does not qualify even if display rounding says 9.0.
Qualifying reveals use a 5px lift and existing brass/gold sheen. Only a thin warm
edge remains afterward. Score transparency and existing ScoreMark stay unchanged.

Both faces share a fixed 17rem mobile / 21rem desktop footprint. Expanded or
oversized copy can scroll inside the front without moving adjacent Picks. No
animation of layout dimensions or per-frame React work. Reduced motion removes
3D transforms, sheen, lift and sequencing delay; the static warm edge remains.

## Validation

- Full frontend suite: 1001 tests across 89 files passed.
- Focused Picks/discovery suite: 116 tests across 10 files passed.
- Final TypeScript, ESLint, production build (26 routes) and git diff checks passed.
- Coverage: request success/failure, no premature front, duplicate requests,
  partial success/retry, mixed reveal state, 150ms stagger, reduced motion,
  restoration/no replay, unmount, threshold boundaries, inert front, focus,
  unchanged round timestamps and existing discovery/map integration.
- Browser QA used an isolated temporary route with the actual DailyPicksPanel,
  dedicated test storage and scores 8.9, 9.0 and 9.5. Verified 390x664, 390x844,
  430x932 and 1280x900: real intermediate 3D matrices, staggered cards, static
  gold resting edges, no reload replay, detail callback, Enter/Space activation,
  focus handoff, stable card coordinates and no horizontal overflow. Photos
  were unavailable in the fixture. Temporary route removed after testing.
- Reduced motion is covered by automated media-query tests and scoped CSS;
  browser tooling did not offer OS preference emulation. Physical iOS/Android
  rendering, VoiceOver/TalkBack and a signed-in production smoke test remain.

## Changed surfaces

Frontend production: ConcealedRestaurantCard.tsx, new PickReveal.module.css,
DailyPicksPanel.tsx. Tests: ConcealedRestaurantCard.test.tsx, new
DailyPicksReveal.test.tsx, DailyPicksPanel.test.tsx and
DiscoveryShellDailyOnly.test.tsx. This report is the only backend-repository
change. No dependency, schema, score, Map, Together or detail-content changes.
