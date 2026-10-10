# Floor-70 Quality-v4 cohort promotion

## 1. Cohort identity

- Manifest IDs / unique IDs: **96 / 96**
- Canonical identities / shadow complete: **96 / 96**
- Sankei Sushi selected: **False**
- Below-floor rescue overlap: **0**

## 2. Source and canonical hashes

- Canonical before/after: `D4BA3A942484405113E87BA20C5FDB0D65C8DB9A5B031FA0E503D74031E9E265` / `0448739A5BC2176910756B4C491986FD6CE2027B9E9CD9B3E47E8AEDC008114A`
- Shadow: `D4BA3A942484405113E87BA20C5FDB0D65C8DB9A5B031FA0E503D74031E9E265`
- Cohort manifest: `3602674752447465981FBE20F01008FE6C0EF1B7A7CA3BE6C58610CD28886C5F`

## 3. Version validation

Validated research/scorer/prompt versions and ±15 guardrail for **96** rows.

## 4. Shadow/canonical parity

- Exact matches / mismatches: **96 / 0**
- Maximum mismatch: **0.0**

## 5. Score delta distribution

`{"count": 96, "max": 3.6700000000000017, "mean": 1.41, "median": 1.4, "min": 0.0, "p10": 0.04, "p90": 2.69}`

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
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\fiyu.db quality-v4-promote --source-db data\fiyu.db --cohort-manifest data\audits\expansion-wave100-20261010-07\promotion-cohort.json --backup-out data\audits\pre-floor70-v4-promotion-20261006.db
```

## Full machine-readable summary

```json
{
  "dry_run": false,
  "selection_scope": "cohort_manifest",
  "cohort_manifest": "data\\audits\\expansion-wave100-20261010-07\\promotion-cohort.json",
  "cohort_name": "expansion-wave100-20261010-07 promotable Quality-v4 subset",
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
    "min": 54.99,
    "p10": 64.41,
    "median": 70.72,
    "mean": 70.4,
    "p90": 76.08,
    "max": 81.93
  },
  "stored_v3_pointer_distribution_before": {
    "count": 96,
    "min": 54.99,
    "p10": 64.41,
    "median": 70.72,
    "mean": 70.4,
    "p90": 76.08,
    "max": 81.93
  },
  "canonical_v3_distribution": {
    "count": 96,
    "min": 54.99,
    "p10": 63.89,
    "median": 70.72,
    "mean": 70.27,
    "p90": 76.08,
    "max": 81.93
  },
  "v4_score_distribution_after": {
    "count": 96,
    "min": 54.99,
    "p10": 65.75,
    "median": 71.92,
    "mean": 71.68,
    "p90": 77.02,
    "max": 83.13
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 96,
    "min": -12.169999999999995,
    "p10": 0.04,
    "median": 1.4,
    "mean": 1.28,
    "p90": 2.69,
    "max": 3.6700000000000017
  },
  "shadow_v4_delta_distribution": {
    "count": 96,
    "min": 0.0,
    "p10": 0.04,
    "median": 1.4,
    "mean": 1.41,
    "p90": 2.69,
    "max": 3.6700000000000017
  },
  "documented_stored_v3_pointer_mismatches": 1,
  "stored_pointer_decreases": 1,
  "positive_adjustment_stored_pointer_decreases": 1,
  "zero_adjustment_stored_pointer_differences": 0,
  "quality_adjustment_distribution": {
    "count": 96,
    "min": 0.0,
    "p10": 0.6,
    "median": 3.2,
    "mean": 3.33,
    "p90": 6.03,
    "max": 8.14
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 10,
    "+0.5 to +0.99": 1,
    "+1 to +2.99": 32,
    "+3 to +4.99": 33,
    "+5 to +7.99": 19,
    "+8 to +11.99": 1,
    ">= +12": 0
  },
  "large_adjustments_ge_8": 1,
  "large_adjustments_ge_12": 0,
  "large_adjustment_rows": [
    {
      "place_id": "ChIJTRZHpK6NGGARmgonqzS-92Q",
      "restaurant": "Koshita",
      "adjustment": 8.14,
      "production_v4_score": 76.84
    }
  ],
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 96,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1978,
  "canonical_sha256_before": "D4BA3A942484405113E87BA20C5FDB0D65C8DB9A5B031FA0E503D74031E9E265",
  "source_shadow_sha256": "D4BA3A942484405113E87BA20C5FDB0D65C8DB9A5B031FA0E503D74031E9E265",
  "canonical_integrity_before": "ok",
  "source_integrity_before": "ok",
  "external_requests": 0,
  "publication_threshold_before": 75.0,
  "publication_threshold_after": 75.0,
  "published_count_before": 1274,
  "published_count_after": 1274,
  "cohort_manifest_sha256": "3602674752447465981FBE20F01008FE6C0EF1B7A7CA3BE6C58610CD28886C5F",
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJ6SSIXxGNGGARmUqGbfgm2Jc",
      "restaurant": "Mild",
      "previous_v3_score": 76.55,
      "base_quality": 68.92,
      "quality_adjustment": 0.0,
      "researched_quality": 68.92,
      "production_v4_score": 76.55,
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
      "place_id": "ChIJ-WPWJriOGGARUeetJ_JS6v0",
      "restaurant": "Takao",
      "previous_v3_score": 66.54,
      "base_quality": 44.49,
      "quality_adjustment": 2.97,
      "researched_quality": 47.46,
      "production_v4_score": 67.88,
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
      "place_id": "ChIJ5TQzWb2OGGARuFmCle_M0E0",
      "restaurant": "Indian Restaurant & Bar SITAL",
      "previous_v3_score": 62.63,
      "base_quality": 51.3,
      "quality_adjustment": 3.53,
      "researched_quality": 54.83,
      "production_v4_score": 64.22,
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
      "place_id": "ChIJ1VLTCXFhGGARy8bCsfoih8c",
      "restaurant": "Okonomiyaki Tatsumi",
      "previous_v3_score": 80.29,
      "base_quality": 100.0,
      "quality_adjustment": 6.23,
      "researched_quality": 100.0,
      "production_v4_score": 80.29,
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
      "place_id": "ChIJTRZHpK6NGGARmgonqzS-92Q",
      "restaurant": "Koshita",
      "previous_v3_score": 73.17,
      "base_quality": 64.92,
      "quality_adjustment": 8.14,
      "researched_quality": 73.06,
      "production_v4_score": 76.84,
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
  "recommended_dry_run_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261010-07\\promotion-cohort.json --dry-run",
  "recommended_real_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261010-07\\promotion-cohort.json --backup-out data\\audits\\pre-floor70-v4-promotion-20261006.db",
  "backup_path": "data\\audits\\expansion-wave100-20261010-07\\pre-promotion.db",
  "backup_sha256": "D4BA3A942484405113E87BA20C5FDB0D65C8DB9A5B031FA0E503D74031E9E265",
  "backup_matches_pre_migration": true,
  "v4_research_records_imported": 96,
  "production_score_version_counts": {
    "NULL": 111,
    "public-v3-local-discovery-specialist-tristate": 260,
    "public-v4-quality-research-specialist-tristate": 1607
  },
  "current_production_v4_rows": 1607,
  "rows_remaining_non_v4": 371,
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
  "canonical_sha256_after": "0448739A5BC2176910756B4C491986FD6CE2027B9E9CD9B3E47E8AEDC008114A",
  "source_shadow_unchanged": false
}
```
