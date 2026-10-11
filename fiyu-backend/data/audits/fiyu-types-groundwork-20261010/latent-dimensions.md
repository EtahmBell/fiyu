# Candidate latent dimensions

These are restaurant-side continuous dimensions found in the published catalog. They are not user labels or final Fiyu Types. PCA used six standardized variables: Quality, Hiddenness, Independence, Local Signal, Local Discovery, and ordinal budget. Cuisine, geography, restaurant names, free text, the composite Fiyu Score, and specialist status were not inputs. Missing budget (254 restaurants) was median-imputed; the five score signals were complete.

## 1. Local/hidden discovery ↔ polished/destination dining — strong

- **Evidence:** PC1 explains 50.47% of standardized variance. Its largest loadings are Local Discovery (-0.545), Hiddenness (-0.514), Quality (+0.481), Local Signal (-0.343), and budget (+0.256).
- **Supporting observations:** Hiddenness and Local Discovery correlate at `r=0.897`. Quality is inversely related to Local Discovery (`r=-0.735`) and Hiddenness (`r=-0.671`). Price is lower toward the hidden/local end (budget-band Spearman correlations: Hiddenness `-0.389`, Local Discovery `-0.312`).
- **Independence:** This axis dominates the variance structure, but it combines several intentionally related score components and is partly shaped by catalog selection/scoring. It should be represented once, not reintroduced as several nominal types.
- **Coverage:** all 1,430 restaurants; all 25 derived geography values; broad cuisine and price coverage. Cuisine normalization is available for only 678 restaurants, so the cross-cuisine claim is strongest at the raw-category level.
- **Recommendation meaning:** likely useful for choosing between low-footprint neighborhood discovery and higher-polish destination dining.
- **Confidence:** **strong** as a catalog dimension; only **plausible** as a user-preference dimension until saves/ratings demonstrate that people consistently prefer positions on it.

## 2. Independent/established and price level — plausible

- **Evidence:** PC2 explains 18.92% of variance, led by Independence (+0.787) and budget (+0.561). The exploratory profiles also isolate a 223-restaurant lower-Independence group.
- **Independence:** mathematically orthogonal to PC1. Independence itself is nearly orthogonal to Hiddenness (`r=0.008`) and only moderately tied to Local Discovery (`r=0.317`).
- **Coverage:** Independence is complete, but heavily ceilinged (median and 75th percentile are 100); structured budget covers 1,176 restaurants (82.24%). This makes fine-grained differentiation weak for most of the catalog.
- **Recommendation meaning:** may separate strongly independent venues from more institution-like or organizationally visible restaurants, with price supplying a second behavioral cue. It should not be called an “independence type” without validating the ceiling and what lower values mean operationally.
- **Confidence:** **plausible**.

## 3. Local-audience affinity independent of discovery visibility — plausible

- **Evidence:** PC3 explains 12.68% of variance, led by Local Signal (+0.718), budget (+0.518), and Independence (-0.442). Local Signal has only moderate correlation with Local Discovery (`r=0.481`) and is nearly orthogonal to Fiyu Score (`r=0.048`).
- **Independence:** orthogonal to PC1/PC2 by construction; it separates local-audience evidence from the much stronger Hiddenness/Local Discovery pair.
- **Coverage:** all 1,430 restaurants and broad geography/cuisine coverage.
- **Recommendation meaning:** potentially useful for people who value evidence of local patronage even when a restaurant is neither especially hidden nor inexpensive.
- **Confidence:** **plausible**, subject to validating that Local Signal captures customer mix consistently across research vintages.

## 4. Value/local balance within comparable discovery profiles — weak

- **Evidence:** PC4 explains 11.42% of variance. Its main loadings contrast budget (-0.592) with Local Signal (+0.585), with smaller contributions from Hiddenness, Independence, and Quality.
- **Coverage:** 1,176 have observed price; 254 rely on median imputation in the exploratory model.
- **Recommendation meaning:** might eventually distinguish value-oriented local eating from higher-spend experiences, but the axis is less stable and price is not itself a taste identity.
- **Confidence:** **weak** as a standalone dimension.

## Dimensions not established by current data

- **Specialist-seeking ↔ generalist:** not identifiable. The catalog has 1,175 `specialist`, 254 `unknown`, and only one `non_specialist`; `unknown` cannot be interpreted as generalist. Specialist status was therefore excluded from PCA and clustering.
- **Quality preference alone:** measurable, but it is already central to Fiyu scoring and forms one end of the dominant PC1 tradeoff. A Quality type would mostly restate ranking.
- **Cuisine or neighborhood:** measurable descriptors, not behavioral axes. Profiles remain diverse and their bias-corrected associations with cluster membership are weak (`V=0.208` for pooled primary category; `V=0.228` for geography).
- **Atmosphere, occasion, social/solo, adventurousness, formality, traditional/contemporary, menu breadth, chef-driven identity:** not reliably structured. See `data-gaps.md`.

## Product implication

Retain restaurant positions as continuous features. Later, learn user preference vectors from saves, dismissals, ratings, repeat engagement, and contextual choices. Only after behavior demonstrates stable, interpretable segments should those vectors be summarized into user-facing Fiyu Types. Hard-assigning the four exploratory restaurant profiles would discard the strongest finding: the catalog varies mainly along overlapping continua rather than sharply separated classes.
