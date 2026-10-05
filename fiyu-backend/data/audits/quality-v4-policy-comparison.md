# Quality-v4 policy comparison

The four caps were not meaningfully exercised. The largest Quality adjustment was 
+1.89; no result reached ±2, let alone ±5. 
Policies C and D were identical, and B differed from A only when the broad-evidence 
unlock activated. This run therefore supplies no empirical justification for a cap 
above ±5.

The comparison is also one-sided: no restaurant received a net negative adjustment. 
That is a research/extraction defect, not evidence that negative corrections are 
unnecessary. Until a better negative challenge corpus and claim-clustering pass 
demonstrate symmetric behavior, none of these policies should ship.

```json
{
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
}
```
