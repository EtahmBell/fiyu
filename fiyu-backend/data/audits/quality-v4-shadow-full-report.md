# Quality-v4 shadow audit

This report is offline and does not change production scoring or publication state.

## Summary

```json
{
  "total_restaurants": 1203,
  "total_researched": 549,
  "v4_evidence_complete": 204,
  "v4_pending": 654,
  "v4_failed": 345,
  "v4_needs_retry": 0,
  "quality_adjustment_distribution": {
    "count": 204,
    "min": 0.0,
    "p10": 0.06,
    "median": 3.25,
    "mean": 3.34,
    "p90": 5.96,
    "p90_absolute": 5.96,
    "max": 8.65
  },
  "base_quality_distribution": {
    "count": 204,
    "min": 49.31,
    "p10": 55.7,
    "median": 67.31,
    "mean": 68.97,
    "p90": 86.35,
    "p90_absolute": 86.35,
    "max": 100.0
  },
  "positive_case_strength_distribution": {
    "count": 204,
    "min": 0.0,
    "p10": 12.98,
    "median": 35.05,
    "mean": 33.66,
    "p90": 49.24,
    "p90_absolute": 49.24,
    "max": 61.58
  },
  "negative_case_strength_distribution": {
    "count": 204,
    "min": 0.0,
    "p10": 0.0,
    "median": 0.0,
    "mean": 0.16,
    "p90": 0.0,
    "p90_absolute": 0.0,
    "max": 10.41
  },
  "researched_quality_distribution": {
    "count": 204,
    "min": 50.48,
    "p10": 58.03,
    "median": 70.93,
    "mean": 72.21,
    "p90": 89.58,
    "p90_absolute": 89.58,
    "max": 100.0
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 23,
    "+0.5 to +0.99": 1,
    "+1 to +2.99": 59,
    "+3 to +4.99": 84,
    "+5 to +7.99": 34,
    "+8 to +11.99": 3,
    ">= +12": 0
  },
  "production_v3_distribution": {
    "count": 204,
    "min": 61.19,
    "p10": 75.18,
    "median": 76.26,
    "mean": 76.39,
    "p90": 77.37,
    "p90_absolute": 77.37,
    "max": 86.16
  },
  "shadow_v4_distribution": {
    "count": 204,
    "min": 61.72,
    "p10": 76.15,
    "median": 77.68,
    "mean": 77.85,
    "p90": 79.52,
    "p90_absolute": 79.52,
    "max": 86.16
  },
  "score_delta_distribution": {
    "count": 204,
    "min": 0.0,
    "p10": 0.0,
    "median": 1.44,
    "mean": 1.46,
    "p90": 2.68,
    "p90_absolute": 2.68,
    "max": 3.89
  },
  "threshold_counterfactuals": {
    "68": {
      "production_pass": 202,
      "shadow_v4_pass": 202,
      "crossed_up": 0,
      "crossed_down": 0
    },
    "70": {
      "production_pass": 200,
      "shadow_v4_pass": 202,
      "crossed_up": 2,
      "crossed_down": 0
    },
    "75": {
      "production_pass": 199,
      "shadow_v4_pass": 200,
      "crossed_up": 1,
      "crossed_down": 0
    }
  },
  "large_movements_ge_8": 3,
  "large_movements_ge_12": 0,
  "guardrail_comparison": {
    "rows_changed_by_15_vs_20": 0,
    "maximum_raw_adjustment": 8.65,
    "maximum_guarded_adjustment": 8.65
  },
  "usage": {
    "responses_requests": 204,
    "web_search_actions": 539,
    "input_tokens": 5624385,
    "output_tokens": 347442,
    "total_tokens": 5971827,
    "mean_web_search_actions_per_restaurant": 2.64
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
      "place_id": "ChIJB7HGW4-OGGARfZnYhAbUtiE",
      "restaurant": "Sushi Aki Takase",
      "negative_case_strength": 1.79,
      "normalized_negative_aspects": [
        "seafood_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.77,
      "negative_claims": [
        "An English-language diner report describes a specific visit in which several shellfish appetizers were judged below sushi-restaurant freshness standards; it alleges a bad smell from an ishigaki clam and reports stomach illness the following day. The same report says the nigiri was substantially better than the appetizers and particularly liked the kohada."
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
      "place_id": "ChIJKeJ6EOuOGGARL8WQRRzW6bA",
      "restaurant": "Shodai Choberiba",
      "negative_case_strength": 1.0,
      "normalized_negative_aspects": [
        "seasoning"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.03,
      "negative_claims": [
        "A September 2025 review specifically criticized the yakitori as lacking flavor and suggested that the tare was too thin. This is a concrete food-quality criticism, but it is isolated rather than repeated across independent sources."
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
      "place_id": "ChIJUSthLwCJGGAROmyaaIoijDM",
      "restaurant": "Makkuse Dining & Bar",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "broth_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 1.94,
      "negative_claims": [
        "One experienced Tabelog reviewer specifically stated that the restaurant's biryani was not recommendable, while still acknowledging that the Nepalese plate had unusual content. This is food-specific negative evidence against uniformly strong execution across the menu, but it is currently an isolated criticism rather than a demonstrated recurring problem."
      ]
    },
    {
      "place_id": "ChIJZ602_hGNGGAR1jj1MmTiDOw",
      "restaurant": "Shokudokoro Takamura",
      "negative_case_strength": 1.39,
      "normalized_negative_aspects": [
        "texture"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.16,
      "negative_claims": [
        "2025年の訪問者は、生姜焼きについて「及第点」とし、厚めの肉に薄いとろみの層があると描写した一方、もう一工夫ほしいと評価している。生姜焼きは明確な高評価一辺倒ではない。"
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
      "place_id": "ChIJcbxWcwBhGGARCogpYKiN83Y",
      "restaurant": "Asian Kitchen Curry Kodo: Spice Aroma",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "seasoning"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 1.17,
      "negative_claims": [
        "One reviewer reported that a curry ordered at the second-highest spice level did not seem very spicy and described the flavor as ordinary or as expected. This is isolated and subjective evidence of restrained heat and limited distinctiveness for that visit."
      ]
    },
    {
      "place_id": "ChIJd0wuXgCNGGARN9UAU3Eqt9k",
      "restaurant": "Waikiki Suidobashi",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "other_ingredient"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 0.0,
      "negative_claims": [
        "A lunch diner who ordered the restaurant's curry described the taste as ordinary and said another restaurant's naan was preferable."
      ]
    },
    {
      "place_id": "ChIJxQk2agCPGGARLVDnM2Ma5qQ",
      "restaurant": "Indian Nepali Restaurant & Bar (Sakura)",
      "negative_case_strength": 0.68,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 1.67,
      "negative_claims": [
        "One takeaway diner reported that the naan was unusually small and thin, with a sweet dough, and that an order marked extremely spicy was not very hot; the diner also felt the curry quantity was limited relative to the naan."
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
    "count": 9,
    "exactly_neutral": 9,
    "false_negative_count": 0,
    "rows": [
      {
        "place_id": "ChIJAZWDbj2SGGARYKJCNx1QYFs",
        "restaurant": "Ajidokoro Goshiki",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJE-xSVABhGGARnK_cAkpTLQ0",
        "restaurant": "New Malika Asian Restaurant & Dining Bar",
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
        "place_id": "ChIJI2iECkjsGGARmK5Rqx0VhHA",
        "restaurant": "PUB Yorimichi",
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
      },
      {
        "place_id": "ChIJy4hlIrWRGGARvy6vEi3R0gg",
        "restaurant": "Snack Oasis",
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
      "place_id": "ChIJCfYMkC7zGGARmCZ9n6rlIXE",
      "restaurant": "Horumon-yaki Kuunomu",
      "base_quality": 60.0,
      "positive_case_strength": 61.36,
      "negative_case_strength": 0.0,
      "adjustment": 8.6,
      "researched_quality": 68.6,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation",
        "ingredient_product"
      ],
      "independent_sources": 6,
      "evidence_summary": [
        "A local food blogger describes thick-cut meats, a strongly seasoned揉みダレ, charcoal grilling over consistently low heat, and careful preparation that produces good焼きムラ control and a satisfying balance of char, sauce, and meat.",
        "Multiple food-specific accounts praise the offal for freshness, lack of odor, and clean preparation, including horumon, liver, senmai, and hachinosu.",
        "Recent diner reports describe the horumon as consistently fresh, with pronounced flavor and texture, and attribute the absence of odor to careful pre-treatment.",
        "Food-focused reports repeatedly describe large or thick cuts that remain tender or pleasantly springy: thick-cut horumon is described as juicy and supple, harami as strongly textured without odor, and thick liver as retaining a soft, pudding-like interior after charcoal grilling.",
        "The restaurant's red-miso-based or濃厚揉みダレ is repeatedly identified as a defining strength: diners describe the seasoning as rich, savory, slightly sweet, and especially effective with rice, while still noting a lighter chicken-sasami option."
      ],
      "production_v3_score": 76.89,
      "shadow_v4_score": 80.76,
      "score_delta": 3.87
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
      "ChIJ4ZQODgCNGGARhsxyGRSEs8Y",
      "ChIJ4zoyEQCNGGARXjAis5Alavg",
      "ChIJ7Z-ywmaNGGAR11I6NndgGOk",
      "ChIJARPIYTiNGGARteebOz7T5kk",
      "ChIJB1nV6g3zGGARw3iNYsoxcq0",
      "ChIJCcpK2n-OGGARvw01qvpgJzg",
      "ChIJCfYMkC7zGGARmCZ9n6rlIXE",
      "ChIJERYhiaiLGGARJRj7Pyfc-ao",
      "ChIJI0y12J3zGGARPbLhMoOvDG0",
      "ChIJR7WtCqSOGGARRBh1fWlElZ4",
      "ChIJWeI_aACNGGAR4Fn0N-p0Xnk",
      "ChIJZ0eWUvOLGGARCJ4KcQ1fcoU",
      "ChIJ_WFfC6SNGGARwOzy6HXllds",
      "ChIJedaJUgCPGGARmiPKM4PVCSc",
      "ChIJgWuZssOLGGARBbyvRoGJjAg",
      "ChIJt7qtYACPGGARxd9MkUmW5IE"
    ]
  }
}
```

## Biggest risers

| Restaurant | Base Q | Adj. | v3 | v4 | Delta |
|---|---:|---:|---:|---:|---:|
| Teishoku-ya Susico | 66.54 | +8.65 | 75.26 | 79.15 | +3.89 |
| Horumon-yaki Kuunomu | 60.00 | +8.60 | 76.89 | 80.76 | +3.87 |
| Buncho | 64.50 | +8.07 | 75.72 | 79.35 | +3.63 |
| Bistrot33 Santrois | 73.14 | +7.87 | 75.98 | 79.52 | +3.54 |
| Tarikino Kappou | 81.06 | +7.65 | 75.87 | 79.32 | +3.45 |
| Italian Oyo | 52.06 | +7.63 | 75.64 | 79.08 | +3.44 |
| Nihonbashi Kakigaracho Sugita | 78.05 | +7.59 | 76.26 | 79.68 | +3.42 |
| Sumibi Yakitori Moriho | 66.67 | +7.53 | 75.99 | 79.38 | +3.39 |
| lu.cucina | 92.96 | +7.39 | 81.35 | 84.52 | +3.17 |
| Kappo Tsukiji Kiyama | 73.12 | +6.71 | 76.52 | 79.54 | +3.02 |
| Sushi-ya Ono | 80.81 | +6.46 | 75.55 | 78.46 | +2.91 |
| Jinsei Yokocho Ushiwaka | 70.02 | +6.46 | 75.44 | 78.34 | +2.90 |
| Wasou Hikichi | 71.65 | +6.37 | 76.35 | 79.22 | +2.87 |
| Tokino Oto Seisakusho | 68.08 | +6.38 | 73.90 | 76.77 | +2.87 |
| Kaisendon Tonari | 80.30 | +6.34 | 77.52 | 80.37 | +2.85 |
| Meuga | 69.11 | +6.29 | 77.35 | 80.18 | +2.83 |
| British Sushi (Igu-rishi) | 81.69 | +6.16 | 77.36 | 80.13 | +2.77 |
| Furutori Higashi-Nihombashi | 71.22 | +6.14 | 76.02 | 78.78 | +2.76 |
| Sobagiri En | 59.67 | +6.10 | 77.32 | 80.07 | +2.75 |
| Blauer Engel | 73.26 | +6.05 | 75.86 | 78.59 | +2.73 |

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

### Horumon-yaki Kuunomu

- Quality: 60.00 -> 68.60 (+8.60)
- Case strength: +61.36 / -0.00
- Fiyu: 76.89 -> 80.76 (+3.87)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 6
- Evidence: A local food blogger describes thick-cut meats, a strongly seasoned揉みダレ, charcoal grilling over consistently low heat, and careful preparation that produces good焼きムラ control and a satisfying balance of char, sauce, and meat. | Multiple food-specific accounts praise the offal for freshness, lack of odor, and clean preparation, including horumon, liver, senmai, and hachinosu. | Recent diner reports describe the horumon as consistently fresh, with pronounced flavor and texture, and attribute the absence of odor to careful pre-treatment. | Food-focused reports repeatedly describe large or thick cuts that remain tender or pleasantly springy: thick-cut horumon is described as juicy and supple, harami as strongly textured without odor, and thick liver as retaining a soft, pudding-like interior after charcoal grilling. | The restaurant's red-miso-based or濃厚揉みダレ is repeatedly identified as a defining strength: diners describe the seasoning as rich, savory, slightly sweet, and especially effective with rice, while still noting a lighter chicken-sasami option.
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
- **Sushi Aki Takase**: strength 1.79; aspects seafood_quality; independent sources 1; corroborated False; net adjustment +2.77.
- **Yakitori Taru wo Shiru**: strength 0.71; aspects ingredient_quality; independent sources 1; corroborated False; net adjustment +3.51.
- **Shodai Choberiba**: strength 1.00; aspects seasoning; independent sources 1; corroborated False; net adjustment +2.03.
- **Wakasugi**: strength 1.96; aspects broth_quality; independent sources 1; corroborated False; net adjustment +2.80.
- **Yakiniku Sho Kanda-nishiguchi**: strength 1.39; aspects meat_quality; independent sources 1; corroborated False; net adjustment +2.85.
- **Tokino Oto Seisakusho**: strength 1.00; aspects broth_quality; independent sources 1; corroborated False; net adjustment +6.38.
- **Izakaya Hiro**: strength 1.39; aspects broth_quality; independent sources 1; corroborated False; net adjustment +1.34.
- **Ichikaku**: strength 2.64; aspects broth_quality, texture; independent sources 1; corroborated False; net adjustment +3.26.
- **Yurakucho Kakida**: strength 10.41; aspects recurring_freshness_issue, seasoning; independent sources 2; corroborated False; net adjustment +2.20.
- **Makkuse Dining & Bar**: strength 0.71; aspects broth_quality; independent sources 1; corroborated False; net adjustment +1.94.
- **Shokudokoro Takamura**: strength 1.39; aspects texture; independent sources 1; corroborated False; net adjustment +2.16.
- **Washokudokoro Susumu**: strength 0.87; aspects broth_quality; independent sources 1; corroborated False; net adjustment +2.40.
- **Asakusa Kōchan**: strength 1.29; aspects other_ingredient; independent sources 1; corroborated False; net adjustment +0.00.
- **Asian Kitchen Curry Kodo: Spice Aroma**: strength 0.71; aspects seasoning; independent sources 1; corroborated False; net adjustment +1.17.
- **Waikiki Suidobashi**: strength 0.71; aspects other_ingredient; independent sources 1; corroborated False; net adjustment +0.00.
- **Indian Nepali Restaurant & Bar (Sakura)**: strength 0.68; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +1.67.
- **Cho-i Nomi-dokoro Yorimichi**: strength 1.22; aspects texture; independent sources 1; corroborated False; net adjustment +1.07.
- **Tramont: People, Wine, and the Table**: strength 0.71; aspects seasoning; independent sources 1; corroborated False; net adjustment +3.15.

## Sparse/no-evidence safety

9/9 no-evidence rows were exactly neutral; false-negative count: 0.
