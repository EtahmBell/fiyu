# Fiyu Types groundwork audit

**Audit date:** 2026-10-10  
**Population:** all 1,430 rows where `public_restaurants.is_published = 1`  
**Purpose:** empirical groundwork for future Fiyu Types; no type taxonomy was created or written to production.

## Executive conclusion

The published catalog contains strong recurring **continuous** restaurant-side patterns, but only moderate evidence for hard clusters. Four exploratory profiles were the best of the tested 4–8 cluster solutions (`k=4`, mean silhouette `0.274`), and each crosses many cuisines and Tokyo areas. They are useful as coverage and hypothesis checks, not as final Fiyu Types.

The clearest catalog dimension is a continuum from **hidden/local discovery** to **higher-quality-evidence, higher-price, destination/polished dining**. A second, weaker dimension combines Independence and price; a third separates Local Signal from general discoverability. Hiddenness and Local Discovery are highly overlapping (`r=0.897`) and should not become separate nominal types. Quality-v4 `researched_quality` is numerically the same signal as `quality_signal` (`r=1.000`) and must not be duplicated.

Cuisine and neighborhood influence the score components but do not explain the exploratory profiles strongly enough to define them: bias-corrected cluster associations are weak for pooled primary category (`Cramér's V=0.208`) and geography (`V=0.228`). The profiles span 18–20 derived areas and 106–224 raw primary categories each.

The largest blocker to a richer behavioral model is not catalog size. It is the absence of consistently structured atmosphere, occasion, social/solo, formality, traditional/contemporary, menu-breadth, and chef-identity attributes—and, ultimately, user behavior. Future Fiyu Types should be learned from user choices over continuous restaurant attributes, then tested for stability and interpretability before naming.

## Audit A — catalog composition

### Core population and eligibility

- Published: **1,430**.
- Map/Picks-ready: **1,427**; three published rows are not map-ready.
- Publication threshold: **70**; candidate seed floor: **60**.
- Score system: `public-v4-quality-research-specialist-tristate`.
- Score bands: 847 strong (59.23%), 539 promising (37.69%), 44 exceptional (3.08%).
- Confidence bands: 1,080 high (75.52%), 331 moderate (23.15%), 19 low (1.33%).

### Numerical distributions

| Dimension | Coverage | Mean | p10 | Median | p90 | Main observation |
|---|---:|---:|---:|---:|---:|---|
| Fiyu Score | 1,430 (100%) | 76.87 | 71.83 | 76.42 | 82.56 | Expected truncation above the publication threshold; max 90.50. |
| Quality | 1,430 (100%) | 70.92 | 55.12 | 70.18 | 89.40 | Broadest opposing pole to local/hidden discovery. |
| Hiddenness | 1,430 (100%) | 75.08 | 52.68 | 77.34 | 93.95 | Strongly tracks Local Discovery. |
| Independence | 1,430 (100%) | 94.96 | 79.00 | 100.00 | 100.00 | Severe ceiling; limited discrimination for most rows. |
| Local Signal | 1,430 (100%) | 72.55 | 60.50 | 74.29 | 82.14 | Related to, but distinct from, Local Discovery. |
| Local Discovery | 1,430 (100%) | 77.80 | 65.23 | 78.86 | 89.22 | Strong overlap with Hiddenness. |
| Budget midpoint | 1,176 (82.24%) | — | — | ¥3,500 | ¥12,499.50 | Highly right-skewed; max ¥82,500; 254 missing. |
| Quality-v4 researched quality | 1,428 (99.86%) | 70.94 | — | 70.20 | — | Essentially identical to production Quality. |
| Positive case strength | 1,428 (99.86%) | 34.43 | — | 35.85 | — | Substantial spread. |
| Negative case strength | 1,428 (99.86%) | 0.19 | — | 0.00 | 0.61 | Extremely zero-inflated; max 13.82. |

Exact percentiles, standard deviations, minima/maxima, and missingness are in `catalog-distributions.json`.

### Structured categorical composition

- **Cuisine:** raw primary category is complete but fragmented into 482 bilingual values. The largest are `居酒屋` 164 (11.47%), `Izakaya` 90 (6.29%), and `Sushi restaurant` 66 (4.62%). Normalized cuisine and cuisine family cover only 678 rows (47.41%). Among normalized rows, izakaya (178), sushi (93), Japanese (50), yakiniku (43), Italian (37), yakitori (35), and French (31) lead. Cuisine family is dominated by Japanese (508), but missing normalization prevents a complete catalog-level cuisine comparison.
- **Specialist status:** 1,175 specialist (82.17%), 254 unknown (17.76%), and one non-specialist (0.07%). `unknown` was not treated as negative or generalist.
- **Price bands:** 1,176 known (82.24%): moderate 544, upscale 307, budget 183, splurge 142.
- **Geography:** derived geography is complete across 25 values; largest are Toshima 162, Adachi 161, Ota 146, Shibuya 124, Setagaya 123, Minato 122, Taito 122, and Koto 115. The more granular `discovery_area` field covers 850 rows (59.44%) and has 501 values, so it is not a stable grouping level.
- **Local-discovery classification:** high-local-discovery/low-footprint 589 (41.19%), local discovery 560 (39.16%), moderately local 273 (19.09%), mainstream visible 8 (0.56%).
- **Tourist visibility:** low international visibility 1,138 (79.58%), mixed 275 (19.23%), tourist visible 17 (1.19%). Tourist orientation itself is `unknown` for 888 (62.10%), limiting use.
- **Access:** public 864 (60.42%), unknown 435 (30.42%), reservation required 129 (9.02%), referral one, members one. Reservation status is available as a separate operational field: recommended 748, unknown 400, required 142, usually not needed 85, strongly recommended 47, walk-ins 8.
- **Location:** precision is approximate for 1,411, exact for 16, missing for three. Verification status is provisional for 1,392, verified for 34, unresolved for three, manual for one. Map anchors are chōme 1,048, neighborhood 178, area 143, missing 61.
- **Editorial text-derived fields:** review themes have at least one value for 790 (55.24%) but contain 1,970 largely unique strings. Food tags cover 1,426 (99.72%) but contain 1,742 fragmented values. They are useful evidence, not analysis-ready dimensions without normalization.

Missing values were reported and excluded pairwise. They were never converted into a negative trait.

## Audit B — relationships between dimensions

Pearson and Spearman statistics are in `feature-correlations.csv`; group relationships use eta-squared over groups with at least ten rows, and profile associations use bias-corrected Cramér's V.

### Strong overlap / redundancy

- Quality and Quality-v4 researched quality: `r=1.000`.
- Hiddenness and Local Discovery: `r=0.897`.
- Quality and Local Discovery: `r=-0.735`.
- Quality and Hiddenness: `r=-0.671`.

The negative Quality/discovery relationships are real within this published sample, but may reflect score construction, source mix, and the publication boundary in addition to restaurant behavior.

### Moderate relationships

- Fiyu Score and Quality: `r=0.539`.
- Local Signal and Local Discovery: `r=0.481`.
- Hiddenness and Local Signal: `r=0.396`.
- Independence and Local Discovery: `r=0.317`.
- Budget is most related to Hiddenness (Spearman `-0.389`), Local Discovery (`-0.312`), and Quality (`+0.269`). It is nearly unrelated to final Fiyu Score (`+0.021`).

### Largely orthogonal

- Hiddenness and Independence: `r=0.008`.
- Fiyu Score and Local Signal: `r=0.048`.
- Fiyu Score and Hiddenness: `r=0.143`.
- Fiyu Score and Local Discovery: `r=0.152`.
- Fiyu Score and Independence: `r=0.164`.

### Categorical relationships

- Normalized cuisine explains moderate-to-large variance in several components among the 614 rows in normalized groups of at least ten: eta-squared is 0.190 for Hiddenness, 0.152 for Local Signal, 0.146 for Local Discovery, and 0.129 for Quality. Broader cuisine family effects are only small (0.020–0.054), suggesting fine category/source composition rather than cuisine family alone drives much of the difference.
- Geography has moderate effects on Quality (0.111), Hiddenness (0.104), Local Signal (0.101), and Local Discovery (0.094), but only a small effect on Fiyu Score (0.037).
- Price band has a large effect on Hiddenness (0.148), moderate effects on Local Discovery (0.097) and Quality (0.088), and negligible effect on Independence (0.009).
- Specialist vs non-specialist cannot be estimated: only one canonical non-specialist exists. Specialist vs `unknown` differs on Hiddenness and Local Discovery, but this is a missingness/research-status comparison, not a specialist/generalist contrast.

## Audit C — recurring restaurant profiles

The following are neutral working descriptions of the four clusters, not proposed product names.

### Profile 1: hidden, local, lower-price discovery (603; 42.17%)

- Above baseline: Local Discovery `+0.82σ`, Hiddenness `+0.72σ`, Independence `+0.47σ`, Local Signal `+0.41σ`.
- Below baseline: Quality `-0.74σ`, budget `-0.46σ`.
- Means: Quality 61.30, Hiddenness 86.46, Independence 99.08, Local Signal 76.22, Local Discovery 85.55.
- Coverage: 224 raw categories, 20 areas, all four price bands (454 known). Largest raw category is only 18.1%.
- Representative examples: Shodai Choberiba, Ryūya, Kitchen Shima, Shun no Ie, Toshichan Motsuyaki.
- Assessment: strongest broad discovery profile and suitable for catalog-wide recommendation experiments. Its dominant ingredients are correlated, so do not split it into separate hidden/local types.

### Profile 2: lower-Independence, mixed-price neighborhood set (223; 15.59%)

- Dominant difference: Independence `-1.90σ`; smaller Hiddenness `+0.41σ` and budget `-0.31σ`.
- Means: Quality 73.18, Hiddenness 81.49, Independence 78.21, Local Signal 72.14, Local Discovery 75.81.
- Coverage: 128 raw categories, 18 areas, all four price bands (180 known). Largest raw category 14.4%.
- Representative examples: Cho-i Nomi-dokoro Yorimichi, Mutsumiya, Sasasaisai, Gyoza Izakaya Shimizu, Gyumotsu Gyuniku Sake Banrai.
- Assessment: recurrent and cross-cuisine, but product meaning is uncertain because the catalog's Independence distribution is severely ceilinged. This profile should wait for field validation and user behavior.

### Profile 3: independent, higher-spend balanced quality (395; 27.62%)

- Above baseline: budget `+0.56σ`, Independence `+0.54σ`, Quality `+0.32σ`.
- Below baseline: Hiddenness `-0.47σ`; Local Discovery only modestly below baseline (`-0.24σ`).
- Means: Quality 75.08, Hiddenness 67.70, Independence 99.71, Local Signal 73.13, Local Discovery 75.51.
- Coverage: 186 raw categories, 20 areas, all four price bands (357 known); largest category 5.1%.
- Representative examples: Wasou Hikichi, Ukare Ebi, de’Afrique, Edoichi, Horumon Kemuri.
- Assessment: highly cross-cuisine and broad enough for recommendations. It may represent a useful middle between discovery-led and destination-led dining, but price missingness should be addressed.

### Profile 4: high-quality-evidence destination/polished set (209; 14.62%)

- Above baseline: Quality `+1.35σ`, budget `+0.58σ`.
- Below baseline: Local Discovery `-1.69σ`, Hiddenness `-1.63σ`, Local Signal `-1.25σ`.
- Means: Quality 88.41, Hiddenness 49.34, Independence 91.95, Local Signal 61.31, Local Discovery 61.87.
- Coverage: 106 raw categories, 18 areas, all four price bands (185 known); largest category 9.1%.
- Representative examples: KIYAS, Mamma Luisa's Table, Restaurant Seiyoginza, Wasai Nanao, Nœud. TOKYO.
- Assessment: clear catalog-wide counter-pole to Profile 1. It is large enough overall, but at 209 restaurants may be thin after neighborhood, date, and availability filters; Daily Picks viability should be simulated before product use.

All four pass a coarse catalog-coverage check and are cross-cuisine at the raw-category level. None is a clean natural class: silhouette scores across `k=4..8` range only 0.230–0.274.

## Audits D and E — latent dimensions and viability

PCA supports four candidate axes, detailed in `latent-dimensions.md`:

1. **Local/hidden discovery ↔ polished/destination** — strong; 50.47% of variance; 1,430 usable; broad cuisine/area/price coverage.
2. **Independent/established and price level** — plausible; 18.92%; 1,430 score coverage, 1,176 observed price; weakened by Independence ceiling.
3. **Local-audience affinity independent of discovery visibility** — plausible; 12.68%; 1,430 usable; potentially behaviorally meaningful.
4. **Value/local balance** — weak; 11.42%; price missing for 254 and likely too context-dependent for a standalone identity.

Catalog-wide candidate volume is sufficient for the first and third axes. All four profiles span many areas and categories, but Daily Picks viability under simultaneous geography, availability, budget, and novelty filters was not measured here. Profile 4 and sparse neighborhoods should therefore be treated cautiously.

## Audit F — data gaps

The most important unstructured or under-structured concepts are atmosphere/energy, occasion, solo/social suitability, traditional/contemporary style, adventurousness, formality/service style, menu breadth, chef-driven identity, and temporal/service-window context. `data-gaps.md` explains why each matters, what evidence may already exist, and whether metadata or user behavior is the better source.

## Audit G — product recommendation

### Strongest observed restaurant-side archetypes

Carry forward the four profiles above as hypotheses only: hidden/local lower-price discovery; lower-Independence mixed-price neighborhood venues; independent higher-spend balanced quality; and high-quality-evidence destination/polished dining. Do not name them as Fiyu Types or persist membership yet.

### Signals ready for experimental use

- Quality, Hiddenness, Local Signal, Local Discovery, and final Fiyu Score are complete.
- Independence is complete but ceilinged; use coarsely and audit its meaning.
- Price is useful for 82.24% and should include an explicit missing state in product experiments.
- Geography is complete at the derived city/search-area level.
- Specialist is usable as a positive evidenced flag, not as a balanced axis.

### Dimensions that should wait for user data

- Whether users prefer the local/hidden or polished/destination end of PC1.
- Occasion-specific price/formality tradeoffs.
- Adventurousness, novelty appetite, social/solo fit, atmosphere, and temporal context.
- Whether Profile 2's lower Independence has a stable, user-meaningful interpretation.
- Any named segmentation: restaurant-side structure does not prove stable user segments.

### Concepts that should not become types now

- Cuisine or neighborhood: descriptors and constraints, not “how someone likes to eat.”
- Separate Hiddenness and Local Discovery types: too redundant.
- Quality or Fiyu Score types: would restate ranking.
- Specialist/generalist: non-specialist coverage is one row and `unknown` is not generalist.
- Negative-evidence strength: almost entirely zero.
- Raw review themes/food tags: too fragmented.
- Atmosphere, occasion, adventurousness, formality, and chef identity: insufficiently structured and often subjective/contextual.

### Recommended derivation path

Represent each restaurant as a versioned continuous attribute vector with confidence and missingness. Record user interactions and context; learn user preference vectors or mixtures over attributes; validate prediction on held-out behavior and across cuisine/geography; inspect stability, fairness, and minimum candidate coverage; then translate only stable patterns into optional user-facing explanations. Manual labels may describe validated patterns, but should not create the patterns.

## Reproducible methodology

1. Opened `data/fiyu.db` with SQLite URI `mode=ro`, enabled `PRAGMA query_only=ON`, and required `PRAGMA integrity_check = ok`.
2. Selected every published row from `public_restaurants`, ordered by `place_id`.
3. Left-joined canonical candidate geography/category fields from `restaurants`, cuisine normalization from `restaurant_cuisine_normalizations`, and the highest-ID Quality-v4 record per restaurant from `quality_v4_research_runs`.
4. Parsed existing budget, review-theme, and food-tag JSON. Derived geography from candidate city, then candidate search area, then discovery area. No provider or network data was used.
5. Reported numeric distributions and categorical coverage. Numeric associations use pairwise-complete Pearson and Spearman coefficients. Categorical/numeric associations use eta-squared for groups with at least ten rows. Cluster/categorical associations use bias-corrected Cramér's V; raw primary categories under ten rows are pooled for that statistic.
6. For exploration only, used Quality, Hiddenness, Independence, Local Signal, Local Discovery, and ordinal price. Price missingness was median-imputed; features were z-standardized. Cuisine, geography, names, free text, composite Fiyu Score, and specialist status were excluded from fitting. Specialist was excluded because only one row is canonical non-specialist.
7. Computed PCA by singular-value decomposition. Ran deterministic k-means for `k=4..8`, 20 seeds per k, selected the minimum-inertia run for each k, and chose the highest mean silhouette subject to every cluster containing at least 3% of the catalog. Used cuisine, geography, price, and specialist status only for post-hoc profile checks.
8. Chose representative examples by proximity to each centroid while preferring category diversity. These examples illustrate measured profiles; they are not endorsements or labels.

## Safety and integrity controls

- Database SHA-256 before and after: `94119158B1306545264475FBA552EDBF11B4D7E803E243DE52753C96B3053127` (unchanged).
- `seed70.txt` SHA-256 before and after: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39` (unchanged).
- `PRAGMA integrity_check`: `ok` before and after.
- Database was opened read-only; no catalog, score, publication, schema, or taxonomy mutations were made.
- Zero provider, network, or OpenAI calls were made.
