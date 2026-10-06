# Catalog-floor decision audit

## 1. Executive summary

Recommendation: **LOWER TO 70**.

The data does not show a natural quality cliff at either 68 or 70. A floor of 70 offers the best
measured balance: it adds meaningful catalog breadth and score-range differentiation while avoiding
the weaker 68-69.99 tranche. Floor 68 has fewer remaining rescue candidates, but immediately admits
more lower-scoring rows. Lowering the floor alone never overrides chain, identity, closure,
duplicate, access, or other non-score blocks.

## 2. Current scoring/catalog state

- Total rows: **1203**
- Current production-scored rows: **1092**
- Published: **538**; unpublished: **665**
- Product eligible: **1189**
- Score-only rejected: **507**
- Non-score rejected/blocked scored rows: **47**
- Research/score incomplete: **111**
- V4: **548**; V3 lineage: **544**
- Current publication threshold: **75.0**

| Score version | Count |
|---|---:|
| NULL | 111 |
| public-v3-local-discovery-specialist-tristate | 544 |
| public-v4-quality-research-specialist-tristate | 548 |

| Stored/current rejection classification | Count |
|---|---:|
| closure_replacement_obsolete | 1 |
| confirmed_chain_policy | 20 |
| identity_conflict | 13 |
| other_product_or_access_block | 13 |
| published | 538 |
| research_or_score_incomplete | 111 |
| score_only_rejected | 507 |

## 3. Score distribution

min 48.36, p10 66.19, p25 71.08, median 76.02, mean 75.18, p75 80.28, p90 83.13, max 90.5.

| Band | Count |
|---|---:|
| <60 | 33 |
| 60-64.99 | 51 |
| 65-67.99 | 62 |
| 68-69.99 | 65 |
| 70-72.49 | 133 |
| 72.5-74.99 | 179 |
| 75-79.99 | 271 |
| 80-84.99 | 254 |
| 85-89.99 | 43 |
| 90+ | 1 |

## 4. Floor 75

- Scored at/above: **569**
- Floor-only eligible at/above: **553**
- Immediately newly publishable score-only rejects: **16**
- Non-score-blocked rows at/above: **16**
- Potential catalog size: **553**
- Potential paid V4 set: **361** (high 235, medium 99, marginal 27)
- Mathematically impossible below-floor rejects: **130**
- Scenario crossings median/p75/p90/max: **97 / 145 / 192 / 361**
- All-possible projected workload: **361 calls**, about **953 web actions** and **10583845 tokens**.
## 5. Floor 70

- Scored at/above: **881**
- Floor-only eligible at/above: **861**
- Immediately newly publishable score-only rejects: **323**
- Non-score-blocked rows at/above: **20**
- Potential catalog size: **861**
- Potential paid V4 set: **149** (high 97, medium 40, marginal 12)
- Mathematically impossible below-floor rejects: **35**
- Scenario crossings median/p75/p90/max: **50 / 64 / 76 / 149**
- All-possible projected workload: **149 calls**, about **393 web actions** and **4368401 tokens**.
## 6. Floor 68

- Scored at/above: **946**
- Floor-only eligible at/above: **926**
- Immediately newly publishable score-only rejects: **388**
- Non-score-blocked rows at/above: **20**
- Potential catalog size: **926**
- Potential paid V4 set: **100** (high 73, medium 18, marginal 9)
- Mathematically impossible below-floor rejects: **19**
- Scenario crossings median/p75/p90/max: **26 / 40 / 58 / 100**
- All-possible projected workload: **100 calls**, about **264 web actions** and **2931813 tokens**.

## 7. Borderline-band quality comparison

| Cohort | N | Q median | Q mean | H median | I median | LD median | Rating median | Reviews median | Confidence median |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 65-67.99 | 62 | 52.69 | 52.78 | 71.97 | 97.0 | 74.58 | 4.3 | 58.5 | 87.95 |
| 68-69.99 | 65 | 57.2 | 59.34 | 73.42 | 97.0 | 75.68 | 4.4 | 60.0 | 87.95 |
| 70-72.49 | 133 | 59.03 | 59.93 | 77.2 | 100.0 | 77.62 | 4.4 | 43.0 | 87.95 |
| 72.5-74.99 | 179 | 62.09 | 63.55 | 79.14 | 100.0 | 79.56 | 4.5 | 31.0 | 87.55 |
| 75-79.99 | 271 | 70.09 | 70.79 | 82.78 | 100.0 | 81.14 | 4.6 | 27.0 | 87.15 |
| 80+ | 298 | 80.72 | 81.38 | 80.25 | 100.0 | 79.62 | 4.7 | 40.0 | 87.55 |

The adjacent bands change gradually rather than discontinuously. The detailed JSON includes
component p10/p90 values plus chain, specialist, confidence, and status distributions.

## 8. Score-only rejected population

Confirmed score-only rejects: **507**.

| Band | Count |
|---|---:|
| <60 | 9 |
| 60-64.99 | 50 |
| 65-67.99 | 60 |
| 68-69.99 | 65 |
| 70-72.49 | 130 |
| 72.5-74.99 | 177 |
| >=75 | 16 |

## 9. Maximum-rescuable analysis

The upper bound evaluates the canonical scorer at current Quality and at
`min(100, base Quality + 15)`, then applies only that canonical Quality delta to the current
production score. This preserves all non-Quality inputs and avoids importing unrelated historical
component drift. It is a mathematical ceiling, not a prediction.

Completed-V4 score-only rejects: **0** at every floor, so every paid rescue set excludes all 548
already researched rows.

## 10. Quality-v4 empirical uplift scenarios

- Completed V4 rows: **548**
- Quality adjustment: min 0.0, p10 0.62, p25 2.16, median 3.31, mean 3.42, p75 4.57, p90 5.99, max 9.51
- Final score delta: min 0.0, p10 0.0, p25 0.93, median 1.46, mean 1.48, p75 2.0, p90 2.67, max 4.28
- Scenario adjustments: median **3.31**, p75
  **4.57**, p90 **5.99**, maximum **15**.

## 11. Research workload comparison

Historical mean per completed restaurant: **2.64 web-search
actions**, **27598.53 input tokens**, **1719.61
output tokens**, and **29318.13 total tokens**.

| Floor | Research scope | Calls | Projected web actions | Projected total tokens |
|---:|---|---:|---:|---:|
| 75 | high_only | 235 | 620 | 6889761 |
| 75 | high_plus_medium | 334 | 882 | 9792255 |
| 75 | all_mathematically_possible | 361 | 953 | 10583845 |
| 70 | high_only | 97 | 256 | 2843859 |
| 70 | high_plus_medium | 137 | 362 | 4016584 |
| 70 | all_mathematically_possible | 149 | 393 | 4368401 |
| 68 | high_only | 73 | 193 | 2140223 |
| 68 | high_plus_medium | 91 | 240 | 2667950 |
| 68 | all_mathematically_possible | 100 | 264 | 2931813 |

These are rough workload projections from historical means, not dollar estimates or predicted yield.

## 12. Score-range/selectivity comparison

| Floor | % all scored >= floor | % floor-only eligible >= floor | New publishable | Potential catalog | Public score stddev |
|---:|---:|---:|---:|---:|---:|
| 68 | 86.63 | 88.61 | 388 | 926 | 4.9 |
| 70 | 80.68 | 82.39 | 323 | 861 | 4.53 |
| 75 | 52.11 | 52.92 | 16 | 553 | 2.91 |

| Floor | Min | P10 | P25 | Median | P75 | P90 | Max | SD | 68-69.99 | 70-74.99 | 75-79.99 | 80-84.99 | 85+ |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 75 | 75.04 | 76.99 | 78.32 | 80.17 | 82.55 | 84.51 | 90.5 | 2.91 | 0 (0.0%) | 0 (0.0%) | 260 (47.02%) | 249 (45.03%) | 44 (7.96%) |
| 70 | 70.0 | 71.63 | 73.61 | 78.05 | 81.39 | 83.68 | 90.5 | 4.53 | 0 (0.0%) | 308 (35.77%) | 260 (30.2%) | 249 (28.92%) | 44 (5.11%) |
| 68 | 68.0 | 70.55 | 72.99 | 77.47 | 81.06 | 83.51 | 90.5 | 4.9 | 65 (7.02%) | 308 (33.26%) | 260 (28.08%) | 249 (26.89%) | 44 (4.75%) |

Lower floors materially widen the visible score range (SD rises from the floor-75 value), while 70
retains a higher minimum and a smaller low-end tranche than 68.

## 13. Representative restaurants by band

### 68-69.99

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Taishu Sakana Kubikashige | 68.0 | 58.48 | 78.39 | 76.0 | 74.12 | auto_rejected / score_only_rejected | unknown | unknown | 4.4 / 42 | no | 74.75 |
| Nakaya Sushi | 68.14 | 57.41 | 73.42 | 82.5 | 75.68 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.4 / 62 | no | 74.89 |
| Kappou Shabushabu Atamiya | 68.34 | 59.39 | 55.44 | 100.0 | 73.19 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 34 | no | 75.09 |
| GINZA KOKORO | 68.53 | 97.18 | 17.79 | 79.0 | 41.14 | auto_rejected / score_only_rejected | unknown | specialist | 4.8 / 453 | no | 69.8 |
| KEI Collection PARIS | 68.73 | 74.51 | 51.95 | 82.5 | 60.15 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.6 / 109 | no | 75.48 |
| Jingoge 029 | 68.93 | 51.68 | 73.35 | 100.0 | 78.69 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 82 | no | 75.68 |
| Kuroya Kayabacho | 68.98 | 73.84 | 56.77 | 79.0 | 61.55 | auto_rejected / score_only_rejected | unknown | specialist | 4.6 / 94 | no | 75.73 |
| Tatsuya | 69.13 | 63.58 | 71.99 | 79.0 | 71.5 | auto_rejected / score_only_rejected | unknown | specialist | 4.5 / 40 | no | 75.88 |
| Kotori | 69.27 | 52.45 | 73.5 | 100.0 | 78.56 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 60 | no | 76.02 |
| Sumibiyaki Tojima | 69.38 | 50.88 | 74.82 | 100.0 | 81.04 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 125 | no | 76.13 |
| Omori Yakiniku Halal | 69.53 | 76.06 | 56.01 | 82.5 | 58.12 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.6 / 150 | no | 76.28 |
| Nagasaki Tempura Kouten Ebisu | 69.69 | 86.95 | 32.27 | 82.5 | 53.39 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.7 / 265 | no | 75.56 |
| Shi-chan-yaki | 69.78 | 45.11 | 86.01 | 100.0 | 86.3 | auto_rejected / score_only_rejected | independent_single | specialist | 4.1 / 27 | no | 76.53 |
| Sumibi Yakiniku Akakuro | 69.8 | 58.88 | 63.94 | 100.0 | 74.84 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 103 | no | 76.55 |
| Kasumicho Sanmaruichi no Ichi | 69.99 | 67.81 | 48.95 | 100.0 | 68.55 | auto_rejected / score_only_rejected | independent_single | specialist | 4.5 / 87 | no | 76.74 |
### 70-72.49

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Vin de Rêve | 70.0 | 57.98 | 64.38 | 100.0 | 77.0 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 51 | no | 76.75 |
| d'ici | 70.13 | 74.7 | 42.6 | 100.0 | 60.5 | auto_rejected / score_only_rejected | independent_single | specialist | 4.6 / 114 | no | 76.88 |
| Tochiazuma | 70.32 | 52.79 | 76.4 | 100.0 | 80.43 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 24 | no | 77.07 |
| Delhi's Cafe | 70.55 | 49.21 | 83.84 | 100.0 | 83.31 | auto_rejected / score_only_rejected | independent_single | specialist | 4.2 / 23 | no | 77.3 |
| La Luna Llena | 70.74 | 64.22 | 57.92 | 100.0 | 72.59 | auto_rejected / score_only_rejected | independent_single | specialist | 4.5 / 36 | no | 77.49 |
| Yukari Shokudo | 70.85 | 59.03 | 74.23 | 97.0 | 74.4 | auto_rejected / score_only_rejected | independent_single | unknown | 4.4 / 85 | no | 77.6 |
| GINie CAFE | 70.99 | 73.26 | 57.24 | 82.5 | 68.25 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.8 / 21 | no | 77.74 |
| Donnamondai Sangenjaya | 71.16 | 69.98 | 63.53 | 79.5 | 72.84 | needs_review / identity_conflict | small_group_distinct_concept | unknown | 4.6 / 18 | yes | 71.16 |
| Mikawaya | 71.3 | 52.95 | 78.74 | 100.0 | 82.63 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 21 | no | 78.05 |
| Sushi Hanaoka | 71.59 | 78.05 | 45.1 | 100.0 | 58.82 | auto_rejected / score_only_rejected | independent_single | specialist | 4.6 / 278 | no | 78.34 |
| Fukufuku | 71.89 | 53.44 | 81.44 | 100.0 | 82.5 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 46 | no | 78.64 |
| Yoyogi Imahan | 72.01 | 68.4 | 55.21 | 100.0 | 71.81 | auto_rejected / score_only_rejected | independent_single | specialist | 4.5 / 158 | no | 78.76 |
| Tsukiji Ihachi Nigo | 72.2 | 75.63 | 64.73 | 75.0 | 68.82 | auto_rejected / score_only_rejected | unknown | specialist | 4.7 / 44 | no | 78.95 |
| Petit Restaurant Tomy | 72.38 | 58.77 | 73.03 | 100.0 | 79.9 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 59 | no | 79.13 |
| Ashiato | 72.49 | 47.57 | 93.11 | 97.0 | 90.27 | auto_rejected / score_only_rejected | independent_single | unknown | 4.1 / 15 | no | 79.24 |
### 72.5-74.99

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Donbee | 72.51 | 71.37 | 75.8 | 76.0 | 70.48 | auto_rejected / score_only_rejected | unknown | unknown | 4.6 / 44 | no | 79.26 |
| Kensō Noodle Villa Ikebukuro | 72.64 | 74.03 | 77.11 | 67.0 | 70.84 | auto_rejected / score_only_rejected | unknown | specialist | 4.6 / 77 | no | 79.39 |
| Shigeru | 72.84 | 51.41 | 93.96 | 97.0 | 84.25 | auto_rejected / score_only_rejected | independent_single | unknown | 4.2 / 13 | no | 79.59 |
| Okonomiyaki and Monja Anzu no Sato | 73.0 | 58.73 | 72.67 | 100.0 | 82.68 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 58 | no | 79.75 |
| Komekobo | 73.14 | 47.58 | 95.21 | 100.0 | 89.8 | auto_rejected / score_only_rejected | independent_single | specialist | 4.1 / 19 | no | 79.89 |
| Qiqihar Barbecue | 73.32 | 65.17 | 83.33 | 79.0 | 78.59 | auto_rejected / score_only_rejected | unknown | specialist | 4.5 / 63 | no | 80.07 |
| Daruma-ya | 73.46 | 58.34 | 78.39 | 100.0 | 81.78 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 60 | no | 80.21 |
| Shichirin no Shokutaku | 73.66 | 48.82 | 95.0 | 100.0 | 89.75 | auto_rejected / score_only_rejected | independent_single | specialist | 4.2 / 29 | no | 80.41 |
| Genki Club | 73.78 | 61.33 | 95.6 | 76.0 | 81.76 | auto_rejected / score_only_rejected | unknown | unknown | 4.5 / 14 | no | 80.53 |
| Kalka Dining & Bar | 73.91 | 61.81 | 88.0 | 79.0 | 84.18 | auto_rejected / score_only_rejected | unknown | specialist | 4.5 / 20 | no | 80.66 |
| Hanaori | 74.18 | 72.81 | 58.73 | 100.0 | 70.41 | auto_rejected / score_only_rejected | independent_single | specialist | 4.7 / 27 | no | 80.93 |
| Sakedokoro Ichiyoshi | 74.43 | 57.87 | 85.62 | 97.0 | 83.96 | auto_rejected / score_only_rejected | independent_single | unknown | 4.4 / 82 | no | 81.18 |
| Sugawara Abura Shoten | 74.61 | 59.64 | 93.68 | 82.5 | 85.38 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.4 / 78 | no | 81.36 |
| Mocchi | 74.81 | 61.08 | 96.36 | 76.0 | 85.88 | auto_rejected / score_only_rejected | unknown | unknown | 4.5 / 22 | no | 81.56 |
| Onigiri BG's | 74.99 | 67.08 | 71.88 | 100.0 | 76.07 | auto_rejected / score_only_rejected | independent_single | specialist | 4.6 / 28 | no | 81.74 |
### 75-77.49

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Shijimi | 75.04 | 53.28 | 95.61 | 97.0 | 88.69 | auto_rejected / score_only_rejected | independent_single | unknown | 4.1 / 7 | no | 81.79 |
| Satoharu | 75.3 | 53.55 | 96.16 | 97.0 | 88.9 | auto_rejected / score_only_rejected | independent_single | unknown | 4.2 / 6 | no | 82.05 |
| Bella Rouge | 75.54 | 61.74 | 84.78 | 97.0 | 81.95 | auto_rejected / score_only_rejected | independent_single | unknown | 4.5 / 11 | no | 82.29 |
| Yurippe | 75.99 | 53.94 | 93.52 | 97.0 | 92.54 | auto_published / published | independent_single | unknown | 4.2 / 13 | yes | 75.99 |
| Wagokoro Akari | 76.19 | 78.55 | 66.82 | 82.5 | 73.76 | auto_published / published | small_group_distinct_concept | specialist | 4.8 / 25 | yes | 76.19 |
| Wine Dining Luonto | 76.55 | 65.64 | 80.23 | 100.0 | 79.92 | auto_published / published | independent_single | specialist | 4.5 / 42 | yes | 76.55 |
| Kisanji | 76.74 | 62.28 | 82.11 | 100.0 | 85.6 | auto_published / published | independent_single | specialist | 4.4 / 22 | yes | 76.74 |
| Wakasugi | 76.81 | 62.0 | 81.53 | 100.0 | 86.73 | auto_published / published | independent_single | specialist | 4.4 / 70 | yes | 76.81 |
| Ramen Kaikouya | 76.92 | 62.3 | 97.3 | 82.5 | 87.68 | auto_published / published | small_group_distinct_concept | specialist | 4.4 / 22 | yes | 76.92 |
| Izakaya Fukagawa | 77.04 | 65.43 | 84.2 | 97.0 | 81.67 | auto_published / published | independent_single | unknown | 4.5 / 30 | yes | 77.04 |
| Kazu | 77.14 | 70.38 | 92.63 | 76.0 | 80.69 | auto_published / published | unknown | unknown | 4.8 / 11 | yes | 77.14 |
| Bisho | 77.27 | 63.42 | 91.99 | 97.0 | 81.53 | auto_published / published | independent_single | unknown | 4.5 / 21 | yes | 77.27 |
| Asian Kitchen Curry Kodo: Spice Aroma | 77.33 | 72.13 | 92.64 | 79.0 | 76.5 | auto_published / published | unknown | specialist | 4.7 / 23 | yes | 77.33 |
| Manali | 77.44 | 69.85 | 79.84 | 97.0 | 77.91 | auto_published / published | independent_single | unknown | 4.5 / 98 | yes | 77.44 |
| Cafe Hale Aina | 77.49 | 64.28 | 87.48 | 97.0 | 83.55 | auto_published / published | independent_single | unknown | 4.5 / 21 | yes | 77.49 |

## 14. Human-review shortlist

### 68-69.99

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Taishu Sakana Kubikashige | 68.0 | 58.48 | 78.39 | 76.0 | 74.12 | auto_rejected / score_only_rejected | unknown | unknown | 4.4 / 42 | no | 74.75 |
| Nakaya Sushi | 68.14 | 57.41 | 73.42 | 82.5 | 75.68 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.4 / 62 | no | 74.89 |
| Kappou Shabushabu Atamiya | 68.34 | 59.39 | 55.44 | 100.0 | 73.19 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 34 | no | 75.09 |
| GINZA KOKORO | 68.53 | 97.18 | 17.79 | 79.0 | 41.14 | auto_rejected / score_only_rejected | unknown | specialist | 4.8 / 453 | no | 69.8 |
| KEI Collection PARIS | 68.73 | 74.51 | 51.95 | 82.5 | 60.15 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.6 / 109 | no | 75.48 |
| Jingoge 029 | 68.93 | 51.68 | 73.35 | 100.0 | 78.69 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 82 | no | 75.68 |
| Kuroya Kayabacho | 68.98 | 73.84 | 56.77 | 79.0 | 61.55 | auto_rejected / score_only_rejected | unknown | specialist | 4.6 / 94 | no | 75.73 |
| Tatsuya | 69.13 | 63.58 | 71.99 | 79.0 | 71.5 | auto_rejected / score_only_rejected | unknown | specialist | 4.5 / 40 | no | 75.88 |
| Kotori | 69.27 | 52.45 | 73.5 | 100.0 | 78.56 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 60 | no | 76.02 |
| Sumibiyaki Tojima | 69.38 | 50.88 | 74.82 | 100.0 | 81.04 | auto_rejected / score_only_rejected | independent_single | specialist | 4.3 / 125 | no | 76.13 |
| Omori Yakiniku Halal | 69.53 | 76.06 | 56.01 | 82.5 | 58.12 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.6 / 150 | no | 76.28 |
| Nagasaki Tempura Kouten Ebisu | 69.69 | 86.95 | 32.27 | 82.5 | 53.39 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.7 / 265 | no | 75.56 |
| Shi-chan-yaki | 69.78 | 45.11 | 86.01 | 100.0 | 86.3 | auto_rejected / score_only_rejected | independent_single | specialist | 4.1 / 27 | no | 76.53 |
| Sumibi Yakiniku Akakuro | 69.8 | 58.88 | 63.94 | 100.0 | 74.84 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 103 | no | 76.55 |
| Kasumicho Sanmaruichi no Ichi | 69.99 | 67.81 | 48.95 | 100.0 | 68.55 | auto_rejected / score_only_rejected | independent_single | specialist | 4.5 / 87 | no | 76.74 |
### 70-71.99

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Vin de Rêve | 70.0 | 57.98 | 64.38 | 100.0 | 77.0 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 51 | no | 76.75 |
| LaiMai Sendagaya Kitchen | 70.07 | 52.49 | 94.84 | 78.5 | 81.78 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.1 / 10 | no | 76.82 |
| Sushi Ito Ikkan | 70.21 | 66.93 | 53.93 | 100.0 | 68.0 | auto_rejected / score_only_rejected | independent_single | specialist | 4.5 / 68 | no | 76.96 |
| TenCups Cafe Bar & Lounge | 70.38 | 78.78 | 40.98 | 97.0 | 56.95 | auto_rejected / score_only_rejected | independent_single | unknown | 4.6 / 464 | no | 77.13 |
| Ureshino | 70.56 | 41.91 | 92.47 | 100.0 | 91.32 | auto_rejected / score_only_rejected | independent_single | specialist | 4.0 / 23 | no | 77.31 |
| Hashigo | 70.71 | 41.91 | 98.95 | 97.0 | 89.85 | auto_rejected / score_only_rejected | independent_single | unknown | 4.0 / 23 | no | 77.46 |
| Shibata | 70.8 | 66.62 | 77.2 | 76.0 | 71.36 | auto_rejected / score_only_rejected | unknown | unknown | 4.6 / 23 | no | 77.55 |
| Jingisukan Specialty Restaurant Shiki Sakaba RAM CHAN | 70.89 | 71.08 | 73.36 | 79.0 | 64.22 | auto_rejected / score_only_rejected | unknown | specialist | 4.6 / 54 | no | 77.64 |
| Yakitori Oonoya Kazuchan | 71.0 | 72.09 | 47.23 | 100.0 | 65.92 | auto_rejected / score_only_rejected | independent_single | specialist | 4.6 / 60 | no | 77.75 |
| Akari | 71.13 | 58.18 | 71.79 | 100.0 | 76.73 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 52 | no | 77.88 |
| Yakitori Inaka | 71.27 | 46.14 | 91.15 | 100.0 | 87.34 | auto_rejected / score_only_rejected | independent_single | specialist | 4.1 / 19 | no | 78.02 |
| Mahoroba | 71.47 | 51.58 | 86.26 | 97.0 | 83.07 | auto_rejected / score_only_rejected | independent_single | unknown | 4.3 / 57 | no | 78.22 |
| Shibaura Sushi Wasabi | 71.71 | 64.44 | 76.41 | 82.5 | 75.5 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.6 / 19 | no | 78.46 |
| HAMAMORI | 71.9 | 66.62 | 62.7 | 100.0 | 70.07 | auto_rejected / score_only_rejected | independent_single | specialist | 4.5 / 107 | no | 78.65 |
| Fukurou (Fukuro) | 71.98 | 49.18 | 84.22 | 97.0 | 90.65 | auto_rejected / score_only_rejected | independent_single | unknown | 4.0 / 6 | no | 78.73 |
### 73-74.99

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Tempura Tokusen | 73.0 | 59.79 | 77.13 | 100.0 | 78.11 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 153 | no | 79.75 |
| Maguro no Shimahara Plus Ogawamachi | 73.1 | 80.67 | 60.82 | 70.5 | 68.41 | auto_rejected / score_only_rejected | small_group_distinct_concept | specialist | 4.7 / 92 | no | 79.85 |
| Nihonshu × Wine Nonbee Ebisu | 73.23 | 67.71 | 64.5 | 97.0 | 74.16 | auto_rejected / score_only_rejected | independent_single | unknown | 4.5 / 101 | no | 79.98 |
| Vario | 73.38 | 45.81 | 97.78 | 97.0 | 94.19 | auto_rejected / score_only_rejected | independent_single | unknown | 4.0 / 15 | no | 80.13 |
| Sushiya no Sacchan | 73.47 | 52.35 | 83.64 | 100.0 | 89.46 | auto_rejected / score_only_rejected | independent_single | specialist | 4.2 / 12 | no | 80.22 |
| Wagashi Tsukasa Tokiwaya | 73.64 | 59.39 | 77.0 | 100.0 | 81.46 | auto_rejected / score_only_rejected | independent_single | specialist | 4.4 / 34 | no | 80.39 |
| Restaurant Ivy | 73.74 | 59.06 | 85.2 | 97.0 | 79.33 | auto_rejected / score_only_rejected | independent_single | unknown | 4.4 / 11 | no | 80.49 |
| Iitoco | 73.81 | 64.87 | 72.53 | 97.0 | 76.75 | auto_rejected / score_only_rejected | independent_single | unknown | 4.5 / 44 | no | 80.56 |
| Darumaya Shokudo | 73.99 | 58.42 | 83.48 | 97.0 | 82.53 | auto_rejected / score_only_rejected | independent_single | unknown | 4.4 / 39 | no | 80.74 |
| Hanaori | 74.18 | 72.81 | 58.73 | 100.0 | 70.41 | auto_rejected / score_only_rejected | independent_single | specialist | 4.7 / 27 | no | 80.93 |
| BAR So | 74.36 | 68.99 | 70.4 | 97.0 | 72.83 | auto_rejected / score_only_rejected | independent_single | unknown | 4.6 / 28 | no | 81.11 |
| Choya | 74.48 | 61.19 | 82.22 | 97.0 | 80.26 | auto_rejected / score_only_rejected | independent_single | unknown | 4.5 / 21 | no | 81.23 |
| Kohrinbou | 74.74 | 75.91 | 52.26 | 100.0 | 70.95 | auto_rejected / score_only_rejected | independent_single | specialist | 4.6 / 136 | no | 81.49 |
| Sapporo Ramen Tanukikoji | 74.84 | 49.25 | 98.4 | 100.0 | 91.69 | auto_rejected / score_only_rejected | independent_single | specialist | 4.1 / 9 | no | 81.59 |
| Onigiri BG's | 74.99 | 67.08 | 71.88 | 100.0 | 76.07 | auto_rejected / score_only_rejected | independent_single | specialist | 4.6 / 28 | no | 81.74 |
### 75-76.99

| Restaurant | Score | Q | H | I | LD | Status | Chain | Specialist | Rating / reviews | V4 | Max V4 |
|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| Shijimi | 75.04 | 53.28 | 95.61 | 97.0 | 88.69 | auto_rejected / score_only_rejected | independent_single | unknown | 4.1 / 7 | no | 81.79 |
| Koryori Kisui | 75.25 | 56.37 | 93.38 | 97.0 | 85.29 | auto_rejected / score_only_rejected | independent_single | unknown | 4.3 / 11 | no | 82.0 |
| Kushiyaki Torihiko | 75.45 | 57.57 | 89.0 | 100.0 | 84.76 | auto_published / published | independent_single | specialist | 4.4 / 14 | yes | 75.45 |
| Bella Rouge | 75.54 | 61.74 | 84.78 | 97.0 | 81.95 | auto_rejected / score_only_rejected | independent_single | unknown | 4.5 / 11 | no | 82.29 |
| Asian Food Restaurant Hana | 75.77 | 76.94 | 80.78 | 76.0 | 70.51 | auto_rejected / score_only_rejected | unknown | unknown | 4.7 / 45 | no | 82.52 |
| Ajidokoro Goshiki | 76.01 | 55.73 | 95.3 | 97.0 | 88.36 | auto_published / published | independent_single | unknown | 4.4 / 5 | yes | 76.01 |
| Asakusa Kōchan | 76.15 | 55.12 | 94.01 | 97.0 | 90.78 | auto_published / published | independent_single | unknown | 4.3 / 21 | yes | 76.15 |
| Pappusan | 76.37 | 64.84 | 78.45 | 100.0 | 81.71 | auto_published / published | independent_single | specialist | 4.5 / 35 | yes | 76.37 |
| Kunichan no Mise | 76.45 | 66.11 | 92.18 | 76.0 | 85.89 | auto_published / published | unknown | unknown | 4.6 / 16 | yes | 76.45 |
| Kunihachi | 76.66 | 70.58 | 87.81 | 79.0 | 79.5 | auto_published / published | unknown | specialist | 4.6 / 21 | yes | 76.66 |
| Kisanji | 76.74 | 62.28 | 82.11 | 100.0 | 85.6 | auto_published / published | independent_single | specialist | 4.4 / 22 | yes | 76.74 |
| Sushi Akizuki | 76.81 | 76.63 | 56.98 | 100.0 | 75.1 | auto_published / published | independent_single | specialist | 4.6 / 55 | yes | 76.81 |
| DD Kitchen | 76.85 | 62.6 | 87.95 | 97.0 | 83.77 | auto_published / published | independent_single | unknown | 4.5 / 25 | yes | 76.85 |
| Ramen Kaikouya | 76.92 | 62.3 | 97.3 | 82.5 | 87.68 | auto_published / published | small_group_distinct_concept | specialist | 4.4 / 22 | yes | 76.92 |
| Shiden to Sakana to, Fukukawa | 76.99 | 69.93 | 72.94 | 100.0 | 78.33 | auto_published / published | independent_single | specialist | 4.7 / 22 | yes | 76.99 |

## 15. Recommendation

**LOWER TO 70** — 70 materially broadens the usable catalog and score range while avoiding the weaker 68-69.99 tranche. Although 68 would require fewer rescue-research calls, its extra 65 immediate admissions have lower median Quality, Hiddenness, and Local Discovery than the 70-72.49 cohort, without revealing a natural cutoff.

Next step: Perform human review of the saved 68-76.99 shortlist, then in a separate change update only the publication threshold to 70 and run a dry-run publication reconciliation before changing membership.

## 16. DB integrity and no-mutation confirmation

SQLite integrity: **ok**. The database was opened read-only
with `query_only`. Database SHA-256 before/after:
**3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7 / 3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7**.
`seed70.txt` SHA-256 before/after:
**BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39 / BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39**.
Both are unchanged. Network/paid requests: **0**.
