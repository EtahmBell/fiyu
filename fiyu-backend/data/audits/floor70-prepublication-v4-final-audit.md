# Floor-70 prepublication Quality-v4 final audit

## 1. Executive summary

The frozen **313-row** prepublication cohort is complete and canonically reproducible. All 313
latest attempts are complete, score parity is exact, and no identity, gate, or promotion-field hard
stop was found. Floor **70 remains the chosen target**; floor 68 is informational only.

## 2. Completion verification

- Original cohort: **313**
- Complete / failed / needs retry / pending: **313 / 0 / 0 / 0**
- Duplicate latest-attempt anomalies: **0**
- Restaurants with multiple attempts: **1**
- Tochiazuma latest: **complete**; its prior failed 520 attempt remains in the stored history.

## 3. Cohort identity verification

- Canonical identities matched: **313**
- Selector reconstruction / manifest difference: **313 / 0**
- Duplicate IDs / published overlap / prior production-v4 overlap: **0 / 0 / 0**
- Overlap with 149-row floor-70 rescue set: **0**
- Address-conflict population / overlap: **3 / 0**
- Unresolved/incomplete population / overlap: **7 / 0**

## 4. Quality-v4 adjustment distribution

- Adjustment: `{"count": 313, "max": 9.98, "mean": 3.37, "median": 3.43, "min": 0.0, "p10": 0.69, "p25": 2.15, "p75": 4.47, "p90": 5.86, "p95": 6.64}`
- Delta: `{"count": 313, "max": 4.49, "mean": 1.51, "median": 1.53, "min": 0.0, "p10": 0.31, "p25": 0.97, "p75": 1.99, "p90": 2.64, "p95": 2.98}`
- Adjustment bands: `{"+0.5 to +0.99": 5, "+1 to +2.99": 93, "+3 to +4.99": 123, "+5 to +7.99": 59, "+8 to +11.99": 2, "-0.49 to +0.49": 31, "-1 to -0.5": 0, "-3 to -1": 0, "-5 to -3": 0, "-8 to -5": 0, "< -8": 0, ">= +12": 0}`
- Positive / neutral / negative: **286 / 27 / 0**

## 5. Final score distribution

Cutoff bands: `{"68.00-68.99": 0, "69.00-69.99": 0, "70.00-70.49": 0, "70.50-70.99": 5, "71.00-71.99": 23, "72.00-74.99": 179, "75+": 106}`

## 6. Floor-70 pass/fail

- V4 score >=70: **313**
- V4 score <70: **0**

None.

## 7. Floor-68 result for the same cohort

- V4 score >=68 / <68: **313 / 0**
- Fail 70 but pass 68: **0**
- Fail both: **0**

None.

## 8. Negative evidence audit

- Nonzero negative case strength: **37**
- Multiple independent negative provenance sources: **3**
- Corroborated negative evidence: **2**
- Net-negative adjustments / negative score deltas: **0 / 0**

Strongest negative cases:

| Restaurant | V3 | V4 | Base Q | Q adj | + case | - case | Delta | Sources | Families |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Buta no Kakurega | 71.23 | 72.32 | 61.68 | 2.42 | 31.46 | 13.82 | 1.09 | 3 | craft_execution, food_reputation |
| Pebble Hiroo Terrace | 70.02 | 70.54 | 74.87 | 1.16 | 21.84 | 13.46 | 0.52 | 5 | craft_execution, food_reputation |
| Sugawara Abura Shoten | 74.61 | 76.23 | 59.64 | 3.59 | 37.40 | 3.08 | 1.62 | 6 | craft_execution, ingredient_product |
| Yakitori Kushigen | 71.51 | 74.10 | 59.19 | 5.74 | 48.22 | 2.93 | 2.59 | 6 | craft_execution, food_reputation, ingredient_product |
| Tamachi Sushi Evan | 73.19 | 74.16 | 84.94 | 2.15 | 27.46 | 2.11 | 0.97 | 4 | craft_execution, ingredient_product |
| hal okada vegan patisserie | 74.89 | 77.79 | 78.19 | 6.45 | 51.49 | 1.92 | 2.90 | 7 | craft_execution, food_reputation, ingredient_product |
| de’Afrique (De Afrique) | 73.09 | 76.01 | 65.05 | 6.50 | 51.68 | 1.92 | 2.92 | 6 | craft_execution, food_reputation, ingredient_product |
| Toshi | 70.54 | 71.28 | 50.94 | 1.64 | 23.75 | 1.83 | 0.74 | 5 | craft_execution, ingredient_product |
| Tempura Shinagawa | 70.04 | 72.39 | 51.96 | 5.21 | 45.77 | 1.69 | 2.35 | 5 | craft_execution, food_reputation, ingredient_product |
| d'ici | 70.13 | 71.57 | 74.70 | 3.19 | 34.62 | 1.69 | 1.44 | 4 | craft_execution, food_reputation |

## 9. Large movements/outliers

- |Quality adjustment| >=8 / >=12: **2 / 0**
- |score delta| >=3: **15**
- Architecture inconsistencies: **0**

Large movements:

| Restaurant | V3 | V4 | Base Q | Q adj | + case | - case | Delta | Sources | Families |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Akasaka Kenmochi | 74.94 | 78.53 | 69.12 | 7.97 | 58.46 | 0.00 | 3.59 | 5 | consistency, craft_execution, food_reputation, ingredient_product |
| Wa-no-Shoku Igarashi | 74.88 | 78.24 | 76.47 | 7.47 | 56.15 | 0.00 | 3.36 | 7 | consistency, craft_execution, food_reputation, ingredient_product |
| Sushi Isshin | 74.56 | 77.57 | 67.00 | 6.67 | 52.47 | 0.00 | 3.01 | 6 | consistency, craft_execution, food_reputation |
| Sushi Okuyama | 74.46 | 77.64 | 65.66 | 7.07 | 54.34 | 0.00 | 3.18 | 6 | consistency, craft_execution, ingredient_product |
| Bishukikō Shin | 74.22 | 77.29 | 51.01 | 6.81 | 53.12 | 0.00 | 3.07 | 4 | craft_execution, food_reputation, ingredient_product |
| Iitoco | 73.81 | 76.88 | 64.87 | 6.82 | 53.15 | 0.00 | 3.07 | 5 | craft_execution, food_reputation |
| Pienezza Fukasawa | 73.33 | 77.82 | 69.49 | 9.98 | 67.71 | 0.00 | 4.49 | 5 | consistency, craft_execution, food_reputation, ingredient_product |
| Tempura Yaguchi | 73.06 | 76.52 | 58.36 | 7.68 | 57.11 | 0.00 | 3.46 | 5 | consistency, craft_execution, food_reputation |
| Setagaya Yakiniku bon | 72.95 | 76.56 | 73.63 | 8.03 | 58.73 | 0.00 | 3.61 | 5 | consistency, craft_execution, food_reputation, ingredient_product |
| Kensō Noodle Villa Ikebukuro | 72.64 | 75.81 | 74.03 | 7.04 | 54.20 | 1.00 | 3.17 | 6 | consistency, craft_execution, ingredient_product |
| La Maison Finistère | 72.52 | 75.90 | 76.76 | 7.52 | 56.39 | 0.00 | 3.38 | 6 | consistency, craft_execution, food_reputation, ingredient_product |
| Kurosawa Tokyosai | 71.59 | 74.75 | 59.24 | 7.01 | 54.05 | 0.00 | 3.16 | 6 | craft_execution, food_reputation, ingredient_product |
| Briller parfum | 71.26 | 74.30 | 52.24 | 6.77 | 52.94 | 0.00 | 3.04 | 4 | consistency, craft_execution, food_reputation, ingredient_product |
| Nanakusa | 70.85 | 74.06 | 64.73 | 7.14 | 54.64 | 0.00 | 3.21 | 6 | craft_execution, food_reputation, ingredient_product |
| Shokuzen Abe | 70.85 | 73.97 | 64.85 | 6.93 | 53.67 | 1.42 | 3.12 | 5 | consistency, craft_execution, food_reputation, ingredient_product |

Top 15 risers:

| Restaurant | V3 | V4 | Base Q | Q adj | + case | - case | Delta | Sources | Families |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Pienezza Fukasawa | 73.33 | 77.82 | 69.49 | 9.98 | 67.71 | 0.00 | 4.49 | 5 | consistency, craft_execution, food_reputation, ingredient_product |
| Setagaya Yakiniku bon | 72.95 | 76.56 | 73.63 | 8.03 | 58.73 | 0.00 | 3.61 | 5 | consistency, craft_execution, food_reputation, ingredient_product |
| Akasaka Kenmochi | 74.94 | 78.53 | 69.12 | 7.97 | 58.46 | 0.00 | 3.59 | 5 | consistency, craft_execution, food_reputation, ingredient_product |
| Tempura Yaguchi | 73.06 | 76.52 | 58.36 | 7.68 | 57.11 | 0.00 | 3.46 | 5 | consistency, craft_execution, food_reputation |
| La Maison Finistère | 72.52 | 75.90 | 76.76 | 7.52 | 56.39 | 0.00 | 3.38 | 6 | consistency, craft_execution, food_reputation, ingredient_product |
| Wa-no-Shoku Igarashi | 74.88 | 78.24 | 76.47 | 7.47 | 56.15 | 0.00 | 3.36 | 7 | consistency, craft_execution, food_reputation, ingredient_product |
| Nanakusa | 70.85 | 74.06 | 64.73 | 7.14 | 54.64 | 0.00 | 3.21 | 6 | craft_execution, food_reputation, ingredient_product |
| Sushi Okuyama | 74.46 | 77.64 | 65.66 | 7.07 | 54.34 | 0.00 | 3.18 | 6 | consistency, craft_execution, ingredient_product |
| Kensō Noodle Villa Ikebukuro | 72.64 | 75.81 | 74.03 | 7.04 | 54.20 | 1.00 | 3.17 | 6 | consistency, craft_execution, ingredient_product |
| Kurosawa Tokyosai | 71.59 | 74.75 | 59.24 | 7.01 | 54.05 | 0.00 | 3.16 | 6 | craft_execution, food_reputation, ingredient_product |
| Shokuzen Abe | 70.85 | 73.97 | 64.85 | 6.93 | 53.67 | 1.42 | 3.12 | 5 | consistency, craft_execution, food_reputation, ingredient_product |
| Iitoco | 73.81 | 76.88 | 64.87 | 6.82 | 53.15 | 0.00 | 3.07 | 5 | craft_execution, food_reputation |
| Bishukikō Shin | 74.22 | 77.29 | 51.01 | 6.81 | 53.12 | 0.00 | 3.07 | 4 | craft_execution, food_reputation, ingredient_product |
| Briller parfum | 71.26 | 74.30 | 52.24 | 6.77 | 52.94 | 0.00 | 3.04 | 4 | consistency, craft_execution, food_reputation, ingredient_product |
| Sushi Isshin | 74.56 | 77.57 | 67.00 | 6.67 | 52.47 | 0.00 | 3.01 | 6 | consistency, craft_execution, food_reputation |

Top 15 fallers:

| Restaurant | V3 | V4 | Base Q | Q adj | + case | - case | Delta | Sources | Families |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Izakaya Okinoya | 74.68 | 74.68 | 56.36 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |  |
| Jurin | 75.09 | 75.09 | 52.65 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |  |
| Ashiato | 72.49 | 72.49 | 47.57 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |  |
| Karankoron | 73.56 | 73.56 | 51.35 | 0.00 | 4.87 | 0.00 | 0.00 | 1 | craft_execution |
| Toge-no-Chaya | 73.70 | 73.70 | 50.48 | 0.00 | 12.57 | 0.00 | 0.00 | 1 | craft_execution |
| Mocchi | 74.81 | 74.81 | 61.08 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |  |
| Kokoya | 75.77 | 75.77 | 71.64 | 0.00 | 12.07 | 0.00 | 0.00 | 1 | craft_execution, food_reputation |
| Saeki | 74.83 | 74.83 | 53.59 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |  |
| Bella Rouge | 75.54 | 75.54 | 61.74 | 0.00 | 8.58 | 0.00 | 0.00 | 2 | ingredient_product |
| Totoya | 71.62 | 71.62 | 57.13 | 0.00 | 8.90 | 0.00 | 0.00 | 1 | craft_execution |
| Yakiniku Ushikazu | 72.62 | 72.62 | 48.72 | 0.00 | 11.55 | 0.00 | 0.00 | 1 | food_reputation |
| Welcome Indian Nepali Restaurant | 72.21 | 72.21 | 63.98 | 0.00 | 7.91 | 0.00 | 0.00 | 2 | food_reputation |
| Izakaya Futaba | 75.62 | 75.62 | 56.27 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |  |
| Akari | 71.13 | 71.13 | 58.18 | 0.00 | 9.23 | 0.00 | 0.00 | 1 | craft_execution |
| Izakaya MARU | 72.81 | 72.81 | 69.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |  |

## 10. Sparse/no-evidence safety

- Genuinely no Quality evidence: **12**
- Exactly neutral: **12**
- False-positive / false-negative movements: **0 / 0**

## 11. Guardrail audit

- Raw adjustment min / max / max absolute: **0.0 / 9.98 / 9.98**
- Maximum absolute guarded adjustment: **9.98**
- Rows clipped at ±15: **0**
- Rows differing under ±20 versus ±15: **0**

## 12. Promotion readiness

- PROMOTION_READY_PASS70: **313**
- PROMOTION_READY_BELOW70: **0**
- BLOCKED_NON_SCORE / INCOMPLETE / UNEXPECTED: **0 / 0 / 0**

## 13. Exact floor-70 catalog counterfactual

- Current published: **538**; below / at-or-above 70: **0 / 538**
- Additions from the 313: **313**
- Other existing V4-ready additions: **0**
- Total additions / removals: **313 / 0**
- Safe V4-first resulting catalog: **851**

## 14. Floor-68 full catalog curiosity counterfactual

- Current published / below 68: **538 / 0**
- Cohort >=68 / <68: **313 / 0**
- Other score rejects >=68: **83**
- Other V4 / V3 lineage: **0 / 83**
- Other non-score-ready: **19**
- V3 rows needing V4 before admission: **64**
- Below-68 mathematically rescuable V3 rows: **100**
- Safe V4-first catalog: **851**
- Raw threshold-only catalog (not recommended): **915**

## 15. 70 vs 68 comparison

| Metric | Floor 70 | Floor 68 |
|---|---:|---:|
| Current published | 538 | 538 |
| New V4-ready additions | 313 | 313 |
| New cohort V4 rows below floor | 0 | 0 |
| Safe immediate catalog size | 851 | 851 |
| Additional V3 rows needing V4 | 0 | 64 |
| Below-floor rescue candidates | 149 | 100 |
| Raw threshold-only catalog | 851 | 915 |

Floor 68 adds **0** immediately safe restaurants,
while the raw threshold-only view gains **64**
in the **68.00-69.99** band. Of those, **0**
are already V4-ready and **64** require paid V4 first.

## 16. Sankei Sushi

- Current score / published / lineage: **82.82 / True / v3**
- Affects floor 70 / floor 68: **False / False**
- Retry separately after transition: **True**

## 17. Promotion precheck

All **313** cohort rows have complete identity, version,
prompt/schema, raw evidence, normalized evidence, case strength, adjustment, researched Quality,
and shadow-score fields. Missing promotion-critical fields: **0**. Canonical score parity mismatches: **0**.

## 18. No-mutation confirmation

- Canonical DB SHA-256: **3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7 / 3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7**
- Shadow DB SHA-256: **98BAA6F48236D6DC33AFD97A3B1BD751CB3E8A324A72636B6C3FB2F44C21F592 / 98BAA6F48236D6DC33AFD97A3B1BD751CB3E8A324A72636B6C3FB2F44C21F592**
- `seed70.txt` SHA-256: **BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39 / BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39**
- All unchanged: **True**
- Network or paid requests: **0**

## Recommendation

Keep **70** as the target floor. Floor 68 is a useful sensitivity view, but its incremental catalog
gain must be weighed against the additional V3-only research population and larger rescue surface.
The next operation should be a separate dry-run production promotion of the complete shadow V4
evidence scoped to the frozen 313-ID manifest. Do not use the current broad all-source promotion
path until it supports this cohort boundary. Publication membership must remain frozen until a
subsequent audited floor-70 reconciliation.
