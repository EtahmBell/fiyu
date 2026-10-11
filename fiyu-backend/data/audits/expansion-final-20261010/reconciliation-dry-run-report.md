# Floor-70 publication reconciliation

## 1. Executive summary
Mode: dry_run. Threshold 70 -> 70.
Published 1406 -> 1430; additions 24; removals 0.

## 2. Current canonical state
Total 2121; published 1406; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 1406, "additions": 24, "removals": 0, "stays_unpublished": 691, "resulting_published": 1430, "resulting_unpublished": 691}

## 5. 313-manifest set equality
{"manifest_ids": 43, "exact_overlap": 24, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ6YSqimCLGGARn2LIv9Hl9xc", "ChIJ7dkhb_lgGGARschhVMwJ0To", "ChIJ89uL5HyMGGAR1TLlRk_Tya0", "ChIJ8b8ybzeNGGARTw3WGUKyp18", "ChIJ9cTEpfCLGGARKMoTI-7AkN8", "ChIJC_vAmhOLGGARzhadCjdIJWg", "ChIJDdy94gKNGGAR9Xn-PSVTe10", "ChIJEbTX9oSOGGARuayZ9uR0_CA", "ChIJS3A2pAWNGGARcwD_CVBB8nQ", "ChIJWfe_TDH1GGAR9evtQIp-uhs", "ChIJ_4ZyPoeLGGARNwWkL8_UPcI", "ChIJ_d7rqQDzGGAR6bTVGI2M3tw", "ChIJaRQc4YCNGGARWeOttegYI6w", "ChIJb1pOq-mLGGARvoB-Eaalk1s", "ChIJgxTg6JeMGGARC_uDl4_X3Wc", "ChIJhaBSXhaJGGARbADf1HQ17Vg", "ChIJhbhg_tXzGGAR_mOcHtCP1Ts", "ChIJkWDfRFSNGGARLjxm0gInJeQ", "ChIJvRBeN7WLGGARGtGsySHJFLc"], "already_published_cohort_rows": [], "canonical_publishable_cohort_rows": ["ChIJ--Kv1OOIGGARpqHEi6I6rAc", "ChIJ2fnvt6uJGGAR1Y7x-XR6KXs", "ChIJAQDksKGLGGAR9nN2zDvpJWo", "ChIJJ14haCrvGGARdW56r2VcVaU", "ChIJNWfoKMGPGGARbNaPAZm5e1s", "ChIJPTOBquz1GGARhVeLOBBtDO4", "ChIJQ8QaFK7vGGARHx5Wxoji1k0", "ChIJSfxcxcaOGGARkqTREhpZ-9I", "ChIJTcz4aZjyGGAR97XgZTxNi54", "ChIJW18YXtlhGGARKB2kl2rPx30", "ChIJWzMKtmuTGGAR4LLBTcJg5gk", "ChIJZQejd5NhGGARUE2Mcy3l2UM", "ChIJ_xWdoziLGGARZtM4dPw2huo", "ChIJjVJR1fWJGGARRvTklvPqv3o", "ChIJjasTRKmSGGAR6srbtdTFdqw", "ChIJk67g9SCRGGARAUkz_dP6vVI", "ChIJkXgiucbzGGARMN1GEnDq7Og", "ChIJkcbeI1-LGGAREdZ9ZyM5BCs", "ChIJn6V1Z2-LGGARNUCVJDec-Uo", "ChIJnxVQm_KOGGARXYop5MTUoVo", "ChIJtemcuUHzGGARrrkV9o-mvJU", "ChIJu0ZRwqGLGGARzqbAwTwuEA4", "ChIJw8J7LrCTGGARwNisDPY4K0I", "ChIJzRdtVNmJGGARXPd6Dez16vI"]}

## 6. Non-score blocked rows
Count 19; categories {"score_floor": 18, "chain_exclusion": 1}; published 0.

## 7. Existing published retention
Stays published 1406; removals 0.

## 8. Planned additions
24 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "8332d6da02984d83d555ee99644e7c02f1f0f233ff5165bb8af23194a120bb11", "quality_v4_research_digest": "6a4ab6153c193e3ffcdff587d9e0fc44e842b8d669b8708af46fb48238c0d1b7", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
