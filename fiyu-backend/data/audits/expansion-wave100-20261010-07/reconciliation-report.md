# Floor-70 publication reconciliation

## 1. Executive summary
Mode: real. Threshold 70 -> 70.
Published 1274 -> 1338; additions 64; removals 0.

## 2. Current canonical state
Total 1978; published 1274; integrity ok.

## 3. Threshold source of truth
Database metadata key `publication_score_threshold` with code fallback 75 for pre-migration databases.

## 4. Full 1203-row counterfactual
{"stays_published": 1274, "additions": 64, "removals": 0, "stays_unpublished": 640, "resulting_published": 1338, "resulting_unpublished": 640}

## 5. 313-manifest set equality
{"manifest_ids": 96, "exact_overlap": 64, "unexpected_additions": [], "manifest_rows_missing": [], "blocked_cohort_rows": ["ChIJ-WPWJriOGGARUeetJ_JS6v0", "ChIJ5TQzWb2OGGARuFmCle_M0E0", "ChIJ88wzg1iIGGARCqXGhcIB_ns", "ChIJ9cGxUpWOGGARq8-jcewSyJU", "ChIJDc3if76PGGAR5YbMJz10YDI", "ChIJF76qkXqJGGARzrdaxC4V5bQ", "ChIJH3ioCbHzGGAR58_0Zujvc7Y", "ChIJH6vBGDyLGGARoHbHNkfKnio", "ChIJITRSukqJGGARsF_L1s1taiU", "ChIJJX73uCeLGGARK7oNn4dKPaM", "ChIJK9cii_yRGGARHRrXPXqBtb8", "ChIJKe0wm-2RGGARzbZ8owj6sLA", "ChIJM4gUXfKNGGARQiiafsy1K5c", "ChIJO_oEGN-PGGARpydmC4HpVIk", "ChIJQ-Cy8G2NGGARhEouJ62vAkI", "ChIJQ1B42HnzGGARcWzGiwNMQ_8", "ChIJVVX0G-aRGGARLmifmB2dhzw", "ChIJY1FU-nlhGGARytZF1H7F1zg", "ChIJYwU5ElGLGGARHW8tmAy_tso", "ChIJYzKHeJ-LGGAR4elcxQLrf0g", "ChIJ__-ceECOGGARb6RXzoxpLv0", "ChIJbXELQ2thGGARSLLaV42wAiU", "ChIJdatwUZiLGGARvD5C6XiHu4A", "ChIJg9reJvbuGGARRnHLXpvsIrM", "ChIJgwkVSlrxGGARhhFbHYHmXII", "ChIJid3jjOiLGGARAtD9wsDhlnY", "ChIJkygJNUyNGGARxIJqm05dPKM", "ChIJp6euCr3zGGARozk5-v4oIJo", "ChIJq6qqO5JgGGARa_A9G7xhM6o", "ChIJr0qcQ4SOGGARER2zAqvET7s", "ChIJwTxZQb2MGGARaccbtwfXwbY", "ChIJzZc0pFKJGGARV50gH5OI1n4"], "already_published_cohort_rows": []}

## 6. Non-score blocked rows
Count 32; categories {"score_floor": 28, "chain_exclusion": 2, "critical_publication_contradiction": 1, "address_or_identity_conflict": 1}; published 0.

## 7. Existing published retention
Stays published 1274; removals 0.

## 8. Planned additions
64 rows; see JSONL artifact.

## 9. Planned removals
0 rows.

## 10. Sankei Sushi
{"place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE", "score": 82.82, "score_version": "public-v3-local-discovery-specialist-tristate", "current_published": true, "target_published": true, "score_mutation": false}

## 11. Rescue/floor-68 exclusions
{"rescue": {"ids": 0, "admitted": 0}, "floor68": {"ids": 0, "admitted": 0}}

## 12. API/public visibility
Canonical is_published transitions feed existing public list/detail and recommendation queries; API schema is unchanged.

## 13. Database invariants
{"score_changes": 0, "score_version_changes": 0, "research_changes": 0, "quality_v4_changes": 0, "restaurant_research_digest": "a99e883f3393cf22cc6ca43e99dafb658e8235d928d40424eefc63f3b930f622", "quality_v4_research_digest": "babd548a1885d420467673f4a2cb0f36356b231cf4086ac51d3214a55dfa845d", "external_requests": 0, "existing_published_removals": 0, "unrelated_additions": 0}

## 14. Exact real execution command
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data/fiyu.db reconcile-publication --threshold 70 --cohort-manifest data/audits/floor70-prepublication-v4-promotion-cohort.json --backup-out data/audits/pre-floor70-publication-reconciliation-20261006.db --summary-out data/audits/floor70-publication-reconciliation-summary.json --report-out data/audits/floor70-publication-reconciliation-report.md --changes-out data/audits/floor70-publication-reconciliation-changes.jsonl
