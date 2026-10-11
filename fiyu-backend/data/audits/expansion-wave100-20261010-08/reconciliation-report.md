# Floor-70 publication reconciliation

## 1. Executive summary
Mode: real. Threshold 70 -> 70.
Published 1338 -> 1407; additions 69; removals 0.

## 2. Current canonical state
Total 2078; published 1338; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 1338, "additions": 69, "removals": 0, "stays_unpublished": 671, "resulting_published": 1407, "resulting_unpublished": 671}

## 5. 313-manifest set equality
{"manifest_ids": 98, "exact_overlap": 69, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ4befZJmOGGAR0duFV53oMkY", "ChIJ5Vifw8uLGGARAjQfY_nUzJM", "ChIJ7_OMtZOIGGARw_bSdftHp6U", "ChIJ9TfCS2-NGGARITfC_Bi13dM", "ChIJ9U7n9MntGGARVylaSJruZ_4", "ChIJ9zo0WrqNGGARiklDKGd1roU", "ChIJFQwNAr-TGGARYeDPy07dgVI", "ChIJFzZ5__RgGGARSqpkE0tmTSw", "ChIJG87lTM2NGGARw4bt6pt79gI", "ChIJK4Z9yjddGGARoCDrtMa1-ME", "ChIJM9gJLt-LGGARBZ-zcJqPoho", "ChIJMTLcTZuLGGAR7-P_xIvN_IY", "ChIJSfl7B4SOGGAR-7RhhdpEGYg", "ChIJSwSOxRqRGGARaJ2VWHpsFHk", "ChIJUwZ-M3-MGGARfAShv5aZDuw", "ChIJV-p101btGGAR0StEA4MydQg", "ChIJW-f8SAaNGGARRSuB-0h1fVE", "ChIJWxZXENSNGGARhn1RLFBMzho", "ChIJYe2gxFbtGGARfYtuQ-KejhE", "ChIJZXr586mMGGARoItRTH12SA4", "ChIJ_1cTqdiRGGAR_CfuMbKnWqs", "ChIJ_W8K6IyNGGARQ1iJp_wRNAs", "ChIJeVAA29OLGGARFrrf2YG2Yl0", "ChIJlalT1JXtGGARqtqJWtGYeoE", "ChIJmep8waaPGGAR_w44OqG_xL8", "ChIJnbsdiwNgGGARMnLG-cfbvCo", "ChIJoXaO77SLGGARD6lD5ZQS86A", "ChIJowpd9LmNGGARiQlD7RNGEQI", "ChIJxRMuHnKJGGARHw5aws916dE"], "already_published_cohort_rows": []}

## 6. Non-score blocked rows
Count 29; categories {"score_floor": 24, "chain_exclusion": 3, "address_or_identity_conflict": 2}; published 0.

## 7. Existing published retention
Stays published 1338; removals 0.

## 8. Planned additions
69 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "a713e11bad49f7313c535a927d5356a7983de2fb15fc438ac02bc3801cee3e5a", "quality_v4_research_digest": "35dc953ce9b50d25d5f223f244fa6ad9c51081005ef85d576657653970e2e11a", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
