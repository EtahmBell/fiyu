# Floor-70 Quality-v4 cohort promotion

## 1. Cohort identity

- Manifest IDs / unique IDs: **95 / 95**
- Canonical identities / shadow complete: **95 / 95**
- Sankei Sushi selected: **False**
- Below-floor rescue overlap: **0**

## 2. Source and canonical hashes

- Canonical before/after: `45F231873BC1608C15226C7C44A8C8C9DC1A72AE0DCEA1BFED73AC1685A8DF66` / `C64F53E68754F892FBD7DD9AB697E665D41FE43A24E6E06C7FE70F8B61D7B02C`
- Shadow: `45F231873BC1608C15226C7C44A8C8C9DC1A72AE0DCEA1BFED73AC1685A8DF66`
- Cohort manifest: `1E8F9F913B41141D947ED677A1723EC071BE693B3A165DBDB82BB2816D5DF7DE`

## 3. Version validation

Validated research/scorer/prompt versions and ±15 guardrail for **95** rows.

## 4. Shadow/canonical parity

- Exact matches / mismatches: **95 / 0**
- Maximum mismatch: **0.0**

## 5. Score delta distribution

`{"count": 95, "max": 3.819999999999993, "mean": 1.4, "median": 1.33, "min": 0.0, "p10": 0.3, "p90": 2.64}`

## 6. Expected history and research imports

- Selected / already promoted: **95 / 0**
- Research imports / score pointer changes: **0 / 95**
- Expected score-history additions: **190**

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
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\fiyu.db quality-v4-promote --source-db data\fiyu.db --cohort-manifest data\audits\expansion-wave100-20261009-01\promotion-cohort.json --backup-out data\audits\pre-floor70-v4-promotion-20261006.db
```

## Full machine-readable summary

```json
{
  "dry_run": false,
  "selection_scope": "cohort_manifest",
  "cohort_manifest": "data\\audits\\expansion-wave100-20261009-01\\promotion-cohort.json",
  "cohort_name": "expansion-wave100-20261009-01 promotable Quality-v4 subset",
  "cohort_manifest_version": "deterministic-unseeded-cohort-1",
  "cohort_ids": 95,
  "unique_cohort_ids": 95,
  "source_complete_v4_rows": 95,
  "source_incomplete_rows": 0,
  "source_failed_rows": 0,
  "matched_canonical_identities": 95,
  "missing_canonical_identities": 0,
  "duplicate_or_conflicting_identities": 0,
  "already_v4_rows": 0,
  "already_promoted": 0,
  "selected_for_promotion": 95,
  "excluded_from_cohort": 0,
  "missing_from_cohort": 0,
  "unrelated_rows_selected": 0,
  "sankei_sushi_selected": false,
  "below_floor_rescue_overlap": 0,
  "rows_to_import": 0,
  "rows_to_score": 95,
  "expected_score_history_additions": 190,
  "expected_score_version_changes": 95,
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
    "count": 95,
    "min": 49.99,
    "p10": 63.36,
    "median": 70.34,
    "mean": 69.9,
    "p90": 76.16,
    "max": 81.14
  },
  "stored_v3_pointer_distribution_before": {
    "count": 95,
    "min": 49.99,
    "p10": 63.36,
    "median": 70.34,
    "mean": 69.9,
    "p90": 76.16,
    "max": 81.14
  },
  "canonical_v3_distribution": {
    "count": 95,
    "min": 49.99,
    "p10": 63.07,
    "median": 70.34,
    "mean": 69.75,
    "p90": 76.16,
    "max": 81.14
  },
  "v4_score_distribution_after": {
    "count": 95,
    "min": 49.99,
    "p10": 64.32,
    "median": 72.64,
    "mean": 71.15,
    "p90": 77.87,
    "max": 82.62
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 95,
    "min": -13.949999999999996,
    "p10": 0.3,
    "median": 1.33,
    "mean": 1.25,
    "p90": 2.64,
    "max": 3.819999999999993
  },
  "shadow_v4_delta_distribution": {
    "count": 95,
    "min": 0.0,
    "p10": 0.3,
    "median": 1.33,
    "mean": 1.4,
    "p90": 2.64,
    "max": 3.819999999999993
  },
  "documented_stored_v3_pointer_mismatches": 1,
  "stored_pointer_decreases": 1,
  "positive_adjustment_stored_pointer_decreases": 1,
  "zero_adjustment_stored_pointer_differences": 0,
  "quality_adjustment_distribution": {
    "count": 95,
    "min": 0.0,
    "p10": 1.27,
    "median": 3.08,
    "mean": 3.28,
    "p90": 5.88,
    "max": 8.5
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 5,
    "+0.5 to +0.99": 3,
    "+1 to +2.99": 38,
    "+3 to +4.99": 29,
    "+5 to +7.99": 19,
    "+8 to +11.99": 1,
    ">= +12": 0
  },
  "large_adjustments_ge_8": 1,
  "large_adjustments_ge_12": 0,
  "large_adjustment_rows": [
    {
      "place_id": "ChIJOzqi4r-NGGART6Ik3sCHEeo",
      "restaurant": "Misono",
      "adjustment": 8.5,
      "production_v4_score": 73.02
    }
  ],
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 95,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1378,
  "canonical_sha256_before": "45F231873BC1608C15226C7C44A8C8C9DC1A72AE0DCEA1BFED73AC1685A8DF66",
  "source_shadow_sha256": "45F231873BC1608C15226C7C44A8C8C9DC1A72AE0DCEA1BFED73AC1685A8DF66",
  "canonical_integrity_before": "ok",
  "source_integrity_before": "ok",
  "external_requests": 0,
  "publication_threshold_before": 75.0,
  "publication_threshold_after": 75.0,
  "published_count_before": 906,
  "published_count_after": 906,
  "cohort_manifest_sha256": "1E8F9F913B41141D947ED677A1723EC071BE693B3A165DBDB82BB2816D5DF7DE",
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJ4YhWb5aRGGARwxRERptlcH8",
      "restaurant": "Darts UP Takenotsuka",
      "previous_v3_score": 73.61,
      "base_quality": 100.0,
      "quality_adjustment": 0.0,
      "researched_quality": 100.0,
      "production_v4_score": 73.61,
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
      "place_id": "ChIJ2Q3_DkKNGGARuUD9S0hLthw",
      "restaurant": "Mahal",
      "previous_v3_score": 65.61,
      "base_quality": 51.87,
      "quality_adjustment": 2.5,
      "researched_quality": 54.37,
      "production_v4_score": 66.74,
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
      "place_id": "ChIJ03tWc8aIGGAR1dfowEqGXYY",
      "restaurant": "Horaiken",
      "previous_v3_score": 66.26,
      "base_quality": 43.32,
      "quality_adjustment": 3.29,
      "researched_quality": 46.61,
      "production_v4_score": 67.74,
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
      "place_id": "ChIJ1_FOtE-JGGAR_cxJzzITqhA",
      "restaurant": "Nihombashi Sonoji",
      "previous_v3_score": 69.71,
      "base_quality": 67.16,
      "quality_adjustment": 7.81,
      "researched_quality": 74.97,
      "production_v4_score": 73.23,
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
      "place_id": "ChIJOzqi4r-NGGART6Ik3sCHEeo",
      "restaurant": "Misono",
      "previous_v3_score": 69.2,
      "base_quality": 51.52,
      "quality_adjustment": 8.5,
      "researched_quality": 60.02,
      "production_v4_score": 73.02,
      "score_version": "public-v4-quality-research-specialist-tristate",
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
  "recommended_dry_run_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-01\\promotion-cohort.json --dry-run",
  "recommended_real_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-01\\promotion-cohort.json --backup-out data\\audits\\pre-floor70-v4-promotion-20261006.db",
  "backup_path": "data\\audits\\expansion-wave100-20261009-01\\pre-promotion.db",
  "backup_sha256": "45F231873BC1608C15226C7C44A8C8C9DC1A72AE0DCEA1BFED73AC1685A8DF66",
  "backup_matches_pre_migration": true,
  "v4_research_records_imported": 95,
  "production_score_version_counts": {
    "NULL": 111,
    "public-v3-local-discovery-specialist-tristate": 237,
    "public-v4-quality-research-specialist-tristate": 1030
  },
  "current_production_v4_rows": 1030,
  "rows_remaining_non_v4": 348,
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
  "canonical_sha256_after": "C64F53E68754F892FBD7DD9AB697E665D41FE43A24E6E06C7FE70F8B61D7B02C",
  "source_shadow_unchanged": false
}
```
