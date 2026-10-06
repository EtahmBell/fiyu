# Quality-v4 production promotion

This migration changes current score values/version only. Publication and catalog membership are frozen.

```json
{
  "dry_run": true,
  "source_complete_v4_rows": 548,
  "source_incomplete_rows": 1,
  "source_failed_rows": 1,
  "matched_canonical_identities": 549,
  "missing_canonical_identities": 0,
  "duplicate_or_conflicting_identities": 0,
  "already_v4_rows": 0,
  "rows_to_import": 548,
  "rows_to_score": 548,
  "expected_score_version_changes": 548,
  "expected_publication_state_changes": 0,
  "production_score_version": "public-v4-quality-research",
  "source_shadow_score_version": "quality-v4-shadow-1",
  "publication_score_threshold": 75.0,
  "failed_or_incomplete_rows": [
    {
      "place_id": "ChIJi79LD-yIGGAR_8wLG2_pyYE",
      "restaurant": "Sankei Sushi",
      "current_score": 82.82,
      "current_score_version": "public-v3-local-discovery",
      "is_published": true,
      "product_eligible": true,
      "review_status": "auto_published",
      "status": "failed",
      "error_category": "validation_or_processing_failure",
      "error": "ValidationError: 1 validation error for ChallengeResearchResult\n  Invalid JSON: EOF while parsing a string at line 1 column 6113 [type=json_invalid, input_value='{\"evidence_level\":\"moder...n problem was found.】', input_type=str]\n    For further information visit https://errors.pydantic.dev/2.13/v/json_invalid"
    }
  ],
  "stored_v3_pointer_distribution_before": {
    "count": 548,
    "min": 61.19,
    "p10": 75.54,
    "median": 78.56,
    "mean": 78.92,
    "p90": 83.11,
    "max": 88.39
  },
  "canonical_v3_distribution": {
    "count": 548,
    "min": 61.19,
    "p10": 75.52,
    "median": 78.72,
    "mean": 78.93,
    "p90": 82.88,
    "max": 90.2
  },
  "v4_score_distribution_after": {
    "count": 548,
    "min": 61.72,
    "p10": 76.84,
    "median": 80.13,
    "mean": 80.41,
    "p90": 84.49,
    "max": 90.5
  },
  "stored_pointer_to_v4_delta_distribution": {
    "count": 548,
    "min": -5.5,
    "p10": 0.0,
    "median": 1.47,
    "mean": 1.49,
    "p90": 2.9,
    "max": 9.719999999999999
  },
  "shadow_v4_delta_distribution": {
    "count": 548,
    "min": 0.0,
    "p10": 0.0,
    "median": 1.46,
    "mean": 1.48,
    "p90": 2.67,
    "max": 4.280000000000001
  },
  "documented_stored_v3_pointer_mismatches": 62,
  "stored_pointer_decreases": 22,
  "positive_adjustment_stored_pointer_decreases": 21,
  "zero_adjustment_stored_pointer_differences": 4,
  "quality_adjustment_distribution": {
    "count": 548,
    "min": 0.0,
    "p10": 0.62,
    "median": 3.31,
    "mean": 3.42,
    "p90": 5.99,
    "max": 9.51
  },
  "large_adjustments_ge_8": 9,
  "large_adjustments_ge_12": 0,
  "guardrail_interventions": 0,
  "shadow_production_exact_matches": 548,
  "shadow_production_mismatches": 0,
  "maximum_shadow_production_mismatch": 0.0,
  "directional_violations": 0,
  "total_canonical_restaurants": 1203,
  "canonical_sha256_before": "FC729041B200A7B1C640096224D1DEA7724B4C2D06742932CF177F9F55ED1685",
  "source_shadow_sha256": "01E2A1237552ABE901E7BDA3B168DAC184E76FD1639886CC59DE6DC354A869AF",
  "canonical_integrity_before": "ok",
  "external_requests": 0,
  "representative_rows": [
    {
      "sample": "zero",
      "place_id": "ChIJ15vg2a6TGGARew0EyIzG6_8",
      "restaurant": "Karaoke Snack Utaiba Rumi",
      "previous_v3_score": 83.52,
      "base_quality": 80.41,
      "quality_adjustment": 0.0,
      "researched_quality": 80.41,
      "production_v4_score": 83.52,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        true,
        true
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": "+1_to_+3",
      "place_id": "ChIJ-3fBBQCNGGARgXH3cOoZYgI",
      "restaurant": "Restaurant Plumeria",
      "previous_v3_score": 75.45,
      "base_quality": 59.21,
      "quality_adjustment": 1.1,
      "researched_quality": 60.31,
      "production_v4_score": 75.94,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        true,
        true
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": "+3_to_+5",
      "place_id": "ChIJ--kHzR31GGARGv1b_Dizn2E",
      "restaurant": "French Cuisine H (Furansu Ryori Asshu)",
      "previous_v3_score": 79.21,
      "base_quality": 83.14,
      "quality_adjustment": 4.42,
      "researched_quality": 87.56,
      "production_v4_score": 81.2,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        true,
        true
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": "+5_to_+8",
      "place_id": "ChIJ-XSXyk6JGGARHAeiIYgz2Uw",
      "restaurant": "Shunsaiya Toriyu",
      "previous_v3_score": 81.21,
      "base_quality": 67.72,
      "quality_adjustment": 7.58,
      "researched_quality": 75.3,
      "production_v4_score": 84.62,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        true,
        true
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": ">=+8",
      "place_id": "ChIJ7aW3h6zzGGARY4F_qs8cBaM",
      "restaurant": "Buncho",
      "previous_v3_score": 75.72,
      "base_quality": 64.5,
      "quality_adjustment": 8.07,
      "researched_quality": 72.57,
      "production_v4_score": 79.35,
      "score_version": "public-v4-quality-research",
      "is_published_before_after": [
        true,
        true
      ],
      "product_eligible_before_after": [
        true,
        true
      ]
    },
    {
      "sample": "unpublished",
      "place_id": "ChIJAQAx9lbtGGARjIpf3KuKD8A",
      "restaurant": "Omura",
      "previous_v3_score": 69.98,
      "base_quality": 52.14,
      "quality_adjustment": 3.87,
      "researched_quality": 56.01,
      "production_v4_score": 71.72,
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
  "canonical_sha256_after": "FC729041B200A7B1C640096224D1DEA7724B4C2D06742932CF177F9F55ED1685",
  "canonical_unchanged": true
}
```
