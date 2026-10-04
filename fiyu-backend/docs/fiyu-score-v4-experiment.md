# Fiyu public score v4 offline experiment

## Executive conclusion

This experiment does **not** support wiring v4 into production yet.

V3 Quality is completely anchored to the cheap upstream rating/review prior: expensive
research currently has no path to change the numeric Quality component. A bounded
posterior is directionally sound, but the stored research is not symmetric or complete
enough to validate it. Of 1,092 researched restaurants, 630 have stored consensus review
themes, 505 have at least one food-related theme from two source families, and only 184
produce a non-zero experimental Quality adjustment. The current theme schema cannot
represent negative sentiment, so no restaurant receives a research-driven downgrade.

The straightforward null-and-renormalize experiment also over-corrects. It raises the
current-v3 score by a median 0.79 and mean 1.67 points, but produces changes from -5.18
to +11.36. Unknown chain rows gain 4.62 points on average and `specialist=false` rows
treated as unknown gain 3.48. These are meaningful false-negative signals, but the size
of the largest moves shows that unrestricted renormalization can turn a thin remaining
signal into an unjustified extreme.

Recommendation: retain 45% Quality; add a small, evidence-linked researched Quality
posterior with an initial ±5 cap only after the research schema can store positive and
negative quality observations; migrate ambiguous booleans to explicit true/false/null;
and add minimum-evidence/maximum-renormalization guardrails before changing unknown
semantics. Do not lower the production floor from this experiment alone.

## Scope and safeguards

- Database read with SQLite `mode=ro`.
- 1,092 `research_status='complete'` restaurants evaluated.
- No research, model, web, provider, publication, or database-write calls.
- SHA-256 before and after: `fc729041b200a7b1c640096224d1dea7724b4c2d06742932cf177f9f55ed1685`.
- Production v3 scoring, thresholds, tables, and lifecycle code were not changed.
- Current v3 was recomputed offline with today's deterministic code. The stored score is
  retained separately because 64 researched rows still carry v1/v2 score-version labels
  and a few stored outcomes differ from current policy.

Artifacts:

- Full row-level comparison: [`data/audits/fiyu-score-v4-comparison.csv`](../data/audits/fiyu-score-v4-comparison.csv)
- Machine-readable aggregates and complete samples: [`data/audits/fiyu-score-v4-summary.json`](../data/audits/fiyu-score-v4-summary.json)
- Human-readable diagnostic samples: [`data/audits/fiyu-score-v4-diagnostic-samples.md`](../data/audits/fiyu-score-v4-diagnostic-samples.md)

## 1. Current Quality data flow

### A. Cheap upstream data

`src/fiyu/scoring.py::score_records` computes an area-smoothed rating:

```text
area prior = mean source rating in search area (global mean fallback)
adjusted rating = review-count-weighted source rating + prior-weighted area mean
quality_score = clamp((adjusted_rating - 3.8) / 1.0 * 100)
```

The raw inputs are source `rating`, `review_count`, `search_area`, and the configured
`prior_review_weight`. `review_count` determines how strongly the restaurant's rating
overrides its area prior. The resulting `quality_score` is persisted on `restaurants`.

Review count also affects other upstream signals: its area/category percentile becomes
`underexposure_score`, and it contributes to internal confidence. This means rating and
review volume already influence more than one part of candidate selection, although
review volume does not directly enter public Quality after the prior is computed.

### B. Expensive researched evidence

`src/fiyu/research_worker.py::RestaurantResearch` stores identity, names, cuisine and
food tags, signature dishes, descriptions, source counts, chain evidence,
`specialist_restaurant`, audience/visibility evidence, URLs, address evidence, and card
enrichment. `CardEnrichment.review_themes` preserves a short claim, sentiment,
confidence, and source URLs, and requires two distinct URLs.

Potentially quality-relevant stored fields are:

- `review_themes` and their supporting URLs;
- `signature_dishes`, `food_tags`, and `specialist_restaurant`;
- `description_en` and `why_fiyu` prose;
- evidence URLs and address-source summaries;
- restaurant longevity or craft claims when they happen to survive inside a theme.

Only review themes are sufficiently claim-specific and source-linked for conservative
numeric use. Signature dishes and `specialist_restaurant=true` do not carry their own
quality-specific evidence references. Descriptions and `why_fiyu` are prose and may mix
identity, hiddenness, atmosphere, and discovery claims.

### C. Current deterministic public math

`src/fiyu/public_score.py::calculate_fiyu_score` currently does exactly:

```text
quality_signal = clamp(internal.quality_score)
v3 = .45 Quality + .15 Hiddenness + .15 Independence + .25 Local Discovery
```

`research_worker.py` passes the persisted candidate `quality_score` into
`InternalSignals`; no researched field can alter Quality. Research can change the other
components and hard product/chain/conflict gates, but not Quality.

### Current overlaps / possible double counting

- Review count shapes the Quality prior and underexposure; underexposure then appears in
  both Hiddenness and Local Discovery.
- Digital-footprint scarcity appears in both Hiddenness and Local Discovery.
- Chain classification and specialist status appear in the top-level Independence
  component and again inside Local Discovery.
- Japanese/English source mix contributes to Local Discovery and the legacy `local_signal`
  (the latter is stored but not a v3 top-level component).

The experimental researched-Quality adjustment deliberately excludes rating, review
count, scarcity, locality, chain status, and mere specialist appearance.

## 2. Experimental researched Quality evidence

The offline scorer accepts only a stored review theme that:

1. is food/cooking/dish specific;
2. has confidence of at least 0.70;
3. is supported by at least two independent hostname families, not merely two URLs on
   the same platform.

It then deterministically assigns at most:

| Observation | Experimental points |
|---|---:|
| One corroborated food/execution-praise theme | +1.5 |
| Two or more execution-praise themes | +3 |
| Specialist/craft technique claim | +2 |
| Signature-dish reputation claim | +2 |
| Food-specific award/editorial recognition | +2 |
| Sustained consistency/longevity claim | +1 |
| One repeated food-quality concern | -2 |
| Two or more concern themes | -4 |
| Material inconsistency | -2 |
| Affirmative food-weaker-than-hype claim | -2 |

Unknown is zero. These values are deliberately bounded and auditable, but the lexical
extractor is an experimental proxy, not a production recommendation. The current stored
schema prevented the negative rules from firing because `ReviewTheme.sentiment` permits
only `positive`, `practical`, and `mixed`, and research did not preserve a reliable
negative-quality observation.

The posterior is:

```text
researched_quality = clamp(base_quality_prior + bounded_adjustment, 0, 100)
```

## 3. Existing evidence and source audit

### Coverage

| Measure | Restaurants |
|---|---:|
| Researched/scored | 1,092 |
| With review themes | 630 |
| With qualifying independently corroborated food themes | 505 |
| With a non-zero Quality adjustment | 184 |
| With structurally capturable negative-quality evidence | 0 |
| No review themes | 462 |
| Same-source-family themes excluded | 69 |

Quality-theme source-type presence (a restaurant may appear in multiple rows):

| Heuristic source class | Restaurants |
|---|---:|
| Review/reservation platforms | 574 |
| Other or restaurant-controlled domains | 524 |
| Blog platforms | 69 |
| Government/local official | 25 |
| Editorial/guide | 11 |

Across the broader current research URL set, the largest domains include Tabelog
(1,085 URL occurrences), Gurunavi (259), Yahoo Maps (226), Hot Pepper (216), Retty
(209), Hitosara (114), Ekiten (91), Ameblo (60), and local/editorial sources in a much
smaller long tail.

### What can and cannot be distinguished

- Food-specific claims can sometimes be separated from service/atmosphere/popularity by
  theme text.
- Theme URL lists allow source-family deduplication, but there is no normalized publisher
  identity, syndication ID, copied-claim fingerprint, or source reliability class.
- The schema does not explicitly label execution, ingredients, craft, signature-dish
  reputation, consistency, concerns, or hype-vs-food weakness.
- Negative sentiment is not representable. Absence of a negative theme is therefore
  unknown, not proof of quality.
- A positive theme can describe menu presence rather than quality. The experiment avoids
  credit unless the text contains an affirmative quality/craft/reputation claim.

### Smallest robust future schema

Add a bounded `quality_observations` array, not a model-generated score:

```text
kind: execution | ingredients | craft | signature_reputation |
      editorial_recognition | consistency | quality_concern |
      inconsistency | food_vs_hype
polarity: positive | negative | mixed
strength: weak | moderate | strong
claim: concise evidence-grounded text
source_refs: normalized source IDs/URLs
independent_source_count: integer after publisher-family dedupe
source_type_mix: normalized enums
time_scope: current | sustained | historical | unknown
```

Also change `specialist_restaurant` and similar evidence booleans to true/false/null and
attach source references to affirmative and negative findings. Normalize source families
and preserve a claim fingerprint so copied/syndicated claims are counted once.

## 4. Unknown/null semantics experiment

Current implicit values include:

| Field | Current fallback/effect |
|---|---|
| `tourist_coverage=unknown` | 50 in Hiddenness; legacy 60 in Local Discovery |
| `japanese_review_share=null` | 50 in local/source-mix calculations |
| `chain_classification=unknown` | 70 in Independence and Local Discovery |
| `specialist_restaurant=false` | 40 in Independence; 50 in Local Discovery |
| `local_audience=unknown` | 50 |
| `international_visibility=unknown` | 60 |
| `corporate_visibility=unknown` | 60 |
| `official_language=unknown` | 50 in stored `local_signal` |

The experiment omitted explicit unknown enums, treated `specialist=false` as unknown,
and renormalized within each weighted component. Required searched counts/booleans such
as website-found and platform counts remained observations.

Results versus freshly recomputed current v3:

| Statistic | Score delta from null + renormalization alone |
|---|---:|
| Minimum | -5.18 |
| P25 | +0.01 |
| Median | +0.79 |
| Mean | +1.67 |
| P75 | +2.56 |
| P90 | +4.68 |
| Maximum | +11.36 |

| Delta band | Count |
|---|---:|
| -7.99 to -5 | 1 |
| -4.99 to -2 | 7 |
| -1.99 to +1.99 | 754 |
| +2 to +4.99 | 237 |
| +5 to +7.99 | 77 |
| >= +8 | 16 |

Unknown chain is materially punitive in v3: 213 such rows gain a mean 4.62 points under
renormalization, with 24/31/63 crossing 68/70/75. Treating 256
`specialist_restaurant=false` rows as unknown produces a mean +3.48 points, with
23/30/66 crossing those floors. But these results combine overlapping unknown fields,
and the large moves show that simple renormalization is unsafe. It can give the full
weight of a subcomponent to a single surviving signal.

Recommended guardrails for a future test are: explicit nulls at collection time, a
minimum known-weight requirement, a maximum adjustment attributable to missingness,
and component-level confidence reported separately. Do not translate an unknown into a
positive fact.

## 5. V4 variants and score distributions

V4-A keeps 45/15/15/25 weights. V4-B tests 40/15/15/30. All preserve the current chain
and non-restaurant score caps and all hard publication gates.

The ±5, ±8, and ±10 V4-A distributions are identical at displayed precision. The
largest observed raw positive adjustment is +5.5, only three rows exceed +5, and no
negative adjustment is observable. The current data therefore cannot choose between
±8 and ±10.

| Variant | Min | P10 | P25 | Median | Mean | P75 | P90 | Max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Current v3 recomputed | 48.36 | 65.95 | 70.92 | 75.11 | 74.27 | 78.83 | 81.39 | 90.20 |
| V4-A (any tested cap) | 48.36 | 67.86 | 72.68 | 77.00 | 76.09 | 80.72 | 83.44 | 93.82 |
| V4-B (±8) | 48.69 | 69.09 | 73.59 | 77.88 | 76.82 | 81.22 | 84.01 | 94.22 |

| Score band | Current v3 | V4-A | V4-B |
|---|---:|---:|---:|
| <60 | 33 | 34 | 28 |
| 60–64.99 | 57 | 28 | 26 |
| 65–67.99 | 63 | 51 | 32 |
| 68–69.99 | 66 | 46 | 52 |
| 70–72.49 | 144 | 105 | 95 |
| 72.5–74.99 | 176 | 154 | 120 |
| 75–79.99 | 357 | 352 | 367 |
| 80–84.99 | 182 | 264 | 306 |
| 85+ | 14 | 58 | 66 |

Reducing Quality to 40% and increasing Local Discovery to 30% shifts still more rows
upward without providing better quality evidence. The data does not support V4-B.

## 6. Movement analysis

Quality adjustment itself:

| Quality adjustment | Restaurants |
|---|---:|
| -1.99 to +1.99 | 1,014 |
| +2 to +4.99 | 75 |
| +5 to +7.99 | 3 |
| Any negative band | 0 |

Only 78 restaurants receive a meaningful +2 or larger researched-Quality adjustment;
1,014 barely move. Quality-only contributes a mean of about +0.15 final-score points,
a maximum +2.48, and by itself rescues only 5/11/6 restaurants across 68/70/75. The
larger V4 movement is overwhelmingly the unknown-semantics experiment, not expensive
research changing the ranking.

Final V4-A ±8 delta versus current v3:

| Final delta | Restaurants |
|---|---:|
| -7.99 to -5 | 1 |
| -4.99 to -2 | 7 |
| -1.99 to +1.99 | 731 |
| +2 to +4.99 | 253 |
| +5 to +7.99 | 84 |
| >= +8 | 16 |

Positive quality observations occur across cuisines, with the largest normalized
labels being izakaya (11 across English/Japanese labels), yakitori (8), Italian (3),
and yakiniku (3). Area counts broadly track ingestion volume: Chuo Initial 12, Taito
Initial 11, Shibuya Initial 9, Chiyoda and Suginami Initial 7 each. This is not enough
to establish a genuine cuisine or area effect; taxonomy normalization and exposure-rate
denominators would be needed.

## 7. Publication-floor counterfactuals

All counterfactuals retain current product eligibility, chain exclusion, critical
contradiction, exact-duplicate logic, and current numeric caps. “Additional” is versus
the 538 currently published researched restaurants; it is not a proposed bulk publish.

### V4-A (45% Quality, ±8 shown)

| Floor | Eligible | Additional vs current | % researched | Blocked despite score |
|---|---:|---:|---:|---:|
| 68 | 959 | +421 | 87.82% | 20 |
| 69 | 943 | +405 | 86.36% | 19 |
| 70 | 914 | +376 | 83.70% | 19 |
| 72 | 827 | +289 | 75.73% | 17 |
| 75 | 660 | +122 | 60.44% | 14 |

At floor 68, the 20 score-passers blocked by non-score policy comprise 15 current
critical contradictions and 5 product-ineligible rows. At 75, 10 are critically
contradicted and 4 product-ineligible. Known chains remain below these floors because
the current numeric chain cap is preserved.

### V4-B (40% Quality, 30% Local Discovery, ±8)

| Floor | Eligible | Additional vs current | % researched | Blocked despite score |
|---|---:|---:|---:|---:|
| 68 | 986 | +448 | 90.29% | 20 |
| 69 | 965 | +427 | 88.37% | 19 |
| 70 | 935 | +397 | 85.62% | 19 |
| 72 | 867 | +329 | 79.40% | 18 |
| 75 | 723 | +185 | 66.21% | 16 |

V4-A ±8 crosses 40 restaurants upward at 68, 61 at 70, 123 at 75, and 126 at 80
relative to current recomputed v3. There are 0, 1, 2, and 0 downward crossings at the
same thresholds. That one-sided movement is a warning, not proof of improvement.

## 8. Borderline diagnostic samples

The generated sample artifact contains 15 deterministic, distribution-spanning rows
for each group where at least 15 exist, and all rows otherwise:

- current v3 <68 and v4 >=68;
- current v3 <70 and v4 >=70;
- current v3 <75 and v4 >=75;
- current v3 >=75 and v4 <75;
- v4 68–69.99, 70–72.99, 75–79.99, and 80+.

Each row includes restaurant, internal score, stored and recomputed v3, v4, base and
posterior Quality, adjustment, H/I/LD, evidence/reasons, source types, non-score blocks,
and unknown fields. See the [full diagnostic sample tables](../data/audits/fiyu-score-v4-diagnostic-samples.md).

The sample does not make 68 look safe as an automatic publication floor. Several rows
cross thresholds with zero Quality adjustment; their movement comes from removing
unknown defaults. Conversely, credible food-specific themes produce restrained movement
and generally do not overturn a weak prior. A floor of 70 is directionally safer than
68, but neither is justified for production until negative evidence and null semantics
are collected and tested prospectively.

## 9. Confidence versus score

The experimental Quality adjustment uses `UNKNOWN = 0`; sparse evidence does not lower
Quality. Current `fiyu_confidence` is retained as a separate column and never added to
the score. This preserves the intended distinction between an estimated restaurant
score and certainty about that estimate.

A production v4 should add quality-posterior confidence derived from independent source
families, claim agreement, source-type diversity, temporality, and evidence coverage.
That confidence should be displayed or used for review routing—not subtracted from the
restaurant's Quality estimate.

## 10. Direct answers

1. **Is v3 Quality too anchored upstream?** Yes. It is exactly the upstream
   `quality_score`; research has zero numeric influence.
2. **Does a bounded adjustment improve ranking believably?** For the 184 rows with
   usable positive evidence, the movements are restrained and interpretable. The
   catalog-wide experiment is not yet believable because negative evidence is absent.
3. **Best cap?** The data cannot distinguish ±8 from ±10. Only three rows exceed +5 and
   none move negatively. Use ±5 as the safest first prospective cap after schema work.
4. **45% or 40% Quality?** Keep 45%. V4-B expands high scores primarily by adding more
   Local Discovery weight, not better Quality evidence.
5. **Unknown/null movement alone?** Median +0.79, mean +1.67, range -5.18 to +11.36.
6. **Does unknown chain cause false negatives?** Likely yes: 213 rows gain a mean 4.62
   in the naïve experiment. But unrestricted renormalization over-corrects.
7. **Does `specialist=false` cause false negatives?** Likely yes: 256 ambiguous-false
   rows gain a mean 3.48. The schema must distinguish proven false from unknown.
8. **Can stored research support reliable adjustment?** Only a partial positive-side
   prototype. It cannot support balanced production scoring without structured negative
   observations and normalized source provenance.
9. **V4-A eligibility at 68/70/75?** 959 / 914 / 660, with all non-score rules retained.
10. **Is 68 defensible?** Not yet as an automatic floor. The sample is contaminated by
    missingness-driven uplift and lacks negative Quality evidence.
11. **Would 68 or 70 add useful variety?** Both add substantial breadth (+421 and +376
    versus current publication), but dilution cannot be ruled out. 70 is the safer QA
    candidate; neither should ship from this retrospective alone.
12. **Editorial meaning:** 68 = promising but review-worthy; 70 = plausible catalog
    entry with adequate evidence; 75 = strong Fiyu recommendation; 80 = standout across
    Quality and discovery dimensions. These should remain internal semantics until
    independently validated and worded as provisional, not verified quality.
13. **Recommended production design:** keep 45/15/15/25; add source-linked structured
    quality observations; start with ±5; use explicit nulls with guarded
    renormalization; preserve hard gates and numeric caps; keep evidence confidence
    separate; validate prospectively on a human-reviewed stratified sample before any
    threshold or publication change.

## 11. Reproduction

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_fiyu_score_v4.py
.\.venv\Scripts\python.exe -m pytest tests\test_experimental_score_v4.py
.\.venv\Scripts\python.exe -m ruff check src\fiyu\experimental_score_v4.py scripts\evaluate_fiyu_score_v4.py tests\test_experimental_score_v4.py
git diff --check
```

The evaluator is intentionally not imported by production scoring or publication code.
