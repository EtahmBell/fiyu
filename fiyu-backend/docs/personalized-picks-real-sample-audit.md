# Personalized Picks real-catalog sample audit

> Evaluation-only artifact. It contains no real account identifiers or private notes. The local database had no usable rating histories, so profiles are synthetic while all restaurant candidates and catalog fields are real.

## Methodology and safety

- Catalog: 263 current eligible restaurants from `data\fiyu.db`.
- Profiles: synthetic ratings over real catalog restaurants; local real visit rows found: 0.
- View: static profile; simulated Picks are not fed back into history.
- Cycles per profile: 6.
- The source database was opened in SQLite read-only mode; selection ran against a temporary minimal catalog clone.
- Persistent state hashes unchanged: **True**.
- No assignment, reveal, seen, Saved, rating, visit, or Recent Discovery mutation function was called.

## Profile A — no history

Distinct ratings: **0**; personalization confidence: **0.00**; known-price evidence: **0**; price confidence: **0.00**; relaxation: **0.000**.

Positive facets: —

Negative facets: —

Budget affinities: affordable **0.00**; higher-price **0.00**.

### Set metrics

| Cycle / seed | Mean Fiyu | Mean / min affinity | Facet diversity | Exploration | Affordable | Price spread | New vs legacy |
|---|---:|---:|---:|---|---|---:|---|
| cycle-1 / 2026100100 | 85.27 | 0.000 / 0.000 | 0 | n/a | 1 (not applied) | — | 0 |
| cycle-2 / 2026100101 | 81.98 | 0.000 / 0.000 | 0 | n/a | 1 (not applied) | 6000.0 | 0 |
| cycle-3 / 2026100102 | 81.43 | 0.000 / 0.000 | 0 | n/a | 1 (not applied) | 6000.0 | 0 |
| cycle-4 / 2026100103 | 80.21 | 0.000 / 0.000 | 0 | n/a | 1 (not applied) | 5999.0 | 0 |
| cycle-5 / 2026100104 | 80.58 | 0.000 / 0.000 | 0 | n/a | 1 (not applied) | 5000.0 | 0 |
| cycle-6 / 2026100105 | 77.62 | 0.000 / 0.000 | 0 | n/a | 1 (not applied) | 5999.0 | 0 |

### Picks

| Cycle | Pos. | Restaurant | Fiyu | Price range | Affinity | Strength | Role | Positive matches | Negative matches | Affordability |
|---|---:|---|---:|---:|---:|---:|---|---|---|---|
| cycle-1 | 1 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.000 | 0.00 | legacy | — | — | none |
| cycle-1 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-1 | 3 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.000 | 0.00 | legacy | — | — | none |
| cycle-2 | 1 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.000 | 0.00 | legacy | — | — | none |
| cycle-2 | 2 | Toakari (`ChIJgVIRH1-LGGARYthNR8MzNg8`) | 73.6 | ¥3,000–¥8,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-2 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-3 | 1 | Toakari (`ChIJgVIRH1-LGGARYthNR8MzNg8`) | 73.6 | ¥3,000–¥8,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-3 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-3 | 3 | Sushizen (`ChIJIxdui16LGGAR6dA-SGEjgjs`) | 83.2 | unknown | 0.000 | 0.00 | legacy | — | — | none |
| cycle-4 | 1 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.000 | 0.00 | legacy | — | — | none |
| cycle-4 | 2 | YEBISU YAOYA (`ChIJY4YMmEyLGGARTSiyDzgEfGo`) | 67.1 | ¥6,000–¥7,999 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-4 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-5 | 1 | Bodega (`ChIJc-xwjZeMGGARXapLK9qtsvc`) | 78.3 | ¥3,000–¥7,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-5 | 2 | Hong Kong Room GOUKA (`ChIJ4WqguWSLGGAR2PeK-xhlYT4`) | 76.0 | ¥10,000+ | 0.000 | 0.00 | legacy | — | — | none |
| cycle-5 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-6 | 1 | YEBISU YAOYA (`ChIJY4YMmEyLGGARTSiyDzgEfGo`) | 67.1 | ¥6,000–¥7,999 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-6 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.000 | 0.00 | legacy | — | — | none |
| cycle-6 | 3 | Bodega (`ChIJc-xwjZeMGGARXapLK9qtsvc`) | 78.3 | ¥3,000–¥7,000 | 0.000 | 0.00 | legacy | — | — | none |

Unique restaurants across cycles: **9** of 18 Pick positions.

Repeated IDs: `{"ChIJWyTt9l6LGGARViDmY9O-UO4": 2, "ChIJY4YMmEyLGGARTSiyDzgEfGo": 2, "ChIJc-xwjZeMGGARXapLK9qtsvc": 2, "ChIJgVIRH1-LGGARYthNR8MzNg8": 2, "ChIJt2QEWDmNGGARvJ5tMBSBCqI": 6}`

### Legacy comparison (first two cycles)

| Cycle | Legacy mean Fiyu / affinity | Personalized mean Fiyu / affinity | Changed personalized picks (role) |
|---|---:|---:|---|
| cycle-1 | 85.27 / 0.000 | 85.27 / 0.000 | — |
| cycle-2 | 81.98 / 0.000 | 81.98 / 0.000 | — |

## Profile B — sparse sushi/counter

Distinct ratings: **2**; personalization confidence: **0.20**; known-price evidence: **2**; price confidence: **0.00**; relaxation: **0.000**.

Positive facets: counter_seating (0.33), cuisine_sushi (0.33), moderate (0.33), private_rooms (0.33), seafood (0.33), small_capacity (0.33)

Negative facets: grilled (-0.17), table_dining (-0.17), upscale (-0.17)

Budget affinities: affordable **0.00**; higher-price **0.12**.

### Set metrics

| Cycle / seed | Mean Fiyu | Mean / min affinity | Facet diversity | Exploration | Affordable | Price spread | New vs legacy |
|---|---:|---:|---:|---|---|---:|---|
| cycle-1 / 2026101100 | 86.12 | 0.053 / 0.033 | 7 | non-negative | 1 (forced) | — | 1 |
| cycle-2 / 2026101101 | 83.40 | 0.050 / 0.031 | 5 | non-negative | 1 (forced) | 12999.0 | 0 |
| cycle-3 / 2026101102 | 80.79 | 0.043 / 0.017 | 7 | non-negative | 1 (forced) | 7000.0 | 0 |
| cycle-4 / 2026101103 | 83.30 | 0.045 / 0.017 | 5 | non-negative | 1 (forced) | 7000.0 | 1 |
| cycle-5 / 2026101104 | 83.35 | 0.067 / 0.067 | 5 | non-negative | 1 (natural) | — | 1 |
| cycle-6 / 2026101105 | 84.07 | 0.057 / 0.038 | 6 | non-negative | 1 (forced) | — | 0 |

### Picks

| Cycle | Pos. | Restaurant | Fiyu | Price range | Affinity | Strength | Role | Positive matches | Negative matches | Affordability |
|---|---:|---|---:|---:|---:|---:|---|---|---|---|
| cycle-1 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.067 | 0.20 | strong_affinity | counter_seating, small_capacity, solo_friendly | — | forced |
| cycle-1 | 2 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.033 | 0.20 | moderate_or_novel | seafood, small_capacity | table_dining | none |
| cycle-1 | 3 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.060 | 0.20 | exploration | counter_seating, cuisine_sushi, group_friendly, private_rooms, seafood, small_capacity | — | none |
| cycle-2 | 1 | Matsushima (`ChIJlxnWE0jzGGARf4AD0zzBcRE`) | 79.2 | ¥10,000–¥14,999 | 0.031 | 0.20 | exploration | counter_seating, group_friendly, small_capacity | table_dining | none |
| cycle-2 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.067 | 0.20 | strong_affinity | counter_seating, small_capacity, solo_friendly | — | forced |
| cycle-2 | 3 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.053 | 0.20 | moderate_or_novel | group_friendly, private_rooms, small_capacity | — | none |
| cycle-3 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.067 | 0.20 | strong_affinity | counter_seating, small_capacity, solo_friendly | — | forced |
| cycle-3 | 2 | Hong Kong Room GOUKA (`ChIJ4WqguWSLGGAR2PeK-xhlYT4`) | 76.0 | ¥10,000+ | 0.046 | 0.20 | exploration | counter_seating, group_friendly, private_rooms, seafood, small_capacity, traditional | table_dining | none |
| cycle-3 | 3 | Toritoshi (`ChIJ8xZ4XxSLGGARCv6nIp56DNU`) | 78.9 | ¥4,000–¥9,000 | 0.017 | 0.20 | moderate_or_novel | counter_seating, small_capacity, solo_friendly | grilled, table_dining, upscale | none |
| cycle-4 | 1 | Toritoshi (`ChIJ8xZ4XxSLGGARCv6nIp56DNU`) | 78.9 | ¥4,000–¥9,000 | 0.017 | 0.20 | exploration | counter_seating, small_capacity, solo_friendly | grilled, table_dining, upscale | none |
| cycle-4 | 2 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.053 | 0.20 | moderate_or_novel | group_friendly, private_rooms, small_capacity | — | none |
| cycle-4 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.067 | 0.20 | strong_affinity | counter_seating, small_capacity, solo_friendly | — | forced |
| cycle-5 | 1 | Tempura Motoyoshi (`ChIJ3cFPK-aLGGARNaz58SuwM7M`) | 79.4 | ¥10,000+ | 0.067 | 0.20 | exploration | counter_seating, small_capacity | — | none |
| cycle-5 | 2 | Sushizen (`ChIJIxdui16LGGAR6dA-SGEjgjs`) | 83.2 | unknown | 0.067 | 0.20 | strong_affinity | counter_seating, cuisine_sushi, seafood, small_capacity, solo_friendly | — | none |
| cycle-5 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.067 | 0.20 | moderate_or_novel | counter_seating, small_capacity, solo_friendly | — | natural |
| cycle-6 | 1 | Sushizen (`ChIJIxdui16LGGAR6dA-SGEjgjs`) | 83.2 | unknown | 0.067 | 0.20 | strong_affinity | counter_seating, cuisine_sushi, seafood, small_capacity, solo_friendly | — | none |
| cycle-6 | 2 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.038 | 0.20 | exploration | counter_seating, group_friendly, small_capacity, solo_friendly | table_dining | none |
| cycle-6 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.067 | 0.20 | moderate_or_novel | counter_seating, small_capacity, solo_friendly | — | forced |

Unique restaurants across cycles: **10** of 18 Pick positions.

Repeated IDs: `{"ChIJ8xZ4XxSLGGARCv6nIp56DNU": 2, "ChIJH6lmIlyLGGARLAeWbu-mdzQ": 2, "ChIJIxdui16LGGAR6dA-SGEjgjs": 2, "ChIJt2QEWDmNGGARvJ5tMBSBCqI": 6}`

### Legacy comparison (first two cycles)

| Cycle | Legacy mean Fiyu / affinity | Personalized mean Fiyu / affinity | Changed personalized picks (role) |
|---|---:|---:|---|
| cycle-1 | 81.98 / 0.042 | 86.12 / 0.053 | Tsumuguito (exploration) |
| cycle-2 | 83.40 / 0.050 | 83.40 / 0.050 | — |

## Profile C — medium sushi/counter

Distinct ratings: **6**; personalization confidence: **0.60**; known-price evidence: **5**; price confidence: **0.00**; relaxation: **0.000**.

Positive facets: counter_seating (0.50), cuisine_sushi (0.50), seafood (0.50), traditional (0.40), reservation_heavy (0.33), small_capacity (0.33)

Negative facets: grilled (-0.25), izakaya (-0.17), upscale (-0.17), table_dining (-0.10)

Budget affinities: affordable **0.17**; higher-price **0.08**.

### Set metrics

| Cycle / seed | Mean Fiyu | Mean / min affinity | Facet diversity | Exploration | Affordable | Price spread | New vs legacy |
|---|---:|---:|---:|---|---|---:|---|
| cycle-1 / 2026102100 | 83.09 | 0.110 / 0.027 | 9 | non-negative | 1 (forced) | 5000.0 | 1 |
| cycle-2 / 2026102101 | 80.91 | 0.154 / 0.130 | 10 | non-negative | 1 (forced) | — | 1 |
| cycle-3 / 2026102102 | 84.72 | 0.165 / 0.130 | 11 | non-negative | 1 (forced) | — | 2 |
| cycle-4 / 2026102103 | 85.68 | 0.171 / 0.130 | 12 | non-negative | 1 (forced) | — | 1 |
| cycle-5 / 2026102104 | 85.68 | 0.171 / 0.130 | 12 | non-negative | 1 (natural) | — | 0 |
| cycle-6 / 2026102105 | 84.72 | 0.165 / 0.130 | 11 | non-negative | 1 (forced) | — | 2 |

### Picks

| Cycle | Pos. | Restaurant | Fiyu | Price range | Affinity | Strength | Role | Positive matches | Negative matches | Affordability |
|---|---:|---|---:|---:|---:|---:|---|---|---|---|
| cycle-1 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.130 | 0.60 | moderate_or_novel | budget, counter_seating, small_capacity, solo_friendly | izakaya | forced |
| cycle-1 | 2 | Bodega (`ChIJc-xwjZeMGGARXapLK9qtsvc`) | 78.3 | ¥3,000–¥7,000 | 0.027 | 0.60 | exploration | group_friendly, intimate, small_capacity | izakaya, table_dining, upscale | none |
| cycle-1 | 3 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.172 | 0.60 | strong_affinity | group_friendly, intimate, private_rooms, reservation_heavy, small_capacity, splurge | — | none |
| cycle-2 | 1 | Ushi Hana (`ChIJO0M3Bd-LGGARrqn_cJep2j8`) | 71.8 | ¥10,000+ | 0.161 | 0.60 | exploration | date_friendly, group_friendly, private_rooms, small_capacity, splurge | — | none |
| cycle-2 | 2 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.172 | 0.60 | strong_affinity | group_friendly, intimate, private_rooms, reservation_heavy, small_capacity, splurge | — | none |
| cycle-2 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.130 | 0.60 | moderate_or_novel | budget, counter_seating, small_capacity, solo_friendly | izakaya | forced |
| cycle-3 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.130 | 0.60 | moderate_or_novel | budget, counter_seating, small_capacity, solo_friendly | izakaya | forced |
| cycle-3 | 2 | Sushizen (`ChIJIxdui16LGGAR6dA-SGEjgjs`) | 83.2 | unknown | 0.193 | 0.60 | strong_affinity | counter_seating, cuisine_sushi, intimate, seafood, small_capacity, solo_friendly | — | none |
| cycle-3 | 3 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.172 | 0.60 | exploration | group_friendly, intimate, private_rooms, reservation_heavy, small_capacity, splurge | — | none |
| cycle-4 | 1 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.212 | 0.60 | strong_affinity | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |
| cycle-4 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.130 | 0.60 | moderate_or_novel | budget, counter_seating, small_capacity, solo_friendly | izakaya | forced |
| cycle-4 | 3 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.172 | 0.60 | exploration | group_friendly, intimate, private_rooms, reservation_heavy, small_capacity, splurge | — | none |
| cycle-5 | 1 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.212 | 0.60 | strong_affinity | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |
| cycle-5 | 2 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.172 | 0.60 | moderate_or_novel | group_friendly, intimate, private_rooms, reservation_heavy, small_capacity, splurge | — | none |
| cycle-5 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.130 | 0.60 | exploration | budget, counter_seating, small_capacity, solo_friendly | izakaya | natural |
| cycle-6 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.130 | 0.60 | exploration | budget, counter_seating, small_capacity, solo_friendly | izakaya | forced |
| cycle-6 | 2 | Vini di Arai (`ChIJH6lmIlyLGGARLAeWbu-mdzQ`) | 83.5 | ¥10,000+ | 0.172 | 0.60 | moderate_or_novel | group_friendly, intimate, private_rooms, reservation_heavy, small_capacity, splurge | — | none |
| cycle-6 | 3 | Sushizen (`ChIJIxdui16LGGAR6dA-SGEjgjs`) | 83.2 | unknown | 0.193 | 0.60 | strong_affinity | counter_seating, cuisine_sushi, intimate, seafood, small_capacity, solo_friendly | — | none |

Unique restaurants across cycles: **6** of 18 Pick positions.

Repeated IDs: `{"ChIJH6lmIlyLGGARLAeWbu-mdzQ": 6, "ChIJIxdui16LGGAR6dA-SGEjgjs": 2, "ChIJJ8H-e-yLGGAR2MBsf1b9U38": 2, "ChIJt2QEWDmNGGARvJ5tMBSBCqI": 6}`

### Legacy comparison (first two cycles)

| Cycle | Legacy mean Fiyu / affinity | Personalized mean Fiyu / affinity | Changed personalized picks (role) |
|---|---:|---:|---|
| cycle-1 | 84.18 / 0.149 | 83.09 / 0.110 | Bodega (exploration) |
| cycle-2 | 80.26 / 0.145 | 80.91 / 0.154 | Vini di Arai (strong_affinity) |

## Profile D — mature expensive

Distinct ratings: **10**; personalization confidence: **1.00**; known-price evidence: **10**; price confidence: **1.00**; relaxation: **0.800**.

Positive facets: upscale (0.80), table_dining (0.71), group_friendly (0.67), small_capacity (0.61), seafood (0.60), counter_seating (0.56)

Negative facets: budget (-0.33), moderate (-0.17), quiet (-0.17)

Budget affinities: affordable **-0.38**; higher-price **0.80**.

### Set metrics

| Cycle / seed | Mean Fiyu | Mean / min affinity | Facet diversity | Exploration | Affordable | Price spread | New vs legacy |
|---|---:|---:|---:|---|---|---:|---|
| cycle-1 / 2026103100 | 84.62 | 0.480 / 0.347 | 10 | non-negative | 1 (natural) | — | 2 |
| cycle-2 / 2026103101 | 84.62 | 0.480 / 0.347 | 10 | non-negative | 1 (natural) | — | 2 |
| cycle-3 / 2026103102 | 84.62 | 0.480 / 0.347 | 10 | non-negative | 1 (natural) | — | 1 |
| cycle-4 / 2026103103 | 84.62 | 0.480 / 0.347 | 10 | non-negative | 1 (natural) | — | 2 |
| cycle-5 / 2026103104 | 84.62 | 0.480 / 0.347 | 10 | non-negative | 1 (natural) | — | 2 |
| cycle-6 / 2026103105 | 84.62 | 0.480 / 0.347 | 10 | non-negative | 1 (natural) | — | 2 |

### Picks

| Cycle | Pos. | Restaurant | Fiyu | Price range | Affinity | Strength | Role | Positive matches | Negative matches | Affordability |
|---|---:|---|---:|---:|---:|---:|---|---|---|---|
| cycle-1 | 1 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.552 | 1.00 | strong_affinity | intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-1 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.347 | 1.00 | exploration | counter_seating, izakaya, small_capacity, solo_friendly | budget | natural |
| cycle-1 | 3 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.540 | 1.00 | moderate_or_novel | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-2 | 1 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.552 | 1.00 | strong_affinity | intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-2 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.347 | 1.00 | exploration | counter_seating, izakaya, small_capacity, solo_friendly | budget | natural |
| cycle-2 | 3 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.540 | 1.00 | moderate_or_novel | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-3 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.540 | 1.00 | moderate_or_novel | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-3 | 2 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.552 | 1.00 | strong_affinity | intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-3 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.347 | 1.00 | exploration | counter_seating, izakaya, small_capacity, solo_friendly | budget | natural |
| cycle-4 | 1 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.552 | 1.00 | strong_affinity | intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-4 | 2 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.540 | 1.00 | moderate_or_novel | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-4 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.347 | 1.00 | exploration | counter_seating, izakaya, small_capacity, solo_friendly | budget | natural |
| cycle-5 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.540 | 1.00 | moderate_or_novel | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-5 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.347 | 1.00 | exploration | counter_seating, izakaya, small_capacity, solo_friendly | budget | natural |
| cycle-5 | 3 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.552 | 1.00 | strong_affinity | intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-6 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.347 | 1.00 | exploration | counter_seating, izakaya, small_capacity, solo_friendly | budget | natural |
| cycle-6 | 2 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.540 | 1.00 | moderate_or_novel | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-6 | 3 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.552 | 1.00 | strong_affinity | intimate, seafood, seasonal, small_capacity, table_dining | — | none |

Unique restaurants across cycles: **3** of 18 Pick positions.

Repeated IDs: `{"ChIJObIyaEaLGGAR0UuCADbbPTg": 6, "ChIJWyTt9l6LGGARViDmY9O-UO4": 6, "ChIJt2QEWDmNGGARvJ5tMBSBCqI": 6}`

### Legacy comparison (first two cycles)

| Cycle | Legacy mean Fiyu / affinity | Personalized mean Fiyu / affinity | Changed personalized picks (role) |
|---|---:|---:|---|
| cycle-1 | 85.68 / 0.426 | 84.62 / 0.480 | La Blanche (strong_affinity), La Table de IDÉAL Restaurant (moderate_or_novel) |
| cycle-2 | 81.53 / 0.436 | 84.62 / 0.480 | La Blanche (strong_affinity), La Table de IDÉAL Restaurant (moderate_or_novel) |

## Profile E — mature eclectic

Distinct ratings: **12**; personalization confidence: **1.00**; known-price evidence: **9**; price confidence: **0.00**; relaxation: **0.000**.

Positive facets: small_capacity (0.65), casual (0.64), group_friendly (0.64), table_dining (0.62), counter_seating (0.57), solo_friendly (0.57)

Negative facets: —

Budget affinities: affordable **0.50**; higher-price **0.50**.

### Set metrics

| Cycle / seed | Mean Fiyu | Mean / min affinity | Facet diversity | Exploration | Affordable | Price spread | New vs legacy |
|---|---:|---:|---:|---|---|---:|---|
| cycle-1 / 2026104100 | 86.12 | 0.480 / 0.453 | 17 | non-negative | 1 (natural) | — | 2 |
| cycle-2 / 2026104101 | 86.12 | 0.480 / 0.453 | 17 | non-negative | 1 (natural) | — | 2 |
| cycle-3 / 2026104102 | 86.12 | 0.480 / 0.453 | 17 | non-negative | 1 (natural) | — | 2 |
| cycle-4 / 2026104103 | 86.12 | 0.480 / 0.453 | 17 | non-negative | 1 (natural) | — | 2 |
| cycle-5 / 2026104104 | 86.12 | 0.480 / 0.453 | 17 | non-negative | 1 (natural) | — | 2 |
| cycle-6 / 2026104105 | 86.12 | 0.480 / 0.453 | 17 | non-negative | 1 (natural) | — | 1 |

### Picks

| Cycle | Pos. | Restaurant | Fiyu | Price range | Affinity | Strength | Role | Positive matches | Negative matches | Affordability |
|---|---:|---|---:|---:|---:|---:|---|---|---|---|
| cycle-1 | 1 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.494 | 1.00 | moderate_or_novel | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |
| cycle-1 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.493 | 1.00 | strong_affinity | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-1 | 3 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.453 | 1.00 | exploration | cuisine_french, intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-2 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.493 | 1.00 | strong_affinity | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-2 | 2 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.453 | 1.00 | exploration | cuisine_french, intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-2 | 3 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.494 | 1.00 | moderate_or_novel | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |
| cycle-3 | 1 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.494 | 1.00 | moderate_or_novel | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |
| cycle-3 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.493 | 1.00 | strong_affinity | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-3 | 3 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.453 | 1.00 | exploration | cuisine_french, intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-4 | 1 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.494 | 1.00 | moderate_or_novel | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |
| cycle-4 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.493 | 1.00 | strong_affinity | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-4 | 3 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.453 | 1.00 | exploration | cuisine_french, intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-5 | 1 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.494 | 1.00 | moderate_or_novel | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |
| cycle-5 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.493 | 1.00 | strong_affinity | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-5 | 3 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.453 | 1.00 | exploration | cuisine_french, intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-6 | 1 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.493 | 1.00 | strong_affinity | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-6 | 2 | La Blanche (`ChIJWyTt9l6LGGARViDmY9O-UO4`) | 84.9 | unknown | 0.453 | 1.00 | exploration | cuisine_french, intimate, seafood, seasonal, small_capacity, table_dining | — | none |
| cycle-6 | 3 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.494 | 1.00 | moderate_or_novel | counter_seating, cuisine_sushi, date_friendly, group_friendly, private_rooms, reservation_heavy, seafood, small_capacity, splurge | — | none |

Unique restaurants across cycles: **3** of 18 Pick positions.

Repeated IDs: `{"ChIJJ8H-e-yLGGAR2MBsf1b9U38": 6, "ChIJWyTt9l6LGGARViDmY9O-UO4": 6, "ChIJt2QEWDmNGGARvJ5tMBSBCqI": 6}`

### Legacy comparison (first two cycles)

| Cycle | Legacy mean Fiyu / affinity | Personalized mean Fiyu / affinity | Changed personalized picks (role) |
|---|---:|---:|---|
| cycle-1 | 82.65 / 0.499 | 86.12 / 0.480 | Tsumuguito (moderate_or_novel), La Blanche (exploration) |
| cycle-2 | 79.66 / 0.487 | 86.12 / 0.480 | La Blanche (exploration), Tsumuguito (moderate_or_novel) |

## Profile F — likes affordable and expensive

Distinct ratings: **10**; personalization confidence: **1.00**; known-price evidence: **10**; price confidence: **1.00**; relaxation: **0.000**.

Positive facets: small_capacity (0.75), counter_seating (0.71), solo_friendly (0.71), upscale (0.71), budget (0.67), group_friendly (0.60)

Negative facets: —

Budget affinities: affordable **0.71**; higher-price **0.71**.

### Set metrics

| Cycle / seed | Mean Fiyu | Mean / min affinity | Facet diversity | Exploration | Affordable | Price spread | New vs legacy |
|---|---:|---:|---:|---|---|---:|---|
| cycle-1 / 2026105100 | 85.03 | 0.580 / 0.509 | 12 | non-negative | 1 (natural) | — | 2 |
| cycle-2 / 2026105101 | 85.03 | 0.580 / 0.509 | 12 | non-negative | 1 (natural) | — | 2 |
| cycle-3 / 2026105102 | 85.03 | 0.580 / 0.509 | 12 | non-negative | 1 (natural) | — | 2 |
| cycle-4 / 2026105103 | 85.03 | 0.580 / 0.509 | 12 | non-negative | 1 (natural) | — | 1 |
| cycle-5 / 2026105104 | 85.03 | 0.580 / 0.509 | 12 | non-negative | 1 (natural) | — | 0 |
| cycle-6 / 2026105105 | 85.03 | 0.580 / 0.509 | 12 | non-negative | 1 (natural) | — | 1 |

### Picks

| Cycle | Pos. | Restaurant | Fiyu | Price range | Affinity | Strength | Role | Positive matches | Negative matches | Affordability |
|---|---:|---|---:|---:|---:|---:|---|---|---|---|
| cycle-1 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.646 | 1.00 | strong_affinity | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-1 | 2 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.509 | 1.00 | exploration | counter_seating, cuisine_sushi, date_friendly, group_friendly, reservation_heavy, seafood, small_capacity | — | none |
| cycle-1 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.585 | 1.00 | moderate_or_novel | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-2 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.646 | 1.00 | strong_affinity | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-2 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.585 | 1.00 | moderate_or_novel | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-2 | 3 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.509 | 1.00 | exploration | counter_seating, cuisine_sushi, date_friendly, group_friendly, reservation_heavy, seafood, small_capacity | — | none |
| cycle-3 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.646 | 1.00 | strong_affinity | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-3 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.585 | 1.00 | moderate_or_novel | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-3 | 3 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.509 | 1.00 | exploration | counter_seating, cuisine_sushi, date_friendly, group_friendly, reservation_heavy, seafood, small_capacity | — | none |
| cycle-4 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.646 | 1.00 | strong_affinity | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-4 | 2 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.509 | 1.00 | exploration | counter_seating, cuisine_sushi, date_friendly, group_friendly, reservation_heavy, seafood, small_capacity | — | none |
| cycle-4 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.585 | 1.00 | moderate_or_novel | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-5 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.646 | 1.00 | strong_affinity | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-5 | 2 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.585 | 1.00 | moderate_or_novel | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |
| cycle-5 | 3 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.509 | 1.00 | exploration | counter_seating, cuisine_sushi, date_friendly, group_friendly, reservation_heavy, seafood, small_capacity | — | none |
| cycle-6 | 1 | La Table de IDÉAL Restaurant (`ChIJObIyaEaLGGAR0UuCADbbPTg`) | 81.6 | ¥10,000+ | 0.646 | 1.00 | strong_affinity | counter_seating, date_friendly, group_friendly, small_capacity, solo_friendly, table_dining | — | none |
| cycle-6 | 2 | Tsumuguito (`ChIJJ8H-e-yLGGAR2MBsf1b9U38`) | 86.1 | ¥10,000+ | 0.509 | 1.00 | exploration | counter_seating, cuisine_sushi, date_friendly, group_friendly, reservation_heavy, seafood, small_capacity | — | none |
| cycle-6 | 3 | Edo Sakaba Umi (`ChIJt2QEWDmNGGARvJ5tMBSBCqI`) | 87.4 | ¥1,000–¥2,000 | 0.585 | 1.00 | moderate_or_novel | budget, counter_seating, izakaya, neighbourhood, small_capacity, solo_friendly | — | natural |

Unique restaurants across cycles: **3** of 18 Pick positions.

Repeated IDs: `{"ChIJJ8H-e-yLGGAR2MBsf1b9U38": 6, "ChIJObIyaEaLGGAR0UuCADbbPTg": 6, "ChIJt2QEWDmNGGARvJ5tMBSBCqI": 6}`

### Legacy comparison (first two cycles)

| Cycle | Legacy mean Fiyu / affinity | Personalized mean Fiyu / affinity | Changed personalized picks (role) |
|---|---:|---:|---|
| cycle-1 | 77.93 / 0.551 | 85.03 / 0.580 | La Table de IDÉAL Restaurant (strong_affinity), Tsumuguito (exploration) |
| cycle-2 | 83.85 / 0.529 | 85.03 / 0.580 | La Table de IDÉAL Restaurant (strong_affinity), Tsumuguito (exploration) |

## Catalog-level observations

Most common Taste facets:

- `small_capacity`: 187 restaurants
- `counter_seating`: 155 restaurants
- `solo_friendly`: 141 restaurants
- `group_friendly`: 116 restaurants
- `table_dining`: 113 restaurants
- `moderate`: 75 restaurants
- `date_friendly`: 75 restaurants
- `budget`: 70 restaurants
- `seafood`: 63 restaurants
- `izakaya`: 62 restaurants
- `upscale`: 50 restaurants
- `splurge`: 43 restaurants

Most common correlated facet pairs:

- `counter_seating` + `small_capacity`: 136 restaurants
- `small_capacity` + `solo_friendly`: 123 restaurants
- `counter_seating` + `solo_friendly`: 119 restaurants
- `small_capacity` + `table_dining`: 93 restaurants
- `group_friendly` + `small_capacity`: 89 restaurants
- `counter_seating` + `table_dining`: 82 restaurants
- `group_friendly` + `table_dining`: 80 restaurants
- `counter_seating` + `group_friendly`: 79 restaurants
- `solo_friendly` + `table_dining`: 79 restaurants
- `group_friendly` + `solo_friendly`: 71 restaurants
- `date_friendly` + `small_capacity`: 67 restaurants
- `counter_seating` + `date_friendly`: 60 restaurants

## Cross-profile observations

| Profile | Confidence | Mean set affinity | Unique / positions |
|---|---:|---:|---:|
| Profile A — no history | 0.00 | 0.000 | 9 / 18 |
| Profile B — sparse sushi/counter | 0.20 | 0.053 | 10 / 18 |
| Profile C — medium sushi/counter | 0.60 | 0.156 | 6 / 18 |
| Profile D — mature expensive | 1.00 | 0.480 | 3 / 18 |
| Profile E — mature eclectic | 1.00 | 0.480 | 3 / 18 |
| Profile F — likes affordable and expensive | 1.00 | 0.580 | 3 / 18 |

- Exploration across 30 personalized sets: 30 non-negative, 0 mildly negative, and 0 materially negative.
- Affordability: 20 sets satisfied it naturally, 10 required a forced substitution, and 6 did not apply it.
- Personalized and legacy membership differed in 25 of 36 same-seed comparisons.
- Per-profile unique restaurants occupied 34 of 108 simulated Pick positions.
- Visible role positions remained seed-driven: exploration position 1=6, position 2=11, position 3=13; legacy position 1=6, position 2=6, position 3=6; moderate_or_novel position 1=8, position 2=10, position 3=12; strong_affinity position 1=16, position 2=9, position 3=5.
- The sparse profile is a useful caution: one positive and one contrasting rating can cancel or invert correlated/common facets, so its label is not a guarantee of a derived sushi preference.
- Common and correlated facets can amplify together because one restaurant may contribute several overlapping observations. This audit leaves that behavior intact.
- The mature expensive profile reached relaxation **0.800**. Its affordable restaurant still appeared naturally in every sampled set because its Taste affinity remained positive; relaxation did not force its removal.
- The mixed-price profile kept relaxation at **0.000** and retained an affordable Pick in every sampled set.

## Tuning questions raised (no tuning applied)

- Do common format facets dominate cuisine evidence in medium-confidence profiles?
- Does moderate/novel provide enough visible difference from strong across cycles?
- Are repeated high-quality exploration restaurants creating too much concentration?
- Does the `-0.10` boundary align with materially negative exploration samples?
- When affordability is forced, is its affinity sacrifice acceptable?
- Should correlated pairs such as counter/solo and sushi/seafood stay separate?
- Would an isolated cooldown-progression view materially change the breadth finding?

No selection constants or production behavior were changed in response to this audit.

## Re-run

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_personalized_picks.py --cycles 6
```
