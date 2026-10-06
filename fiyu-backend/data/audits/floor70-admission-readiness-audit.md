# Floor-70 admission-readiness audit

## 1. Executive summary

Target floor: **70**. Stored score-only cohort requiring final classification:
**323**. The exact non-score-gate-clean and V4-input-ready
prepublication set is **313**.
All **323** use v3; **0** are production Quality-v4. The safe policy is
to require completed Quality-v4 before any previously rejected restaurant newly enters the catalog.

## 2. Exact immediate floor-70 population

- All unpublished scored rows >=70 screened: **343**
- Stored score-only cohort: **323**
- Canonically blocked within that cohort: **3**
- Identity/V4-input incomplete within that cohort: **7**
- Unexpected within that cohort: **0**
- Previously identified non-score-blocked rows outside the cohort: **20**
- Block reasons: `{"critical:confirmed_address_identity_conflict": 3}`
- Incomplete reasons: `{"matched_identity": 5, "resolved_identity": 7}`

## 3. Score lineage split

- Quality-v4: **0**
- v3: **323**
- Other: **0**
- Completed V4 evidence: **0**
- Versions: `{"public-v3-local-discovery-specialist-tristate": 323}`

All v3 candidates were outside the original 549-row published/backfill population. They have
completed underlying restaurant research and the local inputs needed for V4, but the current
pending backfill selector excludes all of them because their stored status is `auto_rejected`.

## 4. READY_NOW_V4

Count: **0**. No new admission can safely proceed under a V4-required
lineage policy before paid research completes.

## 5. NEEDS_V4_FIRST

Count: **313**.

- Current score: `{"count": 313, "max": 75.85, "mean": 72.8, "median": 72.96, "min": 70.0, "p10": 70.61, "p25": 71.59, "p75": 73.88, "p90": 74.78, "p95": 75.01}`
- Base Quality: `{"count": 313, "max": 96.59, "mean": 61.7, "median": 59.95, "min": 40.98, "p10": 48.92, "p25": 53.47, "p75": 68.74, "p90": 76.13, "p95": 80.04}`
- Gap above 70: `{"count": 313, "max": 5.85, "mean": 2.8, "median": 2.96, "min": 0.0, "p10": 0.61, "p25": 1.59, "p75": 3.88, "p90": 4.78, "p95": 5.01}`
- Maximum V4 score: `{"count": 313, "max": 82.6, "mean": 79.51, "median": 79.7, "min": 73.63, "p10": 77.31, "p25": 78.25, "p75": 80.63, "p90": 81.49, "p95": 81.76}`
- Minimum V4 score: `{"count": 313, "max": 69.1, "mean": 66.05, "median": 66.21, "min": 63.25, "p10": 63.86, "p25": 64.84, "p75": 67.13, "p90": 68.03, "p95": 68.26}`
- Risk bands: `{"70_95_to_72_inclusive": 47, "70_to_below_70_95": 51, "above_72": 215, "can_drop_below_70_at_minus_15": 313, "stays_at_or_above_70_at_minus_15": 0}`
- Top areas: **Adachi Initial: 44, Ota Initial: 40, Toshima Initial: 37, Shibuya Initial: 35, Minato Initial: 27, Setagaya Initial: 26, Koto Initial: 22, Taito Initial: 22, Suginami Initial: 21, Chuo Initial: 20**
- Top cuisines: **居酒屋: 40, Sushi restaurant: 17, Izakaya: 16, 焼肉: 14, Italian restaurant: 10, Japanese cuisine: 7, Ramen restaurant: 7, Chinese restaurant: 6, Japanese restaurant: 5, Korean restaurant: 5**

The theoretical -15 Quality scenario can move **313**
below 70; **0** remain >=70 under
that worst supported adjustment. Positive historical uplift scenarios are recorded per row in JSON,
but they are not predictions and do not remove this downside risk.

## 6. Other blocked/incomplete

- BLOCKED_OTHER: **3**
- INCOMPLETE: **7**
- UNEXPECTED: **0**

Full row-level reasons are in the JSON artifact. These rows are not part of the 323-row immediate set.

## 7. Published-below-70 check

- Published >=75: **537**
- Published 70-74.99: **1**
- Published 68-69.99: **0**
- Published <68: **0**
- Published below 70: **0**

No downward publication change is implied by reconciling at 70.

## 8. Safe interim reconciliation

- Current published: **538**
- Immediate READY_NOW_V4 additions: **0**
- Below-70 removals: **0**
- Safe interim catalog: **538**
- Eventual possible additions after V4: **313**
- Eventual possible catalog: **851** (not guaranteed)

## 9. Immediate-v3 alternative reconciliation

- Additions: **313**
- Removals: **0**
- Catalog size: **851**
- New v3 / v4 admissions: **313 / 0**

This is not recommended because every proposed new admission still has supported downside sufficient
to cross below the chosen floor.

## 10. Prepublication V4 research workload

- Responses requests: **313**
- Projected web actions: **826**
- Projected input tokens: **8638340**
- Projected output tokens: **538238**
- Projected total tokens: **9176575**

These are rough estimates using stored historical averages, not dollar costs.

## 11. Sankei Sushi

Sankei Sushi is published at **82.82** on **public-v3-local-discovery-specialist-tristate**. It does not
intersect the immediate admission set. The source promotion audit records a failed V4 validation
attempt, while the canonical production database contains no failed run to retry. Include it in the
next V4 operation as a separate one-row published-legacy retry, not in the 323-row admission batch.

## 12. Below-floor rescue set

The separate below-70 set remains **149**: high **97**,
medium **40**, marginal **12**. Overlap
with the immediate batch: **0**. Keep it out of the initial
floor-70 transition research batch.

## 13. Human-review samples

### READY_NOW_V4 near 70

No rows in this class.

### NEEDS_V4_FIRST near 70

| Restaurant | Score | Version | Quality | H | I | LD | Chain | Specialist | Reason | Max V4 |
|---|---:|---|---:|---:|---:|---:|---|---|---|---:|
| Vin de Rêve | 70.0 | v3 | 57.98 | 64.38 | 100.0 | 77.0 | independent_single | specialist | score_or_product_policy_rejected | 76.75 |
| Pebble Hiroo Terrace | 70.02 | v3 | 74.87 | 51.75 | 82.5 | 64.76 | small_group_distinct_concept | specialist | score_or_product_policy_rejected | 76.77 |
| Kanmidokoro Nagomian | 70.03 | v3 | 57.8 | 71.71 | 100.0 | 73.06 | independent_single | specialist | score_or_product_policy_rejected | 76.78 |
| Restaurant Kiro; | 70.04 | v3 | 69.31 | 57.88 | 82.5 | 71.16 | small_group_distinct_concept | specialist | score_or_product_policy_rejected | 76.79 |
| Tempura Shinagawa | 70.04 | v3 | 51.96 | 78.55 | 100.0 | 79.52 | independent_single | specialist | score_or_product_policy_rejected | 76.79 |
| Matsu Katei Ryori | 70.05 | v3 | 54.54 | 75.23 | 97.0 | 78.68 | independent_single | unknown | score_or_product_policy_rejected | 76.8 |
| Sushi Ohmi | 70.06 | v3 | 61.72 | 61.69 | 100.0 | 72.14 | independent_single | specialist | score_or_product_policy_rejected | 76.81 |
| LaiMai Sendagaya Kitchen | 70.07 | v3 | 52.49 | 94.84 | 78.5 | 81.78 | small_group_distinct_concept | specialist | score_or_product_policy_rejected | 76.82 |
| Midori Syo Seijo | 70.11 | v3 | 81.39 | 54.03 | 79.0 | 54.11 | unknown | specialist | score_or_product_policy_rejected | 76.86 |
| d'ici | 70.13 | v3 | 74.7 | 42.6 | 100.0 | 60.5 | independent_single | specialist | score_or_product_policy_rejected | 76.88 |
| Yashinbō | 70.14 | v3 | 58.85 | 84.57 | 79.0 | 76.47 | unknown | specialist | score_or_product_policy_rejected | 76.89 |
| Sakanaya Hida | 70.14 | v3 | 47.06 | 87.11 | 97.0 | 85.38 | independent_single | unknown | score_or_product_policy_rejected | 76.89 |
| AKINAI | 70.15 | v3 | 48.5 | 81.45 | 100.0 | 84.43 | independent_single | specialist | score_or_product_policy_rejected | 76.9 |
| Groin Groin | 70.2 | v3 | 78.16 | 37.86 | 100.0 | 57.39 | independent_single | specialist | score_or_product_policy_rejected | 76.95 |
| Sushi Ito Ikkan | 70.21 | v3 | 66.93 | 53.93 | 100.0 | 68.0 | independent_single | specialist | score_or_product_policy_rejected | 76.96 |

## 14. Recommendation

**REQUIRE QUALITY-V4 FOR NEW FLOOR-70 ADMISSIONS** — All 323 stored score-only candidates are v3. Of these, 313 pass the current non-score and V4-input gates, and all 313 can mathematically fall below 70 under the supported -15 Quality adjustment. Admit none until its Quality-v4 result is complete and the resulting production score remains >=70.

Next action: Add a separately reviewed, targeted Quality-v4 selection mode for the exact 313-row prepublication set, dry-run it, then run the paid batch and reconcile only successful rows that remain >=70. Keep the 149 below-floor rescue set out of that first batch.

## 15. DB no-mutation confirmation

SQLite integrity: **ok**. Database SHA-256 before/after:
**3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7 / 3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7**. `seed70.txt`
SHA-256 before/after: **BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39 / BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39**.
Both are unchanged. Network/paid requests: **0**.
