# Personalized Picks cycle-progression audit

> Read-only evaluation using synthetic Taste histories over the real current catalog. No account identifiers or private notes are included.

## Methodology

- Catalog: **263** eligible real restaurants.
- Profiles: **6**; cycles per profile: **12**.
- Progression: successive cycles; static Taste; assigned Picks added to temporary served history.
- Cycles advance by one day. Taste, ratings, Saves, and location remain fixed.
- Production writes all assigned Picks to served history; revealing all three adds no separate cooldown record. The simulation therefore advances assignment timestamps.
- Source database opened read-only; selection ran on a temporary catalog clone.
- Persistent state hashes unchanged: **True**.

## Profile A — no history

Ratings/confidence: **0 / 0.00**. Positions: **36**; unique: **36 (100.0%)**; repeat rate: **0.0%**.
First repeat: **—**; first older-repeat fallback: **—**; max appearances: **1**; median cycles to repeat: **—**.
Encountered cuisines: **6**; Taste facets: **31**; exploration: `{}`; affordability: `{"not applied": 12}`.
Role breadth: `{"legacy": 36}`. Affordable restaurants: **12** across **12** positions; maximum appearances by one affordable restaurant: **1**.

### Successive cycles

| Cycle/date | Mean/min affinity | Mean Fiyu | Cuisine/facets | Unseen before/after | Recent blocked | Old reserve/used | Radius | Picks |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 / 2026-10-01 | 0.000 / 0.000 | 85.27 | 3 / 16 | 16 / 13 | 0 | 0 / 0 | 1.5 km | 1. Vini di Arai [legacy, unseen, aff 0.000, Fiyu 83.5, none]; 2. Edo Sakaba Umi [legacy, unseen, aff 0.000, Fiyu 87.4, none]; 3. La Blanche [legacy, unseen, aff 0.000, Fiyu 84.9, none] |
| 2 / 2026-10-02 | 0.000 / 0.000 | 77.89 | 2 / 15 | 13 / 10 | 3 | 0 / 0 | 1.5 km | 1. Lounge 8 Tokyo [legacy, unseen, aff 0.000, Fiyu 72.2, none]; 2. Sushizen [legacy, unseen, aff 0.000, Fiyu 83.2, none]; 3. Bodega [legacy, unseen, aff 0.000, Fiyu 78.3, none] |
| 3 / 2026-10-03 | 0.000 / 0.000 | 77.91 | 2 / 20 | 10 / 7 | 6 | 0 / 0 | 1.5 km | 1. Sushi-ya Ono [legacy, unseen, aff 0.000, Fiyu 75.5, none]; 2. Matsushima [legacy, unseen, aff 0.000, Fiyu 79.2, none]; 3. Toritoshi [legacy, unseen, aff 0.000, Fiyu 78.9, none] |
| 4 / 2026-10-04 | 0.000 / 0.000 | 78.05 | 1 / 17 | 10 / 7 | 9 | 0 / 0 | 2.0 km | 1. Feel Good Foods [legacy, unseen, aff 0.000, Fiyu 87.6, none]; 2. Tempura Motoyoshi [legacy, unseen, aff 0.000, Fiyu 79.4, none]; 3. YEBISU YAOYA [legacy, unseen, aff 0.000, Fiyu 67.1, none] |
| 5 / 2026-10-05 | 0.000 / 0.000 | 79.80 | 2 / 18 | 27 / 24 | 12 | 0 / 0 | 3.0 km | 1. Ichikawa [legacy, unseen, aff 0.000, Fiyu 79.6, none]; 2. Hong Kong Room GOUKA [legacy, unseen, aff 0.000, Fiyu 76.0, none]; 3. Petit Restaurant Nakajima [legacy, unseen, aff 0.000, Fiyu 83.8, none] |
| 6 / 2026-10-06 | 0.000 / 0.000 | 84.23 | 1 / 15 | 24 / 21 | 15 | 0 / 0 | 3.0 km | 1. GET BETTER Coffee & Sandwich [legacy, unseen, aff 0.000, Fiyu 80.8, none]; 2. Sushi Onuki [legacy, unseen, aff 0.000, Fiyu 84.5, none]; 3. Tonkatsu Nagi [legacy, unseen, aff 0.000, Fiyu 87.5, none] |
| 7 / 2026-10-07 | 0.000 / 0.000 | 71.65 | 0 / 6 | 21 / 18 | 18 | 0 / 0 | 3.0 km | 1. Ufufu Shirokanedai [legacy, unseen, aff 0.000, Fiyu 79.8, none]; 2. Kera Tokyo Rooftop Lounge Bar [legacy, unseen, aff 0.000, Fiyu 57.8, none]; 3. Unaga [legacy, unseen, aff 0.000, Fiyu 77.3, none] |
| 8 / 2026-10-08 | 0.000 / 0.000 | 79.50 | 1 / 17 | 18 / 15 | 18 | 3 / 0 | 3.0 km | 1. Sulpan Yoyogi [legacy, unseen, aff 0.000, Fiyu 78.7, none]; 2. Gentoushi Nakada [legacy, unseen, aff 0.000, Fiyu 81.3, none]; 3. Hatsune [legacy, unseen, aff 0.000, Fiyu 78.5, none] |
| 9 / 2026-10-09 | 0.000 / 0.000 | 79.53 | 1 / 15 | 15 / 12 | 18 | 6 / 0 | 3.0 km | 1. Sushi Ichiro [legacy, unseen, aff 0.000, Fiyu 76.2, none]; 2. Sushi Hashiguchi [legacy, unseen, aff 0.000, Fiyu 76.3, none]; 3. Tsumuguito [legacy, unseen, aff 0.000, Fiyu 86.1, none] |
| 10 / 2026-10-10 | 0.000 / 0.000 | 76.50 | 1 / 16 | 12 / 9 | 18 | 9 / 0 | 3.0 km | 1. Tonchū [legacy, unseen, aff 0.000, Fiyu 79.7, none]; 2. Ryogoku Zushi [legacy, unseen, aff 0.000, Fiyu 78.0, none]; 3. Ushi Hana [legacy, unseen, aff 0.000, Fiyu 71.8, none] |
| 11 / 2026-10-11 | 0.000 / 0.000 | 79.04 | 0 / 11 | 33 / 30 | 18 | 12 / 0 | 5.0 km | 1. Bistro Sonomamma [legacy, unseen, aff 0.000, Fiyu 79.4, none]; 2. ¡ÁNIMO! Waseda [legacy, unseen, aff 0.000, Fiyu 79.0, none]; 3. Restaurant Nanpeidai [legacy, unseen, aff 0.000, Fiyu 78.7, none] |
| 12 / 2026-10-12 | 0.000 / 0.000 | 79.71 | 3 / 17 | 30 / 27 | 18 | 15 / 0 | 5.0 km | 1. ROLLS wine and springrolls [legacy, unseen, aff 0.000, Fiyu 79.0, none]; 2. Kojimachi Sushi Yamato [legacy, unseen, aff 0.000, Fiyu 77.8, none]; 3. Jiangxi Rice Noodles Guyue (Karaoke Izakaya) [legacy, unseen, aff 0.000, Fiyu 82.3, none] |

### Affinity contribution by encountered candidate

Each signed contribution is `profile facet affinity × profile confidence ÷ candidate-known facet count`; contributions sum to the displayed affinity.

| Candidate | Known facets | Calculated affinity | Per-facet contributions |
|---|---:|---:|---|
| Bistro Sonomamma | 0 | 0.000 | no known profile facets |
| Bodega | 0 | 0.000 | no known profile facets |
| Edo Sakaba Umi | 0 | 0.000 | no known profile facets |
| Feel Good Foods | 0 | 0.000 | no known profile facets |
| GET BETTER Coffee & Sandwich | 0 | 0.000 | no known profile facets |
| Gentoushi Nakada | 0 | 0.000 | no known profile facets |
| Hatsune | 0 | 0.000 | no known profile facets |
| Hong Kong Room GOUKA | 0 | 0.000 | no known profile facets |
| Ichikawa | 0 | 0.000 | no known profile facets |
| Jiangxi Rice Noodles Guyue (Karaoke Izakaya) | 0 | 0.000 | no known profile facets |
| Kera Tokyo Rooftop Lounge Bar | 0 | 0.000 | no known profile facets |
| Kojimachi Sushi Yamato | 0 | 0.000 | no known profile facets |
| La Blanche | 0 | 0.000 | no known profile facets |
| Lounge 8 Tokyo | 0 | 0.000 | no known profile facets |
| Matsushima | 0 | 0.000 | no known profile facets |
| Petit Restaurant Nakajima | 0 | 0.000 | no known profile facets |
| ROLLS wine and springrolls | 0 | 0.000 | no known profile facets |
| Restaurant Nanpeidai | 0 | 0.000 | no known profile facets |
| Ryogoku Zushi | 0 | 0.000 | no known profile facets |
| Sulpan Yoyogi | 0 | 0.000 | no known profile facets |
| Sushi Hashiguchi | 0 | 0.000 | no known profile facets |
| Sushi Ichiro | 0 | 0.000 | no known profile facets |
| Sushi Onuki | 0 | 0.000 | no known profile facets |
| Sushi-ya Ono | 0 | 0.000 | no known profile facets |
| Sushizen | 0 | 0.000 | no known profile facets |
| Tempura Motoyoshi | 0 | 0.000 | no known profile facets |
| Tonchū | 0 | 0.000 | no known profile facets |
| Tonkatsu Nagi | 0 | 0.000 | no known profile facets |
| Toritoshi | 0 | 0.000 | no known profile facets |
| Tsumuguito | 0 | 0.000 | no known profile facets |
| Ufufu Shirokanedai | 0 | 0.000 | no known profile facets |
| Unaga | 0 | 0.000 | no known profile facets |
| Ushi Hana | 0 | 0.000 | no known profile facets |
| Vini di Arai | 0 | 0.000 | no known profile facets |
| YEBISU YAOYA | 0 | 0.000 | no known profile facets |
| ¡ÁNIMO! Waseda | 0 | 0.000 | no known profile facets |

## Profile B — sparse sushi/counter

Ratings/confidence: **2 / 0.20**. Positions: **36**; unique: **36 (100.0%)**; repeat rate: **0.0%**.
First repeat: **—**; first older-repeat fallback: **—**; max appearances: **1**; median cycles to repeat: **—**.
Encountered cuisines: **6**; Taste facets: **32**; exploration: `{"non-negative": 12}`; affordability: `{"forced": 2, "natural": 7, "not applied": 3}`.
Role breadth: `{"exploration": 12, "moderate_or_novel": 12, "strong_affinity": 12}`. Affordable restaurants: **13** across **13** positions; maximum appearances by one affordable restaurant: **1**.

### Successive cycles

| Cycle/date | Mean/min affinity | Mean Fiyu | Cuisine/facets | Unseen before/after | Recent blocked | Old reserve/used | Radius | Picks |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 / 2026-10-01 | 0.053 / 0.033 | 86.12 | 3 / 17 | 16 / 13 | 0 | 0 / 0 | 1.5 km | 1. Edo Sakaba Umi [strong_affinity, unseen, aff 0.067, Fiyu 87.4, forced]; 2. La Blanche [moderate_or_novel, unseen, aff 0.033, Fiyu 84.9, none]; 3. Tsumuguito [exploration, unseen, aff 0.060, Fiyu 86.1, none] |
| 2 / 2026-10-02 | 0.048 / 0.038 | 78.96 | 2 / 15 | 13 / 10 | 3 | 0 / 0 | 1.5 km | 1. La Table de IDÉAL Restaurant [moderate_or_novel, unseen, aff 0.038, Fiyu 81.6, none]; 2. Ushi Hana [exploration, unseen, aff 0.053, Fiyu 71.8, none]; 3. Vini di Arai [strong_affinity, unseen, aff 0.053, Fiyu 83.5, none] |
| 3 / 2026-10-03 | 0.043 / 0.017 | 79.38 | 2 / 20 | 10 / 7 | 6 | 0 / 0 | 1.5 km | 1. Sushizen [strong_affinity, unseen, aff 0.067, Fiyu 83.2, none]; 2. Hong Kong Room GOUKA [moderate_or_novel, unseen, aff 0.046, Fiyu 76.0, none]; 3. Toritoshi [exploration, unseen, aff 0.017, Fiyu 78.9, none] |
| 4 / 2026-10-04 | 0.017 / -0.033 | 76.76 | 2 / 16 | 10 / 7 | 9 | 0 / 0 | 2.0 km | 1. YEBISU YAOYA [moderate_or_novel, unseen, aff 0.024, Fiyu 67.1, none]; 2. Feel Good Foods [strong_affinity, unseen, aff -0.033, Fiyu 87.6, natural]; 3. Sushi-ya Ono [exploration, unseen, aff 0.060, Fiyu 75.5, none] |
| 5 / 2026-10-05 | 0.055 / 0.043 | 82.05 | 1 / 15 | 27 / 24 | 12 | 0 / 0 | 3.0 km | 1. Gentoushi Nakada [strong_affinity, unseen, aff 0.056, Fiyu 81.3, none]; 2. Moelleuse [exploration, unseen, aff 0.043, Fiyu 77.3, none]; 3. Tonkatsu Nagi [moderate_or_novel, unseen, aff 0.067, Fiyu 87.5, natural] |
| 6 / 2026-10-06 | 0.049 / 0.019 | 78.16 | 2 / 13 | 24 / 21 | 15 | 0 / 0 | 3.0 km | 1. Tonchū [strong_affinity, unseen, aff 0.067, Fiyu 79.7, natural]; 2. Sushi Nakao [moderate_or_novel, unseen, aff 0.060, Fiyu 76.0, none]; 3. Sulpan Yoyogi [exploration, unseen, aff 0.019, Fiyu 78.7, none] |
| 7 / 2026-10-07 | 0.046 / 0.031 | 80.31 | 1 / 17 | 21 / 18 | 18 | 0 / 0 | 3.0 km | 1. Natural Wine and Craft Beer sun. [moderate_or_novel, unseen, aff 0.042, Fiyu 80.9, none]; 2. GET BETTER Coffee & Sandwich [strong_affinity, unseen, aff 0.067, Fiyu 80.8, forced]; 3. Matsushima [exploration, unseen, aff 0.031, Fiyu 79.2, none] |
| 8 / 2026-10-08 | 0.044 / 0.038 | 79.72 | 1 / 11 | 18 / 15 | 18 | 3 / 0 | 3.0 km | 1. Petit Restaurant Nakajima [strong_affinity, unseen, aff 0.038, Fiyu 83.8, natural]; 2. Ryogoku Zushi [exploration, unseen, aff 0.046, Fiyu 78.0, none]; 3. Unaga [moderate_or_novel, unseen, aff 0.047, Fiyu 77.3, none] |
| 9 / 2026-10-09 | 0.041 / 0.018 | 77.17 | 1 / 15 | 15 / 12 | 18 | 6 / 0 | 3.0 km | 1. Hatsune [strong_affinity, unseen, aff 0.043, Fiyu 78.5, none]; 2. Sushi Ichiro [moderate_or_novel, unseen, aff 0.061, Fiyu 76.2, natural]; 3. Horumon-yaki Kuunomu [exploration, unseen, aff 0.018, Fiyu 76.9, none] |
| 10 / 2026-10-10 | 0.040 / 0.006 | 80.86 | 2 / 14 | 12 / 9 | 18 | 9 / 0 | 3.0 km | 1. Sushi Onuki [strong_affinity, unseen, aff 0.047, Fiyu 84.5, none]; 2. Ufufu Shirokanedai [moderate_or_novel, unseen, aff 0.067, Fiyu 79.8, none]; 3. Bodega [exploration, unseen, aff 0.006, Fiyu 78.3, none] |
| 11 / 2026-10-11 | 0.037 / 0.019 | 81.44 | 1 / 15 | 33 / 30 | 18 | 12 / 0 | 5.0 km | 1. Restaurant Nanpeidai [exploration, unseen, aff 0.019, Fiyu 78.7, none]; 2. Sushi Uchida Setagaya [moderate_or_novel, unseen, aff 0.067, Fiyu 83.9, none]; 3. Tonkatsu Motoko [strong_affinity, unseen, aff 0.025, Fiyu 81.7, natural] |
| 12 / 2026-10-12 | 0.033 / 0.000 | 80.41 | 2 / 12 | 30 / 27 | 18 | 15 / 0 | 5.0 km | 1. Kojimachi O-Udon Kai [moderate_or_novel, unseen, aff 0.067, Fiyu 77.9, natural]; 2. Trattoria Familiare [strong_affinity, unseen, aff 0.033, Fiyu 80.6, none]; 3. BEStORY COFFEE [exploration, unseen, aff 0.000, Fiyu 82.8, none] |

### Affinity contribution by encountered candidate

Each signed contribution is `profile facet affinity × profile confidence ÷ candidate-known facet count`; contributions sum to the displayed affinity.

| Candidate | Known facets | Calculated affinity | Per-facet contributions |
|---|---:|---:|---|
| BEStORY COFFEE | 0 | 0.000 | no known profile facets |
| Bodega | 4 | 0.006 | small_capacity +0.017; table_dining -0.008; upscale -0.008; group_friendly +0.006 |
| Edo Sakaba Umi | 3 | 0.067 | counter_seating +0.022; small_capacity +0.022; solo_friendly +0.022 |
| Feel Good Foods | 1 | -0.033 | grilled -0.033 |
| GET BETTER Coffee & Sandwich | 2 | 0.067 | small_capacity +0.033; solo_friendly +0.033 |
| Gentoushi Nakada | 4 | 0.056 | counter_seating +0.017; private_rooms +0.017; small_capacity +0.017; group_friendly +0.006 |
| Hatsune | 6 | 0.043 | counter_seating +0.011; moderate +0.011; private_rooms +0.011; solo_friendly +0.011; table_dining -0.006; group_friendly +0.004 |
| Hong Kong Room GOUKA | 7 | 0.046 | counter_seating +0.010; private_rooms +0.010; seafood +0.010; small_capacity +0.010; traditional +0.010; table_dining -0.005; group_friendly +0.004 |
| Horumon-yaki Kuunomu | 7 | 0.018 | counter_seating +0.010; small_capacity +0.010; solo_friendly +0.010; grilled -0.005; table_dining -0.005; upscale -0.005; group_friendly +0.004 |
| Kojimachi O-Udon Kai | 3 | 0.067 | counter_seating +0.022; small_capacity +0.022; solo_friendly +0.022 |
| La Blanche | 3 | 0.033 | seafood +0.022; small_capacity +0.022; table_dining -0.011 |
| La Table de IDÉAL Restaurant | 5 | 0.038 | counter_seating +0.013; small_capacity +0.013; solo_friendly +0.013; table_dining -0.007; group_friendly +0.005 |
| Matsushima | 4 | 0.031 | counter_seating +0.017; small_capacity +0.017; table_dining -0.008; group_friendly +0.006 |
| Moelleuse | 6 | 0.043 | counter_seating +0.011; private_rooms +0.011; small_capacity +0.011; solo_friendly +0.011; table_dining -0.006; group_friendly +0.004 |
| Natural Wine and Craft Beer sun. | 4 | 0.042 | counter_seating +0.017; small_capacity +0.017; solo_friendly +0.017; upscale -0.008 |
| Petit Restaurant Nakajima | 5 | 0.038 | counter_seating +0.013; small_capacity +0.013; solo_friendly +0.013; table_dining -0.007; group_friendly +0.005 |
| Restaurant Nanpeidai | 3 | 0.019 | small_capacity +0.022; table_dining -0.011; group_friendly +0.008 |
| Ryogoku Zushi | 7 | 0.046 | counter_seating +0.010; cuisine_sushi +0.010; seafood +0.010; small_capacity +0.010; solo_friendly +0.010; table_dining -0.005; group_friendly +0.004 |
| Sulpan Yoyogi | 3 | 0.019 | solo_friendly +0.022; table_dining -0.011; group_friendly +0.008 |
| Sushi Ichiro | 7 | 0.061 | counter_seating +0.010; cuisine_sushi +0.010; private_rooms +0.010; seafood +0.010; small_capacity +0.010; solo_friendly +0.010; group_friendly +0.004 |
| Sushi Nakao | 6 | 0.060 | counter_seating +0.011; cuisine_sushi +0.011; seafood +0.011; small_capacity +0.011; solo_friendly +0.011; group_friendly +0.004 |
| Sushi Onuki | 5 | 0.047 | counter_seating +0.013; cuisine_sushi +0.013; seafood +0.013; traditional +0.013; upscale -0.007 |
| Sushi Uchida Setagaya | 6 | 0.067 | counter_seating +0.011; cuisine_sushi +0.011; seafood +0.011; small_capacity +0.011; solo_friendly +0.011; traditional +0.011 |
| Sushi-ya Ono | 6 | 0.060 | counter_seating +0.011; cuisine_sushi +0.011; private_rooms +0.011; seafood +0.011; small_capacity +0.011; group_friendly +0.004 |
| Sushizen | 5 | 0.067 | counter_seating +0.013; cuisine_sushi +0.013; seafood +0.013; small_capacity +0.013; solo_friendly +0.013 |
| Tonchū | 4 | 0.067 | counter_seating +0.017; moderate +0.017; small_capacity +0.017; solo_friendly +0.017 |
| Tonkatsu Motoko | 1 | 0.025 | group_friendly +0.025 |
| Tonkatsu Nagi | 4 | 0.067 | counter_seating +0.017; moderate +0.017; small_capacity +0.017; solo_friendly +0.017 |
| Toritoshi | 6 | 0.017 | counter_seating +0.011; small_capacity +0.011; solo_friendly +0.011; grilled -0.006; table_dining -0.006; upscale -0.006 |
| Trattoria Familiare | 3 | 0.033 | moderate +0.022; small_capacity +0.022; table_dining -0.011 |
| Tsumuguito | 6 | 0.060 | counter_seating +0.011; cuisine_sushi +0.011; private_rooms +0.011; seafood +0.011; small_capacity +0.011; group_friendly +0.004 |
| Ufufu Shirokanedai | 1 | 0.067 | small_capacity +0.067 |
| Unaga | 5 | 0.047 | counter_seating +0.013; moderate +0.013; small_capacity +0.013; solo_friendly +0.013; table_dining -0.007 |
| Ushi Hana | 3 | 0.053 | private_rooms +0.022; small_capacity +0.022; group_friendly +0.008 |
| Vini di Arai | 3 | 0.053 | private_rooms +0.022; small_capacity +0.022; group_friendly +0.008 |
| YEBISU YAOYA | 8 | 0.024 | counter_seating +0.008; private_rooms +0.008; small_capacity +0.008; solo_friendly +0.008; grilled -0.004; table_dining -0.004; upscale -0.004; group_friendly +0.003 |

## Profile C — medium sushi/counter

Ratings/confidence: **6 / 0.60**. Positions: **36**; unique: **36 (100.0%)**; repeat rate: **0.0%**.
First repeat: **—**; first older-repeat fallback: **—**; max appearances: **1**; median cycles to repeat: **—**.
Encountered cuisines: **6**; Taste facets: **30**; exploration: `{"mildly negative": 1, "non-negative": 11}`; affordability: `{"forced": 4, "natural": 6, "not applied": 2}`.
Role breadth: `{"exploration": 12, "moderate_or_novel": 12, "strong_affinity": 12}`. Affordable restaurants: **13** across **13** positions; maximum appearances by one affordable restaurant: **1**.

### Successive cycles

| Cycle/date | Mean/min affinity | Mean Fiyu | Cuisine/facets | Unseen before/after | Recent blocked | Old reserve/used | Radius | Picks |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 / 2026-10-01 | 0.110 / 0.027 | 83.09 | 2 / 15 | 16 / 13 | 0 | 0 / 0 | 1.5 km | 1. Edo Sakaba Umi [moderate_or_novel, unseen, aff 0.130, Fiyu 87.4, forced]; 2. Bodega [exploration, unseen, aff 0.027, Fiyu 78.3, none]; 3. Vini di Arai [strong_affinity, unseen, aff 0.172, Fiyu 83.5, none] |
| 2 / 2026-10-02 | 0.180 / 0.135 | 84.71 | 2 / 16 | 13 / 10 | 3 | 0 / 0 | 1.5 km | 1. Sushizen [moderate_or_novel, unseen, aff 0.193, Fiyu 83.2, none]; 2. La Blanche [exploration, unseen, aff 0.135, Fiyu 84.9, none]; 3. Tsumuguito [strong_affinity, unseen, aff 0.212, Fiyu 86.1, none] |
| 3 / 2026-10-03 | 0.191 / 0.161 | 75.58 | 1 / 13 | 10 / 7 | 6 | 0 / 0 | 1.5 km | 1. Tempura Motoyoshi [moderate_or_novel, unseen, aff 0.179, Fiyu 79.4, none]; 2. Ushi Hana [exploration, unseen, aff 0.161, Fiyu 71.8, none]; 3. Sushi-ya Ono [strong_affinity, unseen, aff 0.233, Fiyu 75.5, none] |
| 4 / 2026-10-04 | 0.119 / -0.025 | 84.48 | 1 / 16 | 10 / 7 | 9 | 0 / 0 | 2.0 km | 1. Feel Good Foods [exploration, unseen, aff -0.025, Fiyu 87.6, natural]; 2. Sushi Onuki [moderate_or_novel, unseen, aff 0.207, Fiyu 84.5, none]; 3. Gentoushi Nakada [strong_affinity, unseen, aff 0.176, Fiyu 81.3, none] |
| 5 / 2026-10-05 | 0.186 / 0.083 | 78.62 | 2 / 11 | 27 / 24 | 12 | 0 / 0 | 3.0 km | 1. Ufufu Shirokanedai [moderate_or_novel, unseen, aff 0.200, Fiyu 79.8, none]; 2. Sulpan Yoyogi [exploration, unseen, aff 0.083, Fiyu 78.7, forced]; 3. Sushi Nigiri [strong_affinity, unseen, aff 0.275, Fiyu 77.4, none] |
| 6 / 2026-10-06 | 0.181 / 0.120 | 71.19 | 1 / 13 | 24 / 21 | 15 | 0 / 0 | 3.0 km | 1. Ichikawa [strong_affinity, unseen, aff 0.229, Fiyu 79.6, none]; 2. Sushi Ichiro [moderate_or_novel, unseen, aff 0.195, Fiyu 76.2, natural]; 3. Kera Tokyo Rooftop Lounge Bar [exploration, unseen, aff 0.120, Fiyu 57.8, none] |
| 7 / 2026-10-07 | 0.162 / 0.138 | 81.42 | 1 / 14 | 21 / 18 | 18 | 0 / 0 | 3.0 km | 1. Sushi Nakao [moderate_or_novel, unseen, aff 0.208, Fiyu 76.0, none]; 2. Tonkatsu Nagi [strong_affinity, unseen, aff 0.141, Fiyu 87.5, natural]; 3. GET BETTER Coffee & Sandwich [exploration, unseen, aff 0.138, Fiyu 80.8, none] |
| 8 / 2026-10-08 | 0.168 / 0.140 | 79.85 | 1 / 18 | 18 / 15 | 18 | 3 / 0 | 3.0 km | 1. Petit Restaurant Nakajima [exploration, unseen, aff 0.140, Fiyu 83.8, none]; 2. Tonchū [strong_affinity, unseen, aff 0.193, Fiyu 79.7, natural]; 3. Hong Kong Room GOUKA [moderate_or_novel, unseen, aff 0.171, Fiyu 76.0, none] |
| 9 / 2026-10-09 | 0.157 / 0.076 | 74.75 | 1 / 18 | 15 / 12 | 18 | 6 / 0 | 3.0 km | 1. VinIX (Vank) [exploration, unseen, aff 0.076, Fiyu 69.9, none]; 2. Sushi Hashiguchi [moderate_or_novel, unseen, aff 0.215, Fiyu 76.3, none]; 3. Ryogoku Zushi [strong_affinity, unseen, aff 0.180, Fiyu 78.0, forced] |
| 10 / 2026-10-10 | 0.112 / 0.073 | 79.22 | 1 / 11 | 12 / 9 | 18 | 9 / 0 | 3.0 km | 1. La Table de IDÉAL Restaurant [strong_affinity, unseen, aff 0.145, Fiyu 81.6, none]; 2. Restaurant Nanpeidai [exploration, unseen, aff 0.073, Fiyu 78.7, none]; 3. Unaga [moderate_or_novel, unseen, aff 0.118, Fiyu 77.3, forced] |
| 11 / 2026-10-11 | 0.115 / 0.000 | 79.10 | 2 / 14 | 33 / 30 | 18 | 12 / 0 | 5.0 km | 1. Sushi Suehiro [moderate_or_novel, unseen, aff 0.167, Fiyu 76.7, none]; 2. BEStORY COFFEE [exploration, unseen, aff 0.000, Fiyu 82.8, natural]; 3. Kojimachi Sushi Yamato [strong_affinity, unseen, aff 0.177, Fiyu 77.8, none] |
| 12 / 2026-10-12 | 0.103 / 0.084 | 81.75 | 2 / 13 | 30 / 27 | 18 | 15 / 0 | 5.0 km | 1. Tonkatsu Motoko [moderate_or_novel, unseen, aff 0.125, Fiyu 81.7, natural]; 2. Chinese Gastronomy Kayou [exploration, unseen, aff 0.100, Fiyu 78.0, none]; 3. Wine and Food ohako [strong_affinity, unseen, aff 0.084, Fiyu 85.6, none] |

### Affinity contribution by encountered candidate

Each signed contribution is `profile facet affinity × profile confidence ÷ candidate-known facet count`; contributions sum to the displayed affinity.

| Candidate | Known facets | Calculated affinity | Per-facet contributions |
|---|---:|---:|---|
| BEStORY COFFEE | 2 | 0.000 | budget +0.050; izakaya -0.050 |
| Bodega | 7 | 0.027 | small_capacity +0.029; group_friendly +0.021; intimate +0.014; izakaya -0.014; upscale -0.014; table_dining -0.009; casual +0.000 |
| Chinese Gastronomy Kayou | 1 | 0.100 | budget +0.100 |
| Edo Sakaba Umi | 5 | 0.130 | counter_seating +0.060; small_capacity +0.040; solo_friendly +0.030; budget +0.020; izakaya -0.020 |
| Feel Good Foods | 2 | -0.025 | grilled -0.075; budget +0.050 |
| GET BETTER Coffee & Sandwich | 4 | 0.138 | small_capacity +0.050; solo_friendly +0.037; budget +0.025; intimate +0.025 |
| Gentoushi Nakada | 8 | 0.176 | counter_seating +0.037; reservation_heavy +0.025; small_capacity +0.025; splurge +0.025; private_rooms +0.022; group_friendly +0.019; intimate +0.013; date_friendly +0.009 |
| Hong Kong Room GOUKA | 11 | 0.171 | counter_seating +0.027; seafood +0.027; traditional +0.022; reservation_heavy +0.018; small_capacity +0.018; splurge +0.018; private_rooms +0.016; group_friendly +0.014; intimate +0.009; date_friendly +0.007; table_dining -0.005 |
| Ichikawa | 7 | 0.229 | counter_seating +0.043; cuisine_sushi +0.043; seafood +0.043; reservation_heavy +0.029; small_capacity +0.029; splurge +0.029; intimate +0.014 |
| Kera Tokyo Rooftop Lounge Bar | 1 | 0.120 | moderate +0.120 |
| Kojimachi Sushi Yamato | 10 | 0.177 | counter_seating +0.030; cuisine_sushi +0.030; seafood +0.030; small_capacity +0.020; splurge +0.020; group_friendly +0.015; solo_friendly +0.015; intimate +0.010; date_friendly +0.007; quiet +0.000 |
| La Blanche | 4 | 0.135 | seafood +0.075; small_capacity +0.050; intimate +0.025; table_dining -0.015 |
| La Table de IDÉAL Restaurant | 7 | 0.145 | counter_seating +0.043; small_capacity +0.029; splurge +0.029; group_friendly +0.021; solo_friendly +0.021; date_friendly +0.011; table_dining -0.009 |
| Petit Restaurant Nakajima | 6 | 0.140 | counter_seating +0.050; small_capacity +0.033; group_friendly +0.025; solo_friendly +0.025; budget +0.017; table_dining -0.010 |
| Restaurant Nanpeidai | 5 | 0.073 | small_capacity +0.040; group_friendly +0.030; date_friendly +0.015; table_dining -0.012; quiet +0.000 |
| Ryogoku Zushi | 8 | 0.180 | counter_seating +0.037; cuisine_sushi +0.037; seafood +0.037; small_capacity +0.025; group_friendly +0.019; solo_friendly +0.019; budget +0.013; table_dining -0.007 |
| Sulpan Yoyogi | 5 | 0.083 | group_friendly +0.030; solo_friendly +0.030; budget +0.020; date_friendly +0.015; table_dining -0.012 |
| Sushi Hashiguchi | 8 | 0.215 | counter_seating +0.037; cuisine_sushi +0.037; seafood +0.037; traditional +0.030; small_capacity +0.025; splurge +0.025; private_rooms +0.022; quiet +0.000 |
| Sushi Ichiro | 9 | 0.195 | counter_seating +0.033; cuisine_sushi +0.033; seafood +0.033; small_capacity +0.022; private_rooms +0.020; group_friendly +0.017; solo_friendly +0.017; budget +0.011; date_friendly +0.008 |
| Sushi Nakao | 9 | 0.208 | counter_seating +0.033; cuisine_sushi +0.033; seafood +0.033; reservation_heavy +0.022; small_capacity +0.022; splurge +0.022; group_friendly +0.017; solo_friendly +0.017; date_friendly +0.008 |
| Sushi Nigiri | 4 | 0.275 | counter_seating +0.075; cuisine_sushi +0.075; seafood +0.075; splurge +0.050 |
| Sushi Onuki | 6 | 0.207 | counter_seating +0.050; cuisine_sushi +0.050; seafood +0.050; traditional +0.040; reservation_heavy +0.033; upscale -0.017 |
| Sushi Suehiro | 3 | 0.167 | cuisine_sushi +0.100; seafood +0.100; upscale -0.033 |
| Sushi-ya Ono | 7 | 0.233 | counter_seating +0.043; cuisine_sushi +0.043; seafood +0.043; small_capacity +0.029; splurge +0.029; private_rooms +0.026; group_friendly +0.021 |
| Sushizen | 7 | 0.193 | counter_seating +0.043; cuisine_sushi +0.043; seafood +0.043; small_capacity +0.029; solo_friendly +0.021; intimate +0.014; casual +0.000 |
| Tempura Motoyoshi | 6 | 0.179 | counter_seating +0.050; reservation_heavy +0.033; small_capacity +0.033; splurge +0.033; intimate +0.017; date_friendly +0.012 |
| Tonchū | 4 | 0.192 | counter_seating +0.075; small_capacity +0.050; solo_friendly +0.037; moderate +0.030 |
| Tonkatsu Motoko | 2 | 0.125 | group_friendly +0.075; budget +0.050 |
| Tonkatsu Nagi | 6 | 0.141 | counter_seating +0.050; small_capacity +0.033; solo_friendly +0.025; moderate +0.020; date_friendly +0.012; quiet +0.000 |
| Tsumuguito | 9 | 0.212 | counter_seating +0.033; cuisine_sushi +0.033; seafood +0.033; reservation_heavy +0.022; small_capacity +0.022; splurge +0.022; private_rooms +0.020; group_friendly +0.017; date_friendly +0.008 |
| Ufufu Shirokanedai | 1 | 0.200 | small_capacity +0.200 |
| Unaga | 6 | 0.118 | counter_seating +0.050; small_capacity +0.033; solo_friendly +0.025; moderate +0.020; table_dining -0.010; quiet +0.000 |
| Ushi Hana | 5 | 0.161 | small_capacity +0.040; splurge +0.040; private_rooms +0.036; group_friendly +0.030; date_friendly +0.015 |
| VinIX (Vank) | 6 | 0.076 | splurge +0.033; private_rooms +0.030; grilled -0.025; group_friendly +0.025; date_friendly +0.012; casual +0.000 |
| Vini di Arai | 6 | 0.172 | reservation_heavy +0.033; small_capacity +0.033; splurge +0.033; private_rooms +0.030; group_friendly +0.025; intimate +0.017 |
| Wine and Food ohako | 7 | 0.084 | counter_seating +0.043; small_capacity +0.029; solo_friendly +0.021; intimate +0.014; upscale -0.014; table_dining -0.009; casual +0.000 |

### Same-seed legacy progression

| Selector | Unique / positions | Repeat rate | First repeat | Mean cycle affinity | Mean cycle Fiyu |
|---|---:|---:|---:|---:|---:|
| Personalized | 36 / 36 | 0.0% | — | 0.149 | 79.48 |
| Legacy | 36 / 36 | 0.0% | — | 0.140 | 79.22 |

## Profile D — mature expensive

Ratings/confidence: **10 / 1.00**. Positions: **36**; unique: **36 (100.0%)**; repeat rate: **0.0%**.
First repeat: **—**; first older-repeat fallback: **—**; max appearances: **1**; median cycles to repeat: **—**.
Encountered cuisines: **6**; Taste facets: **30**; exploration: `{"non-negative": 12}`; affordability: `{"forced": 4, "natural": 5, "not applied": 3}`.
Role breadth: `{"exploration": 12, "moderate_or_novel": 12, "strong_affinity": 12}`. Affordable restaurants: **11** across **11** positions; maximum appearances by one affordable restaurant: **1**.

### Successive cycles

| Cycle/date | Mean/min affinity | Mean Fiyu | Cuisine/facets | Unseen before/after | Recent blocked | Old reserve/used | Radius | Picks |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 / 2026-10-01 | 0.480 / 0.347 | 84.62 | 2 / 14 | 16 / 13 | 0 | 0 / 0 | 1.5 km | 1. La Blanche [strong_affinity, unseen, aff 0.552, Fiyu 84.9, none]; 2. Edo Sakaba Umi [exploration, unseen, aff 0.347, Fiyu 87.4, natural]; 3. La Table de IDÉAL Restaurant [moderate_or_novel, unseen, aff 0.540, Fiyu 81.6, none] |
| 2 / 2026-10-02 | 0.518 / 0.467 | 82.53 | 2 / 18 | 13 / 10 | 3 | 0 / 0 | 1.5 km | 1. Tsumuguito [exploration, unseen, aff 0.466, Fiyu 86.1, none]; 2. Bodega [strong_affinity, unseen, aff 0.566, Fiyu 78.3, none]; 3. Sushizen [moderate_or_novel, unseen, aff 0.521, Fiyu 83.2, none] |
| 3 / 2026-10-03 | 0.505 / 0.463 | 79.44 | 3 / 16 | 10 / 7 | 6 | 0 / 0 | 1.5 km | 1. Matsushima [moderate_or_novel, unseen, aff 0.506, Fiyu 79.2, none]; 2. Vini di Arai [exploration, unseen, aff 0.463, Fiyu 83.5, none]; 3. Sushi-ya Ono [strong_affinity, unseen, aff 0.546, Fiyu 75.5, none] |
| 4 / 2026-10-04 | 0.474 / 0.422 | 81.59 | 1 / 18 | 10 / 7 | 9 | 0 / 0 | 2.0 km | 1. Sushi Onuki [strong_affinity, unseen, aff 0.518, Fiyu 84.5, none]; 2. Gentoushi Nakada [exploration, unseen, aff 0.422, Fiyu 81.3, none]; 3. Toritoshi [moderate_or_novel, unseen, aff 0.482, Fiyu 78.9, none] |
| 5 / 2026-10-05 | 0.475 / 0.255 | 81.37 | 0 / 10 | 27 / 24 | 12 | 0 / 0 | 3.0 km | 1. Horumon-yaki Kuunomu [moderate_or_novel, unseen, aff 0.560, Fiyu 76.9, none]; 2. Ufufu Shirokanedai [strong_affinity, unseen, aff 0.611, Fiyu 79.8, none]; 3. Tonkatsu Nagi [exploration, unseen, aff 0.255, Fiyu 87.5, natural] |
| 6 / 2026-10-06 | 0.440 / 0.301 | 80.66 | 1 / 12 | 24 / 21 | 15 | 0 / 0 | 3.0 km | 1. GET BETTER Coffee & Sandwich [exploration, unseen, aff 0.301, Fiyu 80.8, none]; 2. Sushi Nigiri [strong_affinity, unseen, aff 0.554, Fiyu 77.4, none]; 3. Petit Restaurant Nakajima [moderate_or_novel, unseen, aff 0.464, Fiyu 83.8, natural] |
| 7 / 2026-10-07 | 0.456 / 0.392 | 79.10 | 1 / 13 | 21 / 18 | 18 | 0 / 0 | 3.0 km | 1. Ichikawa [strong_affinity, unseen, aff 0.490, Fiyu 79.6, none]; 2. Ryogoku Zushi [moderate_or_novel, unseen, aff 0.485, Fiyu 78.0, natural]; 3. Tonchū [exploration, unseen, aff 0.392, Fiyu 79.7, none] |
| 8 / 2026-10-08 | 0.427 / 0.383 | 77.21 | 1 / 13 | 18 / 15 | 18 | 3 / 0 | 3.0 km | 1. Tempura Motoyoshi [exploration, unseen, aff 0.383, Fiyu 79.4, none]; 2. Sushi Nakao [strong_affinity, unseen, aff 0.495, Fiyu 76.0, none]; 3. Sushi Ichiro [moderate_or_novel, unseen, aff 0.403, Fiyu 76.2, forced] |
| 9 / 2026-10-09 | 0.425 / 0.347 | 76.53 | 1 / 13 | 15 / 12 | 18 | 6 / 0 | 3.0 km | 1. Sulpan Yoyogi [moderate_or_novel, unseen, aff 0.347, Fiyu 78.7, forced]; 2. Restaurant Nanpeidai [exploration, unseen, aff 0.408, Fiyu 78.7, none]; 3. Lounge 8 Tokyo [strong_affinity, unseen, aff 0.520, Fiyu 72.2, none] |
| 10 / 2026-10-10 | 0.421 / 0.353 | 76.48 | 0 / 15 | 12 / 9 | 18 | 9 / 0 | 3.0 km | 1. Unaga [moderate_or_novel, unseen, aff 0.353, Fiyu 77.3, forced]; 2. Toakari [strong_affinity, unseen, aff 0.498, Fiyu 73.6, none]; 3. Hatsune [exploration, unseen, aff 0.412, Fiyu 78.5, none] |
| 11 / 2026-10-11 | 0.475 / 0.351 | 81.61 | 1 / 15 | 33 / 30 | 18 | 12 / 0 | 5.0 km | 1. Mira Food [moderate_or_novel, unseen, aff 0.351, Fiyu 82.0, forced]; 2. Sushi Uchida Setagaya [exploration, unseen, aff 0.403, Fiyu 83.9, none]; 3. ¡ÁNIMO! Waseda [strong_affinity, unseen, aff 0.672, Fiyu 79.0, none] |
| 12 / 2026-10-12 | 0.392 / 0.000 | 81.68 | 3 / 14 | 30 / 27 | 18 | 15 / 0 | 5.0 km | 1. Wine and Food ohako [moderate_or_novel, unseen, aff 0.542, Fiyu 85.6, none]; 2. BEStORY COFFEE [exploration, unseen, aff 0.000, Fiyu 82.8, natural]; 3. Sushi Suehiro [strong_affinity, unseen, aff 0.633, Fiyu 76.7, none] |

### Affinity contribution by encountered candidate

Each signed contribution is `profile facet affinity × profile confidence ÷ candidate-known facet count`; contributions sum to the displayed affinity.

| Candidate | Known facets | Calculated affinity | Per-facet contributions |
|---|---:|---:|---|
| BEStORY COFFEE | 2 | 0.000 | budget -0.167; izakaya +0.167 |
| Bodega | 7 | 0.566 | upscale +0.114; table_dining +0.102; group_friendly +0.095; small_capacity +0.087; casual +0.071; intimate +0.048; izakaya +0.048 |
| Edo Sakaba Umi | 5 | 0.347 | small_capacity +0.122; counter_seating +0.113; solo_friendly +0.113; budget -0.067; izakaya +0.067 |
| GET BETTER Coffee & Sandwich | 5 | 0.301 | small_capacity +0.122; solo_friendly +0.113; budget -0.067; creative +0.067; intimate +0.067 |
| Gentoushi Nakada | 9 | 0.422 | group_friendly +0.074; small_capacity +0.068; counter_seating +0.062; seasonal +0.056; creative +0.037; intimate +0.037; private_rooms +0.037; reservation_heavy +0.037; date_friendly +0.014 |
| Hatsune | 8 | 0.412 | table_dining +0.089; group_friendly +0.083; counter_seating +0.070; solo_friendly +0.070; casual +0.062; private_rooms +0.042; moderate -0.021; date_friendly +0.016 |
| Horumon-yaki Kuunomu | 7 | 0.560 | upscale +0.114; table_dining +0.102; group_friendly +0.095; small_capacity +0.087; counter_seating +0.080; solo_friendly +0.080; grilled +0.000 |
| Ichikawa | 6 | 0.490 | small_capacity +0.102; seafood +0.100; counter_seating +0.094; cuisine_sushi +0.083; intimate +0.056; reservation_heavy +0.056 |
| La Blanche | 5 | 0.552 | table_dining +0.143; small_capacity +0.122; seafood +0.120; seasonal +0.100; intimate +0.067 |
| La Table de IDÉAL Restaurant | 6 | 0.540 | table_dining +0.119; group_friendly +0.111; small_capacity +0.102; counter_seating +0.094; solo_friendly +0.094; date_friendly +0.021 |
| Lounge 8 Tokyo | 8 | 0.520 | upscale +0.100; group_friendly +0.083; small_capacity +0.076; counter_seating +0.070; solo_friendly +0.070; casual +0.062; intimate +0.042; date_friendly +0.016 |
| Matsushima | 9 | 0.506 | table_dining +0.079; group_friendly +0.074; small_capacity +0.068; counter_seating +0.062; casual +0.056; seasonal +0.056; creative +0.037; intimate +0.037; reservation_heavy +0.037 |
| Mira Food | 4 | 0.351 | small_capacity +0.153; counter_seating +0.141; solo_friendly +0.141; budget -0.083 |
| Petit Restaurant Nakajima | 6 | 0.464 | table_dining +0.119; group_friendly +0.111; small_capacity +0.102; counter_seating +0.094; solo_friendly +0.094; budget -0.056 |
| Restaurant Nanpeidai | 6 | 0.408 | table_dining +0.119; group_friendly +0.111; small_capacity +0.102; seasonal +0.083; quiet -0.028; date_friendly +0.021 |
| Ryogoku Zushi | 8 | 0.485 | table_dining +0.089; group_friendly +0.083; small_capacity +0.076; seafood +0.075; counter_seating +0.070; solo_friendly +0.070; cuisine_sushi +0.062; budget -0.042 |
| Sulpan Yoyogi | 5 | 0.347 | table_dining +0.143; group_friendly +0.133; solo_friendly +0.113; budget -0.067; date_friendly +0.025 |
| Sushi Ichiro | 9 | 0.403 | group_friendly +0.074; small_capacity +0.068; seafood +0.067; counter_seating +0.062; solo_friendly +0.062; cuisine_sushi +0.056; budget -0.037; private_rooms +0.037; date_friendly +0.014 |
| Sushi Nakao | 8 | 0.495 | group_friendly +0.083; small_capacity +0.076; seafood +0.075; counter_seating +0.070; solo_friendly +0.070; cuisine_sushi +0.062; reservation_heavy +0.042; date_friendly +0.016 |
| Sushi Nigiri | 3 | 0.554 | seafood +0.200; counter_seating +0.188; cuisine_sushi +0.167 |
| Sushi Onuki | 7 | 0.518 | upscale +0.114; seafood +0.086; counter_seating +0.080; cuisine_sushi +0.071; seasonal +0.071; reservation_heavy +0.048; traditional +0.048 |
| Sushi Suehiro | 3 | 0.633 | upscale +0.267; seafood +0.200; cuisine_sushi +0.167 |
| Sushi Uchida Setagaya | 9 | 0.403 | small_capacity +0.068; seafood +0.067; counter_seating +0.062; solo_friendly +0.062; cuisine_sushi +0.056; seasonal +0.056; traditional +0.037; quiet -0.019; date_friendly +0.014 |
| Sushi-ya Ono | 6 | 0.546 | group_friendly +0.111; small_capacity +0.102; seafood +0.100; counter_seating +0.094; cuisine_sushi +0.083; private_rooms +0.056 |
| Sushizen | 8 | 0.521 | small_capacity +0.076; seafood +0.075; counter_seating +0.070; solo_friendly +0.070; casual +0.062; cuisine_sushi +0.062; seasonal +0.062; intimate +0.042 |
| Tempura Motoyoshi | 6 | 0.383 | small_capacity +0.102; counter_seating +0.094; chef_led +0.056; intimate +0.056; reservation_heavy +0.056; date_friendly +0.021 |
| Toakari | 11 | 0.498 | upscale +0.073; table_dining +0.065; group_friendly +0.061; small_capacity +0.056; counter_seating +0.051; casual +0.045; seasonal +0.045; creative +0.030; private_rooms +0.030; reservation_heavy +0.030; date_friendly +0.011 |
| Tonchū | 4 | 0.392 | small_capacity +0.153; counter_seating +0.141; solo_friendly +0.141; moderate -0.042 |
| Tonkatsu Nagi | 6 | 0.255 | small_capacity +0.102; counter_seating +0.094; solo_friendly +0.094; moderate -0.028; quiet -0.028; date_friendly +0.021 |
| Toritoshi | 7 | 0.482 | upscale +0.114; table_dining +0.102; small_capacity +0.087; counter_seating +0.080; solo_friendly +0.080; date_friendly +0.018; grilled +0.000 |
| Tsumuguito | 8 | 0.466 | group_friendly +0.083; small_capacity +0.076; seafood +0.075; counter_seating +0.070; cuisine_sushi +0.062; private_rooms +0.042; reservation_heavy +0.042; date_friendly +0.016 |
| Ufufu Shirokanedai | 1 | 0.611 | small_capacity +0.611 |
| Unaga | 6 | 0.353 | table_dining +0.119; small_capacity +0.102; counter_seating +0.094; solo_friendly +0.094; moderate -0.028; quiet -0.028 |
| Vini di Arai | 6 | 0.463 | group_friendly +0.111; small_capacity +0.102; cuisine_italian +0.083; intimate +0.056; private_rooms +0.056; reservation_heavy +0.056 |
| Wine and Food ohako | 10 | 0.542 | upscale +0.080; table_dining +0.071; small_capacity +0.061; counter_seating +0.056; solo_friendly +0.056; casual +0.050; cuisine_italian +0.050; seasonal +0.050; creative +0.033; intimate +0.033 |
| ¡ÁNIMO! Waseda | 4 | 0.672 | upscale +0.200; table_dining +0.179; small_capacity +0.153; solo_friendly +0.141 |

### Same-seed legacy progression

| Selector | Unique / positions | Repeat rate | First repeat | Mean cycle affinity | Mean cycle Fiyu |
|---|---:|---:|---:|---:|---:|
| Personalized | 36 / 36 | 0.0% | — | 0.457 | 80.23 |
| Legacy | 36 / 36 | 0.0% | — | 0.402 | 78.58 |

### High-price affordability counterfactual

This is evaluator-only: current adaptive affordability versus the same personalized progression with the affordable slot disabled.

| View | Unique / positions | Mean affinity | Mean Fiyu | Affordable positions |
|---|---:|---:|---:|---:|
| Current | 36 / 36 | 0.457 | 80.23 | 11 |
| Slot disabled | 36 / 36 | 0.467 | 80.12 | 8 |

## Profile E — mature eclectic

Ratings/confidence: **12 / 1.00**. Positions: **36**; unique: **36 (100.0%)**; repeat rate: **0.0%**.
First repeat: **—**; first older-repeat fallback: **—**; max appearances: **1**; median cycles to repeat: **—**.
Encountered cuisines: **6**; Taste facets: **30**; exploration: `{"non-negative": 12}`; affordability: `{"natural": 10, "not applied": 2}`.
Role breadth: `{"exploration": 12, "moderate_or_novel": 12, "strong_affinity": 12}`. Affordable restaurants: **15** across **15** positions; maximum appearances by one affordable restaurant: **1**.

### Successive cycles

| Cycle/date | Mean/min affinity | Mean Fiyu | Cuisine/facets | Unseen before/after | Recent blocked | Old reserve/used | Radius | Picks |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 / 2026-10-01 | 0.480 / 0.453 | 86.12 | 3 / 17 | 16 / 13 | 0 | 0 / 0 | 1.5 km | 1. Tsumuguito [moderate_or_novel, unseen, aff 0.494, Fiyu 86.1, none]; 2. Edo Sakaba Umi [strong_affinity, unseen, aff 0.493, Fiyu 87.4, natural]; 3. La Blanche [exploration, unseen, aff 0.453, Fiyu 84.9, none] |
| 2 / 2026-10-02 | 0.492 / 0.476 | 82.77 | 3 / 17 | 13 / 10 | 3 | 0 / 0 | 1.5 km | 1. Vini di Arai [exploration, unseen, aff 0.476, Fiyu 83.5, none]; 2. La Table de IDÉAL Restaurant [strong_affinity, unseen, aff 0.513, Fiyu 81.6, none]; 3. Sushizen [moderate_or_novel, unseen, aff 0.486, Fiyu 83.2, none] |
| 3 / 2026-10-03 | 0.488 / 0.466 | 78.99 | 2 / 17 | 10 / 7 | 6 | 0 / 0 | 1.5 km | 1. Matsushima [strong_affinity, unseen, aff 0.496, Fiyu 79.2, none]; 2. Tempura Motoyoshi [exploration, unseen, aff 0.466, Fiyu 79.4, none]; 3. Bodega [moderate_or_novel, unseen, aff 0.503, Fiyu 78.3, none] |
| 4 / 2026-10-04 | 0.447 / 0.402 | 84.48 | 1 / 16 | 10 / 7 | 9 | 0 / 0 | 2.0 km | 1. Gentoushi Nakada [strong_affinity, unseen, aff 0.501, Fiyu 81.3, none]; 2. Sushi Onuki [exploration, unseen, aff 0.402, Fiyu 84.5, none]; 3. Feel Good Foods [moderate_or_novel, unseen, aff 0.438, Fiyu 87.6, natural] |
| 5 / 2026-10-05 | 0.578 / 0.529 | 80.77 | 1 / 9 | 27 / 24 | 12 | 0 / 0 | 3.0 km | 1. Ufufu Shirokanedai [strong_affinity, unseen, aff 0.650, Fiyu 79.8, none]; 2. Sulpan Yoyogi [exploration, unseen, aff 0.529, Fiyu 78.7, none]; 3. Petit Restaurant Nakajima [moderate_or_novel, unseen, aff 0.556, Fiyu 83.8, natural] |
| 6 / 2026-10-06 | 0.533 / 0.521 | 81.55 | 0 / 12 | 24 / 21 | 15 | 0 / 0 | 3.0 km | 1. Restaurant Nanpeidai [moderate_or_novel, unseen, aff 0.553, Fiyu 78.7, none]; 2. Tonkatsu Nagi [strong_affinity, unseen, aff 0.521, Fiyu 87.5, natural]; 3. Hatsune [exploration, unseen, aff 0.524, Fiyu 78.5, none] |
| 7 / 2026-10-07 | 0.488 / 0.414 | 79.29 | 1 / 10 | 21 / 18 | 18 | 0 / 0 | 3.0 km | 1. Tonchū [strong_affinity, unseen, aff 0.532, Fiyu 79.7, natural]; 2. Sushi Nigiri [exploration, unseen, aff 0.414, Fiyu 77.4, none]; 3. GET BETTER Coffee & Sandwich [moderate_or_novel, unseen, aff 0.519, Fiyu 80.8, none] |
| 8 / 2026-10-08 | 0.521 / 0.506 | 76.07 | 0 / 14 | 18 / 15 | 18 | 3 / 0 | 3.0 km | 1. Natural Wine and Craft Beer sun. [strong_affinity, unseen, aff 0.514, Fiyu 80.9, none]; 2. Unaga [moderate_or_novel, unseen, aff 0.542, Fiyu 77.3, natural]; 3. VinIX (Vank) [exploration, unseen, aff 0.506, Fiyu 69.9, none] |
| 9 / 2026-10-09 | 0.460 / 0.333 | 70.90 | 1 / 12 | 15 / 12 | 18 | 6 / 0 | 3.0 km | 1. Horumon-yaki Kuunomu [strong_affinity, unseen, aff 0.534, Fiyu 76.9, none]; 2. Ryogoku Zushi [moderate_or_novel, unseen, aff 0.511, Fiyu 78.0, natural]; 3. Kera Tokyo Rooftop Lounge Bar [exploration, unseen, aff 0.333, Fiyu 57.8, none] |
| 10 / 2026-10-10 | 0.493 / 0.472 | 78.23 | 1 / 16 | 12 / 9 | 18 | 9 / 0 | 3.0 km | 1. Ichikawa [exploration, unseen, aff 0.472, Fiyu 79.6, none]; 2. Sushi Ichiro [strong_affinity, unseen, aff 0.516, Fiyu 76.2, natural]; 3. Toritoshi [moderate_or_novel, unseen, aff 0.491, Fiyu 78.9, none] |
| 11 / 2026-10-11 | 0.520 / 0.417 | 82.15 | 1 / 6 | 33 / 30 | 18 | 12 / 0 | 5.0 km | 1. BEStORY COFFEE [exploration, unseen, aff 0.417, Fiyu 82.8, none]; 2. Mira Food [strong_affinity, unseen, aff 0.573, Fiyu 82.0, natural]; 3. Tonkatsu Motoko [moderate_or_novel, unseen, aff 0.571, Fiyu 81.7, none] |
| 12 / 2026-10-12 | 0.474 / 0.389 | 82.43 | 3 / 16 | 30 / 27 | 18 | 15 / 0 | 5.0 km | 1. Jiangxi Rice Noodles Guyue (Karaoke Izakaya) [exploration, unseen, aff 0.389, Fiyu 82.3, none]; 2. Bistro Sonomamma [strong_affinity, unseen, aff 0.554, Fiyu 79.4, natural]; 3. Wine and Food ohako [moderate_or_novel, unseen, aff 0.480, Fiyu 85.6, none] |

### Affinity contribution by encountered candidate

Each signed contribution is `profile facet affinity × profile confidence ÷ candidate-known facet count`; contributions sum to the displayed affinity.

| Candidate | Known facets | Calculated affinity | Per-facet contributions |
|---|---:|---:|---|
| BEStORY COFFEE | 2 | 0.417 | budget +0.250; izakaya +0.167 |
| Bistro Sonomamma | 8 | 0.554 | small_capacity +0.081; group_friendly +0.080; table_dining +0.078; counter_seating +0.071; solo_friendly +0.071; budget +0.062; date_friendly +0.062; grilled +0.047 |
| Bodega | 8 | 0.503 | small_capacity +0.081; casual +0.080; group_friendly +0.080; table_dining +0.078; intimate +0.062; izakaya +0.042; neighbourhood +0.042; upscale +0.037 |
| Edo Sakaba Umi | 6 | 0.493 | small_capacity +0.108; counter_seating +0.095; solo_friendly +0.095; budget +0.083; izakaya +0.056; neighbourhood +0.056 |
| Feel Good Foods | 2 | 0.438 | budget +0.250; grilled +0.188 |
| GET BETTER Coffee & Sandwich | 5 | 0.519 | small_capacity +0.130; solo_friendly +0.114; budget +0.100; intimate +0.100; creative +0.075 |
| Gentoushi Nakada | 10 | 0.501 | small_capacity +0.065; group_friendly +0.064; counter_seating +0.057; date_friendly +0.050; intimate +0.050; private_rooms +0.050; reservation_heavy +0.050; seasonal +0.040; creative +0.037; splurge +0.037 |
| Hatsune | 9 | 0.524 | casual +0.071; group_friendly +0.071; table_dining +0.069; counter_seating +0.063; solo_friendly +0.063; date_friendly +0.056; private_rooms +0.056; moderate +0.037; neighbourhood +0.037 |
| Horumon-yaki Kuunomu | 7 | 0.534 | small_capacity +0.093; group_friendly +0.092; table_dining +0.089; counter_seating +0.082; solo_friendly +0.082; grilled +0.054; upscale +0.043 |
| Ichikawa | 7 | 0.472 | small_capacity +0.093; counter_seating +0.082; intimate +0.071; reservation_heavy +0.071; seafood +0.054; splurge +0.054; cuisine_sushi +0.048 |
| Jiangxi Rice Noodles Guyue (Karaoke Izakaya) | 3 | 0.389 | budget +0.167; cuisine_chinese +0.111; izakaya +0.111 |
| Kera Tokyo Rooftop Lounge Bar | 1 | 0.333 | moderate +0.333 |
| La Blanche | 6 | 0.453 | small_capacity +0.108; table_dining +0.104; intimate +0.083; seasonal +0.067; seafood +0.062; cuisine_french +0.028 |
| La Table de IDÉAL Restaurant | 8 | 0.513 | small_capacity +0.081; group_friendly +0.080; table_dining +0.078; counter_seating +0.071; solo_friendly +0.071; date_friendly +0.062; splurge +0.047; cuisine_french +0.021 |
| Matsushima | 12 | 0.496 | small_capacity +0.054; casual +0.054; group_friendly +0.054; table_dining +0.052; counter_seating +0.048; intimate +0.042; reservation_heavy +0.042; seasonal +0.033; creative +0.031; splurge +0.031; cuisine_chinese +0.028; regional +0.028 |
| Mira Food | 4 | 0.573 | small_capacity +0.163; counter_seating +0.143; solo_friendly +0.143; budget +0.125 |
| Natural Wine and Craft Beer sun. | 8 | 0.514 | small_capacity +0.081; casual +0.080; counter_seating +0.071; solo_friendly +0.071; date_friendly +0.062; quiet +0.062; creative +0.047; upscale +0.037 |
| Petit Restaurant Nakajima | 7 | 0.556 | small_capacity +0.093; group_friendly +0.092; table_dining +0.089; counter_seating +0.082; solo_friendly +0.082; budget +0.071; neighbourhood +0.048 |
| Restaurant Nanpeidai | 6 | 0.553 | small_capacity +0.108; group_friendly +0.107; table_dining +0.104; date_friendly +0.083; quiet +0.083; seasonal +0.067 |
| Ryogoku Zushi | 9 | 0.511 | small_capacity +0.072; group_friendly +0.071; table_dining +0.069; counter_seating +0.063; solo_friendly +0.063; budget +0.056; seafood +0.042; cuisine_sushi +0.037; neighbourhood +0.037 |
| Sulpan Yoyogi | 6 | 0.529 | group_friendly +0.107; table_dining +0.104; solo_friendly +0.095; budget +0.083; date_friendly +0.083; cuisine_korean +0.056 |
| Sushi Ichiro | 9 | 0.516 | small_capacity +0.072; group_friendly +0.071; counter_seating +0.063; solo_friendly +0.063; budget +0.056; date_friendly +0.056; private_rooms +0.056; seafood +0.042; cuisine_sushi +0.037 |
| Sushi Nigiri | 4 | 0.414 | counter_seating +0.143; seafood +0.094; splurge +0.094; cuisine_sushi +0.083 |
| Sushi Onuki | 7 | 0.402 | counter_seating +0.082; reservation_heavy +0.071; seasonal +0.057; seafood +0.054; cuisine_sushi +0.048; traditional +0.048; upscale +0.043 |
| Sushizen | 9 | 0.486 | small_capacity +0.072; casual +0.071; counter_seating +0.063; solo_friendly +0.063; intimate +0.056; seasonal +0.044; seafood +0.042; cuisine_sushi +0.037; tasting_course +0.037 |
| Tempura Motoyoshi | 7 | 0.466 | small_capacity +0.093; counter_seating +0.082; date_friendly +0.071; intimate +0.071; reservation_heavy +0.071; splurge +0.054; chef_led +0.024 |
| Tonchū | 4 | 0.532 | small_capacity +0.163; counter_seating +0.143; solo_friendly +0.143; moderate +0.083 |
| Tonkatsu Motoko | 2 | 0.571 | group_friendly +0.321; budget +0.250 |
| Tonkatsu Nagi | 6 | 0.521 | small_capacity +0.108; counter_seating +0.095; solo_friendly +0.095; date_friendly +0.083; quiet +0.083; moderate +0.056 |
| Toritoshi | 8 | 0.491 | small_capacity +0.081; table_dining +0.078; counter_seating +0.071; solo_friendly +0.071; date_friendly +0.062; grilled +0.047; neighbourhood +0.042; upscale +0.037 |
| Tsumuguito | 9 | 0.494 | small_capacity +0.072; group_friendly +0.071; counter_seating +0.063; date_friendly +0.056; private_rooms +0.056; reservation_heavy +0.056; seafood +0.042; splurge +0.042; cuisine_sushi +0.037 |
| Ufufu Shirokanedai | 1 | 0.650 | small_capacity +0.650 |
| Unaga | 6 | 0.542 | small_capacity +0.108; table_dining +0.104; counter_seating +0.095; solo_friendly +0.095; quiet +0.083; moderate +0.056 |
| VinIX (Vank) | 6 | 0.506 | casual +0.107; group_friendly +0.107; date_friendly +0.083; private_rooms +0.083; grilled +0.062; splurge +0.062 |
| Vini di Arai | 7 | 0.476 | small_capacity +0.093; group_friendly +0.092; intimate +0.071; private_rooms +0.071; reservation_heavy +0.071; splurge +0.054; cuisine_italian +0.024 |
| Wine and Food ohako | 10 | 0.480 | small_capacity +0.065; casual +0.064; table_dining +0.062; counter_seating +0.057; solo_friendly +0.057; intimate +0.050; seasonal +0.040; creative +0.037; upscale +0.030; cuisine_italian +0.017 |

## Profile F — likes affordable and expensive

Ratings/confidence: **10 / 1.00**. Positions: **36**; unique: **36 (100.0%)**; repeat rate: **0.0%**.
First repeat: **—**; first older-repeat fallback: **—**; max appearances: **1**; median cycles to repeat: **—**.
Encountered cuisines: **6**; Taste facets: **29**; exploration: `{"non-negative": 12}`; affordability: `{"natural": 9, "not applied": 3}`.
Role breadth: `{"exploration": 12, "moderate_or_novel": 12, "strong_affinity": 12}`. Affordable restaurants: **15** across **15** positions; maximum appearances by one affordable restaurant: **1**.

### Successive cycles

| Cycle/date | Mean/min affinity | Mean Fiyu | Cuisine/facets | Unseen before/after | Recent blocked | Old reserve/used | Radius | Picks |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 / 2026-10-01 | 0.580 / 0.509 | 85.03 | 3 / 15 | 16 / 13 | 0 | 0 / 0 | 1.5 km | 1. La Table de IDÉAL Restaurant [strong_affinity, unseen, aff 0.646, Fiyu 81.6, none]; 2. Tsumuguito [exploration, unseen, aff 0.509, Fiyu 86.1, none]; 3. Edo Sakaba Umi [moderate_or_novel, unseen, aff 0.585, Fiyu 87.4, natural] |
| 2 / 2026-10-02 | 0.543 / 0.503 | 82.34 | 2 / 15 | 13 / 10 | 3 | 0 / 0 | 1.5 km | 1. Sushizen [moderate_or_novel, unseen, aff 0.522, Fiyu 83.2, none]; 2. La Blanche [exploration, unseen, aff 0.503, Fiyu 84.9, none]; 3. Toritoshi [strong_affinity, unseen, aff 0.603, Fiyu 78.9, none] |
| 3 / 2026-10-03 | 0.544 / 0.503 | 78.36 | 1 / 13 | 10 / 7 | 6 | 0 / 0 | 1.5 km | 1. Vini di Arai [moderate_or_novel, unseen, aff 0.503, Fiyu 83.5, none]; 2. Lounge 8 Tokyo [strong_affinity, unseen, aff 0.603, Fiyu 72.2, none]; 3. Tempura Motoyoshi [exploration, unseen, aff 0.526, Fiyu 79.4, none] |
| 4 / 2026-10-04 | 0.519 / 0.466 | 84.48 | 1 / 16 | 10 / 7 | 9 | 0 / 0 | 2.0 km | 1. Feel Good Foods [strong_affinity, unseen, aff 0.583, Fiyu 87.6, natural]; 2. Gentoushi Nakada [moderate_or_novel, unseen, aff 0.508, Fiyu 81.3, none]; 3. Sushi Onuki [exploration, unseen, aff 0.466, Fiyu 84.5, none] |
| 5 / 2026-10-05 | 0.664 / 0.616 | 80.77 | 1 / 9 | 27 / 24 | 12 | 0 / 0 | 3.0 km | 1. Ufufu Shirokanedai [strong_affinity, unseen, aff 0.750, Fiyu 79.8, none]; 2. Petit Restaurant Nakajima [moderate_or_novel, unseen, aff 0.626, Fiyu 83.8, natural]; 3. Sulpan Yoyogi [exploration, unseen, aff 0.616, Fiyu 78.7, none] |
| 6 / 2026-10-06 | 0.607 / 0.537 | 78.36 | 0 / 12 | 24 / 21 | 15 | 0 / 0 | 3.0 km | 1. Tonchū [moderate_or_novel, unseen, aff 0.628, Fiyu 79.7, natural]; 2. Horumon-yaki Kuunomu [strong_affinity, unseen, aff 0.656, Fiyu 76.9, none]; 3. Hatsune [exploration, unseen, aff 0.537, Fiyu 78.5, none] |
| 7 / 2026-10-07 | 0.529 / 0.460 | 81.91 | 1 / 12 | 21 / 18 | 18 | 0 / 0 | 3.0 km | 1. Natural Wine and Craft Beer sun. [moderate_or_novel, unseen, aff 0.570, Fiyu 80.9, none]; 2. Sushi Nigiri [exploration, unseen, aff 0.460, Fiyu 77.4, none]; 3. Tonkatsu Nagi [strong_affinity, unseen, aff 0.558, Fiyu 87.5, natural] |
| 8 / 2026-10-08 | 0.553 / 0.525 | 76.02 | 0 / 15 | 18 / 15 | 18 | 3 / 0 | 3.0 km | 1. GET BETTER Coffee & Sandwich [strong_affinity, unseen, aff 0.560, Fiyu 80.8, natural]; 2. VinIX (Vank) [exploration, unseen, aff 0.525, Fiyu 69.9, none]; 3. Unaga [moderate_or_novel, unseen, aff 0.574, Fiyu 77.3, none] |
| 9 / 2026-10-09 | 0.490 / 0.333 | 70.66 | 1 / 12 | 15 / 12 | 18 | 6 / 0 | 3.0 km | 1. Kera Tokyo Rooftop Lounge Bar [exploration, unseen, aff 0.333, Fiyu 57.8, none]; 2. Sushi Ichiro [strong_affinity, unseen, aff 0.576, Fiyu 76.2, natural]; 3. Ryogoku Zushi [moderate_or_novel, unseen, aff 0.561, Fiyu 78.0, none] |
| 10 / 2026-10-10 | 0.524 / 0.466 | 77.49 | 2 / 15 | 12 / 9 | 18 | 9 / 0 | 3.0 km | 1. Ichikawa [exploration, unseen, aff 0.466, Fiyu 79.6, none]; 2. Sushi-ya Ono [moderate_or_novel, unseen, aff 0.546, Fiyu 75.5, none]; 3. Moelleuse [strong_affinity, unseen, aff 0.561, Fiyu 77.3, none] |
| 11 / 2026-10-11 | 0.635 / 0.500 | 81.24 | 1 / 7 | 33 / 30 | 18 | 12 / 0 | 5.0 km | 1. BEStORY COFFEE [exploration, unseen, aff 0.500, Fiyu 82.8, none]; 2. ¡ÁNIMO! Waseda [moderate_or_novel, unseen, aff 0.695, Fiyu 79.0, none]; 3. Mira Food [strong_affinity, unseen, aff 0.711, Fiyu 82.0, natural] |
| 12 / 2026-10-12 | 0.570 / 0.444 | 81.14 | 2 / 10 | 30 / 27 | 18 | 15 / 0 | 5.0 km | 1. Jiangxi Rice Noodles Guyue (Karaoke Izakaya) [exploration, unseen, aff 0.444, Fiyu 82.3, none]; 2. Bistro Sonomamma [moderate_or_novel, unseen, aff 0.631, Fiyu 79.4, none]; 3. Tonkatsu Motoko [strong_affinity, unseen, aff 0.633, Fiyu 81.7, natural] |

### Affinity contribution by encountered candidate

Each signed contribution is `profile facet affinity × profile confidence ÷ candidate-known facet count`; contributions sum to the displayed affinity.

| Candidate | Known facets | Calculated affinity | Per-facet contributions |
|---|---:|---:|---|
| BEStORY COFFEE | 2 | 0.500 | budget +0.333; izakaya +0.167 |
| Bistro Sonomamma | 8 | 0.631 | small_capacity +0.094; counter_seating +0.089; solo_friendly +0.089; budget +0.083; group_friendly +0.075; table_dining +0.075; date_friendly +0.062; grilled +0.062 |
| Edo Sakaba Umi | 6 | 0.585 | small_capacity +0.125; counter_seating +0.119; solo_friendly +0.119; budget +0.111; izakaya +0.056; neighbourhood +0.056 |
| Feel Good Foods | 2 | 0.583 | budget +0.333; grilled +0.250 |
| GET BETTER Coffee & Sandwich | 5 | 0.560 | small_capacity +0.150; solo_friendly +0.143; budget +0.133; creative +0.067; intimate +0.067 |
| Gentoushi Nakada | 8 | 0.508 | small_capacity +0.094; counter_seating +0.089; group_friendly +0.075; date_friendly +0.062; seasonal +0.062; creative +0.042; intimate +0.042; reservation_heavy +0.042 |
| Hatsune | 8 | 0.537 | counter_seating +0.089; solo_friendly +0.089; group_friendly +0.075; table_dining +0.075; casual +0.062; date_friendly +0.062; moderate +0.042; neighbourhood +0.042 |
| Horumon-yaki Kuunomu | 7 | 0.656 | small_capacity +0.107; counter_seating +0.102; solo_friendly +0.102; upscale +0.102; group_friendly +0.086; table_dining +0.086; grilled +0.071 |
| Ichikawa | 6 | 0.466 | small_capacity +0.125; counter_seating +0.119; cuisine_sushi +0.056; intimate +0.056; reservation_heavy +0.056; seafood +0.056 |
| Jiangxi Rice Noodles Guyue (Karaoke Izakaya) | 3 | 0.444 | budget +0.222; cuisine_chinese +0.111; izakaya +0.111 |
| Kera Tokyo Rooftop Lounge Bar | 1 | 0.333 | moderate +0.333 |
| La Blanche | 5 | 0.503 | small_capacity +0.150; table_dining +0.120; seasonal +0.100; intimate +0.067; seafood +0.067 |
| La Table de IDÉAL Restaurant | 6 | 0.646 | small_capacity +0.125; counter_seating +0.119; solo_friendly +0.119; group_friendly +0.100; table_dining +0.100; date_friendly +0.083 |
| Lounge 8 Tokyo | 8 | 0.603 | small_capacity +0.094; counter_seating +0.089; solo_friendly +0.089; upscale +0.089; group_friendly +0.075; casual +0.062; date_friendly +0.062; intimate +0.042 |
| Mira Food | 4 | 0.711 | small_capacity +0.188; counter_seating +0.179; solo_friendly +0.179; budget +0.167 |
| Moelleuse | 9 | 0.561 | small_capacity +0.083; counter_seating +0.079; solo_friendly +0.079; group_friendly +0.067; table_dining +0.067; date_friendly +0.056; seasonal +0.056; intimate +0.037; quiet +0.037 |
| Natural Wine and Craft Beer sun. | 8 | 0.570 | small_capacity +0.094; counter_seating +0.089; solo_friendly +0.089; upscale +0.089; casual +0.062; date_friendly +0.062; creative +0.042; quiet +0.042 |
| Petit Restaurant Nakajima | 7 | 0.626 | small_capacity +0.107; counter_seating +0.102; solo_friendly +0.102; budget +0.095; group_friendly +0.086; table_dining +0.086; neighbourhood +0.048 |
| Ryogoku Zushi | 9 | 0.561 | small_capacity +0.083; counter_seating +0.079; solo_friendly +0.079; budget +0.074; group_friendly +0.067; table_dining +0.067; cuisine_sushi +0.037; neighbourhood +0.037; seafood +0.037 |
| Sulpan Yoyogi | 5 | 0.616 | solo_friendly +0.143; budget +0.133; group_friendly +0.120; table_dining +0.120; date_friendly +0.100 |
| Sushi Ichiro | 8 | 0.576 | small_capacity +0.094; counter_seating +0.089; solo_friendly +0.089; budget +0.083; group_friendly +0.075; date_friendly +0.062; cuisine_sushi +0.042; seafood +0.042 |
| Sushi Nigiri | 3 | 0.460 | counter_seating +0.238; cuisine_sushi +0.111; seafood +0.111 |
| Sushi Onuki | 7 | 0.466 | counter_seating +0.102; upscale +0.102; seasonal +0.071; cuisine_sushi +0.048; reservation_heavy +0.048; seafood +0.048; traditional +0.048 |
| Sushi-ya Ono | 5 | 0.546 | small_capacity +0.150; counter_seating +0.143; group_friendly +0.120; cuisine_sushi +0.067; seafood +0.067 |
| Sushizen | 8 | 0.522 | small_capacity +0.094; counter_seating +0.089; solo_friendly +0.089; casual +0.062; seasonal +0.062; cuisine_sushi +0.042; intimate +0.042; seafood +0.042 |
| Tempura Motoyoshi | 5 | 0.526 | small_capacity +0.150; counter_seating +0.143; date_friendly +0.100; intimate +0.067; reservation_heavy +0.067 |
| Tonchū | 4 | 0.628 | small_capacity +0.188; counter_seating +0.179; solo_friendly +0.179; moderate +0.083 |
| Tonkatsu Motoko | 2 | 0.633 | budget +0.333; group_friendly +0.300 |
| Tonkatsu Nagi | 6 | 0.558 | small_capacity +0.125; counter_seating +0.119; solo_friendly +0.119; date_friendly +0.083; moderate +0.056; quiet +0.056 |
| Toritoshi | 8 | 0.603 | small_capacity +0.094; counter_seating +0.089; solo_friendly +0.089; upscale +0.089; table_dining +0.075; date_friendly +0.062; grilled +0.062; neighbourhood +0.042 |
| Tsumuguito | 7 | 0.509 | small_capacity +0.107; counter_seating +0.102; group_friendly +0.086; date_friendly +0.071; cuisine_sushi +0.048; reservation_heavy +0.048; seafood +0.048 |
| Ufufu Shirokanedai | 1 | 0.750 | small_capacity +0.750 |
| Unaga | 6 | 0.574 | small_capacity +0.125; counter_seating +0.119; solo_friendly +0.119; table_dining +0.100; moderate +0.056; quiet +0.056 |
| VinIX (Vank) | 4 | 0.525 | group_friendly +0.150; casual +0.125; date_friendly +0.125; grilled +0.125 |
| Vini di Arai | 5 | 0.503 | small_capacity +0.150; group_friendly +0.120; cuisine_italian +0.100; intimate +0.067; reservation_heavy +0.067 |
| ¡ÁNIMO! Waseda | 4 | 0.695 | small_capacity +0.188; solo_friendly +0.179; upscale +0.179; table_dining +0.150 |

### Same-seed legacy progression

| Selector | Unique / positions | Repeat rate | First repeat | Mean cycle affinity | Mean cycle Fiyu |
|---|---:|---:|---:|---:|---:|
| Personalized | 36 / 36 | 0.0% | — | 0.563 | 79.82 |
| Legacy | 36 / 36 | 0.0% | — | 0.548 | 79.56 |

## Quality over the progression window

| Profile | Mean affinity first → last | Min affinity first → last | Mean Fiyu first → last | Radius first → last | Unseen remaining last |
|---|---:|---:|---:|---:|---:|
| Profile A — no history | 0.000 → 0.000 | 0.000 → 0.000 | 85.27 → 79.71 | 1.5 → 5.0 km | 27 |
| Profile B — sparse sushi/counter | 0.053 → 0.033 | 0.033 → 0.000 | 86.12 → 80.41 | 1.5 → 5.0 km | 27 |
| Profile C — medium sushi/counter | 0.110 → 0.103 | 0.027 → 0.084 | 83.09 → 81.75 | 1.5 → 5.0 km | 27 |
| Profile D — mature expensive | 0.480 → 0.392 | 0.347 → 0.000 | 84.62 → 81.68 | 1.5 → 5.0 km | 27 |
| Profile E — mature eclectic | 0.480 → 0.474 | 0.453 → 0.389 | 86.12 → 82.43 | 1.5 → 5.0 km | 27 |
| Profile F — likes affordable and expensive | 0.580 → 0.570 | 0.509 → 0.444 | 85.03 → 81.14 | 1.5 → 5.0 km | 27 |

Later cycles expand geographically as the tight-radius unseen inventory is consumed. Quality generally declines modestly; mature Taste affinity remains positive, while the high-price profile's final exploration Pick reaches neutral rather than a materially negative fallback.

## Cooldown verification

The probe uses real catalog rows and the real selector in the temporary clone.

- Three unseen candidates preferred over a ≥7-day reserve: **True**.
- Six-day candidate blocked: **True**.
- Exactly-seven-day candidate unused while three unseen exist: **True**.
- Exactly-seven-day candidate used when only two unseen remain: **True**.
- Saved candidate excluded: **True**.
- Affordable recent candidate did not bypass cooldown: **True**.
- Personalization did not bypass cooldown: **True**.

## Facet frequency and specificity

Specificity bands are descriptive only: highly common ≥40%, moderately common 10–<40%, distinctive/rare <10%.

| Facet | Restaurants | Share | Band |
|---|---:|---:|---|
| `small_capacity` | 187 | 71.1% | highly common |
| `counter_seating` | 155 | 58.9% | highly common |
| `solo_friendly` | 141 | 53.6% | highly common |
| `group_friendly` | 116 | 44.1% | highly common |
| `table_dining` | 113 | 43.0% | highly common |
| `date_friendly` | 75 | 28.5% | moderately common |
| `moderate` | 75 | 28.5% | moderately common |
| `budget` | 70 | 26.6% | moderately common |
| `seafood` | 63 | 24.0% | moderately common |
| `izakaya` | 62 | 23.6% | moderately common |
| `upscale` | 50 | 19.0% | moderately common |
| `splurge` | 43 | 16.3% | moderately common |
| `cuisine_sushi` | 41 | 15.6% | moderately common |
| `intimate` | 41 | 15.6% | moderately common |
| `private_rooms` | 41 | 15.6% | moderately common |
| `seasonal` | 39 | 14.8% | moderately common |
| `casual` | 34 | 12.9% | moderately common |
| `grilled` | 32 | 12.2% | moderately common |
| `neighbourhood` | 32 | 12.2% | moderately common |
| `reservation_heavy` | 23 | 8.7% | distinctive/rare |
| `quiet` | 21 | 8.0% | distinctive/rare |
| `creative` | 13 | 4.9% | distinctive/rare |
| `traditional` | 13 | 4.9% | distinctive/rare |
| `cuisine_french` | 10 | 3.8% | distinctive/rare |
| `cuisine_italian` | 10 | 3.8% | distinctive/rare |
| `cuisine_chinese` | 9 | 3.4% | distinctive/rare |
| `noodles` | 8 | 3.0% | distinctive/rare |
| `chef_led` | 7 | 2.7% | distinctive/rare |
| `tasting_course` | 7 | 2.7% | distinctive/rare |
| `cuisine_okinawan` | 5 | 1.9% | distinctive/rare |
| `cuisine_indian` | 4 | 1.5% | distinctive/rare |
| `refined` | 4 | 1.5% | distinctive/rare |
| `regional` | 4 | 1.5% | distinctive/rare |
| `cuisine_korean` | 3 | 1.1% | distinctive/rare |
| `cuisine_thai` | 2 | 0.8% | distinctive/rare |
| `special_occasion` | 2 | 0.8% | distinctive/rare |
| `lively` | 1 | 0.4% | distinctive/rare |

## Strongest facet correlations

| Pair | Together | Jaccard | P(right\|left) | P(left\|right) |
|---|---:|---:|---:|---:|
| `counter_seating` + `solo_friendly` | 119 | 0.672 | 76.8% | 84.4% |
| `counter_seating` + `small_capacity` | 136 | 0.660 | 87.7% | 72.7% |
| `cuisine_sushi` + `seafood` | 41 | 0.651 | 100.0% | 65.1% |
| `small_capacity` + `solo_friendly` | 123 | 0.600 | 65.8% | 87.2% |
| `group_friendly` + `table_dining` | 80 | 0.537 | 69.0% | 70.8% |
| `solo_friendly` + `table_dining` | 79 | 0.451 | 56.0% | 69.9% |
| `small_capacity` + `table_dining` | 93 | 0.449 | 49.7% | 82.3% |
| `counter_seating` + `table_dining` | 82 | 0.441 | 52.9% | 72.6% |
| `group_friendly` + `small_capacity` | 89 | 0.416 | 76.7% | 47.6% |
| `counter_seating` + `group_friendly` | 79 | 0.411 | 51.0% | 68.1% |
| `group_friendly` + `solo_friendly` | 71 | 0.382 | 61.2% | 50.4% |
| `seasonal` + `splurge` | 22 | 0.367 | 56.4% | 51.2% |
| `date_friendly` + `splurge` | 31 | 0.356 | 41.3% | 72.1% |
| `date_friendly` + `group_friendly` | 50 | 0.355 | 66.7% | 43.1% |
| `counter_seating` + `date_friendly` | 60 | 0.353 | 38.7% | 80.0% |
| `date_friendly` + `small_capacity` | 67 | 0.344 | 89.3% | 35.8% |
| `counter_seating` + `seafood` | 54 | 0.329 | 34.8% | 85.7% |
| `reservation_heavy` + `splurge` | 16 | 0.320 | 69.6% | 37.2% |
| `group_friendly` + `private_rooms` | 38 | 0.319 | 32.8% | 92.7% |
| `date_friendly` + `seasonal` | 27 | 0.310 | 36.0% | 69.2% |

Strongest three-facet groups (generalized Jaccard):

- `counter_seating + small_capacity + solo_friendly`: 107 together; Jaccard 0.505
- `counter_seating + solo_friendly + table_dining`: 68 together; Jaccard 0.345
- `counter_seating + small_capacity + table_dining`: 71 together; Jaccard 0.330
- `small_capacity + solo_friendly + table_dining`: 68 together; Jaccard 0.318
- `counter_seating + group_friendly + small_capacity`: 67 together; Jaccard 0.303
- `counter_seating + group_friendly + solo_friendly`: 59 together; Jaccard 0.292
- `group_friendly + small_capacity + table_dining`: 60 together; Jaccard 0.280
- `counter_seating + group_friendly + table_dining`: 54 together; Jaccard 0.274
- `counter_seating + date_friendly + small_capacity`: 58 together; Jaccard 0.274
- `group_friendly + small_capacity + solo_friendly`: 58 together; Jaccard 0.265
- `group_friendly + solo_friendly + table_dining`: 50 together; Jaccard 0.263
- `counter_seating + date_friendly + solo_friendly`: 44 together; Jaccard 0.235

## Correlated-facet amplification evidence

These are exact combined contributions from the highly correlated counter/small-capacity/solo cluster; they are not alternative scores.

| Profile | Candidate | Generic terms | Combined affinity contribution |
|---|---|---|---:|
| Profile F — likes affordable and expensive | Mira Food | counter_seating +0.179; small_capacity +0.188; solo_friendly +0.179 | +0.545 |
| Profile F — likes affordable and expensive | Tonchū | counter_seating +0.179; small_capacity +0.188; solo_friendly +0.179 | +0.545 |
| Profile E — mature eclectic | Mira Food | counter_seating +0.143; small_capacity +0.163; solo_friendly +0.143 | +0.448 |
| Profile E — mature eclectic | Tonchū | counter_seating +0.143; small_capacity +0.163; solo_friendly +0.143 | +0.448 |
| Profile D — mature expensive | Mira Food | counter_seating +0.141; small_capacity +0.153; solo_friendly +0.141 | +0.434 |
| Profile D — mature expensive | Tonchū | counter_seating +0.141; small_capacity +0.153; solo_friendly +0.141 | +0.434 |
| Profile F — likes affordable and expensive | ¡ÁNIMO! Waseda | small_capacity +0.188; solo_friendly +0.179 | +0.366 |
| Profile F — likes affordable and expensive | Edo Sakaba Umi | counter_seating +0.119; small_capacity +0.125; solo_friendly +0.119 | +0.363 |
| Profile F — likes affordable and expensive | La Table de IDÉAL Restaurant | counter_seating +0.119; small_capacity +0.125; solo_friendly +0.119 | +0.363 |
| Profile F — likes affordable and expensive | Tonkatsu Nagi | counter_seating +0.119; small_capacity +0.125; solo_friendly +0.119 | +0.363 |
| Profile F — likes affordable and expensive | Unaga | counter_seating +0.119; small_capacity +0.125; solo_friendly +0.119 | +0.363 |
| Profile D — mature expensive | Edo Sakaba Umi | counter_seating +0.113; small_capacity +0.122; solo_friendly +0.113 | +0.347 |

## Distinctive-signal dilution evidence

These rows compare the candidate's cuisine-only profile affinity with the actual equal average across every candidate-known facet. A positive difference is dilution by the additional known facets, not a proposed replacement score.

| Profile | Candidate | Cuisine facets | Cuisine-only | Actual | Difference |
|---|---|---|---:|---:|---:|
| Profile D — mature expensive | BEStORY COFFEE | izakaya | 0.333 | 0.000 | 0.333 |
| Profile C — medium sushi/counter | Sushi Suehiro | cuisine_sushi | 0.300 | 0.167 | 0.133 |
| Profile C — medium sushi/counter | Kojimachi Sushi Yamato | cuisine_sushi | 0.300 | 0.177 | 0.123 |
| Profile C — medium sushi/counter | Ryogoku Zushi | cuisine_sushi | 0.300 | 0.180 | 0.120 |
| Profile C — medium sushi/counter | Sushizen | cuisine_sushi | 0.300 | 0.193 | 0.107 |
| Profile C — medium sushi/counter | Sushi Ichiro | cuisine_sushi | 0.300 | 0.195 | 0.105 |
| Profile D — mature expensive | Sushi Uchida Setagaya | cuisine_sushi | 0.500 | 0.403 | 0.097 |
| Profile D — mature expensive | Sushi Ichiro | cuisine_sushi | 0.500 | 0.403 | 0.097 |
| Profile C — medium sushi/counter | Sushi Onuki | cuisine_sushi | 0.300 | 0.207 | 0.093 |
| Profile C — medium sushi/counter | Sushi Nakao | cuisine_sushi | 0.300 | 0.208 | 0.092 |
| Profile C — medium sushi/counter | Tsumuguito | cuisine_sushi | 0.300 | 0.212 | 0.088 |
| Profile C — medium sushi/counter | Sushi Hashiguchi | cuisine_sushi | 0.300 | 0.215 | 0.085 |

## Conclusions

- Across the twelve-day progression, unseen-first selection eliminated the static mature-profile concentration: every profile received 36 unique restaurants in 36 positions, with no repeat fallback required.
- Strong, moderate/novel, and exploration roles each broadened beyond one restaurant; the per-profile role-breadth counts above show the exact totals.
- No affordable restaurant repeated in this window. The high-price counterfactual shows whether adaptive affordability changed variety, affinity, or quality.
- The cooldown probes found no bypass by Saved state, personalization, or the affordable slot, and confirmed the exact seven-day boundary plus unseen-first fallback semantics.
- No production correctness defect was found in this evaluation.

## Interpretation and Taste-v2 questions

- Cooldown progression should be judged from the rotation tables above; the static three-restaurant concentration is not equivalent to production progression.
- Contribution rows expose correlated-facet amplification directly: several generic facets can each add a separate signed term for one underlying service/seating pattern.
- Because the current candidate score averages all candidate-known profile facets, many weak generic terms can also dilute one stronger cuisine-specific term.
- Should Taste v2 group tightly correlated format facets before averaging?
- Should facet-specific information weights distinguish ubiquitous format facets from rarer cuisine/style signals?
- Would normalized food tags and a richer cuisine hierarchy provide more specific evidence without over-counting synonyms?
- Should future evaluation compare equal-weight affinity with grouped or information-weighted diagnostics before changing production?

No production selector, cooldown, affinity, affordability, or scoring behavior was changed.
