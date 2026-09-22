# Fiyu Score transparency audit

This is a read-only explanation of the existing model, not a scoring change.

## Current model: public-v3-local-discovery

The API stores 0–100; ScoreMark displays score / 10 to one decimal. The source of
truth remains public_restaurants.fiyu_score. This feature never recomputes it.

The final clamped weighted sum is 45% quality_signal + 15% hiddenness_signal +
15% independence_signal + 25% local_discovery_score. Components overlap; this is
not an average of four independent measurements. Excluded chains cap at 54.99;
ineligible non-venue products cap at 49.99. Restricted access is a publication
gate rather than a quality penalty. Final values are rounded to two decimals.
No separate additive bonus exists.

Quality is the internal candidate quality score: adjusted rating = n/(n+30) ×
rating + 30/(n+30) × area mean (global mean fallback), then clamp((adjusted−3.8)
×100). Internal defaults are configurable. Underexposure is 100 × (1−midrank
percentile of log1p(review count)) among area/category peers, falling back to area
then global peers when fewer than 15 exist. Digital footprint mappings are none
100, social-only 70, aggregator 55, independent website 10, other 25.

Hiddenness = 40% underexposure + 25% tourist-coverage mapping (low100/medium55/
high10/unknown50) + 15% clamp(100−30×reservation platforms) + 20% digital scarcity.
Digital scarcity = 60% candidate digital footprint + 25% website scarcity
(found20/not-found100) + 15% clamp(100−25×social profiles).

Independence = 70% chain-class mapping (single100/distinct-group75/same-brand20/
large-chain0/unknown70) + 20% location-count mapping (≤1:100,2:80,3:60,4:40,≥5:10)
+ 10% specialist mapping (yes100/no40). Unknown does NOT prove independence.

Local Discovery = 25% underexposure + 15% web scarcity + 15% international
obscurity + 15% local-audience orientation + 20% independence + 10% distinctiveness.
Its stored components are rounded before weighting. Web scarcity = 50% candidate
digital footprint + 20% website scarcity (found25/not-found90) + 15% clamp(100−25×
reservation platforms) + 10% clamp(100−20×social profiles) + 5% corporate scarcity
(low95/medium50/high5/unknown60).
International obscurity = 60% tourist orientation (low95/mixed50/high5/unknown60)
+ 25% international visibility (low95/medium50/high5/unknown60) + 15%
clamp(100−22×English tourist sources). Explicit tourist orientation without support
is neutral; legacy tourist coverage remains a fallback. Local audience is neutral
50 if unknown, otherwise 70% explicit finding (low20/mixed60/high100) + 15%
smoothed Japanese source share + 15% Japanese review share (unknown50).
Source share = (Japanese sources+1)/(Japanese+English tourist sources+2)×100.
Discovery independence uses single100/distinct-group82/same-brand20/large0/unknown70;
distinctiveness uses specialist85/otherwise50. Source language is not customer
nationality, residency, or verified localness.

The separate local_signal (55% smoothed source share + 25% official-language
mapping ja100/mixed70/en20/unknown50 + 20% Japanese review share) is stored but is
NOT an additional v3 term.

Research confidence = 40% identity confidence + 30% min(source-count/5,1) + 15%
review-language availability (known1/unknown0.25) + 15% consistency (conflict0/none1),
on a 0–100 scale. Bands: ≥80 high, ≥60 moderate, ≥40 low, otherwise very low.
It does not increase or cap v3 score. Low-footprint research routing is separate:
discovery≥70, score≥60, sparse evidence (<3 sources or confidence<55), eligible
product, no excluded chain. It does not itself add score points.

Current automated publication policy requires eligible product, score≥75, no
excluded chain, plus readiness (identity key, display name/category, completed
research, deterministic score). Manual publication additionally requires approval.
Source confidence/conflicts are diagnostics in the current automatic score policy,
not universal proof of verification. Location warnings are separate. Legacy/manual
published records may not meet today's automatic threshold.

## Internal candidate score (not the displayed score)

Defaults: 45% quality + 30% underexposure + 10% digital footprint + 10% confidence
+ 5% independence. Confidence = 80% log review coverage (soft cap100) + 20% field
completeness. Penalties: reviews<5 −18, else <10 −10; chain −20; rating<3.9
subtract min(20,(3.9−rating)×25). Clamp0–100, cap65 for <5 reviews /72 for <10.
Candidate eligibility defaults: rating≥3.9, reviews5–500, non-chain, score≥55.
Neither this internal score nor its penalties is exposed as the public score.

## Historical records and persisted evidence

Local catalog audit: 263 published records: 26 public-v1, 58 public-v2-chain-
classification, 179 public-v3-local-discovery. Existing scores range54.99–88.39;
there are no real 9+ examples in this local snapshot. No records were changed.

Git versions e9e865c and 75699eb document v1/v2: 30% local-language signal +30%
hiddenness +25% quality +15% independence. Quality combined80% internal quality
with20% positive-source coverage (saturates at3), capped60/72 for0/1 positive
sources. Sparse total sources<3 capped final69.99; unmatched identity capped50,
identity confidence<0.75 capped65; chain capped54.99. V1 used likely_chain;
v2 added chain classifications and conflict assessment. Historical publication
also required matched identity≥0.8, ≥2 sources, confidence≥55 and no blocking
conflict/chain. Today's arithmetic cannot be applied retroactively.

public_restaurants persists component values, model version, confidence, evidence
JSON and final score. Research runs retain structured facts and source URLs;
score-calculation runs retain score JSON and a fingerprint. Internal quality,
underexposure and footprint are stored in restaurants. Exact historical candidate
reconstruction also needs its peer population/config; therefore read stored
components, never run today's model on a detail request.

Description research is offline, source-grounded, separately accepted and explicitly
excludes score rationale. Card enrichment is separately persisted presentation copy.
Existing free-text why_fiyu is internal, not a safe public explanation contract.

## Transparency contract

Only detail responses gain a typed explanation. Cards link to detail without
fetching or carrying research. Signals are stored components divided by10, rounded
to one decimal, labelled as signals rather than an arithmetic reconstruction.
Known historical models show their legacy local-language component and a historical
notice; unknown versions omit numeric signals. Invalid/missing numbers are omitted,
not defaulted to zero. Confidence uses the existing stored band, never an invented
verification grade. All rationale is approved deterministic copy, not raw research.
Do not expose prompts, raw text, internal notes, source metadata, customer identity,
or unsupported longevity/size/guide/obscurity claims. No runtime model/network calls,
schema migration, re-enrichment, or backfill is needed.

## Read-only example audit

`python scripts/audit-score-transparency.py` checked all 263 published rows. The
before/after score + publication fingerprint was identical:
`a3fd7304c757eba5ddd2dc47fb62cace9234951b5654f0931ab3974ebdb6f96e`.
Reviewed examples: Hamadayama Jojoen (multiple locations, historical model; no
single-independent claim), Kodamaya Home Cooking (low exposure but conflicting
evidence flags; conservative numeric-quality rationale only), Suehiro Sushi
(258 reviews and English coverage; no obscurity claim), Karaoke Snack Utaiba Rumi
(one research source; broad independence/visibility claims suppressed), and Hong
Kong Room GOUKA (75.99, mixed visibility). No explicitly high-international-
visibility or 9+ published rows exist in this snapshot; automated synthetic cases
cover those boundaries. Research is not independently reverified by this feature.

## Validation and changed surfaces

Backend: 808 tests passed, including deterministic explanation, unchanged score,
invalid/missing values, exposure/chain contradictions, and API privacy tests.
Changed-file Ruff passed. Full Ruff reports 27 pre-existing findings outside the
changed files. Frontend: 991 tests across 88 files passed; focused card/detail/
methodology tests, TypeScript, ESLint, production build and git diff checks passed.

Browser QA used a temporary read-only API fixture populated from the real local
catalog and a temporary route rendering the actual CompactRestaurantCard. Neither
fixture is shipped. Checked 390x664, 390x844, 430x932 and desktop methodology:
no horizontal overflow, compact card height 220.5px for the sample, card-to-detail
navigation, native keyboard disclosure, 44px disclosure target, methodology anchor,
missing-evidence fallback and unchanged 9.3 score styling. Photos were intentionally
unavailable in the isolated fixture. This is responsive-browser QA, not a physical
phone test or a production deployment.

Production changes are limited to score_transparency.py, the detail projection in
public_catalog.py and API model in api.py; frontend API schema, CompactRestaurantCard,
RestaurantDetailShell, the new ScoreTransparency component and About methodology.
Tests cover these surfaces. The retained audit script is read-only. No scoring,
ranking, eligibility, Picks composition or database schema code changed.
