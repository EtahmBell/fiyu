# Floor-70 Quality-v4 cohort promotion

## 1. Cohort identity

- Manifest IDs / unique IDs: **97 / 97**
- Canonical identities / shadow complete: **97 / 97**
- Sankei Sushi selected: **False**
- Below-floor rescue overlap: **0**

## 2. Source and canonical hashes

- Canonical before/after: `67180746ECC68F75B4A998B3A54346A531E37642E1B219831BAF6398E533F306` / `8452E666CC0162664931C3E55E835C9E4B3F76525BA8FED6A7B3130B35EAC717`
- Shadow: `67180746ECC68F75B4A998B3A54346A531E37642E1B219831BAF6398E533F306`
- Cohort manifest: `3DE94C9D9AFEC50A627E0CC8EBCE0E990149D4F90A91F1A419A20865926804A2`

## 3. Version validation

Validated research/scorer/prompt versions and ±15 guardrail for **97** rows.

## 4. Shadow/canonical parity

- Exact matches / mismatches: **97 / 0**
- Maximum mismatch: **0.0**

## 5. Score delta distribution

`{"count": 97, "max": 4.010000000000005, "mean": 1.52, "median": 1.51, "min": 0.0, "p10": 0.45, "p90": 2.55}`

## 6. Expected history and research imports

- Selected / already promoted: **97 / 0**
- Research imports / score pointer changes: **0 / 97**
- Expected score-history additions: **194**

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
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\fiyu.db quality-v4-promote --source-db data\fiyu.db --cohort-manifest data\audits\expansion-wave100-20261009-04\promotion-cohort.json --backup-out data\audits\pre-floor70-v4-promotion-20261006.db
```

## Full machine-readable summary

```json
{
  "dry_run": false,
  "selection_scope": "cohort_manifest",
  "cohort_manifest": "data\\audits\\expansion-wave100-20261009-04\\promotion-cohort.json",
  "cohort_name": "expansion-wave100-20261009-04 promotable Quality-v4 subset",
  "cohort_manifest_version": "deterministic-unseeded-cohort-1",
  "cohort_ids": 97,
  "unique_cohort_ids": 97,
  "source_complete_v4_rows": 97,
  "source_incomplete_rows": 0,
  "source_failed_rows": 0,
  "matched_canonical_identities": 97,
  "missing_canonical_identities": 0,
  "duplicate_or_conflicting_identities": 0,
  "already_v4_rows": 0,
  "already_promoted": 0,
  "selected_for_promotion": 97,
  "excluded_from_cohort": 0,
  "missing_from_cohort": 0,
  "unrelated_rows_selected": 0,
  "sankei_sushi_selected": false,
  "below_floor_rescue_overlap": 0,
  "rows_to_import": 0,
  "rows_to_score": 97,
  "expected_score_history_additions": 194,
  "expected_score_version_changes": 97,
  "expected_publication_state_changes": 0,
  "expected_is_published_changes": 0,
  "expected_product_eligible_changes": 0,
  "expected_review_status_changes": 0,
  "expected_rejection_reason_changes": 0,
  "expected_threshold_changes": 0,
  "production_score_version": "public-v4-quality-research-specialist-tristate",
  "source_shadow_score_version": "quality-v4-shadow-1",
  "publication_score_threshold": 75.0,
  "failed_or_incomplete_rows": [],
  "stored_current_pointer_distribution_before": {
    "count": 97,
    "min": 49.99,
    "p10": 63.28,
    "median": 71.35,
    "mean": 69.76,
    "p90": 76.66,
    "max": 82.65
  },
  "stored_v3_pointer_distribution_before": {
    "count": 97,
    "min": 49.99,
    "p10": 63.28,
    "median": 71.35,
    "mean": 69.76,
    "p90": 76.66,
    "max": 82.65
  },
  "canonical_v3_distribution": {
    "count": 97,
    "min": 49.99,
    "p10": 63.28,
    "median": 71.35,
    "mean": 69.76,
    "p90": 76.66,
    "max": 82.65
  },
  "v4_score_distribution_after": {
    "count": 97,
    "min": 49.99,
    "p10": 63.89,
    "median": 72.23,
    "mean": 71.28,
    "p90": 77.8,
    "max": 83.75
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 97,
    "min": 0.0,
    "p10": 0.45,
    "median": 1.51,
    "mean": 1.52,
    "p90": 2.55,
    "max": 4.010000000000005
  },
  "shadow_v4_delta_distribution": {
    "count": 97,
    "min": 0.0,
    "p10": 0.45,
    "median": 1.51,
    "mean": 1.52,
    "p90": 2.55,
    "max": 4.010000000000005
  },
  "documented_stored_v3_pointer_mismatches": 0,
  "stored_pointer_decreases": 0,
  "positive_adjustment_stored_pointer_decreases": 0,
  "zero_adjustment_stored_pointer_differences": 0,
  "quality_adjustment_distribution": {
    "count": 97,
    "min": 0.0,
    "p10": 1.36,
    "median": 3.48,
    "mean": 3.53,
    "p90": 5.81,
    "max": 8.91
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 6,
    "+0.5 to +0.99": 1,
    "+1 to +2.99": 33,
    "+3 to +4.99": 37,
    "+5 to +7.99": 19,
    "+8 to +11.99": 1,
    ">= +12": 0
  },
  "large_adjustments_ge_8": 1,
  "large_adjustments_ge_12": 0,
  "large_adjustment_rows": [
    {
      "place_id": "ChIJ4ZmkhguNGGAR4ukOj5fU6aM",
      "restaurant": "PANDA SELECT",
      "adjustment": 8.91,
      "production_v4_score": 82.26
    }
  ],
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 97,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1678,
  "canonical_sha256_before": "67180746ECC68F75B4A998B3A54346A531E37642E1B219831BAF6398E533F306",
  "source_shadow_sha256": "67180746ECC68F75B4A998B3A54346A531E37642E1B219831BAF6398E533F306",
  "canonical_integrity_before": "ok",
  "source_integrity_before": "ok",
  "external_requests": 0,
  "publication_threshold_before": 75.0,
  "publication_threshold_after": 75.0,
  "published_count_before": 1084,
  "published_count_after": 1084,
  "cohort_manifest_sha256": "3DE94C9D9AFEC50A627E0CC8EBCE0E990149D4F90A91F1A419A20865926804A2",
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJ8SzqvPBgGGARQFmYq9xp1zY",
      "restaurant": "Uchibenkei Honten",
      "previous_v3_score": 72.62,
      "base_quality": 53.03,
      "quality_adjustment": 0.0,
      "researched_quality": 53.03,
      "production_v4_score": 72.62,
      "score_version": "public-v4-quality-research-specialist-tristate",
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
      "place_id": "ChIJ13RD__HzGGARxemRfsvJVWY",
      "restaurant": "Washoku Shikine",
      "previous_v3_score": 74.82,
      "base_quality": 68.04,
      "quality_adjustment": 2.61,
      "researched_quality": 70.65,
      "production_v4_score": 76.0,
      "score_version": "public-v4-quality-research-specialist-tristate",
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
      "place_id": "ChIJ-xQHzU2IGGARK2vs6Kz4JqY",
      "restaurant": "Akekure Japanese Restaurant",
      "previous_v3_score": 71.91,
      "base_quality": 72.85,
      "quality_adjustment": 3.99,
      "researched_quality": 76.84,
      "production_v4_score": 73.7,
      "score_version": "public-v4-quality-research-specialist-tristate",
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
      "place_id": "ChIJ-XrGnIaOGGARK-vDUApumA4",
      "restaurant": "Nihonshu Dining Negishi Kawakiya",
      "previous_v3_score": 64.21,
      "base_quality": 51.33,
      "quality_adjustment": 6.02,
      "researched_quality": 57.35,
      "production_v4_score": 66.92,
      "score_version": "public-v4-quality-research-specialist-tristate",
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
      "place_id": "ChIJ4ZmkhguNGGAR4ukOj5fU6aM",
      "restaurant": "PANDA SELECT",
      "previous_v3_score": 78.25,
      "base_quality": 57.68,
      "quality_adjustment": 8.91,
      "researched_quality": 66.59,
      "production_v4_score": 82.26,
      "score_version": "public-v4-quality-research-specialist-tristate",
      "is_published_before_after": [
        false,
        false
      ],
      "product_eligible_before_after": [
        false,
        false
      ]
    }
  ],
  "recommended_dry_run_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-04\\promotion-cohort.json --dry-run",
  "recommended_real_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-04\\promotion-cohort.json --backup-out data\\audits\\pre-floor70-v4-promotion-20261006.db",
  "backup_path": "data\\audits\\expansion-wave100-20261009-04\\pre-promotion.db",
  "backup_sha256": "67180746ECC68F75B4A998B3A54346A531E37642E1B219831BAF6398E533F306",
  "backup_matches_pre_migration": true,
  "v4_research_records_imported": 97,
  "production_score_version_counts": {
    "NULL": 111,
    "public-v3-local-discovery-specialist-tristate": 249,
    "public-v4-quality-research-specialist-tristate": 1318
  },
  "current_production_v4_rows": 1318,
  "rows_remaining_non_v4": 360,
  "duplicate_production_v4_history_rows": 0,
  "is_published_changes": 0,
  "product_eligible_changes": 0,
  "review_status_changes": 0,
  "total_visibility_state_changes": 0,
  "publication_state_changes": 0,
  "unrelated_rows_changed": 0,
  "threshold_changes": 0,
  "idempotency_rows_to_import": 0,
  "idempotency_rows_to_score": 0,
  "canonical_integrity_after": "ok",
  "canonical_sha256_after": "8452E666CC0162664931C3E55E835C9E4B3F76525BA8FED6A7B3130B35EAC717",
  "source_shadow_unchanged": false
}
```
