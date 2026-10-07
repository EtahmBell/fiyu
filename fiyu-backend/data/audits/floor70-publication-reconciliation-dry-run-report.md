# Floor-70 publication reconciliation

## 1. Executive summary
Mode: dry_run. Threshold 75 -> 70.
Published 538 -> 851; additions 313; removals 0.

## 2. Current canonical state
Total 1203; published 538; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 538, "additions": 313, "removals": 0, "stays_unpublished": 352, "resulting_published": 851, "resulting_unpublished": 352}

## 5. 313-manifest set equality
{"manifest_ids": 313, "exact_overlap": 313, "unexpected_additions": [], "manifest_rows_missing": []}

## 6. Non-score blocked rows
Count 30; categories {"address_or_identity_conflict": 13, "product_eligibility_failure": 8, "identity_not_matched": 5, "unresolved_identity": 2, "critical_publication_contradiction": 2}; published 0.

## 7. Existing published retention
Stays published 538; removals 0.

## 8. Planned additions
313 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 149, "admitted": 0}, "floor68": {"ids": 64, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "07c5483dd0b8b92456d403ebb95320714ac2eb16614646174a4e9310dc00919b", "quality_v4_research_digest": "d688449e58b88c6676d0048d95e40d1bdf38e7ff337a00ba87223d0d134f88aa", "external_requests": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
