# Floor-70 Quality-v4 cohort promotion dry run

## 1. Cohort identity

- Manifest IDs / unique IDs: **313 / 313**
- Canonical identities / shadow complete: **313 / 313**
- Sankei Sushi selected: **False**
- Below-floor rescue overlap: **0**

## 2. Source and canonical hashes

- Canonical before/after: `3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7` / `3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7`
- Shadow: `98BAA6F48236D6DC33AFD97A3B1BD751CB3E8A324A72636B6C3FB2F44C21F592`
- Cohort manifest: `934E651CBDC198A9E9EEE9A53DB8DAF2E6C941DFF28F79A0B621A8EC7C8FAF2E`

## 3. Version validation

Validated research/scorer/prompt versions and ±15 guardrail for **313** rows.

## 4. Shadow/canonical parity

- Exact matches / mismatches: **313 / 0**
- Maximum mismatch: **0.0**

## 5. Score delta distribution

`{"count": 313, "max": 4.489999999999995, "mean": 1.51, "median": 1.53, "min": 0.0, "p10": 0.31, "p90": 2.64}`

## 6. Expected history and research imports

- Selected / already promoted: **313 / 0**
- Research imports / score pointer changes: **313 / 313**
- Expected score-history additions: **626**

## 7. Publication invariants

Publication, product eligibility, review status, and rejection-reason changes: **0 / 0 / 0 / 0**.

## 8. Threshold invariant

Production threshold: **75.0 -> 75.0**. Changes: **0**.

## 9. Unrelated-row protection

Unrelated rows selected/changed: **0 / 0**.

## 10. Idempotency expectation

After the first successful scoped promotion, the same command must report selected 0 and already promoted 313.

## 11. Exact future execution command

```powershell
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\fiyu.db quality-v4-promote --source-db data\fiyu-floor70-prepublication-v4-shadow.db --cohort-manifest data\audits\floor70-prepublication-v4-promotion-cohort.json --backup-out data\audits\pre-floor70-v4-promotion-20261006.db
```

## Full machine-readable summary

```json
{
  "dry_run": true,
  "selection_scope": "cohort_manifest",
  "cohort_manifest": "data\\audits\\floor70-prepublication-v4-promotion-cohort.json",
  "cohort_name": "floor70-prepublication-v4",
  "cohort_manifest_version": "quality-v4-promotion-cohort-1",
  "cohort_ids": 313,
  "unique_cohort_ids": 313,
  "source_complete_v4_rows": 313,
  "source_incomplete_rows": 0,
  "source_failed_rows": 0,
  "matched_canonical_identities": 313,
  "missing_canonical_identities": 0,
  "duplicate_or_conflicting_identities": 0,
  "already_v4_rows": 0,
  "already_promoted": 0,
  "selected_for_promotion": 313,
  "excluded_from_cohort": 0,
  "missing_from_cohort": 0,
  "unrelated_rows_selected": 0,
  "sankei_sushi_selected": false,
  "below_floor_rescue_overlap": 0,
  "rows_to_import": 313,
  "rows_to_score": 313,
  "expected_score_history_additions": 626,
  "expected_score_version_changes": 313,
  "expected_publication_state_changes": 0,
  "expected_is_published_changes": 0,
  "expected_product_eligible_changes": 0,
  "expected_review_status_changes": 0,
  "expected_rejection_reason_changes": 0,
  "expected_threshold_changes": 0,
  "production_score_version": "public-v4-quality-research",
  "source_shadow_score_version": "quality-v4-shadow-1",
  "publication_score_threshold": 75.0,
  "failed_or_incomplete_rows": [],
  "stored_v3_pointer_distribution_before": {
    "count": 313,
    "min": 70.0,
    "p10": 70.61,
    "median": 72.96,
    "mean": 72.8,
    "p90": 74.78,
    "max": 75.85
  },
  "canonical_v3_distribution": {
    "count": 313,
    "min": 70.0,
    "p10": 70.61,
    "median": 72.96,
    "mean": 72.8,
    "p90": 74.78,
    "max": 75.85
  },
  "v4_score_distribution_after": {
    "count": 313,
    "min": 70.54,
    "p10": 72.21,
    "median": 74.36,
    "mean": 74.31,
    "p90": 76.49,
    "max": 78.53
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 313,
    "min": 0.0,
    "p10": 0.31,
    "median": 1.53,
    "mean": 1.51,
    "p90": 2.64,
    "max": 4.489999999999995
  },
  "shadow_v4_delta_distribution": {
    "count": 313,
    "min": 0.0,
    "p10": 0.31,
    "median": 1.53,
    "mean": 1.51,
    "p90": 2.64,
    "max": 4.489999999999995
  },
  "documented_stored_v3_pointer_mismatches": 1,
  "stored_pointer_decreases": 0,
  "positive_adjustment_stored_pointer_decreases": 0,
  "zero_adjustment_stored_pointer_differences": 0,
  "quality_adjustment_distribution": {
    "count": 313,
    "min": 0.0,
    "p10": 0.69,
    "median": 3.43,
    "mean": 3.37,
    "p90": 5.86,
    "max": 9.98
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 31,
    "+0.5 to +0.99": 5,
    "+1 to +2.99": 93,
    "+3 to +4.99": 123,
    "+5 to +7.99": 59,
    "+8 to +11.99": 2,
    ">= +12": 0
  },
  "large_adjustments_ge_8": 2,
  "large_adjustments_ge_12": 0,
  "large_adjustment_rows": [
    {
      "place_id": "ChIJ94JbagD1GGARlplO43_1hjw",
      "restaurant": "Pienezza Fukasawa",
      "adjustment": 9.98,
      "production_v4_score": 77.82
    },
    {
      "place_id": "ChIJt1NzEuf1GGARPZGgeghTKsU",
      "restaurant": "Setagaya Yakiniku bon",
      "adjustment": 8.03,
      "production_v4_score": 76.56
    }
  ],
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 313,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1203,
  "canonical_sha256_before": "3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7",
  "source_shadow_sha256": "98BAA6F48236D6DC33AFD97A3B1BD751CB3E8A324A72636B6C3FB2F44C21F592",
  "canonical_integrity_before": "ok",
  "source_integrity_before": "ok",
  "external_requests": 0,
  "publication_threshold_before": 75.0,
  "publication_threshold_after": 75.0,
  "published_count_before": 538,
  "published_count_after": 538,
  "cohort_manifest_sha256": "934E651CBDC198A9E9EEE9A53DB8DAF2E6C941DFF28F79A0B621A8EC7C8FAF2E",
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJ01VQLvyRGGARpHSYg_dDJSg",
      "restaurant": "Izakaya Okinoya",
      "previous_v3_score": 74.68,
      "base_quality": 56.36,
      "quality_adjustment": 0.0,
      "researched_quality": 56.36,
      "production_v4_score": 74.68,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        false,
        false
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": "+1_to_+3",
      "place_id": "ChIJ06uDupBhGGAReI82OoBNoZo",
      "restaurant": "Hamro Chahari Ghar",
      "previous_v3_score": 74.61,
      "base_quality": 57.86,
      "quality_adjustment": 1.66,
      "researched_quality": 59.52,
      "production_v4_score": 75.36,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        false,
        false
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": "+3_to_+5",
      "place_id": "ChIJ-SgMgaeSGGAR6h1RxrclUJQ",
      "restaurant": "Moriyama",
      "previous_v3_score": 73.69,
      "base_quality": 59.27,
      "quality_adjustment": 3.45,
      "researched_quality": 62.72,
      "production_v4_score": 75.24,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        false,
        false
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": "+5_to_+8",
      "place_id": "ChIJ-WwCsJ-LGGARo4U4s0IhXVM",
      "restaurant": "Kitchen5bis",
      "previous_v3_score": 70.31,
      "base_quality": 57.8,
      "quality_adjustment": 5.57,
      "researched_quality": 63.37,
      "production_v4_score": 72.82,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        false,
        false
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": ">=+8",
      "place_id": "ChIJ94JbagD1GGARlplO43_1hjw",
      "restaurant": "Pienezza Fukasawa",
      "previous_v3_score": 73.33,
      "base_quality": 69.49,
      "quality_adjustment": 9.98,
      "researched_quality": 79.47,
      "production_v4_score": 77.82,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        false,
        false
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    }
  ],
  "recommended_dry_run_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu-floor70-prepublication-v4-shadow.db --cohort-manifest data\\audits\\floor70-prepublication-v4-promotion-cohort.json --dry-run",
  "recommended_real_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu-floor70-prepublication-v4-shadow.db --cohort-manifest data\\audits\\floor70-prepublication-v4-promotion-cohort.json --backup-out data\\audits\\pre-floor70-v4-promotion-20261006.db",
  "canonical_sha256_after": "3EB3F31D63D8916420D67DCBEF23D6C8CCFEDA785E8EEAAE64C2F4D8E20237C7",
  "canonical_unchanged": true,
  "source_shadow_unchanged": true,
  "publication_state_changes": 0,
  "threshold_changes": 0,
  "unrelated_rows_changed": 0
}
```
