# Floor-70 Quality-v4 cohort promotion dry run

## 1. Cohort identity

- Manifest IDs / unique IDs: **95 / 95**
- Canonical identities / shadow complete: **95 / 95**
- Sankei Sushi selected: **False**
- Below-floor rescue overlap: **0**

## 2. Source and canonical hashes

- Canonical before/after: `DD2F1649E42027563E6B0005051E378CF8837F1F0F55C98A6226090736C70E08` / `DD2F1649E42027563E6B0005051E378CF8837F1F0F55C98A6226090736C70E08`
- Shadow: `DD2F1649E42027563E6B0005051E378CF8837F1F0F55C98A6226090736C70E08`
- Cohort manifest: `6FDBDB7FB3C03AF7F43C2FF2C9CEC8E0892362D48A43A61438E3C16E3DADFF15`

## 3. Version validation

Validated research/scorer/prompt versions and ±15 guardrail for **95** rows.

## 4. Shadow/canonical parity

- Exact matches / mismatches: **95 / 0**
- Maximum mismatch: **0.0**

## 5. Score delta distribution

`{"count": 95, "max": 3.530000000000001, "mean": 1.43, "median": 1.47, "min": 0.0, "p10": 0.16, "p90": 2.34}`

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
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\fiyu.db quality-v4-promote --source-db data\fiyu.db --cohort-manifest data\audits\expansion-wave100-20261009-03\promotion-cohort.json --backup-out data\audits\pre-floor70-v4-promotion-20261006.db
```

## Full machine-readable summary

```json
{
  "dry_run": true,
  "selection_scope": "cohort_manifest",
  "cohort_manifest": "data\\audits\\expansion-wave100-20261009-03\\promotion-cohort.json",
  "cohort_name": "expansion-wave100-20261009-03 promotable Quality-v4 subset",
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
    "min": 54.99,
    "p10": 63.15,
    "median": 70.07,
    "mean": 70.11,
    "p90": 77.0,
    "max": 82.05
  },
  "stored_v3_pointer_distribution_before": {
    "count": 95,
    "min": 54.99,
    "p10": 63.15,
    "median": 70.07,
    "mean": 70.11,
    "p90": 77.0,
    "max": 82.05
  },
  "canonical_v3_distribution": {
    "count": 95,
    "min": 49.62,
    "p10": 63.15,
    "median": 70.07,
    "mean": 69.99,
    "p90": 77.0,
    "max": 82.05
  },
  "v4_score_distribution_after": {
    "count": 95,
    "min": 51.65,
    "p10": 64.48,
    "median": 71.71,
    "mean": 71.43,
    "p90": 78.74,
    "max": 82.35
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 95,
    "min": -8.82,
    "p10": 0.09,
    "median": 1.46,
    "mean": 1.32,
    "p90": 2.34,
    "max": 3.530000000000001
  },
  "shadow_v4_delta_distribution": {
    "count": 95,
    "min": 0.0,
    "p10": 0.16,
    "median": 1.47,
    "mean": 1.43,
    "p90": 2.34,
    "max": 3.530000000000001
  },
  "documented_stored_v3_pointer_mismatches": 1,
  "stored_pointer_decreases": 1,
  "positive_adjustment_stored_pointer_decreases": 1,
  "zero_adjustment_stored_pointer_differences": 0,
  "quality_adjustment_distribution": {
    "count": 95,
    "min": 0.0,
    "p10": 1.06,
    "median": 3.32,
    "mean": 3.31,
    "p90": 5.26,
    "max": 7.85
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 8,
    "+0.5 to +0.99": 2,
    "+1 to +2.99": 30,
    "+3 to +4.99": 39,
    "+5 to +7.99": 16,
    "+8 to +11.99": 0,
    ">= +12": 0
  },
  "large_adjustments_ge_8": 0,
  "large_adjustments_ge_12": 0,
  "large_adjustment_rows": [],
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 95,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1578,
  "canonical_sha256_before": "DD2F1649E42027563E6B0005051E378CF8837F1F0F55C98A6226090736C70E08",
  "source_shadow_sha256": "DD2F1649E42027563E6B0005051E378CF8837F1F0F55C98A6226090736C70E08",
  "canonical_integrity_before": "ok",
  "source_integrity_before": "ok",
  "external_requests": 0,
  "publication_threshold_before": 75.0,
  "publication_threshold_after": 75.0,
  "published_count_before": 1021,
  "published_count_after": 1021,
  "cohort_manifest_sha256": "6FDBDB7FB3C03AF7F43C2FF2C9CEC8E0892362D48A43A61438E3C16E3DADFF15",
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJ8d81bn6PGGARdjY4aA6rWQ4",
      "restaurant": "Tachinomiya Kokoro",
      "previous_v3_score": 71.84,
      "base_quality": 59.75,
      "quality_adjustment": 0.0,
      "researched_quality": 59.75,
      "production_v4_score": 71.84,
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
      "place_id": "ChIJ-4KcYgDtGGARAi7sB6WKtZM",
      "restaurant": "TAKUMI Nerima",
      "previous_v3_score": 70.19,
      "base_quality": 85.85,
      "quality_adjustment": 2.1,
      "researched_quality": 87.95,
      "production_v4_score": 71.14,
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
      "place_id": "ChIJ02NwSUlhGGARu11CV8Hadwg",
      "restaurant": "Yakitori Sawa",
      "previous_v3_score": 73.2,
      "base_quality": 65.52,
      "quality_adjustment": 4.74,
      "researched_quality": 70.26,
      "production_v4_score": 75.33,
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
      "place_id": "ChIJ44jrSf9gGGAR3HERq-mAJWg",
      "restaurant": "Tomi Zushi",
      "previous_v3_score": 69.96,
      "base_quality": 72.76,
      "quality_adjustment": 5.35,
      "researched_quality": 78.11,
      "production_v4_score": 72.37,
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
  "recommended_dry_run_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-03\\promotion-cohort.json --dry-run",
  "recommended_real_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-wave100-20261009-03\\promotion-cohort.json --backup-out data\\audits\\pre-floor70-v4-promotion-20261006.db",
  "canonical_sha256_after": "DD2F1649E42027563E6B0005051E378CF8837F1F0F55C98A6226090736C70E08",
  "canonical_unchanged": true,
  "source_shadow_unchanged": true,
  "publication_state_changes": 0,
  "threshold_changes": 0,
  "unrelated_rows_changed": 0
}
```
