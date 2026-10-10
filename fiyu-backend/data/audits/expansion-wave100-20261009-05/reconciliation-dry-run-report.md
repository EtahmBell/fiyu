# Floor-70 publication reconciliation

## 1. Executive summary
Mode: dry_run. Threshold 70 -> 70.
Published 1145 -> 1207; additions 62; removals 0.

## 2. Current canonical state
Total 1778; published 1145; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 1145, "additions": 62, "removals": 0, "stays_unpublished": 571, "resulting_published": 1207, "resulting_unpublished": 571}

## 5. 313-manifest set equality
{"manifest_ids": 94, "exact_overlap": 62, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ49qLHt-LGGARHrZaOXV5H-0", "ChIJ68HzxPSLGGAR_-KXa4g4t84", "ChIJ87-CSACLGGARB_nMsU1-RvM", "ChIJ8yRdXlRfGGARWVQaTxNg3xw", "ChIJAQC1JpaNGGARo1L8YOBR7CI", "ChIJCcCuwEOMGGARuFi4C6SsYgo", "ChIJD_Hz_8OOGGAR-Id67e67Jt0", "ChIJF2aPQk2JGGAR7wZtL2rjpkQ", "ChIJFUdDn6GLGGARst7-ow9Sa0I", "ChIJFXP4VwpgGGARpcLrVRI6Noo", "ChIJG1lyFt-LGGARncAz9dvAwlg", "ChIJGcVJbtTtGGARogYWzkSTkec", "ChIJH2ExzQSJGGAR4CXxSI6AVKQ", "ChIJHVRonXSNGGARQdhl6ZewNaI", "ChIJKQq6e6KLGGAREleGHCa_uOA", "ChIJKRXuyyyLGGAR1cpX6FOSJzs", "ChIJP0PEQQCRGGARmfjlTiXlcso", "ChIJR4f08wOJGGARGAhavg5KT_c", "ChIJS_XeXEz1GGARadL4XRuHFns", "ChIJVTVPxB-PGGARUDBiQ6pL7YE", "ChIJaS6lb06RGGARTml4uVDgBoU", "ChIJp17O2v6LGGARW-L_EkDS1eM", "ChIJpd8KOwCJGGARoaB3Kvm01uM", "ChIJsQt3nGmPGGARTpHEATYBj5w", "ChIJsbqS6wNgGGARaglgT_egTr8", "ChIJu2vuZ-GLGGARiZNM8RsRO6k", "ChIJu_EFgnCLGGARnbLx0tNusaw", "ChIJvVLvHYruGGARYkPgfORItMw", "ChIJvaT7mVeJGGARl-LNsK8gdl0", "ChIJxVx7APGRGGAR1ApNMj5ndi8", "ChIJyTU_hOSLGGARQyKEOQ6O-DU", "ChIJzaal-X2LGGARg1QVQaBLaVw"], "already_published_cohort_rows": []}

## 6. Non-score blocked rows
Count 32; categories {"score_floor": 27, "chain_exclusion": 2, "critical_publication_contradiction": 1, "product_eligibility_failure": 1, "address_or_identity_conflict": 1}; published 0.

## 7. Existing published retention
Stays published 1145; removals 0.

## 8. Planned additions
62 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "1608e2e4e3b328ca102c6f092da757f5a3814826382436c2296b1043843590d2", "quality_v4_research_digest": "47761aa20f5e47ac386da4393b564cb98f058e71bd1ae0c760cbd98c6545728a", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
