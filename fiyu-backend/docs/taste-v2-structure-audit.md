# Taste V2 structure audit

> Read-only restaurant-feature analysis. This report does not implement Taste V2, change production recommendations, or define final Fiyu Types.

## Methodology and scope

- Eligible real catalog restaurants: **263**.
- Current production-derived Taste facets observed: **37**.
- Current matrix uses only fields already consumed by `restaurant_taste_facets`.
- Richer cuisine research, food tags, numeric price, hours, discovery, and other fields are inventoried separately and never mixed into current-facet results.
- Pairwise statistics are descriptive Jaccard, conditional probability, and binary phi.
- Higher-order structure uses frequent triples and a transparent correlation graph.
- Restaurant clustering is deterministic Jaccard k-medoids and is discovery-only.
- Source database opened read-only; persistent state unchanged: **True**.

## Current facet coverage and specificity

Bands: very common >50%; common 25–50%; moderate 10–<25%; distinctive 2–<10%; rare <2%. Rarity is not treated as quality.

| Facet | Family | Count | Share | Specificity | Provenance | Coverage concern |
|---|---|---:|---:|---|---|---|
| `small_capacity` | dining_format | 187 | 71.1% | very common | practical_info.seating | structured enrichment; missing values mean unknown, not false |
| `counter_seating` | dining_format | 155 | 58.9% | very common | practical_info.seating | structured enrichment; missing values mean unknown, not false |
| `solo_friendly` | occasion | 141 | 53.6% | very common | practical_info.visit_style | structured enrichment; missing values mean unknown, not false |
| `group_friendly` | occasion | 116 | 44.1% | common | practical_info.visit_style | structured enrichment; missing values mean unknown, not false |
| `table_dining` | dining_format | 113 | 43.0% | common | practical_info.seating | structured enrichment; missing values mean unknown, not false |
| `date_friendly` | occasion | 75 | 28.5% | common | practical_info.visit_style | structured enrichment; missing values mean unknown, not false |
| `moderate` | price | 75 | 28.5% | common | canonical budget.band | canonical structured field; missing values still reduce coverage |
| `budget` | price | 70 | 26.6% | common | canonical budget.band | canonical structured field; missing values still reduce coverage |
| `seafood` | food_style | 63 | 24.0% | moderate | primary category and/or validated review theme | regex/category coverage; taxonomy is intentionally narrow |
| `izakaya` | cuisine | 62 | 23.6% | moderate | primary category text | regex/category coverage; taxonomy is intentionally narrow |
| `upscale` | price | 50 | 19.0% | moderate | canonical budget.band | canonical structured field; missing values still reduce coverage |
| `splurge` | price | 43 | 16.3% | moderate | canonical budget.band | canonical structured field; missing values still reduce coverage |
| `cuisine_sushi` | cuisine | 41 | 15.6% | moderate | primary category text | regex/category coverage; taxonomy is intentionally narrow |
| `intimate` | atmosphere | 41 | 15.6% | moderate | validated review theme | depends on theme extraction and review coverage |
| `private_rooms` | dining_format | 41 | 15.6% | moderate | practical_info.seating | structured enrichment; missing values mean unknown, not false |
| `seasonal` | food_style | 39 | 14.8% | moderate | validated review theme | depends on theme extraction and review coverage |
| `casual` | atmosphere | 34 | 12.9% | moderate | validated review theme | depends on theme extraction and review coverage |
| `grilled` | food_style | 32 | 12.2% | moderate | primary category and/or validated review theme | regex/category coverage; taxonomy is intentionally narrow |
| `neighbourhood` | venue_character | 32 | 12.2% | moderate | validated review theme | depends on theme extraction and review coverage |
| `reservation_heavy` | venue_character | 23 | 8.7% | distinctive | practical_info.reservation | structured enrichment; missing values mean unknown, not false |
| `quiet` | atmosphere | 21 | 8.0% | distinctive | validated review theme | depends on theme extraction and review coverage |
| `creative` | food_style | 13 | 4.9% | distinctive | validated review theme | depends on theme extraction and review coverage |
| `traditional` | food_style | 13 | 4.9% | distinctive | validated review theme | depends on theme extraction and review coverage |
| `cuisine_french` | cuisine | 10 | 3.8% | distinctive | primary category text | regex/category coverage; taxonomy is intentionally narrow |
| `cuisine_italian` | cuisine | 10 | 3.8% | distinctive | primary category text | regex/category coverage; taxonomy is intentionally narrow |
| `cuisine_chinese` | cuisine | 9 | 3.4% | distinctive | primary category text | regex/category coverage; taxonomy is intentionally narrow |
| `noodles` | food_style | 8 | 3.0% | distinctive | primary category and/or validated review theme | regex/category coverage; taxonomy is intentionally narrow |
| `chef_led` | venue_character | 7 | 2.7% | distinctive | validated review theme | depends on theme extraction and review coverage |
| `tasting_course` | food_style | 7 | 2.7% | distinctive | validated review theme | depends on theme extraction and review coverage |
| `cuisine_okinawan` | cuisine | 5 | 1.9% | rare | primary category text | regex/category coverage; taxonomy is intentionally narrow |
| `cuisine_indian` | cuisine | 4 | 1.5% | rare | primary category text | very sparse; unstable prevalence |
| `refined` | atmosphere | 4 | 1.5% | rare | validated review theme | very sparse; unstable prevalence |
| `regional` | food_style | 4 | 1.5% | rare | validated review theme | very sparse; unstable prevalence |
| `cuisine_korean` | cuisine | 3 | 1.1% | rare | primary category text | very sparse; unstable prevalence |
| `cuisine_thai` | cuisine | 2 | 0.8% | rare | primary category text | very sparse; unstable prevalence |
| `special_occasion` | occasion | 2 | 0.8% | rare | validated review theme | very sparse; unstable prevalence |
| `lively` | atmosphere | 1 | 0.4% | rare | validated review theme | very sparse; unstable prevalence |

## Strongest pairwise relationships

| Pair | Together | P(A\|B) | P(B\|A) | Jaccard | Phi |
|---|---:|---:|---:|---:|---:|
| `counter_seating` + `solo_friendly` | 119 | 84.4% | 76.8% | 0.672 | +0.556 |
| `counter_seating` + `small_capacity` | 136 | 72.7% | 87.7% | 0.660 | +0.440 |
| `cuisine_sushi` + `seafood` | 41 | 65.1% | 100.0% | 0.651 | +0.766 |
| `small_capacity` + `solo_friendly` | 123 | 87.2% | 65.8% | 0.600 | +0.383 |
| `group_friendly` + `table_dining` | 80 | 70.8% | 69.0% | 0.537 | +0.467 |
| `solo_friendly` + `table_dining` | 79 | 69.9% | 56.0% | 0.451 | +0.284 |
| `small_capacity` + `table_dining` | 93 | 82.3% | 49.7% | 0.449 | +0.214 |
| `counter_seating` + `table_dining` | 82 | 72.6% | 52.9% | 0.441 | +0.240 |
| `group_friendly` + `small_capacity` | 89 | 47.6% | 76.7% | 0.416 | +0.110 |
| `counter_seating` + `group_friendly` | 79 | 68.1% | 51.0% | 0.411 | +0.166 |
| `group_friendly` + `solo_friendly` | 71 | 50.4% | 61.2% | 0.382 | +0.135 |
| `seasonal` + `splurge` | 22 | 51.2% | 56.4% | 0.367 | +0.452 |
| `date_friendly` + `splurge` | 31 | 72.1% | 41.3% | 0.356 | +0.427 |
| `date_friendly` + `group_friendly` | 50 | 43.1% | 66.7% | 0.355 | +0.287 |
| `counter_seating` + `date_friendly` | 60 | 80.0% | 38.7% | 0.353 | +0.270 |
| `date_friendly` + `small_capacity` | 67 | 35.8% | 89.3% | 0.344 | +0.254 |
| `counter_seating` + `seafood` | 54 | 85.7% | 34.8% | 0.329 | +0.306 |
| `reservation_heavy` + `splurge` | 16 | 37.2% | 69.6% | 0.320 | +0.445 |
| `group_friendly` + `private_rooms` | 38 | 92.7% | 32.8% | 0.319 | +0.420 |
| `date_friendly` + `seasonal` | 27 | 69.2% | 36.0% | 0.310 | +0.376 |
| `date_friendly` + `solo_friendly` | 49 | 34.8% | 65.3% | 0.293 | +0.148 |
| `izakaya` + `moderate` | 31 | 41.3% | 50.0% | 0.292 | +0.264 |
| `private_rooms` + `splurge` | 19 | 44.2% | 46.3% | 0.292 | +0.349 |
| `date_friendly` + `private_rooms` | 26 | 63.4% | 34.7% | 0.289 | +0.332 |
| `date_friendly` + `table_dining` | 41 | 36.3% | 54.7% | 0.279 | +0.149 |

Explicitly requested pairs:

- `counter_seating` ↔ `small_capacity`: n=136, Jaccard=0.660, phi=+0.440, P(left|right)=72.7%, P(right|left)=87.7%.
- `counter_seating` ↔ `solo_friendly`: n=119, Jaccard=0.672, phi=+0.556, P(left|right)=84.4%, P(right|left)=76.8%.
- `small_capacity` ↔ `solo_friendly`: n=123, Jaccard=0.600, phi=+0.383, P(left|right)=87.2%, P(right|left)=65.8%.
- `cuisine_sushi` ↔ `seafood`: n=41, Jaccard=0.651, phi=+0.766, P(left|right)=65.1%, P(right|left)=100.0%.
- `refined` ↔ `splurge`: n=1, Jaccard=0.022, phi=+0.029, P(left|right)=2.3%, P(right|left)=25.0%.

## Higher-order groups

Frequent triples:

| Facets | Restaurants | Generalized Jaccard | Smallest-member coverage |
|---|---:|---:|---:|
| `counter_seating + small_capacity + solo_friendly` | 107 | 0.505 | 75.9% |
| `counter_seating + solo_friendly + table_dining` | 68 | 0.345 | 60.2% |
| `counter_seating + small_capacity + table_dining` | 71 | 0.330 | 62.8% |
| `small_capacity + solo_friendly + table_dining` | 68 | 0.318 | 60.2% |
| `counter_seating + group_friendly + small_capacity` | 67 | 0.303 | 57.8% |
| `counter_seating + group_friendly + solo_friendly` | 59 | 0.292 | 50.9% |
| `group_friendly + small_capacity + table_dining` | 60 | 0.280 | 53.1% |
| `counter_seating + group_friendly + table_dining` | 54 | 0.274 | 47.8% |
| `counter_seating + date_friendly + small_capacity` | 58 | 0.274 | 77.3% |
| `group_friendly + small_capacity + solo_friendly` | 58 | 0.265 | 50.0% |
| `group_friendly + solo_friendly + table_dining` | 50 | 0.263 | 44.2% |
| `counter_seating + date_friendly + solo_friendly` | 44 | 0.235 | 58.7% |
| `counter_seating + cuisine_sushi + seafood` | 37 | 0.226 | 90.2% |
| `counter_seating + seafood + small_capacity` | 46 | 0.221 | 73.0% |
| `date_friendly + small_capacity + solo_friendly` | 46 | 0.219 | 61.3% |

Correlation-graph components:

- `counter_seating + small_capacity + solo_friendly`
- `cuisine_sushi + seafood`
- `group_friendly + table_dining`

Interpretation:

- Counter + small-capacity + solo is best treated as one latent compact, counter-oriented format with still-useful component nuance (category C).
- Sushi + seafood is a near hierarchy/subset and a likely double-counting risk rather than two independent preferences (categories A/C).
- Group + table and date + small-capacity are related but not synonymous concepts (category B).
- Small theme groups with very low counts may be extraction artifacts rather than stable latent structure (category D).

## Cuisine hierarchy audit

- Every observed `cuisine_sushi` restaurant also has `seafood`; sushi is therefore currently a strict subset of the broader seafood signal.
- Sushi frequently co-travels with counter/small-capacity/solo, mixing food identity with service format in flat candidate averages.
- Noodles, grilled, seafood, and izakaya are broad style/category signals; only eight named cuisine families are currently recognized.
- Current category regexes miss many potentially meaningful Japanese subtypes and cross-cuisine distinctions; accepted richer cuisine terms are audited below.
- Taste V2 should preserve a hierarchy (specific cuisine → broader food family) while avoiding counting parent and child as independent evidence by default.

## Backend-known fields not currently used by Taste

| Field | Restaurants with data |
|---|---:|
| `food_tags` | 262 |
| `signature_dishes` | 229 |
| `opening_hours` | 263 |
| `service_periods` | 263 |
| `hours_display` | 227 |
| `numeric_budget_minimum` | 238 |
| `numeric_budget_maximum` | 198 |
| `reservation_status` | 263 |
| `discovery_area` | 48 |
| `local_discovery_score` | 179 |
| `accepted_richer_cuisine` | 0 |

### Food tags and richer cuisine data

- Food-tag raw vocabulary: **524**; basic-normalized vocabulary: **513**; normalized singletons: **369**.
- Repeated normalized concepts (count ≥2): **144**. This is an upper-bound normalization candidate count, not a recommended taxonomy size.
- Top normalized tags: `居酒屋` (56), `日本酒` (50), `和食` (35), `焼き鳥` (22), `寿司` (22), `焼酎` (18), `日本料理` (18), `海鮮` (17), `ワイン` (16), `魚料理` (16), `江戸前寿司` (16), `japanese cuisine` (11), `刺身` (11), `江戸前鮨` (10), `おまかせ` (10).
- Basic normalization found **11** displayed variant groups; examples: `sashimi` ← Sashimi, sashimi; `seafood` ← Seafood, seafood; `curry` ← Curry, curry; `nigiri sushi` ← Nigiri sushi, nigiri sushi; `wine bar` ← Wine bar, wine bar.
- No accepted richer-cuisine research rows are available in this local catalog, so incremental production-facet coverage from that source cannot be evaluated here.
- Highly generic tags such as Japanese cuisine/和食 coexist with specific dish and style tags; casing cleanup alone is insufficient—synonym and hierarchy mapping are needed.
- Food tags look useful only after normalization, synonym control, provenance review, and minimum-support rules; direct injection would greatly increase sparse/noisy terms.

## Price structure

- Canonical budget objects: **238**; numeric minimums: **238**; numeric maximums: **198**.
- Minimum quantiles (0/25/50/75/100%): ¥0, ¥1,000, ¥2,000, ¥4,000, ¥12,000.
- Maximum quantiles (0/25/50/75/100%): ¥1,000, ¥2,000, ¥3,000, ¥6,000, ¥25,000.
- Current band counts: `moderate` 75, `budget` 70, `upscale` 50, `splurge` 43.
- Largest gaps between observed numeric maxima: ¥14,999→¥25,000 (gap ¥10,001), ¥10,000→¥14,999 (gap ¥4,999), ¥5,000→¥6,000 (gap ¥1,000), ¥6,000→¥7,000 (gap ¥1,000), ¥8,000→¥9,000 (gap ¥1,000).

| Band | Known maxima | Min | Median | Max |
|---|---:|---:|---:|---:|
| budget | 70 | ¥1,000 | ¥2,000 | ¥2,000 |
| moderate | 75 | ¥2,999 | ¥4,000 | ¥9,999 |
| splurge | 3 | ¥14,999 | ¥14,999 | ¥25,000 |
| upscale | 50 | ¥6,000 | ¥7,000 | ¥10,000 |

Price is both categorical and continuous: bands are interpretable anchors, while numeric center/range retain meaningful within-band variation and support breadth or tolerance. Open-ended maxima require censored-value handling. The observed `moderate` maxima extend to ¥9,999 and overlap `upscale`, so labels are not clean numeric bins.

## Format, atmosphere, occasion, and candidate dimensions

| Dimension | Restaurant-space poles | Left coverage | Right coverage | Overlap | Jaccard | Phi | Assessment |
|---|---|---:|---:|---:|---:|---:|---|
| Price posture | value-oriented ↔ splurge-comfortable | 145 | 93 | 0 | 0.000 | -0.820 | bipolar encoding has empirical support |
| Dining format | compact/counter ↔ table/social | 212 | 152 | 141 | 0.632 | +0.360 | better represented as two partly independent scores |
| Formality | casual/everyday ↔ refined/occasion-led | 60 | 30 | 7 | 0.084 | +0.004 | better represented as two partly independent scores |
| Room energy | intimate/quiet ↔ lively | 57 | 1 | 0 | 0.000 | -0.032 | better represented as two partly independent scores |
| Culinary posture | traditional/regional ↔ creative/chef-led | 17 | 19 | 2 | 0.059 | +0.046 | better represented as two partly independent scores |
| Visit mode | solo-oriented ↔ social/occasion-oriented | 141 | 141 | 92 | 0.484 | +0.251 | better represented as two partly independent scores |

Evidence summary:

- Price posture has the cleanest categorical separation, but users can like both cheap and expensive restaurants; preserve independent affinities plus a continuous range.
- Compact/counter versus table/social has strong structure but substantial overlap, so it is not a true bipolar axis.
- Casual/refined and intimate/lively are weakly measured because refined and especially lively theme coverage is sparse.
- Traditional/creative coverage is sparse and does not establish mutual exclusion.
- Solo and social signals frequently coexist; two independent scores are more honest.
- Focused ↔ explorative is not a restaurant axis. It must be inferred from confidence-qualified positive-rating breadth over time.

## Exploration and positive-preference breadth

A future breadth signal should combine positive-rating cuisine entropy, positively rated format/price/atmosphere coverage, and concentration of positive affinity. It must be confidence-shrunk, neutral about breadth itself, and updated only from explicit feedback—not mere exposure or generated exploration Picks.

Safeguards: minimum distinct rated restaurants; current effective rating per restaurant; no credit for low/neutral category visits; shrinkage for sparse histories; robustness against one-off rare tags; and no circular recommendation-as-preference evidence.

## Synthetic user-profile demonstrations

### A — narrow sushi/counter lover

Ratings/confidence: **9 / 0.90**.
Positive facets: cuisine_sushi +0.75, seafood +0.75, traditional +0.67, counter_seating +0.61, reservation_heavy +0.50, group_friendly +0.44, moderate +0.42, small_capacity +0.38.
Negative facets: grilled -0.25, izakaya -0.17.
Coherence check: Cuisine focus is coherent, but sushi's catalog coupling to seafood, counter, and small capacity makes food identity and format hard to disentangle.
Positive breadth: cuisines=1, entropy=0.00, formats=4, price bands=4, atmospheres=3, evidence confidence=0.60.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.271 | +0.229 |
| Dining format | compact/counter ↔ table/social | +0.454 | +0.272 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.125 | +0.500 |
| Room energy | intimate/quiet ↔ lively | +0.125 | +0.000 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.667 | +0.000 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.375 | +0.285 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 10/10 | 0.025 | SHIPPO | -0.140 |
| common_downweighted | 9/10 | 0.025 | Soarama | -0.110 |
| information | 8/10 | 0.041 | Soarama | -0.151 |

### B — broad high-rating user

Ratings/confidence: **14 / 1.00**.
Positive facets: casual +0.64, group_friendly +0.64, small_capacity +0.64, table_dining +0.62, budget +0.57, counter_seating +0.56, solo_friendly +0.56, date_friendly +0.50.
Negative facets: —.
Coherence check: Breadth is coherent across cuisine, format, price, and atmosphere; uniformly positive ratings make directional axes weak, which is appropriate rather than a failure.
Positive breadth: cuisines=9, entropy=1.00, formats=4, price bands=4, atmospheres=5, evidence confidence=1.00.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.473 | +0.338 |
| Dining format | compact/counter ↔ table/social | +0.587 | +0.589 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.488 | +0.333 |
| Room energy | intimate/quiet ↔ lively | +0.500 | +0.333 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.333 | +0.271 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.562 | +0.437 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 10/10 | 0.015 | SHIPPO | -0.063 |
| common_downweighted | 9/10 | 0.025 | Soarama | -0.068 |
| information | 9/10 | 0.046 | Khao Soi | -0.164 |

### C — refined/splurge user

Ratings/confidence: **10 / 1.00**.
Positive facets: small_capacity +0.64, splurge +0.61, date_friendly +0.57, group_friendly +0.57, counter_seating +0.56, cuisine_italian +0.50, cuisine_sushi +0.50, private_rooms +0.50.
Negative facets: —.
Coherence check: Price posture is coherent, but `refined` itself is too sparsely populated to carry the profile; splurge/date/reservation signals do most of the work.
Positive breadth: cuisines=4, entropy=0.84, formats=4, price bands=3, atmospheres=4, evidence confidence=1.00.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.333 | +0.389 |
| Dining format | compact/counter ↔ table/social | +0.566 | +0.468 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.338 | +0.417 |
| Room energy | intimate/quiet ↔ lively | +0.367 | +0.000 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.375 | +0.000 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.500 | +0.571 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 10/10 | 0.018 | Shunsaiya Toriyu | -0.084 |
| common_downweighted | 10/10 | 0.021 | Yakitori Kōchan | -0.084 |
| information | 10/10 | 0.033 | C'est mon cœur | -0.142 |

### D — casual/value user

Ratings/confidence: **10 / 1.00**.
Positive facets: small_capacity +0.61, solo_friendly +0.61, budget +0.60, counter_seating +0.57, casual +0.50, group_friendly +0.50, izakaya +0.50, neighbourhood +0.50.
Negative facets: —.
Coherence check: Value is coherent. Casual/everyday meaning is entangled with budget, neighbourhood, and common visit-format facets.
Positive breadth: cuisines=5, entropy=0.96, formats=4, price bands=3, atmospheres=4, evidence confidence=1.00.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.467 | +0.167 |
| Dining format | compact/counter ↔ table/social | +0.598 | +0.444 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.500 | +0.333 |
| Room energy | intimate/quiet ↔ lively | +0.438 | +0.000 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.333 | +0.167 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.611 | +0.417 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 10/10 | 0.022 | Karakusa | -0.093 |
| common_downweighted | 10/10 | 0.025 | Veganic Monkey Magic | -0.085 |
| information | 10/10 | 0.041 | Okinawa Cuisine Sakura | -0.150 |

### E — intimate/quiet user

Ratings/confidence: **10 / 1.00**.
Positive facets: table_dining +0.64, small_capacity +0.64, intimate +0.62, counter_seating +0.60, solo_friendly +0.60, casual +0.50, group_friendly +0.50, moderate +0.50.
Negative facets: —.
Coherence check: The intended atmosphere appears, but limited quiet/intimate coverage also pulls in date, small-room, and price signals.
Positive breadth: cuisines=4, entropy=0.95, formats=4, price bands=4, atmospheres=3, evidence confidence=1.00.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.438 | +0.354 |
| Dining format | compact/counter ↔ table/social | +0.612 | +0.492 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.438 | +0.250 |
| Room energy | intimate/quiet ↔ lively | +0.521 | +0.000 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.400 | +0.333 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.600 | +0.450 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 7/10 | 0.019 | Karakusa | -0.065 |
| common_downweighted | 9/10 | 0.024 | Soarama | -0.059 |
| information | 8/10 | 0.039 | C'est mon cœur | -0.085 |

### F — lively/group user

Ratings/confidence: **10 / 1.00**.
Positive facets: group_friendly +0.62, counter_seating +0.60, small_capacity +0.60, solo_friendly +0.60, moderate +0.57, cuisine_sushi +0.50, intimate +0.50, izakaya +0.50.
Negative facets: —.
Coherence check: Group orientation is measurable; lively is not. With only one lively restaurant, this profile is effectively a group-friendly diagnostic and should not validate an energy axis.
Positive breadth: cuisines=2, entropy=0.92, formats=4, price bands=4, atmospheres=3, evidence confidence=1.00.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.369 | +0.292 |
| Dining format | compact/counter ↔ table/social | +0.600 | +0.508 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.283 | +0.167 |
| Room energy | intimate/quiet ↔ lively | +0.375 | +0.000 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.500 | +0.000 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.600 | +0.463 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 10/10 | 0.021 | C'est mon cœur | -0.108 |
| common_downweighted | 10/10 | 0.027 | Tonkatsu Kofuku | -0.094 |
| information | 10/10 | 0.044 | Tonkatsu Kofuku | -0.128 |

### G — cheap ramen plus expensive omakase

Ratings/confidence: **10 / 1.00**.
Positive facets: small_capacity +0.78, counter_seating +0.75, solo_friendly +0.75, budget +0.71, cuisine_sushi +0.71, date_friendly +0.71, noodles +0.71, seafood +0.71.
Negative facets: —.
Coherence check: The two-pole price preference is coherent and demonstrates why one bipolar price scalar would misdescribe users who positively value both ends.
Positive breadth: cuisines=3, entropy=0.72, formats=4, price bands=2, atmospheres=2, evidence confidence=1.00.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.714 | +0.714 |
| Dining format | compact/counter ↔ table/social | +0.759 | +0.511 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.417 | +0.333 |
| Room energy | intimate/quiet ↔ lively | +0.333 | +0.000 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.500 | +0.000 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.750 | +0.657 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 10/10 | 0.020 | Nobu | -0.106 |
| common_downweighted | 10/10 | 0.023 | Veganic Monkey Magic | -0.115 |
| information | 10/10 | 0.042 | Okinawa Cuisine Sakura | -0.173 |

### H — broad Taste with counter preference

Ratings/confidence: **12 / 1.00**.
Positive facets: counter_seating +0.64, group_friendly +0.62, moderate +0.62, small_capacity +0.62, solo_friendly +0.62, cuisine_sushi +0.57, seafood +0.57, date_friendly +0.50.
Negative facets: —.
Coherence check: Counter preference is coherent, but correlated small-capacity and solo terms amplify it; breadth must remain separate from format concentration.
Positive breadth: cuisines=3, entropy=0.82, formats=4, price bands=4, atmospheres=3, evidence confidence=1.00.

| Diagnostic dimension | Poles | Left score | Right score |
|---|---|---:|---:|
| Price posture | value-oriented ↔ splurge-comfortable | +0.521 | +0.250 |
| Dining format | compact/counter ↔ table/social | +0.625 | +0.518 |
| Formality | casual/everyday ↔ refined/occasion-led | +0.338 | +0.333 |
| Room energy | intimate/quiet ↔ lively | +0.458 | +0.000 |
| Culinary posture | traditional/regional ↔ creative/chef-led | +0.500 | +0.167 |
| Visit mode | solo-oriented ↔ social/occasion-oriented | +0.615 | +0.562 |

Flat-candidate affinity versus offline alternatives:

| Alternative | Top-10 overlap | Mean absolute change | Largest-change example | Signed change |
|---|---:|---:|---|---:|
| grouped | 10/10 | 0.021 | Kojimachi O-Udon Kai | -0.089 |
| common_downweighted | 8/10 | 0.025 | Kojimachi O-Udon Kai | -0.075 |
| information | 8/10 | 0.043 | Kojimachi O-Udon Kai | -0.164 |

## Diagnostic comparison conclusions

- Grouping the counter/small/solo cluster generally improves interpretability and reduces triple-counting, but it can erase real distinctions between room size, seating, and visit suitability.
- Common-facet down-weighting is gentler than grouping and often preserves rankings, but prevalence is not the same as low usefulness.
- Information weighting can rescue cuisine-specific signals, but it also gives rare, coverage-sensitive review themes disproportionate influence. It is the riskiest direct production candidate without reliability priors.
- The tables above are diagnostics only; current flat behavior remains unchanged.

## Exploratory restaurant clustering

| k | Mean Jaccard silhouette |
|---:|---:|
| 4 | 0.121 |
| 6 | 0.127 |
| 8 | 0.123 |
| 10 | 0.151 |
| 12 | 0.147 |

Best tested k: **10**.

| Cluster | Restaurants | Medoid example | Defining facets (prevalence; lift) |
|---:|---:|---|---|
| 1 | 55 | Sushi Dokoro Umi | `cuisine_sushi` 67%; 4.3×, `seafood` 82%; 3.4×, `counter_seating` 95%; 1.6×, `splurge` 45%; 2.8×, `date_friendly` 53%; 1.8×, `group_friendly` 60%; 1.4× |
| 2 | 22 | Sonosaki | `moderate` 86%; 3.0×, `izakaya` 59%; 2.5× |
| 3 | 27 | Gluon | `budget` 100%; 3.8×, `cuisine_chinese` 15%; 4.3×, `grilled` 15%; 1.2× |
| 4 | 1 | Wonderful Tonight |  |
| 5 | 3 | Ise |  |
| 6 | 5 | PUB Yorimichi | `upscale` 100%; 5.3×, `izakaya` 40%; 1.7× |
| 7 | 16 | Nadeshico | `casual` 56%; 4.4×, `small_capacity` 94%; 1.3×, `izakaya` 50%; 2.1×, `solo_friendly` 75%; 1.4× |
| 8 | 51 | Petit Restaurant Nakajima | `budget` 73%; 2.7×, `table_dining` 75%; 1.7×, `group_friendly` 73%; 1.6×, `solo_friendly` 78%; 1.5×, `neighbourhood` 29%; 2.4×, `noodles` 12%; 3.9× |
| 9 | 27 | Ginza Obi | `private_rooms` 81%; 5.2×, `splurge` 67%; 4.1×, `cuisine_french` 30%; 7.8×, `seasonal` 56%; 3.7×, `date_friendly` 70%; 2.5×, `group_friendly` 85%; 1.9× |
| 10 | 56 | Pin de Port | `moderate` 71%; 2.5×, `solo_friendly` 91%; 1.7×, `counter_seating` 88%; 1.5×, `small_capacity` 91%; 1.3×, `table_dining` 70%; 1.6×, `date_friendly` 36%; 1.3× |

Silhouette is low and some clusters are tiny/singletons, so restaurant clusters are not robust. They mostly expose obvious sushi, price, format, and private-room patterns plus catalog sparsity. This is weak discovery evidence and no evidence of human Types.

## Limitations: what cannot be learned yet

- Restaurant-feature covariance and catalog coverage can be learned now.
- Synthetic profile behavior and diagnostic scoring alternatives can be tested now.
- Actual human preference covariance, stable user archetypes, Type prevalence, and whether users understand proposed dimensions cannot be established without substantial real rating histories and product research.
- Review-derived theme absence means unknown, not false; rare facets may reflect missing research rather than genuine rarity.
- The catalog is curated and geographically/product filtered, so frequencies are not Tokyo-wide restaurant prevalence.

## Implications for Taste V2 and eventual Fiyu Types

Strongest backend dimensions: price posture/range, compact-counter format, table/social format, cuisine hierarchy, and confidence-qualified positive breadth. Atmosphere and traditional/creative dimensions need better coverage before carrying much weight.

Keep technical components—specificity weighting, reliability priors, correlated-feature groups, entropy, and shrinkage—backend-only. Product language should describe coherent preferences, not statistical machinery.

A stable Type should probably require at least 20 current effective ratings plus support across multiple independent dimensions; the existing 10/15 milestones are useful for early evolving Taste, while 20 and subsequent 10-rating intervals are more defensible Type refresh points. This remains a design hypothesis requiring real-user validation.

Potentially meaningful future combinations include price posture × format orientation × cuisine breadth × occasion intensity. Do not generate final Types until real preference covariance and user-language research exist.

## Recommended next research

1. Normalize and quality-review food tags and accepted cuisine terms offline.
2. Collect enough pseudonymized current effective ratings to measure user-level covariance.
3. Validate dimension stability with bootstrap/resampling and held-out ratings.
4. Test grouped/common-weighted diagnostics against prediction, not aesthetics alone.
5. Interview users on understandable language before designing 10–12 Fiyu Types.

Data discovers the axes; product design creates the Types.

No production behavior was changed.
