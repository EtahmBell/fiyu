# Published map-readiness audit

**Audit date:** 2026-10-10

**Scope:** all published rows failing the canonical `fiyu.catalog_pipeline.is_map_ready` predicate

**Result:** exactly 3 of 1,430 published restaurants are not map/Picks-ready.

The canonical predicate requires all three conditions: `map_display_eligible = 1`, non-null latitude, and non-null longitude. All three affected rows currently have `map_display_eligible = 0` and null coordinates. Each remains product-eligible; none has an independent product-rejection reason.

## Recommended disposition

| Classification | Restaurant | Root cause | Recommendation |
|---|---|---|---|
| B | Hamonica Sakaba (`ChIJVc9odEbvGGARLlVzvSkBFGk`) | Verified address, but no accepted restaurant-level coordinate or geocode. The resolver missed a reusable reviewed area anchor already present for the same discovery area. | Use the existing Kichijoji Honcho area anchor (`35.7033, 139.5798`) with approximate/area precision. Keep published after readiness reconciliation. |
| C | KARAIMOYA Juttoku (`ChIJqTrILQCRGGAR6ZVcLw1KnHg`) | Provisionally verified Yashio, Saitama address, but no matching local OSM feature, location history, geocode result, or reusable Ukizuka anchor. The only coordinate is the raw candidate coordinate; the ingestion search context is Adachi. | Do not invent or copy a coordinate. Recommend `is_published=0`, `review_status=needs_review`, while preserving `product_eligible=1`. |
| A | Bakawarai Junsui (`ChIJxylpaU_uGGARkxm5B_JFPHU`) | The legacy resolver under-scored the correct stored OSM node because name/address components were treated as fuzzy/unconfirmed. | Review and accept local OSM node `3154357166` at `35.707988, 139.5779807`; keep published after readiness reconciliation. |

No remediation was executed.

## 1. Hamonica Sakaba — classification B

- Score 71.10; `public-v4-quality-research-specialist-tristate`; currently `auto_published` and product-eligible.
- Address evidence is strong: identity confirmed at 0.98, accepted full address `東京都武蔵野市吉祥寺本町1-1-1 ハーモニカ横丁 1F・2F`, verified core/full address, and approved parcel/street-number precision.
- The original candidate record contains `35.7036697, 139.5794043`, but this audit does not treat that raw source coordinate as sufficient by itself.
- All 20 retained restaurant-match candidates are weak, unrelated fuzzy-name matches. No address-geocode or location-history row exists.
- Three other map-ready restaurants in the exact same canonical discovery area, `1 chome kichijoji honcho`, use the reviewed area anchor `35.7033, 139.5798`. It is about 54 metres from the raw candidate coordinate and is appropriate under Fiyu's permissive discovery-location policy.
- The floor-70 reconciliation change log proves this row was changed from unpublished to `auto_published` for `score_floor` before the map-ready admission invariant was enforced.

**Recommended action:** use the existing reviewed area anchor with `map_location_precision=area`, `map_location_approximate=1`, and `map_display_eligible=1`; then run the normal readiness reconciliation. Do not accept the fuzzy restaurant candidates or copy the raw source coordinate.

## 2. KARAIMOYA Juttoku — classification C

- Score 83.25; current v4 score version; `auto_published`; product-eligible.
- The provisionally accepted address is `埼玉県八潮市浮塚850-6`, with verified core/full address and approved parcel/street-number precision.
- The original candidate contains `35.7964825, 139.8303554`, but no independent coordinate record corroborates it locally.
- The 20 OSM candidates are unrelated fuzzy-name matches; there is no address-geocode result, location history, same-address map-ready row, or map-ready row in the `ukizuka` discovery area.
- The verified location is Yashio, Saitama, while the ingestion search area was `Adachi Initial`. That mismatch is not an automatic product rejection, but it means the search-area context cannot corroborate the coordinate.
- The row was created on 2026-08-21 and does not appear as a newly published row in the later floor-70 transition log, so it probably predates the fixed invariant. The DB has no per-row publication event timestamp, so the exact transition cannot be established.

**Recommended action:** leave the location unresolved and recommend `is_published=0`, `review_status=needs_review`, preserving `product_eligible=1`. A later local-only review may establish a Yashio/Ukizuka anchor, but the current DB does not contain one.

## 3. Bakawarai Junsui — classification A

- Score 73.25; current v4 score version; `auto_published`; product-eligible.
- Multiple non-conflicting sources support the full address `東京都武蔵野市吉祥寺北町一丁目10-22 ベルハイム吉祥寺`; identity confidence is 0.98.
- The stored rank-1 OSM candidate, `Bakawari Junsui (Isakayas)`, is node `3154357166` at `35.707988, 139.5779807`. It lies about 1.3 metres from the same-place raw candidate coordinate and agrees with the verified location context.
- The resolver left it unresolved because its score contained only fuzzy-name evidence and no recognized neighborhood/address component. The lower-ranked candidates are unrelated.
- No geocode/history row exists, but the convergence of confirmed identity, full address, matching local OSM name, and near-identical independently stored coordinate is sufficient for a reviewed local repair.
- The floor-70 reconciliation change log proves this row was changed from unpublished to `auto_published` for `score_floor` before map readiness was enforced.

**Recommended action:** review and accept only OSM node `3154357166`, storing POI-level location provenance and making the row map-ready; then run normal readiness reconciliation.

## Expected totals after remediation

- Published: **1,429** (`1,430 - 1` unresolved row).
- Published and map/Picks-ready: **1,429** (`1,427 + 2` repaired rows).
- Published but not map-ready: **0**.
- Product eligibility: unchanged for all three.

## Method and safety

The audit opened `data/fiyu.db` via SQLite URI `mode=ro`, enabled `PRAGMA query_only=ON`, and selected rows using the canonical map-ready condition. It inspected `public_restaurants`, the raw `restaurants` candidate table, `address_evidence`, `verified_restaurant_addresses`, `address_geocode_results`, `location_match_candidates`, `location_history`, and existing local audit artifacts. No network or provider request was made.

- Database SHA-256 before and after: `94119158B1306545264475FBA552EDBF11B4D7E803E243DE52753C96B3053127`.
- `seed70.txt` SHA-256 before and after: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39`.
- `PRAGMA integrity_check`: `ok` before and after.
- No database, score, publication, review-status, product-eligibility, or location mutation was performed.
