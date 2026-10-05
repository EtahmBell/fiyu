# Quality-v4 challenge-set report

Experimental only; no production state was changed.

## Executive finding

Stage 1 passed, but Stage 2 did not demonstrate a production-ready researched-Quality 
update. Extraction found positive food evidence readily, preserved exact neutrality 
when it found no evidence, and did not penalize sparse restaurants. It did not reliably 
find or consolidate negative evidence: 387 qualifying positive observations versus 16 
negative observations, only 4 of 25 mixed rows contained both polarities, and every net 
adjustment was non-negative. Twenty-three of 25 nominal negative challenge rows were 
boosted, although 24 of those labels were low-confidence because the stored catalog lacks 
a robust negative corpus.

Recommendation: do not promote this experiment to production v4. Retain the evidence 
schema, build a verified negative/mixed benchmark, normalize semantically equivalent 
claims before corroboration, and rerun. If a provisional safety limit were required, ±5 
is the only defensible hard cap from this sample; the intended healthy normal range 
remains roughly -3 to +3, with symmetric hard caps and nonlinear unlocks in principle.

## Run accounting

- Challenge set: 100 (25 each positive, mixed, negative, sparse); labels: 50 high, 1 medium, 49 low confidence.
- Requests: 100; completed: 98; failures: 2; needs retry: 0.
- Web-search actions: 244; tokens: 2,762,642 total.
- The two failures were schema-validation failures caused by an overly short `notes` maximum. They were deliberately not retried; the offline schema was corrected for future runs.

## Extraction and sparse safety

- Evidence levels among completed rows: {"moderate": 78, "strong": 3, "sparse": 4, "none": 13}.
- No-evidence rows: 13; all 13 remained exactly zero under every policy.
- Sparse controls near zero under ±20: 16/25 (64.0%).
- Sparse controls with a negative adjustment: 0; with a positive adjustment above +0.49: 9.
- Sparse movement came from explicit food-specific review/blog observations, not from no-site, low-review-count, Japanese language, or obscurity fields. A no-official-site restaurant can therefore remain neutral or move from actual evidence.
- The largest sparse adjustment was modest; ±20 caused no amplification because no broad/strong unlock reached large values.

## Human observation-precision audit

The audit covered 30 positive observations, all 16 negative observations, 20 observations 
from mixed rows, and 20 sparse restaurant cases. This checked extraction semantics and 
stored provenance; it was not a second external verification of every linked page.

- Most audited positive observations were genuinely food-focused and specific, especially preparation, texture, broth, ingredient sourcing, and signature dishes. Borderline cases remained: generic 'tasted good' language, culinary lineage, editorial interest, and evidence transferred from a related group/branch can be over-rated as Quality.
- Of 16 negative observations, several were specific execution or ingredient complaints, but La Cocina de Gastón and Semolina were vague, Gorio lacked the actual defect, and Taiyaki Isuzu described an equipment-maintenance incident rather than stable restaurant quality.
- Every isolated negative was correctly prevented from creating a negative value. However, Mario Tenshin had three independent, directionally similar ramen criticisms that failed to corroborate because the model emitted three different `underlying_claim_identity` values. Claim normalization is therefore too literal.
- Mixed extraction was weak: 4 rows had both positive and negative qualifying observations, 21 were positive-only, and none were negative-only. Absence statements tagged `mixed` were deterministically excluded and did not affect scores.
- No copied-source case created a large boost and no adjustment reached ±2, but provenance identities are still model-authored and need deterministic normalization/audit before production use.

## Source findings

- Japanese-language sources dominated (386/403 qualifying observations) and were useful for 11 of 25 sparse controls. This supports their practical importance, but not a causal language bonus.
- Local review platforms produced 185 observations (145 moderate/strong) and were the largest source of dish-level and recurring themes.
- Local food blogs produced 108 observations (92 moderate/strong) and were especially useful for technique, texture, and preparation detail.
- Editorial food media were rarer (22 observations) but 21 were moderate/strong; this is consistent with higher specificity, not proof of higher precision.
- Map-review platforms produced 33 observations (27 moderate/strong), useful for direct dish reports but rarely enough to establish consensus alone.
- Source/language counts describe qualifying model extractions, not independently verified source accuracy.

## Policy conclusion

- ±5: mean +0.788, median +0.815, max +1.89 Quality; 3 upward crossings at 70 and 2 at 75. No downward crossings.
- ±10: mean +0.799, median +0.840, max +1.89. The broader unlock changed little and produced the same threshold counts.
- ±15: identical to ±10 in this run; it added no useful correction.
- ±20: identical to ±15; zero cases reached |7| or |12|, so the dedicated large-movement review set was empty.
- The largest final Fiyu Score increase was +0.84 (Gorio under ±10/±15/±20). Production caps made some positive Quality changes produce zero final-score change, which is expected and monotonic.
- Rank correlations were 0.999 for all policies. Broader caps did not let materially stronger evidence matter; they were essentially inactive.

## Direct answers

1. Zero-adjustment parity is exact across the full researched catalog: yes.
2. The prior downward-crossing bug mixed freshly recomputed Quality with historical stored H/I/LD component columns, then recomposed outside the canonical evaluator.
3. Positive evidence detection: yes, readily, though some borderline evidence is over-classified.
4. Negative evidence detection: no, not reliably enough for a posterior update.
5. Genuinely mixed representation: schema yes; extraction no (only 4/25 mixed controls captured both polarities).
6. No evidence remains exactly neutral: yes, 13/13 rows.
7. Sparse restaurants are protected from missing-evidence penalties: yes in this run.
8. Obscurity is not directly rewarded as Quality; sparse positive movement was tied to extracted food evidence.
9. Isolated negative reviews are ignored for downward adjustment: yes.
10. Most useful families were craft/execution and food reputation/specialization; ingredient and consistency evidence was thinner.
11. Local review platforms and detailed local food blogs supplied the most usable volume; editorial sources were rarer but usually specific.
12. Japanese sources were particularly useful in coverage, including 11 sparse controls, but language itself must not score.
13. ±5 is not shown to be restrictive; the maximum observed movement was +1.89.
14. ±10 was not materially better.
15. ±15 added no useful correction.
16. ±20 enabled no justified correction suppressed by smaller policies.
17. ±20 produced no implausibly large changes because it never activated beyond +1.89.
18. A production hard cap is not validated. If forced provisionally, use symmetric ±5.
19. A healthy normal range still appears to be roughly -3 to +3, but this run only demonstrated 0 to +1.89.
20. Positive and negative hard caps should be symmetric in principle; negative corroboration may retain a slightly higher evidence threshold.
21. Strong evidence should unlock movement nonlinearly: yes, with deterministic, normalized corroboration gates.
22. Researched Quality is not sufficiently informative for production v4.
23. The exact remaining defect is positivity-biased retrieval/extraction plus overly literal cross-source claim identity, compounded by a weak negative/mixed benchmark.
24. Preserve the four-family observation schema, polarity/strength, food specificity, directness, source URL/type/language/date, document identity, provenance group, underlying claim identity, independent source key, evidence level, and separate confidence—but normalize/audit identities outside the model.
25. Production policy recommendation: none yet. Rerun after the defect above; ±5 is only a temporary safety ceiling, not a validated launch policy.

## Machine-readable summary

```json
{
  "experiment": "quality-v4-challenge",
  "sample_size": 100,
  "bucket_counts": {
    "positive": 25,
    "mixed": 25,
    "negative": 25,
    "sparse": 25
  },
  "label_confidence_counts": {
    "high": 50,
    "low": 49,
    "medium": 1
  },
  "label_limitations": "The catalog lacks a robust stored negative corpus. Negative/mixed supplements selected from the cheap prior or theme density are explicitly low-confidence.",
  "requests": 100,
  "completed": 98,
  "failures": 2,
  "needs_retry": 0,
  "web_search_actions": 244,
  "token_usage": {
    "input_tokens": 2599961,
    "output_tokens": 162681,
    "total_tokens": 2762642
  },
  "latency_seconds": {
    "mean": 20.217,
    "p90": 25.884
  },
  "evidence_levels": {
    "moderate": 78,
    "strong": 3,
    "sparse": 4,
    "none": 13
  },
  "positive_observations": 387,
  "negative_observations": 16,
  "mixed_rows_with_both_polarities": 4,
  "no_evidence_rows": 13,
  "no_evidence_all_policy_zero": 13,
  "source_types": {
    "local_review_platform": {
      "restaurants": 73,
      "restaurants_by_challenge_bucket": {
        "positive": 21,
        "mixed": 20,
        "negative": 23,
        "sparse": 9
      },
      "observations": 185,
      "positive": 177,
      "bucket_positive": 62,
      "moderate_or_strong": 145,
      "negative": 8,
      "bucket_mixed": 49,
      "bucket_negative": 48,
      "bucket_sparse": 26
    },
    "local_food_blog": {
      "restaurants": 53,
      "restaurants_by_challenge_bucket": {
        "positive": 14,
        "mixed": 15,
        "negative": 19,
        "sparse": 5
      },
      "observations": 108,
      "positive": 103,
      "bucket_positive": 25,
      "moderate_or_strong": 92,
      "bucket_mixed": 28,
      "negative": 5,
      "bucket_negative": 47,
      "bucket_sparse": 8
    },
    "official_restaurant": {
      "restaurants": 25,
      "restaurants_by_challenge_bucket": {
        "positive": 10,
        "mixed": 7,
        "negative": 6,
        "sparse": 2
      },
      "observations": 32,
      "positive": 32,
      "bucket_positive": 12,
      "moderate_or_strong": 17,
      "bucket_mixed": 9,
      "bucket_negative": 7,
      "bucket_sparse": 4
    },
    "editorial_food_media": {
      "restaurants": 16,
      "restaurants_by_challenge_bucket": {
        "positive": 5,
        "mixed": 5,
        "negative": 4,
        "sparse": 2
      },
      "observations": 22,
      "positive": 22,
      "bucket_positive": 6,
      "moderate_or_strong": 21,
      "bucket_mixed": 10,
      "bucket_negative": 4,
      "bucket_sparse": 2
    },
    "restaurant_guide": {
      "restaurants": 4,
      "restaurants_by_challenge_bucket": {
        "positive": 2,
        "mixed": 1,
        "negative": 1,
        "sparse": 0
      },
      "observations": 4,
      "positive": 4,
      "bucket_positive": 2,
      "moderate_or_strong": 2,
      "bucket_mixed": 1,
      "bucket_negative": 1
    },
    "map_review_platform": {
      "restaurants": 24,
      "restaurants_by_challenge_bucket": {
        "positive": 6,
        "mixed": 10,
        "negative": 7,
        "sparse": 1
      },
      "observations": 33,
      "positive": 31,
      "bucket_positive": 9,
      "moderate_or_strong": 27,
      "bucket_mixed": 14,
      "negative": 2,
      "bucket_negative": 7,
      "bucket_sparse": 3
    },
    "reservation_platform": {
      "restaurants": 5,
      "restaurants_by_challenge_bucket": {
        "positive": 2,
        "mixed": 2,
        "negative": 0,
        "sparse": 1
      },
      "observations": 7,
      "positive": 7,
      "bucket_positive": 4,
      "moderate_or_strong": 5,
      "bucket_mixed": 2,
      "bucket_sparse": 1
    },
    "newspaper_magazine": {
      "restaurants": 4,
      "restaurants_by_challenge_bucket": {
        "positive": 0,
        "mixed": 2,
        "negative": 2,
        "sparse": 0
      },
      "observations": 5,
      "positive": 5,
      "bucket_mixed": 2,
      "moderate_or_strong": 5,
      "bucket_negative": 3
    },
    "other": {
      "restaurants": 5,
      "restaurants_by_challenge_bucket": {
        "positive": 0,
        "mixed": 2,
        "negative": 1,
        "sparse": 2
      },
      "observations": 7,
      "positive": 6,
      "bucket_mixed": 2,
      "moderate_or_strong": 4,
      "bucket_negative": 1,
      "bucket_sparse": 4,
      "negative": 1
    }
  },
  "source_languages": {
    "Japanese": {
      "restaurants": 84,
      "restaurants_by_challenge_bucket": {
        "positive": 23,
        "mixed": 25,
        "negative": 25,
        "sparse": 11
      },
      "observations": 386,
      "positive": 372,
      "bucket_positive": 114,
      "moderate_or_strong": 304,
      "negative": 14,
      "bucket_mixed": 112,
      "bucket_negative": 116,
      "bucket_sparse": 44
    },
    "English": {
      "restaurants": 9,
      "restaurants_by_challenge_bucket": {
        "positive": 2,
        "mixed": 3,
        "negative": 2,
        "sparse": 2
      },
      "observations": 17,
      "positive": 15,
      "bucket_positive": 6,
      "moderate_or_strong": 14,
      "negative": 2,
      "bucket_mixed": 5,
      "bucket_negative": 2,
      "bucket_sparse": 4
    }
  },
  "quality_families": {
    "craft_execution": {
      "restaurants": 82,
      "restaurants_by_challenge_bucket": {
        "positive": 0,
        "mixed": 0,
        "negative": 0,
        "sparse": 0
      },
      "observations": 229,
      "positive": 217,
      "moderate_or_strong": 194,
      "negative": 12
    },
    "food_reputation_specialization": {
      "restaurants": 69,
      "restaurants_by_challenge_bucket": {
        "positive": 0,
        "mixed": 0,
        "negative": 0,
        "sparse": 0
      },
      "observations": 96,
      "positive": 96,
      "moderate_or_strong": 77
    },
    "ingredient_product_quality": {
      "restaurants": 48,
      "restaurants_by_challenge_bucket": {
        "positive": 0,
        "mixed": 0,
        "negative": 0,
        "sparse": 0
      },
      "observations": 56,
      "positive": 54,
      "moderate_or_strong": 36,
      "negative": 2
    },
    "consistency": {
      "restaurants": 22,
      "restaurants_by_challenge_bucket": {
        "positive": 0,
        "mixed": 0,
        "negative": 0,
        "sparse": 0
      },
      "observations": 22,
      "positive": 20,
      "moderate_or_strong": 11,
      "negative": 2
    }
  },
  "mixed_extraction": {
    "rows": 25,
    "both_positive_and_negative": 4,
    "positive_only": 21,
    "negative_only": 0,
    "neither": 0
  },
  "sparse_safety_policy_d_20": {
    "rows": 25,
    "near_zero": 16,
    "near_zero_percent": 64.0,
    "negative": 0,
    "positive": 9,
    "no_evidence": 13
  },
  "policies": {
    "policy_a_5": {
      "distribution": {
        "+0.5 to +1.99": 76,
        "-0.49 to +0.49": 22
      },
      "statistics": {
        "mean": 0.788,
        "median": 0.815,
        "p90_absolute": 1.316,
        "min": 0.0,
        "max": 1.89
      },
      "by_challenge_bucket": {
        "positive": {
          "negative": 0,
          "near_neutral": 1,
          "positive": 22,
          "mean": 0.982
        },
        "mixed": {
          "negative": 0,
          "near_neutral": 3,
          "positive": 22,
          "mean": 0.986
        },
        "negative": {
          "negative": 0,
          "near_neutral": 2,
          "positive": 23,
          "mean": 0.824
        },
        "sparse": {
          "negative": 0,
          "near_neutral": 16,
          "positive": 9,
          "mean": 0.375
        }
      },
      "rank_correlation_vs_v3": 0.999,
      "rank_change": {
        "mean_absolute": 0.888,
        "maximum_absolute": 4.5
      },
      "final_score_delta": {
        "mean": 0.346,
        "median": 0.36,
        "min": 0.0,
        "max": 0.74
      },
      "thresholds": {
        "68": {
          "v3_pass": 69,
          "experimental_pass": 69,
          "up": 0,
          "down": 0
        },
        "70": {
          "v3_pass": 56,
          "experimental_pass": 59,
          "up": 3,
          "down": 0
        },
        "75": {
          "v3_pass": 36,
          "experimental_pass": 38,
          "up": 2,
          "down": 0
        }
      },
      "wrong_direction_cases": {
        "negative_boosted": 23,
        "positive_downgraded": 0,
        "sparse_non_neutral": 9
      }
    },
    "policy_b_10": {
      "distribution": {
        "+0.5 to +1.99": 76,
        "-0.49 to +0.49": 22
      },
      "statistics": {
        "mean": 0.799,
        "median": 0.84,
        "p90_absolute": 1.316,
        "min": 0.0,
        "max": 1.89
      },
      "by_challenge_bucket": {
        "positive": {
          "negative": 0,
          "near_neutral": 1,
          "positive": 22,
          "mean": 0.982
        },
        "mixed": {
          "negative": 0,
          "near_neutral": 3,
          "positive": 22,
          "mean": 1.03
        },
        "negative": {
          "negative": 0,
          "near_neutral": 2,
          "positive": 23,
          "mean": 0.824
        },
        "sparse": {
          "negative": 0,
          "near_neutral": 16,
          "positive": 9,
          "mean": 0.375
        }
      },
      "rank_correlation_vs_v3": 0.999,
      "rank_change": {
        "mean_absolute": 0.888,
        "maximum_absolute": 4.0
      },
      "final_score_delta": {
        "mean": 0.351,
        "median": 0.375,
        "min": 0.0,
        "max": 0.84
      },
      "thresholds": {
        "68": {
          "v3_pass": 69,
          "experimental_pass": 69,
          "up": 0,
          "down": 0
        },
        "70": {
          "v3_pass": 56,
          "experimental_pass": 59,
          "up": 3,
          "down": 0
        },
        "75": {
          "v3_pass": 36,
          "experimental_pass": 38,
          "up": 2,
          "down": 0
        }
      },
      "wrong_direction_cases": {
        "negative_boosted": 23,
        "positive_downgraded": 0,
        "sparse_non_neutral": 9
      }
    },
    "policy_c_15": {
      "distribution": {
        "+0.5 to +1.99": 76,
        "-0.49 to +0.49": 22
      },
      "statistics": {
        "mean": 0.799,
        "median": 0.84,
        "p90_absolute": 1.316,
        "min": 0.0,
        "max": 1.89
      },
      "by_challenge_bucket": {
        "positive": {
          "negative": 0,
          "near_neutral": 1,
          "positive": 22,
          "mean": 0.982
        },
        "mixed": {
          "negative": 0,
          "near_neutral": 3,
          "positive": 22,
          "mean": 1.03
        },
        "negative": {
          "negative": 0,
          "near_neutral": 2,
          "positive": 23,
          "mean": 0.824
        },
        "sparse": {
          "negative": 0,
          "near_neutral": 16,
          "positive": 9,
          "mean": 0.375
        }
      },
      "rank_correlation_vs_v3": 0.999,
      "rank_change": {
        "mean_absolute": 0.888,
        "maximum_absolute": 4.0
      },
      "final_score_delta": {
        "mean": 0.351,
        "median": 0.375,
        "min": 0.0,
        "max": 0.84
      },
      "thresholds": {
        "68": {
          "v3_pass": 69,
          "experimental_pass": 69,
          "up": 0,
          "down": 0
        },
        "70": {
          "v3_pass": 56,
          "experimental_pass": 59,
          "up": 3,
          "down": 0
        },
        "75": {
          "v3_pass": 36,
          "experimental_pass": 38,
          "up": 2,
          "down": 0
        }
      },
      "wrong_direction_cases": {
        "negative_boosted": 23,
        "positive_downgraded": 0,
        "sparse_non_neutral": 9
      }
    },
    "policy_d_20": {
      "distribution": {
        "+0.5 to +1.99": 76,
        "-0.49 to +0.49": 22
      },
      "statistics": {
        "mean": 0.799,
        "median": 0.84,
        "p90_absolute": 1.316,
        "min": 0.0,
        "max": 1.89
      },
      "by_challenge_bucket": {
        "positive": {
          "negative": 0,
          "near_neutral": 1,
          "positive": 22,
          "mean": 0.982
        },
        "mixed": {
          "negative": 0,
          "near_neutral": 3,
          "positive": 22,
          "mean": 1.03
        },
        "negative": {
          "negative": 0,
          "near_neutral": 2,
          "positive": 23,
          "mean": 0.824
        },
        "sparse": {
          "negative": 0,
          "near_neutral": 16,
          "positive": 9,
          "mean": 0.375
        }
      },
      "rank_correlation_vs_v3": 0.999,
      "rank_change": {
        "mean_absolute": 0.888,
        "maximum_absolute": 4.0
      },
      "final_score_delta": {
        "mean": 0.351,
        "median": 0.375,
        "min": 0.0,
        "max": 0.84
      },
      "thresholds": {
        "68": {
          "v3_pass": 69,
          "experimental_pass": 69,
          "up": 0,
          "down": 0
        },
        "70": {
          "v3_pass": 56,
          "experimental_pass": 59,
          "up": 3,
          "down": 0
        },
        "75": {
          "v3_pass": 36,
          "experimental_pass": 38,
          "up": 2,
          "down": 0
        }
      },
      "wrong_direction_cases": {
        "negative_boosted": 23,
        "positive_downgraded": 0,
        "sparse_non_neutral": 9
      }
    }
  },
  "policy_d_20_abs_at_least_7": 0,
  "policy_d_20_abs_at_least_12": 0,
  "production_database_sha256_before": "fc729041b200a7b1c640096224d1dea7724b4c2d06742932cf177f9f55ed1685",
  "production_database_sha256_after": "fc729041b200a7b1c640096224d1dea7724b4c2d06742932cf177f9f55ed1685",
  "production_database_unchanged": true
}
```
