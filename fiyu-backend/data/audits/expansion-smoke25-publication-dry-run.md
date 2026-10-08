# Floor-70 publication reconciliation

## 1. Executive summary
Mode: dry_run. Threshold 70 -> 70.
Published 851 -> 868; additions 17; removals 0.

## 2. Current canonical state
Total 1228; published 851; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 851, "additions": 17, "removals": 0, "stays_unpublished": 360, "resulting_published": 868, "resulting_unpublished": 360}

## 5. 313-manifest set equality
{"manifest_ids": 25, "exact_overlap": 17, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ1UN6JAZhGGARTK85OJ7Cuto", "ChIJ6T1gnYruGGAREbmIYHZ4-Z0", "ChIJH2VBGfSLGGARN4HBRQO-imM", "ChIJHWuFAFiJGGAR_xRXBYDmsSg", "ChIJdcl_ZelhGGARA48p__O1c3U", "ChIJeS0ASmqTGGAR4pb5yY72DMY", "ChIJeYrdqN_vGGARmVHz8aiv7bw", "ChIJjYY_y3P1GGARVQLrP2FLj84"]}

## 6. Non-score blocked rows
Count 8; categories {"product_eligibility_failure": 1, "score_floor": 7}; published 0.

## 7. Existing published retention
Stays published 851; removals 0.

## 8. Planned additions
17 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "5df123ebb96279e8dd22e6d3538ad0317c3d1731d3f5a4ac1830acf2670a5840", "quality_v4_research_digest": "d2b6ceca3df5886cc6cd68d0edc72c42270a02f488a43eb65114db7690d59c15", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
