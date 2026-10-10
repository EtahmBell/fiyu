# Floor-70 publication reconciliation

## 1. Executive summary
Mode: dry_run. Threshold 70 -> 70.
Published 1021 -> 1084; additions 63; removals 0.

## 2. Current canonical state
Total 1578; published 1021; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 1021, "additions": 63, "removals": 0, "stays_unpublished": 494, "resulting_published": 1084, "resulting_unpublished": 494}

## 5. 313-manifest set equality
{"manifest_ids": 95, "exact_overlap": 63, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ18HoEceKGGARuWp2c3Oj6Js", "ChIJ251TzxP0GGARHFBfnnMfG9M", "ChIJ6-dyP_-KGGAR-7ERdms9DOE", "ChIJ65sV2feLGGARemo_DxqrE0g", "ChIJ6xNvacCLGGARaShVxYNC-Os", "ChIJ90NR4CmNGGARRKcnyHok73o", "ChIJB0pOTn-PGGARSeWCBB7YCTQ", "ChIJB2K5OUSNGGARMY723feyzMI", "ChIJCfdLOXBgGGARD5GfAGdlwGY", "ChIJD3v6fvdfGGARcRd_uKRltG8", "ChIJD68ByVFjGGAR5iM8dmSK9sE", "ChIJHY6WOneNGGARxfioXdaxoEM", "ChIJOywn8h6NGGARnNouO2WPQVA", "ChIJPVj4WTGSGGARtC8Wi3CeRw4", "ChIJPzLWNa7zGGARhLomVKqe1Qs", "ChIJQeTXd92LGGARQTHMZlUiyLQ", "ChIJT-NfBvD0GGARBeYigiZuSSA", "ChIJXyrf3QKLGGARuIZ6jV4AYjY", "ChIJY2MPJOiLGGARe0bZTvfI44w", "ChIJYw9uJA6LGGARkFTg5kX9F6Y", "ChIJ_z-LAX-NGGARS304e6FFhrg", "ChIJb83JTBuNGGARU2s7f-uNuNk", "ChIJccTLKF1gGGARwqfRVKM2vOQ", "ChIJg9Tqi0CJGGARucQLynCcCzE", "ChIJk4-nhkX1GGARdODW2oUW_FQ", "ChIJnTxXNf6JGGARefZ0zS1P4Uo", "ChIJp8fthBOMGGAR7MoUwFSt42I", "ChIJpxm24mvvGGARxpL3oMf32V8", "ChIJr1BJK-KIGGARaYAVrD3jG1Y", "ChIJubm7E_SJGGARHANxVxJtyv0", "ChIJvZcZTErxGGAR1dlPSmEWuUQ", "ChIJyx2Y0zWLGGARFzb8YzNxM80"], "already_published_cohort_rows": []}

## 6. Non-score blocked rows
Count 32; categories {"score_floor": 28, "chain_exclusion": 4}; published 0.

## 7. Existing published retention
Stays published 1021; removals 0.

## 8. Planned additions
63 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "88f3e59aa33e80d38072822968e26f6313ce601057bc85d6f929fa2defb295a4", "quality_v4_research_digest": "5946f448b3df9e96b0b30ed3c62b697ebda8ec1fb39d378dcfa0d809addb8c3f", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
