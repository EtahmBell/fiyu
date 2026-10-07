# Tokyo Catalog v1 — 851 Stable

## 1. Executive verdict

**CERTIFIED.** The canonical catalog is internally consistent at floor 70 with 851 published restaurants. No score, threshold, research, publication, or user-data mutation occurred during this audit.

## 2. Canonical DB state

- Total: 1203
- Published: 851
- Unpublished: 352
- Publication threshold: 70
- SQLite integrity: `ok`
- Score versions: `{"public-v4-quality-research-specialist-tristate": 861, "public-v4-quality-research": 0, "public-v3-local-discovery-specialist-tristate": 231, "NULL": 111}`

## 3. Publication reconstruction

- Stored published: 851
- Evaluator published: 851
- Exact row outcomes: 1203/1203
- Mismatches: 0
- False-published: 0
- False-unpublished: 0

## 4. 313 cohort validation

- Published/product eligible/canonical review state: 313/313/313
- Canonical score parity: 313/313
- Complete Quality-v4: 313/313
- Valid canonical history/fingerprints: 313/313
- Public list visible: 313/313
- Picks eligible where map-ready: 311
- Anomalies: 0

## 5. Existing 538 retention

All 538 original published rows exactly match the pre-reconciliation backup across the complete `public_restaurants` row. Score, version, product eligibility, review state, and research/history digests are unchanged. All 538 remain public-list visible. Legacy rows were not required to acquire newer research-run linkage.

## 6. Non-score blocked safety

- Score >=70 but unpublished: 30
- Categories: `{"address_or_identity_conflict": 13, "product_eligibility_failure": 8, "identity_not_matched": 5, "unresolved_identity": 2, "critical_publication_contradiction": 2}`
- Published/API/Picks leaks: 0

Exact IDs, scores, and reasons are recorded in the summary JSON.

## 7. API smoke audit

The local FastAPI test client returned 200 for 10 stratified newly admitted and 10 original published details, and 404 for 10 blocked examples. Scores matched canonical values, transparency payloads were present, schemas were unchanged, and no raw research/admin fields leaked.

## 8. Picks safety

The read-only Picks candidate catalog contains 848 published, product-eligible, map-ready rows. Deterministic generation succeeded; saved exclusion, <7-day cooldown, and >=7-day repeat fallback succeeded. The focused and full test suites cover affordability reserve, exploration negative-affinity protection, active snapshots, reveal/Recent Discovery semantics, and no dependency on the old 538 count.

## 9. Map/Log/Lists regression

Focused regression tests cover public Map data, saved and visited/logged state, lists, discovery/reveal timing, and the rule that saved does not imply published. No 851-stability regression was observed. No product behavior was redesigned.

## 10. Score transparency

Representative new and original rows expose final score plus the established transparency payload. No raw research, provider response, or admin provenance fields appeared. All 313 new rows use canonical V4 specialist-tristate lineage.

## 11. Threshold source of truth

Database metadata key `publication_score_threshold=70` is authoritative. The constant 75 remains only the fallback for unmigrated/missing metadata and historical/test contexts. Live publication reconciliation reads metadata; Picks eligibility has no threshold-75 dependency.

## 12. Version lineage

Current canonical V4 specialist-tristate rows: 861. Stale current V4 labels: 0. All 313 audited rows have complete V4 research, matching canonical score history, embedded canonical score version, and valid fingerprints. Prior V3 history is preserved.

## 13. Catalog coverage snapshot

- Wards/cities: `{"Toshima City": 98, "Shibuya": 90, "Taito City": 84, "Ota City": 82, "Minato City": 81, "Adachi City": 75, "Setagaya City": 67, "Koto City": 64, "Chuo City": 57, "Chiyoda City": 41, "Suginami City": 41, "Nakano City": 18, "Nerima City": 18, "Shinjuku City": 11, "Bunkyo City": 8, "Musashino": 6, "Arakawa City": 4, "Yashio": 1, "UNKNOWN": 1, "Itabashi City": 1, "Sumida City": 1, "Kita City": 1, "Shinagawa City": 1}`
- Top areas: `{"2 Chome Ikebukuro": 12, "Taito": 12, "2 Chome Honmachi": 8, "6 Chome Kameido": 8, "2 Chome Nihonbashiningyocho": 7, "Shinjuku": 7, "2 Chome Asakusa": 7, "7 Chome Nishikamata": 7, "1 Chome Nishiarai": 7, "2 Chome Nagasaki": 7, "2 Chome Shibuya": 6, "Chiyoda": 6, "7 Chome Minamiaoyama": 6, "4 Chome Ebisu": 6, "Shibuya": 6}`
- Dedicated discovery-area present/missing: 47/804 (neighborhood fallback remains available).
- Distinct cuisine labels: 320; top labels: `{"居酒屋": 89, "Izakaya": 43, "Sushi restaurant": 41, "Italian restaurant": 26, "焼肉": 26, "寿司": 25, "French restaurant": 21, "Sushi": 21, "Yakitori restaurant": 16, "焼き鳥": 15, "Japanese cuisine": 14, "Chinese restaurant": 13}`
- Price bands: `{"moderate": 261, "unknown": 228, "upscale": 175, "budget": 99, "splurge": 88}`
- Score bands: `{"75-79.99": 350, "80+": 293, "72-74.99": 180, "70-71.99": 28}`
- Map eligible/ineligible: 848/3
- Budget present/missing: 623/228
- Food tags present/missing: 848/3
- Specialist status: `{"specialist": 660, "unknown": 191}`
- Chain state: `{"flagged": 0, "not_flagged": 851}`

The largest visible scaling opportunities are missing area labels, missing budget coverage, and cuisine-label normalization—not score or threshold changes.

## 14. Human QA sample

`data\audits\tokyo-catalog-v1-human-qa-sample.csv` contains 25 deterministic, score-stratified rows: 13 from the new cohort and 12 from the original catalog, with cuisine, area, price, descriptions, and map eligibility.

## 15. Known non-blocking debt

- **CATALOG CLEANUP** — Sankei Sushi remains on valid V3 specialist-tristate lineage.
- **CATALOG CLEANUP** — The 149-row below-floor rescue cohort remains intentionally untouched.
- **CATALOG CLEANUP** — The 64 floor-68 V3-only candidates remain intentionally untouched.
- **PIPELINE/SCALING DEBT** — SQLite remains a single-host persistence boundary requiring connection/commit review before scale.
- **PIPELINE/SCALING DEBT** — CLI overlap and durable run/manifest tracking should be consolidated.
- **FUTURE FEATURE** — Tokyo-specific city/market assumptions should be abstracted before multi-city expansion.

## 16. Database/hash safety

- Canonical SHA before/after: `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90` / `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90`
- `seed70.txt` SHA before/after: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39` / `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39`
- SQLite integrity: `ok`
- External requests: 0
- Catalog/user-data mutations: 0/0

## 17. Validation/tests

- Focused backend publication/Quality-v4/lineage/API/Picks/Map/Lists/Log/transparency tests: 364 passed.
- Full backend suite: 946 passed.
- Full frontend suite: 1,027 passed across 91 files.
- Frontend ESLint, TypeScript, and production build: passed.
- Ruff on the added audit script: passed. Full-repository Ruff reported 28 unrelated pre-existing findings; none were changed in this audit.
- `git diff --check`: passed.
- The audit itself passed every hard-stop invariant.

## 18. Recommended next phase

Stop score/threshold work and begin the **Optimization / Scale-Readiness Pass**: append/upsert-safe ingestion, durable manifests and run tracking, resumability/idempotency, SQLite connection/commit patterns, CLI consolidation, observability, city/market abstraction, removal of Tokyo hardcoding, and performance/scalability review.
