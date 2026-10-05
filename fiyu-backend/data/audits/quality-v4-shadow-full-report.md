# Quality-v4 shadow audit

This report is offline and does not change production scoring or publication state.

## Summary

```json
{
  "total_restaurants": 1203,
  "total_researched": 549,
  "v4_evidence_complete": 548,
  "v4_pending": 654,
  "v4_failed": 1,
  "v4_needs_retry": 0,
  "quality_adjustment_distribution": {
    "count": 548,
    "min": 0.0,
    "p10": 0.62,
    "median": 3.31,
    "mean": 3.42,
    "p90": 5.99,
    "p90_absolute": 5.99,
    "max": 9.51
  },
  "base_quality_distribution": {
    "count": 548,
    "min": 49.31,
    "p10": 59.16,
    "median": 72.21,
    "mean": 73.44,
    "p90": 88.44,
    "p90_absolute": 88.44,
    "max": 100.0
  },
  "positive_case_strength_distribution": {
    "count": 548,
    "min": 0.0,
    "p10": 16.38,
    "median": 35.48,
    "mean": 34.27,
    "p90": 49.38,
    "p90_absolute": 49.38,
    "max": 65.53
  },
  "negative_case_strength_distribution": {
    "count": 548,
    "min": 0.0,
    "p10": 0.0,
    "median": 0.0,
    "mean": 0.16,
    "p90": 0.0,
    "p90_absolute": 0.0,
    "max": 10.84
  },
  "researched_quality_distribution": {
    "count": 548,
    "min": 50.48,
    "p10": 61.97,
    "median": 75.78,
    "mean": 76.74,
    "p90": 93.38,
    "p90_absolute": 93.38,
    "max": 100.0
  },
  "quality_adjustment_bands": {
    "<= -12": 0,
    "-11.99 to -8": 0,
    "-7.99 to -5": 0,
    "-4.99 to -3": 0,
    "-2.99 to -1": 0,
    "-0.99 to -0.5": 0,
    "-0.49 to +0.49": 53,
    "+0.5 to +0.99": 14,
    "+1 to +2.99": 151,
    "+3 to +4.99": 223,
    "+5 to +7.99": 98,
    "+8 to +11.99": 9,
    ">= +12": 0
  },
  "production_v3_distribution": {
    "count": 548,
    "min": 61.19,
    "p10": 75.52,
    "median": 78.72,
    "mean": 78.93,
    "p90": 82.88,
    "p90_absolute": 82.88,
    "max": 90.2
  },
  "shadow_v4_distribution": {
    "count": 548,
    "min": 61.72,
    "p10": 76.84,
    "median": 80.13,
    "mean": 80.41,
    "p90": 84.49,
    "p90_absolute": 84.49,
    "max": 90.5
  },
  "score_delta_distribution": {
    "count": 548,
    "min": 0.0,
    "p10": 0.0,
    "median": 1.46,
    "mean": 1.48,
    "p90": 2.67,
    "p90_absolute": 2.67,
    "max": 4.28
  },
  "threshold_counterfactuals": {
    "68": {
      "production_pass": 546,
      "shadow_v4_pass": 546,
      "crossed_up": 0,
      "crossed_down": 0
    },
    "70": {
      "production_pass": 544,
      "shadow_v4_pass": 546,
      "crossed_up": 2,
      "crossed_down": 0
    },
    "75": {
      "production_pass": 541,
      "shadow_v4_pass": 543,
      "crossed_up": 2,
      "crossed_down": 0
    }
  },
  "large_movements_ge_8": 9,
  "large_movements_ge_12": 0,
  "guardrail_comparison": {
    "rows_changed_by_15_vs_20": 0,
    "maximum_raw_adjustment": 9.51,
    "maximum_guarded_adjustment": 9.51
  },
  "usage": {
    "responses_requests": 548,
    "web_search_actions": 1449,
    "input_tokens": 15123992,
    "output_tokens": 942344,
    "total_tokens": 16066336,
    "mean_web_search_actions_per_restaurant": 2.64
  },
  "negative_evidence_cases": [
    {
      "place_id": "ChIJ--kHzR31GGARGv1b_Dizn2E",
      "restaurant": "French Cuisine H (Furansu Ryori Asshu)",
      "negative_case_strength": 0.63,
      "normalized_negative_aspects": [
        "texture"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 4.42,
      "negative_claims": [
        "One recent Tabelog-derived review reports that the鮎 dish had noticeable bones and odor, while praising the soups and finding the parfait attractive and appropriately portioned. This is a specific preparation complaint, but it is isolated in the available evidence."
      ]
    },
    {
      "place_id": "ChIJ-UTjfBqPGGARviFHm--zgXQ",
      "restaurant": "Tonkatsu Kofuku",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "ingredient_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 4.31,
      "negative_claims": [
        "The same Tabelog reviewer found the rice to have a slightly chemical-like taste and smell, despite considering the tonkatsu tasty. This is a specific food-quality complaint, but it is isolated and concerns a side item rather than the core tonkatsu."
      ]
    },
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
      "place_id": "ChIJ3dkcWRSNGGARDM1bsyvGOMY",
      "restaurant": "Shusai Ito",
      "negative_case_strength": 0.94,
      "normalized_negative_aspects": [
        "ingredient_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 5.0,
      "negative_claims": [
        "One anonymous/low-context comment said the rice was poor enough to prefer a nearby chain restaurant’s rice."
      ]
    },
    {
      "place_id": "ChIJ44bXRwDvGGARMehI9NKLAnI",
      "restaurant": "Chinese Cuisine Kasho",
      "negative_case_strength": 1.0,
      "normalized_negative_aspects": [
        "texture"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.6,
      "negative_claims": [
        "The July 2024 sweet-and-sour pork review specifically noted that the bamboo shoot component was hard, indicating a possible isolated texture flaw."
      ]
    },
    {
      "place_id": "ChIJ6d8N8dntGGARoNUj9Kt2QcI",
      "restaurant": "Yuima",
      "negative_case_strength": 1.52,
      "normalized_negative_aspects": [
        "grilling"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.35,
      "negative_claims": [
        "A local food writer considered the bite-sized grilled dumplings the only clear miss in an otherwise favorable meal, arguing that their very small size weakened the characteristic appeal of a dumpling."
      ]
    },
    {
      "place_id": "ChIJ8QsMuq6NGGARP6Q43Mqo8YI",
      "restaurant": "Nihonshu Pairing Kamosu",
      "negative_case_strength": 1.0,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.06,
      "negative_claims": [
        "One reviewer found the meal somewhat lacking in quantity. This is a food-experience criticism, but it concerns portion size rather than flavor, doneness, technique, or ingredient quality, and there is insufficient independent repetition to establish a recurring preparation problem."
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
      "place_id": "ChIJ9a_pbz7yGGARxkV5DAtmyFc",
      "restaurant": "Yakitori Kōchan",
      "negative_case_strength": 1.39,
      "normalized_negative_aspects": [
        "texture"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 0.34,
      "negative_claims": [
        "A 2022 Tabelog reviewer states that the yakitori was not tasty to them and specifically reports a strong unpleasant meat odor in the kashira skewer."
      ]
    },
    {
      "place_id": "ChIJ9f-5MEKPGGAR_EELaRv_7Ps",
      "restaurant": "Sho-chan Katsu",
      "negative_case_strength": 1.39,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.81,
      "negative_claims": [
        "A later Tabelog review notes that the coating had some burnt areas and sometimes detached from the meat; it nevertheless praises the thick-cut loin and describes the dish as generous."
      ]
    },
    {
      "place_id": "ChIJAZOKBEyPGGARWoSCCwgRm8E",
      "restaurant": "Atarayo Akihabara",
      "negative_case_strength": 1.92,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.05,
      "negative_claims": [
        "Two separate Hot Pepper diners specifically objected that the food did not feel like Kyoto cuisine, describing it instead as ordinary izakaya food. This suggests a repeated concern about the restaurant's claimed Kyoto-style identity, though it is not a broad condemnation of flavor or ingredient quality."
      ]
    },
    {
      "place_id": "ChIJAyB_qCCLGGARb9nHjmtksdg",
      "restaurant": "Ryogoku Zushi",
      "negative_case_strength": 2.58,
      "normalized_negative_aspects": [
        "seasoning",
        "texture"
      ],
      "negative_observation_count": 2,
      "independent_negative_provenance_count": 2,
      "corroborated": false,
      "guarded_quality_adjustment": 1.18,
      "negative_claims": [
        "A 2023 lunch review says the nigiri was not exceptionally delicious and adds that the reviewer was uncertain about what fish was served and how many pieces would arrive, indicating an under-specified and only moderately satisfying nigiri experience.",
        "A separate 2023 lunch review specifically says the nigiri’s fish and rice were both unsatisfactory (“ネタも米もうーん”), providing dish-level criticism of the two core sushi components."
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
      "place_id": "ChIJBeR5QADzGGARhBYBUO43bAo",
      "restaurant": "Kuikiri Ryori Yuen",
      "negative_case_strength": 1.92,
      "normalized_negative_aspects": [
        "broth_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 4.33,
      "negative_claims": [
        "One detailed Tabelog review criticized the dashi in a hamō soup as lacking appeal, said the eggplant and broth were unremarkable, and found the sweet eel flavor in a chawanmushi too dominant. This is specific negative evidence concerning broth depth and seasoning balance, but it is a single review rather than an established recurring problem."
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
      "place_id": "ChIJLYr_6CmNGGARCauGxtGuPYY",
      "restaurant": "Kojimachi O-Udon Kai",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "meat_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 4.72,
      "negative_claims": [
        "One diner reported that the beef in the wagyu udon contained considerable gristle and judged its quality to be mismatched with the price."
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
      "place_id": "ChIJN_6W5gRhGGARLcba_W3PbA0",
      "restaurant": "Masamiya",
      "negative_case_strength": 10.69,
      "normalized_negative_aspects": [
        "other_ingredient",
        "texture"
      ],
      "negative_observation_count": 2,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.25,
      "negative_claims": [
        "The same food blog observed that parts of the katsucurry cutlet had separated from the breading. This is a concrete preparation defect in one serving, though not enough by itself to establish a recurring problem.",
        "The katsucurry was described as a commercial-style, sweet curry with a somewhat powdery or dry texture that became tiring toward the end of the meal. This suggests the curry sauce may be a weak point for some dishes."
      ]
    },
    {
      "place_id": "ChIJNxisb0VhGGAREUIf0expJbA",
      "restaurant": "Wafū na Rāmen Umashi",
      "negative_case_strength": 10.84,
      "normalized_negative_aspects": [
        "broth_quality",
        "meat_quality"
      ],
      "negative_observation_count": 2,
      "independent_negative_provenance_count": 2,
      "corroborated": false,
      "guarded_quality_adjustment": 1.55,
      "negative_claims": [
        "The ramen noodles were described by one reviewer as having weak firmness and a plain texture, while the cabbage and sprouts were said to make the broth feel muddy or poorly integrated in the ago-dashi tempura ramen.",
        "A separate reviewer judged the chicken rice accompaniment to be unlike properly prepared chicken rice, considered it not tasty, and nearly left it unfinished; the reviewer only made it palatable by adding ramen broth."
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
      "place_id": "ChIJS0AbdiuJGGARvFcr_eLL3PU",
      "restaurant": "Sushi Dokoro Umi",
      "negative_case_strength": 1.01,
      "normalized_negative_aspects": [
        "broth_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.27,
      "negative_claims": [
        "A 2017 local Japanese food blog found the accompanying miso soup noticeably too lightly seasoned, even for a diner who generally prefers mild flavors."
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
      "place_id": "ChIJU-sWYVSNGGARaTdGt3MyzO0",
      "restaurant": "Nishiki Sushi",
      "negative_case_strength": 1.18,
      "normalized_negative_aspects": [
        "ingredient_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.75,
      "negative_claims": [
        "An older Tabelog diner review rated food 2.5/5 and stated that the lunch was very cheap but 'nothing more and nothing less,' suggesting limited perceived culinary distinction in that visit."
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
      "place_id": "ChIJUZsRKACRGGARYUULB70nU3U",
      "restaurant": "Taishū Yakiniku Kaguya",
      "negative_case_strength": 1.69,
      "normalized_negative_aspects": [
        "meat_quality",
        "produce_quality"
      ],
      "negative_observation_count": 2,
      "independent_negative_provenance_count": 2,
      "corroborated": false,
      "guarded_quality_adjustment": 0.7,
      "negative_claims": [
        "The same diner found the sauce's fruit-like aroma somewhat too pronounced and personally disliked it, despite intending to revisit.",
        "Another diner wrote that the meat's appearance and taste seemed disconnected, suggesting that the visual presentation created higher expectations than the eating quality delivered."
      ]
    },
    {
      "place_id": "ChIJW9NJYAaLGGARKyxK-kSPTjE",
      "restaurant": "Nara Dining",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "other_reputation"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.32,
      "negative_claims": [
        "One Tabelog reviewer called the restaurant’s lunch food ordinary and characterized the salad as the common shredded-cabbage type with commercial dressing."
      ]
    },
    {
      "place_id": "ChIJWVUlF-RhGGARsl6sNDCYHu4",
      "restaurant": "Ten JAPAN GREEK YOGURT Tokyo Omori Main Store",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 5.77,
      "negative_claims": [
        "One Tabelog reviewer judged the flavor merely average, described the regular portion as quite small, and felt the yogurt's quality was something that could be reproduced at home. This is a specific negative food-quality assessment, but it is isolated in the available material and is partly entangled with portion and value judgments."
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
      "place_id": "ChIJ_XLEA4aLGGARBwEzTIWSj2c",
      "restaurant": "Natural Wine and Craft Beer sun.",
      "negative_case_strength": 0.87,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 1.72,
      "negative_claims": [
        "One recent diner reported that the food was generally too salty and that the pasta was undercooked."
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
      "place_id": "ChIJe_jIHhvuGGARHqowSZJHIHY",
      "restaurant": "Sushi Tanaka",
      "negative_case_strength": 4.64,
      "normalized_negative_aspects": [
        "balance",
        "doneness",
        "seasoning"
      ],
      "negative_observation_count": 3,
      "independent_negative_provenance_count": 2,
      "corroborated": false,
      "guarded_quality_adjustment": 0.73,
      "negative_claims": [
        "The sushi-focused reviewer criticized the rice as overly vinegared, sweet, cool, and heavy, with poor integration with the fish; excessive wasabi was also said to dominate some pieces.",
        "The same specialist review identified multiple preparation problems: overcooked kurumaebi with diminished aroma and sweetness, rough texture in sumi-ika, odor emerging from grilled shako, overly salty salted anago, and insufficiently expressive kohada.",
        "A separate local food blogger found the rice overly sharp and sweet in an unbalanced way, reported that it did not dissolve cleanly, and judged that few of fifteen pieces were especially memorable; anago was said to retain some odor."
      ]
    },
    {
      "place_id": "ChIJj6VDCwDtGGARQMivgTEACDo",
      "restaurant": "Taiyaki Isuzu",
      "negative_case_strength": 1.1,
      "normalized_negative_aspects": [
        "other_execution"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 0.0,
      "negative_claims": [
        "The shop reportedly experienced sticking of batter to the uncoated cooking surface, causing tearing, scorching, unattractive results, and some food waste before the machine was refinished."
      ]
    },
    {
      "place_id": "ChIJm2KyXACLGGARwvlKkHRjIpc",
      "restaurant": "Yakiniku Ao",
      "negative_case_strength": 1.22,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.94,
      "negative_claims": [
        "A diner reviewing the all-you-can-eat format says the main beef appeared to prioritize quantity over quality compared with the pork and chicken, indicating that quality may vary by menu format or plan."
      ]
    },
    {
      "place_id": "ChIJp4KSNgCJGGARNrCUTczMkBg",
      "restaurant": "Lakujo",
      "negative_case_strength": 0.63,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.69,
      "negative_claims": [
        "One Google review reproduced by the aggregator specifically says the char siu was hard. This is food-specific negative evidence, but no corroborating independent reports of the same preparation problem were found."
      ]
    },
    {
      "place_id": "ChIJq0Y983OLGGARzWJnPWMOs2c",
      "restaurant": "Gentoushi Nakada",
      "negative_case_strength": 0.75,
      "normalized_negative_aspects": [
        "technique"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 4.27,
      "negative_claims": [
        "A restaurant critic's search-indexed commentary argues that the cooking was overly novelty-seeking and lacked mastery of basic Japanese-cuisine fundamentals, characterizing it as creative food whose unusualness could be mistaken for quality."
      ]
    },
    {
      "place_id": "ChIJsenTCN6JGGARPCAqux1hR40",
      "restaurant": "Nihonbashi SANO",
      "negative_case_strength": 0.87,
      "normalized_negative_aspects": [
        "seafood_quality"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 3.97,
      "negative_claims": [
        "One lunch reviewer judged the meal insufficiently satisfying because the fried shrimp and fish did not function as a clear main course, despite previously having enjoyed an earlier visit."
      ]
    },
    {
      "place_id": "ChIJtUQEMGaLGGARsZ3HOjBcPdI",
      "restaurant": "Shinka Nogizaka",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "texture"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 5.53,
      "negative_claims": [
        "One course review identified the finishing rice for the mapo dish as clumped and called it a failed preparation, while rating the other selected closing dish positively."
      ]
    },
    {
      "place_id": "ChIJuYZ1fK6NGGARUa4ABVsvsSI",
      "restaurant": "Korean Sundubu",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 2.37,
      "negative_claims": [
        "One March 2026 Tabelog reviewer enjoyed the gamjatang but noted that the rice was excessively soggy, causing a small deduction. This is a specific preparation fault but is currently isolated rather than evidence of a recurring problem."
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
      "place_id": "ChIJxVBbAoKLGGARUxJedeLj1L4",
      "restaurant": "Local Spicy SITARA Tsukiji",
      "negative_case_strength": 0.83,
      "normalized_negative_aspects": [
        "recurring_execution_issue"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 0.61,
      "negative_claims": [
        "A Yahoo Maps review stated that although rice and naan were refillable at lunch, the curry quantity felt insufficient, leading the reviewer not to take refills. This is a food-portion balance criticism rather than a taste criticism."
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
    },
    {
      "place_id": "ChIJzdoIlxLxGGARwAosnKZ2xDw",
      "restaurant": "Pahuna Asian Fusion",
      "negative_case_strength": 0.71,
      "normalized_negative_aspects": [
        "technique"
      ],
      "negative_observation_count": 1,
      "independent_negative_provenance_count": 1,
      "corroborated": false,
      "guarded_quality_adjustment": 4.23,
      "negative_claims": [
        "One 2025 Tabelog reviewer said the restaurant’s curry was not especially distinctive and was broadly similar to an ordinary Indian-curry restaurant, while still calling it normally tasty."
      ]
    }
  ],
  "mixed_high_positive_high_negative_cases": [],
  "sparse_no_evidence": {
    "count": 19,
    "exactly_neutral": 19,
    "false_negative_count": 0,
    "rows": [
      {
        "place_id": "ChIJ15vg2a6TGGARew0EyIzG6_8",
        "restaurant": "Karaoke Snack Utaiba Rumi",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJA1SHdMryGGARh1toWzMdssc",
        "restaurant": "Gluon",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJAZWDbj2SGGARYKJCNx1QYFs",
        "restaurant": "Ajidokoro Goshiki",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJAw0sQ8uNGGARnxvdZGgBUM0",
        "restaurant": "Nanamaru",
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
        "place_id": "ChIJNSyFcQCNGGAR-9sp6i6MokE",
        "restaurant": "Melody Thai & Asia Unplugged Restaurant",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJOXe861iNGGARA0sFG5GC2pI",
        "restaurant": "Yusan",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJOz66feyOGGAR_Sa_i4Q1FVk",
        "restaurant": "Counter Lounge Top",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJP2MDTwCJGGARSYH1ggDt3cc",
        "restaurant": "Cho nomi Botako",
        "adjustment": 0.0,
        "exactly_neutral": true
      },
      {
        "place_id": "ChIJ_0iOlLqJGGAR5FOWE1ur-yU",
        "restaurant": "Torishin",
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
        "place_id": "ChIJd8cG48-PGGARnTxvxDNI4Kk",
        "restaurant": "Halal Nikoniko cafe",
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
        "place_id": "ChIJqScYcG-TGGARbgGcih9oTwA",
        "restaurant": "Izakaya Temari",
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
      "place_id": "ChIJ80iGQEGNGGARRN2Sp1pxto0",
      "restaurant": "Toritsune",
      "base_quality": 77.81,
      "positive_case_strength": 61.2,
      "negative_case_strength": 0.0,
      "adjustment": 8.57,
      "researched_quality": 86.38,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation",
        "ingredient_product"
      ],
      "independent_sources": 7,
      "evidence_summary": [
        "Multiple food-focused reviews describe the yakitori as charcoal-grilled and specifically praise the preparation: one reviewer says the skewers were properly prepped, while another describes the cooking as good and the yakitori as high quality.",
        "A detailed review reports that Satsuma Shamo had pronounced springy texture and flavor, and that the liver was cooked to a suitably soft, melting consistency.",
        "A repeat visitor describes the yakitori seasoning as having an excellent balance, specifically praising the salt level on items including negima, pork shiso rolls, and liver.",
        "Several food-specific accounts praise the chicken soup or chicken-based finishing dishes. One calls the chicken soup excellent and says the chicken hot pot and rice porridge are especially strong; another praises the ginger-forward chicken porridge.",
        "A separate review describes the chicken bowl as having fragrant charcoal-grilled chicken and a sauce that pairs very well with the rice, and calls the accompanying soup tasty."
      ],
      "production_v3_score": 79.64,
      "shadow_v4_score": 83.49,
      "score_delta": 3.85
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
      "place_id": "ChIJU133QjKLGGAR1w7IC9n3RZ8",
      "restaurant": "Restaurant I.To",
      "base_quality": 78.59,
      "positive_case_strength": 59.16,
      "negative_case_strength": 0.0,
      "adjustment": 8.12,
      "researched_quality": 86.71,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation",
        "ingredient_product"
      ],
      "independent_sources": 5,
      "evidence_summary": [
        "A food-focused editorial profile reports that the restaurant combines French and Japanese techniques, with dishes such as layered potato galette, oyster shooter, bisque gratin, and duck prepared to emphasize clean fat and firm texture. The article also identifies both chefs' prior experience at established high-end restaurants, including Quintessence and CHIUnE.",
        "A specialist restaurant blog described the sampled dishes as having unexpectedly high quality, with particularly specific praise for the texture and flavor of hamo spring roll, the two-part texture of the signature stew-hamburger, and the umami of the parsley-oil sauce. The reviewer also stated that the menu showed considerable variety and that dishes changed frequently.",
        "A 2026 visit report specifically praised the pigeon roast for precise doneness, describing it as tender while retaining the bird's characteristic robust flavor. The same report described the thick-cut fish carpaccio as allowing the quality of the ingredients to come through and characterized the dishes generally as original and carefully executed.",
        "The 2026 review described the seasonal three-fish carpaccio as thick-cut and particularly effective at conveying the ingredients' quality. It also described the white-milt gratin as plentiful, plump, creamy, and lighter to eat than expected.",
        "The official/reservation description states that the two chefs bring distinct French and Japanese backgrounds and apply French cooking technique to Aichi duck, specifically emphasizing careful cooking, clean-tasting fat, and a lighter Japanese-style finish."
      ],
      "production_v3_score": 78.93,
      "shadow_v4_score": 82.58,
      "score_delta": 3.65
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
    },
    {
      "place_id": "ChIJZRqn1tSJGGARO57RUohoSCg",
      "restaurant": "Sushi-ya no Masakatsu",
      "base_quality": 87.49,
      "positive_case_strength": 63.01,
      "negative_case_strength": 0.0,
      "adjustment": 8.96,
      "researched_quality": 96.45,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation",
        "ingredient_product"
      ],
      "independent_sources": 5,
      "evidence_summary": [
        "A food-editorial profile describes the sushi as based on Edomae technique, with careful preparation intended to remove unwanted flavors and bring out the ingredients’ natural taste.",
        "The restaurant is reported to use both red-vinegar and rice-vinegar sushi rice, with the two styles selected to complement different ingredients.",
        "A Tabelog Magazine profile reports that the chef personally developed relationships with producers and market participants, sources seafood from around Japan, and obtains tuna from the well-known intermediary Yamayuki.",
        "Multiple qualitative diner reports praise the freshness or quality of the seafood and describe the restaurant as using seasonal ingredients and changing offerings according to the day’s best available products.",
        "Diner comments specifically praise the texture and preparation of dishes, including very soft chawanmushi, carefully controlled sushi-rice texture and mouthfeel, and well-executed appetizers as well as sushi."
      ],
      "production_v3_score": 81.03,
      "shadow_v4_score": 85.06,
      "score_delta": 4.03
    },
    {
      "place_id": "ChIJg8_S44yIGGARDO6OmvONDzY",
      "restaurant": "Sendaiya",
      "base_quality": 73.7,
      "positive_case_strength": 60.1,
      "negative_case_strength": 0.0,
      "adjustment": 8.33,
      "researched_quality": 82.03,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation",
        "ingredient_product"
      ],
      "independent_sources": 5,
      "evidence_summary": [
        "Multiple food-specific accounts praise the cooking of the motsuyaki: one describes the skewers as having an \"絶妙な焼き加減\" with a soft texture, while another reports that the grilled offal was well-cooked, with crisp exteriors and tender or melting interiors. These are specific observations about doneness and texture rather than generic praise.",
        "A repeat-visit review gives detailed praise across several preparations: crisp, aromatic grilling on shiro and teppō; carefully controlled doneness for liver and hearts; and a distinct soy-based or teriyaki-style finishing treatment for certain skewers. The reviewer reports these qualities over a 34th visit, providing unusually detailed evidence of execution.",
        "The restaurant’s red-miso motsu stew is repeatedly described in specific sensory terms: rich or deep red-miso flavor, a smooth and gentle richness, and meat or tofu that has absorbed the seasoning. Separate reviews identify the stew as a standout preparation rather than merely mentioning it as a menu item.",
        "A detailed review specifically praises the gatsu-sashi as exceptionally good when served with garlic and ginger, and treats it as a notable preparation alongside the cooked skewers. This supports a positive assessment of the offal’s handling and eating quality, though it does not establish sourcing or objective freshness standards.",
        "An independent Tokyo drinking-culture food article presents Sendaiya as a notable specialist in traditional shitamachi chūhai and motsuyaki, and records favorable sensory impressions of the food: the motsu is described as soft and melting, while the sauce is notably thick and sweeter than average. The article also identifies the no-ice colored chūhai as an in-house preparation, supporting the restaurant’s distinctive beverage specialization, though beverage distinctiveness is not by itself proof of culinary excellence."
      ],
      "production_v3_score": 77.93,
      "shadow_v4_score": 81.68,
      "score_delta": 3.75
    },
    {
      "place_id": "ChIJlxnWE0jzGGARf4AD0zzBcRE",
      "restaurant": "Matsushima",
      "base_quality": 77.59,
      "positive_case_strength": 58.84,
      "negative_case_strength": 0.0,
      "adjustment": 8.05,
      "researched_quality": 85.64,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation"
      ],
      "independent_sources": 5,
      "evidence_summary": [
        "Multiple food-focused accounts describe deliberate regional research and adaptation: the chef is reported to have studied minority cuisines, sourced ingredients, and repeatedly tested recipes; one repeat visitor characterizes the cooking as Matsushima-style interpretations with finely controlled spice use and umami extraction.",
        "Detailed dish-level reporting repeatedly praises the balance of herbs, spices, acidity, smoke, and umami. Examples include a Guangxi-style chicken described as fresh from herbs and lime, a Sichuan-style monkfish stew praised for restrained salinity with ginger-garlic depth, and a yogurt/chili/cumin combination that worked unusually well with rice.",
        "The same detailed visit reports technically successful textures: monkfish as plump and gelatinous, beef tongue as tender while retaining a pleasant fibrous bite, and water lotus vegetable as distinctly crisp.",
        "Food editorial coverage identifies Matsushima as unusually specialized in rare Chinese regional and minority cuisines, including Guangxi-style chicken, Yunnan-related dishes, minority-cuisine preparations, and regionally diverse Huangjiu/Shaoxing wines. The editorial framing emphasizes that the menu offers dishes difficult to find elsewhere.",
        "A food writer who reports repeated visits presents Matsushima as both unusual and highly enjoyable, highlighting smoked mackerel, black-vinegar sweet-and-sour pork, minority-cuisine dishes, and the compatibility of the food with distinctive Shaoxing wines. The article explicitly links the appeal to the combination of culinary novelty and flavor quality."
      ],
      "production_v3_score": 81.21,
      "shadow_v4_score": 84.83,
      "score_delta": 3.62
    },
    {
      "place_id": "ChIJtyDgsNOLGGARETyOjtfemPw",
      "restaurant": "Tullio",
      "base_quality": 65.66,
      "positive_case_strength": 65.53,
      "negative_case_strength": 0.0,
      "adjustment": 9.51,
      "researched_quality": 75.17,
      "families": [
        "consistency",
        "craft_execution",
        "food_reputation",
        "ingredient_product"
      ],
      "independent_sources": 5,
      "evidence_summary": [
        "The restaurant’s defining bistecca is prepared with a distinctive, deliberately thorough grilling method: the chef repeatedly turns a thick L-bone over a dedicated grill and cooks it fully rather than relying on carryover heat.",
        "The bistecca was described as having a deeply browned, aromatic exterior, attractive red-copper interior, layered beef flavor, and a texture that benefited from being cooked through rather than left rare.",
        "Editorial coverage identifies the steak as Hokkaido Shiraoi wagyu and reports that the chef searched for a suitable lean-beef producer before reopening, indicating deliberate sourcing aligned with the restaurant’s bistecca style.",
        "Multiple food-editorial sources characterize Tullio as an early or pioneering Tokyo specialist in bistecca, with the chef maintaining the style for decades.",
        "The same editorial visit praised the restaurant’s non-steak cooking, describing its traditional appetizers and pasta as simple, refined, and appropriate complements to the bistecca; a Gorgonzola risotto was specifically noted for rich cheese flavor."
      ],
      "production_v3_score": 83.4,
      "shadow_v4_score": 87.68,
      "score_delta": 4.28
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
      "ChIJ0XtXQpSNGGARSC8ZX7THxUA",
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
      "ChIJ--kHzR31GGARGv1b_Dizn2E",
      "ChIJ-4GIAHeNGGAR5YTLPAgL26c",
      "ChIJ-UTjfBqPGGARviFHm--zgXQ",
      "ChIJ-XSXyk6JGGARHAeiIYgz2Uw",
      "ChIJ-aGcEQD1GGARhMZa65MLMew",
      "ChIJ0_1_eIaNGGARcSyIJDVZtgk",
      "ChIJ0_g8b8aJGGARWYT0qZuh2Tc",
      "ChIJ0_nEe9_zGGARtvRq6MjpTEE",
      "ChIJ0dELEyLzGGAR7G9ZLThTX1o",
      "ChIJ11ztgHFgGGARWv22TZzPUQo",
      "ChIJ15vg2a6TGGARew0EyIzG6_8",
      "ChIJ20fqevbtGGAReAH6HoC0d9o",
      "ChIJ2QkcJc-MGGARtnXBOG-zeEM",
      "ChIJ2WzWhfWPGGARyYQS7SD2tIM",
      "ChIJ2YmxKgCNGGARHGki5-6G9A8",
      "ChIJ2bQw_tmLGGARprV9Gllket0",
      "ChIJ2ysS0QXtGGARnqFUbd51-aY",
      "ChIJ3U-KbgCNGGARFNCk9UTf6yI",
      "ChIJ3WpThsePGGAR1y2kSs3KIDY",
      "ChIJ3cFPK-aLGGARNaz58SuwM7M"
    ]
  }
}
```

## Biggest risers

| Restaurant | Base Q | Adj. | v3 | v4 | Delta |
|---|---:|---:|---:|---:|---:|
| Tullio | 65.66 | +9.51 | 83.40 | 87.68 | +4.28 |
| Sushi-ya no Masakatsu | 87.49 | +8.96 | 81.03 | 85.06 | +4.03 |
| Teishoku-ya Susico | 66.54 | +8.65 | 75.26 | 79.15 | +3.89 |
| Horumon-yaki Kuunomu | 60.00 | +8.60 | 76.89 | 80.76 | +3.87 |
| Toritsune | 77.81 | +8.57 | 79.64 | 83.49 | +3.85 |
| Sendaiya | 73.70 | +8.33 | 77.93 | 81.68 | +3.75 |
| Restaurant I.To | 78.59 | +8.12 | 78.93 | 82.58 | +3.65 |
| Buncho | 64.50 | +8.07 | 75.72 | 79.35 | +3.63 |
| Matsushima | 77.59 | +8.05 | 81.21 | 84.83 | +3.62 |
| Tempura Motoyoshi | 88.32 | +7.99 | 79.41 | 83.01 | +3.60 |
| Yama | 79.27 | +7.96 | 77.91 | 81.50 | +3.59 |
| La Blanche | 85.36 | +7.95 | 84.86 | 88.44 | +3.58 |
| Bistrot33 Santrois | 73.14 | +7.87 | 75.98 | 79.52 | +3.54 |
| Tarikino Kappou | 81.06 | +7.65 | 75.87 | 79.32 | +3.45 |
| Italian Oyo | 52.06 | +7.63 | 75.64 | 79.08 | +3.44 |
| Nihonbashi Kakigaracho Sugita | 78.05 | +7.59 | 76.26 | 79.68 | +3.42 |
| Shunsaiya Toriyu | 67.72 | +7.58 | 81.21 | 84.62 | +3.41 |
| Sumibi Yakitori Moriho | 66.67 | +7.53 | 75.99 | 79.38 | +3.39 |
| Ichiju Sansai | 66.73 | +7.49 | 79.45 | 82.82 | +3.37 |
| la Canca | 83.99 | +7.45 | 82.47 | 85.83 | +3.36 |

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

### Toritsune

- Quality: 77.81 -> 86.38 (+8.57)
- Case strength: +61.20 / -0.00
- Fiyu: 79.64 -> 83.49 (+3.85)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 7
- Evidence: Multiple food-focused reviews describe the yakitori as charcoal-grilled and specifically praise the preparation: one reviewer says the skewers were properly prepped, while another describes the cooking as good and the yakitori as high quality. | A detailed review reports that Satsuma Shamo had pronounced springy texture and flavor, and that the liver was cooked to a suitably soft, melting consistency. | A repeat visitor describes the yakitori seasoning as having an excellent balance, specifically praising the salt level on items including negima, pork shiso rolls, and liver. | Several food-specific accounts praise the chicken soup or chicken-based finishing dishes. One calls the chicken soup excellent and says the chicken hot pot and rice porridge are especially strong; another praises the ginger-forward chicken porridge. | A separate review describes the chicken bowl as having fragrant charcoal-grilled chicken and a sauce that pairs very well with the rice, and calls the accompanying soup tasty.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Horumon-yaki Kuunomu

- Quality: 60.00 -> 68.60 (+8.60)
- Case strength: +61.36 / -0.00
- Fiyu: 76.89 -> 80.76 (+3.87)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 6
- Evidence: A local food blogger describes thick-cut meats, a strongly seasoned揉みダレ, charcoal grilling over consistently low heat, and careful preparation that produces good焼きムラ control and a satisfying balance of char, sauce, and meat. | Multiple food-specific accounts praise the offal for freshness, lack of odor, and clean preparation, including horumon, liver, senmai, and hachinosu. | Recent diner reports describe the horumon as consistently fresh, with pronounced flavor and texture, and attribute the absence of odor to careful pre-treatment. | Food-focused reports repeatedly describe large or thick cuts that remain tender or pleasantly springy: thick-cut horumon is described as juicy and supple, harami as strongly textured without odor, and thick liver as retaining a soft, pudding-like interior after charcoal grilling. | The restaurant's red-miso-based or濃厚揉みダレ is repeatedly identified as a defining strength: diners describe the seasoning as rich, savory, slightly sweet, and especially effective with rice, while still noting a lighter chicken-sasami option.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Restaurant I.To

- Quality: 78.59 -> 86.71 (+8.12)
- Case strength: +59.16 / -0.00
- Fiyu: 78.93 -> 82.58 (+3.65)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 5
- Evidence: A food-focused editorial profile reports that the restaurant combines French and Japanese techniques, with dishes such as layered potato galette, oyster shooter, bisque gratin, and duck prepared to emphasize clean fat and firm texture. The article also identifies both chefs' prior experience at established high-end restaurants, including Quintessence and CHIUnE. | A specialist restaurant blog described the sampled dishes as having unexpectedly high quality, with particularly specific praise for the texture and flavor of hamo spring roll, the two-part texture of the signature stew-hamburger, and the umami of the parsley-oil sauce. The reviewer also stated that the menu showed considerable variety and that dishes changed frequently. | A 2026 visit report specifically praised the pigeon roast for precise doneness, describing it as tender while retaining the bird's characteristic robust flavor. The same report described the thick-cut fish carpaccio as allowing the quality of the ingredients to come through and characterized the dishes generally as original and carefully executed. | The 2026 review described the seasonal three-fish carpaccio as thick-cut and particularly effective at conveying the ingredients' quality. It also described the white-milt gratin as plentiful, plump, creamy, and lighter to eat than expected. | The official/reservation description states that the two chefs bring distinct French and Japanese backgrounds and apply French cooking technique to Aichi duck, specifically emphasizing careful cooking, clean-tasting fat, and a lighter Japanese-style finish.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Teishoku-ya Susico

- Quality: 66.54 -> 75.19 (+8.65)
- Case strength: +61.58 / -0.00
- Fiyu: 75.26 -> 79.15 (+3.89)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 4
- Evidence: A detailed food review reports that the pork, vegetables, and garlic in the national-pork garlic stamina set each retained a distinct, well-judged texture, attributing this to precise heat control. It specifically describes a balance of tenderness and chew in the meat and crispness in the vegetables and garlic. | The same review describes the simmered redfish as retaining its shape while absorbing the seasoning, with clean flavor and no fishy or muddy notes; it presents this as evidence of careful preparation and controlled simmering. | The reviewer describes the tuna in the tuna-kimchi bowl as properly trimmed, firm, free of watery texture or odor, and composed of both lean and moderately fatty portions. | A local food-news report states that the restaurant sources fish from Toyosu Market and that the salmon collar is supplied in varying quantities depending on market availability. It also reports in-house salting and resting of the salmon collar and that the restaurant tries to use domestic ingredients. | The same report describes an unusually thick salmon collar with dense meat and substantial fat, while noting that rice grains were distinct and appeared carefully cooked. It also describes the vegetable-rich miso soup and side dishes as competently prepared, with crisp, well-seasoned, or gently sweet qualities.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Sushi-ya no Masakatsu

- Quality: 87.49 -> 96.45 (+8.96)
- Case strength: +63.01 / -0.00
- Fiyu: 81.03 -> 85.06 (+4.03)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 5
- Evidence: A food-editorial profile describes the sushi as based on Edomae technique, with careful preparation intended to remove unwanted flavors and bring out the ingredients’ natural taste. | The restaurant is reported to use both red-vinegar and rice-vinegar sushi rice, with the two styles selected to complement different ingredients. | A Tabelog Magazine profile reports that the chef personally developed relationships with producers and market participants, sources seafood from around Japan, and obtains tuna from the well-known intermediary Yamayuki. | Multiple qualitative diner reports praise the freshness or quality of the seafood and describe the restaurant as using seasonal ingredients and changing offerings according to the day’s best available products. | Diner comments specifically praise the texture and preparation of dishes, including very soft chawanmushi, carefully controlled sushi-rice texture and mouthfeel, and well-executed appetizers as well as sushi.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Sendaiya

- Quality: 73.70 -> 82.03 (+8.33)
- Case strength: +60.10 / -0.00
- Fiyu: 77.93 -> 81.68 (+3.75)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 5
- Evidence: Multiple food-specific accounts praise the cooking of the motsuyaki: one describes the skewers as having an "絶妙な焼き加減" with a soft texture, while another reports that the grilled offal was well-cooked, with crisp exteriors and tender or melting interiors. These are specific observations about doneness and texture rather than generic praise. | A repeat-visit review gives detailed praise across several preparations: crisp, aromatic grilling on shiro and teppō; carefully controlled doneness for liver and hearts; and a distinct soy-based or teriyaki-style finishing treatment for certain skewers. The reviewer reports these qualities over a 34th visit, providing unusually detailed evidence of execution. | The restaurant’s red-miso motsu stew is repeatedly described in specific sensory terms: rich or deep red-miso flavor, a smooth and gentle richness, and meat or tofu that has absorbed the seasoning. Separate reviews identify the stew as a standout preparation rather than merely mentioning it as a menu item. | A detailed review specifically praises the gatsu-sashi as exceptionally good when served with garlic and ginger, and treats it as a notable preparation alongside the cooked skewers. This supports a positive assessment of the offal’s handling and eating quality, though it does not establish sourcing or objective freshness standards. | An independent Tokyo drinking-culture food article presents Sendaiya as a notable specialist in traditional shitamachi chūhai and motsuyaki, and records favorable sensory impressions of the food: the motsu is described as soft and melting, while the sauce is notably thick and sweeter than average. The article also identifies the no-ice colored chūhai as an in-house preparation, supporting the restaurant’s distinctive beverage specialization, though beverage distinctiveness is not by itself proof of culinary excellence.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Matsushima

- Quality: 77.59 -> 85.64 (+8.05)
- Case strength: +58.84 / -0.00
- Fiyu: 81.21 -> 84.83 (+3.62)
- Families: consistency, craft_execution, food_reputation
- Independent sources: 5
- Evidence: Multiple food-focused accounts describe deliberate regional research and adaptation: the chef is reported to have studied minority cuisines, sourced ingredients, and repeatedly tested recipes; one repeat visitor characterizes the cooking as Matsushima-style interpretations with finely controlled spice use and umami extraction. | Detailed dish-level reporting repeatedly praises the balance of herbs, spices, acidity, smoke, and umami. Examples include a Guangxi-style chicken described as fresh from herbs and lime, a Sichuan-style monkfish stew praised for restrained salinity with ginger-garlic depth, and a yogurt/chili/cumin combination that worked unusually well with rice. | The same detailed visit reports technically successful textures: monkfish as plump and gelatinous, beef tongue as tender while retaining a pleasant fibrous bite, and water lotus vegetable as distinctly crisp. | Food editorial coverage identifies Matsushima as unusually specialized in rare Chinese regional and minority cuisines, including Guangxi-style chicken, Yunnan-related dishes, minority-cuisine preparations, and regionally diverse Huangjiu/Shaoxing wines. The editorial framing emphasizes that the menu offers dishes difficult to find elsewhere. | A food writer who reports repeated visits presents Matsushima as both unusual and highly enjoyable, highlighting smoked mackerel, black-vinegar sweet-and-sour pork, minority-cuisine dishes, and the compatibility of the food with distinctive Shaoxing wines. The article explicitly links the appeal to the combination of culinary novelty and flavor quality.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

### Tullio

- Quality: 65.66 -> 75.17 (+9.51)
- Case strength: +65.53 / -0.00
- Fiyu: 83.40 -> 87.68 (+4.28)
- Families: consistency, craft_execution, food_reputation, ingredient_product
- Independent sources: 5
- Evidence: The restaurant’s defining bistecca is prepared with a distinctive, deliberately thorough grilling method: the chef repeatedly turns a thick L-bone over a dedicated grill and cooks it fully rather than relying on carryover heat. | The bistecca was described as having a deeply browned, aromatic exterior, attractive red-copper interior, layered beef flavor, and a texture that benefited from being cooked through rather than left rare. | Editorial coverage identifies the steak as Hokkaido Shiraoi wagyu and reports that the chef searched for a suitable lean-beef producer before reopening, indicating deliberate sourcing aligned with the restaurant’s bistecca style. | Multiple food-editorial sources characterize Tullio as an early or pioneering Tokyo specialist in bistecca, with the chef maintaining the style for decades. | The same editorial visit praised the restaurant’s non-steak cooking, describing its traditional appetizers and pasta as simple, refined, and appropriate complements to the bistecca; a Gorgonzola risotto was specifically noted for rich cheese flavor.
- Audit judgment: movement is multi-source and food-specific; no guardrail intervention.

## Negative-evidence rows

- **French Cuisine H (Furansu Ryori Asshu)**: strength 0.63; aspects texture; independent sources 1; corroborated False; net adjustment +4.42.
- **Tonkatsu Kofuku**: strength 0.71; aspects ingredient_quality; independent sources 1; corroborated False; net adjustment +4.31.
- **Ramen Kaikouya**: strength 1.69; aspects balance; independent sources 1; corroborated False; net adjustment +3.83.
- **Shusai Ito**: strength 0.94; aspects ingredient_quality; independent sources 1; corroborated False; net adjustment +5.00.
- **Chinese Cuisine Kasho**: strength 1.00; aspects texture; independent sources 1; corroborated False; net adjustment +2.60.
- **Yuima**: strength 1.52; aspects grilling; independent sources 1; corroborated False; net adjustment +3.35.
- **Nihonshu Pairing Kamosu**: strength 1.00; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +3.06.
- **Manali**: strength 1.00; aspects frying; independent sources 1; corroborated False; net adjustment +2.82.
- **Yakitori Kōchan**: strength 1.39; aspects texture; independent sources 1; corroborated False; net adjustment +0.34.
- **Sho-chan Katsu**: strength 1.39; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +3.81.
- **Atarayo Akihabara**: strength 1.92; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +3.05.
- **Ryogoku Zushi**: strength 2.58; aspects seasoning, texture; independent sources 2; corroborated False; net adjustment +1.18.
- **Sushi Aki Takase**: strength 1.79; aspects seafood_quality; independent sources 1; corroborated False; net adjustment +2.77.
- **Yakitori Taru wo Shiru**: strength 0.71; aspects ingredient_quality; independent sources 1; corroborated False; net adjustment +3.51.
- **Kuikiri Ryori Yuen**: strength 1.92; aspects broth_quality; independent sources 1; corroborated False; net adjustment +4.33.
- **Shodai Choberiba**: strength 1.00; aspects seasoning; independent sources 1; corroborated False; net adjustment +2.03.
- **Wakasugi**: strength 1.96; aspects broth_quality; independent sources 1; corroborated False; net adjustment +2.80.
- **Kojimachi O-Udon Kai**: strength 0.71; aspects meat_quality; independent sources 1; corroborated False; net adjustment +4.72.
- **Yakiniku Sho Kanda-nishiguchi**: strength 1.39; aspects meat_quality; independent sources 1; corroborated False; net adjustment +2.85.
- **Tokino Oto Seisakusho**: strength 1.00; aspects broth_quality; independent sources 1; corroborated False; net adjustment +6.38.
- **Izakaya Hiro**: strength 1.39; aspects broth_quality; independent sources 1; corroborated False; net adjustment +1.34.
- **Masamiya**: strength 10.69; aspects other_ingredient, texture; independent sources 1; corroborated False; net adjustment +3.25.
- **Wafū na Rāmen Umashi**: strength 10.84; aspects broth_quality, meat_quality; independent sources 2; corroborated False; net adjustment +1.55.
- **Ichikaku**: strength 2.64; aspects broth_quality, texture; independent sources 1; corroborated False; net adjustment +3.26.
- **Sushi Dokoro Umi**: strength 1.01; aspects broth_quality; independent sources 1; corroborated False; net adjustment +3.27.
- **Yurakucho Kakida**: strength 10.41; aspects recurring_freshness_issue, seasoning; independent sources 2; corroborated False; net adjustment +2.20.
- **Nishiki Sushi**: strength 1.18; aspects ingredient_quality; independent sources 1; corroborated False; net adjustment +2.75.
- **Makkuse Dining & Bar**: strength 0.71; aspects broth_quality; independent sources 1; corroborated False; net adjustment +1.94.
- **Taishū Yakiniku Kaguya**: strength 1.69; aspects meat_quality, produce_quality; independent sources 2; corroborated False; net adjustment +0.70.
- **Nara Dining**: strength 0.71; aspects other_reputation; independent sources 1; corroborated False; net adjustment +2.32.
- **Ten JAPAN GREEK YOGURT Tokyo Omori Main Store**: strength 0.71; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +5.77.
- **Shokudokoro Takamura**: strength 1.39; aspects texture; independent sources 1; corroborated False; net adjustment +2.16.
- **Washokudokoro Susumu**: strength 0.87; aspects broth_quality; independent sources 1; corroborated False; net adjustment +2.40.
- **Natural Wine and Craft Beer sun.**: strength 0.87; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +1.72.
- **Asakusa Kōchan**: strength 1.29; aspects other_ingredient; independent sources 1; corroborated False; net adjustment +0.00.
- **Asian Kitchen Curry Kodo: Spice Aroma**: strength 0.71; aspects seasoning; independent sources 1; corroborated False; net adjustment +1.17.
- **Waikiki Suidobashi**: strength 0.71; aspects other_ingredient; independent sources 1; corroborated False; net adjustment +0.00.
- **Sushi Tanaka**: strength 4.64; aspects balance, doneness, seasoning; independent sources 2; corroborated False; net adjustment +0.73.
- **Taiyaki Isuzu**: strength 1.10; aspects other_execution; independent sources 1; corroborated False; net adjustment +0.00.
- **Yakiniku Ao**: strength 1.22; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +3.94.
- **Lakujo**: strength 0.63; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +3.69.
- **Gentoushi Nakada**: strength 0.75; aspects technique; independent sources 1; corroborated False; net adjustment +4.27.
- **Nihonbashi SANO**: strength 0.87; aspects seafood_quality; independent sources 1; corroborated False; net adjustment +3.97.
- **Shinka Nogizaka**: strength 0.71; aspects texture; independent sources 1; corroborated False; net adjustment +5.53.
- **Korean Sundubu**: strength 0.71; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +2.37.
- **Indian Nepali Restaurant & Bar (Sakura)**: strength 0.68; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +1.67.
- **Local Spicy SITARA Tsukiji**: strength 0.83; aspects recurring_execution_issue; independent sources 1; corroborated False; net adjustment +0.61.
- **Cho-i Nomi-dokoro Yorimichi**: strength 1.22; aspects texture; independent sources 1; corroborated False; net adjustment +1.07.
- **Tramont: People, Wine, and the Table**: strength 0.71; aspects seasoning; independent sources 1; corroborated False; net adjustment +3.15.
- **Pahuna Asian Fusion**: strength 0.71; aspects technique; independent sources 1; corroborated False; net adjustment +4.23.

## Sparse/no-evidence safety

19/19 no-evidence rows were exactly neutral; false-negative count: 0.
