# Floor-70 publication reconciliation

## 1. Executive summary
Mode: real. Threshold 70 -> 70.
Published 1207 -> 1274; additions 67; removals 0.

## 2. Current canonical state
Total 1878; published 1207; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 1207, "additions": 67, "removals": 0, "stays_unpublished": 604, "resulting_published": 1274, "resulting_unpublished": 604}

## 5. 313-manifest set equality
{"manifest_ids": 99, "exact_overlap": 67, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ0z_FzySNGGAR-T06iiIvZ1M", "ChIJ2UTxiNCTGGARY2gOhJFh-0E", "ChIJ2ffKI1ftGGARKHjQwumdXo8", "ChIJ9V0Mx0OMGGART0IL_d71HEw", "ChIJA4I_ml-JGGARgrZCD8-oMeM", "ChIJB2DswnP0GGARsMK6rFrVCo4", "ChIJBbHWFvhgGGARJYv8f047KCc", "ChIJCwTxGnuJGGARV6AbFc9uW0s", "ChIJG8WaMoyLGGARZ2hdt6JM__0", "ChIJHSN-cGSJGGAR62N3Tz0P6cU", "ChIJHeXI9ZXzGGARVqpmbotLIsw", "ChIJOTuA03iJGGARNi2RNlyP23s", "ChIJR4iEFmfvGGARAQnNLJ1PA3w", "ChIJRYu1mkiPGGARcMWe1u3eAgo", "ChIJT0uCfj_yGGARTKCoM9wGs2U", "ChIJTWh1_4_1GGARsHOwlTR-qYI", "ChIJWaI_72OLGGARraKFhbqU7E0", "ChIJ_8G_RSuLGGARymcrFV-cymo", "ChIJbVk2fACPGGARmjLUrKY2dUs", "ChIJcyBvtViLGGARpyqLQXJdOpY", "ChIJe072X3iLGGARrRjLeJfX6c4", "ChIJexStLMiPGGARdtIv1ttZyHE", "ChIJh9mRJACNGGARijltDRxUZ_o", "ChIJi7JCpqiLGGARjL3ngeWT9ac", "ChIJj-KnLACLGGARypiz4wRGuAg", "ChIJn5VmDQDzGGAR3CDtB_c1_BA", "ChIJoTWcGceLGGAR0grB1rHfWA8", "ChIJpb0kbVCJGGARht2Bdri6Qd8", "ChIJrWvCdd5hGGARzp0TYKF6Zfo", "ChIJrYrZ3mKIGGARrk5s8wShat8", "ChIJwzsmIO-OGGARhb20ev1Sx2g", "ChIJxeUyNfRgGGARPQsTk4MZE0E"], "already_published_cohort_rows": []}

## 6. Non-score blocked rows
Count 32; categories {"score_floor": 30, "chain_exclusion": 2}; published 0.

## 7. Existing published retention
Stays published 1207; removals 0.

## 8. Planned additions
67 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "0f58a2081733d670db70edcdf531ad3bb10604bf7b3f0273f0f6db264ffc9279", "quality_v4_research_digest": "ab6138d8a424cd8e219c8a61ff84ad5e7449093eec873bce34b79e4f0dc37115", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
