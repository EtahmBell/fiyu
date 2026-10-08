# Floor-70 Quality-v4 cohort promotion dry run

## 1. Cohort identity

- Manifest IDs / unique IDs: **25 / 25**
- Canonical identities / shadow complete: **25 / 25**
- Sankei Sushi selected: **False**
- Below-floor rescue overlap: **0**

## 2. Source and canonical hashes

- Canonical before/after: `28D35B6B61F71E6909A8FDE8DE21439B1D1AE03D500CBA91E80FDD15235E5359` / `28D35B6B61F71E6909A8FDE8DE21439B1D1AE03D500CBA91E80FDD15235E5359`
- Shadow: `28D35B6B61F71E6909A8FDE8DE21439B1D1AE03D500CBA91E80FDD15235E5359`
- Cohort manifest: `4AE2C9A7E2E4FD3B2C810C584789402A64BF91A1F822914FF74083AA64290E17`

## 3. Version validation

Validated research/scorer/prompt versions and ±15 guardrail for **25** rows.

## 4. Shadow/canonical parity

- Exact matches / mismatches: **25 / 0**
- Maximum mismatch: **0.0**

## 5. Score delta distribution

`{"count": 25, "max": 3.3299999999999983, "mean": 1.4, "median": 1.36, "min": 0.0, "p10": 0.2, "p90": 2.57}`

## 6. Expected history and research imports

- Selected / already promoted: **25 / 0**
- Research imports / score pointer changes: **0 / 25**
- Expected score-history additions: **50**

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
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\fiyu.db quality-v4-promote --source-db data\fiyu.db --cohort-manifest data\audits\expansion-smoke25-cohort.json --backup-out data\audits\pre-floor70-v4-promotion-20261006.db
```

## Full machine-readable summary

```json
{
  "dry_run": true,
  "selection_scope": "cohort_manifest",
  "cohort_manifest": "data/audits/expansion-smoke25-cohort.json",
  "cohort_name": null,
  "cohort_manifest_version": "deterministic-unseeded-cohort-1",
  "cohort_ids": 25,
  "unique_cohort_ids": 25,
  "source_complete_v4_rows": 25,
  "source_incomplete_rows": 0,
  "source_failed_rows": 0,
  "matched_canonical_identities": 25,
  "missing_canonical_identities": 0,
  "duplicate_or_conflicting_identities": 0,
  "already_v4_rows": 0,
  "already_promoted": 0,
  "selected_for_promotion": 25,
  "excluded_from_cohort": 0,
  "missing_from_cohort": 0,
  "unrelated_rows_selected": 0,
  "sankei_sushi_selected": false,
  "below_floor_rescue_overlap": 0,
  "rows_to_import": 0,
  "rows_to_score": 25,
  "expected_score_history_additions": 50,
  "expected_score_version_changes": 25,
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
    "count": 25,
    "min": 49.99,
    "p10": 63.06,
    "median": 71.07,
    "mean": 70.43,
    "p90": 77.45,
    "max": 81.25
  },
  "stored_v3_pointer_distribution_before": {
    "count": 25,
    "min": 49.99,
    "p10": 63.06,
    "median": 71.07,
    "mean": 70.43,
    "p90": 77.45,
    "max": 81.25
  },
  "canonical_v3_distribution": {
    "count": 25,
    "min": 49.99,
    "p10": 63.06,
    "median": 71.07,
    "mean": 70.43,
    "p90": 77.45,
    "max": 81.25
  },
  "v4_score_distribution_after": {
    "count": 25,
    "min": 49.99,
    "p10": 65.88,
    "median": 72.35,
    "mean": 71.83,
    "p90": 78.03,
    "max": 81.97
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 25,
    "min": 0.0,
    "p10": 0.2,
    "median": 1.36,
    "mean": 1.4,
    "p90": 2.57,
    "max": 3.3299999999999983
  },
  "shadow_v4_delta_distribution": {
    "count": 25,
    "min": 0.0,
    "p10": 0.2,
    "median": 1.36,
    "mean": 1.4,
    "p90": 2.57,
    "max": 3.3299999999999983
  },
  "documented_stored_v3_pointer_mismatches": 0,
  "stored_pointer_decreases": 0,
  "positive_adjustment_stored_pointer_decreases": 0,
  "zero_adjustment_stored_pointer_differences": 0,
  "quality_adjustment_distribution": {
    "count": 25,
    "min": 0.0,
    "p10": 0.43,
    "median": 3.02,
    "mean": 3.1,
    "p90": 5.72,
    "max": 7.39
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 3,
    "+0.5 to +0.99": 0,
    "+1 to +2.99": 9,
    "+3 to +4.99": 9,
    "+5 to +7.99": 4,
    "+8 to +11.99": 0,
    ">= +12": 0
  },
  "large_adjustments_ge_8": 0,
  "large_adjustments_ge_12": 0,
  "large_adjustment_rows": [],
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 25,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1228,
  "canonical_sha256_before": "28D35B6B61F71E6909A8FDE8DE21439B1D1AE03D500CBA91E80FDD15235E5359",
  "source_shadow_sha256": "28D35B6B61F71E6909A8FDE8DE21439B1D1AE03D500CBA91E80FDD15235E5359",
  "canonical_integrity_before": "ok",
  "source_integrity_before": "ok",
  "external_requests": 0,
  "publication_threshold_before": 75.0,
  "publication_threshold_after": 75.0,
  "published_count_before": 851,
  "published_count_after": 851,
  "cohort_manifest_sha256": "4AE2C9A7E2E4FD3B2C810C584789402A64BF91A1F822914FF74083AA64290E17",
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJJ1GtVLaTGGARn6LJLJYadg0",
      "restaurant": "Ajidokoro Nomidokoro Gen",
      "previous_v3_score": 74.64,
      "base_quality": 55.96,
      "quality_adjustment": 0.0,
      "researched_quality": 55.96,
      "production_v4_score": 74.64,
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
      "place_id": "ChIJ1UN6JAZhGGARTK85OJ7Cuto",
      "restaurant": "Royal Kitchen",
      "previous_v3_score": 65.64,
      "base_quality": 59.33,
      "quality_adjustment": 2.99,
      "researched_quality": 62.32,
      "production_v4_score": 66.98,
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
      "place_id": "ChIJ1dE11KWLGGARgLMLmvirJjQ",
      "restaurant": "Teppanyaki Acalli",
      "previous_v3_score": 74.73,
      "base_quality": 67.7,
      "quality_adjustment": 3.02,
      "researched_quality": 70.72,
      "production_v4_score": 76.09,
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
      "place_id": "ChIJ6T1gnYruGGAREbmIYHZ4-Z0",
      "restaurant": "Yotteke Sakaba",
      "previous_v3_score": 65.04,
      "base_quality": 52.53,
      "quality_adjustment": 5.95,
      "researched_quality": 58.48,
      "production_v4_score": 67.71,
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
  "recommended_dry_run_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-smoke25-cohort.json --dry-run",
  "recommended_real_command": ".\\.venv\\Scripts\\python.exe -m fiyu.pipeline_cli --db data\\fiyu.db quality-v4-promote --source-db data\\fiyu.db --cohort-manifest data\\audits\\expansion-smoke25-cohort.json --backup-out data\\audits\\pre-floor70-v4-promotion-20261006.db",
  "canonical_sha256_after": "28D35B6B61F71E6909A8FDE8DE21439B1D1AE03D500CBA91E80FDD15235E5359",
  "canonical_unchanged": true,
  "source_shadow_unchanged": true,
  "publication_state_changes": 0,
  "threshold_changes": 0,
  "unrelated_rows_changed": 0
}
```
