# Floor-70 publication reconciliation

## 1. Executive summary
Mode: dry_run. Threshold 70 -> 70.
Published 1084 -> 1145; additions 61; removals 0.

## 2. Current canonical state
Total 1678; published 1084; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 1084, "additions": 61, "removals": 0, "stays_unpublished": 533, "resulting_published": 1145, "resulting_unpublished": 533}

## 5. 313-manifest set equality
{"manifest_ids": 97, "exact_overlap": 61, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ-XrGnIaOGGARK-vDUApumA4", "ChIJ-yGfVwCLGGARsTENZvdu3tc", "ChIJ1wo3VRGNGGARAhTBPExaJlI", "ChIJ4ZmkhguNGGAR4ukOj5fU6aM", "ChIJ4ziZVI5hGGAR1O4uGVtCi0g", "ChIJAQAQJLqMGGARIy1X3zGG6W8", "ChIJBUZmKACRGGARxaJkFwSYrfA", "ChIJCbGXTvKNGGARcihEl8ls5o0", "ChIJKRYbTo-OGGAR0RwrwbyqwyM", "ChIJKZ11ZeNfGGARLSCXsozogqo", "ChIJL3M7dgdhGGAR3KK8v4e0dj8", "ChIJLYyEMLuLGGARV2fymy_Xnys", "ChIJLwPeYp-LGGARkKl5uVA48Ms", "ChIJN8tnA02JGGARmyWMXNI6CDI", "ChIJNfx6LjmJGGARYOmTuORkOQE", "ChIJO9rAtS9hGGARAEiilOp19sM", "ChIJP8NcSzGJGGAR7uyv3qCL9EI", "ChIJS5vOHZSJGGARdksiA-G_NL8", "ChIJX9xU2KiLGGARY0jlVs8HkJg", "ChIJZ5qvTbyMGGAR0-H99OxYnj4", "ChIJbSrZdACJGGARCiBBpJHj31g", "ChIJe73cNBxhGGARN4Fyoasrd-g", "ChIJf--xM_n0GGARtKxn3dvifjc", "ChIJf7BQeltgGGARSJJ-_5o5HKQ", "ChIJkdjQ3l_xGGAR3EwrPVvkP1c", "ChIJm1v_6taNGGARjGiuicxSvyI", "ChIJm_u92ECLGGAR_bvGlFZcPA4", "ChIJn9d23niPGGARl__2ZnjnfEM", "ChIJnwfW9MyNGGARxXCzn25uizc", "ChIJocZP5-zuGGARelYRwXg5GqI", "ChIJp724EEP1GGARzYjik4pCJg4", "ChIJpU8igReQGGARKZnCjiQRfQM", "ChIJpYiIiuePGGARrXd97pZ5DaI", "ChIJqaIe_4-LGGARboakRXb_LCg", "ChIJra6iTrrxGGARQHqDmfG4jnA", "ChIJy3PTLWKJGGARyRPsHlMAO1c"], "already_published_cohort_rows": []}

## 6. Non-score blocked rows
Count 36; categories {"product_eligibility_failure": 3, "score_floor": 27, "critical_publication_contradiction": 1, "chain_exclusion": 4, "address_or_identity_conflict": 1}; published 0.

## 7. Existing published retention
Stays published 1084; removals 0.

## 8. Planned additions
61 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "9dd88056b3af9cbff41375c1c6273fb2858fceb39282903a01e85c4d4b2ad3fc", "quality_v4_research_digest": "e1fac5c4010ff578d9bc50d8d6c633a3b72b423173cb8e1ded5b8d778bb49a49", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
