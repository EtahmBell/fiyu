# Floor-70 Quality-v4 cohort promotion dry run

## 1. Cohort identity

- Manifest IDs / unique IDs: **96 / 96**
- Canonical identities / shadow complete: **96 / 96**
- Sankei Sushi selected: **False**
- Below-floor rescue overlap: **0**

## 2. Source and canonical hashes

- Canonical before/after: `B07A570C115A60489B0C6002D6D150C4F450954AB9DE6686186FEA35E8055B13` / `B07A570C115A60489B0C6002D6D150C4F450954AB9DE6686186FEA35E8055B13`
- Shadow: `B07A570C115A60489B0C6002D6D150C4F450954AB9DE6686186FEA35E8055B13`
- Cohort manifest: `1AD87B22AE8B0EC7F4B5CAE24C8B67DB2C1102A7F707BA2A7DD86BDD8490A82C`

## 3. Version validation

Validated research/scorer/prompt versions and ±15 guardrail for **96** rows.

## 4. Shadow/canonical parity

- Exact matches / mismatches: **96 / 0**
- Maximum mismatch: **0.0**

## 5. Score delta distribution

`{"count": 96, "max": 3.75, "mean": 1.53, "median": 1.5, "min": 0.0, "p10": 0.46, "p90": 2.62}`

## 6. Expected history and research imports

- Selected / already promoted: **96 / 0**
- Research imports / score pointer changes: **0 / 96**
- Expected score-history additions: **192**

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
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\fiyu.db quality-v4-promote --source-db data\fiyu.db --cohort-manifest data\audits\expansion-wave100-20261009-02\promotion-cohort.json --backup-out data\audits\pre-floor70-v4-promotion-20261006.db
```

## Full machine-readable summary

```json
{
  "dry_run": true,
  "selection_scope": "cohort_manifest",
  "cohort_manifest": "data\\audits\\expansion-wave100-20261009-02\\promotion-cohort.json",
  "cohort_name": "expansion-wave100-20261009-02 promotable Quality-v4 subset",
  "cohort_manifest_version": "deterministic-unseeded-cohort-1",
  "cohort_ids": 96,
  "unique_cohort_ids": 96,
  "source_complete_v4_rows": 96,
  "source_incomplete_rows": 0,
  "source_failed_rows": 0,
  "matched_canonical_identities": 96,
  "missing_canonical_identities": 0,
  "duplicate_or_conflicting_identities": 0,
  "already_v4_rows": 0,
  "already_promoted": 0,
  "selected_for_promotion": 96,
  "excluded_from_cohort": 0,
  "missing_from_cohort": 0,
  "unrelated_rows_selected": 0,
  "sankei_sushi_selected": false,
  "below_floor_rescue_overlap": 0,
  "rows_to_import": 0,
  "rows_to_score": 96,
  "expected_score_history_additions": 192,
  "expected_score_version_changes": 96,
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
    "count": 96,
    "min": 49.36,
    "p10": 64.32,
    "median": 70.1,
    "mean": 69.65,
    "p90": 75.65,
    "max": 79.63
  },
  "stored_v3_pointer_distribution_before": {
    "count": 96,
    "min": 49.36,
    "p10": 64.32,
    "median": 70.1,
    "mean": 69.65,
    "p90": 75.65,
    "max": 79.63
  },
  "canonical_v3_distribution": {
    "count": 96,
    "min": 49.36,
    "p10": 64.32,
    "median": 70.1,
    "mean": 69.65,
    "p90": 75.65,
    "max": 79.63
  },
  "v4_score_distribution_after": {
    "count": 96,
    "min": 49.99,
    "p10": 65.97,
    "median": 71.45,
    "mean": 71.18,
    "p90": 77.22,
    "max": 80.57
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 96,
    "min": 0.0,
    "p10": 0.46,
    "median": 1.5,
    "mean": 1.53,
    "p90": 2.62,
    "max": 3.75
  },
  "shadow_v4_delta_distribution": {
    "count": 96,
    "min": 0.0,
    "p10": 0.46,
    "median": 1.5,
    "mean": 1.53,
    "p90": 2.62,
    "max": 3.75
  },
  "documented_stored_v3_pointer_mismatches": 0,
  "stored_pointer_decreases": 0,
  "positive_adjustment_stored_pointer_decreases": 0,
  "zero_adjustment_stored_pointer_differences": 0,
  "quality_adjustment_distribution": {
    "count": 96,
    "min": 0.0,
    "p10": 1.48,
    "median": 3.52,
    "mean": 3.51,
    "p90": 5.83,
    "max": 8.33
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 6,
    "+0.5 to +0.99": 2,
    "+1 to +2.99": 26,
    "+3 to +4.99": 45,
    "+5 to +7.99": 16,
    "+8 to +11.99": 1,
    ">= +12": 0
  },
  "large_adjustments_ge_8": 1,
  "large_adjustments_ge_12": 0,
  "large_adjustment_rows": [
    {
      "place_id": "ChIJK7KIVESNGGARNmX8zJd7DWU",
      "restaurant": "Kateisaien Sasaki",
      "adjustment": 8.33,
      "production_v4_score": 77.18
    }
  ],
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 96,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1478,
  "canonical_sha256_before": "B07A570C115A60489B0C6002D6D150C4F450954AB9DE6686186FEA35E8055B13",
  "source_shadow_sha256": "B07A570C115A60489B0C6002D6D150C4F450954AB9DE6686186FEA35E8055B13",
  "canonical_integrity_before": "ok",
  "source_integrity_before": "ok",
  "external_requests": 0,
  "publication_threshold_before": 75.0,
  "publication_threshold_after": 75.0,
  "published_count_before": 962,
  "published_count_after": 962,
  "cohort_manifest_sha256": "1AD87B22AE8B0EC7F4B5CAE24C8B67DB2C1102A7F707BA2A7DD86BDD8490A82C",
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJ-4iHS6mSGGARlvYL9lTD6DA",
      "restaurant": "Kanō",
      "previous_v3_score": 78.81,
      "base_quality": 60.59,
      "quality_adjustment": 0.0,
      "researched_quality": 60.59,
      "production_v4_score": 78.81,
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
      "place_id": "ChIJ8zKOv8OIGGARL0VJWSFTKHc",
      "restaurant": "Yofu Dining Ciel",
      "previous_v3_score": 68.04,
      "base_quality": 45.61,
      "quality_adjustment": 2.85,
      "researched_quality": 48.46,
      "production_v4_score": 69.32,
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
      "place_id": "ChIJ1aUBhaiOGGARkc58Hc2d5p0",
      "restaurant": "Budoya Hanare Nikai",
      "previous_v3_score": 66.96,
      "base_quality": 57.16,
      "quality_adjustment": 3.35,
      "researched_quality": 60.51,
      "production_v4_score": 68.46,
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
      "place_id": "ChIJ0T3WaFWLGGAR0j7hB53mKNg",
      "restaurant": "Amami Ryukyu Izakaya Tsuchihama Shoten",
      "previous_v3_score": 66.62,
      "base_quality": 47.14,
      "quality_adjustment": 5.17,
      "researched_quality": 52.31,
      "production_v4_score": 68.95,
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
      "place_id": "ChIJK7KIVESNGGARNmX8zJd7DWU",
      "restaurant": "Kateisaien Sasaki",
      "previous_v3_score": 73.43,
      "base_quality": 59.7,
      "quality_adjustment": 8.33,
      "researched_quality": 68.03,
      "production_v4_score": 77.18,
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
  "recommended_dry_run_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-02\\promotion-cohort.json --dry-run",
  "recommended_real_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-02\\promotion-cohort.json --backup-out data\\audits\\pre-floor70-v4-promotion-20261006.db",
  "canonical_sha256_after": "B07A570C115A60489B0C6002D6D150C4F450954AB9DE6686186FEA35E8055B13",
  "canonical_unchanged": true,
  "source_shadow_unchanged": true,
  "publication_state_changes": 0,
  "threshold_changes": 0,
  "unrelated_rows_changed": 0
}
```
