# Floor-70 publication reconciliation

## 1. Executive summary
Mode: real. Threshold 70 -> 70.
Published 962 -> 1021; additions 59; removals 0.

## 2. Current canonical state
Total 1478; published 962; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 962, "additions": 59, "removals": 0, "stays_unpublished": 457, "resulting_published": 1021, "resulting_unpublished": 457}

## 5. 313-manifest set equality
{"manifest_ids": 96, "exact_overlap": 59, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ0T3WaFWLGGAR0j7hB53mKNg", "ChIJ1aUBhaiOGGARkc58Hc2d5p0", "ChIJ3SwazWzzGGAR-oSv2YiWpSA", "ChIJ5XL2NEWKGGARzE-kfwOfSLU", "ChIJ5Zl80EqRGGARzW2ekHt129A", "ChIJ8zKOv8OIGGARL0VJWSFTKHc", "ChIJ900slhOLGGARSqX_N_CAPTI", "ChIJAUYUwexhGGARzcBY_vznsS0", "ChIJBQWkoJiLGGARVc7Zzqv-klQ", "ChIJF0MHUgCLGGARc15pQskW97k", "ChIJHcjrimiMGGARicI64jTsJJY", "ChIJHz_fI_-KGGARXAvyUoa5Yak", "ChIJIVOD-dCJGGARgjkIi6KEBUw", "ChIJK_UaJ9KNGGARzGtBMfDnV2M", "ChIJLdDR8CRhGGARn9UKT7gLxC0", "ChIJLxsQkl6LGGARatTmxtTYXw8", "ChIJM2ekaACNGGARCrA-yUBj-m8", "ChIJSw8BGFCPGGAR1z2jYcGzcA0", "ChIJT2hJa3yJGGARNPeOLToaGXI", "ChIJTXk6uBWMGGAR3TsADefF17w", "ChIJU1QIL6mLGGARHGUC6xk1sGM", "ChIJWaoddIz0GGARirMkmxg-LNw", "ChIJd3DTthmOGGARRhyngXtjV5E", "ChIJg6UbKACNGGARBtvVM4UdEeU", "ChIJhzt6v31hGGARmPWdR9EVd7Q", "ChIJj2ms-BqNGGARAZS3ie2TyZ4", "ChIJl3jqmhaNGGAR2-jmyu_iQ-k", "ChIJla_XmXD1GGARXbr0f2fDreQ", "ChIJmfy4zpSLGGAR5B4WMSK6CiU", "ChIJowyLU2LzGGARmmDMc97q2ys", "ChIJq6pWrdSRGGARcWbT-jzJ4q0", "ChIJr8txpz6LGGARezlq9eLEtek", "ChIJsbUqij-LGGARebAJ7BDH3vU", "ChIJt6uAkTjuGGARvJ7LDWgnhvc", "ChIJwbbTn3L0GGAReSxB9VaGSk0", "ChIJwdBvrNOPGGARY0ipU4k7LCw", "ChIJz2Pn-jqSGGARUadaHsO0DYM"], "already_published_cohort_rows": []}

## 6. Non-score blocked rows
Count 37; categories {"score_floor": 32, "product_eligibility_failure": 2, "chain_exclusion": 2, "address_or_identity_conflict": 1}; published 0.

## 7. Existing published retention
Stays published 962; removals 0.

## 8. Planned additions
59 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "e8dec49f27895bf2c2c945f7c0f1975ddc3ad72ba05e27ef09f0694ad5b7ee4d", "quality_v4_research_digest": "f39c1c71ed9862c1e8bedd022637a5fbecc5fd90aa0ccd506c22d74f53033afe", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
