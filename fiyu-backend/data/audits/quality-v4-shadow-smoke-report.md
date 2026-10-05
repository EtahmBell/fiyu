# Quality-v4 shadow audit

This report is offline and does not change production scoring or publication state.

## Summary

```json
{
  "total_restaurants": 1203,
  "total_researched": 100,
  "v4_evidence_complete": 100,
  "v4_pending": 1103,
  "v4_failed": 0,
  "v4_needs_retry": 0,
  "quality_adjustment_distribution": {
    "count": 100,
    "min": 0.0,
    "p10": 0.09,
    "median": 3.2,
    "mean": 3.33,
    "p90": 6.16,
    "p90_absolute": 6.16,
    "max": 8.65
  },
  "base_quality_distribution": {
    "count": 100,
    "min": 49.31,
    "p10": 54.39,
    "median": 65.75,
    "mean": 67.11,
    "p90": 81.13,
    "p90_absolute": 81.13,
    "max": 100.0
  },
  "positive_case_strength_distribution": {
    "count": 100,
    "min": 0.0,
    "p10": 13.11,
    "median": 34.66,
    "mean": 33.43,
    "p90": 50.15,
    "p90_absolute": 50.15,
    "max": 61.58
  },
  "negative_case_strength_distribution": {
    "count": 100,
    "min": 0.0,
    "p10": 0.0,
    "median": 0.0,
    "mean": 0.26,
    "p90": 0.88,
    "p90_absolute": 0.88,
    "max": 10.41
  },
  "researched_quality_distribution": {
    "count": 100,
    "min": 50.48,
    "p10": 56.01,
    "median": 69.91,
    "mean": 70.33,
    "p90": 87.41,
    "p90_absolute": 87.41,
    "max": 100.0
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 11,
    "+0.5 to +0.99": 0,
    "+1 to +2.99": 33,
    "+3 to +4.99": 36,
    "+5 to +7.99": 18,
    "+8 to +11.99": 2,
    ">= +12": 0
  },
  "production_v3_distribution": {
    "count": 100,
    "min": 61.19,
    "p10": 75.09,
    "median": 75.51,
    "mean": 75.49,
    "p90": 76.11,
    "p90_absolute": 76.11,
    "max": 85.82
  },
  "shadow_v4_distribution": {
    "count": 100,
    "min": 61.72,
    "p10": 75.48,
    "median": 76.94,
    "mean": 76.94,
    "p90": 78.81,
    "p90_absolute": 78.81,
    "max": 85.83
  },
  "score_delta_distribution": {
    "count": 100,
    "min": 0.0,
    "p10": 0.01,
    "median": 1.41,
    "mean": 1.45,
    "p90": 2.77,
    "p90_absolute": 2.77,
    "max": 3.89
  },
  "threshold_counterfactuals": {
    "68": {
      "production_pass": 98,
      "shadow_v4_pass": 98,
      "crossed_up": 0,
      "crossed_down": 0
    },
    "70": {
      "production_pass": 96,
      "shadow_v4_pass": 98,
      "crossed_up": 2,
      "crossed_down": 0
    },
    "75": {
      "production_pass": 95,
      "shadow_v4_pass": 96,
      "crossed_up": 1,
      "crossed_down": 0
    }
  },
  "large_movements_ge_8": 2,
  "large_movements_ge_12": 0,
  "guardrail_comparison": {
    "rows_changed_by_15_vs_20": 0,
    "maximum_raw_adjustment": 8.65,
    "maximum_guarded_adjustment": 8.65
  },
  "usage": {
    "responses_requests": 100,
    "web_search_actions": 268,
    "input_tokens": 2804103,
    "output_tokens": 170268,
    "total_tokens": 2974371,
    "mean_web_search_actions_per_restaurant": 2.68
  },
  "negative_evidence_cases": [
    {
      "place_id": "ChIJ0SKuTJftGGAR2IiTsrMNt88",
      "restaurant": "Ramen Kaikouya",
      "negative_case_strength": 1.69,
      "normalized_negative_aspects": [
        "balance"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.83,
      "negative_claims": [
        "A detailed review of the shellfish oil noodles finds clear shellfish aroma and umami, but criticizes the soy-based sauce as too salty and too abundant for the regular portion. The reviewer argues that reducing the sauce would allow the shellfish flavor to expand and improve balance."
      ]
    },
    {
      "place_id": "ChIJ9YGfzvPtGGARySG0L_7f_uE",
      "restaurant": "Manali",
      "negative_case_strength": 1.0,
      "normalized_negative_aspects": [
        "frying"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.82,
      "negative_claims": [
        "The restaurant’s Thai-style fried rice was described as excessively oily, although the reviewer also noted abundant vegetables and an effective lemon accompaniment."
      ]
    },
    {
      "place_id": "ChIJBTNbB2iNGGAR5TsUNovzUOg",
      "restaurant": "Yakitori Taru wo Shiru",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "ingredient_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.51,
      "negative_claims": [
        "One diner reported that the Japanese sake tasted somewhat old. This is a specific beverage-quality complaint, but it is isolated and does not establish a recurring food-quality problem."
      ]
    },
    {
      "place_id": "ChIJL1xOhCfsGGAR8M4QGYqUuAo",
      "restaurant": "Wakasugi",
      "negative_case_strength": 1.96,
      "normalized_negative_aspects": [
        "broth_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.8,
      "negative_claims": [
        "A local food blog reported that the lunch ara-jiru broth tasted insufficiently rested: the scallion was undercooked and fish odor had not been fully removed. The writer explicitly said this was disappointing and that it was not usually like this, making it evidence of a one-off execution lapse rather than a confirmed recurring defect."
      ]
    },
    {
      "place_id": "ChIJMbYSLQCNGGARB5X65ALqi0E",
      "restaurant": "Yakiniku Sho Kanda-nishiguchi",
      "negative_case_strength": 1.39,
      "normalized_negative_aspects": [
        "meat_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.85,
      "negative_claims": [
        "A detailed reviewer reports that the Sendai beef was excessively fatty. This is a specific food-quality limitation, though it is one reviewer’s experience and may partly reflect preference for leaner beef."
      ]
    },
    {
      "place_id": "ChIJMdaU3fzzGGARVYr6UravT-w",
      "restaurant": "Tokino Oto Seisakusho",
      "negative_case_strength": 1.0,
      "normalized_negative_aspects": [
        "broth_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 6.38,
      "negative_claims": [
        "One February 2026 Tabelog review reported that the lunch soup tasted extremely under-seasoned and that the chicken lacked crisp skin and juiciness, characterizing the plate as closer to home cooking than restaurant-level execution."
      ]
    },
    {
      "place_id": "ChIJN41O3OH1GGARew2gLQQ4Eys",
      "restaurant": "Izakaya Hiro",
      "negative_case_strength": 1.39,
      "normalized_negative_aspects": [
        "broth_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 1.34,
      "negative_claims": [
        "The same review criticized the shrimp macaroni gratin because its béchamel sauce was too loose; the reviewer also felt the portion was excessively large and would not specifically order it again."
      ]
    },
    {
      "place_id": "ChIJPXEZSBiJGGAR5VTsyfMXirY",
      "restaurant": "Ichikaku",
      "negative_case_strength": 2.64,
      "normalized_negative_aspects": [
        "broth_quality",
        "texture"
      ],
      "negative_observation_count": 2,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.26,
      "negative_claims": [
        "A detailed review of the yakisoba found the noodles too soft, the sauce too weak in flavor, and the dish unsatisfying despite its large portion.",
        "The same review found the inari sushi too lightly seasoned and suggested that the fried tofu would be better if more thoroughly infused with simmering broth."
      ]
    },
    {
      "place_id": "ChIJT9Us-LqNGGARRsG3S9GajWc",
      "restaurant": "Yurakucho Kakida",
      "negative_case_strength": 10.41,
      "normalized_negative_aspects": [
        "recurring_freshness_issue",
        "seasoning"
      ],
      "negative_observation_count": 2,
      "independent_negative_provenance_count": 2,
      "corroborated": false,
      "guarded_quality_adjustment": 2.2,
      "negative_claims": [
        "A diner who otherwise found the experience acceptable identified recurring preparation concerns during that visit: sushi rice vinegar was too strong, the wasabi was too weak and perceived as low quality, and the gari was considered inferior to conveyor-belt sushi.",
        "Another diner reported that the overall seasoning was weak, some toppings were watery, the salmon roe had an off flavor, and the food quality did not justify the meal; this contrasts with other reviews praising freshness and premium ingredients."
      ]
    },
    {
      "place_id": "ChIJZbdkpeKMGGAReJrFExC1TlY",
      "restaurant": "Washokudokoro Susumu",
      "negative_case_strength": 0.87,
      "normalized_negative_aspects": [
        "broth_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.4,
      "negative_claims": [
        "A Tripadvisor diner found the pork kakuni somewhat firm, saying that the fat seemed to have been rendered out and the meat consequently lacked softness; the same diner still described the miso soup as hearty and tasty and the kakuni as flavorful and substantial."
      ]
    },
    {
      "place_id": "ChIJaQfWbJOOGGARbV81GsXIHhM",
      "restaurant": "Asakusa Kōchan",
      "negative_case_strength": 1.29,
      "normalized_negative_aspects": [
        "other_ingredient"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 0.0,
      "negative_claims": [
        "A 2015 reviewer characterized the restaurant as more of an izakaya than a soba shop and gave the food a 2.7/5 sub-rating, indicating that the soba-focused offering did not strongly meet that reviewer's expectations."
      ]
    },
    {
      "place_id": "ChIJxakJLpqNGGARIpc4I9vtosQ",
      "restaurant": "Cho-i Nomi-dokoro Yorimichi",
      "negative_case_strength": 1.22,
      "normalized_negative_aspects": [
        "texture"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 1.07,
      "negative_claims": [
        "The same review found the fries limp rather than crisp and described the edamame as ordinary, apparently warmed from frozen. These observations suggest that some side dishes may be conventional and inconsistently executed rather than highly distinctive."
      ]
    },
    {
      "place_id": "ChIJy9NeW22LGGARtI40VcH_FZU",
      "restaurant": "Tramont: People, Wine, and the Table",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "seasoning"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.15,
      "negative_claims": [
        "One Tabelog reviewer gave the food a 3.0 rating and reported a merely ordinary experience overall; however, the visible criticism focused more on wine availability and perceived à-la-carte pricing than on a specific cooking or flavor defect."
      ]
    }
  ],
  "mixed_high_positive_high_negative_cases": [],
  "sparse_no_evidence": {
    "count": 6,
    "exactly_neutral": 6,
    "false_negative_count": 0,
    "rows": [
      {
        "place_id": "ChIJAZWDbj2SGGARYKJCNx1QYFs",
        "restaurant": "Ajidokoro Goshiki",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJG5N9kjuSGGARzRkXb7VMJpI",
        "restaurant": "Abe Shoten",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJHY8SKZSOGGAR6ISQQi1VEPg",
        "restaurant": "Kunichan no Mise",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJJWg6bwBhGGARPqimANtPgPk",
        "restaurant": "Izakaya Genki",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJa4TrOeaRGGARmYYUFzrOLq0",
        "restaurant": "Dining Bar Kaindo",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJoZeaLyLzGGARlZv-lbErhyQ",
        "restaurant": "Yurippe",
        "adjustment": 0.0,
        "exactly_neutral": true
      }
    ]
  },
  "large_movement_audit": [
    {
      "place_id": "ChIJ7aW3h6zzGGARY4F_qs8cBaM",
      "restaurant": "Buncho",
      "base_quality": 64.5,
      "positive_case_strength": 58.94,
      "negative_case_strength": 0.0,
      "adjustment": 8.07,
      "researched_quality": 72.57,
      "families": [
        "consistency",
        "craft_execution",
        "ingredient_product"
      ],
      "independent_sources": 7,
      "evidence_summary": [
        "The restaurant identifies Daisen chicken as its yakitori ingredient and presents seasonal fish and daily seasonal dishes as core offerings.",
        "The restaurant is described as hand-skewering chicken and grilling it over charcoal; a local listing specifically emphasizes that the skewers are individually prepared and charcoal-grilled.",
        "Multiple food-specific accounts describe the yakitori as large, juicy, tender, and strongly charcoal-aromatic. One independent blog calls the white liver excellent and says the skewers were large and juicy; another review describes the chicken as tender and juicy with a pronounced charcoal aroma.",
        "Recent Tabelog reviews independently praise particular chicken preparations: white liver is called especially delicious; chicken wings are singled out as very good; another review reports fresh, firm-textured chicken in the white liver and assorted yakitori.",
        "A recent review describes the yakitori bowl as having fragrant grilled chicken, a well-matched sweet-savory sauce, and tender, juicy meat."
      ],
      "production_v3_score": 75.72,
      "shadow_v4_score": 79.35,
      "score_delta": 3.63
    },
    {
      "place_id": "ChIJUxgEyKiSGGARCwF4891ev0M",
      "restaurant": "Teishoku-ya Susico",
      "base_quality": 66.54,
      "positive_case_strength": 61.58,
      "negative_case_strength": 0.0,
      "adjustment": 8.65,
      "researched_quality": 75.19,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation",
        "ingredient_product"
      ],
      "independent_sources": 4,
      "evidence_summary": [
        "A detailed food review reports that the pork, vegetables, and garlic in the national-pork garlic stamina set each retained a distinct, well-judged texture, attributing this to precise heat control. It specifically describes a balance of tenderness and chew in the meat and crispness in the vegetables and garlic.",
        "The same review describes the simmered redfish as retaining its shape while absorbing the seasoning, with clean flavor and no fishy or muddy notes; it presents this as evidence of careful preparation and controlled simmering.",
        "The reviewer describes the tuna in the tuna-kimchi bowl as properly trimmed, firm, free of watery texture or odor, and composed of both lean and moderately fatty portions.",
        "A local food-news report states that the restaurant sources fish from Toyosu Market and that the salmon collar is supplied in varying quantities depending on market availability. It also reports in-house salting and resting of the salmon collar and that the restaurant tries to use domestic ingredients.",
        "The same report describes an unusually thick salmon collar with dense meat and substantial fat, while noting that rice grains were distinct and appeared carefully cooked. It also describes the vegetable-rich miso soup and side dishes as competently prepared, with crisp, well-seasoned, or gently sweet qualities."
      ],
      "production_v3_score": 75.26,
      "shadow_v4_score": 79.15,
      "score_delta": 3.89
    }
  ],
  "score_band_samples": {
    "67-69": [
      "ChIJwXYZD-2OGGARJhulGMTMjlA"
    ],
    "69-71": [
      "ChIJB4ty4CL1GGARXt_6OUnA3lo"
    ],
    "74-76": [
      "ChIJ-3fBBQCNGGARgXH3cOoZYgI",
      "ChIJ4ew6VwCJGGARRNf0K2m7FCs",
      "ChIJ77jWOriOGGARfpzO6ZQTIWs",
      "ChIJAZWDbj2SGGARYKJCNx1QYFs",
      "ChIJG5N9kjuSGGARzRkXb7VMJpI",
      "ChIJHY8SKZSOGGAR6ISQQi1VEPg",
      "ChIJJWg6bwBhGGARPqimANtPgPk",
      "ChIJNdAxmIdhGGAR8sHmG4_9AsI",
      "ChIJa4TrOeaRGGARmYYUFzrOLq0",
      "ChIJaQfWbJOOGGARbV81GsXIHhM",
      "ChIJdYAczvdhGGARkKLEJKY9cmQ",
      "ChIJgVqO4Yf1GGARXuwajb2cUpI",
      "ChIJhejBcc-LGGARzeHql7Ya5Ds",
      "ChIJoZeaLyLzGGARlZv-lbErhyQ"
    ],
    "80+": [
      "ChIJ3U-KbgCNGGARFNCk9UTf6yI",
      "ChIJARPIYTiNGGARteebOz7T5kk",
      "ChIJI0y12J3zGGARPbLhMoOvDG0",
      "ChIJWeI_aACNGGAR4Fn0N-p0Xnk"
    ]
  }
}
```

## Biggest risers

| Restaurant | Base Q | Adj. | v3 | v4 | Delta |
|---|---:|---:|---:|---:|---:|
| Teishoku-ya Susico | 66.54 | +8.65 | 75.26 | 79.15 | +3.89 |
| Buncho | 64.50 | +8.07 | 75.72 | 79.35 | +3.63 |
| Bistrot33 Santrois | 73.14 | +7.87 | 75.98 | 79.52 | +3.54 |
| Tarikino Kappou | 81.06 | +7.65 | 75.87 | 79.32 | +3.45 |
| Italian Oyo | 52.06 | +7.63 | 75.64 | 79.08 | +3.44 |
| Sumibi Yakitori Moriho | 66.67 | +7.53 | 75.99 | 79.38 | +3.39 |
| lu.cucina | 92.96 | +7.39 | 81.35 | 84.52 | +3.17 |
| Sushi-ya Ono | 80.81 | +6.46 | 75.55 | 78.46 | +2.91 |
| Jinsei Yokocho Ushiwaka | 70.02 | +6.46 | 75.44 | 78.34 | +2.90 |
| Tokino Oto Seisakusho | 68.08 | +6.38 | 73.90 | 76.77 | +2.87 |
| Furutori Higashi-Nihombashi | 71.22 | +6.14 | 76.02 | 78.78 | +2.76 |
| Blauer Engel | 73.26 | +6.05 | 75.86 | 78.59 | +2.73 |
| Plaiga TOKYO | 88.59 | +5.87 | 75.96 | 78.60 | +2.64 |
| Sushi Dokoro Ikeda | 65.71 | +5.74 | 75.42 | 78.01 | +2.59 |
| Fish Ground | 73.27 | +5.28 | 75.30 | 77.68 | +2.38 |
| Trattoria Shunraku | 72.48 | +5.27 | 75.40 | 77.77 | +2.37 |
| Katsukiri | 58.64 | +5.05 | 76.02 | 78.29 | +2.27 |
| Sushi Oku | 65.97 | +5.01 | 75.18 | 77.43 | +2.25 |
| 80-nendai Sakaba Bushitsu | 51.08 | +4.93 | 75.66 | 77.88 | +2.22 |
| Kameido BULL'S Bar | 71.48 | +4.69 | 75.33 | 77.45 | +2.12 |

## Biggest fallers

| Restaurant | Base Q | Adj. | v3 | v4 | Delta |
|---|---:|---:|---:|---:|---:|
| None | — | — | — | — | — |

## Large movements (|adjustment| >= 8)

### Buncho

- Quality: 64.50 -> 72.57 (+8.07)
- Case strength: +58.94 / -0.00
- Fiyu: 75.72 -> 79.35 (+3.63)
- Families: consistency, craft_execution, ingredient_product
- Independent sources: 7
- Evidence: The restaurant identifies Daisen chicken as its yakitori ingredient and presents seasonal fish and daily seasonal dishes as core offerings. | The restaurant is described as hand-skewering chicken and grilling it over charcoal; a local listing specifically emphasizes that the skewers are individually prepared and charcoal-grilled. | Multiple food-specific accounts describe the yakitori as large, juicy, tender, and strongly charcoal-aromatic. One independent blog calls the white liver excellent and says the skewers were large and juicy; another review describes the chicken as tender and juicy with a pronounced charcoal aroma. | Recent Tabelog reviews independently praise particular chicken preparations: white liver is called especially delicious; chicken wings are singled out as very good; another review reports fresh, firm-textured chicken in the white liver and assorted yakitori. | A recent review describes the yakitori bowl as having fragrant grilled chicken, a well-matched sweet-savory sauce, and tender, juicy meat.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Teishoku-ya Susico

- Quality: 66.54 -> 75.19 (+8.65)
- Case strength: +61.58 / -0.00
- Fiyu: 75.26 -> 79.15 (+3.89)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 4
- Evidence: A detailed food review reports that the pork, vegetables, and garlic in the national-pork garlic stamina set each retained a distinct, well-judged texture, attributing this to precise heat control. It specifically describes a balance of tenderness and chew in the meat and crispness in the vegetables and garlic. | The same review describes the simmered redfish as retaining its shape while absorbing the seasoning, with clean flavor and no fishy or muddy notes; it presents this as evidence of careful preparation and controlled simmering. | The reviewer describes the tuna in the tuna-kimchi bowl as properly trimmed, firm, free of watery texture or odor, and composed of both lean and moderately fatty portions. | A local food-news report states that the restaurant sources fish from Toyosu Market and that the salmon collar is supplied in varying quantities depending on market availability. It also reports in-house salting and resting of the salmon collar and that the restaurant tries to use domestic ingredients. | The same report describes an unusually thick salmon collar with dense meat and substantial fat, while noting that rice grains were distinct and appeared carefully cooked. It also describes the vegetable-rich miso soup and side dishes as competently prepared, with crisp, well-seasoned, or gently sweet qualities.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

## Negative-evidence rows

- **Ramen Kaikouya**: strength 1.69; aspects balance; independent sources 1; corroborated False; net adjustment +3.83.
- **Manali**: strength 1.00; aspects frying; independent sources 1; corroborated False; net adjustment +2.82.
- **Yakitori Taru wo Shiru**: strength 0.71; aspects ingredient_quality; independent sources 1; corroborated False; net adjustment +3.51.
- **Wakasugi**: strength 1.96; aspects broth_quality; independent sources 1; corroborated False; net adjustment +2.80.
- **Yakiniku Sho Kanda-nishiguchi**: strength 1.39; aspects meat_quality; independent sources 1; corroborated False; net adjustment +2.85.
- **Tokino Oto Seisakusho**: strength 1.00; aspects broth_quality; independent sources 1; corroborated False; net adjustment +6.38.
- **Izakaya Hiro**: strength 1.39; aspects broth_quality; independent sources 1; corroborated False; net adjustment +1.34.
- **Ichikaku**: strength 2.64; aspects broth_quality, texture; independent sources 1; corroborated False; net adjustment +3.26.
- **Yurakucho Kakida**: strength 10.41; aspects recurring_freshness_issue, seasoning; independent sources 2; corroborated False; net adjustment +2.20.
- **Washokudokoro Susumu**: strength 0.87; aspects broth_quality; independent sources 1; corroborated False; net adjustment +2.40.
- **Asakusa Kōchan**: strength 1.29; aspects other_ingredient; independent sources 1; corroborated False; net adjustment +0.00.
- **Cho-i Nomi-dokoro Yorimichi**: strength 1.22; aspects texture; independent sources 1; corroborated False; net adjustment +1.07.
- **Tramont: People, Wine, and the Table**: strength 0.71; aspects seasoning; independent sources 1; corroborated False; net adjustment +3.15.

## Sparse/no-evidence safety

6/6 no-evidence rows were exactly neutral; false-negative count: 0.
